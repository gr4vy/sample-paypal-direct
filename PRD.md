# PRD: Gr4vy + PayPal Direct Mode — Web Sample App

> Retroactive Product Requirements Document for the `sample-paypal-direct` reference implementation.

---

## 1. Executive Summary

`sample-paypal-direct` is a minimal, end-to-end reference application demonstrating Gr4vy's **PayPal direct integration on the web**. It shows how a merchant can render PayPal's Smart Button on their own checkout page — driven by an order that Gr4vy has already created at PayPal — rather than offloading the buyer to a redirect-only flow.

The sample is intentionally tiny: a single Express server (`server.js`), a single static HTML page with inline JavaScript (`public/index.html`), and a committed `config.example.json` so it boots out of the box against Gr4vy's Spider sandbox. A developer should be able to read the whole codebase top-to-bottom in under five minutes and walk away with a complete mental model of the integration.

**MVP goal:** Provide the smallest possible, fully working example of the Gr4vy PayPal direct/web flow so that integrators can copy patterns directly into a real checkout without first having to disentangle them from a larger framework or production codebase.

---

## 2. Mission

**Mission:** Make Gr4vy's PayPal direct-mode web integration learnable in minutes, not days, by collapsing it into the smallest legible runnable example.

**Core principles:**

1. **Two files of source.** `server.js` and `public/index.html`. No extra abstractions.
2. **No build step.** Vanilla JavaScript, ESM on the server, plain `<script>` on the client.
3. **Boots out of the box.** Committed sandbox defaults; the only thing a developer supplies is a private key.
4. **Comments explain *why*, not *what*.** The flow order is the hard part; the code is self-explanatory.
5. **Happy path only.** Sample apps mislead when they bury the integration under error UI and edge-case handling.

---

## 3. Target Users

**Primary persona: Integration engineer**

- Mid-level backend or full-stack developer evaluating or implementing Gr4vy.
- Comfortable reading Express + vanilla JS; not necessarily a PayPal expert.
- Wants to see "what API calls happen, in what order, and from where (server vs. browser)".
- Will copy patterns into a real codebase that may be in React/Next/Rails/Django — so framework-agnostic samples are more useful than framework-specific ones.

**Secondary persona: Solutions engineer / developer advocate**

- Demos Gr4vy + PayPal to prospective merchants.
- Needs the sample to run reliably against sandbox in front of an audience without ceremony.

**Key pain points the sample addresses:**

- The PayPal direct flow has subtle landmines (intent matching, `merchant-id: null`, funding source resolution, cross-origin completion URL) that aren't obvious from official docs alone.
- Existing examples are either pure PayPal (no Gr4vy) or pure Gr4vy redirect-mode (no client-side PayPal SDK).

---

## 4. MVP Scope

### In Scope

**Core functionality**
- [x] Server-side `POST /transactions` wrapping `gr4vy.transactions.create` with `integrationClient: "web"`, `method: "paypal"`.
- [x] Server-side `GET /transactions/:id` for status lookup on return.
- [x] Server-side `GET /config` exposing the resolved Gr4vy API base URL to the client.
- [x] Client-side direct call to Gr4vy's session endpoint (`POST /transactions/:id/session?token=...`) using the short-lived session token.
- [x] Client-side dynamic injection of the PayPal JS SDK with `client-id`, `currency`, `intent`, and conditional `merchant-id`.
- [x] Rendering the PayPal Smart Button via `paypal.Buttons({ createOrder, onApprove, onCancel, onError })`.
- [x] On approval: full-page navigation to `default_completion_url` (not fetch).
- [x] On return: detect `?transaction_id=...` and display the final status.

**Technical**
- [x] Node 20+, ESM, plain JavaScript.
- [x] Express for the server, vanilla JS for the client.
- [x] `@gr4vy/sdk` (^2.0.43) for server-side Gr4vy calls.
- [x] File-based config (`config.json` overrides `config.example.json`).
- [x] Private key loaded from `private_key.pem` (gitignored).
- [x] Light/dark CSS via `prefers-color-scheme`.

