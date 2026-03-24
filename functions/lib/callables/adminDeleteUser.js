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
exports.adminDeleteUser = void 0;
/**
 * adminDeleteUser — Admin callable to delete a player from Auth + Firestore.
 * The superadmin account evan@tacanni.com is permanently protected.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const PROTECTED_EMAIL = "evan@tacanni.com";
exports.adminDeleteUser = (0, https_1.onCall)({ invoker: "public" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    if (request.auth.token.email !== PROTECTED_EMAIL) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can delete users.");
    }
    const { uid } = request.data;
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "uid is required.");
    }
    let userEmail;
    try {
        let userRecord = null;
        try {
            // Fetch the user record to check the email before deleting
            userRecord = await admin.auth().getUser(uid);
            userEmail = userRecord.email;
        }
        catch (authError) {
            if (authError.code === 'auth/user-not-found') {
                firebase_functions_1.logger.warn(`User with uid ${uid} not found in Firebase Auth. Proceeding with Firestore deletion only.`);
            }
            else {
                // Re-throw other auth errors
                throw authError;
            }
        }
        if (userRecord) {
            if (userRecord.email?.toLowerCase() === PROTECTED_EMAIL.toLowerCase()) {
                throw new https_1.HttpsError("permission-denied", "This account cannot be deleted.");
            }
            // Delete from Firebase Auth
            await admin.auth().deleteUser(uid);
            firebase_functions_1.logger.info("Admin deleted user from Auth", { uid, email: userRecord.email });
        }
        else {
            firebase_functions_1.logger.info("Admin skipped Auth deletion as user not found in Auth", { uid });
        }
        // Delete Firestore profile document and all its sub-collections
        const userDocRef = admin.firestore().collection("users").doc(uid);
        await admin.firestore().recursiveDelete(userDocRef);
        firebase_functions_1.logger.info("Admin deleted user document and sub-collections from Firestore", { uid });
        return { success: true };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        firebase_functions_1.logger.error("adminDeleteUser error", { uid, email: userEmail, error: error.message, stack: error.stack });
        throw new https_1.HttpsError("internal", error.message || "Failed to delete user.");
    }
});
//# sourceMappingURL=adminDeleteUser.js.map