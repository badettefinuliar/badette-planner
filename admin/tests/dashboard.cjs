const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:8000';
const app=`export const initializeApp=()=>({});`;
const auth=`
let cb;export const getAuth=()=>window.testAuth={currentUser:null};
export const browserSessionPersistence={};export const setPersistence=async()=>{};
export const onAuthStateChanged=(a,callback)=>{cb=callback;cb(null)};
export const signInWithEmailAndPassword=async(a,email,pw)=>{if(pw==='wrong')throw Error('Wrong password');a.currentUser={uid:'test-user',email};cb(a.currentUser)};
export const signOut=async a=>{a.currentUser=null;cb(null)};
`;
const store=`
let isAdmin=false,adminNext,buyerNext,buyerError,filter;
window.listReads=0;window.updates=[];
window.records={
 pending:{email:'<img src=x onerror=alert(1)>',status:'pending',allowedProducts:['another-product']},
 approved:{email:'approved@example.com',status:'approved',allowedProducts:['my-everyday-planner']},
 revoked:{email:'revoked@example.com',status:'revoked',allowedProducts:['another-product']}
};
export const getFirestore=()=>({});
export const doc=(db,col,id)=>({col,id});
export const collection=(db,col)=>({col});
export const where=(field,op,value)=>({field,op,value});
export const query=(col,condition)=>({...col,condition});
const snapshot=()=>{const docs=Object.entries(window.records).filter(([id,b])=>b.status===filter).map(([id,b])=>({id,data:()=>b}));return {metadata:{fromCache:false},docs,empty:docs.length===0,size:docs.length}};
export const onSnapshot=(ref,options,next,error)=>{
 let active=true;
 if(ref.col==='admins'){
  adminNext=(exists,cache=false)=>{isAdmin=exists;next({metadata:{fromCache:cache},exists:()=>exists})};
  window.setAdmin=adminNext;adminNext(false);
 }else if(ref.col==='buyers'){
  if(!isAdmin)throw Error('Buyer read before admin authorization');
  window.listReads++;filter=ref.condition.value;
  buyerNext=()=>{if(active)next(snapshot())};buyerError=error;buyerNext();
  window.buyerError=error;
  window.cachedBuyers=()=>next({...snapshot(),metadata:{fromCache:true}});
 }else throw Error('Unexpected collection');
 return ()=>{active=false};
};
export const runTransaction=async(db,fn)=>{
 const changes=[];
 await fn({
  get:async ref=>ref.col==='admins'?{exists:()=>isAdmin}:{exists:()=>!!window.records[ref.id],data:()=>window.records[ref.id]},
  update:(ref,patch)=>{if(!isAdmin||window.writeFail)throw Error('Denied');changes.push([ref.id,patch])}
 });
 for(const [id,patch] of changes){window.updates.push({id,patch});Object.assign(window.records[id],patch)}
 buyerNext?.();
};
`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/commercial/firebase-config.js',r=>r.fulfill({contentType:'text/javascript',body:`export const firebaseConfig={apiKey:'test',authDomain:'test',projectId:'test',appId:'test'};export const PRODUCT_ID='my-everyday-planner';`}));
 await page.route('https://www.gstatic.com/firebasejs/11.10.0/*',r=>r.fulfill({contentType:'text/javascript',body:r.request().url().endsWith('firebase-app.js')?app:r.request().url().endsWith('firebase-auth.js')?auth:store}));
 await page.goto(base+'/admin/');await page.locator('#loginForm').waitFor({state:'visible'});
 await page.evaluate(()=>{localStorage.setItem('commercial-planner-v1','sentinel-commercial');localStorage.setItem('home-planner-v1','sentinel-personal')});
 await page.locator('#email').fill('seller@example.com');await page.locator('#password').fill('wrong');await page.locator('#loginSubmit').click();await page.getByText('Login failed.',{exact:false}).waitFor();
 await page.locator('#password').fill('correct');await page.locator('#loginSubmit').click();await page.getByRole('heading',{name:'Admin access required'}).waitFor();
 assert.equal(await page.locator('#buyers').innerText(),'');assert.equal(await page.evaluate(()=>window.listReads),0);
 await page.evaluate(()=>window.setAdmin(true,true));await page.getByRole('heading',{name:'Connection required'}).waitFor();assert.equal(await page.evaluate(()=>window.listReads),0);
 await page.evaluate(()=>window.setAdmin(true));await page.locator('.buyer').waitFor();assert.equal(await page.locator('.buyer').count(),1);assert.equal(await page.locator('.buyer h2').innerText(),'<img src=x onerror=alert(1)>');assert.equal(await page.locator('.buyer img').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Approve:',exact:false}).click();assert.equal(await page.evaluate(()=>window.updates.length),0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Approve:',exact:false}).click();await page.getByText('Buyer access approved.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.records.pending.allowedProducts),['another-product','my-everyday-planner']);
 await page.getByRole('button',{name:'Approved',exact:true}).click();assert.equal(await page.locator('.buyer').count(),2);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Revoke: approved@example.com',exact:true}).click();await page.getByText('Buyer access revoked. The record has been kept.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.records.approved.status),'revoked');
 await page.getByRole('button',{name:'Revoked',exact:true}).click();assert.equal(await page.locator('.buyer').count(),2);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restore access: revoked@example.com',exact:true}).click();await page.getByText('Buyer access approved.',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.records.revoked.allowedProducts),['another-product','my-everyday-planner']);
 await page.evaluate(()=>window.writeFail=true);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restore access: approved@example.com',exact:true}).click();await page.getByText('Access was not saved.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.records.approved.status),'revoked');await page.evaluate(()=>window.writeFail=false);
 await page.evaluate(()=>window.cachedBuyers());assert.equal(await page.locator('.buyer').count(),0);await page.locator('#refresh').click();await page.locator('.buyer').waitFor();
 await page.evaluate(()=>window.setAdmin(false));await page.getByRole('heading',{name:'Admin access required'}).waitFor();assert.equal(await page.locator('#buyers').innerText(),'');assert.equal(await page.locator('#dashboard').isVisible(),false);
 await page.evaluate(()=>window.setAdmin(true));await page.locator('#dashboard').waitFor({state:'visible'});
 await page.evaluate(()=>window.buyerError({code:'permission-denied'}));await page.getByRole('heading',{name:'Buyer access unavailable'}).waitFor();assert.equal(await page.locator('#buyers').innerText(),'');
 await page.locator('#retry').click();await page.evaluate(()=>window.setAdmin(true));await page.locator('#dashboard').waitFor({state:'visible'});
 await page.evaluate(()=>window.dispatchEvent(new Event('offline')));assert.equal(await page.locator('#buyers').innerText(),'');assert.equal(await page.locator('#dashboard').isVisible(),false);
 await page.locator('#logout').click();await page.locator('#loginForm').waitFor({state:'visible'});assert.equal(await page.locator('#buyers').innerText(),'');
 assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('commercial-planner-v1'),localStorage.getItem('home-planner-v1')]),['sentinel-commercial','sentinel-personal']);
 assert.deepEqual(errors,[]);console.log('PASS: admin login/error, non-admin zero buyer reads, cached admin denial, status filters, approval/revoke/restore, product preservation, cancellation, write failure, escaped rendering, revocation/error/offline cleanup, logout, storage isolation, mobile/light UI. Firebase mocked.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