**Integration**
- [x] Spider sandbox (`api.sandbox.spider.gr4vy.app`) as the committed default.
- [x] Automatic switch to production host when `server: "production"`.

**Deployment**
- [x] Single command boot: `npm install && npm start`.
- [x] Localhost only (`http://localhost:3000`).

### Out of Scope

- [ ] TypeScript, bundler, or framework (React/Vue/Next/etc.).
- [ ] Multiple HTML pages, routing, or a build pipeline.
- [ ] Error UI beyond a single status line (cancel/error display the message; nothing more).
- [ ] Webhook handling for transaction state changes.
- [ ] Authentication, sessions, or buyer accounts on the merchant side.
- [ ] Multi-currency / multi-locale UI; the sample hardcodes `USD` / `US`.
- [ ] Other Gr4vy payment methods (cards, Apple Pay, Google Pay, redirect-mode PayPal).
- [ ] 3DS, SCA, or vaulting flows.
- [ ] Automated tests (unit, integration, or e2e).
- [ ] Production deployment artifacts (Dockerfile, CI, hosting config).
- [ ] Logging, observability, or analytics.
- [ ] CSRF protection or rate limiting on the Express routes.

---

## 5. User Stories

**US-1: First-run boot**
> As an integration engineer, I want to clone the repo and have it run with a single `npm install && npm start` (after dropping in my private key), so that I can see the working flow before reading any code.

*Example:* Developer clones repo, places `private_key.pem` at the root, runs `npm start`, opens `localhost:3000`, sees the PayPal button render against Spider sandbox.

**US-2: Read the flow end-to-end**
> As an integration engineer, I want the five-step flow documented in code comments in the order it executes, so that I can map source lines to API calls without jumping between files.

*Example:* The `<script>` block in `index.html` opens with a numbered comment block; the functions below it (`createTransaction`, `fetchPayPalSession`, `loadPayPalSdk`, `renderPayPalButton`, `showFinalStatus`) follow the same numbering.

**US-3: Pay with PayPal sandbox**
> As a tester, I want to complete a real PayPal sandbox payment from the rendered button, so that I can confirm the connector and credentials are configured correctly.

*Example:* Click button → PayPal sandbox login window → approve → redirect back to `localhost:3000/?transaction_id=...&transaction_status=authorization_succeeded` → status line displays.

**US-4: Simulate the return path**
> As a developer, I want to test the return-page rendering without going through PayPal each time, so that I can iterate on the post-payment UI quickly.

*Example:* Visit `http://localhost:3000/?transaction_id=<any-real-tx-id>` and the page renders the lookup result directly.

**US-5: Point at a non-Spider environment**
> As an integrator, I want to override the committed defaults without editing source, so that I can run the sample against my own Gr4vy ID and merchant account.

*Example:* Developer creates `config.json` with `gr4vyId: "acme"`, `merchantAccountId: "us-store"`; `server.js` picks it up automatically; `config.json` stays gitignored.

**US-6: Trust the secret-handling story**
> As a security-conscious developer, I want assurance that the private key never leaves the server, so that I can defend the integration to a security review.

*Example:* The PayPal `clientId`, `orderId`, and `intent` reach the client only via the short-lived `sessionToken` — the private key is read once at startup on the server and used only to sign Gr4vy SDK requests.

**US-7: Switch to production**
> As an integrator, I want a single config knob to flip the sample from sandbox to production, so that I can run a final smoke test before going live.

*Example:* Edit `config.json`: `"server": "production"`; `server.js` resolves the API URL to `https://api.{gr4vyId}.gr4vy.app` automatically.

**US-8: See cancellations clearly**
> As a tester, I want PayPal-side cancel and error events to surface visibly, so that I can distinguish "buyer backed out" from "integration broke".

*Example:* `onCancel` writes `Cancelled by buyer.` to the status div with the error styling; `onError` writes `PayPal error: <message>`.

---

## 6. Core Architecture & Patterns

