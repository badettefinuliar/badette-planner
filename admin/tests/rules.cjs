// Local emulator only; never run security tests against a production project.
const {before,after,test}=require('node:test');
const fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,updateDoc,setDoc,deleteDoc}=require('firebase/firestore');
let env;
before(async()=>{
 if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local FIRESTORE_EMULATOR_HOST required');
 env=await initializeTestEnvironment({projectId:'demo-planner-admin',firestore:{rules:fs.readFileSync(path.join(__dirname,'../../commercial/firestore.rules'),'utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{
 const db=ctx.firestore();await setDoc(doc(db,'admins','owner'),{});
 await setDoc(doc(db,'buyers','buyer'),{email:'buyer@example.com',status:'pending',allowedProducts:['other-product']});
 await setDoc(doc(db,'buyers','second'),{email:'second@example.com',status:'revoked',allowedProducts:[]});
 await setDoc(doc(db,'unrelated','private'),{value:'private'});
 });
});
after(async()=>{await env?.cleanup()});
test('anonymous users cannot read/list buyers or read membership',async()=>{
 const db=env.unauthenticatedContext().firestore();await assertFails(getDoc(doc(db,'buyers','buyer')));await assertFails(getDocs(collection(db,'buyers')));await assertFails(getDoc(doc(db,'admins','owner')));
});
test('buyer can read own access and membership only; cross-user reads and lists denied',async()=>{
 const db=env.authenticatedContext('buyer').firestore();await assertSucceeds(getDoc(doc(db,'buyers','buyer')));await assertSucceeds(getDoc(doc(db,'admins','buyer')));
 await assertFails(getDoc(doc(db,'buyers','second')));await assertFails(getDoc(doc(db,'admins','owner')));await assertFails(getDocs(collection(db,'buyers')));await assertFails(getDocs(collection(db,'admins')));
});
test('buyer cannot self-approve, grant membership, create/delete records',async()=>{
 const db=env.authenticatedContext('buyer').firestore();await assertFails(updateDoc(doc(db,'buyers','buyer'),{status:'approved',allowedProducts:['my-everyday-planner']}));await assertFails(setDoc(doc(db,'admins','buyer'),{}));await assertFails(setDoc(doc(db,'buyers','new'),{email:'x',status:'approved',allowedProducts:[]}));await assertFails(deleteDoc(doc(db,'buyers','buyer')));
});
test('admin can list/read buyers and approve, revoke, restore access',async()=>{
 const db=env.authenticatedContext('owner').firestore(),ref=doc(db,'buyers','buyer');await assertSucceeds(getDocs(collection(db,'buyers')));await assertSucceeds(getDoc(ref));
 await assertSucceeds(updateDoc(ref,{status:'approved',allowedProducts:['other-product','my-everyday-planner']}));await assertSucceeds(updateDoc(ref,{status:'revoked'}));await assertSucceeds(updateDoc(ref,{status:'approved'}));
});
test('admin cannot add passwords/financial fields, edit email or use invalid access fields',async()=>{
 const db=env.authenticatedContext('owner').firestore(),ref=doc(db,'buyers','buyer');for(const patch of [{password:'secret'},{bills:[]},{savings:100},{email:'changed@example.com'},{status:'invalid'},{allowedProducts:'my-everyday-planner'}])await assertFails(updateDoc(ref,patch));
});
test('admin cannot create other buyers/delete buyers or edit/list memberships',async()=>{
 const db=env.authenticatedContext('owner').firestore();await assertFails(setDoc(doc(db,'buyers','new'),{email:'x',status:'pending',allowedProducts:[]}));await assertFails(deleteDoc(doc(db,'buyers','second')));
 await assertFails(setDoc(doc(db,'admins','new'),{}));await assertFails(updateDoc(doc(db,'admins','owner'),{admin:true}));await assertFails(deleteDoc(doc(db,'admins','owner')));await assertFails(getDocs(collection(db,'admins')));
});
test('all unrelated database access denied to buyers and admins',async()=>{
 for(const uid of ['buyer','owner']){const db=env.authenticatedContext(uid).firestore();await assertFails(getDoc(doc(db,'unrelated','private')));await assertFails(setDoc(doc(db,'financial','record'),{amount:100}));}
});
test('revoked administrator can no longer list or update buyer access',async()=>{
 await env.withSecurityRulesDisabled(ctx=>deleteDoc(doc(ctx.firestore(),'admins','owner')));const db=env.authenticatedContext('owner').firestore();await assertFails(getDocs(collection(db,'buyers')));await assertFails(updateDoc(doc(db,'buyers','buyer'),{status:'revoked'}));
});

test('authenticated signup creates only its own exact pending record',async()=>{
 const db=env.authenticatedContext('new-customer',{email:'new@example.com'}).firestore();
 await assertSucceeds(setDoc(doc(db,'buyers','new-customer'),{email:'new@example.com',status:'pending',allowedProducts:[]}));
 await assertSucceeds(getDoc(doc(db,'buyers','new-customer')));
 await assertFails(updateDoc(doc(db,'buyers','new-customer'),{status:'approved',allowedProducts:['my-everyday-planner']}));
 await assertFails(setDoc(doc(db,'buyers','new-customer'),{email:'new@example.com',status:'pending',allowedProducts:[]}));
});
test('signup rejects wrong UID/email, approved status, products, extra/missing fields',async()=>{
 const db=env.authenticatedContext('signup-invalid',{email:'new@example.com'}).firestore();
 const pending={email:'new@example.com',status:'pending',allowedProducts:[]};
 await assertFails(setDoc(doc(db,'buyers','other-uid'),pending));
 for(const patch of [{email:'wrong@example.com'},{status:'approved'},{status:'revoked'},{allowedProducts:['my-everyday-planner']},{allowedProducts:{}},{password:'not-allowed'},{bills:[]}])await assertFails(setDoc(doc(db,'buyers','signup-invalid'),{...pending,...patch}));
 await assertFails(setDoc(doc(db,'buyers','signup-invalid'),{email:'new@example.com',status:'pending'}));
 await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(),'buyers','anonymous'),pending));
});
test('existing Auth account can create missing record without overwriting approved or revoked access',async()=>{
 const db=env.authenticatedContext('existing-auth',{email:'existing@example.com'}).firestore(),ref=doc(db,'buyers','existing-auth');
 await assertSucceeds(setDoc(ref,{email:'existing@example.com',status:'pending',allowedProducts:[]}));
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'buyers','existing-auth'),{status:'approved',allowedProducts:['my-everyday-planner']}));
 await assertFails(setDoc(ref,{email:'existing@example.com',status:'pending',allowedProducts:[]}));
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'buyers','existing-auth'),{status:'revoked'}));
 await assertFails(updateDoc(ref,{status:'approved'}));
});
