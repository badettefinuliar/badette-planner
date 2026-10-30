import { firebaseConfig, PRODUCT_ID } from './firebase-config.js';
import { initializePlanner } from './planner.js';

const $ = id => document.getElementById(id);
let auth, signOutUser, watchAccess;
let stopAccess = () => {};
let generation = 0;

function screen(title, message, { login = false, retry = false } = {}) {
  $('planner').hidden = true;
  $('accessGate').hidden = false;
  $('accessTitle').textContent = title;
  $('accessMessage').textContent = message;
  $('loginForm').hidden = !login;
  $('retryAccess').hidden = !retry;
}
function resetAccess() {
  generation++;
  stopAccess();
  stopAccess = () => {};
}
function checkBuyer(user) {
  resetAccess();
  const current = generation;
  $('logout').hidden = !user;
  if (!user) {
    screen('Welcome back', 'Log in with the email and password provided for your purchase.', { login: true });
    return;
  }
  screen('Checking your access…', 'Confirming your buyer approval.');
  // Only access metadata is read; no planner data is sent to Firebase.
  stopAccess = watchAccess(user.uid, snapshot => {
    if (current !== generation) return;
    if (snapshot.metadata.fromCache) {
      screen('Connection required', 'Please connect to the internet so we can verify your current approval.', { retry: true });
      return;
    }
    const buyer = snapshot.exists() ? snapshot.data() : null;
    if (buyer?.status !== 'approved' || !Array.isArray(buyer.allowedProducts) || !buyer.allowedProducts.includes(PRODUCT_ID)) {
      screen('Access Pending Approval', 'Your account is signed in, but access to My Everyday Planner has not been approved yet. Please contact the seller with your purchase email.', { retry: true });
      return;
    }
    try {
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

$('retryAccess').onclick = () => checkBuyer(auth?.currentUser);
$('logout').onclick = async () => {
  resetAccess();
  screen('Logging out…', 'Closing your planner.');
  $('logout').disabled = true;
  try {
    await signOutUser(auth);
    checkBuyer(null);
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
    watchAccess = (uid, next, error) => storeSDK.onSnapshot(
      storeSDK.doc(store, 'buyers', uid), { includeMetadataChanges: true }, next, error
    );
    $('loginForm').onsubmit = async event => {
      event.preventDefault();
      $('loginSubmit').disabled = true;
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
        $('loginPassword').value = '';
        $('loginSubmit').disabled = false;
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
