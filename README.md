# ScopePay

From “one small change” to a clear agreement and a paid invoice.

[MIT licensed](LICENSE). Built for the PayPal AI Hackathon.

[Live application demo (2:09)](https://youtu.be/a2qJRjY1gGg) · [Devpost submission](https://devpost.com/software/scopepay-1c497s)

The demo records real local model inference, company/client approvals, delivery tracking and PayPal sandbox calls. Processing waits are explicitly shortened.

A local project workspace for agreeing scope before work starts, tracking delivery against a company budget, and preserving client-approved scope changes.

## Run

Requires Node 22.13+ (tested on 22.22) and [Ollama](https://ollama.com/download) for local model inference. The demonstrated model is Qwen3 4B; allow roughly 3 GB disk for weights and sufficient free memory (tested on Apple M1). No paid API account or subscription is used.

Start Ollama with cloud features disabled in a separate terminal:

```sh
OLLAMA_NO_CLOUD=1 ollama serve
```

If the Ollama desktop service is already running, quit it first before starting this command. In another terminal, download the model once:

```sh
ollama pull qwen3:4b
```

```sh
git clone https://github.com/nikmlnkr/scopepay.git
cd scopepay
npm ci
npm run dev
```

Open http://127.0.0.1:4177. Scope review calls the downloaded Qwen3 model through Ollama on this computer. No AI API key or paid subscription is needed. If Ollama is unavailable, review fails visibly; there is no cloud or rules fallback. Without PayPal configuration, invoices are explicitly simulated. To test PayPal sandbox invoicing, follow [the integration guide](docs/INTEGRATIONS.md).

The app binds only to loopback. The database is `.data/demo.sqlite`, excluded from source control. The front end uses system fonts and makes no external font requests.

## Company and client walkthrough

1. Sign up as **Company / Vendor** using a test email and a unique test password (at least 10 characters). The first company account receives the synthetic starter project.
2. On the dashboard, create a project with client name, optional client account email, and internal delivery budget. The email routes invitations to that customer's dashboard; no email is sent.
3. Define scope summary, exclusions, delivery date, revision allowance, and deliverables. Each deliverable has acceptance criteria, a client price, and a private internal cost estimate.
4. Save and review the scope review findings. Create the client approval link. Work is locked before acceptance.
5. Sign out and sign up as **Customer / Client** using the email specified on the project. The project appears on the client dashboard. If no client email was specified, open the private approval link; the first responding client becomes associated with the record. Use separate browser profiles for simultaneous company/client sessions; tabs in one browser share a login.
6. Client reviews and accepts the exact scope version. Only then do deliverables unlock for the company. The accepted baseline is immutable in the application.
7. Company updates deliverable status and cumulative actual internal costs. Client sees progress, scope and agreed prices, never internal estimates, actual costs, or budget ceilings.
8. Paste a change request, one item per line. Scope review compares the request with approved deliverables, exclusions, and previously accepted changes, and flags ambiguity for clarification. The seller explicitly selects included/extra/clarification, an exact baseline excerpt, reasoning, work criteria, and extra price/estimate.
9. Share the reviewed change. Client approval adds only extras to delivery tracking and the agreed price. The original baseline stays intact. Included and unclear items are unpriced. Only one pending change at a time is supported.
10. Create an invoice for an accepted paid change. With PayPal configured, open the sandbox checkout and select **Check payment status** after payment. Without configuration, the UI explicitly labels simulated invoices and provides demo-only status controls. Repeat creation returns the stored invoice.
11. Both dashboards retain versioned agreement records and can download JSON evidence records without private costs or approval tokens.

## Budget behavior

Client agreed price and internal delivery budget are separate. Internal forecast is the sum of `max(estimated cost, actual cost)` per deliverable. Remaining budget is ceiling minus forecast. Actual costs can be logged even when over budget, making overruns visible. Sharing initial scope or additional scope is blocked when its forecast exceeds the current budget. Vendors may explicitly adjust their internal ceiling; the change is audited. This is a planning control, not a bank balance or enforcement of real-world spending.

## Implementation and boundaries

React + Vite, Node HTTP server, SQLite. JavaScript modules; not TypeScript. Projects are stored as isolated JSON records with vendor ownership. Passwords use salted scrypt hashes. Random session tokens are hashed in SQLite, expire after 24 hours, and are carried in HttpOnly/SameSite=Strict cookies. Same-origin writes and host validation protect the loopback API. Role checks run server-side; customer responses explicitly project public fields. Local HTTP means cookies are not marked Secure; HTTPS/Secure cookies are required before hosting.

Approval tokens are random, version-bound and expire after seven days. Saving an initial draft revokes its pending link. Accepted records stay inspectable on the authenticated client dashboard after link expiry. Snapshots have SHA-256 content fingerprints. These are not certified signatures or tamper-proof legal evidence: the local database administrator could change stored data. Client full name is entered by the user, not identity-verified.

**Not production-ready.** No email verification, password recovery, MFA, invitation delivery, multi-user organization membership, comprehensive abuse controls, or public deployment. Email routing is appropriate only for this local prototype until verified email ownership is implemented. Each account has one fixed role; use distinct local test accounts for both roles. Company costs and credentials must never be added to client exports.

**Scope review uses local Qwen3:4b inference through Ollama. PayPal sandbox is available when configured.** The model reviews saved scope and compares client requests against approved scope and accepted changes. Humans review classifications and set all prices. Sandbox statuses are verified by server-side PayPal reads; no live payments, customer validation or production availability is claimed. See `docs/INTEGRATIONS.md` for future integration requirements.

The original prototype workspace is preserved in the old SQLite workspace table and privately archived with the starter project; it is not presented as a newly approved baseline. The old public workspace endpoints have been removed. Old prototype approval URLs are replaced by the authenticated review flow. `server/domain.js` and its tests remain as regression references for the initial prototype; active business logic is in `server/projects.js` and `server/auth.js`.

## Validation

```sh
npm test
npm run build
npm run test:browser
```

Unit/HTTP tests cover baseline locking, stale links, integer money, source evidence, budget gates, accepted changes, invoice retries, role ownership, private cost projection, same-origin checks and restart persistence. Browser tests use installed Google Chrome, isolated company/client sessions, an in-memory database on port 4178, and desktop/mobile layouts. HTTP tests use temporary SQLite on port 4191. Screenshots are in `test-results/`.

### PayPal sandbox account setup

Sandbox credentials and test seller/buyer accounts are configured locally. Run `npm run check:paypal` to verify OAuth and read-only invoice access; details and local credential locations are in `docs/INTEGRATIONS.md`. Set `PAYPAL_MODE=sandbox` to enable the invoice adapter. Existing mock invoices stay simulated; new accepted changes can create sandbox invoices. Never publish `.env` or `.data/`.

### Sandbox invoicing flow

With `PAYPAL_MODE=sandbox` and the four sandbox variables in `.env`, restart `npm run dev`. Approve an initial scope and then an additional paid change. In Scope changes, select **Create PayPal sandbox invoice**, open its payment link, and sign in with the sandbox buyer. Select **Check payment status** afterward. The customer project dashboard also shows invoices and can refresh their status.

All sandbox invoices use the configured test buyer, regardless of the local client's email. The UI discloses this before creation. The single configured seller represents the demo company; this is not a multi-merchant authorization system. Only accepted change fees are invoiced; initial baseline fees are not invoiced by this feature. PayPal send requests suppress recipient and invoicer notification flags. No live API host is supported.

Creation intent is saved before dispatch. Requests with uncertain outcomes reconcile by stored invoice number; they never blindly create again. Invoice IDs, seller, recipient, accepted snapshot reference, currency and total are checked before accepting status. A failed or mismatched check leaves the last verified state unchanged. Status refresh uses explicit polling, not webhooks. Existing simulated invoices cannot be converted into sandbox invoices.

### Scope review — local AI at runtime

Both **Review saved scope** and **Compare with approved scope** invoke `server/ai.js` through the authenticated Node server. It calls only `http://127.0.0.1:11434/api/chat` with Qwen3:4b, structured JSON output, temperature 0 and no tools. Model output includes a summary, classifications, reasons, evidence and clarification questions. The result displays the model name and is saved with a timestamp and source fingerprint.

Evidence must match an exact supplied source. Unsupported or uncertain findings become clarification. Additional deterministic guards downgrade conflicts, unknown revision usage and instruction-like requests to clarification; they never replace the model call or create chargeable classifications. Conflicting clauses can still be missed by a small model, so all findings require human review. No model output sets a price, approves a scope or triggers a payment. Internal costs, credentials and user-account fields are excluded from the inference payload.

Scope review can take tens of seconds on local hardware; first use loads the model. The server blocks overlapping mutations to that project while inference runs, so a completed result cannot overwrite concurrent approvals or scope edits. Timeout, missing model, invalid JSON and invented evidence fail visibly without saving a proposal. Cloud providers are rejected even if API keys are present. Use `OLLAMA_NO_CLOUD=1` when starting Ollama; do not expose port 11434 publicly.

Optional `.env` settings: `AI_PROVIDER=ollama` and `OLLAMA_MODEL=qwen3:4b` (both are the defaults). `npm run dev` starts ScopePay only; Ollama must already be running. Judges running the repository locally need the model installed on that host. A future hosted deployment would run inference on the server so visitors would only need a browser.

Run real local-model checks separately from fixture tests:

```sh
npm run evaluate:ai
```

This checks scope readiness, included work, explicit extras, ambiguity, revision uncertainty, instruction attacks, accepted additions and conflicting clauses with synthetic data. The JSON report is saved privately in `.data/setup/ai-evaluation.json`. Normal `npm test` uses fixtures and does not require a model or contact any AI provider.

The website remains localhost-only. Production hosting and authentication are separate work. PayPal is sandbox-only.