### High-level architecture

```
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Your server     │        │  Your browser    │        │   PayPal         │
│  (Express)       │        │  (vanilla JS)    │        │   (JS SDK)       │
└────────┬─────────┘        └────────┬─────────┘        └────────┬─────────┘
         │                            │                            │
         │   POST /transactions  ◀───│                            │
         │   (Gr4vy SDK, signed JWT) │                            │
         │   ─→ { id, sessionToken } │                            │
         │                            │                            │
         │              POST {gr4vy}/transactions/:id/session?token=…
         │                            │  (direct from browser)     │
         │                            │   ─→ session_data + URL    │
         │                            │                            │
         │                            │   GET paypal.com/sdk/js   ─→│
         │                            │   render Smart Button      │
         │                            │   ◀───── buyer approves ──▶│
         │                            │                            │
         │                            │  navigate(default_completion_url)
         │                            │   ◀── 303 → /?transaction_id=…
         │   GET /transactions/:id  ◀│                            │
         │   ─→ { id, status, method }│                            │
```

### Directory structure

```
sample-paypal-direct/
├── server.js              # Express server (3 routes: /config, POST /transactions, GET /transactions/:id)
├── public/
│   └── index.html         # Single-page checkout + return view
├── config.example.json    # Committed Spider sandbox defaults
├── config.json            # Optional override (gitignored)
├── private_key.pem        # Gr4vy private key (gitignored)
├── package.json
├── README.md              # Human-facing teaching document
└── CLAUDE.md              # Working notes for AI assistants
```

### Key design patterns and principles

- **Server is a thin proxy.** Only the two Gr4vy calls that need the private key live server-side. Everything else is direct browser-to-Gr4vy.
- **Session-token boundary.** The `sessionToken` is the trust handoff from server to browser; the browser uses it once, against a single endpoint, and then talks to PayPal directly.
- **No client-side PayPal credentials.** `clientId`, `orderId`, `intent`, `currency`, `fundingSource` all come from Gr4vy's session endpoint per transaction.
- **Navigation, not fetch, for completion.** `default_completion_url` is a cross-origin 303 redirect chain; full-page navigation is the only reliable handler.
- **Branch on `?transaction_id=`.** The same `index.html` handles both pre-payment (render button) and post-payment (show status) by inspecting the URL.

---

## 7. Tools / Features

### Feature 1 — Server-side transaction creation

- **Endpoint:** `POST /transactions`
- **Body (optional):** `{ amount?, currency?, country? }` (defaults: `1299`, `"USD"`, `"US"`)
- **Behavior:** Calls `gr4vy.transactions.create` with `integrationClient: "web"` and `paymentMethod: { method: "paypal", country, currency, redirectUrl }`. Returns `{ transactionId, sessionToken }`.
- **Key requirement:** `country` and `currency` must be set on the `paymentMethod` object (not just the top level) — the SDK's Zod schema rejects without them.

### Feature 2 — Server-side transaction lookup

- **Endpoint:** `GET /transactions/:id`
- **Returns:** `{ id, status, method }`.
- **Used on:** the return-from-PayPal render path.

### Feature 3 — Config exposure

- **Endpoint:** `GET /config`
- **Returns:** `{ apiUrl }` — the resolved Gr4vy API base URL.
- **Reason:** The client needs to know the host to call the session endpoint directly.

### Feature 4 — Client-side PayPal session fetch

- Direct `fetch` against `${apiUrl}/transactions/:id/session?token=...`.
- Auth via the `token` query param; no SDK or private key client-side.
- Parses out `orderId`, `clientId`, `currency`, `intent`, `fundingSource`, `merchantId`, and `default_completion_url`.

### Feature 5 — PayPal JS SDK loader

- Builds a `URLSearchParams` with `client-id`, `currency`, conditionally `intent` and `merchant-id`.
- Injects `<script src="https://www.paypal.com/sdk/js?...">` and resolves on `onload`.
- **Critical:** Omit `merchant-id` if the session returns `merchantId: null`; passing `&merchant-id=null` causes a 400 from PayPal.

