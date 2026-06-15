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

const apiUrl =
  cfg.server === "production"
    ? `https://api.${cfg.gr4vyId}.gr4vy.app`
    : `https://api.sandbox.${cfg.gr4vyId}.gr4vy.app`;

// --- Gr4vy SDK client -----------------------------------------------------
// `withToken` signs a JWT from the private key on each request.
const gr4vy = new Gr4vy({
  id: cfg.gr4vyId,
  server: cfg.server,
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

// Create a PayPal transaction in direct/web integration mode. Called lazily
// from the browser inside createOrder when the buyer clicks the button. The
// response hands the client back two things:
//   - transactionId: the Gr4vy transaction we just created
//   - sessionToken:  a short-lived token the client uses to fetch the
//                    per-transaction session (orderId, default_completion_url)
//                    directly from the Gr4vy API
app.post("/transactions", async (req, res) => {
  const { amount = 1299, currency = "USD", country = "US" } = req.body ?? {};
  try {
    const tx = await gr4vy.transactions.create({
      amount,
      currency,
      country,
      integrationClient: "web",
      paymentMethod: {
        method: "paypal",
        country,
        currency,
        // Where Gr4vy will send the buyer after the PayPal flow completes.
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
