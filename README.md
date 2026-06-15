# Gr4vy + PayPal direct mode — sample app

A minimal end-to-end example of Gr4vy's **PayPal direct integration** flow on
the web: the merchant loads the PayPal JS SDK on their own checkout page and
renders the PayPal Smart Button, while Gr4vy handles the underlying
order/authorisation/capture lifecycle.

The whole sample is ~100 lines of server code, ~100 lines of client JS, and
one HTML file. Read it top-to-bottom and you should have a complete mental
model of the integration.

> **Looking for the no-transaction-on-load / one-click variant?** See
> [`standalone/`](standalone/), which renders the button from a standalone
> payment-service session and creates the transaction lazily on click.

---

## What you get

```
sample-paypal-direct/
├── server.js              # Express server (two routes: create + get)
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

## Running it

```sh
npm install
# put your Gr4vy private key at ./private_key.pem
npm start
```

Open <http://localhost:3000>. The PayPal button renders on page load. Click
it, approve with a PayPal sandbox buyer account, and you'll be sent back to
the page showing `status: authorization_succeeded` (or `capture_succeeded`,
depending on the connector's configured intent).

By default the sample uses the `spider` sandbox
(`https://api.sandbox.spider.gr4vy.app`) and the `default` merchant account.
To point at a different Gr4vy environment, copy
`config.example.json` to `config.json` and edit.

---

## How it works, step by step

The PayPal direct integration on Gr4vy is a five-step dance between three
parties: your server, your browser, and PayPal.

```
   Your server                  Your browser                 PayPal
   ─────────────                ──────────────              ──────────
        │                            │                          │
   1.   │  POST /transactions  ◀────│                          │
        │  (Gr4vy SDK)              │                          │
        │   ──→ returns id +        │                          │
        │       sessionToken        │                          │
        │                            │                          │
        │                       2.   │  POST /transactions/    │
        │                            │  :id/session?token=...  │
        │                            │  (Gr4vy API direct)     │
        │                            │   ←── orderId, clientId │
        │                            │       currency, intent, │
        │                            │       defaultCompletionUrl
        │                            │                          │
        │                       3.   │  GET paypal.com/sdk/js  │
        │                            │   ──────────────────────▶│
        │                            │                          │
        │                       4.   │   render Smart Button    │
        │                            │   buyer clicks, approves │
        │                            │   ◀─────────────────────▶│
        │                            │                          │
        │                       5.   │  navigate to             │
        │                            │  defaultCompletionUrl    │
        │                            │   ←── 303 redirect to    │
        │                            │       /?transaction_id=  │
        │                            │       ...               │
        │   GET /transactions/:id   ◀│                          │
        │   ──→ returns status       │                          │
```

### Step 1 — Create the transaction (server)

Use the Gr4vy SDK on your server to create a PayPal transaction with
`integrationClient: "web"`. The `redirectUrl` is where the buyer will end up
after the flow finishes.

```js
// server.js
const tx = await gr4vy.transactions.create({
  amount: 1299,
  currency: "USD",
  country: "US",
  integrationClient: "web",
  paymentMethod: {
    method: "paypal",
    country: "US",
    currency: "USD",
    redirectUrl: "http://localhost:3000/?return=1",
  },
});
// Pass these two values to the client.
res.json({ transactionId: tx.id, sessionToken: tx.sessionToken });
```

> **Why the SDK?** Creating a transaction needs your Gr4vy private key — keep
> that on the server. Everything from step 2 onwards is safe to do from the
> browser.

### Step 2 — Exchange the session token for PayPal session data (client)

Hit Gr4vy's session endpoint directly from the browser, using the
short-lived `sessionToken` from step 1 as auth. No SDK or private key needed
here — that's the whole point of this endpoint.

```js
// public/index.html
const url =
  `${apiUrl}/transactions/${transactionId}/session?token=${sessionToken}`;
const { session_data, default_completion_url } =
  await (await fetch(url, { method: "POST" })).json();
```

You get back something like:

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

### Step 3 — Load the PayPal JS SDK (client)

Inject a `<script>` tag using the `clientId`, `currency`, and `intent` from
the session. **`intent` is required** — PayPal refuses to render if it
doesn't match the order's intent. `merchant-id` is only needed for
multi-party / marketplace setups; omit it when the session returns `null`.

```js
const params = new URLSearchParams({
  "client-id": clientId,
  currency,
  intent,              // "authorize" or "capture"
});
const s = document.createElement("script");
s.src = `https://www.paypal.com/sdk/js?${params}`;
document.head.appendChild(s);
```

### Step 4 — Render the Smart Button (client)

Once the SDK is loaded, render the button. `createOrder` just returns the
`orderId` Gr4vy already gave you (Gr4vy created the order at PayPal for you
in step 1).

```js
window.paypal.Buttons({
  fundingSource: window.paypal.FUNDING.PAYPAL,
  createOrder: () => orderId,
  onApprove: () => {
    // See step 5
    window.location.assign(default_completion_url);
  },
}).render("#paypal-button-container");
```

> **About `fundingSource`:** Gr4vy returns it as a path string like
> `"paypal.FUNDING.PAYPAL"`. Resolve it via `window.paypal.FUNDING[...]`
> before passing it to the SDK.

### Step 5 — Finalise the transaction (browser navigation)

When the buyer approves, **navigate the browser to `default_completion_url`
— don't fetch it.** The URL is designed to 303-redirect back to your
`redirect_url` with the transaction id and status appended as query params:

```
http://localhost:3000/?return=1
  &transaction_id=c5058557-5da3-4e35-b09d-f91146616a7b
  &transaction_status=authorization_succeeded
```

Trying to `fetch` it cross-origin is fragile (the redirect chain crosses
origins) and is what the SDK warns about when you see `Failed to fetch`.

On the return page, pick up `transaction_id` from the query string and call
your server to display the result:

```js
const txId = new URLSearchParams(location.search).get("transaction_id");
if (txId) {
  const tx = await (await fetch(`/transactions/${txId}`)).json();
  showStatus(tx.status);
}
```

---

## Things worth knowing

- **Authorize vs capture.** The intent is set on the Gr4vy connection in the
  dashboard. The session data tells you which one applies; pass that exact
  value as `intent` in the SDK URL.
- **Webhooks are recommended for production.** This sample relies on the
  redirect-back to know the result, which is fine for a demo but can drop on
  network errors. In production, listen for transaction webhooks and treat
  the redirect as a UI hint, not the source of truth.
- **No PayPal credentials in the client.** Everything PayPal-related
  (`clientId`, `orderId`) comes from Gr4vy's session endpoint. Gr4vy holds
  the merchant's PayPal credentials.
- **Production URLs.** Swap `https://api.sandbox.{id}.gr4vy.app` for
  `https://api.{id}.gr4vy.app` and point the PayPal SDK at live by changing
  the `intent`/`environment` on your Gr4vy connection. The sample switches
  hosts automatically when you set `server: "production"` in config.

---

## Reading order

If you're learning the integration:

1. **`server.js`** — see the SDK constructor and how `transactions.create` is
   called.
2. **`public/index.html`** — the comment block at the top of `<script>` lists
   the five steps in order; the functions below follow the same numbering.
3. This README's "How it works" section for the why behind each step.
