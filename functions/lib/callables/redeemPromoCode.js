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
exports.redeemPromoCode = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
exports.redeemPromoCode = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in to redeem a promo code.");
    }
    const { code } = request.data;
    if (!code || typeof code !== "string") {
        throw new https_1.HttpsError("invalid-argument", "A valid promo code string must be provided.");
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    const codeId = code.trim().toUpperCase();
    const codeRef = db.collection("promoCodes").doc(codeId);
    const userRef = db.collection("users").doc(uid);
    const redemptionRef = codeRef.collection("redemptions").doc(uid);
    try {
        const result = await db.runTransaction(async (t) => {
            // 1. Read the promo code
            const codeSnap = await t.get(codeRef);
            if (!codeSnap.exists) {
                throw new https_1.HttpsError("not-found", "Invalid promo code.");
            }
            const codeData = codeSnap.data();
            // 2. Read the user
            const userSnap = await t.get(userRef);
            if (!userSnap.exists) {
                throw new https_1.HttpsError("not-found", "User profile not found.");
            }
            const userData = userSnap.data();
            // 3. Read the redemption record (prevent double redemption)
            const redemptionSnap = await t.get(redemptionRef);
            if (redemptionSnap.exists) {
                throw new https_1.HttpsError("already-exists", "You have already redeemed this promo code.");
            }
            // 4. Validate promo code state
            if (!codeData.isActive) {
                throw new https_1.HttpsError("failed-precondition", "This promo code is no longer active.");
            }
            if (codeData.expiresAt && codeData.expiresAt.toMillis() < Date.now()) {
                throw new https_1.HttpsError("failed-precondition", "This promo code has expired.");
            }
            if (codeData.maxUses && codeData.currentUses >= codeData.maxUses) {
                throw new https_1.HttpsError("resource-exhausted", "This promo code has reached its usage limit.");
            }
            // 5. Apply the benefits (e.g., mark as having promo access)
            // Since the app currently relies on trialExpiryDate for access, we'll set a far future date
            // for promo users (e.g. 1 year from now) or a specific "premium" flag.
            const now = admin.firestore.Timestamp.now();
            const updatePayload = {
                promoCodeRedeemed: codeId,
                promoCodeRedeemedAt: now,
            };
            // Ensure they don't get kicked out by the trial deadline
            // For now, setting freeTrialUsed to true skips the trial screen, and a long expiry grants access.
            const oneYearFromNow = new Date();
            oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
            // Keep whichever date is further in the future
            let newExpiry = admin.firestore.Timestamp.fromDate(oneYearFromNow);
            if (userData.trialExpiryDate && userData.trialExpiryDate.toMillis() > newExpiry.toMillis()) {
                newExpiry = userData.trialExpiryDate;
            }
            updatePayload.freeTrialUsed = true;
            updatePayload.trialOptedInAt = userData.trialOptedInAt || now;
            updatePayload.trialExpiryDate = newExpiry;
            t.update(userRef, updatePayload);
            // 6. Record the redemption
            t.set(redemptionRef, {
                redeemedAt: now,
                uid: uid,
                email: request.auth?.token.email || ""
            });
            // 7. Increment code usage
            t.update(codeRef, {
                currentUses: admin.firestore.FieldValue.increment(1)
            });
            return {
                success: true,
                message: `Promo code ${codeId} successfully redeemed!`,
            };
        });
        // Update custom claim
        await admin.auth().setCustomUserClaims(uid, {
            ...((await admin.auth().getUser(uid)).customClaims || {}),
            trialActive: true,
            hasPromoAccess: true,
        });
        firebase_functions_1.logger.info("Promo code redeemed", { uid, codeId });
        return result;
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        firebase_functions_1.logger.error("redeemPromoCode transaction failed", { uid, codeId, error });
        throw new https_1.HttpsError("internal", error.message || "Failed to redeem promo code.");
    }
});
//# sourceMappingURL=redeemPromoCode.js.map