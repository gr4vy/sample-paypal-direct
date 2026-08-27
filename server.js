// Minimal Express server for the Gr4vy + PayPal *standalone* session sample.
//
// The point of this sample: render the PayPal Smart Button on page load with
// ZERO transactions created. The transaction (and PayPal order) is created
// lazily, only when the buyer clicks, inside PayPal's createOrder callback.
//
// Three responsibilities:
//   1. Serve the static checkout page from /public.
//   2. GET  /paypal-session   -> standalone PayPal session (no transaction).
//   3. POST /transactions     -> create the transaction lazily on click,
//      GET  /transactions/:id -> fetch its status on return.
//
// Venmo rides the same /transactions route (method: "venmo" instead of
// "paypal"). It needs no standalone session, but it does need the same
// per-transaction session step PayPal uses — the connector creates the
// PayPal order eagerly, so that call just hands back its orderId. The
// browser then drives PayPal's v6 Web SDK directly — see public/index.html.
//
// The standalone session endpoint (POST /payment-services/{id}/sessions)
// requires a full Gr4vy bearer token (scope transactions.write), so — unlike
// the per-transaction session endpoint — it must be called server-side where
// the private key lives. We proxy it through the Gr4vy SDK.

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Gr4vy, withToken } from "@gr4vy/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config ---------------------------------------------------------------
// config.json (gitignored) wins; config.example.json is the committed default
// so the sample boots out of the box.
const cfgPath = fs.existsSync(path.join(__dirname, "config.json"))
  ? path.join(__dirname, "config.json")
  : path.join(__dirname, "config.example.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

// `local: true` points the whole sample at a core-api you're running
// yourself (`make server` in core-api, http://localhost:8000) instead of a
// hosted Gr4vy environment — handy for testing against connector changes
// that aren't deployed to sandbox yet. Defaults to false.
const apiUrl = cfg.local
  ? "http://localhost:8000"
  : cfg.server === "production"
    ? `https://api.${cfg.gr4vyId}.gr4vy.app`
    : `https://api.sandbox.${cfg.gr4vyId}.gr4vy.app`;

// --- Gr4vy SDK client -----------------------------------------------------
// `withToken` signs a JWT from the private key on each request. serverURL
// takes the already-resolved apiUrl directly, so this one client works the
// same way whether it's talking to sandbox, production, or local core-api.
const gr4vy = new Gr4vy({
  serverURL: apiUrl,
  merchantAccountId: cfg.merchantAccountId,
  bearerAuth: withToken({
    privateKey: fs.readFileSync(cfg.privateKeyPath, "utf8"),
  }),
});

// --- HTTP server ----------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Tells the client which Gr4vy API base URL to call directly for the
// frontend-only per-transaction session endpoint (used in createOrder).
app.get("/config", (_req, res) => {
  res.json({ apiUrl });
});

// Standalone PayPal session — returns the connector-held clientId and
// merchantId WITHOUT creating a transaction or calling PayPal. This is what
// lets the button render on page load with no side effects. The client picks
// currency, intent, and funding source itself when loading the SDK.
app.get("/paypal-session", async (_req, res) => {
  try {
    const session = await gr4vy.paymentServices.session({}, cfg.paymentServiceId);
    // session.responseBody is { clientId, merchantId } — no orderId.
    res.json(session.responseBody ?? {});
  } catch (err) {
    console.error("paymentServices.session failed:", err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Create a PayPal or Venmo transaction in direct/web integration mode.
// Called lazily from the browser when the buyer clicks a button. Both
// methods hand back the same two things — the transaction id and a
// short-lived sessionToken the browser uses to fetch the per-transaction
// session (orderId + default_completion_url) directly from the Gr4vy API.
// Venmo's order already exists by the time this returns (the connector
// creates it eagerly), but the session step is still how the browser learns
// its orderId — same endpoint, same shape, as the PayPal flow.
app.post("/transactions", async (req, res) => {
  const {
    amount = 1299,
    currency = "USD",
    country = "US",
    intent = "capture",
    method = "paypal",
  } = req.body ?? {};
  try {
    const tx = await gr4vy.transactions.create({
      amount,
      currency,
      country,
      // Mirror the intent the client loaded the SDK with. Note the PayPal
      // order's intent is ultimately governed by your PayPal connection's
      // configuration, so the SDK intent must match that connection setting.
      intent,
      integrationClient: "web",
      paymentMethod: {
        method,
        country,
        currency,
        // Where Gr4vy will send the buyer after the PayPal/Venmo flow completes.
        redirectUrl: `http://localhost:${cfg.port}/?return=1`,
      },
    });
    res.json({ transactionId: tx.id, sessionToken: tx.sessionToken });
  } catch (err) {
    console.error("transactions.create failed:", err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Look up a transaction's latest status, used by the page to display the
// result after the buyer returns from PayPal.
app.get("/transactions/:id", async (req, res) => {
  try {
    const tx = await gr4vy.transactions.get(req.params.id);
    res.json({ id: tx.id, status: tx.status, method: tx.method });
  } catch (err) {
    console.error("transactions.get failed:", err);
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.listen(cfg.port, () => {
  console.log(`Sample listening on http://localhost:${cfg.port}`);
  console.log(`Using Gr4vy API at ${apiUrl} (merchant=${cfg.merchantAccountId})`);
});
