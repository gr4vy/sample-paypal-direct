# CLAUDE.md

Working notes for AI assistants editing this repo. The README is the
human-facing guide — keep that as the primary source of truth and only put
things here that aren't useful in the README itself.

## What this repo is

A self-contained sample of **Gr4vy's PayPal direct integration on web**, using
the **standalone session** flow. The PayPal Smart Button renders on page load
with **no transaction created**; the transaction and PayPal order are created
lazily, only when the buyer clicks, inside PayPal's `createOrder` callback.

This is *not* the simpler redirect-to-paypal.com flow. PayPal's SDK runs on the
merchant's page, driven by config fetched from Gr4vy.

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
route this sample has over a plain transaction-first integration.

## Non-obvious things we learned the hard way

- **`country` and `currency` are required on the `paymentMethod` object** of
  `transactions.create`, not just at the top level. The SDK's Zod schema
  rejects without them.
- **`intent` is governed by the PayPal connection, not the transaction.** The
  order's intent comes from the connection's configuration in Gr4vy; passing a
  different `intent` on `transactions.create` does not change it. Load the SDK
  with the connection's intent (the spider sandbox connection is `authorize`)
  or PayPal throws `Expected intent from order api call to be capture, got
  authorize` on click.
- **Omit `merchant-id` when the session returns `merchantId: null`.**
  `&merchant-id=null` causes a 400 from `paypal.com/sdk/js`.
- **`fundingSource` is a path string** (`"paypal.FUNDING.PAYPAL"`) — resolve
  via `window.paypal.FUNDING[...]`.
- **In `onApprove`, navigate to `default_completion_url`. Do not `fetch()`
  it** — the redirect crosses origins and a fetch chain fails.
- **Venmo uses PayPal's v6 Web SDK (`web-sdk/v6/core`), not the classic
  `paypal.com/sdk/js`** — a different, instance-based API
  (`createInstance` → `createVenmoOneTimePaymentSession` → `.start()`), and
  we run it **ourselves, directly on this page**. The Venmo connector
  (`paypal-venmo`, PR #7322 in the connectors repo, merged to main) creates
  the PayPal order *eagerly* inside `POST /transactions` and also exposes an
  `paymentMethod.approvalUrl` pointing at a page Gr4vy hosts
  (`paypal/venmo.html`) that also runs the v6 SDK — **don't use that URL**.
  It's a sandbox testing surface for the connectors team, not a documented
  merchant integration path. Instead, fetch the per-transaction session (the
  exact same `POST /transactions/:id/session?token=` call the PayPal flow
  already makes) to get `session_data.clientId`/`orderId` and
  `default_completion_url`, then drive the v6 SDK with those directly — same
  completion mechanism as PayPal's `onApprove`, since `default_completion_url`
  is the same Gr4vy-generated `approval_url` either way (confirmed via
  `commands.py`'s `CreateTransaction.approval_url` docstring: "gr4vy approval
  URL", not the merchant's raw `redirectUrl`).
  `redirect_requires_popup: Yes` in the connector docs is generic
  redirect-mode metadata, not a requirement here — neither connector sets
  `approval_target`, which defaults to "no specific requirement", and the
  v6 SDK's own popup/modal handling (`presentationMode: "auto"`) is what
  actually manages the buyer-facing window.
- **The classic SDK and the v6 SDK both claim `window.paypal`.** Since the
  classic SDK loads first (on page load, for the button), v6 finds
  `window.paypal` already occupied when it loads on Venmo click and doesn't
  overwrite it with `createInstance` — `window.paypal.createInstance is not a
  function`, silently. Fix: null out `window.paypal` right before injecting
  the v6 script, capture whatever it writes into a separate variable, then
  restore the classic object so the still-rendered button keeps working. See
  `loadVenmoSdk()` in `public/index.html`.

## Config and secrets

- Defaults live in `config.example.json` (committed), pointed at the **Spider
  sandbox**. The sample needs a **`paymentServiceId`** (the PayPal connection's
  id) — the example ships a placeholder that the user must replace in
  `config.json`.
- `private_key.pem` is gitignored and required at runtime.
- `.gitignore` covers `private_key.pem`, `config.json`, `.env`,
  `node_modules/`. **Never** commit a key or a populated `config.json`.
- `"local": true` swaps `apiUrl` to `http://localhost:8000` (core-api's
  `make server` default) and feeds it into the Gr4vy client as `serverURL`,
  which core-api's `id`/`server` fields become irrelevant to at that point —
  `serverURL` is checked first in the SDK's own config resolution
  (`@gr4vy/sdk`'s `serverURLFromOptions`) and short-circuits the `id`/`server`
  templating entirely. Default `false`.

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
  step-by-step section.
- **Don't add error UI** unless asked. Surface failures as a single status
  line.
