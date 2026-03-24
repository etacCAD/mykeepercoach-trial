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
exports.setUserRole = void 0;
/**
 * setUserRole — Set Firebase Auth custom claims for RBAC.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("../utils/validation");
const firebase_functions_1 = require("firebase-functions");
const VALID_ROLES = ["coach", "keeper", "parent"];
exports.setUserRole = (0, https_1.onCall)(async (request) => {
    const { uid } = (0, validation_1.requireAuth)(request.auth);
    const data = request.data;
    // Validate input
    if (!data.role || !VALID_ROLES.includes(data.role)) {
        throw new https_1.HttpsError("invalid-argument", `Role must be one of: ${VALID_ROLES.join(", ")}`);
    }
    // Users can only set their own role (or admin can set others)
    const targetUid = data.uid || uid;
    if (targetUid !== uid) {
        // Only admin can set other users' roles
        throw new https_1.HttpsError("permission-denied", "You can only set your own role.");
    }
    // Build custom claims
    const claims = {
        role: data.role,
        isMinor: data.isMinor ?? false,
    };
    // Club fields — null in MVP, future-proofed
    if (data.clubId)
        claims.clubId = data.clubId;
    if (data.clubRole)
        claims.clubRole = data.clubRole;
    // Set claims on Firebase Auth
    await admin.auth().setCustomUserClaims(targetUid, claims);
    // Update Firestore user document (use merge to handle case where doc doesn't exist yet)
    await admin.firestore().collection("users").doc(targetUid).set({
        role: data.role,
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    firebase_functions_1.logger.info("Custom claims set", { uid: targetUid, role: data.role });
    return { success: true };
});
//# sourceMappingURL=setUserRole.js.map