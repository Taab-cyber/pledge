// Money is integer minor units (bigint) + ISO-4217 code. Never floats.
import { anyCurrencyExponent, exponentOf } from "./currencies";

export interface Money {
  minor: bigint;
  currency: string;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function money(minor: bigint | number, currency: string): Money {
  const m = typeof minor === "number" ? toBigIntStrict(minor) : minor;
  exponentOf(currency); // throws on unsupported currency
  return { minor: m, currency };
}

function toBigIntStrict(n: number): bigint {
  if (!Number.isSafeInteger(n))
    throw new MoneyError(`Minor units must be a safe integer, got ${n}`);
  return BigInt(n);
}

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parses a major-unit amount ("12.5", "400", 12.5) into Money.
 * Rejects more decimals than the currency allows (e.g. any decimals for JPY).
 */
export function fromMajor(amount: string | number, currency: string): Money {
  const exp = exponentOf(currency);
  const text = typeof amount === "number" ? numberToPlainString(amount) : amount.trim();
  const match = DECIMAL.exec(text);
  if (!match) throw new MoneyError(`Not a valid amount: "${text}"`);
  const [, sign, whole = "0", fraction = ""] = match;
  const trimmed = fraction.replace(/0+$/, "");
  if (trimmed.length > exp) {
    throw new MoneyError(
      exp === 0
        ? `${currency} amounts can't have decimals.`
        : `${currency} amounts can have at most ${exp} decimals.`,
    );
  }
  const minor = BigInt(whole) * 10n ** BigInt(exp) + BigInt(trimmed.padEnd(exp, "0") || "0");
  return { minor: sign ? -minor : minor, currency };
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new MoneyError(`Not a valid amount: ${n}`);
  const s = String(n);
  if (/e/i.test(s)) throw new MoneyError(`Amount out of range: ${n}`);
  return s;
}

/** Exact decimal string in major units, e.g. 40050n USD → "400.50", 500n JPY → "500". */
export function toMajorString(m: Money): string {
  const exp = exponentOf(m.currency);
  const neg = m.minor < 0n;
  const abs = neg ? -m.minor : m.minor;
  if (exp === 0) return `${neg ? "-" : ""}${abs}`;
  const base = 10n ** BigInt(exp);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(exp, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Locale-aware display, e.g. "$400.50", "£12.00", "¥500". */
export function format(m: Money, locale = "en-US"): string {
  const exp = exponentOf(m.currency);
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  });
  // Intl accepts decimal strings exactly (no float rounding).
  return fmt.format(toMajorString(m) as unknown as number);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

export function sum(parts: Money[], currency: string): Money {
  return parts.reduce((acc, p) => add(acc, p), money(0n, currency));
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.minor === b.minor;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

/**
 * Parses an amount PayPal reports (any currency, e.g. an INR settlement) to integer minor units.
 * Unlike fromMajor it doesn't require a deal currency, and rounds nothing: extra decimals are an error.
 */
export function providerAmountToMinor(value: string, currency: string): bigint {
  const exp = anyCurrencyExponent(currency);
  const match = DECIMAL.exec(value.trim());
  if (!match) throw new MoneyError(`Not a valid amount from provider: "${value}"`);
  const [, sign, whole = "0", fraction = ""] = match;
  const trimmed = fraction.replace(/0+$/, "");
  if (trimmed.length > exp) throw new MoneyError(`Too many decimals for ${currency}: "${value}"`);
  const minor = BigInt(whole) * 10n ** BigInt(exp) + BigInt(trimmed.padEnd(exp, "0") || "0");
  return sign ? -minor : minor;
}

/** Display any currency (including ones that aren't deal currencies). */
export function formatAnyCurrency(minor: bigint, currency: string, locale = "en-US"): string {
  const exp = anyCurrencyExponent(currency);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const base = 10n ** BigInt(exp);
  const text = exp === 0 ? `${abs}` : `${abs / base}.${(abs % base).toString().padStart(exp, "0")}`;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(`${neg ? "-" : ""}${text}` as unknown as number);
}

/**
 * Indicative conversion for display ("estimate, final rate set by PayPal"). Pledge never converts money.
 * Exact integer math with the rate scaled to 8 decimals, rounded half-up once at the end.
 */
export function estimateConversion(
  minor: bigint,
  fromCurrency: string,
  toCurrency: string,
  rate: string,
): bigint {
  const m = /^(\d+)(?:\.(\d{1,8}))?\d*$/.exec(rate.trim());
  if (!m) throw new MoneyError(`Not a valid rate: "${rate}"`);
  const scaledRate = BigInt(m[1]!) * 10n ** 8n + BigInt((m[2] ?? "").padEnd(8, "0"));
  const num = minor * scaledRate * 10n ** BigInt(anyCurrencyExponent(toCurrency));
  const den = 10n ** 8n * 10n ** BigInt(anyCurrencyExponent(fromCurrency));
  return (num * 2n + den) / (2n * den);
}
