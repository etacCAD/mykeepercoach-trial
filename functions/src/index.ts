/**
 * Goalie Coach — Cloud Functions Entry Point
 *
 * All function exports for Firebase deployment.
 * Web-only product — no iOS functions.
 */
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

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

// ── Firestore Triggers ──────────────────────────────────────
export { onUserCreated } from "./triggers/onUserCreated";

// ── Storage Triggers ────────────────────────────────────────
export { onWebSessionUploaded } from "./triggers/onWebSessionUploaded";
export { onVideoUploaded } from "./triggers/onVideoUploaded";

// ── Web Backend API ─────────────────────────────────────────
export { api } from "./api";
