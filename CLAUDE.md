# CLAUDE.md

Working notes for AI assistants editing this repo. The README is the
human-facing guide — keep that as the primary source of truth and only put
things here that aren't useful in the README itself.

## What this repo is

A self-contained sample of **Gr4vy's PayPal direct integration on web**. The
merchant loads the PayPal JS SDK on their own checkout page and renders the
Smart Button against an order Gr4vy has already created at PayPal.

This is *not* the simpler redirect-to-paypal.com flow. The distinguishing
feature is that PayPal's SDK runs on the merchant's page, driven by session
data fetched from Gr4vy.

## Stack constraints (do not change without asking)

- **Node 20+, ESM, plain JavaScript** — no TypeScript, no bundler.
- **Express** for the server (`server.js` only).
- **Vanilla JS in a single HTML file** for the client (`public/index.html`).
  No frameworks, no build step.
- **`@gr4vy/sdk`** for server-side Gr4vy calls.
- Two source files total — keep it that way. The point of this repo is that
  a developer can read it end-to-end in a few minutes.

If you're tempted to add a framework, a bundler, a router, TypeScript, a
component library, or an abstraction layer — don't. Ask first.

## The five-step flow (in code order)

1. `server.js` `POST /transactions` — calls `gr4vy.transactions.create` with
   `integrationClient: "web"`, `method: "paypal"`. Returns `transactionId` +
   `sessionToken`.
2. `public/index.html` `fetchPayPalSession()` — POSTs to
   `{apiUrl}/transactions/:id/session?token=...` directly from the browser.
   Returns `session_data` (orderId, clientId, currency, intent,
   fundingSource, merchantId) and `default_completion_url`.
3. `loadPayPalSdk()` — injects `<script src="paypal.com/sdk/js?...">` with
   `client-id`, `currency`, `intent`, optionally `merchant-id`.
4. `renderPayPalButton()` — `paypal.Buttons({ createOrder: () => orderId,
   onApprove: () => navigate to default_completion_url })`.
5. On return, the URL has `?transaction_id=...&transaction_status=...`; the
   page calls `GET /transactions/:id` and shows the status.

## Non-obvious things we already learned the hard way

These are landmines that look fine in the docs but break in practice:

- **`country` and `currency` are required on the `paymentMethod` object**
  (not just at the top level of `transactions.create`). The SDK's Zod schema
  rejects without them.
- **Pass `intent` to the PayPal SDK URL** (e.g. `&intent=authorize`). If you
  omit it, PayPal renders fine but throws `Expected intent from order api
  call to be capture, got authorize` on click.
- **Omit `merchant-id` when the session returns `merchantId: null`.**
  Including `&merchant-id=null` causes a 400 from `paypal.com/sdk/js`.
  `merchantId` is only used in multi-party / marketplace setups.
- **`fundingSource` comes back as a path string** (`"paypal.FUNDING.PAYPAL"`)
  — resolve via `window.paypal.FUNDING[...]` before passing to
  `paypal.Buttons`.
- **In `onApprove`, navigate the browser to `default_completion_url`. Do not
  `fetch()` it.** The URL 303-redirects across origins (api.sandbox →
  localhost) and a cross-origin fetch chain fails with "Failed to fetch".
  Navigation is also the documented pattern.
- **The session endpoint is intentionally outside the SDK** — the Gr4vy
  TypeScript SDK doesn't expose it. Call it with a plain `fetch` from the
  browser, auth'd by the `sessionToken` query param. No private key needed
  on the client side.

## Config and secrets

- Defaults live in `config.example.json` (committed). Pointed at the
  **Spider sandbox** (`gr4vyId: "spider"`, `server: "sandbox"`, merchant
  account `default`). The server reads `config.json` if it exists,
  otherwise falls back to the example.
- `private_key.pem` is gitignored and required at runtime. The Gr4vy SDK
  reads it on every request to sign a JWT.
- `.gitignore` already covers `private_key.pem`, `config.json`, `.env`,
  `node_modules/`. **Never** commit a key or a populated `config.json`.

## Running and testing

- `npm install && npm start` — boots Express on port 3000.
- The page renders the PayPal button on load (no "Pay with PayPal" launcher
  button — that was an earlier iteration).
- To simulate the return path without going through PayPal:
  `http://localhost:3000/?transaction_id=<any-real-tx-id>` — the page will
  call `GET /transactions/:id` and display the status.
- There are no automated tests. If you make non-trivial changes, run through
  a real sandbox payment with a PayPal sandbox buyer account.

## When making changes

- **Don't expand scope.** If the user asks for a small fix, do exactly that.
  This repo is intentionally tiny.
- **Keep comments to the why, not the what.** The flow comments in
  `index.html` and `server.js` exist because the *order* of API calls is the
  hard part to remember; the code itself is self-explanatory.
- **The README is a teaching document.** If you change the flow, update the
  step-by-step section and any code snippets in it that drift.
- **Don't add error UI** unless asked. Sample apps are clearer when the
  happy path is uncluttered. Surface failures as a single status line.
