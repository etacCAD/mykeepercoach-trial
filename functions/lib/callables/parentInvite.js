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
exports.acceptParentInvite = exports.generateParentInvite = void 0;
/**
 * generateParentInvite — Create an 8-char invite code for parent linking.
 * acceptParentInvite  — Link a parent to a keeper via invite code.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("../utils/validation");
const firebase_functions_1 = require("firebase-functions");
const db = admin.firestore();
const INVITE_EXPIRY_DAYS = 7;
// ────────────────────────────────────────────────────────────
// Generate
// ────────────────────────────────────────────────────────────
exports.generateParentInvite = (0, https_1.onCall)(async (request) => {
    const { uid } = (0, validation_1.requireAuth)(request.auth);
    const { keeperId } = request.data;
    if (!keeperId) {
        throw new https_1.HttpsError("invalid-argument", "keeperId is required.");
    }
    // Only the keeper's coach can generate an invite
    const keeper = await (0, validation_1.requireCoachOf)(keeperId, uid);
    // Generate 8-char code and expiry
    const inviteCode = (0, validation_1.generateCode)(8);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);
    // Write to keeper profile (overwrites any previous invite)
    await keeper.ref.update({
        parentInviteCode: inviteCode,
        parentInviteCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        parentInviteExpiry: admin.firestore.Timestamp.fromDate(expiresAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    firebase_functions_1.logger.info("Parent invite generated", { keeperId, expiresAt: expiresAt.toISOString() });
    return {
        inviteCode,
        expiresAt: expiresAt.toISOString(),
    };
});
// ────────────────────────────────────────────────────────────
// Accept
// ────────────────────────────────────────────────────────────
exports.acceptParentInvite = (0, https_1.onCall)(async (request) => {
    const { uid } = (0, validation_1.requireAuth)(request.auth);
    const { inviteCode } = request.data;
    if (!inviteCode || inviteCode.length !== 8) {
        throw new https_1.HttpsError("invalid-argument", "A valid 8-character invite code is required.");
    }
    // Find keeper with matching invite code
    const snapshot = await db
        .collection("keepers")
        .where("parentInviteCode", "==", inviteCode)
        .limit(1)
        .get();
    if (snapshot.empty) {
        throw new https_1.HttpsError("not-found", "No keeper found with this invite code.");
    }
    const keeperDoc = snapshot.docs[0];
    const keeperData = keeperDoc.data();
    const keeperRef = keeperDoc.ref;
    // Check expiry
    const expiry = keeperData.parentInviteExpiry?.toDate();
    if (!expiry || expiry < new Date()) {
        throw new https_1.HttpsError("deadline-exceeded", "This invite code has expired. Ask the coach for a new one.");
    }
    // Check if already linked
    const existingParents = keeperData.parentUserIds || [];
    if (existingParents.includes(uid)) {
        throw new https_1.HttpsError("already-exists", "You are already linked to this keeper.");
    }
    // Link parent to keeper
    await keeperRef.update({
        parentUserIds: admin.firestore.FieldValue.arrayUnion(uid),
        parentInviteCode: admin.firestore.FieldValue.delete(),
        parentInviteCreatedAt: admin.firestore.FieldValue.delete(),
        parentInviteExpiry: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Update parent's user document
    await db.collection("users").doc(uid).update({
        linkedKeeperId: keeperDoc.id,
        inviteAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        role: "parent",
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Set parent custom claims
    const existingClaims = (await admin.auth().getUser(uid)).customClaims || {};
    const linkedKeepers = existingClaims.linkedKeepers || [];
    linkedKeepers.push(keeperDoc.id);
    await admin.auth().setCustomUserClaims(uid, {
        ...existingClaims,
        role: "parent",
        linkedKeepers,
    });
    firebase_functions_1.logger.info("Parent invite accepted", { keeperId: keeperDoc.id, parentUid: uid });
    return {
        keeperId: keeperDoc.id,
        keeperName: keeperData.name || "Unknown",
        success: true,
    };
});
//# sourceMappingURL=parentInvite.js.map