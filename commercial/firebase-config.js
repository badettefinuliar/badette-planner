// FIREBASE CONFIGURATION — paste your Firebase Web app config values here.
// Firebase console → Project settings → General → Your apps → Web app → SDK setup.
// These are public web identifiers, NOT service-account/admin credentials.
// Never paste a private key, service-account JSON, or buyer password here.
export const firebaseConfig = {
  apiKey: 'PASTE_FIREBASE_WEB_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  appId: 'PASTE_FIREBASE_WEB_APP_ID',
};
// Must match the string in each buyer's allowedProducts array in Firestore.
export const PRODUCT_ID = 'my-everyday-planner';
