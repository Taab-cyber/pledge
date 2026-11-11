// Renders a fictional WhatsApp-style chat (Riya ↔ Daniel) to PNG for demos and tests.
// Usage: node scripts/make-demo-chat.mjs  → docs/demo/chat-riya-daniel.png
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const W = 720;
const messages = [
  ["them", "Hi Riya! Loved your portfolio. I'm opening a coffee shop in Leeds, 'Northern Bean'."],
  ["them", "Need a logo and a small brand kit. Can you do it?"],
  ["me", "Hi Daniel! Yes, happy to. I'd do 3 logo concepts first, then the final logo."],
  ["me", "Final logo in SVG + PNG, plus a version for dark backgrounds and a favicon."],
  ["them", "Perfect. Also colours + fonts guide and a business card?"],
  ["me", "Sure, that's the brand kit: palette with HEX codes, typography guide, business card."],
  ["me", "Total £400. About 2-3 weeks. 2 rounds of revisions on the logo."],
  ["them", "Deal 👍 £400 works. Can we start Monday?"],
  ["me", "Monday works! I'll send the plan through Pledge so the payment is secured."],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function wrap(text, max = 40) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if ((line + " " + word).trim().length > max) {
      lines.push(line.trim());
      line = word;
    } else line += " " + word;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

let y = 110;
const bubbles = messages
  .map(([who, text]) => {
    const lines = wrap(text);
    const h = 24 + lines.length * 28;
    const w = Math.min(560, 40 + Math.max(...lines.map((l) => l.length)) * 12.5);
    const x = who === "me" ? W - w - 24 : 24;
    const fill = who === "me" ? "#D9FDD3" : "#FFFFFF";
    const out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}"/>
      ${lines.map((l, i) => `<text x="${x + 18}" y="${y + 34 + i * 28}" font-size="21" fill="#111B21" font-family="Arial, sans-serif">${esc(l)}</text>`).join("")}`;
    y += h + 14;
    return out;
  })
  .join("\n");
const H = y + 30;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#EFE7DE"/>
  <rect width="${W}" height="84" fill="#075E54"/>
  <circle cx="52" cy="42" r="24" fill="#B2DFDB"/>
  <text x="90" y="40" font-size="24" fill="#fff" font-family="Arial, sans-serif" font-weight="bold">Daniel (Northern Bean)</text>
  <text x="90" y="66" font-size="17" fill="#D1F2EB" font-family="Arial, sans-serif">online</text>
  ${bubbles}
</svg>`;

mkdirSync("docs/demo", { recursive: true });
await sharp(Buffer.from(svg)).png().toFile("docs/demo/chat-riya-daniel.png");
console.log(`wrote docs/demo/chat-riya-daniel.png (${W}x${H})`);
