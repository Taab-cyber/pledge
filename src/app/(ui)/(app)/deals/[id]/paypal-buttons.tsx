"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typing for the PayPal JS SDK we use (buttons with intent=authorize).
type PayPalButtons = {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
  isEligible?: () => boolean;
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

/**
 * Loads the PayPal JS SDK exactly once per page (per client id + currency). Loading a second copy while
 * buttons are open makes PayPal destroy them ("zoid destroyed all components"), which kills the
 * checkout window mid-payment, so every caller shares one promise.
 */
let sdk: { src: string; promise: Promise<PayPalNamespace> } | null = null;

function loadSdk(clientId: string, currency: string): Promise<PayPalNamespace> {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&intent=authorize&currency=${currency}&components=buttons&disable-funding=paylater,credit`;
  if (sdk?.src === src) return sdk.promise;
  if (sdk) {
    // Different currency: replace the SDK (only happens when moving between deals in different currencies).
    document.querySelector("script[data-pledge-paypal]")?.remove();
    delete window.paypal;
  }
  const promise = new Promise<PayPalNamespace>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.dataset.pledgePaypal = "1";
    s.onload = () =>
      window.paypal ? resolve(window.paypal) : reject(new Error("PayPal didn't load"));
    s.onerror = () => {
      sdk = null; // allow a retry on the next render
      reject(new Error("Couldn't load PayPal. Check your connection."));
    };
    document.head.appendChild(s);
  });
  sdk = { src, promise };
  return promise;
}

const isTeardown = (err: unknown) =>
  /zoid destroyed|component closed|window closed/i.test(
    err instanceof Error ? err.message : String(err),
  );

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
        const el = box.current;
        if (cancelled || !el) return;
        el.innerHTML = ""; // a previous (unmounted) render may have left an iframe behind
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "paypal" },
          createOrder: () => handlers.current.createOrder(),
          onApprove: (data) => handlers.current.onApprove(data.orderID),
          onCancel: () => handlers.current.onCancel(),
          onError: (err) => {
            console.error("[PayPal]", err);
            if (!isTeardown(err)) {
              handlers.current.onError(
                err instanceof Error ? err.message : "PayPal reported an error.",
              );
            }
          },
        });
        return buttons.render(el);
      })
      .catch((e: unknown) => {
        if (cancelled || isTeardown(e)) return; // closing on unmount isn't an error for the user
        handlers.current.onError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      buttons?.close?.().catch(() => undefined);
    };
  }, [props.clientId, props.currency]);

  return (
    <div>
      {loading && <p className="text-sm">Loading PayPal…</p>}
      <div ref={box} />
    </div>
  );
}
