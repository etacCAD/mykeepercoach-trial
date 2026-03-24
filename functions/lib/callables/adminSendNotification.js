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
exports.adminSendNotification = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
/**
 * Callable Function: adminSendNotification
 *
 * Allows admins to send a push notification to a specific user via FCM.
 */
exports.adminSendNotification = functions.https.onCall(async (data, context) => {
    // 1. Verify Authentication & Admin Status
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to send notifications.");
    }
    if (!context.auth.token.admin) {
        throw new functions.https.HttpsError("permission-denied", "Only administrators can send push notifications.");
    }
    const { userId, message } = data;
    if (!userId || !message) {
        throw new functions.https.HttpsError("invalid-argument", "userId and message are required.");
    }
    try {
        const db = admin.firestore();
        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            throw new functions.https.HttpsError("not-found", "User not found.");
        }
        const userData = userSnap.data();
        const fcmTokens = userData?.fcmTokens || [];
        if (fcmTokens.length === 0) {
            return { success: false, reason: "User has no registered devices." };
        }
        // 2. Construct the APNs/FCM Payload
        const payload = {
            tokens: fcmTokens,
            notification: {
                title: "Goalie Coach Update",
                body: message,
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                    },
                },
            },
        };
        // 3. Dispatch
        const response = await admin.messaging().sendEachForMulticast(payload);
        // Clean up invalid tokens (e.g. user uninstalled the app)
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                failedTokens.push(fcmTokens[idx]);
            }
        });
        if (failedTokens.length > 0) {
            await userRef.update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens),
            });
        }
        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount,
        };
    }
    catch (error) {
        functions.logger.error("Error sending push notification:", error);
        throw new functions.https.HttpsError("internal", "Failed to send notification.");
    }
});
//# sourceMappingURL=adminSendNotification.js.map