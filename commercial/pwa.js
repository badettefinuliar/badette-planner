const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
let deferredPrompt = null;

function addManifestLinks() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = './manifest.webmanifest?v=20261030d';
    document.head.append(manifest);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'apple-touch-icon';
    icon.href = './icon-192.png?v=20261030d';
    document.head.append(icon);
  }
  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.append(favicon);
  }
  favicon.type = 'image/png';
  favicon.href = './icon-192.png?v=20261030d';
}

function addBranding() {
  if (!document.getElementById('plannerBrandStyle')) {
    const style = document.createElement('style');
    style.id = 'plannerBrandStyle';
    style.textContent = `
      .planner-brand{display:inline-flex;align-items:center;gap:10px;min-width:0}
      .planner-brand-icon{width:42px;height:42px;border-radius:12px;display:block;box-shadow:0 4px 12px #7e4c5d22;flex:none}
      .planner-welcome-icon{width:78px;height:78px;border-radius:22px;display:block;margin:0 0 10px;box-shadow:0 8px 22px #7e4c5d22}
      @media(max-width:480px){.planner-brand-icon{width:36px;height:36px;border-radius:10px}.planner-brand{gap:8px}.product-header{align-items:flex-start;flex-wrap:wrap}}
    `;
    document.head.append(style);
  }

  const header = document.querySelector('.product-header');
  const title = header?.querySelector('strong');
  if (header && title && !document.getElementById('plannerHeaderIcon')) {
    const wrap = document.createElement('span');
    wrap.className = 'planner-brand';
    title.parentNode.insertBefore(wrap, title);
    const icon = document.createElement('img');
    icon.id = 'plannerHeaderIcon';
    icon.className = 'planner-brand-icon';
    icon.src = './icon-192.png?v=20261030d';
    icon.alt = '';
    icon.width = 42;
    icon.height = 42;
    wrap.append(icon, title);
  }

  const gate = document.getElementById('accessGate');
  const eyebrow = gate?.querySelector('.eyebrow');
  if (gate && eyebrow && !document.getElementById('plannerWelcomeIcon')) {
    const icon = document.createElement('img');
    icon.id = 'plannerWelcomeIcon';
    icon.className = 'planner-welcome-icon';
    icon.src = './icon-192.png?v=20261030d';
    icon.alt = 'My Everyday Planner notebook icon';
    icon.width = 78;
    icon.height = 78;
    gate.insertBefore(icon, eyebrow);
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
    : 'Keep this page open in Chrome for a short while, then tap <strong>Install App</strong> again. You can also open Chrome’s <strong>⋮</strong> menu and look for <strong>Install app</strong>. If you only see Add to Home screen, reload once so Chrome can refresh the new app manifest.';
  dialog.innerHTML = `
    <div class="install-help-inner">
      <p class="eyebrow">Install My Everyday Planner</p>
      <h2 id="installHelpTitle">Install the planner app</h2>
      <p>${instructions}</p>
      <p class="meta">A full install opens My Everyday Planner in its own app-style window and uses the planner notebook icon.</p>
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
    : 'Keep the planner open in Chrome briefly, reload once, then use Install App or Chrome menu > Install app.');
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
  addBranding();
  const button = addInstallButton();
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js?v=20261030d', { scope: './', updateViaCache: 'none' });
      registration.update().catch(() => {});
    } catch { /* Installation remains optional; planner access still works normally. */ }
  }
  if (!button) return;
  if (isStandalone()) {
    button.hidden = true;
    return;
  }
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
