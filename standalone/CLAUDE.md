# CLAUDE.md

Working notes for AI assistants editing this repo. The README is the
human-facing guide — keep that as the primary source of truth and only put
things here that aren't useful in the README itself.

## What this repo is

A self-contained sample of **Gr4vy's PayPal standalone session on web**. The
PayPal Smart Button renders on page load with **no transaction created**; the
transaction and PayPal order are created lazily, only when the buyer clicks,
inside PayPal's `createOrder` callback.

This is the `standalone/` subdirectory of the `sample-paypal-direct` repo. The
repo root shows the **transaction-first** flow (a transaction is created up
front to render the button). This subdirectory is the one-click /
no-tx-on-load counterpart. The defining difference is step 1: here we fetch a
**standalone** session that returns no `orderId`.

## Stack constraints (do not change without asking)

- **Node 20+, ESM, plain JavaScript** — no TypeScript, no bundler.
- **Express** for the server (`server.js` only).
- **Vanilla JS in a single HTML file** for the client (`public/index.html`).
  No frameworks, no build step.
- **`@gr4vy/sdk`** for server-side Gr4vy calls.
- Two source files total — keep it that way.

If you're tempted to add a framework, a bundler, a router, TypeScript, a
component library, or an abstraction layer — don't. Ask first.

## The five-step flow (in code order)

1. `server.js` `GET /paypal-session` — proxies
   `gr4vy.paymentServices.session({}, paymentServiceId)`
   (i.e. `POST /payment-services/{id}/sessions`). Returns `responseBody`:
   `{ clientId, merchantId }` — **no orderId, no transaction, no PayPal call.**
2. `public/index.html` `loadPayPalSdk()` — injects
   `<script src="paypal.com/sdk/js?...">` with the `clientId` plus the
   client-chosen `CURRENCY`/`INTENT` constants, and renders the button. No
   transaction yet.
3. `createOrderLazily()` (inside `createOrder`) — on click: `POST
   /transactions`, then `POST {apiUrl}/transactions/:id/session?token=...` from
   the browser to get the `orderId` + `default_completion_url`. Returns the
   `orderId`.
4. `onApprove` — navigate the browser to `default_completion_url`.
5. On return, the URL has `?transaction_id=...&transaction_status=...`; the
   page calls `GET /transactions/:id` and shows the status.

## Why the standalone session is server-side

The per-transaction session (`/transactions/:id/session?token=`) is authed by
a short-lived `sessionToken` and is safe to call from the browser. The
**standalone** session (`/payment-services/{id}/sessions`) requires a full
Gr4vy bearer token (scope `transactions.write`), which is minted from the
private key — so it must be proxied through the server. That's the one extra
route this sample has over the transaction-first sample at the repo root.

## Non-obvious things (shared with the transaction-first sample)

- **`country` and `currency` are required on the `paymentMethod` object** of
  `transactions.create`, not just at the top level. The SDK's Zod schema
  rejects without them.
- **Pass `intent` to the PayPal SDK URL.** Omitting it renders fine but throws
  `Expected intent from order api call to be capture, got authorize` on click.
- **Omit `merchant-id` when the session returns `merchantId: null`.**
  `&merchant-id=null` causes a 400 from `paypal.com/sdk/js`.
- **`fundingSource` is a path string** (`"paypal.FUNDING.PAYPAL"`) — resolve
  via `window.paypal.FUNDING[...]`.
- **In `onApprove`, navigate to `default_completion_url`. Do not `fetch()`
  it** — the redirect crosses origins and a fetch chain fails.

## Config and secrets

- Defaults live in `config.example.json` (committed), pointed at the **Spider
  sandbox**. Unlike the transaction-first sample, this one needs a
  **`paymentServiceId`** (the PayPal connection's id) — the example ships a
  placeholder that the user must replace in `config.json`.
- `private_key.pem` is gitignored and required at runtime.
- `.gitignore` covers `private_key.pem`, `config.json`, `.env`,
  `node_modules/`. **Never** commit a key or a populated `config.json`.

## Running and testing

- `npm install && npm start` — boots Express on port 3000.
- The button renders on load with **no transaction**. Verify in the dashboard
  that loading the page creates nothing; clicking creates exactly one
  transaction.
- To simulate the return path without going through PayPal:
  `http://localhost:3000/?transaction_id=<any-real-tx-id>`.
- There are no automated tests. For non-trivial changes, run a real sandbox
  payment with a PayPal sandbox buyer account.

## When making changes

- **Don't expand scope.** This repo is intentionally tiny.
- **Keep comments to the why, not the what.**
- **The README is a teaching document.** If you change the flow, update the
  step-by-step section and the comparison table.
- **Don't add error UI** unless asked. Surface failures as a single status
  line.
