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
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.getKeeperOrThrow = getKeeperOrThrow;
exports.requireCoachOf = requireCoachOf;
exports.requireCoachOrParent = requireCoachOrParent;
exports.generateCode = generateCode;
/**
 * Validation and authorization helpers for Cloud Functions.
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Verify the caller is authenticated and return their UID.
 */
function requireAuth(auth) {
    if (!auth) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    return auth;
}
/**
 * Verify the caller has a specific role via custom claims.
 */
function requireRole(auth, role) {
    if (auth.token.role !== role) {
        throw new https_1.HttpsError("permission-denied", `This action requires the '${role}' role.`);
    }
}
/**
 * Fetch a keeper profile or throw not-found.
 */
async function getKeeperOrThrow(keeperId) {
    const ref = db.collection("keepers").doc(keeperId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "Keeper profile not found.");
    }
    return { ...snap.data(), ref };
}
/**
 * Assert the caller is the keeper's assigned coach.
 */
async function requireCoachOf(keeperId, callerUid) {
    const keeper = await getKeeperOrThrow(keeperId);
    const coachIds = keeper.coachUserIds ?? (keeper.coachUserId ? [keeper.coachUserId] : []);
    if (!coachIds.includes(callerUid)) {
        throw new https_1.HttpsError("permission-denied", "Only the keeper's assigned coach can perform this action.");
    }
    return keeper;
}
/**
 * Assert the caller is either the coach or a linked parent.
 */
async function requireCoachOrParent(keeperId, callerUid) {
    const keeper = await getKeeperOrThrow(keeperId);
    const coachIds = keeper.coachUserIds ?? (keeper.coachUserId ? [keeper.coachUserId] : []);
    const isCoach = coachIds.includes(callerUid);
    const isParent = keeper.parentUserIds?.includes(callerUid) ?? false;
    if (!isCoach && !isParent) {
        throw new https_1.HttpsError("permission-denied", "Only the coach or a linked parent can perform this action.");
    }
    return keeper;
}
/**
 * Generate a random alphanumeric code of a given length.
 */
function generateCode(length) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 for clarity
    let code = "";
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
//# sourceMappingURL=validation.js.map