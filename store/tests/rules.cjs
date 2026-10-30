// Firebase Emulator Suite only: demo project, synthetic metadata, no real payment data.
const {before,after,test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,deleteDoc,writeBatch,serverTimestamp}=require('firebase/firestore');
let env;
const pending=(uid,email)=>({buyerUid:uid,buyerEmail:email,buyerName:'Test Customer',productId:'my-everyday-planner',amount:149,paymentMethod:'gcash',paymentReference:'TEST-12345',note:'Synthetic test',status:'payment_pending',createdAt:serverTimestamp()});
before(async()=>{
 if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local emulator required');
 env=await initializeTestEnvironment({projectId:'demo-planner-store',firestore:{rules:fs.readFileSync(path.join(__dirname,'../../commercial/firestore.rules'),'utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'admins','seller'),{});for(const uid of ['customer','other'])await setDoc(doc(db,'buyers',uid),{email:uid+'@example.com',status:'pending',allowedProducts:[]});});
});
after(async()=>{await env?.cleanup()});
const customer=()=>env.authenticatedContext('customer',{email:'customer@example.com'}).firestore();
const seller=()=>env.authenticatedContext('seller',{email:'seller@example.com'}).firestore();
const review=status=>({status,reviewedAt:serverTimestamp(),reviewedBy:'seller'});
test('buyer creates own payment-pending order with server timestamp, reads own query only',async()=>{
 const db=customer();await assertSucceeds(setDoc(doc(db,'orders','own'),pending('customer','customer@example.com')));await assertSucceeds(getDoc(doc(db,'orders','own')));await assertSucceeds(getDocs(query(collection(db,'orders'),where('buyerUid','==','customer'))));await assertFails(getDocs(collection(db,'orders')));
});
test('buyer cannot create for another UID/email, alter price/product/status/time, add secrets',async()=>{
 const db=customer();for(const patch of [{buyerUid:'other'},{buyerEmail:'other@example.com'},{amount:1},{productId:'other'},{status:'payment_verified'},{createdAt:new Date(0)},{password:'secret'},{paymentMethod:'card'}])await assertFails(setDoc(doc(db,'orders','invalid'),{...pending('customer','customer@example.com'),...patch}));
 await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(),'orders','anon'),pending('customer','customer@example.com')));
});
test('buyer cannot edit order metadata, verify payment, or grant access',async()=>{
 const db=customer(),ref=doc(db,'orders','own');for(const patch of [{amount:100},{paymentReference:'CHANGED'},{status:'payment_verified'},{status:'access_granted'}])await assertFails(updateDoc(ref,patch));await assertFails(updateDoc(doc(db,'buyers','customer'),{status:'approved',allowedProducts:['my-everyday-planner']}));await assertFails(deleteDoc(ref));
});
test('other buyers cannot read an order; admins may list/read orders',async()=>{
 const other=env.authenticatedContext('other',{email:'other@example.com'}).firestore();await assertFails(getDoc(doc(other,'orders','own')));await assertSucceeds(getDocs(collection(seller(),'orders')));await assertSucceeds(getDoc(doc(seller(),'orders','own')));
});
test('admin cannot bypass verification or modify immutable price, product, or reference',async()=>{
 const db=seller(),ref=doc(db,'orders','own');await assertFails(updateDoc(ref,{status:'access_granted',grantedAt:serverTimestamp(),grantedBy:'seller'}));for(const patch of [{amount:100},{productId:'other'},{paymentReference:'changed'}])await assertFails(updateDoc(ref,{...review('payment_verified'),...patch}));
});
test('verification alone does not grant buyer access; explicit second grant can atomically activate',async()=>{
 const db=seller(),ref=doc(db,'orders','own');await assertSucceeds(updateDoc(ref,review('payment_verified')));assert.equal((await getDoc(doc(db,'buyers','customer'))).data().status,'pending');
 await assertFails(updateDoc(ref,{status:'access_granted',grantedAt:serverTimestamp(),grantedBy:'seller'}));
 const batch=writeBatch(db);batch.update(doc(db,'buyers','customer'),{status:'approved',allowedProducts:['my-everyday-planner']});batch.update(ref,{status:'access_granted',grantedAt:serverTimestamp(),grantedBy:'seller'});await assertSucceeds(batch.commit());assert.equal((await getDoc(doc(db,'buyers','customer'))).data().status,'approved');
});
test('rejected order cannot be verified or granted, including in atomic buyer grant batch',async()=>{
 const other=env.authenticatedContext('other',{email:'other@example.com'}).firestore();await assertSucceeds(setDoc(doc(other,'orders','reject'),pending('other','other@example.com')));
 const db=seller(),ref=doc(db,'orders','reject');await assertSucceeds(updateDoc(ref,review('rejected')));await assertFails(updateDoc(ref,review('payment_verified')));
 const batch=writeBatch(db);batch.update(doc(db,'buyers','other'),{status:'approved',allowedProducts:['my-everyday-planner']});batch.update(ref,{status:'access_granted',grantedAt:serverTimestamp(),grantedBy:'seller'});await assertFails(batch.commit());assert.equal((await getDoc(doc(db,'buyers','other'))).data().status,'pending');
});
