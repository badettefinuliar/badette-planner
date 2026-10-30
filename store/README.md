# BizPilot Digital storefront · My Everyday Planner

`/store/` is a dependency-free static storefront for the ₱149 My Everyday Planner product. Deploy the complete store folder alongside the existing commercial and admin folders over HTTPS. It imports the **existing** Firebase Web app configuration from `commercial/firebase-config.js`; no new project or payment gateway is used. The root personal planner, commercial signup/access flow, and planner data code are unchanged.

## Before accepting payments

1. Review/publish **`commercial/firestore.rules`** to the existing default Firestore database. This is the single rules source for customers, admins, buyers, and orders. Rules are not deployed by this branch.
2. Edit **`store/payment-config.js`** with public recipient details and instructions. Defaults intentionally contain **no real recipient data** and have both methods disabled. Comments label GCash recipient name, GCash number, bank name, account name, account number, and payment note/instructions. Fill the fields, verify them, then set that method's `enabled: true`. Bank Transfer also requires `bank`. Methods without the required details remain **Not yet configured**, and order submission is disabled for them. This is deliberate; do not send money to placeholders.
3. Confirm Email/Password Authentication and authorized hosting domains in the existing Firebase project. Existing accounts can log in; new accounts can sign up in the store with an eight-character minimum and confirmation. Stronger Firebase password-policy requirements still apply.
4. Add your seller's UID to `/admins/{uid}` following [admin setup](../admin/README.md). Test the store/payment workflow with synthetic metadata before launch.

Payment instructions are public recipient information, never banking login credentials. Never commit passwords, card details, PINs, OTPs, private keys, or payment-provider secrets. The app does not collect them or use a payment API. Do not put them in the optional note either. Firebase Auth handles account passwords; Firestore never receives those passwords from the app.

## Customer flow

Get Access opens checkout. Login/signup uses the same Firebase project as the commercial planner. A transaction prepares a missing pending buyer record and never overwrites an existing approval or revocation. The account email is read-only in checkout and is taken from the authenticated user when writing an order, independently of the displayed input.

The customer chooses configured GCash or Bank Transfer instructions, sends **₱149** through their own provider, then submits full name, payment reference, and an optional note. The store shows:

> Payment submitted for verification. Access will be activated after payment is confirmed.

The customer's own orders show live status updates: pending verification, verified awaiting activation, rejected, or access activated. This is **manual payment verification**, not an automatic payment confirmation or gateway. The seller must check actual receipt, amount, recipient, and reference in their own GCash/bank records. Duplicate/fabricated reference numbers are possible; a reference is metadata, not proof. Do not grant access for a reused payment.

Each submission allocates a random document ID. A retry in the same checkout session reuses that ID and attempts a server read if acknowledgement was lost, so it cannot overwrite an existing order. If disconnected or reloaded, check Your orders before resubmitting; do not submit the same receipt again. Customers cannot edit submitted orders. Contact the seller for a correction; rejected orders remain as history.

No planner bills, errands, savings, personalization, or backups are read or written by the store. Orders do contain the customer-entered name, email, payment method/reference, and optional note. This is separate access/payment metadata; keep it minimal. The app uses default Firestore memory caching with no persistent order cache enabled. Logout/offline state clears rendered order details. Use a private device/browser profile. The existing commercial planner's localStorage remains unchanged.

## Manual verification and explicit activation

In `/admin/`, select **Orders**. **Pending Payments** is the default order filter. Cards show name, email, buyer UID, product, amount, method, reference, note, submitted timestamp, order ID, and status.

1. Check actual funds in your own GCash/bank service, then choose **Mark Payment Verified** and confirm. The order becomes `payment_verified`; **buyer access does not change**.
2. Open **Verified Payments**, select **Grant Access**, and explicitly confirm. A transaction rechecks admin membership and the current verified order. It updates the existing buyer to `approved`, preserves other allowed products, adds `my-everyday-planner`, and marks the order `access_granted` atomically.
3. Or choose **Reject Payment** on a pending order. It becomes `rejected`, keeps its record, and has no Grant Access action. The order rules also reject attempts to grant a pending/rejected order, including a batch that tries to activate the buyer alongside that invalid order transition.

