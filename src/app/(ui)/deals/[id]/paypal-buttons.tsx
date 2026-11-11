"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typing for the PayPal JS SDK we use (buttons with intent=authorize).
type PayPalButtons = {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
};
type PayPalNamespace = {
  Buttons: (opts: {
    style?: Record<string, unknown>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }) => PayPalButtons;
};
declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

function loadSdk(clientId: string, currency: string): Promise<PayPalNamespace> {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&intent=authorize&currency=${currency}&components=buttons&disable-funding=paylater,credit`;
  const existing = document.querySelector<HTMLScriptElement>(`script[data-pledge-paypal]`);
  if (existing && existing.src !== src) {
    existing.remove();
    delete window.paypal;
  }
  if (window.paypal) return Promise.resolve(window.paypal);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.dataset.pledgePaypal = "1";
    s.onload = () =>
      window.paypal ? resolve(window.paypal) : reject(new Error("PayPal didn't load"));
    s.onerror = () => reject(new Error("Couldn't load PayPal. Check your connection."));
    document.head.appendChild(s);
  });
}

/**
 * PayPal buttons for a hold (authorize, not capture). The order is created by our server, and the
 * hold only counts after our server confirms it with PayPal (onApprove → confirmHold).
 */
export function PayPalHoldButtons(props: {
  clientId: string;
  currency: string;
  createOrder: () => Promise<string>;
  onApprove: (orderId: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props; // latest callbacks without re-rendering the PayPal buttons
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let buttons: PayPalButtons | undefined;
    let cancelled = false;
    loadSdk(props.clientId, props.currency)
      .then((paypal) => {
        if (cancelled || !box.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "paypal" },
          createOrder: () => handlers.current.createOrder(),
          onApprove: (data) => handlers.current.onApprove(data.orderID),
          onCancel: () => handlers.current.onCancel(),
          onError: (err) =>
            handlers.current.onError(
              err instanceof Error ? err.message : "PayPal reported an error.",
            ),
        });
        return buttons.render(box.current);
      })
      .catch((e: unknown) => handlers.current.onError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      void buttons?.close?.();
    };
  }, [props.clientId, props.currency]);

  return (
    <div>
      {loading && <p className="text-sm">Loading PayPal…</p>}
      <div ref={box} />
    </div>
  );
}
