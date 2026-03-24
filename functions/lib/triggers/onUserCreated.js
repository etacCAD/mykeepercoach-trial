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
exports.onUserCreated = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
/**
 * Trigger: onCreate for a new User Document
 * Path: users/{userId}
 *
 * Purpose: Assigns a unique, readable numeric ID to each new user.
 * It uses a global counter "counters/users" to ensure uniqueness.
 */
exports.onUserCreated = functions.firestore
    .document("users/{userId}")
    .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const db = admin.firestore();
    const counterRef = db.collection("counters").doc("users");
    try {
        const userNumber = await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let newCount = 1000; // Start user numbers at 1000
            if (counterDoc.exists) {
                const currentCount = counterDoc.data()?.count || 1000;
                newCount = currentCount + 1;
            }
            // Update the counter
            transaction.set(counterRef, { count: newCount }, { merge: true });
            // Update the user document
            const userRef = db.collection("users").doc(userId);
            transaction.update(userRef, { userNumber: newCount });
            return newCount;
        });
        functions.logger.info(`Assigned userNumber ${userNumber} to user ${userId}`);
    }
    catch (error) {
        functions.logger.error("Error assigning userNumber", error);
    }
});
//# sourceMappingURL=onUserCreated.js.map