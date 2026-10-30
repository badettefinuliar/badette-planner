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

These web identifiers are intentionally public. Never use a service-account key, admin credential, buyer password, or private key in browser files. The existing configured Firebase Web app is reused by signup and the admin dashboard. Leaving placeholders in place shows “Setup required” and keeps the planner locked. This signup change does not create a project or deploy rules.

## 2. Configure Authentication

In Firebase Authentication, enable **Email/Password** and add the deployed site's hostname to **Settings → Authorized domains**. Add localhost explicitly if testing locally. Enable email enumeration protection where available. Customers can now choose **Create account** on the commercial login page and sign up with email/password. The form requires at least eight characters and matching confirmation; Firebase also enforces any stronger project password policy. Existing users choose **Already have an account? Log in**. You can still provision accounts through the console if needed. Use Firebase's supported password-reset flow or console workflow for forgotten passwords. Authentication signup alone never grants access, and passwords are never stored in Firestore.

Login uses session persistence. The user must log in again after the browser tab/session ends. Logout ends authentication and hides the planner without deleting local planner data.

## 3. Create Firestore and publish the rules

Create the default Cloud Firestore database in production mode. Review and publish **`commercial/firestore.rules`** in the Firebase console's Firestore Rules editor **before enabling buyer access**. This ruleset is intended for a dedicated project/database; replacing rules in a shared project can affect other apps. Remove any existing broad allow rules: overlapping rules grant access if *any* matching allow succeeds.

Buyers can only get/watch `/buyers/{their-auth-uid}` and cannot list buyer records or update existing ones. The seller dashboard at `/admin/` uses `/admins/{uid}` membership to allow authorized admins to list/read buyers and update only access status and allowed products. Membership writes, buyer deletion, and unrelated database access are denied. A signed-in user may create only their own missing buyer record with the exact authenticated email, pending status, and no products; they cannot update an existing record. See [admin setup](../admin/README.md) to grant your UID access. Firebase console or a trusted Admin SDK manages membership and can provision initial records; Admin SDK credentials never belong in the website. Firebase console/IAM administrators bypass these browser rules, so restrict administrator permissions too.

## 4. Approve a buyer

Signup automatically creates **buyers → document ID = the Authentication UID** with only this access metadata (initial status `pending`, `allowedProducts: []`). Approve a pending customer in `/admin/`, or update their existing document through the console. Approved records look like:

```json
{
  "email": "buyer@example.com",
  "status": "approved",
  "allowedProducts": ["my-everyday-planner"]
}
```

`allowedProducts` must be an array of strings. The exact `approved` status and product ID are both required. Use `pending` or `revoked` to deny access, or remove the product/document. Missing documents and wrong/missing product permissions show **Access Pending Approval**. Email is informational; UID is the access identity, so an email change does not transfer approval to another account. Do not add bills, errands, savings, backups, or other financial information to these records. The customer client writes only the initial pending access record when it is missing. It cannot approve itself, change products/status, or overwrite an existing record. All financial data stays local.

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
CHROMIUM_PATH=/usr/bin/chromium node commercial/tests/signup.cjs
```

These checks use intercepted Firebase modules and configuration **only in the test browser**, with no production bypass. They test UI behavior, not Firebase servers or deployed security rules. Before release, use your real Firebase project (or Firebase Emulator Suite) to verify correct and incorrect passwords, own-record read, other UID read denied, list denied, only valid own pending-record creation allowed, buyer updates denied, approval/product checks, revocation, offline denial, logout, and a full backup/restore. Verify missing Firebase config keeps the planner locked. Live Firebase integration and deployed rules enforcement must also be verified against the configured project.

## Signup rollout and recovery

Publish the updated `commercial/firestore.rules` to the existing Firebase project's default database **before releasing signup**. Rules deployment is separate from merging/publishing the static page. Existing approved-user login still needs only a read when its buyer document exists. Signup cannot provision a pending record until the new rules are published.

After creating an Auth account, the page uses a Firestore transaction to read `/buyers/{uid}` and create `{ email: user.email, status: "pending", allowedProducts: [] }` only if missing. It then shows **Access Pending Approval** with “Your account is ready. Access is pending approval.” and Logout. Pending and revoked users remain blocked; admin approval unlocks the existing planner via its access listener.

The transaction also runs on login and session recovery. If Auth signup succeeded but the Firestore write failed, the user should **log in with that same account**, then retry after connectivity/rules are fixed. Do not create another account. An “email already in use” signup failure links back to login and does not overwrite access. Existing pending, approved, revoked, and other product permissions are preserved, including when concurrent writes cause a transaction retry. No password, bill, errand, savings, backup, or personalization data is included in the pending record.

Admin setup and permissions remain in [the admin guide](../admin/README.md). Security tests for exact-field creation, UID/email checks, no self-approval, duplicate protection, and existing admin permissions are in `admin/tests/rules.cjs`; see that guide for emulator instructions.
