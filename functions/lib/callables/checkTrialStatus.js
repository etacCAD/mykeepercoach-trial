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
exports.checkTrialStatus = void 0;
/**
 * checkTrialStatus — Check the current trial status for the authenticated user.
 *
 * Called on page load to sync trial state. If the trial has expired,
 * it updates the custom claim to trialActive: false.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
exports.checkTrialStatus = (0, https_1.onCall)(async (request) => {
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
            return { isTrialActive: false, daysRemaining: 0, expiryDate: null, trialUsed: false };
        }
        const userData = userSnap.data();
        // No trial ever activated
        if (!userData.trialExpiryDate) {
            return { isTrialActive: false, daysRemaining: 0, expiryDate: null, trialUsed: userData.freeTrialUsed === true };
        }
        const expiryDate = userData.trialExpiryDate.toDate();
        const now = new Date();
        const isActive = now < expiryDate;
        const msRemaining = Math.max(0, expiryDate.getTime() - now.getTime());
        const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
        // If expired, update custom claim
        if (!isActive) {
            const existingClaims = (await admin.auth().getUser(uid)).customClaims || {};
            if (existingClaims.trialActive !== false) {
                await admin.auth().setCustomUserClaims(uid, {
                    ...existingClaims,
                    trialActive: false,
                });
                firebase_functions_1.logger.info("Trial expired — claim updated", { uid });
            }
        }
        return {
            isTrialActive: isActive,
            daysRemaining,
            expiryDate: expiryDate.toISOString(),
            trialUsed: true,
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("checkTrialStatus error", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to check trial status.");
    }
});
//# sourceMappingURL=checkTrialStatus.js.map