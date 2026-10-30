import { firebaseConfig, PRODUCT_ID } from '../commercial/firebase-config.js';

const $ = id => document.getElementById(id);
const panel = document.createElement('section');
panel.id = 'emailVerificationPanel';
panel.className = 'verification-panel';
panel.hidden = true;
panel.innerHTML = `
  <p class="eyebrow">One quick security step</p>
  <h3>Verify your email</h3>
  <p id="verificationText">Please verify your email address before submitting payment.</p>
  <div class="verification-actions">
    <button type="button" id="sendVerification" class="primary">Send verification email</button>
    <button type="button" id="checkVerification" class="secondary">I've verified my email</button>
  </div>
  <p id="verificationMessage" class="muted" role="status" aria-live="polite"></p>`;

const style = document.createElement('style');
style.textContent = `
  .verification-panel{border:1px solid #eadfe3;border-radius:16px;padding:18px;margin:16px 0;background:#fffdf9}
  .verification-panel h3{margin:4px 0 8px}
  .verification-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  body.email-unverified #paymentPanel{display:none!important}
`;
document.head.append(style);
$('paymentPanel')?.before(panel);

let authSDK, auth, storeSDK, db, currentUser = null;
let sending = false;

function setMessage(text) {
  const node = $('verificationMessage');
  if (node) node.textContent = text;
}

function lockPayment() {
  document.body.classList.add('email-unverified');
  panel.hidden = false;
  if ($('submitOrder')) $('submitOrder').disabled = true;
}

function unlockPayment() {
  document.body.classList.remove('email-unverified');
  panel.hidden = true;
}

async function alreadyHasAccess(user) {
  try {
    const snap = await storeSDK.getDoc(storeSDK.doc(db, 'buyers', user.uid));
    if (!snap.exists()) return false;
    const buyer = snap.data();
    return buyer.status === 'approved' && Array.isArray(buyer.allowedProducts) && buyer.allowedProducts.includes(PRODUCT_ID);
  } catch {
    return false;
  }
}

async function applyVerificationState(user) {
  currentUser = user || null;
  if (!user) {
    unlockPayment();
    return;
  }
  await authSDK.reload(user).catch(() => {});
  if (user.emailVerified || await alreadyHasAccess(user)) {
    unlockPayment();
    return;
  }
  lockPayment();
  if ($('verificationText')) $('verificationText').textContent = `We sent access to ${user.email}. Verify this address before submitting payment.`;
  if ($('accountMessage')) $('accountMessage').textContent = `Signed in as ${user.email}. Verify your email before submitting payment.`;
}

$('sendVerification').onclick = async () => {
  if (!currentUser || sending) return;
  sending = true;
  $('sendVerification').disabled = true;
  setMessage('Sending verification email…');
  try {
    await authSDK.sendEmailVerification(currentUser);
    setMessage('Verification email sent. Open it, tap the verification link, then return here and choose “I’ve verified my email.”');
  } catch (error) {
    setMessage(error?.code === 'auth/too-many-requests'
      ? 'Too many verification emails were requested. Please try again later.'
      : 'Could not send the verification email. Check your connection and try again.');
  } finally {
    sending = false;
    $('sendVerification').disabled = false;
  }
};

$('checkVerification').onclick = async () => {
  if (!currentUser) return;
  $('checkVerification').disabled = true;
  setMessage('Checking your email status…');
  try {
    await authSDK.reload(currentUser);
    if (!currentUser.emailVerified) {
      setMessage('Not verified yet. Open the verification email and tap its link, then try again.');
      return;
    }
    await currentUser.getIdToken(true);
    setMessage('Email verified. Reloading checkout…');
    location.reload();
  } catch {
    setMessage('Could not refresh your verification status. Check your connection and try again.');
  } finally {
    $('checkVerification').disabled = false;
  }
};

async function bootVerification() {
  try {
    const [appSDK, a, s] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
    ]);
    authSDK = a;
    storeSDK = s;
    const app = appSDK.getApps().length ? appSDK.getApp() : appSDK.initializeApp(firebaseConfig);
    auth = authSDK.getAuth(app);
    db = storeSDK.getFirestore(app);
    authSDK.onAuthStateChanged(auth, user => applyVerificationState(user));
  } catch {
    setMessage('Email verification could not load. Refresh the page before submitting payment.');
    lockPayment();
  }
}

bootVerification();
