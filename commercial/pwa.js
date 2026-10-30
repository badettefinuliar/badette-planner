const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
let deferredPrompt = null;

function addManifestLinks() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = './manifest.webmanifest';
    document.head.append(manifest);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'apple-touch-icon';
    icon.href = './app-icon.svg';
    document.head.append(icon);
  }
}

function installHelp() {
  const existing = document.getElementById('installHelpDialog');
  if (existing) { existing.showModal?.(); return; }
  const dialog = document.createElement('dialog');
  dialog.id = 'installHelpDialog';
  dialog.setAttribute('aria-labelledby', 'installHelpTitle');
  dialog.innerHTML = `
    <div class="install-help-inner">
      <p class="eyebrow">Install My Everyday Planner</p>
      <h2 id="installHelpTitle">Add it to your Home Screen</h2>
      <p>On iPhone or iPad, tap the <strong>Share</strong> button in Safari, then choose <strong>Add to Home Screen</strong>.</p>
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
  if (dialog.showModal) dialog.showModal(); else alert('To install My Everyday Planner on iPhone/iPad: open this page in Safari, tap Share, then choose Add to Home Screen.');
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
  button.hidden = true;
  header.insertBefore(actions, logout || null);
  actions.append(button);
  if (logout) actions.append(logout);
  button.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      await prompt.userChoice.catch(() => null);
      button.hidden = true;
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
    try { await navigator.serviceWorker.register('./service-worker.js', { scope: './' }); }
    catch { /* Installation remains optional; planner access still works normally. */ }
  }
  if (!button || isStandalone()) return;
  if (isIOS()) button.hidden = false;
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
