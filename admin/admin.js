// Reuse the commercial app's existing Firebase project, never an admin credential.
import { createOrdersPanel } from './orders.js';
import { firebaseConfig, PRODUCT_ID } from '../commercial/firebase-config.js';

const $ = id => document.getElementById(id);
let auth, authSDK, storeSDK, store;
let stopAdmin = () => {}, stopBuyers = () => {};
let session = 0, listVersion = 0, verifiedAdmin = false;
let selectedStatus = 'pending';
const busy = new Set();
let activeSection = 'buyers';
const ordersPanel = createOrdersPanel({
  context: () => ({ auth, sdk: storeSDK, db: store, authorized: verifiedAdmin, session }),
  failure: () => { reset(); screen('Orders unavailable', 'Check your connection and admin permission, then retry.', { retry: true }); },
});
function showSection() {
  $('buyerPanel').hidden = activeSection !== 'buyers';
  $('ordersPanel').hidden = activeSection !== 'orders';
  clearBuyers(); ordersPanel.stop();
  if (activeSection === 'orders') ordersPanel.start(); else loadBuyers();
}
$('workspaceTabs').onclick = event => {
  const button = event.target.closest('button[data-section]');
  if (!button || !verifiedAdmin) return;
  activeSection = button.dataset.section;
  $('workspaceTabs').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  showSection();
};

function clearBuyers() {
  listVersion++;
  stopBuyers();
  stopBuyers = () => {};
  $('buyers').replaceChildren();
  $('listMessage').textContent = '';
  $('actionMessage').textContent = '';
  busy.clear();
}
function screen(title, message, { login = false, retry = false } = {}) {
  verifiedAdmin = false;
  ordersPanel.stop();
  clearBuyers();
  $('dashboard').hidden = true;
  $('gate').hidden = false;
  $('gateTitle').textContent = title;
  $('gateMessage').textContent = message;
  $('loginForm').hidden = !login;
  $('retry').hidden = !retry;
}
function reset() {
  session++;
  stopAdmin();
  stopAdmin = () => {};
}
function checkAdmin(user) {
  reset();
  const current = session;
  $('logout').hidden = !user;
  if (!user) {
    screen('Admin login', 'Use your authorized seller account.', { login: true });
    return;
  }
  screen('Checking admin access…', 'Confirming your administrator permission.');
  stopAdmin = storeSDK.onSnapshot(storeSDK.doc(store, 'admins', user.uid), { includeMetadataChanges: true }, snapshot => {
    if (current !== session) return;
    if (snapshot.metadata.fromCache) {
      screen('Connection required', 'Connect to the internet to verify current admin access.', { retry: true });
    } else if (!snapshot.exists()) {
      screen('Admin access required', 'This account is not authorized to manage buyer access. Contact the owner.', { retry: true });
    } else {
      verifiedAdmin = true;
      $('gate').hidden = true;
      $('dashboard').hidden = false;
      showSection();
    }
  }, () => {
    if (current === session) screen('Unable to verify admin access', 'Check your connection or contact the owner. Buyer records remain hidden.', { retry: true });
  });
}

