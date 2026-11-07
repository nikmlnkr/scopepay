import {createHash} from 'node:crypto';
import {audit} from './projects.js';
const base='https://api-m.sandbox.paypal.com';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const requireValue=(ok,message)=>{if(!ok)throw new Error(message);};
export const configured=()=>process.env.PAYPAL_MODE==='sandbox'&&!!process.env.PAYPAL_SANDBOX_CLIENT_ID&&!!process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
export function publicInvoice(i){if(!i)return null;return {id:i.id,provider:i.provider||'mock',status:i.status,total:i.total,currency:i.currency||'USD',paymentUrl:i.paymentUrl,checkedAt:i.checkedAt,stage:i.stage};}
export function createPayPal({fetcher=fetch,env=process.env}={}){
 let cached;
 async function token(){
  if(cached?.until>Date.now())return cached.value;
  const r=await fetcher(base+'/v1/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+Buffer.from(env.PAYPAL_SANDBOX_CLIENT_ID+':'+env.PAYPAL_SANDBOX_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  requireValue(r.ok,`PayPal sandbox authentication failed (${r.status})`);const d=await r.json();requireValue(d.access_token,'PayPal returned no token');cached={value:d.access_token,until:Date.now()+Math.max(0,(d.expires_in-60))*1000};return cached.value;
 }
 async function call(path,method='GET',body){
  const r=await fetcher(base+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok){if(r.status===401)cached=null;throw new Error(`PayPal sandbox request failed (${r.status}); retry to reconcile safely.`);}
  const text=await r.text();return text?JSON.parse(text):{};
 }
 function check(d,i){
  requireValue(d.id===i.id&&/^INV2-[A-Z0-9-]+$/.test(d.id),'PayPal invoice ID mismatch');
  requireValue(d.detail?.invoice_number===i.number&&d.detail?.reference===i.hash,'PayPal agreement reference mismatch');
  requireValue(d.invoicer?.email_address?.toLowerCase()===i.seller.toLowerCase(),'PayPal seller mismatch');
  requireValue(d.primary_recipients?.[0]?.billing_info?.email_address?.toLowerCase()===i.buyer.toLowerCase(),'PayPal buyer mismatch');
  requireValue(d.amount?.currency_code===i.currency&&/^\d+(\.\d{1,2})?$/.test(d.amount?.value)&&Math.round(Number(d.amount.value)*100)===i.total,'PayPal invoice amount mismatch');
  requireValue(typeof d.status==='string','Missing PayPal invoice status');
 }
 async function read(i){const d=await call('/v2/invoicing/invoices/'+i.id);check(d,i);return d;}
 async function recover(i){
  // A dispatched create is NEVER repeated, even when the response was lost.
  for(let page=1;page<=100;page++){
   const d=await call(`/v2/invoicing/invoices?page=${page}&page_size=100&total_required=true`);
   const rows=d.items||[];const found=rows.filter(x=>x.detail?.invoice_number===i.number);
   requireValue(found.length<=1,'Duplicate PayPal invoice numbers require manual review');
   if(found.length){i.id=found[0].id;return;}
   if(rows.length<100)break;
  }
  throw new Error('Invoice creation outcome is uncertain. No duplicate was created. Retry reconciliation later or inspect the sandbox dashboard.');
 }
 async function run(p,changeId,save,{refreshOnly=false}={}){
  const c=p.changes.find(c=>c.id===changeId),r=p.reviews.find(r=>r.id===c?.reviewId);
  requireValue(c?.status==='accepted'&&r?.status==='accepted'&&r.acceptance?.hash===r.hash&&digest(r.snapshot)===r.hash,'Client must accept the unchanged proposal before invoicing');
  requireValue(c.total===r.snapshot.total&&c.total>0&&p.currency==='USD','Invoice requires an accepted positive USD amount');
  requireValue(!c.invoice||c.invoice.provider==='paypal-sandbox','Existing mock invoice is preserved. Use a new accepted change for sandbox testing.');
  requireValue(!refreshOnly||c.invoice,'Create the sandbox invoice first');
  let i=c.invoice;
  if(!i){
   requireValue(env.PAYPAL_SANDBOX_SELLER_EMAIL&&env.PAYPAL_SANDBOX_BUYER_EMAIL,'Configure sandbox seller and buyer');
   i=c.invoice={provider:'paypal-sandbox',number:'SP-'+c.id.replaceAll('-','').slice(0,22),hash:r.hash,total:r.snapshot.total,currency:'USD',seller:env.PAYPAL_SANDBOX_SELLER_EMAIL,buyer:env.PAYPAL_SANDBOX_BUYER_EMAIL,stage:'prepared',status:'PENDING'};save(p);
  }
  requireValue(i.hash===r.hash&&i.total===r.snapshot.total,'Stored invoice differs from accepted proposal');
  if(!i.id){
   if(i.stage==='prepared'){
    // Acquire authentication before persisting the potentially uncertain dispatch.
    await token();i.stage='create-dispatched';save(p);
    const d=await call('/v2/invoicing/invoices','POST',{
     detail:{invoice_number:i.number,reference:i.hash,currency_code:i.currency,note:`ScopePay sandbox test — approved change v${c.version}. No real money.`,payment_term:{term_type:'DUE_ON_RECEIPT'}},
     invoicer:{email_address:i.seller},primary_recipients:[{billing_info:{email_address:i.buyer}}],
     items:r.snapshot.lines.filter(l=>l.kind==='extra'&&l.fee>0).map(l=>({name:l.title,description:l.criteria,quantity:'1',unit_amount:{currency_code:i.currency,value:(l.fee/100).toFixed(2)}})),
     configuration:{allow_tip:false,partial_payment:{allow_partial_payment:false}},
    });
    if(d.id)i.id=d.id;
    else {const href=d.href||d.links?.find(l=>l.rel==='self')?.href;const match=typeof href==='string'&&href.match(/^https:\/\/api(?:-m)?\.sandbox\.paypal\.com\/v2\/invoicing\/invoices\/(INV2-[A-Z0-9-]+)$/);if(match)i.id=match[1];}
    if(!i.id)await recover(i);
    i.stage='created';save(p);
   }else{await recover(i);i.stage='created';save(p);}
  }
  requireValue(/^INV2-[A-Z0-9-]+$/.test(i.id),'Invalid stored invoice ID');
  let d=await read(i);
  if(d.status==='DRAFT'&&!refreshOnly){
   i.stage='send-dispatched';save(p);
   await call('/v2/invoicing/invoices/'+i.id+'/send','POST',{send_to_recipient:false,send_to_invoicer:false});
   d=await read(i);
  }
  const url=d.detail?.metadata?.recipient_view_url||d.links?.find(l=>l.rel==='payer-view')?.href;
  if(url){const u=new URL(url);requireValue(u.protocol==='https:'&&['www.sandbox.paypal.com','sandbox.paypal.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port,'Unexpected PayPal payment URL');i.paymentUrl=u.href;}
  const old=i.status;i.status=d.status;i.checkedAt=new Date().toISOString();i.stage=d.status==='DRAFT'?'created':'ready';
  if(old!==i.status)audit(p,`PayPal sandbox invoice ${i.id}: ${i.status} · verified with PayPal`);
  save(p);return publicInvoice(i);
 }
 return {run};
}
