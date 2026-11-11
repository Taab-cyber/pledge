import { describe, expect, it } from "vitest";
import { sniffFileType } from "../domain/files";
import { rateLimit, resetRateLimits } from "../http/rate-limit";
import type { DealRow, MilestoneRow } from "../repos/deals";
import { moneyDto, priceMismatch, toDealDto } from "./deal-view";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const deal: DealRow = {
  id: id(1),
  freelancer_id: id(2),
  client_id: null,
  client_name: "Daniel",
  client_whatsapp: "+447700900123",
  client_country: "GB",
  title: "Brand kit",
  currency: "GBP",
  total_minor: 40000,
  status: "draft",
  current_version: 0,
  auto_release_hours: 72,
  source_text: null,
  source_files: [],
  plan_meta: {
    summary: "s",
    gaps: [],
    confidence: 0.9,
    priceInChat: { amount: "350", currency: "GBP" },
  },
  created_at: "2026-11-11T00:00:00Z",
};

const ms = (n: number, amount: number, todos = ["x"]): MilestoneRow => ({
  id: id(100 + n),
  kind: "milestone",
  position: n,
  title: `M${n}`,
  amount_minor: amount,
  due_in_days: 7,
  revisions_included: 1,
  revisions_used: 0,
  status: "draft",
  todos: todos.map((label, i) => ({ id: id(200 + n * 10 + i), position: i, label, done: false })),
});

describe("toDealDto", () => {
  it("allows sharing only when amounts add up exactly", () => {
    const good = toDealDto(deal, [ms(0, 15000), ms(1, 25000)], [], deal.freelancer_id);
    expect(good.canShare).toBe(true);
    expect(good.sum.formatted).toBe("£400.00");
    expect(good.difference.minor).toBe(0);

    const off = toDealDto(deal, [ms(0, 15000), ms(1, 24000)], [], deal.freelancer_id);
    expect(off.canShare).toBe(false);
    expect(off.difference).toMatchObject({ minor: 1000, formatted: "£10.00" });
    expect(off.issues).toContainEqual({ code: "SUM_MISMATCH", differenceMinor: 1000 });
  });

  it("blocks sharing before a plan exists", () => {
    const dto = toDealDto(deal, [], [], deal.freelancer_id);
    expect(dto.canShare).toBe(false);
    expect(dto.issues).toEqual([{ code: "NO_PLAN_YET" }]);
  });

  it("hides the client's phone number from the client and flags a chat price mismatch", () => {
    const asClient = toDealDto({ ...deal, client_id: id(3) }, [ms(0, 40000)], [], id(3));
    expect(asClient.viewerRole).toBe("client");
    expect(asClient.clientWhatsapp).toBeNull();
    expect(asClient.planMeta?.priceMismatch).toBe(true);
  });
});

describe("priceMismatch", () => {
  it("compares the chat price with the entered total", () => {
    expect(priceMismatch({ amount: "400", currency: "USD" }, 40000, "USD")).toBe(false);
    expect(priceMismatch({ amount: "400.00", currency: null }, 40000, "USD")).toBe(false);
    expect(priceMismatch({ amount: "350", currency: "USD" }, 40000, "USD")).toBe(true);
    expect(priceMismatch({ amount: "400", currency: "EUR" }, 40000, "USD")).toBe(true);
    expect(priceMismatch({ amount: null, currency: null }, 40000, "USD")).toBe(false);
  });
});

describe("moneyDto", () => {
  it("formats per currency", () => {
    expect(moneyDto(500, "JPY")).toEqual({ minor: 500, currency: "JPY", formatted: "¥500" });
  });
});

describe("sniffFileType", () => {
  it("detects real types and rejects disguised files", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
    expect(sniffFileType(png)?.mime).toBe("image/png");
    expect(sniffFileType(jpg)?.mime).toBe("image/jpeg");
    expect(sniffFileType(webp)?.mime).toBe("image/webp");
    expect(sniffFileType(Buffer.from("MZ executable named photo.png"))).toBeNull();
    // SVGs are accepted as deliverables: originals are only served as downloads (attachment) and
    // previews are rasterised to JPEG, so script inside an SVG never runs in the app.
    expect(
      sniffFileType(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))
        ?.mime,
    ).toBe("image/svg+xml");
    expect(sniffFileType(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffFileType(Buffer.from("<!-- svg --><div>not svg</div>"))).toBeNull();
    expect(sniffFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))?.mime).toBe(
      "application/zip",
    );
  });
});

describe("rateLimit", () => {
  it("allows up to the limit per window", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 1000, 0);
    expect(() => rateLimit("k", 3, 1000, 10)).toThrow(/Too many/);
    expect(() => rateLimit("k", 3, 1000, 1000)).not.toThrow(); // new window
  });
});

describe("watermarked previews", () => {
  it("are smaller JPEGs and differ from the original image", async () => {
    const sharpMod = (await import("sharp")).default;
    const { makePreview, makeThumbnail } = await import("./images");
    const original = await sharpMod({
      create: { width: 2400, height: 1600, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const preview = await makePreview(original, "image/png");
    const meta = await sharpMod(preview).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1200);
    // A plain white image gets visibly darker pixels from the watermark.
    const stats = await sharpMod(preview).stats();
    expect(stats.channels[0]!.min).toBeLessThan(230);
    const thumb = await sharpMod(await makeThumbnail(original, "image/png")).metadata();
    expect(thumb.width).toBe(512);
  });
});
