import { describe, expect, it } from "vitest";
import { isOnboarded, planProfileUpdate, type ProfileState } from "./profile";

const blank: ProfileState = { role: null, full_name: null, country_code: null, paypal_email: null };

describe("planProfileUpdate", () => {
  it("lets a new user choose a role", () => {
    expect(planProfileUpdate(blank, { role: "client", full_name: "Dan" })).toEqual({
      ok: true,
      patch: { role: "client", full_name: "Dan" },
    });
  });

  it("refuses to change a role once set", () => {
    const res = planProfileUpdate({ ...blank, role: "client" }, { role: "freelancer" });
    expect(res).toEqual({ ok: false, error: "ROLE_ALREADY_SET" });
  });

  it("drops a repeated identical role instead of rewriting it", () => {
    const res = planProfileUpdate({ ...blank, role: "client" }, { role: "client", full_name: "D" });
    expect(res).toEqual({ ok: true, patch: { full_name: "D" } });
  });

  it("only freelancers can set a PayPal payout email", () => {
    expect(planProfileUpdate({ ...blank, role: "client" }, { paypal_email: "a@b.co" })).toEqual({
      ok: false,
      error: "PAYPAL_EMAIL_FREELANCER_ONLY",
    });
    expect(planProfileUpdate(blank, { paypal_email: "a@b.co" }).ok).toBe(false);
    expect(planProfileUpdate(blank, { role: "freelancer", paypal_email: "a@b.co" }).ok).toBe(true);
  });
});

describe("isOnboarded", () => {
  it("needs role, name and country; freelancers also need a PayPal email", () => {
    expect(isOnboarded(blank)).toBe(false);
    const client: ProfileState = {
      role: "client",
      full_name: "D",
      country_code: "GB",
      paypal_email: null,
    };
    expect(isOnboarded(client)).toBe(true);
    const freelancer: ProfileState = { ...client, role: "freelancer" };
    expect(isOnboarded(freelancer)).toBe(false);
    expect(isOnboarded({ ...freelancer, paypal_email: "r@x.co" })).toBe(true);
  });
});
