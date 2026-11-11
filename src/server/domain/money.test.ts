import { describe, expect, it } from "vitest";
import { suggestDealCurrency } from "./countries";
import { exponentOf, isSupportedCurrency } from "./currencies";
import { add, compare, equals, format, fromMajor, money, sub, sum, toMajorString } from "./money";

describe("currency registry", () => {
  it("knows the demo currencies and their exponents", () => {
    expect(["USD", "EUR", "GBP", "CAD", "AUD", "SGD", "JPY"].every(isSupportedCurrency)).toBe(true);
    expect(exponentOf("USD")).toBe(2);
    expect(exponentOf("JPY")).toBe(0);
    expect(isSupportedCurrency("INR")).toBe(false);
    expect(() => exponentOf("XYZ")).toThrow(/Unsupported/);
  });
});

describe("fromMajor", () => {
  it("parses strings and numbers exactly", () => {
    expect(fromMajor("400", "USD").minor).toBe(40000n);
    expect(fromMajor("400.5", "USD").minor).toBe(40050n);
    expect(fromMajor("0.10", "USD").minor).toBe(10n);
    expect(fromMajor(19.99, "GBP").minor).toBe(1999n);
    expect(fromMajor("500", "JPY").minor).toBe(500n);
    expect(fromMajor("500.00", "JPY").minor).toBe(500n); // trailing zeros are fine
  });

  it("rejects decimals the currency can't hold", () => {
    expect(() => fromMajor("1.234", "USD")).toThrow(/at most 2 decimals/);
    expect(() => fromMajor("500.5", "JPY")).toThrow(/can't have decimals/);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", "1,000", "1e3", "$5", "1.2.3"]) {
      expect(() => fromMajor(bad, "USD")).toThrow();
    }
    expect(() => fromMajor(Number.NaN, "USD")).toThrow();
    expect(() => fromMajor(1e21, "USD")).toThrow();
  });
});

describe("toMajorString / format", () => {
  it("prints exact decimal strings", () => {
    expect(toMajorString(money(40050n, "USD"))).toBe("400.50");
    expect(toMajorString(money(5n, "USD"))).toBe("0.05");
    expect(toMajorString(money(-5n, "USD"))).toBe("-0.05");
    expect(toMajorString(money(500n, "JPY"))).toBe("500");
  });

  it("formats with the currency's own decimals", () => {
    expect(format(money(40050n, "USD"))).toBe("$400.50");
    expect(format(money(1200n, "GBP"), "en-GB")).toBe("£12.00");
    expect(format(money(500n, "JPY"), "en-US")).toBe("¥500");
  });

  it("stays exact beyond float precision", () => {
    expect(toMajorString(money(9007199254740993n, "USD"))).toBe("90071992547409.93");
  });
});

describe("arithmetic", () => {
  it("adds, subtracts, sums and compares in one currency", () => {
    const a = money(150n, "USD");
    const b = money(50n, "USD");
    expect(add(a, b).minor).toBe(200n);
    expect(sub(a, b).minor).toBe(100n);
    expect(sum([a, b, b], "USD").minor).toBe(250n);
    expect(compare(a, b)).toBe(1);
    expect(equals(a, money(150, "USD"))).toBe(true);
  });

  it("refuses to mix currencies", () => {
    expect(() => add(money(1n, "USD"), money(1n, "EUR"))).toThrow(/mismatch/);
  });

  it("rejects unsafe number minor units", () => {
    expect(() => money(1.5, "USD")).toThrow();
  });
});

describe("suggestDealCurrency", () => {
  it("uses the country's currency when supported", () => {
    expect(suggestDealCurrency("GB")).toEqual({ currency: "GBP" });
    expect(suggestDealCurrency("de")).toEqual({ currency: "EUR" });
    expect(suggestDealCurrency("JP")).toEqual({ currency: "JPY" });
  });

  it("falls back to USD and explains why", () => {
    const india = suggestDealCurrency("IN");
    expect(india.currency).toBe("USD");
    expect(india.reason).toMatch(/INR.*inside India/);
    expect(suggestDealCurrency("CH").reason).toMatch(/CHF isn't supported/);
    expect(suggestDealCurrency("ZZ")).toMatchObject({
      currency: "USD",
      reason: expect.any(String),
    });
  });
});

describe("provider amounts and estimates", () => {
  it("parses PayPal amounts in any currency exactly", async () => {
    const { providerAmountToMinor, formatAnyCurrency } = await import("./money");
    expect(providerAmountToMinor("48123.55", "INR")).toBe(4812355n);
    expect(providerAmountToMinor("1200", "HUF")).toBe(1200n);
    expect(() => providerAmountToMinor("1.5", "JPY")).toThrow();
    expect(formatAnyCurrency(4812355n, "INR", "en-IN")).toBe("₹48,123.55");
  });

  it("converts for display with one rounding step", async () => {
    const { estimateConversion } = await import("./money");
    expect(estimateConversion(40000n, "GBP", "INR", "124.67")).toBe(4986800n); // £400 → ₹49,868.00
    expect(estimateConversion(1n, "USD", "JPY", "151.5")).toBe(2n); // 1.515 → 2 (half-up)
    expect(estimateConversion(10000n, "JPY", "USD", "0.0066")).toBe(6600n); // ¥10,000 → $66.00
    expect(() => estimateConversion(1n, "USD", "EUR", "abc")).toThrow();
  });
});
