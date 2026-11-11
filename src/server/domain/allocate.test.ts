import { describe, expect, it } from "vitest";
import { allocate } from "./allocate";

const total = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

describe("allocate", () => {
  it("splits evenly divisible totals exactly", () => {
    expect(allocate(40000n, [1, 1, 2])).toEqual([10000n, 10000n, 20000n]);
  });

  it("gives leftover cents to the largest remainders", () => {
    // $100.00 in thirds: 33.34 / 33.33 / 33.33 (tie → earliest part)
    expect(allocate(10000n, [1, 1, 1])).toEqual([3334n, 3333n, 3333n]);
    // remainders 1/3, 2/3: the second part gets the extra unit
    expect(allocate(10n, [1, 2])).toEqual([3n, 7n]);
  });

  it("handles uneven AI weights", () => {
    const parts = allocate(40000n, [30, 45, 25]);
    expect(parts).toEqual([12000n, 18000n, 10000n]);
    const odd = allocate(99999n, [17, 3, 61, 19]);
    expect(total(odd)).toBe(99999n);
    expect(odd).toEqual([17000n, 3000n, 60999n, 19000n]);
  });

  it("works for JPY (exponent 0) with odd totals", () => {
    const parts = allocate(50001n, [1, 1, 1, 1, 1, 1, 1]);
    expect(total(parts)).toBe(50001n);
    expect(parts.every((p) => p === 7143n || p === 7142n)).toBe(true);
    expect(allocate(7n, [1, 1, 1])).toEqual([3n, 2n, 2n]);
  });

  it("gives every part at least 1 minor unit even with tiny weights", () => {
    expect(allocate(3n, [1, 100, 100])).toEqual([1n, 1n, 1n]);
    const parts = allocate(10n, [1, 1000, 1000]);
    expect(total(parts)).toBe(10n);
    expect(parts.every((p) => p >= 1n)).toBe(true);
  });

  it("keeps a single milestone whole", () => {
    expect(allocate(123456n, [42])).toEqual([123456n]);
  });

  it("always sums exactly (randomized)", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let k = 0; k < 500; k++) {
      const count = 1 + rand(8);
      const weights = Array.from({ length: count }, () => 1 + rand(100));
      const t = BigInt(count + rand(1_000_000));
      const parts = allocate(t, weights);
      expect(total(parts)).toBe(t);
      expect(parts.every((p) => p >= 1n)).toBe(true);
    }
  });

  it("rejects bad input", () => {
    expect(() => allocate(100n, [])).toThrow();
    expect(() => allocate(100n, [1, 0])).toThrow(/positive integers/);
    expect(() => allocate(100n, [1.5])).toThrow(/positive integers/);
    expect(() => allocate(100n, [-1])).toThrow();
    expect(() => allocate(2n, [1, 1, 1])).toThrow(/too small/);
  });
});
