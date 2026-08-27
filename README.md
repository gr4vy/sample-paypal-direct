# Gr4vy + PayPal direct mode — sample app

A minimal end-to-end example of rendering PayPal's **in-context Smart Button**
on the web with **zero transactions created until the buyer clicks**. The
merchant fetches PayPal's client configuration from a Gr4vy **standalone
session** (no transaction, no PayPal API call), loads the PayPal JS SDK, and
renders the button on page load. The Gr4vy transaction and PayPal order are
created lazily, only when the buyer clicks, inside PayPal's `createOrder`
callback.

The whole sample is ~120 lines of server code, ~150 lines of client JS, and
one HTML file. Read it top-to-bottom and you should have a complete mental
model of the integration.

---

## What you get

```
sample-paypal-direct/
├── server.js              # Express server (session proxy + create + get)
├── public/index.html      # Checkout page + PayPal Smart Button
├── config.example.json    # Committed defaults (Spider sandbox)
├── config.json            # Your overrides (gitignored)
├── private_key.pem        # Gr4vy API private key (gitignored)
└── package.json
```

## Prerequisites

- **Node 20+**
- A Gr4vy private key with API access to your sandbox account
- A PayPal sandbox connection configured in your Gr4vy dashboard
- The **payment service ID** of that PayPal connection (looks like
  `ps_...` / a UUID) — copy it into `config.json` as `paymentServiceId`

## Running it

```sh
npm install
# put your Gr4vy private key at ./private_key.pem
# copy config.example.json to config.json and set paymentServiceId
npm start
```

Open <http://localhost:3000>. The PayPal button renders on page load **without
creating a transaction**. Click it, approve with a PayPal sandbox buyer
account, and you'll be sent back to the page showing `status:
authorization_succeeded` (or `capture_succeeded`, depending on your PayPal
connection's configured intent). Exactly one transaction is created — at click
time.

By default the sample uses the `spider` sandbox
(`https://api.sandbox.spider.gr4vy.app`) and the `default` merchant account.
To point at a different Gr4vy environment, copy `config.example.json` to
`config.json` and edit. You **must** set `paymentServiceId` either way.

Set `"local": true` in `config.json` to point the whole sample — the SDK
client and the browser's per-transaction session calls — at a core-api
you're running yourself (`make server` in `core-api`, `http://localhost:8000`)
instead of a hosted Gr4vy environment. Useful for testing against connector
changes that aren't deployed to sandbox yet.

---

## How it works, step by step

```
   Your server                  Your browser                 PayPal
   ─────────────                ──────────────              ──────────
        │                            │                          │
   1.   │  GET /paypal-session  ◀────│  (on page load)          │
        │  proxies POST             │                          │
        │  /payment-services/       │                          │
        │  {id}/sessions            │                          │
        │   ──→ clientId,           │                          │
        │       merchantId          │                          │
        │       (NO orderId)        │                          │
        │                            │                          │
        │                       2.   │  GET paypal.com/sdk/js  │
        │                            │   ──────────────────────▶│
        │                            │   render Smart Button    │
        │                            │   (still no transaction) │
        │                            │                          │
        │                       3.   │  buyer clicks ──┐        │
        │  POST /transactions   ◀────│  createOrder:   │        │
        │   ──→ id + sessionToken    │                 │        │
        │                            │  POST /transactions/    │
        │                            │  :id/session?token=...  │
        │                            │   ←── orderId,          │
        │                            │       defaultCompletionUrl
        │                            │   return orderId ───────▶│
        │                            │                          │
        │                       4.   │  buyer approves ◀───────▶│
        │                       5.   │  navigate to             │
        │                            │  defaultCompletionUrl    │
        │                            │   ←── 303 redirect to    │
        │                            │       /?transaction_id=  │
        │   GET /transactions/:id   ◀│                          │
        │   ──→ returns status       │                          │
```

### Step 1 — Fetch the standalone session (server proxy, on page load)

The standalone session endpoint returns the connector-held `clientId` and
`merchantId` without creating a transaction or calling PayPal. Unlike the
per-transaction session (step 3), it requires a **full Gr4vy bearer token**
(scope `transactions.write`), so it must be called server-side where the
private key lives. The SDK exposes it as `gr4vy.paymentServices.session`:

```js
// server.js
const session = await gr4vy.paymentServices.session({}, cfg.paymentServiceId);
res.json(session.responseBody);
```

You get back just the two ids:

```json
{
  "clientId": "AegRgM...",
  "merchantId": null
}
```

### Step 2 — Load the SDK and render the button (client, on page load)

Inject the PayPal JS SDK using the `clientId` from the session, then render the
Smart Button. **No transaction exists yet.** You choose the `currency` and
`intent` yourself — they are not part of the session. The `intent` must match
your PayPal connection's configured intent (see "Things worth knowing").
`merchant-id` is only needed for multi-party / marketplace setups; omit it when
the session returns `merchantId` as `null`.

```js
const params = new URLSearchParams({ "client-id": clientId, currency: CURRENCY });
params.set("intent", INTENT);
if (merchantId) params.set("merchant-id", merchantId);
// inject <script src="https://www.paypal.com/sdk/js?...">
```

### Step 3 — Create the order lazily, on click (`createOrder`)

