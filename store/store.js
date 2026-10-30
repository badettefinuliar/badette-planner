import { firebaseConfig, PRODUCT_ID } from '../commercial/firebase-config.js';
import { paymentMethods } from './payment-config.js';
const $ = id => document.getElementById(id);
const readyMethod = key => {
  const method = paymentMethods[key];
  return method?.enabled === true && !!method.recipient?.trim() && !!method.account?.trim() && (key !== 'bank_transfer' || !!method.bank?.trim());
};
let auth, authSDK, sdk, db, signup = false, working = false, accountReady = false;
let version = 0, stopOrders = () => {}, submitting = false, draftOrder;
function element(tag, value) { const e = document.createElement(tag); e.textContent = value; return e; }
function paymentInfo() {
  for (const option of $('paymentMethod').options) option.textContent = `${paymentMethods[option.value]?.label || option.value}${readyMethod(option.value) ? '' : ' — Not yet configured'}`;
  const method = paymentMethods[$('paymentMethod').value];
  $('paymentInstructions').replaceChildren();
  if (!readyMethod($('paymentMethod').value)) {
    $('paymentInstructions').textContent = 'Not yet configured. Please wait for the seller to publish verified payment instructions before sending a payment.';
  } else {
    for (const line of [`${method.label} · send ₱149`, method.bank, `Recipient: ${method.recipient}`, `Account: ${method.account}`, method.instructions]) {
      if (line) $('paymentInstructions').append(element('p', line));
    }
  }
  $('submitOrder').disabled = !accountReady || !readyMethod($('paymentMethod').value) || submitting;
}
function clearSession() {
  version++;
  accountReady = false;
  stopOrders(); stopOrders = () => {};
  $('paymentPanel').hidden = true;
  $('myOrders').hidden = true;
  $('orderList').replaceChildren();
  $('ordersMessage').textContent = '';
  $('orderMessage').textContent = '';
  $('orderForm').reset();
  $('buyerEmail').value = '';
  draftOrder = undefined;
}
function mode(value) {
  signup = value;
  $('password').value = ''; $('confirmPassword').value = '';
  $('confirmPassword').setCustomValidity('');
  $('confirmWrap').hidden = !signup;
  $('confirmPassword').required = signup;
  $('password').minLength = signup ? 8 : 1;
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('authSubmit').textContent = signup ? 'Create account' : 'Log in';
  $('loginMode').setAttribute('aria-pressed', String(!signup));
  $('signupMode').setAttribute('aria-pressed', String(signup));
}
$('getAccess').onclick = () => { $('checkout').hidden = false; $('checkout').scrollIntoView({ behavior: 'smooth' }); };
$('loginMode').onclick = () => mode(false);
$('signupMode').onclick = () => mode(true);
$('confirmPassword').oninput = () => $('confirmPassword').setCustomValidity('');
$('password').oninput = () => $('confirmPassword').setCustomValidity('');
$('paymentMethod').onchange = paymentInfo;
function watchOrders(user, current) {
  stopOrders();
  $('myOrders').hidden = false;
  const query = sdk.query(sdk.collection(db, 'orders'), sdk.where('buyerUid', '==', user.uid));
  $('ordersMessage').textContent = 'Loading your orders…';
  stopOrders = sdk.onSnapshot(query, { includeMetadataChanges: true }, snapshot => {
    if (current !== version) return;
    $('orderList').replaceChildren();
    if (snapshot.metadata.fromCache) { $('ordersMessage').textContent = 'Connect to see current order status.'; return; }
    const records = snapshot.docs.slice().sort((a,b) => (b.data().createdAt?.toMillis?.() || 0) - (a.data().createdAt?.toMillis?.() || 0));
    $('ordersMessage').textContent = records.length ? 'Payment receipt is verified manually. Verified payment and active access are separate steps.' : 'No orders yet.';
    const statuses = { payment_pending: 'Payment pending verification', payment_verified: 'Payment verified · awaiting access activation', rejected: 'Payment rejected · contact the seller', access_granted: 'Access activated' };
    for (const record of records) {
      const order = record.data(), card = element('article', ''); card.className = 'order';
      card.append(element('h3', `My Everyday Planner · ₱${order.amount}`), element('p', `Order: ${record.id}`), element('p', statuses[order.status] || order.status), element('p', `Reference: ${order.paymentReference}`));
      if (order.createdAt?.toDate) card.append(element('p', `Submitted: ${order.createdAt.toDate().toLocaleString()}`));
      if (order.status === 'access_granted') { const link = element('a', 'Open My Everyday Planner'); link.href = '../commercial/'; card.append(link); }
      $('orderList').append(card);
    }
  }, () => { if (current === version) { $('orderList').replaceChildren(); $('ordersMessage').textContent = 'Could not load orders. Check your connection and refresh.'; } });
}
async function accountChanged(user) {
  clearSession();
  const current = version;
  $('logout').hidden = !user;
  $('authPanel').hidden = !!user;
  $('retryAccount').hidden = true;
  if (!user) { $('accountMessage').textContent = 'Log in or create an account to submit your payment.'; return; }
  $('accountMessage').textContent = 'Preparing your account…';
  try {
    await sdk.runTransaction(db, async transaction => {
      const ref = sdk.doc(db, 'buyers', user.uid), buyer = await transaction.get(ref);
      if (!buyer.exists()) transaction.set(ref, { email: user.email, status: 'pending', allowedProducts: [] });
    });
    if (current !== version) return;
    accountReady = true;
    $('accountMessage').textContent = `Signed in as ${user.email}. Choose your payment method below.`;
    $('buyerEmail').value = user.email;
    $('paymentPanel').hidden = false;
    paymentInfo(); watchOrders(user, current);
  } catch {
    if (current !== version) return;
    $('accountMessage').textContent = 'Your login account is ready, but buyer setup could not complete. Check your connection and retry with this same account.';
    $('retryAccount').hidden = false;
  }
}
$('retryAccount').onclick = () => accountChanged(auth?.currentUser);
$('refreshOrders').onclick = () => { if (auth?.currentUser && accountReady) watchOrders(auth.currentUser, version); };
$('orderForm').onsubmit = async event => {
  event.preventDefault();
  const user = auth?.currentUser;
  if (!user || !accountReady || submitting || !readyMethod($('paymentMethod').value)) return;
  const buyerName = $('buyerName').value.trim(), paymentReference = $('paymentReference').value.trim();
  if (buyerName.length < 2 || paymentReference.length < 3) { $('orderMessage').textContent = 'Enter your full name and payment transaction reference.'; return; }
  const current = version;
  submitting = true; paymentInfo();
  $('orderMessage').textContent = 'Submitting payment for manual verification…';
  // Reuse the same random ID if a connection fails after a successful commit.
  try {
    const order = { buyerUid: user.uid, buyerEmail: user.email, buyerName, productId: PRODUCT_ID, amount: 149, paymentMethod: $('paymentMethod').value, paymentReference, note: $('note').value.trim(), status: 'payment_pending', createdAt: sdk.serverTimestamp() };
    draftOrder ||= { ref: sdk.doc(sdk.collection(db, 'orders')), data: order };
    try {
      await sdk.setDoc(draftOrder.ref, draftOrder.data);
    } catch (writeError) {
      // An acknowledged-late commit is recovered by reading our existing order;
      // rules forbid replacing it, so retries cannot overwrite status or metadata.
      const existing = await sdk.getDocFromServer(draftOrder.ref);
      if (!existing.exists() || existing.data().buyerUid !== user.uid || existing.data().paymentReference !== draftOrder.data.paymentReference) throw writeError;
    }
    if (current !== version) return;
    draftOrder = undefined;
    $('orderForm').reset(); $('buyerEmail').value = user.email;
    $('orderMessage').textContent = 'Payment submitted for verification. Access will be activated after payment is confirmed.';
  } catch {
    if (current === version) $('orderMessage').textContent = 'Submission could not be confirmed. Check your connection and retry; this submission will reuse its order ID.';
  } finally { submitting = false; paymentInfo(); }
};
$('logout').onclick = async () => {
  clearSession(); $('authPanel').hidden = true; $('password').value = ''; $('confirmPassword').value = '';
  $('accountMessage').textContent = 'Logging out…';
  try { await authSDK.signOut(auth); }
  catch { $('accountMessage').textContent = 'Logout failed. Please try Logout again. Order details remain hidden.'; }
};
async function boot() {
  if (Object.values(firebaseConfig).some(value => !value || value.includes('PASTE_'))) { $('accountMessage').textContent = 'Account setup is not configured yet. Please contact the seller.'; return; }
  try {
    const [appSDK, a, s] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
    ]);
    authSDK = a; sdk = s;
    const app = appSDK.initializeApp(firebaseConfig); auth = authSDK.getAuth(app); db = sdk.getFirestore(app);
    await authSDK.setPersistence(auth, authSDK.browserSessionPersistence);
    $('authForm').onsubmit = async event => {
      event.preventDefault(); if (working) return;
      if (signup && ($('password').value.length < 8 || $('password').value !== $('confirmPassword').value)) { $('accountMessage').textContent = 'Use at least 8 characters and matching passwords.'; return; }
      working = true;
      for (const id of ['authSubmit','loginMode','signupMode']) $(id).disabled = true;
      try { await authSDK[signup ? 'createUserWithEmailAndPassword' : 'signInWithEmailAndPassword'](auth, $('email').value.trim(), $('password').value); }
      catch (error) { $('accountMessage').textContent = error.code === 'auth/email-already-in-use' ? 'This email already has an account. Choose Log in to continue.' : 'Could not sign in or create your account. Check your details, password policy, and connection.'; }
      finally { $('password').value = ''; $('confirmPassword').value = ''; working = false; for (const id of ['authSubmit','loginMode','signupMode']) $(id).disabled = false; }
    };
    authSDK.onAuthStateChanged(auth, accountChanged, () => { clearSession(); $('accountMessage').textContent = 'Login unavailable. Reload to try again.'; });
    window.addEventListener('offline', () => { clearSession(); $('authPanel').hidden = true; $('accountMessage').textContent = 'Connect to submit payments and see current order status.'; });
    window.addEventListener('online', () => accountChanged(auth.currentUser));
  } catch { $('accountMessage').textContent = 'Could not connect to Firebase. Check your connection and reload.'; }
}
paymentInfo(); boot();
