# Pledge: judge click path (about 3 minutes)

Live app: **https://pledge-one.vercel.app**. Everything runs on the **PayPal sandbox** (no real money).
Time is the only simulated thing; every PayPal call is real.

## Accounts

| Who                                                             | How to sign in                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Daniel Okafor, client, UK                                       | Login page → **Try as client**                                                                               |
| Riya Sharma, freelancer, India                                  | Login page → **Try as freelancer**                                                                           |
| PayPal sandbox buyer (Daniel pays with this in PayPal's window) | Email: `sb-rhujp53670828@business.example.com` · Password: _ask the team / see the Devpost submission notes_ |
| PayPal sandbox payee (Riya gets paid here)                      | `sb-utxst53851915@business.example.com` (sign in at https://www.sandbox.paypal.com to see the money arrive)  |

## A. Client path: approve, hold, review, pay

1. Open https://pledge-one.vercel.app/login → **Try as client**.
2. The blue banner says "Riya sent you a plan on WhatsApp" → **Open the plan**.
3. Read the milestones and "How paying works". Tick the auto-release consent → **Approve and continue**.
4. On the deal page, milestone 1 shows the yellow **PayPal** button → sign in with the sandbox buyer above →
   approve. The page says **"Payment secured. You haven't been charged yet."** and shows the PayPal hold id.
5. Press **Demo: freelancer delivers now** (or **Deliver with one item missing** to see the AI flag it).
6. Look at the watermarked previews, the **AI check** (each to-do met / missing / unclear) and the countdown.
   "Download original" is locked until you pay.
7. Press **Approve and pay**. PayPal captures the hold; the page shows the capture id, gross, PayPal fee, net
   and what Riya receives. Originals unlock, and the next milestone opens.
8. Optional: in **Message the freelancer**, ask "Could you also make Instagram templates?" The scope guard
   flags it as extra work, and Riya's Deal Agent drafts a £60 add-on.

## B. Time and the Deal Agent (still as Daniel, on an active deal)

- **Demo: skip 3 days** on a delivered milestone: the auto-release runs and PayPal captures for real.
- **Demo: test hold renewal** on a secured milestone: the agent asks PayPal to reauthorize. A fresh hold is
  inside PayPal's 3-day honor period, so PayPal refuses with a real error → the milestone shows **Hold at
  risk** with PayPal's error and debug id, and the agent proposes **Start a new hold**.

## C. Freelancer path

1. **Try as freelancer** → dashboard with money held/released and the deals table.
2. **New deal** → upload a chat screenshot (e.g. `docs/demo/chat-riya-daniel.png`), client details,
   country (currency is suggested), total → **Build my plan with AI**.
3. In the plan editor: the AI's milestones, to-dos, open questions and a price check; amounts always sum
   exactly to the total (the WhatsApp link stays locked until they do) → **Create WhatsApp link**.
4. On a client's out-of-scope message, the Deal Agent card "Send add-on: … · £60" → **Send add-on**.

## Reset the demo (team only)

`npm run demo:prepare` recreates Riya's deals (2 finished examples + 1 fresh shared plan) and writes the new
plan link to `DEMO_SHARE_URL`; then `node scripts/deploy-vercel.mjs`. Do this after a judge has approved the
shared plan, or after Riya re-shares it (each share makes a new link).
