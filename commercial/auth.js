import { firebaseConfig, PRODUCT_ID } from './firebase-config.js';
import { initializePlanner } from './planner.js';
import './pwa.js';

const $ = id => document.getElementById(id);
let auth, signOutUser, watchAccess, loadBuyerIdentity;
let submitting = false;
let stopAccess = () => {};
let generation = 0;
let plannerUserUid = null;

// The planner intentionally keeps personal data only on this device. Scope the
// commercial planner's localStorage key to the signed-in Firebase UID so two
// approved buyers using the same browser never see each other's local data.
const PLANNER_STORAGE_KEY = 'commercial-planner-v1';
let scopedStorageInstalled = false;
let scopedStorageUid = null;
function installScopedPlannerStorage(uid) {
  scopedStorageUid = uid;
  if (scopedStorageInstalled) return;
  scopedStorageInstalled = true;
  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const scopedKey = (storage, key) => storage === localStorage && key === PLANNER_STORAGE_KEY && scopedStorageUid
    ? `${PLANNER_STORAGE_KEY}:${scopedStorageUid}`
    : key;
  Storage.prototype.getItem = function(key) {
    return nativeGetItem.call(this, scopedKey(this, key));
  };
  Storage.prototype.setItem = function(key, value) {
    return nativeSetItem.call(this, scopedKey(this, key), value);
  };
  Storage.prototype.removeItem = function(key) {
    return nativeRemoveItem.call(this, scopedKey(this, key));
  };
}

function screen(title, message, { login = false, signup = false, retry = false } = {}) {
  $('planner').hidden = true;
  $('accessGate').hidden = false;
  $('accessTitle').textContent = title;
  $('accessMessage').textContent = message;
  $('loginForm').hidden = !login;
  $('signupNav').hidden = !login;
  $('signupForm').hidden = !signup;
  $('loginNav').hidden = !signup;
  $('retryAccess').hidden = !retry;
}
function resetAccess() {
  generation++;
  stopAccess();
  stopAccess = () => {};
}
function ensureBuyerIdentityUI() {
  let box = $('buyerIdentity');
  if (box) return box;
  const planner = $('planner');
  const eyebrow = planner?.querySelector('.eyebrow');
  if (!planner || !eyebrow) return null;
  box = document.createElement('div');
  box.id = 'buyerIdentity';
  box.style.margin = '0 0 10px';
  box.innerHTML = '<strong id="buyerGreeting"></strong><div id="buyerIdentityEmail" class="meta"></div>';
  eyebrow.insertAdjacentElement('afterend', box);
  return box;
}
async function renderBuyerIdentity(user) {
  const box = ensureBuyerIdentityUI();
  if (!box || !user) return;
  const fallbackName = user.displayName?.trim() || user.email?.split('@')[0] || 'there';
  $('buyerGreeting').textContent = `Hi, ${fallbackName} 👋`;
  $('buyerIdentityEmail').textContent = user.email || '';
  try {
    const name = await loadBuyerIdentity?.(user);
    if (name && auth?.currentUser?.uid === user.uid) $('buyerGreeting').textContent = `Hi, ${name} 👋`;
  } catch {
    // The greeting can safely keep the account/email fallback if orders are unavailable.
  }
}
async function checkBuyer(user) {
  resetAccess();
  const current = generation;
  $('logout').hidden = !user;
  if (!user) {
    screen('Welcome back', 'Log in with the email and password you used when buying your planner.', { login: true });
    return;
  }
  screen('Checking your access…', 'Confirming your buyer approval.');

  // Important: the planner never creates buyer records. Buyer records are
  // created only when a payment is submitted in the store.
  stopAccess = watchAccess(user.uid, snapshot => {
    if (current !== generation) return;
    if (snapshot.metadata.fromCache) {
      screen('Connection required', 'Please connect to the internet so we can verify your current approval.', { retry: true });
      return;
    }
    const buyer = snapshot.exists() ? snapshot.data() : null;
    if (!buyer) {
      screen('No payment submitted yet', 'This account has no payment submission yet. Return to the store to submit your payment for verification.', { retry: true });
      return;
    }
    if (buyer.status !== 'approved' || !Array.isArray(buyer.allowedProducts) || !buyer.allowedProducts.includes(PRODUCT_ID)) {
      screen('Access Pending Approval', buyer.status === 'pending' ? 'Your payment or access is still being reviewed. Return to the store to check your order status.' : 'This account does not currently have access to My Everyday Planner. Return to the store using the same email you used for your purchase.', { retry: true });
      return;
    }
    try {
      if (plannerUserUid && plannerUserUid !== user.uid) {
        location.reload();
        return;
      }
      installScopedPlannerStorage(user.uid);
      plannerUserUid = user.uid;
      initializePlanner();
      $('accessGate').hidden = true;
      $('planner').hidden = false;
      void renderBuyerIdentity(user);
    } catch {
      screen('Planner could not open', 'Please reload the page and try again. Your local data has not been removed.');
    }
  }, () => {
    if (current !== generation) return;
    screen('Unable to verify access', 'We could not confirm your approval. Check your connection or contact the seller if this continues.', { retry: true });
  });
}