### Feature 6 — Smart Button renderer

- `paypal.Buttons({ fundingSource, createOrder, onApprove, onCancel, onError })`.
- `fundingSource` is resolved from the path string (`"paypal.FUNDING.PAYPAL"`) via `window.paypal.FUNDING[...]`.
- `createOrder` returns the pre-created `orderId` directly.
- `onApprove` navigates the browser to `default_completion_url`.

### Feature 7 — Return-path display

- On load, parse `?transaction_id` from the query string.
- If present, hide the button container and call `GET /transactions/:id` to render the final status.

---

## 8. Technology Stack

### Backend

| Component       | Version    | Purpose                                  |
| --------------- | ---------- | ---------------------------------------- |
| Node.js         | >= 20      | ESM runtime                              |
| Express         | ^4.21.1    | HTTP server, static file serving, JSON   |
| `@gr4vy/sdk`    | ^2.0.43    | Server-side Gr4vy API access (signed JWT)|

### Frontend

| Component         | Version  | Purpose                              |
| ----------------- | -------- | ------------------------------------ |
| Vanilla JS (ES2020+) | — (no build) | All client logic                |
| PayPal JS SDK     | Dynamic  | Smart Button rendering, order flow   |
| CSS               | Inline   | Light/dark via `prefers-color-scheme`|

### Third-party integrations

- **Gr4vy** — transaction lifecycle (`api.sandbox.{id}.gr4vy.app` or `api.{id}.gr4vy.app`).
- **PayPal** — checkout SDK from `https://www.paypal.com/sdk/js`.

### Explicitly *not* in the stack

- TypeScript, bundlers (webpack/vite/esbuild), frameworks (React/Vue), CSS frameworks (Tailwind/Bootstrap), test runners, linters as runtime dependencies, dotenv (config is a plain JSON file).

---

## 9. Security & Configuration

### Authentication / authorization

- **Server → Gr4vy:** JWT signed per request from `private_key.pem` via `@gr4vy/sdk`'s `withToken` helper.
- **Browser → Gr4vy session endpoint:** Short-lived `sessionToken` returned by `transactions.create`. Single-use against a single endpoint.
- **Browser → PayPal:** Standard PayPal JS SDK using the `clientId` Gr4vy provides per transaction.
- **No buyer auth.** The sample has no user accounts.

### Configuration

`config.json` (gitignored) overrides `config.example.json` (committed).

| Key                 | Default       | Purpose                                    |
| ------------------- | ------------- | ------------------------------------------ |
| `gr4vyId`           | `"spider"`    | Gr4vy account ID                           |
| `server`            | `"sandbox"`   | `"sandbox"` or `"production"`              |
| `merchantAccountId` | `"default"`   | Gr4vy merchant account                     |
| `privateKeyPath`    | `"./private_key.pem"` | Path to the Gr4vy private key      |
| `port`              | `3000`        | Express listen port                        |

### Gitignored

- `private_key.pem`
- `config.json`
- `.env`
- `node_modules/`

### Security scope

**In scope (modeled):**
- Private key isolation on the server.
- Session token as the only credential the browser sees, scoped to one transaction.

**Out of scope (intentionally):**
- CSRF protection on `POST /transactions`.
- Rate limiting.
- HTTPS termination (sample runs on `http://localhost`).
- CSP / SRI for the dynamically loaded PayPal SDK.
- Input validation beyond defaults (server trusts `amount`/`currency`/`country`).
- Production secret management (Vault, KMS, etc.).

### Deployment considerations

Sample is *not* deployment-ready. Switching `server: "production"` flips the API host, but a real production deployment would also need HTTPS, secret management, webhook handling, error reporting, and the usual hardening — none of which are in scope here.

---

## 10. API Specification

### `POST /transactions`

Create a Gr4vy PayPal transaction.

**Request**
```json
{
  "amount": 1299,
  "currency": "USD",
  "country": "US"
}
```

