# My Everyday Planner — admin dashboard

The seller app is at `/admin/`. It reuses **`../commercial/firebase-config.js`** and the existing Firebase Email/Password Authentication and default Firestore database. There are no separate project credentials, service-account keys, password records, financial records, or localStorage writes in this admin app. Deploy the complete `/admin/` folder alongside `/commercial/` over HTTPS. The root personal planner is unchanged.

## Add your own Firebase UID as an admin

1. In the **existing Firebase project's Authentication → Users**, find your account (or add your email/password account there). Copy your exact **User UID**, not your email address. Never paste your password into Firestore or this repository.
2. In **Firestore Database → Data**, create a collection named **`admins`**.
3. Create a document with its **document ID equal to your copied UID**. You may add a non-secret `label` string such as `Owner`, or leave the document empty if your tool allows it.
4. Review and publish the updated **`commercial/firestore.rules`** in the Firestore Rules editor before using `/admin/`.
5. Open `/admin/` on the deployed site and log in using your Firebase account. Add the site's hostname to Authentication's Authorized domains if it is not already configured.

**Any existing `/admins/{uid}` document grants admin access.** A boolean field does not control membership: `active: false` still grants access. To revoke an admin, delete their membership document using the console or a trusted server/Admin SDK. The website cannot add, edit, list, or remove admin memberships. Only the owner with appropriate Firebase console/IAM permissions should manage this collection. Never put Admin SDK credentials in browser code.

The dashboard waits for a server-confirmed membership document before requesting any buyer list. Non-admins see “Admin access required”; offline, cached membership, permission errors, and login failures never expose the list. Logout and permission removal clear rendered buyer records. Returning to the tab checks membership again. Authentication uses session persistence; buyer lists use the SDK's default in-memory cache, with no persistent Firestore cache enabled. Logging out of the same Firebase app in another same-origin session may affect the commercial login; buyer planner localStorage is not deleted.

## Buyer access records and controls

Create Authentication users and buyer records using the existing Firebase console workflow. This dashboard updates existing access records; it does not create user accounts, set passwords, or delete records. Each document ID in `/buyers` must be the buyer's Authentication UID:

```json
{
  "email": "buyer@example.com",
  "status": "pending",
  "allowedProducts": []
}
```

Records must have these three fields, with a string email, a status of `pending`, `approved`, or `revoked`, and an array of product-ID strings (maximum 50 products). Do not put passwords, financial data, or unrelated fields in these documents. The dashboard displays only email, status, allowed products, and UID, and does not fetch or display Authentication passwords. Missing/unknown statuses do not appear in the three status filters; normalize older records in the console.

- **Pending**: Approve or Revoke.
- **Approved**: Revoke.
- **Revoked**: Restore access.
- Approve and Restore set `status: "approved"` and add **`my-everyday-planner`** to `allowedProducts` without removing other product IDs or adding duplicates.
- Revoke sets `status: "revoked"` and preserves both the document and its existing allowed products. As in the commercial planner, the status denies access for the whole buyer record, including other products sharing that status.

Each change requires confirmation. A server transaction rechecks the admin membership and current buyer record, preserving concurrent product additions. Failed/offline changes report an error and are not queued for later. Buyer creation/deletion and email edits stay in the console. If old records lack required fields or contain unsupported extra fields, correct their metadata in the console before using the dashboard.

## Security rules

**`commercial/firestore.rules` is the single shared rules source for both apps.** Publish it to the same Firebase project's default Firestore database. Review any other apps using that database before replacing their rules; this ruleset deliberately denies unrelated access. Remove broad existing allow rules because matching rules are additive.

- A signed-in buyer may get/watch only `/buyers/{their UID}`.
- A listed admin may get/list buyer records and update only `status` and `allowedProducts` on valid access-metadata records.
- Ordinary buyers cannot self-approve or enumerate other buyers.
- Users can get only their own `/admins/{uid}` membership document. All client membership writes and membership listing are denied.
- Buyer create/delete, email changes, passwords/financial fields, and all unrelated database access are denied even to dashboard admins.

Firebase console/IAM and trusted Admin SDK access bypass Firestore rules. Restrict those separately. A modified static page cannot bypass these server rules, although static HTML/JS is publicly downloadable. No live rules deployment is performed by this branch. Until the updated rules are published, the existing commercial planner still works, and the new dashboard cannot verify admin membership or list buyers.

## Tests

Start a static server from the repository root: `python3 -m http.server 8000`. Install Playwright outside the checkout or use the environment's existing Playwright. Then run:

```sh
CHROMIUM_PATH=/usr/bin/chromium node admin/tests/dashboard.cjs
CHROMIUM_PATH=/usr/bin/chromium node commercial/tests/access.cjs
```

Set `BASE_URL` for another server address. These browser suites intercept configuration and Firebase modules only in tests, without changing project credentials or contacting real buyers. They cover authorization gating, zero buyer reads for non-admins, filters, approve/revoke/restore, product preservation, confirmation cancellation, failure cleanup, revocation/offline/logout, safe text rendering, mobile/light layout, localStorage isolation, and the existing commercial planner features.

Security-rules tests are in `admin/tests/rules.cjs` and require the Firestore emulator, Java 21, `firebase-tools`, `@firebase/rules-unit-testing` 4.x, and `firebase` 11.x installed outside the checkout. Run the emulator with the **demo** project `demo-planner-admin`, then run `node --test admin/tests/rules.cjs` with `FIRESTORE_EMULATOR_HOST` set to its local address. Never run these tests against production. They seed only synthetic access records and assert anonymous/buyer/admin permissions, schema restrictions, and admin revocation.

Before release, deploy the rules and smoke-test your configured Firebase project: your UID can list/update records, another signed-in non-admin UID cannot list/update them, and the commercial planner responds to approval/revocation. Runtime Firebase hosts are the same as the commercial app; no new Firebase project is required.