Verify and grant must be separate commits. A verification transaction records server timestamp/admin UID (`reviewedAt`, `reviewedBy`). A grant records `grantedAt`, `grantedBy`. Orders cannot be deleted or have amount/product/customer/reference edited through the client. Reviewed/rejected/granted states are final for that stage; correct operator mistakes through the trusted Firebase console after investigation.

**Buyer access** remains a separate admin section with direct Approve/Revoke/Restore tools, clearly labeled as manual overrides independent of orders. Those tools intentionally retain their existing power and can grant access without an order (e.g. complimentary access). They do not verify payments or change order statuses. Rejected orders never grant access through the order workflow. Previously granted access is not automatically revoked when another order is rejected. An order's access-granted status is historical; current planner access still comes from `/buyers/{uid}` and can later be revoked with the buyer tools.

## Firestore schema and security

`orders/{randomOrderId}` is created with:

```js
{
  buyerUid: auth.currentUser.uid,
  buyerEmail: auth.currentUser.email,
  buyerName: 'Customer full name',
  productId: 'my-everyday-planner',
  amount: 149,
  paymentMethod: 'gcash', // or 'bank_transfer'
  paymentReference: 'Provider transaction reference',
  note: '', // optional, maximum 500 characters
  status: 'payment_pending',
  createdAt: serverTimestamp()
}
```

Rules require the authenticated UID/email, fixed product/amount, permitted method, server timestamp, bounded name/reference/note, pending initial status, and only expected fields. Customers may get their own orders and query only with `where('buyerUid', '==', auth.uid)`; they cannot list everyone's orders or update/delete their own. Existing `/admins/{uid}` members may list/read orders and perform the defined status transitions only. Payment details are immutable. Grant transition rules check the **previous** order is verified and the post-transaction buyer is approved with the product. All unrelated access remains denied.

These queries need only Firestore's default single-field indexes (`orders.buyerUid`, `orders.status`); the UI sorts timestamps locally. Keep those indexes enabled. The client price and rule price must both change for future pricing; this release is fixed at ₱149. Admin membership, existing buyer self-signup rules, and buyer-only reads remain intact. Firebase console/IAM and Admin SDK bypass rules and must be restricted separately.

## Proof-of-payment upload follow-up

**No upload is included.** There is no established Storage upload configuration/rules workflow in this repository. Reference-number submission works independently; no Firebase Storage SDK or bucket is required. Do not add an unrestricted upload bucket or public receipt URLs. A later upload feature needs a configured bucket, owner/admin-only rules, per-order UID-bound paths, size/content-type limits, safe image/document handling, lifecycle retention, and emulator tests. Receipts may contain personal data; use private authenticated reads and review what the seller actually needs.

## Validation

From the repository root, serve with `python3 -m http.server 8000`. With Playwright available and Chromium installed:

```sh
CHROMIUM_PATH=/usr/bin/chromium node store/tests/flow.cjs
CHROMIUM_PATH=/usr/bin/chromium node admin/tests/dashboard.cjs
CHROMIUM_PATH=/usr/bin/chromium node commercial/tests/signup.cjs
CHROMIUM_PATH=/usr/bin/chromium node commercial/tests/access.cjs
```

Set `BASE_URL` for a different local port; set `NODE_PATH` if test dependencies are installed outside the checkout. Browser tests intercept Firebase and use synthetic payment configuration/data; they do not charge money, contact real buyers, or prove deployed server rules.

Firestore security tests require Java 21, Firebase CLI, Firebase 11.x, and rules-unit-testing 4.x. Use only demo projects and local emulators:

```sh
firebase emulators:exec --config firebase.emulators.json --project demo-planner-store --only firestore "node --test store/tests/rules.cjs"
firebase emulators:exec --config firebase.emulators.json --project demo-planner-admin --only firestore "node --test admin/tests/rules.cjs"
```

The official emulator download requires `storage.googleapis.com`. If network policy blocks it, enable that destination via environment settings before rerunning. Before launch, test the configured Firebase project's real signup, own-order submission/query, non-admin denial, admin review/rejection, and explicit verified-only activation. Publishing rules, adding recipient details, live testing, and deployment are separate from this code change.
