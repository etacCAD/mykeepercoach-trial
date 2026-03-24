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
exports.validateSubscription = void 0;
/**
 * validateSubscription — Lightweight subscription status check (MVP).
 *
 * Reads Firestore status set by StoreKit 2 listener on the iOS client.
 * Server-side receipt validation (App Store Server API) is Phase 2.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("../utils/validation");
const db = admin.firestore();
exports.validateSubscription = (0, https_1.onCall)(async (request) => {
    const { uid } = (0, validation_1.requireAuth)(request.auth);
    const { keeperId } = request.data;
    if (!keeperId) {
        throw new https_1.HttpsError("invalid-argument", "keeperId is required.");
    }
    // Fetch keeper
    const keeper = await (0, validation_1.getKeeperOrThrow)(keeperId);
    // Authorization: coach or the subscriber
    const coachIds = keeper.coachUserIds ?? (keeper.coachUserId ? [keeper.coachUserId] : []);
    const isCoach = coachIds.includes(uid);
    const isSubscriber = keeper.subscriberUserId === uid;
    const isParent = keeper.parentUserIds?.includes(uid) ?? false;
    if (!isCoach && !isSubscriber && !isParent) {
        throw new https_1.HttpsError("permission-denied", "Not authorized to check this keeper's subscription.");
    }
    // Check if subscription has expired
    let status = keeper.subscriptionStatus;
    const expiry = keeper.subscriptionExpiry?.toDate();
    if (status === "active" && expiry && expiry < new Date()) {
        // Auto-expire
        status = "expired";
        await keeper.ref.update({
            subscriptionStatus: "expired",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    // Get primary coach's subscribed keeper count
    const primaryCoachId = coachIds[0] ?? keeper.coachUserId;
    const coachDoc = primaryCoachId ? await db.collection("users").doc(primaryCoachId).get() : null;
    const coachData = coachDoc?.data();
    const subscribedKeeperCount = coachData?.subscribedKeeperCount ?? 0;
    const isCoachUnlocked = subscribedKeeperCount >= 5;
    return {
        keeperId,
        status,
        expiresAt: expiry?.toISOString(),
        canCreateFullReport: status === "active" || isCoachUnlocked,
        isCoachUnlocked,
        subscribedKeeperCount,
    };
});
//# sourceMappingURL=validateSubscription.js.map