**Response 200**
```json
{
  "transactionId": "c5058557-5da3-4e35-b09d-f91146616a7b",
  "sessionToken": "eyJhbGciOi..."
}
```

**Response 500**
```json
{ "error": "string message" }
```

### `GET /transactions/:id`

Look up a transaction's current state.

**Response 200**
```json
{
  "id": "c5058557-5da3-4e35-b09d-f91146616a7b",
  "status": "authorization_succeeded",
  "method": "paypal"
}
```

### `GET /config`

Return the resolved Gr4vy API base URL so the client can call the session endpoint.

**Response 200**
```json
{ "apiUrl": "https://api.sandbox.spider.gr4vy.app" }
```

### Gr4vy session endpoint (called *directly* from the browser)

```
POST {apiUrl}/transactions/:id/session?token={sessionToken}
```

**Response 200 (shape)**
```json
{
  "session_data": {
    "orderId": "5O190127JK314159X",
    "clientId": "AegRgM...",
    "currency": "USD",
    "intent": "authorize",
    "fundingSource": "paypal.FUNDING.PAYPAL",
    "merchantId": null
  },
  "default_completion_url": "https://api.sandbox.spider.gr4vy.app/transactions/approve/<jwt-token>"
}
```

---

## 11. Success Criteria

### MVP success definition

A developer can clone the repo, drop in a Gr4vy sandbox private key, run `npm start`, complete a PayPal sandbox payment, and see the resulting transaction status — without reading the README first. Then, after reading the two source files top-to-bottom (under 5 minutes), they can articulate the five-step flow correctly.

### Functional requirements

- [x] `npm install && npm start` boots without errors against committed defaults.
- [x] PayPal Smart Button renders on initial page load.
- [x] Sandbox approval flow completes and returns to the page with `?transaction_id=`.
- [x] Final status renders (e.g. `authorization_succeeded` / `capture_succeeded`).
- [x] Cancellation shows `Cancelled by buyer.` and does not crash.
- [x] PayPal SDK errors surface as a single status line.
- [x] `config.json` override is picked up when present.
- [x] Production host is selected when `server: "production"`.

### Quality indicators

- Total source: ~100 lines server + ~150 lines client (including comments).
- No build step, no transpilation, no bundler.
- Comments document *why* (especially the landmines), not *what*.
- Zero runtime dependencies beyond Express and `@gr4vy/sdk`.

### User experience goals

- Time-to-first-button-render after `npm start`: under 5 seconds on a warm install.
- Time-to-complete-mental-model for a mid-level developer: under 10 minutes (read code + README "How it works").

---

## 12. Implementation Phases

> Note: this PRD is retroactive — the phases below describe how the existing sample was assembled and what would constitute follow-on work.

### Phase 1 — Server skeleton (done)

**Goal:** Stand up the Express server with the two Gr4vy-backed routes.

**Deliverables**
- [x] Express app with static file serving from `/public`.
- [x] Config loader (`config.json` || `config.example.json`).
- [x] Gr4vy SDK client constructed with `withToken`.
- [x] `POST /transactions` returning `{ transactionId, sessionToken }`.
- [x] `GET /transactions/:id` returning `{ id, status, method }`.
- [x] `GET /config` exposing `apiUrl`.

**Validation:** `curl -X POST localhost:3000/transactions` returns a valid Gr4vy transaction.

### Phase 2 — Client flow (done)

**Goal:** Wire the five-step flow on a single HTML page.

**Deliverables**
- [x] `createTransaction` → server.
- [x] `fetchPayPalSession` → Gr4vy session endpoint directly.
- [x] `loadPayPalSdk` with conditional `intent` and `merchant-id`.
- [x] `resolveFundingSource` helper.
- [x] `renderPayPalButton` with `createOrder` / `onApprove` / `onCancel` / `onError`.
- [x] Return-path branch in `init()` triggered by `?transaction_id=`.
- [x] Single `#status` element for all user-facing messages.

