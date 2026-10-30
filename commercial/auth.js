import { firebaseConfig, PRODUCT_ID } from './firebase-config.js';
import { initializePlanner } from './planner.js';

const $ = id => document.getElementById(id);
let auth, signOutUser, watchAccess, ensureBuyer;
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
async function checkBuyer(user) {
  resetAccess();
  const current = generation;
  $('logout').hidden = !user;
  if (!user) {
    screen('Welcome back', 'Log in with your email and password, or create an account to request access.', { login: true });
    return;
  }
  screen('Checking your access…', 'Confirming your buyer approval.');
  // Create only a missing pending record. Transactions never replace existing access.
  try {
    await ensureBuyer(user);
  } catch {
    if (current === generation) screen('Unable to prepare your account', 'Your login account is ready, but we could not confirm your buyer record. Check your connection and try again. If you just signed up, do not create another account: log in and retry.', { retry: true });
    return;
  }
  if (current !== generation) return;
  // Only buyer access metadata is synchronized; planner data stays on this device.
  stopAccess = watchAccess(user.uid, snapshot => {
    if (current !== generation) return;
    if (snapshot.metadata.fromCache) {
      screen('Connection required', 'Please connect to the internet so we can verify your current approval.', { retry: true });
      return;
    }
    const buyer = snapshot.exists() ? snapshot.data() : null;
    if (buyer?.status !== 'approved' || !Array.isArray(buyer.allowedProducts) || !buyer.allowedProducts.includes(PRODUCT_ID)) {
      screen('Access Pending Approval', buyer?.status === 'pending' ? 'Your account is ready. Access is pending approval.' : 'Your account is signed in, but access to My Everyday Planner is not currently approved. Please contact the seller with your purchase email.', { retry: true });
      return;
    }
    try {
      // planner.js initializes once per page load, so account switches force a
      // reload. This prevents the previous buyer's in-memory planner data from
      // remaining visible after another account signs in on the same browser.
      if (plannerUserUid && plannerUserUid !== user.uid) {
        location.reload();
        return;
      }
      installScopedPlannerStorage(user.uid);
      plannerUserUid = user.uid;
      initializePlanner();
      $('accessGate').hidden = true;
      $('planner').hidden = false;
    } catch {
      screen('Planner could not open', 'Please reload the page and try again. Your local data has not been removed.');
    }
  }, () => {
    if (current !== generation) return;
    screen('Unable to verify access', 'We could not confirm your approval. Check your connection or contact the seller if this continues.', { retry: true });
  });
}

function clearPasswords() {
  ['loginPassword', 'signupPassword', 'signupConfirm'].forEach(id => { $(id).value = ''; });
  $('signupConfirm').setCustomValidity('');
}
function setSubmitting(value) {
  submitting = value;
  ['loginSubmit', 'signupSubmit', 'showSignup', 'showLogin'].forEach(id => { $(id).disabled = value; });
}
$('showSignup').onclick = () => {
  clearPasswords();
  screen('Create your account', 'Sign up to request access to My Everyday Planner.', { signup: true });
  $('signupEmail').focus();
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
    // Start the next login with a clean JS memory state. Per-user planner data
    // remains stored locally under that user's UID-scoped key.
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
    // Session-only auth: closing the tab ends login; planner data remains local.
    await authSDK.setPersistence(auth, authSDK.browserSessionPersistence);
    signOutUser = authSDK.signOut;
    const store = storeSDK.getFirestore(app);
    ensureBuyer = user => storeSDK.runTransaction(store, async transaction => {
      const ref = storeSDK.doc(store, 'buyers', user.uid);
      const existing = await transaction.get(ref);
      if (!existing.exists()) {
        // Auth supplies the canonical email; passwords never enter this document.
        if (!user.email) throw new Error('An email account is required');
        transaction.set(ref, { email: user.email, status: 'pending', allowedProducts: [] });
      }
    });
    watchAccess = (uid, next, error) => storeSDK.onSnapshot(
      storeSDK.doc(store, 'buyers', uid), { includeMetadataChanges: true }, next, error
    );
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
    $('signupForm').onsubmit = async event => {
      event.preventDefault();
      if (submitting) return;
      const password = $('signupPassword').value;
      if (password.length < 8) {
        $('accessMessage').textContent = 'Choose a password with at least 8 characters.';
        return;
      }
      if (password !== $('signupConfirm').value) {
        $('signupConfirm').setCustomValidity('The passwords do not match.');
        $('signupConfirm').reportValidity();
        $('accessMessage').textContent = 'The passwords do not match. Please try again.';
        return;
      }
      setSubmitting(true);
      $('accessMessage').textContent = 'Creating your account…';
      try {
        // The auth listener prepares the pending record, including after a reload.
        await authSDK.createUserWithEmailAndPassword(auth, $('signupEmail').value.trim(), password);
      } catch (error) {
        const message = error.code === 'auth/email-already-in-use'
          ? 'An account already uses this email. Log in to continue. Any existing buyer access will be kept.'
          : error.code === 'auth/weak-password' || error.code === 'auth/password-does-not-meet-requirements'
            ? 'Please choose a stronger password that meets the account password policy.'
            : error.code === 'auth/too-many-requests'
              ? 'Too many attempts. Please wait before trying again.'
              : 'Could not create your account. Check your email and connection, then try again.';
        screen('Create your account', message, { signup: true });
      } finally {
        clearPasswords();
        setSubmitting(false);
      }
    };
    authSDK.onAuthStateChanged(auth, checkBuyer, () => {
      resetAccess();
      screen('Login unavailable', 'Please reload and try again.');
    });
    // Revalidate after tab switching or restoring a cached browser page.
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
