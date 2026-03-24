"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateTrial = void 0;
/**
 * activateTrial — Activate the free trial for the authenticated user.
 *
 * Trial grants full access until the global deadline: June 30, 2026.
 * No credit card required. Each user can only activate once.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
// Hard deadline — every trial user gets the same expiry
const TRIAL_END = new Date("2026-06-30T23:59:59Z");
exports.activateTrial = (0, https_1.onCall)(async (request) => {
    // Must be signed in
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    try {
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            throw new https_1.HttpsError("not-found", "User profile not found.");
        }
        const userData = userSnap.data();
        // Prevent double activation
        if (userData.freeTrialUsed === true) {
            throw new https_1.HttpsError("already-exists", "Trial has already been activated for this account.");
        }
        const now = admin.firestore.Timestamp.now();
        const trialExpiry = admin.firestore.Timestamp.fromDate(TRIAL_END);
        // Update user document with trial fields
        await userRef.update({
            freeTrialUsed: true,
            trialOptedInAt: now,
            trialExpiryDate: trialExpiry,
        });
        // Set custom claim so client can check trial status from the token
        await admin.auth().setCustomUserClaims(uid, {
            ...((await admin.auth().getUser(uid)).customClaims || {}),
            trialActive: true,
        });
        firebase_functions_1.logger.info("Trial activated", { uid, expiryDate: TRIAL_END.toISOString() });
        return {
            success: true,
            expiryDate: TRIAL_END.toISOString(),
            message: "Your free trial is active! Full access until June 30, 2026.",
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        firebase_functions_1.logger.error("activateTrial error", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to activate trial.");
    }
});
//# sourceMappingURL=activateTrial.js.map