**Validation:** Complete a PayPal sandbox approval; URL on return contains `transaction_id` and `transaction_status`; status div displays the lookup result.

### Phase 3 — Documentation (done)

**Goal:** Make the sample teachable.

**Deliverables**
- [x] `README.md` with the ASCII flow diagram and the five-step walkthrough.
- [x] `CLAUDE.md` capturing the landmines so AI assistants don't reintroduce them.
- [x] Inline comments at each step in `index.html`.

**Validation:** A reader unfamiliar with the integration can paraphrase the flow correctly after one read.

### Phase 4 — Hardening (future, see §13)

**Goal:** Bridge the gap between sample and production reference.

**Deliverables (proposed, not in MVP)**
- [ ] Webhook receiver example.
- [ ] Optional 3DS handling.
- [ ] Optional capture-on-authorization server route.
- [ ] CSRF token on `POST /transactions`.

**Validation:** Webhook-confirmed status matches the redirect query string under normal flow; webhooks survive a forced network drop on the redirect.

---

## 13. Future Considerations

- **Webhook companion sample.** A second small route receiving Gr4vy transaction webhooks and reconciling them against the redirect-based status the sample currently relies on.
- **Capture-after-authorize variant.** Show the merchant-initiated capture call for `intent=authorize` connectors.
- **Variants for other methods.** Sibling repos (`sample-applepay-direct`, `sample-googlepay-direct`, `sample-card-direct`) following the same minimal-two-files pattern.
- **Multi-currency demo.** Toggle on the page to flip currency/country and re-create the transaction.
- **Framework adaptations.** Forks in React/Next/Vue showing how to slot the same flow into a SPA without losing the navigation step.
- **CI smoke test.** Headless run that exercises the Spider sandbox end-to-end on every PR.

---

## 14. Risks & Mitigations

| Risk                                                                                  | Mitigation                                                                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sample drift from Gr4vy API behavior** (e.g. session response shape changes)        | Pin `@gr4vy/sdk` to a known-good range; document the expected session response shape in the README; revisit the sample on each Gr4vy major release. |
| **Developers copy the sample's no-CSRF / no-rate-limit posture into production**      | Explicit "Things worth knowing" + "Out of scope" sections in README and PRD; the sample is positioned as a teaching artifact, not a starter kit.    |
| **PayPal SDK breaking changes** (e.g. funding source path strings, intent validation) | The known landmines are captured in `CLAUDE.md` and code comments; the `resolveFundingSource` helper is isolated for easy patching.                 |
| **Spider sandbox unavailable during demos**                                           | `config.json` override is trivial; document how to point at a private sandbox in seconds.                                                            |
| **AI assistants expanding the sample's scope** (frameworks, error UI, abstractions)   | `CLAUDE.md` explicitly forbids scope expansion and lists the constraints; this PRD reinforces the boundary.                                          |

---

## 15. Appendix

### Related documents

- `README.md` — human-facing teaching document with the ASCII flow diagram and per-step code excerpts.
- `CLAUDE.md` — working notes for AI assistants editing this repo; codifies stack constraints and the known landmines.

### Key dependencies

- **Gr4vy Node SDK** — `@gr4vy/sdk` (https://www.npmjs.com/package/@gr4vy/sdk)
- **Express** — `express` ^4.21.1
- **PayPal JS SDK** — loaded dynamically from `https://www.paypal.com/sdk/js`

### Repository structure

```
sample-paypal-direct/
├── CLAUDE.md
├── PRD.md                  ← this document
├── README.md
├── config.example.json
├── package.json
├── public/
│   └── index.html
└── server.js
```

### Assumptions made while writing this PRD

- The MVP is the *current* state of `main` as of 2026-05-15; "future considerations" reflect plausible follow-ups, not committed roadmap items.
- Target users were inferred from the README's tone and the explicit "read end-to-end in a few minutes" framing in `CLAUDE.md`.
- "Success criteria" were inferred from the implicit goal of a reference sample: time-to-comprehension and faithful reproduction of the integration's hard parts.
