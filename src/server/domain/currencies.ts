// Currency registry for the demo. Exponent = number of minor-unit digits.
// PayPal rejects decimals for JPY / HUF / TWD, so their exponent is 0.

export interface CurrencyInfo {
  code: string;
  exponent: number;
  name: string;
}

export const SUPPORTED_CURRENCIES = {
  USD: { code: "USD", exponent: 2, name: "US dollar" },
  EUR: { code: "EUR", exponent: 2, name: "Euro" },
  GBP: { code: "GBP", exponent: 2, name: "British pound" },
  CAD: { code: "CAD", exponent: 2, name: "Canadian dollar" },
  AUD: { code: "AUD", exponent: 2, name: "Australian dollar" },
  SGD: { code: "SGD", exponent: 2, name: "Singapore dollar" },
  JPY: { code: "JPY", exponent: 0, name: "Japanese yen" },
} as const satisfies Record<string, CurrencyInfo>;

export type SupportedCurrency = keyof typeof SUPPORTED_CURRENCIES;

export const DEFAULT_CURRENCY: SupportedCurrency = "USD";

/** PayPal supports these only for in-country payments, so they can't be used for cross-border deals. */
export const IN_COUNTRY_ONLY_CURRENCIES = new Set(["INR", "BRL", "MYR"]);

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return Object.hasOwn(SUPPORTED_CURRENCIES, code);
}

export function currencyInfo(code: string): CurrencyInfo {
  if (!isSupportedCurrency(code)) throw new Error(`Unsupported currency: ${code}`);
  return SUPPORTED_CURRENCIES[code];
}

export function exponentOf(code: string): number {
  return currencyInfo(code).exponent;
}

/** PayPal's zero-decimal currencies (it rejects decimals for these). */
const ZERO_DECIMAL = new Set(["JPY", "HUF", "TWD"]);

/**
 * Exponent for any currency PayPal may report back (e.g. INR settlement), not just deal currencies.
 * Display/storage only: deals themselves must use a supported currency.
 */
export function anyCurrencyExponent(code: string): number {
  if (isSupportedCurrency(code)) return SUPPORTED_CURRENCIES[code].exponent;
  return ZERO_DECIMAL.has(code) ? 0 : 2;
}