function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}
function renderBuyer(record) {
  // Deliberately project only access fields. Never render arbitrary document fields.
  const buyer = record.data();
  const email = typeof buyer.email === 'string' ? buyer.email : 'Email not provided';
  const products = Array.isArray(buyer.allowedProducts) ? buyer.allowedProducts.filter(p => typeof p === 'string') : [];
  const card = text('article', '', 'card buyer');
  card.append(text('h2', email));
  const details = document.createElement('dl');
  for (const [label, value] of [['Status', buyer.status], ['Allowed products', products.join(', ') || 'None'], ['UID', record.id]]) {
    details.append(text('dt', label), text('dd', value, label === 'Status' ? 'badge ' + selectedStatus : ''));
  }
  card.append(details);
  const actions = text('div', '', 'actions');
  const operations = buyer.status === 'revoked' ? [['Restore access', 'approved']] : buyer.status === 'approved' ? [['Revoke', 'revoked']] : [['Approve', 'approved'], ['Revoke', 'revoked']];
  for (const [label, status] of operations) {
    const button = text('button', label, status === 'revoked' ? 'revoke' : 'primary');
    button.type = 'button';
    button.setAttribute('aria-label', `${label}: ${email}`);
    button.disabled = busy.has(record.id);
    button.onclick = () => changeAccess(record.id, status, card);
    actions.append(button);
  }
  card.append(actions);
  return card;
}
function loadBuyers() {
  clearBuyers();
  if (!verifiedAdmin || !auth.currentUser) return;
  const current = session, version = listVersion;
  $('listMessage').textContent = 'Loading buyers…';
  const buyersQuery = storeSDK.query(storeSDK.collection(store, 'buyers'), storeSDK.where('status', '==', selectedStatus));
  stopBuyers = storeSDK.onSnapshot(buyersQuery, { includeMetadataChanges: true }, snapshot => {
    if (current !== session || version !== listVersion || !verifiedAdmin) return;
    $('buyers').replaceChildren();
    if (snapshot.metadata.fromCache) {
      $('listMessage').textContent = 'Waiting for a fresh connection. Cached buyer records are hidden.';
      return;
    }
    $('buyers').append(...snapshot.docs.map(renderBuyer));
    $('listMessage').textContent = snapshot.empty ? `No ${selectedStatus} buyers.` : `${snapshot.size} ${selectedStatus} buyer${snapshot.size === 1 ? '' : 's'}.`;
  }, () => {
    if (current !== session || version !== listVersion) return;
    // Also recheck the admin record: permission may have been removed mid-session.
    reset();
    screen('Buyer access unavailable', 'Unable to read buyer records. Check your connection and admin permission, then retry.', { retry: true });
  });
}
async function changeAccess(uid, status, card) {
  if (!verifiedAdmin || !auth.currentUser || busy.has(uid)) return;
  if (!confirm(`${status === 'revoked' ? 'Revoke' : 'Approve / restore'} My Everyday Planner access for this buyer?`)) return;
  const current = session, version = listVersion, adminUid = auth.currentUser.uid;
  busy.add(uid);
  card.querySelectorAll('button').forEach(button => { button.disabled = true; });
  $('actionMessage').textContent = 'Saving access…';
  try {
    // Transactions require a server connection and preserve concurrent product changes.
    // Re-read membership inside the transaction; security rules enforce it independently.
    await storeSDK.runTransaction(store, async transaction => {
      const admin = await transaction.get(storeSDK.doc(store, 'admins', adminUid));
      if (!admin.exists() || current !== session || !verifiedAdmin) throw new Error('Admin access changed');
      const ref = storeSDK.doc(store, 'buyers', uid);
      const buyer = await transaction.get(ref);
      if (!buyer.exists()) throw new Error('Buyer no longer exists');
      if (status === 'approved') {
        const products = buyer.data().allowedProducts;
        if (products !== undefined && (!Array.isArray(products) || products.some(p => typeof p !== 'string'))) throw new Error('Invalid access record');
        transaction.update(ref, { status, allowedProducts: [...new Set([...(products || []), PRODUCT_ID])] });
      } else {
        transaction.update(ref, { status });
      }
    });
    if (current === session && version === listVersion) $('actionMessage').textContent = status === 'approved' ? 'Buyer access approved.' : 'Buyer access revoked. The record has been kept.';
  } catch {
    if (current === session && version === listVersion) $('actionMessage').textContent = 'Access was not saved. Check your connection and admin permission, then refresh and try again.';
  } finally {
    busy.delete(uid);
    if (current === session && version === listVersion) card.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}
$('filters').onclick = event => {
  const button = event.target.closest('button[data-status]');
  if (!button || !verifiedAdmin) return;
  selectedStatus = button.dataset.status;
  $('filters').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  loadBuyers();
};
$('refresh').onclick = loadBuyers;
$('retry').onclick = () => checkAdmin(auth?.currentUser);
$('logout').onclick = async () => {
  reset();
  screen('Logging out…', 'Closing the seller workspace.');
  $('logout').disabled = true;
  try { await authSDK.signOut(auth); checkAdmin(null); }
  catch { screen('Logout failed', 'Buyer records remain hidden. Please try Logout again.'); }
  finally { $('logout').disabled = false; }
};
async function boot() {
  if (Object.values(firebaseConfig).some(value => !value || value.includes('PASTE_'))) {
    screen('Setup required', 'Configure the existing Firebase Web app in commercial/firebase-config.js.');
    return;
  }
  try {
    const [appSDK, authentication, firestore] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
    ]);
    authSDK = authentication;
    storeSDK = firestore;
    const app = appSDK.initializeApp(firebaseConfig);
    auth = authSDK.getAuth(app);
    await authSDK.setPersistence(auth, authSDK.browserSessionPersistence);
    store = storeSDK.getFirestore(app); // Default memory cache only; no persistent buyer cache.
    $('loginForm').onsubmit = async event => {
      event.preventDefault();
      $('loginSubmit').disabled = true;
      $('gateMessage').textContent = 'Logging in…';
      try { await authSDK.signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value); }
      catch { screen('Admin login', 'Login failed. Check your email/password and connection, then try again.', { login: true }); }
      finally { $('password').value = ''; $('loginSubmit').disabled = false; }
    };
    authSDK.onAuthStateChanged(auth, checkAdmin, () => {
      reset(); screen('Login unavailable', 'Reload the page to try again.');
    });
    window.addEventListener('offline', () => { reset(); screen('Connection required', 'Connect to verify admin access and manage buyers.', { retry: true }); });
    window.addEventListener('online', () => checkAdmin(auth.currentUser));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { reset(); screen('Workspace locked', 'Return to this tab to verify admin access.'); }
      else checkAdmin(auth.currentUser);
    });
    window.addEventListener('pageshow', event => { if (event.persisted) checkAdmin(auth.currentUser); });
  } catch { screen('Login unavailable', 'Could not connect to Firebase. Check your connection and reload.'); }
}
boot();
