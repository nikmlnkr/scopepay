// Read-only sandbox readiness check. Never prints credentials, tokens or invoices.
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base = 'https://api-m.sandbox.paypal.com';
const report = {checkedAt: new Date().toISOString(), environment: 'sandbox'};
try {
  for (const key of ['PAYPAL_SANDBOX_CLIENT_ID', 'PAYPAL_SANDBOX_CLIENT_SECRET', 'PAYPAL_SANDBOX_SELLER_EMAIL', 'PAYPAL_SANDBOX_BUYER_EMAIL']) {
    if (!process.env[key]?.trim()) throw new Error(`Missing ${key}`);
  }
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_SANDBOX_CLIENT_ID}:${process.env.PAYPAL_SANDBOX_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  report.oauthStatus = response.status;
  if (!response.ok) throw new Error(`Sandbox authentication failed (HTTP ${response.status})`);
  const token = await response.json();
  if (!token.access_token) throw new Error('Sandbox returned no access token');
  report.invoicingScope = String(token.scope).includes('invoicing');
  const invoices = await fetch(`${base}/v2/invoicing/invoices?page_size=1`, {
    redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: {Authorization: `Bearer ${token.access_token}`},
  });
  report.invoiceReadStatus = invoices.status;
  await invoices.arrayBuffer(); // Discard private invoice content.
  if (!invoices.ok) throw new Error(`Sandbox invoice access failed (HTTP ${invoices.status})`);
  if (!report.invoicingScope) throw new Error('Invoicing scope missing');
  report.readyForIntegration = true;
  report.applicationPayments = process.env.PAYPAL_MODE==='sandbox'?'sandbox adapter enabled':'mock';
} catch (error) {
  report.readyForIntegration = false;
  report.error = error.message;
  process.exitCode = 1;
}
const folder = new URL('../.data/setup/', import.meta.url);
await mkdir(folder, {recursive: true});
await writeFile(new URL('sandbox-check.json', folder), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
console.log(JSON.stringify(report, null, 2));
console.log(`Saved report: ${fileURLToPath(new URL('sandbox-check.json', folder))}`);
