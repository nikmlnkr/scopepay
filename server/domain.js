import { randomBytes, randomUUID } from 'node:crypto';

export const brief = 'One 30-second English vertical reel (9:16). Two revision rounds are included; one round remains. Translation and alternate aspect ratios are excluded. Delivery within three business days of receiving all assets.';
export const rates = [{id:'language', name:'Additional language version', cents:5000, unit:'version'}, {id:'ratio', name:'Additional aspect ratio', cents:2000, unit:'export'}];
export const demoRequest = 'Please add Hindi and Spanish versions and a square export. Also fix the title typo, and make it punchier.';
export function seed() { return {project:{name:'Everyday, elevated',client:'Studio North',seller:'Alex Morgan',label:'Autumn launch · Reel 01',brief,revisionRemaining:1,currency:'USD',rates},analysis:null,proposals:[],invoice:null,events:[{id:randomUUID(),at:new Date().toISOString(),text:'Accepted brief recorded · synthetic demo project'}]}; }
function check(ok, message) { if(!ok) throw new Error(message); }
function event(s,text){ s.events.unshift({id:randomUUID(),at:new Date().toISOString(),text}); }
export function cite(text, excerpt) { const start=text.indexOf(excerpt); check(start>=0,'Evidence excerpt is absent from the accepted brief'); return {excerpt,start,end:start+excerpt.length}; }
export function validateEvidence(text,c) { return Number.isInteger(c.start)&&Number.isInteger(c.end)&&c.start>=0&&c.end>c.start&&text.slice(c.start,c.end)===c.excerpt; }
// Deliberately conservative fixture adapter. Unrecognized input cannot produce charges.
export function analyze(s, request) {
 check(typeof request==='string'&&request.trim().length>0&&request.length<=5000,'Enter a request between 1 and 5,000 characters');
 const items=[]; const add=(text,kind,excerpt,reason,rateId=null,quantity=0,question=null)=>items.push({id:randomUUID(),text,kind,evidence:cite(s.project.brief,excerpt),reason,rateId,quantity,question});
 if(request.trim()===demoRequest) {
 add('Hindi and Spanish versions','extra','Translation and alternate aspect ratios are excluded.','Two additional language deliverables are outside the English-only brief.','language',2);
 add('Square export','extra','Translation and alternate aspect ratios are excluded.','A square export is a separate aspect ratio.','ratio',1);
 add('Fix the title typo','included','Two revision rounds are included; one round remains.','A correction fits within the remaining revision round.');
 add('Make it punchier','clarify','One 30-second English vertical reel (9:16).','This could mean pacing, music, or a new creative direction.',null,0,'Do you mean tighter cuts within the current edit, or a different concept?');
 } else if(/^make it punchier[.!]?$/i.test(request.trim())) {
 add('Make it punchier','clarify','One 30-second English vertical reel (9:16).','The intended editing change is not specific enough to price.',null,0,'Which moments should change, and do you mean pacing, music, or creative direction?');
 } else {
 add(request.trim(),'clarify','One 30-second English vertical reel (9:16).','The mock adapter recognizes only the demo fixture. A seller must clarify this request; no price is inferred.',null,0,'Can you specify the deliverables, languages, formats, and changes required?');
 }
 check(items.every(i=>validateEvidence(s.project.brief,i.evidence)),'Invalid source evidence');
 s.analysis={id:randomUUID(),request,items,adapter:'mock-fixture',createdAt:new Date().toISOString()};event(s,'Request compared with accepted brief · mock analysis');return s.analysis;
}
export function total(lines) { check(Array.isArray(lines)&&lines.length>0&&lines.length<=20,'Select at least one extra deliverable'); let sum=0; for(const l of lines){check(Number.isSafeInteger(l.quantity)&&l.quantity>0&&l.quantity<=100,'Quantity must be a whole number from 1 to 100');check(Number.isSafeInteger(l.cents)&&l.cents>=0&&l.cents<=10000000,'Invalid rate in cents');sum+=l.quantity*l.cents;}check(Number.isSafeInteger(sum)&&sum>0&&sum<=100000000,'Invalid proposal total');return sum; }
export function proposal(s, input) {
 check(!s.invoice,'This project already has an invoice; revisions are locked in this demo');
 check(s.analysis&&input.analysisId===s.analysis.id,'Analysis changed; review the latest request');
 check(typeof input.note==='string'&&input.note.trim().length>0&&input.note.length<=2000,'Describe the proposed scope');
 check(Array.isArray(input.lines),'Invalid proposal lines'); const seen=new Set();
 const lines=input.lines.map(l=>{const item=s.analysis.items.find(i=>i.id===l.itemId&&i.kind==='extra');check(item,'Only evidence-backed extras can be priced');check(!seen.has(l.itemId),'Duplicate deliverable');seen.add(l.itemId);const rate=s.project.rates.find(r=>r.id===item.rateId);check(rate,'Missing rate card: clarify before quoting');return {itemId:item.id,name:item.text,rateId:rate.id,cents:rate.cents,quantity:l.quantity,evidence:structuredClone(item.evidence)};});
 const amount=total(lines); const prev=s.proposals.at(-1);if(prev) prev.status='superseded';
 const p={id:randomUUID(),version:s.proposals.length+1,status:'awaiting',analysisId:s.analysis.id,lines,total:amount,currency:'USD',note:input.note.trim(),exclusions:'The original reel remains unchanged. New concepts, extra revision rounds, and any unresolved requests are excluded from this change order.',token:randomBytes(32).toString('hex'),expiresAt:Date.now()+7*86400000,sellerReviewedAt:new Date().toISOString(),acceptance:null,analysis:structuredClone(s.analysis)};
 s.proposals.push(p);event(s,`Seller reviewed proposal v${p.version} · awaiting client acceptance`);return p;
}
export function clientProposal(s,token){const p=s.proposals.find(p=>p.token===token);check(p&&p.status!=='superseded'&&p.expiresAt>Date.now(),'This approval link has expired or been superseded');return p;}
export function accept(s,token,version,name,decision='accept'){const p=clientProposal(s,token);check(p.version===version,'Proposal version mismatch');check(p.status==='awaiting','This proposal has already been answered');check(typeof name==='string'&&name.trim().length>=2&&name.length<=100,'Enter your name');check(['accept','decline'].includes(decision),'Invalid decision');p.status=decision==='accept'?'accepted':'declined';p.acceptance={name:name.trim(),version:p.version,total:p.total,at:new Date().toISOString(),decision};event(s,`Client ${decision==='accept'?'accepted':'declined'} proposal v${p.version} · ${name.trim()}`);return p;}
export function invoice(s,version){const p=s.proposals.at(-1);check(p&&p.version===version&&p.status==='accepted','Invoice requires acceptance of the current proposal');if(s.invoice){check(s.invoice.version===version,'Invoice version mismatch');return s.invoice;}s.invoice={id:'MOCK-'+randomUUID().slice(0,8).toUpperCase(),operationId:randomUUID(),version,total:p.total,currency:p.currency,status:'UNPAID',provider:'mock',createdAt:new Date().toISOString(),lastChecked:null,seen:[]};event(s,`Mock invoice created for v${version} · no PayPal request made`);return s.invoice;}
export function reconcile(s, remote) { const i=s.invoice;check(i,'Create an invoice first');check(remote.id===i.id&&remote.total===i.total&&remote.currency===i.currency,'Invoice identity or amount mismatch');check(['UNPAID','PARTIALLY_PAID','PAID','CANCELLED','REFUNDED'].includes(remote.status),'Unknown invoice status');check(typeof remote.eventId==='string'&&remote.eventId.length>0,'Missing event identifier');if(i.seen.includes(remote.eventId)) return i; i.seen.push(remote.eventId);i.status=remote.status;i.lastChecked=new Date().toISOString();event(s,`Mock provider status: ${i.status.toLowerCase().replaceAll('_',' ')} · simulation only`);return i;}
