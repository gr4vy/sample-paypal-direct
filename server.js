// Minimal Express server for the Gr4vy + PayPal direct-mode sample.
//
// Two responsibilities:
//   1. Serve the static checkout page from /public.
//   2. Wrap two Gr4vy API calls so the client never sees the private key:
//        POST /transactions  -> creates the PayPal transaction
//        GET  /transactions/:id -> fetches its current status

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
// frontend-only session endpoint.
app.get("/config", (_req, res) => {
  res.json({ apiUrl });
});

// Create a PayPal transaction in direct/web integration mode. The response
// hands the client back two things:
//   - transactionId: the Gr4vy transaction we just created
//   - sessionToken:  a short-lived token the client uses to fetch the
//                    PayPal session data (orderId, clientId, ...) directly
//                    from the Gr4vy API
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
