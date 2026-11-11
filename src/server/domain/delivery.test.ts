import { describe, expect, it } from "vitest";
import { addonAmountFromWeight, checkVerdict, normalizeCheck } from "./delivery";
import { safeFileName } from "./files";

describe("normalizeCheck", () => {
  const todos = ["Final logo in SVG", "Dark-background version", "Favicon 512x512"];

  it("gives every to-do exactly one verdict, in plan order", () => {
    const out = normalizeCheck(todos, {
      summary: "s",
      items: [
        { todo: "favicon 512x512", status: "met", reason: "favicon.png" },
        { todo: "Final logo in SVG", status: "met", reason: "logo.svg" },
        { todo: "Final logo in SVG", status: "missing", reason: "duplicate ignored" },
        { todo: "Something the AI invented", status: "met", reason: "dropped" },
      ],
    });
    expect(out.items).toEqual([
      { todo: "Final logo in SVG", status: "met", reason: "logo.svg" },
      {
        todo: "Dark-background version",
        status: "unclear",
        reason: "The check didn't cover this item.",
      },
      { todo: "Favicon 512x512", status: "met", reason: "favicon.png" },
    ]);
    expect(checkVerdict(out)).toBe("unclear");
  });

  it("reports missing over unclear over met", () => {
    const item = (status: "met" | "missing" | "unclear") => ({ todo: "x", status, reason: "r" });
    expect(
      checkVerdict({ summary: "", items: [item("met"), item("unclear"), item("missing")] }),
    ).toBe("missing");
    expect(checkVerdict({ summary: "", items: [item("met")] })).toBe("met");
  });
});

describe("addonAmountFromWeight", () => {
  it("prices add-ons from code, rounded to whole units, at least 5", () => {
    expect(addonAmountFromWeight(40000n, "GBP", 15)).toBe(6000n); // £60
    expect(addonAmountFromWeight(40000n, "GBP", 1)).toBe(500n); // floor at £5
    expect(addonAmountFromWeight(33333n, "USD", 10)).toBe(3300n); // $33.33 → $33
    expect(addonAmountFromWeight(9000n, "JPY", 50)).toBe(4500n);
    expect(addonAmountFromWeight(40000n, "GBP", 250)).toBe(40000n); // weight capped at 100
  });
});

describe("safeFileName", () => {
  it("keeps names readable and safe for storage paths", () => {
    expect(safeFileName("Logo (dark) final!!.svg", "svg")).toBe("Logo-dark-final.svg");
    expect(safeFileName("../../etc/passwd", "png")).toBe("passwd.png");
    expect(safeFileName(String.raw`C:\Users\x\.env`, "png")).toBe("file.png");
    expect(safeFileName("....", "pdf")).toBe("file.pdf");
  });
});
