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
exports.adminUpdateUser = void 0;
/**
 * adminUpdateUser — Admin callable to update a player's name, email, and/or password.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
exports.adminUpdateUser = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    if (request.auth.token.email !== "evan@tacanni.com") {
        throw new https_1.HttpsError("permission-denied", "Only administrators can update users.");
    }
    const { uid, displayName, email, password, firstName, lastName } = request.data;
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "uid is required.");
    }
    try {
        // Build Auth update payload
        const authUpdate = {};
        if (displayName !== undefined && displayName.trim())
            authUpdate.displayName = displayName.trim();
        if (email !== undefined && email.trim())
            authUpdate.email = email.trim();
        if (password !== undefined && password.length >= 6)
            authUpdate.password = password;
        if (Object.keys(authUpdate).length > 0) {
            await admin.auth().updateUser(uid, authUpdate);
        }
        // Sync Firestore profile
        const firestoreUpdate = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (authUpdate.displayName)
            firestoreUpdate.displayName = authUpdate.displayName;
        if (authUpdate.email)
            firestoreUpdate.email = authUpdate.email;
        if (firstName !== undefined)
            firestoreUpdate.firstName = firstName.trim();
        if (lastName !== undefined)
            firestoreUpdate.lastName = lastName.trim();
        await admin.firestore().collection("users").doc(uid).set(firestoreUpdate, { merge: true });
        firebase_functions_1.logger.info("Admin updated user", { uid, fields: Object.keys(authUpdate) });
        return { success: true };
    }
    catch (error) {
        firebase_functions_1.logger.error("adminUpdateUser error", error);
        throw new https_1.HttpsError("internal", error.message || "Failed to update user.");
    }
});
//# sourceMappingURL=adminUpdateUser.js.map