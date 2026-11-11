// Public plan links: a random 32-byte token in the URL; only its SHA-256 is stored.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "./consent";

const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, no padding

export function generateShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashShareToken(token) };
}

export function isWellFormedShareToken(token: string): boolean {
  return TOKEN.test(token);
}

export function hashShareToken(token: string): string {
  return sha256Hex(token);
}

export function shareTokenMatches(token: string, storedHash: string): boolean {
  if (!isWellFormedShareToken(token)) return false;
  const a = Buffer.from(hashShareToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** WhatsApp share link: https://wa.me/<digits>?text=<message>. */
export function whatsappLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
