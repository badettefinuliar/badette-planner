const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
let deferredPrompt = null;

function addManifestLinks() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = './manifest.webmanifest?v=20261030b';
    document.head.append(manifest);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'apple-touch-icon';
    icon.href = './app-icon.svg?v=20261030b';
    document.head.append(icon);
  }
}

function installHelp() {
  const existing = document.getElementById('installHelpDialog');
  if (existing) { existing.showModal?.(); return; }
  const dialog = document.createElement('dialog');
  dialog.id = 'installHelpDialog';
  dialog.setAttribute('aria-labelledby', 'installHelpTitle');
  const instructions = isIOS()
    ? 'On iPhone or iPad, open this page in Safari, tap the <strong>Share</strong> button, then choose <strong>Add to Home Screen</strong>.'
    : 'Open your browser menu (usually <strong>⋮</strong>) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. If you do not see it yet, reload this page once and try again.';
  dialog.innerHTML = `
    <div class="install-help-inner">
      <p class="eyebrow">Install My Everyday Planner</p>
      <h2 id="installHelpTitle">Add it to your Home Screen</h2>
      <p>${instructions}</p>
      <p class="meta">After installation, My Everyday Planner opens in its own app-style window.</p>
      <button type="button" class="pri" id="closeInstallHelp">Got it</button>
    </div>`;
  const style = document.createElement('style');
  style.textContent = `
    #installHelpDialog{max-width:420px;width:calc(100% - 32px);border:1px solid var(--line);border-radius:20px;padding:0;background:var(--card);color:var(--ink)}
    #installHelpDialog::backdrop{background:#2b223355}
    .install-help-inner{padding:22px}
    .install-help-inner h2{margin:4px 0 12px}
    .install-help-inner p{line-height:1.5}
    #installApp{white-space:nowrap}
  `;
  document.head.append(style);
  document.body.append(dialog);
  dialog.querySelector('#closeInstallHelp').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  if (dialog.showModal) dialog.showModal();
  else alert(isIOS()
    ? 'To install My Everyday Planner: open this page in Safari, tap Share, then Add to Home Screen.'
    : 'To install My Everyday Planner: open your browser menu and choose Install app or Add to Home screen.');
}

function addInstallButton() {
  const header = document.querySelector('.product-header');
  if (!header || document.getElementById('installApp')) return null;
  const logout = document.getElementById('logout');
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.alignItems = 'center';
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'installApp';
  button.className = 'sm';
  button.textContent = 'Install App';
  header.insertBefore(actions, logout || null);
  actions.append(button);
  if (logout) actions.append(logout);
  button.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') button.hidden = true;
      return;
    }
    installHelp();
  });
  return button;
}

async function setupPWA() {
  addManifestLinks();
  const button = addInstallButton();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./service-worker.js?v=20261030b', { scope: './' }); }
    catch { /* Installation remains optional; planner access still works normally. */ }
  }
  if (!button) return;
  if (isStandalone()) {
    button.hidden = true;
    return;
  }
  // Keep the button visible even before the browser emits beforeinstallprompt.
  // This gives every buyer a clear install path instead of silently hiding it.
  button.hidden = false;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    button.hidden = true;
  });
}

setupPWA();
