const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:8000';
const records={admins:{seller:{}},buyers:{},orders:{}};
const reads=[];let pages=[];
const app=`export const initializeApp=()=>({});`;
const auth=`
let cb;export const getAuth=()=>window.testAuth={currentUser:null};export const browserSessionPersistence={};export const setPersistence=async()=>{};
export const onAuthStateChanged=(a,callback)=>{cb=callback;cb(null)};
const login=(a,email)=>{a.currentUser={uid:email==='seller@example.com'?'seller':'customer',email};cb(a.currentUser);return {user:a.currentUser}};
export const signInWithEmailAndPassword=async(a,email,pw)=>login(a,email);
export const createUserWithEmailAndPassword=async(a,email,pw)=>login(a,email);
export const signOut=async a=>{a.currentUser=null;cb(null)};
`;
const store=`
let nextId=0;const listeners=new Set();
const decode=data=>{if(!data)return data;const d={...data};for(const key of ['createdAt','reviewedAt','grantedAt'])if(d[key]?.millis)d[key]={toMillis:()=>data[key].millis,toDate:()=>new Date(data[key].millis)};return d};
const snap=(ref,data)=>ref.id?{metadata:{fromCache:false},exists:()=>data!==null,data:()=>decode(data)}:{metadata:{fromCache:false},docs:data.map(([id,d])=>({id,data:()=>decode(d)})),size:data.length,empty:data.length===0};
const read=async ref=>snap(ref,await window.mockRead(ref,window.testAuth.currentUser?.uid));
export const getFirestore=()=>({});export const collection=(db,col)=>({col});
export const doc=(db,col,id)=>typeof col==='string'?{col,id}:{col:db.col,id:'order-'+(++nextId)};
export const where=(field,op,value)=>({field,op,value});export const query=(col,condition)=>({...col,condition});
export const serverTimestamp=()=>({millis:Date.now()});
export const getDocFromServer=read;
export const setDoc=async(ref,data)=>{await window.mockCommit([{ref,data,type:'set'}]);if(window.failAfterCommit){window.failAfterCommit=false;throw Error('Lost acknowledgement')}};
export const runTransaction=async(db,fn)=>{const writes=[];await fn({get:read,set:(ref,data)=>writes.push({ref,data,type:'set'}),update:(ref,data)=>writes.push({ref,data,type:'update'})});if(writes.length)await window.mockCommit(writes)};
export const onSnapshot=(ref,options,next,error)=>{const listener=async()=>{try{next(await read(ref))}catch(e){error(e)}};listener.ref=ref;listeners.add(listener);listener();return()=>listeners.delete(listener)};
window.mockNotify=async changes=>{await Promise.all([...listeners].filter(fn=>!changes||changes.some(ref=>ref.col===fn.ref.col&&(!fn.ref.id||ref.id===fn.ref.id))).map(fn=>fn()))};
`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const errors=[];
 async function page(){
  const p=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.exposeFunction('mockRead',(ref,uid)=>{reads.push({ref,uid});const col=records[ref.col]||{};if(ref.id)return col[ref.id]??null;return Object.entries(col).filter(([id,data])=>!ref.condition||data[ref.condition.field]===ref.condition.value)});
  await p.exposeFunction('mockCommit',async writes=>{for(const {ref,data,type} of writes){records[ref.col]||={};if(type==='set')records[ref.col][ref.id]=data;else records[ref.col][ref.id]={...records[ref.col][ref.id],...data}}setTimeout(()=>Promise.all(pages.map(p=>p.evaluate(changes=>window.mockNotify?.(changes),writes.map(w=>w.ref)).catch(()=>{}))),0)});
  await p.route('**/commercial/firebase-config.js',r=>r.fulfill({contentType:'text/javascript',body:`export const firebaseConfig={apiKey:'test',projectId:'test',authDomain:'test',appId:'test'};export const PRODUCT_ID='my-everyday-planner';`}));
  await p.route('**/store/payment-config.js',r=>r.fulfill({contentType:'text/javascript',body:`export const paymentMethods={gcash:{label:'GCash',enabled:true,recipient:'TEST ONLY',account:'TEST-ACCOUNT',instructions:'Synthetic test instructions'},bank_transfer:{label:'Bank Transfer',enabled:true,recipient:'TEST ONLY',account:'TEST-BANK',bank:'TEST BANK',instructions:'Synthetic bank instructions'}};`}));
  await p.route('https://www.gstatic.com/firebasejs/11.10.0/*',r=>r.fulfill({contentType:'text/javascript',body:r.request().url().endsWith('firebase-app.js')?app:r.request().url().endsWith('firebase-auth.js')?auth:store}));
  return p;
 }
 async function submit(p,reference,method='gcash'){
  await p.locator('#buyerName').fill('Test Customer');await p.locator('#paymentMethod').selectOption(method);await p.locator('#paymentReference').fill(reference);await p.locator('#note').fill('Synthetic payment metadata');await p.locator('#submitOrder').click();await p.getByText('Payment submitted for verification. Access will be activated after payment is confirmed.',{exact:true}).waitFor();
 }
 try{
 const buyer=await page();await buyer.goto(base+'/store/');await buyer.locator('#getAccess').click();await buyer.locator('#authPanel').waitFor({state:'visible'});
 await buyer.evaluate(()=>{localStorage.setItem('home-planner-v1','personal-sentinel');localStorage.setItem('commercial-planner-v1','commercial-sentinel')});
 await buyer.locator('#signupMode').click();await buyer.locator('#email').fill('customer@example.com');await buyer.locator('#password').fill('long-password');await buyer.locator('#confirmPassword').fill('long-password');await buyer.locator('#authSubmit').click();await buyer.locator('#paymentPanel').waitFor({state:'visible'});
 assert.deepEqual(records.buyers.customer,{email:'customer@example.com',status:'pending',allowedProducts:[]});assert.equal(await buyer.locator('#buyerEmail').inputValue(),'customer@example.com');assert.equal(await buyer.locator('#buyerEmail').getAttribute('readonly'),'');
 await buyer.evaluate(()=>window.failAfterCommit=true);await submit(buyer,'TEST-REF-1');assert.equal(Object.keys(records.orders).length,1);const first=Object.keys(records.orders)[0];assert.equal(records.orders[first].status,'payment_pending');assert.equal(records.orders[first].amount,149);assert.equal(records.orders[first].productId,'my-everyday-planner');assert.equal('password' in records.orders[first],false);
 assert.equal(await buyer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await buyer.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');
 const admin=await page();await admin.goto(base+'/admin/');await admin.locator('#loginForm').waitFor({state:'visible'});await admin.locator('#email').fill('seller@example.com');await admin.locator('#password').fill('long-password');await admin.locator('#loginSubmit').click();await admin.locator('#dashboard').waitFor({state:'visible'});await admin.getByRole('button',{name:'Orders',exact:true}).click();await admin.getByRole('button',{name:'Mark Payment Verified:',exact:false}).waitFor();assert.equal(await admin.getByRole('button',{name:'Grant Access:',exact:false}).count(),0);
 admin.once('dialog',d=>d.accept());await admin.getByRole('button',{name:'Mark Payment Verified:',exact:false}).click();await admin.getByText('Payment verified. Choose Verified Payments, then confirm Grant Access to activate the planner.',{exact:true}).waitFor();assert.equal(records.buyers.customer.status,'pending');assert.equal(records.orders[first].status,'payment_verified');await buyer.getByText('Payment verified · awaiting access activation',{exact:true}).waitFor();
 await admin.getByRole('button',{name:'Verified Payments',exact:true}).click();await admin.getByRole('button',{name:'Grant Access:',exact:false}).waitFor();admin.once('dialog',d=>d.dismiss());await admin.getByRole('button',{name:'Grant Access:',exact:false}).click();assert.equal(records.buyers.customer.status,'pending');
 admin.once('dialog',d=>d.accept());await admin.getByRole('button',{name:'Grant Access:',exact:false}).click();await admin.getByText('Planner access granted.',{exact:true}).waitFor();assert.equal(records.orders[first].status,'access_granted');assert.deepEqual(records.buyers.customer.allowedProducts,['my-everyday-planner']);await buyer.getByText('Access activated',{exact:true}).waitFor();
 await buyer.locator('#orderMessage').evaluate(e=>e.textContent='');await submit(buyer,'TEST-REF-2','bank_transfer');const second=Object.keys(records.orders).find(id=>id!==first);
 await admin.getByRole('button',{name:'Pending Payments',exact:true}).click();await admin.getByRole('button',{name:'Reject Payment:',exact:false}).waitFor();admin.once('dialog',d=>d.accept());await admin.getByRole('button',{name:'Reject Payment:',exact:false}).click();await admin.getByText('Payment rejected. No access was granted.',{exact:true}).waitFor();assert.equal(records.orders[second].status,'rejected');await admin.getByRole('button',{name:'Rejected Payments',exact:true}).click();assert.equal(await admin.getByRole('button',{name:'Grant Access:',exact:false}).count(),0);
 await admin.getByRole('button',{name:'Buyer access',exact:true}).click();await admin.getByRole('button',{name:'Approved',exact:true}).click();await admin.getByRole('button',{name:'Revoke: customer@example.com',exact:true}).waitFor();
 const outsider=await page();await outsider.goto(base+'/admin/');await outsider.locator('#loginForm').waitFor({state:'visible'});await outsider.locator('#email').fill('customer@example.com');await outsider.locator('#password').fill('long-password');const before=reads.filter(x=>x.uid==='customer'&&x.ref.col==='orders'&&!x.ref.id).length;await outsider.locator('#loginSubmit').click();await outsider.getByRole('heading',{name:'Admin access required'}).waitFor();assert.equal(reads.filter(x=>x.uid==='customer'&&x.ref.col==='orders'&&!x.ref.id).length,before);
 assert.deepEqual(await buyer.evaluate(()=>[localStorage.getItem('home-planner-v1'),localStorage.getItem('commercial-planner-v1')]),['personal-sentinel','commercial-sentinel']);
 await buyer.locator('#logout').click();await buyer.locator('#authPanel').waitFor({state:'visible'});assert.equal(await buyer.locator('#orderList').innerText(),'');assert.deepEqual(errors,[]);
 const disabled=await page();await disabled.unroute('**/store/payment-config.js');await disabled.goto(base+'/store/');await disabled.locator('#getAccess').click();await disabled.locator('#authPanel').waitFor({state:'visible'});await disabled.locator('#email').fill('customer@example.com');await disabled.locator('#password').fill('long-password');await disabled.locator('#authSubmit').click();await disabled.locator('#paymentPanel').waitFor({state:'visible'});assert.equal(await disabled.locator('#submitOrder').isDisabled(),true);await disabled.getByText('Not yet configured.',{exact:false}).first().waitFor();await disabled.locator('#paymentMethod').selectOption('bank_transfer');assert.equal(await disabled.locator('#submitOrder').isDisabled(),true);
 console.log('PASS: store signup, pending buyer setup, own order schema/submission/recovery, payment instructions, buyer status updates, admin order listing, separate verification/grant with confirmation, rejection/no grant action, existing buyer controls, non-admin no order list, logout, local-data preservation, mobile/light UI. Firebase mocked; server rules require the separate emulator suite.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
