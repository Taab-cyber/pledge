const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Reuses a well-formed incoming x-request-id (e.g. from a proxy or client), else makes one. */
export function getRequestId(headers: Headers): string {
  const incoming = headers.get("x-request-id");
  return incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
}
