/**
 * Goalie Coach — Cloud Functions Entry Point
 *
 * All function exports for Firebase deployment.
 * Web-only product — no iOS functions.
 */
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp({
  storageBucket: process.env.FIREBASE_CONFIG 
    ? JSON.parse(process.env.FIREBASE_CONFIG).storageBucket
    : "goalie-coach-dev-11a17.firebasestorage.app",
});

import { onRequest } from "firebase-functions/v2/https";
export const fixBucketIAM = onRequest(async (req, res) => {
  try {
    const bucket = admin.storage().bucket("goalie-coach-dev-11a17.firebasestorage.app");
    const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
    policy.bindings.push({
      role: 'roles/storage.objectViewer',
      members: ['serviceAccount:service-488324444704@gcp-sa-aiplatform.iam.gserviceaccount.com']
    });
    await bucket.iam.setPolicy(policy);
    res.send("Successfully patched bucket IAM for Vertex AI!");
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

// ── Callable Functions ──────────────────────────────────────
export { adminCreateUser } from "./callables/adminCreateUser";
export { adminUpdateUser } from "./callables/adminUpdateUser";
export { adminDeleteUser } from "./callables/adminDeleteUser";
export { reAnalyzeSession } from "./callables/reAnalyzeSession";
export { analyzeV2 } from "./callables/analyzeV2";
export { activateTrial } from "./callables/activateTrial";
export { checkTrialStatus } from "./callables/checkTrialStatus";
export { redeemPromoCode } from "./callables/redeemPromoCode";
export { tedChat } from "./callables/tedChat";
export { createShareLink } from "./callables/createShareLink";
export { logSharedReportView } from "./callables/logSharedReportView";

// ── Firestore Triggers ──────────────────────────────────────
export { onUserCreated } from "./triggers/onUserCreated";

// ── Storage Triggers ────────────────────────────────────────
export { onWebSessionUploaded } from "./triggers/onWebSessionUploaded";
export { onVideoUploaded } from "./triggers/onVideoUploaded";

// ── Web Backend API ─────────────────────────────────────────
export { api } from "./api";
