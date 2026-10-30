const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:8000';
const app=`export const initializeApp=()=>({});`;
const auth=`
let callback;
export const getAuth=()=>window.testAuth={currentUser:null};
export const browserSessionPersistence={};export const setPersistence=async()=>{};
export const onAuthStateChanged=(a,cb)=>{callback=cb;cb(null)};
window.signupCalls=0;
const login=(a,email)=>{a.currentUser={uid:'customer',email};callback(a.currentUser);return {user:a.currentUser}};
export const createUserWithEmailAndPassword=async(a,email,pw)=>{
 window.signupCalls++;if(window.accountExists)throw {code:'auth/email-already-in-use'};
 window.accountExists=true;return login(a,email);
};
export const signInWithEmailAndPassword=async(a,email,pw)=>login(a,email);
export const signOut=async a=>{a.currentUser=null;callback(null)};
`;
const store=`
window.record=null;window.creates=[];window.failCreate=false;
export const getFirestore=()=>({});
export const doc=(db,col,uid)=>{if(col!=='buyers'||uid!=='customer')throw Error('Wrong buyer');return {col,uid}};
export const runTransaction=async(db,fn)=>fn({
 get:async()=>({exists:()=>!!window.record,data:()=>window.record}),
 set:(ref,value)=>{if(window.failCreate)throw Error('Write failed');if(window.record)throw Error('Would overwrite');window.record=value;window.creates.push(value)}
});
export const onSnapshot=(ref,options,next,error)=>{
 window.pushBuyer=record=>{window.record=record;next({metadata:{fromCache:false},exists:()=>!!record,data:()=>record})};window.pushBuyer(window.record);return ()=>{};
};
`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/firebase-config.js',r=>r.fulfill({contentType:'text/javascript',body:`export const firebaseConfig={apiKey:'test',projectId:'test',authDomain:'test',appId:'test'};export const PRODUCT_ID='my-everyday-planner';`}));
 await page.route('https://www.gstatic.com/firebasejs/11.10.0/*',r=>r.fulfill({contentType:'text/javascript',body:r.request().url().endsWith('firebase-app.js')?app:r.request().url().endsWith('firebase-auth.js')?auth:store}));
 await page.goto(base+'/commercial/');await page.locator('#loginForm').waitFor({state:'visible'});
 await page.evaluate(()=>{localStorage.setItem('home-planner-v1','personal-sentinel');localStorage.setItem('commercial-planner-v1',JSON.stringify({bills:[],errands:[],goals:[],settings:{name:'Existing local planner'}}))});
 await page.locator('#showSignup').click();await page.locator('#signupEmail').fill('new@example.com');await page.locator('#signupPassword').fill('short');await page.locator('#signupConfirm').fill('short');await page.locator('#signupSubmit').click();assert.equal(await page.evaluate(()=>window.signupCalls),0);
 await page.locator('#signupPassword').fill('long-password');await page.locator('#signupConfirm').fill('different-password');await page.locator('#signupSubmit').click();await page.getByText('The passwords do not match. Please try again.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.signupCalls),0);
 await page.locator('#signupConfirm').fill('long-password');await page.locator('#signupSubmit').click();await page.getByRole('heading',{name:'Access Pending Approval'}).waitFor();await page.getByText('Your account is ready. Access is pending approval.',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.record),{email:'new@example.com',status:'pending',allowedProducts:[]});assert.equal(await page.locator('#logout').isVisible(),true);assert.equal(await page.locator('#planner').isVisible(),false);assert.equal(await page.locator('#signupPassword').inputValue(),'');assert.equal(await page.locator('#signupConfirm').inputValue(),'');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#retryAccess').click();await page.getByRole('heading',{name:'Access Pending Approval'}).waitFor();assert.equal(await page.evaluate(()=>window.creates.length),1);
 await page.locator('#logout').click();await page.locator('#showSignup').click();await page.locator('#signupEmail').fill('new@example.com');await page.locator('#signupPassword').fill('long-password');await page.locator('#signupConfirm').fill('long-password');await page.locator('#signupSubmit').click();await page.getByText('An account already uses this email.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.creates.length),1);
 await page.locator('#showLogin').click();await page.evaluate(()=>window.record=null);await page.locator('#loginEmail').fill('new@example.com');await page.locator('#loginPassword').fill('long-password');await page.locator('#loginSubmit').click();await page.getByRole('heading',{name:'Access Pending Approval'}).waitFor();assert.equal(await page.evaluate(()=>window.creates.length),2);
 const approved={email:'new@example.com',status:'approved',allowedProducts:['my-everyday-planner','other-product']};await page.evaluate(r=>window.pushBuyer(r),approved);await page.locator('#planner').waitFor({state:'visible'});assert.equal(await page.locator('#brandH').innerText(),'Existing local planner');
 await page.locator('#logout').click();await page.locator('#loginEmail').fill('new@example.com');await page.locator('#loginPassword').fill('long-password');await page.locator('#loginSubmit').click();await page.locator('#planner').waitFor({state:'visible'});assert.deepEqual(await page.evaluate(()=>window.record),approved);assert.equal(await page.evaluate(()=>window.creates.length),2);
 const revoked={...approved,status:'revoked'};await page.evaluate(r=>window.pushBuyer(r),revoked);await page.getByRole('heading',{name:'Access Pending Approval'}).waitFor();assert.equal(await page.locator('#planner').isVisible(),false);await page.locator('#retryAccess').click();await page.getByRole('heading',{name:'Access Pending Approval'}).waitFor();assert.deepEqual(await page.evaluate(()=>window.record),revoked);
 await page.locator('#logout').click();await page.evaluate(()=>{window.record=null;window.failCreate=true});await page.locator('#loginEmail').fill('new@example.com');await page.locator('#loginPassword').fill('long-password');await page.locator('#loginSubmit').click();await page.getByRole('heading',{name:'Unable to prepare your account'}).waitFor();assert.equal(await page.locator('#planner').isVisible(),false);await page.evaluate(()=>window.failCreate=false);await page.locator('#retryAccess').click();await page.getByRole('heading',{name:'Access Pending Approval'}).waitFor();assert.equal(await page.evaluate(()=>window.record.status),'pending');
 assert.equal(await page.evaluate(()=>localStorage.getItem('home-planner-v1')),'personal-sentinel');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('commercial-planner-v1')).settings.name),'Existing local planner');assert.deepEqual(errors,[]);
 console.log('PASS: signup validation, pending creation/message/logout, duplicate account guidance, missing-record repair, no overwrite of existing approved/revoked records, approved planner access, blocked pending/revoked, write-failure retry, password clearing, local-only data isolation and mobile layout. Firebase mocked.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
