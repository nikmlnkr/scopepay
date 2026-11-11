import http from 'node:http';
import {mkdirSync,existsSync} from 'node:fs';
import {configured,createPayPal,publicInvoice} from './paypal.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import * as projects from './projects.js';
import {analyzeScope} from './ai.js';
import * as auth from './auth.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.SCOPEPAY_DB&&existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
const paypal=createPayPal(),operationLocks=new Set();
mkdirSync(path.join(root,'.data'),{recursive:true});
const db=new DatabaseSync(process.env.SCOPEPAY_DB||path.join(root,'.data/demo.sqlite'));
db.exec('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, userId TEXT NOT NULL, expires INTEGER NOT NULL)');
if(!db.prepare('SELECT id FROM projects LIMIT 1').get()){let legacy=null;try{legacy=JSON.parse(db.prepare('SELECT data FROM workspace WHERE id=1').get()?.data||'null');}catch{}const p=projects.demoProject(legacy);db.prepare('INSERT INTO projects VALUES (?,?)').run(p.id,JSON.stringify(p));}
const all=()=>db.prepare('SELECT data FROM projects ORDER BY rowid DESC').all().map(row=>JSON.parse(row.data));
const save=p=>db.prepare('INSERT INTO projects VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(p.id,JSON.stringify(p));
const getUser=id=>{const row=db.prepare('SELECT data FROM users WHERE id=?').get(id);return row?JSON.parse(row.data):null;};
const port=Number(process.env.PORT||4177),host='127.0.0.1';
const vite=await (await import('vite')).createServer({root,server:{middlewareMode:true,fs:{deny:['.env','.env.*','**/.git/**','**/.data/**','**/*.{crt,pem}']},hmr:{port:port+1000}},appType:'spa'});
const failures=new Map();
http.createServer(async(req,res)=>{
 const url=new URL(req.url,`http://${host}:${port}`);
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);return res.end('Invalid host');}
 res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 let decodedPath;try{decodedPath=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end('Invalid path');}
 if(/(?:^|\/)(?:\.data|\.env[^/]*)(?:\/|$)/.test(decodedPath)){res.writeHead(403);return res.end('Private local file');}
 if(!url.pathname.startsWith('/api/'))return vite.middlewares(req,res);
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
 const cookie=(token,age)=>res.setHeader('Set-Cookie',`scopepay_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`);
 try{
 if(req.method==='POST'&&req.headers.origin!==`http://${req.headers.host}`)return send(403,{error:'Same-origin request required'});
 let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw new Error('Request too large');}body=JSON.parse(raw||'{}');}
 const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('scopepay_session='))?.slice(17);
 const session=token?db.prepare('SELECT userId FROM sessions WHERE hash=? AND expires>?').get(auth.tokenHash(token),Date.now()):null;
 const user=session?getUser(session.userId):null;
 if(url.pathname==='/api/session'&&req.method==='GET')return send(200,{user:user?auth.publicUser(user):null});
 if(['/api/signup','/api/login'].includes(url.pathname)&&req.method==='POST'){
 const key=req.socket.remoteAddress;const attempts=failures.get(key);if(attempts&&attempts.until>Date.now()&&attempts.count>=20)return send(429,{error:'Too many attempts. Try again in 15 minutes.'});
 let u;if(url.pathname==='/api/signup'){u=auth.signupUser(body);if(db.prepare('SELECT id FROM users WHERE email=?').get(u.email))throw new Error('This email is already registered. Sign in instead.');db.prepare('INSERT INTO users VALUES (?,?,?)').run(u.id,u.email,JSON.stringify(u));if(u.role==='vendor')for(const p of all())if(!p.ownerId){p.ownerId=u.id;p.seller=u.name;save(p);}}
 else{const row=db.prepare('SELECT data FROM users WHERE email=?').get(String(body.email||'').trim().toLowerCase());u=row?JSON.parse(row.data):null;if(!auth.verifyPassword(u,body.password)){const old=attempts&&attempts.until>Date.now()?attempts:{count:0,until:Date.now()+900000};failures.set(key,{...old,count:old.count+1});return send(401,{error:'Email or password is incorrect'});}}
 failures.delete(key);const raw=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(auth.tokenHash(raw),u.id,Date.now()+86400000);cookie(raw,86400);return send(200,{user:auth.publicUser(u)});}
 if(!user)return send(401,{error:'Please sign in to continue'});
 if(url.pathname==='/api/logout'&&req.method==='POST'){if(token)db.prepare('DELETE FROM sessions WHERE hash=?').run(auth.tokenHash(token));cookie('',0);return send(200,{ok:true});}
 if(url.pathname==='/api/projects'&&req.method==='GET')return send(200,all().filter(p=>user.role==='vendor'?p.ownerId===user.id:auth.canSeeClientProject(p,user)).map(p=>({id:p.id,name:p.name,client:p.client,status:p.baseline?'Active':p.reviews.some(r=>r.type==='scope'&&r.status==='awaiting')?'Awaiting approval':'Draft',...(user.role==='vendor'?{budget:projects.budget(p)}:{agreed:projects.budget(p).agreed,pending:p.reviews.filter(r=>r.status==='awaiting').length}),done:p.deliverables.filter(d=>d.status==='Done').length,count:p.deliverables.length||p.draft?.deliverables.length||0})));
 if(url.pathname==='/api/projects'&&req.method==='POST'){if(user.role!=='vendor')return send(403,{error:'Only company accounts can create projects'});const p=projects.createProject(body);p.ownerId=user.id;p.seller=user.name;p.clientEmail=String(body.clientEmail||'').trim().toLowerCase();if(p.clientEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.clientEmail))throw new Error('Enter a valid client email');save(p);return send(201,{id:p.id});}
 const rm=url.pathname.match(/^\/api\/review\/([a-f0-9]{64})$/);
 if(rm){const {p,r}=projects.findReview(all(),rm[1]);if(user.role==='vendor'){auth.requireOwner(p,user);if(req.method==='POST')return send(403,{error:'A client account must answer the proposal'});}else{if(p.clientEmail&&p.clientEmail!==user.email)return send(403,{error:'This invitation belongs to another client email'});if((p.customerId&&p.customerId!==user.id)||(r.customerId&&r.customerId!==user.id))return send(403,{error:'This invitation belongs to another client'});if(req.method==='POST'){if(operationLocks.has(p.id))return send(409,{error:'Project operation in progress; try again shortly'});projects.answerReview(p,r,body);r.customerId=user.id;p.customerId=user.id;save(p);}}return send(200,projects.clientView(p,r));}
 const pm=url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/([^/]+))?$/);
 if(pm){const p=all().find(p=>p.id===pm[1]);if(!p)return send(404,{error:'Project not found'});const action=pm[2];
 if(req.method==='POST'&&operationLocks.has(p.id))return send(409,{error:'Project operation in progress; try again shortly'});
 if(user.role==='customer'){if(!auth.canSeeClientProject(p,user))return send(403,{error:'Project access denied'});if(req.method==='POST'&&action==='payment-refresh'){operationLocks.add(p.id);try{return send(200,await paypal.run(p,body.changeId,save,{refreshOnly:true}));}finally{operationLocks.delete(p.id);}}if(req.method!=='GET'||action)return send(403,{error:'Company access required'});return send(200,{id:p.id,name:p.name,client:p.client,seller:p.seller,baseline:p.baseline,deliverables:p.deliverables.map(({id,title,criteria,status,source})=>({id,title,criteria,status,source})),reviews:p.reviews.map(r=>({...r})),agreed:projects.budget(p).agreed,invoices:p.changes.filter(c=>c.invoice).map(c=>({changeId:c.id,version:c.version,...publicInvoice(c.invoice)}))});}
 auth.requireOwner(p,user);if(req.method==='GET'&&!action)return send(200,{...p,paymentMode:configured()?'sandbox':'mock',sandboxBuyer:configured()?process.env.PAYPAL_SANDBOX_BUYER_EMAIL:undefined,legacyArchive:undefined,budget:projects.budget(p),checks:projects.scopeCheck(p.draft)});if(req.method!=='POST')return send(405,{error:'Method not allowed'});let result;switch(action){
 case 'scope-review':case 'analyze':{operationLocks.add(p.id);try{result=await analyzeScope(p,{mode:action==='scope-review'?'scope':'change',request:body.request});result.id=randomBytes(16).toString('hex');p.aiAnalyses=[result,...(p.aiAnalyses||[])].slice(0,10);projects.audit(p,`Scope ${result.mode} review saved · ${result.model} · seller review required`);}finally{operationLocks.delete(p.id);}break;}
 case 'scope':result=projects.saveScope(p,body);break;case 'share':result=projects.shareScope(p,body);break;case 'deliverable':result=projects.updateDeliverable(p,body);break;case 'change':result=projects.shareChange(p,body);break;case 'budget':result=projects.updateBudget(p,body);break;case 'invoice':case 'payment-refresh':{if(action==='payment-refresh'||configured()){operationLocks.add(p.id);try{result=await paypal.run(p,body.changeId,save,{refreshOnly:action==='payment-refresh'});}finally{operationLocks.delete(p.id);}}else result=projects.changeInvoice(p,body);break;}
 case 'payment':{const c=p.changes.find(c=>c.id===body.changeId);if(!c?.invoice)throw new Error('Create a mock invoice first');if(c.invoice.provider==='paypal-sandbox')throw new Error('PayPal statuses can only be updated by verified server reads');if(!['UNPAID','PAID','PARTIALLY_PAID','REFUNDED','CANCELLED'].includes(body.status))throw new Error('Invalid mock status');c.invoice.status=body.status;projects.audit(p,`Mock invoice ${c.invoice.id}: ${body.status} · simulation only`);result=c.invoice;break;}
 default:return send(404,{error:'Unknown project action'});
 }save(p);return send(200,result);}
 return send(404,{error:'Not found'});
 }catch(e){send(400,{error:e.message||'Unable to complete request'});}
}).listen(port,host,()=>console.log(`ScopePay local: http://${host}:${port} · role-based local accounts · payment mode: ${configured()?'PayPal sandbox':'mock'}`));
