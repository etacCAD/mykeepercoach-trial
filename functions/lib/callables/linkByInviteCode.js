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
exports.linkByInviteCode = void 0;
/**
 * linkByInviteCode — Single Cloud Function for all invite-code linking.
 *
 * Accepts a 6-character keeper invite code and links the calling user
 * as either a keeper or a parent, depending on their role.
 *
 * Tier limits (based on keeper's keeperTier):
 *   rec:     1 coach link,  1 parent link
 *   elite:   3 coach links, 3 parent links
 *   premier: 5 coach links, 5 parent links
 *
 * Uses Admin SDK so it completely bypasses Firestore security rules.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("../utils/validation");
const firebase_functions_1 = require("firebase-functions");
const db = admin.firestore();
// ── Tier limits ─────────────────────────────────────────────
const TIER_LIMITS = {
    rec: { coaches: 1, parents: 1 },
    elite: { coaches: 3, parents: 3 },
    premier: { coaches: 5, parents: 5 },
};
exports.linkByInviteCode = (0, https_1.onCall)(async (request) => {
    const { uid } = (0, validation_1.requireAuth)(request.auth);
    const { inviteCode } = request.data;
    // ── Validate input ──────────────────────────────────────────
    if (!inviteCode || typeof inviteCode !== "string") {
        throw new https_1.HttpsError("invalid-argument", "inviteCode is required.");
    }
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
        throw new https_1.HttpsError("invalid-argument", "Invite code must be exactly 6 characters.");
    }
    // ── Look up the keeper by invite code ───────────────────────
    const snapshot = await db
        .collection("keepers")
        .where("keeperInviteCode", "==", code)
        .limit(1)
        .get();
    if (snapshot.empty) {
        throw new https_1.HttpsError("not-found", "No keeper found with this invite code. Check with the coach and try again.");
    }
    const keeperDoc = snapshot.docs[0];
    const keeperData = keeperDoc.data();
    const keeperId = keeperDoc.id;
    // ── Resolve keeper tier ─────────────────────────────────────
    const keeperTier = keeperData.keeperTier ?? "rec";
    const limits = TIER_LIMITS[keeperTier] ?? TIER_LIMITS.rec;
    // ── Determine the caller's role ─────────────────────────────
    let callerRole;
    const authUser = await admin.auth().getUser(uid);
    callerRole = authUser.customClaims?.role;
    if (!callerRole) {
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
            callerRole = userDoc.data()?.role;
        }
    }
    if (!callerRole) {
        throw new https_1.HttpsError("failed-precondition", "Your account role is not set. Please sign out and sign back in.");
    }
    // ── Link based on role ──────────────────────────────────────
    if (callerRole === "keeper") {
        // Read existing coach links (new array or legacy single field)
        const existingCoaches = keeperData.coachUserIds ??
            (keeperData.coachUserId ? [keeperData.coachUserId] : []);
        // Check if already linked
        if (existingCoaches.includes(uid)) {
            throw new https_1.HttpsError("already-exists", "You are already linked to this coach.");
        }
        // Enforce tier limit
        if (existingCoaches.length >= limits.coaches) {
            throw new https_1.HttpsError("resource-exhausted", `This keeper's ${keeperTier.toUpperCase()} plan allows up to ${limits.coaches} coach link${limits.coaches === 1 ? "" : "s"}. Upgrade to link more coaches.`);
        }
        // Also set keeperUserId if not already set (first keeper link)
        const updates = {
            coachUserIds: admin.firestore.FieldValue.arrayUnion(uid),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (!keeperData.keeperUserId) {
            updates.keeperUserId = uid;
        }
        await keeperDoc.ref.update(updates);
        firebase_functions_1.logger.info("Keeper linked via invite code", { keeperId, keeperUid: uid, code, tier: keeperTier });
        return {
            keeperId,
            keeperName: keeperData.name || "Unknown",
            success: true,
            linkedCount: existingCoaches.length + 1,
            maxLinks: limits.coaches,
        };
    }
    else if (callerRole === "parent") {
        const existingParents = keeperData.parentUserIds || [];
        // Check if already linked
        if (existingParents.includes(uid)) {
            throw new https_1.HttpsError("already-exists", "You are already linked to this keeper.");
        }
        // Enforce tier limit
        if (existingParents.length >= limits.parents) {
            throw new https_1.HttpsError("resource-exhausted", `This keeper's ${keeperTier.toUpperCase()} plan allows up to ${limits.parents} parent link${limits.parents === 1 ? "" : "s"}. Upgrade to link more parents.`);
        }
        // Link parent
        await keeperDoc.ref.update({
            parentUserIds: admin.firestore.FieldValue.arrayUnion(uid),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Also update the parent's user doc with linked keeper
        await db.collection("users").doc(uid).set({
            linkedKeeperIds: admin.firestore.FieldValue.arrayUnion(keeperId),
            lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        firebase_functions_1.logger.info("Parent linked via invite code", { keeperId, parentUid: uid, code, tier: keeperTier });
        return {
            keeperId,
            keeperName: keeperData.name || "Unknown",
            success: true,
            linkedCount: existingParents.length + 1,
            maxLinks: limits.parents,
        };
    }
    else {
        throw new https_1.HttpsError("permission-denied", "Only keepers and parents can link via invite code.");
    }
});
//# sourceMappingURL=linkByInviteCode.js.map