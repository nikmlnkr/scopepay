# PayPal sandbox integration

ScopePay runs locally without any paid services. Scope review runs on the server using local rules; no model service or AI API key is required.

## Configure your own sandbox

1. Create a PayPal Developer account and a sandbox Merchant REST app with Invoicing enabled.
2. Use the app’s sandbox Business seller and a separate Personal buyer. Choose test account countries that support the intended sandbox payment route.
3. Copy `.env.example` to `.env`, then set `PAYPAL_MODE=sandbox`, `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `PAYPAL_SANDBOX_SELLER_EMAIL`, and `PAYPAL_SANDBOX_BUYER_EMAIL`.
4. Run `npm run check:paypal` to verify OAuth and invoice-read access. It does not print tokens or create invoices.
5. Restart `npm run dev`. Create and approve initial scope, then create and approve a paid scope change.
6. Select **Create PayPal sandbox invoice**. Open its payment link and complete checkout with your sandbox buyer. Return and select **Check payment status**.

All invoices use the configured test buyer, regardless of the local client account email. The UI discloses this. The configured seller represents the demo company. No live PayPal host is supported. Credentials stay on the server and must never be committed. Never use real customer or payment data in the prototype.

## What is implemented

- OAuth client credentials against the fixed PayPal sandbox API host.
- Invoice creation from immutable accepted change snapshots, followed by send with recipient and invoicer notification flags disabled.
- Hosted sandbox payment links on company and client dashboards.
- Explicit authenticated status refresh; opening checkout is not treated as payment.
- Durable creation intent before dispatch. Uncertain outcomes reconcile by stored invoice number without blindly repeating creation.
- Validation of invoice identity, seller, buyer, accepted snapshot reference, amount and currency before accepting provider status.
- A single-process project lock prevents overlapping invoice mutations.
- Existing simulated invoices remain separate and cannot be converted into sandbox invoices. Real sandbox statuses cannot be manually overwritten.

A genuine $1 sandbox payment was completed and independently confirmed PAID by server-side PayPal reconciliation during development. No real money moved. Automated provider fixtures cover retry, mismatch and recovery cases; they do not contact PayPal.

## Boundaries

Only accepted change fees are invoiced. Initial baseline billing, multi-merchant onboarding, live payments, webhooks and production hosting are not implemented. Status refresh is explicit polling. This prototype runs one server process. Unknown creation outcomes remain pending until reconciliation succeeds or the sandbox account is inspected.

The app is loopback-only. Production requires verified email ownership, HTTPS with Secure cookies, account recovery, persistent hosted storage, abuse controls and an appropriate deployment design.

## Tools

React, Vite, Node.js, SQLite and the PayPal Invoicing REST API power the application. Codex assisted development and testing. The active scope comparison is deterministic, with validated source excerpts, human pricing and client approval. An inactive experimental model adapter and fixture tests remain in the source; the application does not import or call it.

## References

- https://developer.paypal.com/invoicing/about
- https://developer.paypal.com/api/invoicing/v2/invoices-create
- https://developer.paypal.com/api/invoicing/v2/invoices-send
- https://developer.paypal.com/api/invoicing/v2/invoices-get