This is the only place a transaction is created. When the buyer clicks,
`createOrder` creates the Gr4vy transaction (server), exchanges the session
token for the per-transaction session (browser), and returns the `orderId`:

```js
createOrder: async () => {
  // server creates the transaction (needs the private key)
  const { transactionId, sessionToken } = await createTransaction();
  // browser fetches the per-transaction session for the orderId
  const { session_data, default_completion_url } =
    await fetchTxSession(apiUrl, transactionId, sessionToken);
  defaultCompletionUrl = default_completion_url;
  return session_data.orderId;
}
```

### Step 4 / 5 — Approve and finalise (browser navigation)

When the buyer approves, **navigate the browser to `default_completion_url` —
don't fetch it.** It 303-redirects back to your `redirect_url` with the
transaction id and status appended:

```
http://localhost:3000/?return=1
  &transaction_id=c5058557-5da3-4e35-b09d-f91146616a7b
  &transaction_status=authorization_succeeded
```

On the return page, pick up `transaction_id` and call your server to display
the result.

---

## Venmo — a second path, on PayPal's v6 Web SDK

The page also renders a **Pay with Venmo** button. It skips step 1 (no
standalone session — nothing to fetch before the buyer clicks) and replaces
step 2's classic Smart Button with PayPal's **v6 Web SDK**
(`web-sdk/v6/core`), a different, instance-based API
(`createInstance` → `createVenmoOneTimePaymentSession` → `.start()`) loaded
lazily on click and driven directly on this page.

This is a deliberate choice: Gr4vy's connector repo ships its own hosted
`paypal/venmo.html` that also runs the v6 SDK, but that page is a sandbox
testing surface for the connector team, not a merchant integration pattern —
so this sample runs the SDK itself instead of redirecting to it.

The Venmo connector creates the PayPal order *eagerly*, inside
`POST /transactions`, so step 3's per-transaction session call — the exact
same endpoint the PayPal flow already uses — just hands back that order's
`orderId` instead of a fresh one, plus the same `default_completion_url`
used in step 4:

```js
async function payWithVenmo() {
  const { transactionId, sessionToken } = await createTransaction({ method: "venmo" });
  const { session_data, default_completion_url } =
    await fetchTxSession(apiUrl, transactionId, sessionToken);

  await loadVenmoSdk(); // https://www.sandbox.paypal.com/web-sdk/v6/core
  const sdkInstance = await window.paypal.createInstance({
    clientId: session_data.clientId,
    clientMetadataId: crypto.randomUUID(),
    components: ["venmo-payments"],
    pageType: "checkout",
  });

  const venmoSession = sdkInstance.createVenmoOneTimePaymentSession({
    onApprove: () => window.location.assign(default_completion_url),
    onCancel: () => { /* append ?cancel=true to default_completion_url */ },
    onError: (err) => setStatus(`Venmo error: ${err}`, "err"),
  });

  await venmoSession.start(
    { presentationMode: "auto", sandboxSupport: { enabled: true } },
    Promise.resolve({ orderId: session_data.orderId }),
  );
}
```

`sandboxSupport: { enabled: true }` and the `sandbox.paypal.com` SDK host are
sandbox-only — drop the former and swap to `www.paypal.com/web-sdk/v6/core`
for production.

Requires a Venmo-enabled PayPal connection configured in your Gr4vy
dashboard (Venmo is US buyers, USD only). No extra config on this sample —
Gr4vy routes `method: "venmo"` to that connection automatically, the same way
it already routes `method: "paypal"`.

---

## Things worth knowing

- **The standalone session creates nothing.** No transaction, no PayPal order,
  no PayPal API call — it's a pure read of the connector's config. The button
  renders on load with no side effects; the dashboard stays free of pending
  transactions for buyers who never click.
- **The standalone session needs a server.** It's authed by a private-key
  bearer token, so the browser can't call it directly. The per-transaction
  session (step 3) is the one that's safe to call from the browser, authed by
  the short-lived `sessionToken`.
- **The session returns only `clientId` and `merchantId`.** Currency, intent,
  and funding source aren't in it — you supply them client-side.
- **`intent` is governed by your PayPal connection.** The PayPal order's intent
  is set by the connection's configuration in Gr4vy (authorize or capture), not
  by the transaction. Load the SDK with the matching `intent`, or PayPal
  rejects the order on click (`Expected intent ... got authorize`). The spider
  sandbox connection is set to `authorize`.
- **Omit `merchant-id` when `merchantId` is null.** Including
  `&merchant-id=null` causes a 400 from `paypal.com/sdk/js`.
- **The funding source is `paypal.FUNDING.PAYPAL`** — resolve it via
  `window.paypal.FUNDING[...]` before passing to `paypal.Buttons`.
- **Webhooks are recommended for production.** This sample relies on the
  redirect-back to know the result, which is fine for a demo but can drop on
  network errors. In production, listen for transaction webhooks and treat the
  redirect as a UI hint, not the source of truth.

---

## Reading order

1. **`server.js`** — the `/paypal-session` proxy and the lazy
   `transactions.create`.
2. **`public/index.html`** — the comment block at the top of `<script>` lists
   the five steps; the functions below follow the same numbering.
3. This README's "How it works" section for the why behind each step.
