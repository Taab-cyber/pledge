// Country → default deal currency. Used to suggest a currency for the client's country.
import {
  DEFAULT_CURRENCY,
  IN_COUNTRY_ONLY_CURRENCIES,
  isSupportedCurrency,
  type SupportedCurrency,
} from "./currencies";

export interface CountryInfo {
  code: string;
  name: string;
  currency: string;
}

const EURO = "EUR";

export const COUNTRIES: Record<string, CountryInfo> = Object.fromEntries(
  (
    [
      ["US", "United States", "USD"],
      ["GB", "United Kingdom", "GBP"],
      ["CA", "Canada", "CAD"],
      ["AU", "Australia", "AUD"],
      ["SG", "Singapore", "SGD"],
      ["JP", "Japan", "JPY"],
      ["IN", "India", "INR"],
      ["BR", "Brazil", "BRL"],
      ["MY", "Malaysia", "MYR"],
      ["AE", "United Arab Emirates", "AED"],
      ["NZ", "New Zealand", "NZD"],
      ["CH", "Switzerland", "CHF"],
      ["MX", "Mexico", "MXN"],
      ["PH", "Philippines", "PHP"],
      ["PK", "Pakistan", "PKR"],
      ["NG", "Nigeria", "NGN"],
      ["ZA", "South Africa", "ZAR"],
      ["DE", "Germany", EURO],
      ["FR", "France", EURO],
      ["ES", "Spain", EURO],
      ["IT", "Italy", EURO],
      ["NL", "Netherlands", EURO],
      ["IE", "Ireland", EURO],
      ["PT", "Portugal", EURO],
      ["BE", "Belgium", EURO],
      ["AT", "Austria", EURO],
      ["FI", "Finland", EURO],
      ["GR", "Greece", EURO],
    ] as const
  ).map(([code, name, currency]) => [code, { code, name, currency }]),
);

export function countryInfo(code: string): CountryInfo | undefined {
  return COUNTRIES[code.toUpperCase()];
}

export interface CurrencySuggestion {
  currency: SupportedCurrency;
  /** Set when we fell back to USD; explains why, for the UI. */
  reason?: string;
}

/** Suggests the deal currency for a client country, falling back to USD with a reason. */
export function suggestDealCurrency(countryCode: string): CurrencySuggestion {
  const country = countryInfo(countryCode);
  if (!country) {
    return {
      currency: DEFAULT_CURRENCY,
      reason: "We don't know this country's currency yet, so we suggest USD.",
    };
  }
  if (isSupportedCurrency(country.currency)) return { currency: country.currency };
  if (IN_COUNTRY_ONLY_CURRENCIES.has(country.currency)) {
    return {
      currency: DEFAULT_CURRENCY,
      reason: `PayPal only supports ${country.currency} for payments inside ${country.name}, so cross-border deals use USD.`,
    };
  }
  return {
    currency: DEFAULT_CURRENCY,
    reason: `${country.currency} isn't supported for Pledge deals yet, so we suggest USD.`,
  };
}
