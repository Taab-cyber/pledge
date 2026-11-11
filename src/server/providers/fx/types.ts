export interface FxRate {
  /** Units of `to` per 1 unit of `from`, as a decimal string (display only). */
  rate: string;
  /** ECB reference date (YYYY-MM-DD). */
  asOf: string;
}

export interface FxProvider {
  readonly name: string;
  /** null when the pair isn't available (e.g. currency not published by the ECB). */
  rate(from: string, to: string): Promise<FxRate | null>;
}
