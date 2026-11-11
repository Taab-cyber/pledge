import { describe, expect, it } from "vitest";
import { consentRecord, consentText, sha256Hex } from "./consent";
import { LIMITS, checkTotal } from "./limits";
import { money } from "./money";
import { canShare, planFromWeights, validatePlan, type Plan, type WeightedMilestone } from "./plan";
import {
  generateShareToken,
  hashShareToken,
  isWellFormedShareToken,
  shareTokenMatches,
  whatsappLink,
} from "./share-token";

const ms = (title: string, weight: number): WeightedMilestone => ({
  title,
  weight,
  dueInDays: 7,
  revisionsIncluded: 2,
  todos: [`Do ${title}`],
});

describe("checkTotal", () => {
  it("enforces 5 to 10 000 major units in the deal currency", () => {
    expect(checkTotal(money(500n, "USD"))).toBeNull();
    expect(checkTotal(money(499n, "USD"))).toBe("TOTAL_TOO_SMALL");
    expect(checkTotal(money(1_000_000n, "USD"))).toBeNull();
    expect(checkTotal(money(1_000_001n, "USD"))).toBe("TOTAL_TOO_LARGE");
    expect(checkTotal(money(5n, "JPY"))).toBeNull();
    expect(checkTotal(money(4n, "JPY"))).toBe("TOTAL_TOO_SMALL");
    expect(checkTotal(money(10_000n, "JPY"))).toBeNull();
  });
});

describe("planFromWeights + validatePlan", () => {
  it("builds a shareable plan whose amounts sum to the total", () => {
    const plan = planFromWeights("USD", 40000n, [
      ms("Logo", 30),
      ms("Brand kit", 45),
      ms("Files", 25),
    ]);
    expect(plan.milestones.map((m) => m.amountMinor)).toEqual([12000n, 18000n, 10000n]);
    expect(validatePlan(plan)).toEqual([]);
    expect(canShare(plan)).toBe(true);
  });

  it("blocks sharing when amounts don't sum to the total", () => {
    const plan = planFromWeights("USD", 40000n, [ms("A", 1), ms("B", 1)]);
    plan.milestones[0]!.amountMinor += 100n; // freelancer bumps one amount
    const issues = validatePlan(plan);
    expect(issues).toContainEqual({
      code: "SUM_MISMATCH",
      sumMinor: 40100n,
      totalMinor: 40000n,
      differenceMinor: -100n,
    });
    expect(canShare(plan)).toBe(false);
  });

  it("flags milestone-count limits", () => {
    const tooMany = planFromWeights(
      "USD",
      90000n,
      Array.from({ length: LIMITS.milestonesMax + 1 }, (_, i) => ms(`M${i}`, 1)),
    );
    expect(validatePlan(tooMany).map((i) => i.code)).toContain("TOO_MANY_MILESTONES");
    const none: Plan = { currency: "USD", totalMinor: 1000n, milestones: [] };
    expect(validatePlan(none).map((i) => i.code)).toEqual(["TOO_FEW_MILESTONES"]);
  });

  it("flags per-milestone problems with their index", () => {
    const plan = planFromWeights("USD", 40000n, [ms("Ok", 1), ms("Bad", 1)]);
    Object.assign(plan.milestones[1]!, {
      title: "  ",
      dueInDays: 22,
      revisionsIncluded: -1,
      todos: ["", "x"],
    });
    const codes = validatePlan(plan);
    expect(codes).toEqual(
      expect.arrayContaining([
        { code: "EMPTY_TITLE", milestone: 1 },
        { code: "DUE_OUT_OF_RANGE", milestone: 1 },
        { code: "REVISIONS_OUT_OF_RANGE", milestone: 1 },
        { code: "EMPTY_TODO", milestone: 1, todo: 0 },
      ]),
    );
    expect(codes.some((c) => "milestone" in c && c.milestone === 0)).toBe(false);
  });

  it("flags zero amounts, missing to-dos, and out-of-range totals", () => {
    const plan: Plan = {
      currency: "USD",
      totalMinor: 400n,
      milestones: [{ title: "A", amountMinor: 0n, dueInDays: 3, revisionsIncluded: 1, todos: [] }],
    };
    expect(validatePlan(plan).map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "TOTAL_TOO_SMALL",
        "AMOUNT_NOT_POSITIVE",
        "TOO_FEW_TODOS",
        "SUM_MISMATCH",
      ]),
    );
  });

  it("rejects unsupported currencies outright", () => {
    const plan = planFromWeights("USD", 40000n, [ms("A", 1)]);
    expect(validatePlan({ ...plan, currency: "INR" })).toEqual([{ code: "UNSUPPORTED_CURRENCY" }]);
  });

  it("works in JPY", () => {
    const plan = planFromWeights("JPY", 9001n, [ms("A", 1), ms("B", 1), ms("C", 1)]);
    expect(plan.milestones.map((m) => m.amountMinor)).toEqual([3001n, 3000n, 3000n]);
    expect(canShare(plan)).toBe(true);
  });
});

describe("consent", () => {
  const input = {
    dealTitle: "Brand identity",
    dealVersion: 2,
    freelancerName: "Riya",
    autoReleaseHours: 72,
  };

  it("is deterministic and hashed with SHA-256", () => {
    const a = consentRecord(input);
    expect(a).toEqual(consentRecord(input));
    expect(a.textSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.textSha256).toBe(sha256Hex(a.text));
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("names the version and timer, and never says escrow or guaranteed", () => {
    const text = consentText(input);
    expect(text).toContain("plan version 2");
    expect(text).toContain("72 hours");
    expect(text).toContain("not charged yet");
    expect(text.toLowerCase()).not.toMatch(/escrow|guarantee/);
    expect(consentRecord({ ...input, dealVersion: 3 }).textSha256).not.toBe(
      consentRecord(input).textSha256,
    );
  });
});

describe("share tokens", () => {
  it("are 32 random bytes; only the hash is stored", () => {
    const { token, hash } = generateShareToken();
    expect(isWellFormedShareToken(token)).toBe(true);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hash).toBe(hashShareToken(token));
    expect(hash).not.toContain(token);
    expect(generateShareToken().token).not.toBe(token);
  });

  it("match only the right token", () => {
    const { token, hash } = generateShareToken();
    expect(shareTokenMatches(token, hash)).toBe(true);
    expect(shareTokenMatches(generateShareToken().token, hash)).toBe(false);
    expect(shareTokenMatches("short", hash)).toBe(false);
  });

  it("build WhatsApp links with digits only", () => {
    expect(whatsappLink("+44 7700-900123", "See the plan: https://x/p/abc")).toBe(
      "https://wa.me/447700900123?text=See%20the%20plan%3A%20https%3A%2F%2Fx%2Fp%2Fabc",
    );
  });
});
