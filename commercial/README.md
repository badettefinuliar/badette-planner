# My Everyday Planner — buyer access setup

The commercial page lives at `/commercial/index.html`. The root personal `index.html` is unchanged. Serve this folder over HTTP for development and HTTPS in production; ES modules do not work by opening the HTML as a local file. No build step is needed.

## 1. Paste the Firebase web configuration

Create a Firebase project and register a Web app in **Project settings → General → Your apps**. Copy the Firebase config values into the clearly marked object in **`commercial/firebase-config.js`**:

```js
export const firebaseConfig = {
  apiKey: 'your public Firebase web API key',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  appId: 'your Firebase web app ID',
};
export const PRODUCT_ID = 'my-everyday-planner';
```

These web identifiers are intentionally public. Never use a service-account key, admin credential, buyer password, or private key in browser files. Leaving the placeholders in place shows “Setup required” and keeps the planner locked. No Firebase project has been configured or deployed by this change.

## 2. Configure Authentication

In Firebase Authentication, enable **Email/Password** and add the deployed site's hostname to **Settings → Authorized domains**. Add localhost explicitly if testing locally. Enable email enumeration protection where available. Create each buyer in **Authentication → Users → Add user**, and provide their initial login securely. Use Firebase's supported password-reset flow or console workflow for forgotten passwords; this page does not create accounts or approve buyers. Authentication signup alone never grants access.

Login uses session persistence. The user must log in again after the browser tab/session ends. Logout ends authentication and hides the planner without deleting local planner data.

## 3. Create Firestore and publish the rules

Create the default Cloud Firestore database in production mode. Review and publish **`commercial/firestore.rules`** in the Firebase console's Firestore Rules editor **before enabling buyer access**. This ruleset is intended for a dedicated project/database; replacing rules in a shared project can affect other apps. Remove any existing broad allow rules: overlapping rules grant access if *any* matching allow succeeds.

Buyers can only get/watch `/buyers/{their-auth-uid}`. Collection listing and all browser writes are denied. Every other document path is denied. An administrator using the Firebase console or a trusted Admin SDK manages approvals; Admin SDK credentials never belong in the website. Firebase console/IAM administrators bypass these browser rules, so restrict administrator permissions too.

## 4. Approve a buyer

Copy the buyer's exact **UID from Authentication**, then create **buyers → document ID = that UID**. Store only access metadata:

```json
{
  "email": "buyer@example.com",
  "status": "approved",
  "allowedProducts": ["my-everyday-planner"]
}
```

`allowedProducts` must be an array of strings. The exact `approved` status and product ID are both required. Use `pending` or `revoked` to deny access, or remove the product/document. Missing documents and wrong/missing product permissions show **Access Pending Approval**. Email is informational; UID is the access identity, so an email change does not transfer approval to another account. Do not add bills, errands, savings, backups, or other financial information to these records. The client never writes Firestore documents, including pending records.

The page watches this single document and responds to approval/revocation changes. Cached access records never unlock the planner. An internet connection is required for fresh approval; network and permission errors stay locked with a retry option. Returning to the tab rechecks access. A malicious or modified browser can bypass a client-side UI gate; use a server-protected delivery/backend if tamper-resistant paid-content protection is required. These rules protect buyer access records, not downloadable static HTML or data already on a device.

## Local data and branding

Bills, errands, savings goals, personalization, and restored backups stay exclusively in **`commercial-planner-v1`** localStorage. Firebase Authentication manages its own login session; Firestore is used only for access metadata. The personal planner's `home-planner-v1` key is untouched. The editable title does not change the official product name in the header, login screen, browser title, or home-screen metadata.

The commercial storage key is shared by all commercial logins in the **same browser profile on the same origin**. Logging out does not erase it, and another approved person using that browser profile can see it. Use separate browser profiles/devices for different buyers. Back up before clearing site data or switching devices; no financial data sync or cloud recovery exists. Backup/Restore replaces only commercial planner data and never grants buyer approval. Backups contain financial data, so store them privately.

## Deployment and verification

Deploy **all** commercial files together, including `auth.js`, `planner.js`, and `firebase-config.js`; keep the root page untouched. Runtime requests require `www.gstatic.com` (pinned Firebase JS SDK 11.10.0), `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, and `firestore.googleapis.com`. Configure any hosting CSP/firewall accordingly. Do not disable TLS verification. No Analytics SDK is loaded.

For a local server, run `python3 -m http.server 8000` from the repository root. Browser regression checks use Playwright and an installed Chromium browser:

```sh
# Use an environment with Playwright available; install it outside the checkout if needed.
# Start the local server first. Set BASE_URL for another port.
CHROMIUM_PATH=/usr/bin/chromium node commercial/tests/access.cjs
```

These checks use intercepted Firebase modules and configuration **only in the test browser**, with no production bypass. They test UI behavior, not Firebase servers or deployed security rules. Before release, use your real Firebase project (or Firebase Emulator Suite) to verify correct and incorrect passwords, own-record read, other UID read denied, list denied, all buyer writes denied, approval/product checks, revocation, offline denial, logout, and a full backup/restore. Verify missing Firebase config keeps the planner locked. Live Firebase integration and rules enforcement remain unverified until a project is configured.