function clearPasswords() {
  ['loginPassword', 'signupPassword', 'signupConfirm'].forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('signupConfirm')) $('signupConfirm').setCustomValidity('');
}
function setSubmitting(value) {
  submitting = value;
  ['loginSubmit', 'signupSubmit', 'showSignup', 'showLogin'].forEach(id => { if ($(id)) $(id).disabled = value; });
}
$('showSignup').onclick = () => {
  window.location.href = '../store/?signup=1';
};
$('showLogin').onclick = () => {
  clearPasswords();
  screen('Welcome back', 'Log in with your email and password.', { login: true });
  $('loginEmail').focus();
};
$('signupConfirm').oninput = event => event.target.setCustomValidity('');
$('signupPassword').oninput = () => $('signupConfirm').setCustomValidity('');
$('retryAccess').onclick = () => checkBuyer(auth?.currentUser);
$('logout').onclick = async () => {
  resetAccess();
  clearPasswords();
  screen('Logging out…', 'Closing your planner.');
  $('logout').disabled = true;
  try {
    await signOutUser(auth);
    location.reload();
  } catch {
    screen('Logout could not complete', 'Please try Logout again. The planner remains locked.');
  } finally {
    $('logout').disabled = false;
  }
};

async function boot() {
  if (Object.values(firebaseConfig).some(value => !value || value.includes('PASTE_'))) {
    screen('Setup required', 'My Everyday Planner is not connected yet. The seller needs to finish Firebase configuration before buyer login is available.');
    return;
  }
  try {
    const [appSDK, authSDK, storeSDK] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
    ]);
    const app = appSDK.initializeApp(firebaseConfig);
    auth = authSDK.getAuth(app);
    // Keep the approved buyer signed in on this device until they explicitly log out.
    await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
    signOutUser = authSDK.signOut;
    const store = storeSDK.getFirestore(app);
    watchAccess = (uid, next, error) => storeSDK.onSnapshot(
      storeSDK.doc(store, 'buyers', uid), { includeMetadataChanges: true }, next, error
    );
    loadBuyerIdentity = async user => {
      const q = storeSDK.query(storeSDK.collection(store, 'orders'), storeSDK.where('buyerUid', '==', user.uid));
      const snapshot = await storeSDK.getDocs(q);
      const records = snapshot.docs
        .map(doc => doc.data())
        .filter(order => order.productId === PRODUCT_ID && typeof order.buyerName === 'string' && order.buyerName.trim())
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      return records[0]?.buyerName?.trim() || '';
    };
    $('loginForm').onsubmit = async event => {
      event.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      $('accessMessage').textContent = 'Logging in…';
      try {
        await authSDK.signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPassword').value);
      } catch (error) {
        const message = error.code === 'auth/too-many-requests'
          ? 'Too many attempts. Please wait before trying again.'
          : error.code === 'auth/network-request-failed'
            ? 'Could not connect. Check your internet connection and try again.'
            : 'Login failed. Check your email and password, or contact the seller.';
        screen('Welcome back', message, { login: true });
      } finally {
        clearPasswords();
        setSubmitting(false);
      }
    };
    $('signupForm').onsubmit = event => {
      event.preventDefault();
      window.location.href = '../store/?signup=1';
    };
    authSDK.onAuthStateChanged(auth, checkBuyer, () => {
      resetAccess();
      screen('Login unavailable', 'Please reload and try again.');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        resetAccess();
        screen('Planner locked', 'Return to this tab to verify your access.');
      } else checkBuyer(auth.currentUser);
    });
    window.addEventListener('pageshow', event => { if (event.persisted) checkBuyer(auth.currentUser); });
    window.addEventListener('offline', () => {
      resetAccess();
      screen('Connection required', 'Connect to the internet to verify buyer access.', { retry: true });
    });
    window.addEventListener('online', () => checkBuyer(auth.currentUser));
  } catch {
    screen('Login unavailable', 'We could not connect to the login service. Check your connection, then reload. If this continues, contact the seller.');
  }
}
boot();
