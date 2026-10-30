const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000';
const app = `export const initializeApp=()=>({});`;
const auth = `
let callback;
export const getAuth=()=>window.testAuth={currentUser:null};
export const browserSessionPersistence={};
export const setPersistence=async()=>{};
export const onAuthStateChanged=(auth,cb)=>{callback=cb;cb(null)};
export const signInWithEmailAndPassword=async(auth,email,password)=>{
 if(password==='wrong')throw {code:'auth/invalid-credential'};
 auth.currentUser={uid:'buyer-123',email};callback(auth.currentUser);
};
export const signOut=async auth=>{auth.currentUser=null;callback(null)};
`;
const store = `
export const getFirestore=()=>({});
export const runTransaction=async(store,fn)=>fn({
 get:async()=>({exists:()=>!!window.testBuyer,data:()=>window.testBuyer}),
 set:(ref,value)=>{window.testBuyer=value}
});
export const doc=(store,collection,uid)=>{if(collection!=='buyers'||uid!=='buyer-123')throw Error('Unexpected read');return {uid}};
export const onSnapshot=(ref,options,next,error)=>{
 window.accessNext=(data,fromCache=false)=>next({metadata:{fromCache},exists:()=>data!==null,data:()=>data});
 window.accessError=error;
 window.accessNext(window.testBuyer??null);
 return ()=>{};
};
`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/firebase-config.js',r=>r.fulfill({contentType:'text/javascript',body:`export const firebaseConfig={apiKey:'PASTE_TEST'};export const PRODUCT_ID='my-everyday-planner';`}));
 await page.goto(base+'/commercial/');
 await page.getByRole('heading',{name:'Setup required'}).waitFor();
 assert.equal(await page.locator('#planner').isVisible(),false);
 await page.unroute('**/firebase-config.js');
 await page.route('**/firebase-config.js',r=>r.fulfill({contentType:'text/javascript',body:`export const firebaseConfig={apiKey:'test',projectId:'test',authDomain:'test',appId:'test'};export const PRODUCT_ID='my-everyday-planner';`}));
 await page.route('https://www.gstatic.com/firebasejs/11.10.0/*',r=>r.fulfill({contentType:'text/javascript',body:r.request().url().endsWith('firebase-app.js')?app:r.request().url().endsWith('firebase-auth.js')?auth:store}));
 await page.reload();await page.locator('#loginForm').waitFor({state:'visible'});
 const personal='{"personal":"untouched"}';
 await page.evaluate(v=>localStorage.setItem('home-planner-v1',v),personal);
 await page.locator('#loginEmail').fill('buyer@example.com');await page.locator('#loginPassword').fill('wrong');await page.locator('#loginSubmit').click();await page.getByText('Login failed.',{exact:false}).waitFor();
 await page.locator('#loginPassword').fill('correct');await page.locator('#loginSubmit').click();await page.getByRole('heading',{name:'Access Pending Approval'}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('commercial-planner-v1')),null);
 const approved={status:'approved',allowedProducts:['my-everyday-planner'],email:'buyer@example.com'};
 for(const buyer of [{status:'pending',allowedProducts:['my-everyday-planner']},{status:'approved',allowedProducts:['other']},{status:'approved',allowedProducts:'my-everyday-planner'}]){
 await page.evaluate(b=>window.accessNext(b),buyer);assert.equal(await page.locator('#planner').isVisible(),false);
 }
 await page.evaluate(b=>window.accessNext(b,true),approved);await page.getByRole('heading',{name:'Connection required'}).waitFor();
 await page.evaluate(b=>window.accessNext(b),approved);await page.locator('#planner').waitFor({state:'visible'});
 await page.locator('#bn').fill('Internet');await page.locator('#ba').fill('1500');await page.locator('#bd').fill('20');await page.locator('#fBill button').click();assert.equal(await page.locator('#billTotal').innerText(),'₱1,500');
 await page.getByRole('checkbox',{name:'Mark Internet as paid'}).check();assert.equal(await page.locator('#billPaid').innerText(),'₱1,500');
 await page.getByRole('button',{name:'Errands',exact:true}).click();await page.locator('#et').fill('Groceries');await page.locator('#fErr button').click();assert.equal(await page.locator('#s2').innerText(),'1');
 await page.getByRole('button',{name:'Travel / Savings Goals'}).click();await page.locator('#gn').fill('Savings');await page.locator('#gt').fill('1000');await page.locator('#fGoal button').click();await page.locator('.dep input').fill('200');await page.locator('.dep button').click();assert.equal(await page.locator('#s3').innerText(),'₱200');
 await page.locator('#brandName').fill('My custom title');assert.equal(await page.title(),'My Everyday Planner');assert.equal(await page.locator('.product-header strong').innerText(),'My Everyday Planner');
 await page.getByRole('button',{name:'Lavender',exact:true}).click();assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const downloaded=page.waitForEvent('download');await page.locator('#bkSave').click();const download=await downloaded;const path=await download.path();
 await page.locator('#brandName').fill('Changed');page.once('dialog',d=>d.accept());await page.locator('#bkFile').setInputFiles(path);await page.getByText('Backup restored.',{exact:true}).waitFor();assert.equal(await page.locator('#brandH').innerText(),'My custom title');
 const saved=await page.evaluate(()=>localStorage.getItem('commercial-planner-v1'));
 await page.evaluate(()=>window.accessError({code:'permission-denied'}));await page.getByRole('heading',{name:'Unable to verify access'}).waitFor();assert.equal(await page.locator('#planner').isVisible(),false);
 await page.locator('#retryAccess').click();await page.evaluate(b=>window.accessNext(b),approved);await page.locator('#planner').waitFor({state:'visible'});
 await page.evaluate(()=>window.accessNext({status:'revoked',allowedProducts:['my-everyday-planner']}));await page.getByRole('heading',{name:'Access Pending Approval'}).waitFor();
 await page.evaluate(b=>window.accessNext(b),approved);await page.locator('#planner').waitFor({state:'visible'});
 await page.evaluate(()=>window.dispatchEvent(new Event('offline')));assert.equal(await page.locator('#planner').isVisible(),false);
 await page.locator('#logout').click();await page.locator('#loginForm').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>localStorage.getItem('commercial-planner-v1')),saved);assert.equal(await page.evaluate(()=>localStorage.getItem('home-planner-v1')),personal);
 await page.reload();await page.locator('#loginForm').waitFor({state:'visible'});await page.locator('#loginEmail').fill('buyer@example.com');await page.locator('#loginPassword').fill('correct');await page.locator('#loginSubmit').click();await page.evaluate(b=>window.accessNext(b),approved);await page.locator('#planner').waitFor({state:'visible'});assert.equal(await page.locator('#brandH').innerText(),'My custom title');
 assert.deepEqual(errors,[]);
 console.log('PASS: config fail-closed, login failure, missing/pending/wrong-product approval, cache denial, approved access, errors/retry, revocation, offline lock, logout, planner features, branding, backup/restore, reload, storage isolation, mobile/light rendering. Firebase is mocked; live integration/rules require project configuration.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
