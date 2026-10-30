import { PRODUCT_ID } from '../commercial/firebase-config.js';
const $ = id => document.getElementById(id);
const label = status => ({payment_pending:'Pending payment',payment_verified:'Payment verified',rejected:'Payment rejected',access_granted:'Access granted'}[status] || status);
function text(tag, value) { const element = document.createElement(tag); element.textContent = value; return element; }
export function createOrdersPanel({ context, failure }) {
  let stopWatch = () => {}, generation = 0, selected = 'payment_pending', active = false;
  const busy = new Set();
  function stop() {
    active = false; generation++; stopWatch(); stopWatch = () => {}; busy.clear();
    $('adminOrders').replaceChildren(); $('orderListMessage').textContent = ''; $('orderActionMessage').textContent = '';
  }
  function start() {
    stop(); active = true;
    const ctx = context(), current = generation;
    if (!ctx.authorized || !ctx.auth?.currentUser) return;
    $('orderListMessage').textContent = 'Loading orders…';
    const query = ctx.sdk.query(ctx.sdk.collection(ctx.db,'orders'),ctx.sdk.where('status','==',selected));
    stopWatch = ctx.sdk.onSnapshot(query,{includeMetadataChanges:true},snapshot=>{
      if (current !== generation || !context().authorized) return;
      $('adminOrders').replaceChildren();
      if(snapshot.metadata.fromCache){$('orderListMessage').textContent='Connect to see current payment records.';return;}
      const docs=snapshot.docs.slice().sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0));
      $('orderListMessage').textContent=docs.length?`${docs.length} ${label(selected).toLowerCase()} order(s).`:'No orders in this section.';
      for(const doc of docs) $('adminOrders').append(render(doc));
    },()=>{if(current===generation)failure();});
  }
  function render(record) {
    const order=record.data(), card=text('article','');card.className='card order';
    card.append(text('h2',order.buyerName));
    const list=document.createElement('dl');
    for(const [key,value] of [['Email',order.buyerEmail],['Buyer UID',order.buyerUid],['Product',order.productId],['Amount',`₱${order.amount}`],['Payment method',order.paymentMethod==='gcash'?'GCash':'Bank Transfer'],['Reference',order.paymentReference],['Submitted',order.createdAt?.toDate?.().toLocaleString()||'Awaiting server timestamp'],['Status',label(order.status)],['Order ID',record.id],['Note',order.note||'—']])list.append(text('dt',key),text('dd',value));
    card.append(list);
    const actions=text('div','');actions.className='actions';
    const operations=order.status==='payment_pending'?[['Mark Payment Verified','payment_verified'],['Reject Payment','rejected']]:order.status==='payment_verified'?[['Grant Access','access_granted']]:[];
    for(const [name,status] of operations){const button=text('button',name);button.className=status==='rejected'?'revoke':'primary';button.setAttribute('aria-label',`${name}: ${order.buyerEmail}`);button.disabled=busy.has(record.id);button.onclick=()=>act(record.id,status,card);actions.append(button);}
    card.append(actions);return card;
  }
  async function act(id,status,card) {
    const ctx=context();if(!active||!ctx.authorized||!ctx.auth?.currentUser||busy.has(id))return;
    const prompt=status==='access_granted'?'Grant My Everyday Planner access now? This is a separate access activation after verified payment.':status==='payment_verified'?'Have you checked actual receipt in GCash or your bank? Mark payment verified? This does not grant access.':'Reject this payment? This will not grant access.';
    if(!confirm(prompt))return;
    const current=generation;busy.add(id);card.querySelectorAll('button').forEach(b=>b.disabled=true);$('orderActionMessage').textContent='Saving…';
    try {
      await ctx.sdk.runTransaction(ctx.db,async transaction=>{
        const admin=await transaction.get(ctx.sdk.doc(ctx.db,'admins',ctx.auth.currentUser.uid));
        const ref=ctx.sdk.doc(ctx.db,'orders',id), record=await transaction.get(ref);
        if(!admin.exists()||!context().authorized||ctx.session!==context().session||!record.exists())throw Error('Access changed');
        const order=record.data();
        if(status==='access_granted'){
          if(order.status!=='payment_verified'||order.productId!==PRODUCT_ID)throw Error('Payment is not verified');
          const buyerRef=ctx.sdk.doc(ctx.db,'buyers',order.buyerUid),buyer=await transaction.get(buyerRef);
          if(!buyer.exists())throw Error('Buyer must sign in to prepare their account');
          const products=buyer.data().allowedProducts;
          if(!Array.isArray(products)||products.some(p=>typeof p!=='string'))throw Error('Invalid buyer record');
          transaction.update(buyerRef,{status:'approved',allowedProducts:[...new Set([...products,PRODUCT_ID])]});
          transaction.update(ref,{status,grantedAt:ctx.sdk.serverTimestamp(),grantedBy:ctx.auth.currentUser.uid});
        }else{
          if(order.status!=='payment_pending')throw Error('Payment status changed');
          transaction.update(ref,{status,reviewedAt:ctx.sdk.serverTimestamp(),reviewedBy:ctx.auth.currentUser.uid});
        }
      });
      if(current===generation)$('orderActionMessage').textContent=status==='access_granted'?'Planner access granted.':status==='payment_verified'?'Payment verified. Choose Verified Payments, then confirm Grant Access to activate the planner.':'Payment rejected. No access was granted.';
    }catch{if(current===generation)$('orderActionMessage').textContent='Change was not saved. Refresh the order and check admin permission, payment status, and the buyer record.';}
    finally{busy.delete(id);if(current===generation)card.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  $('orderFilters').onclick=event=>{const button=event.target.closest('button[data-status]');if(!button||!active)return;selected=button.dataset.status;$('orderFilters').querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));start();};
  $('refreshAdminOrders').onclick=()=>{if(active)start();};
  return {start,stop};
}
