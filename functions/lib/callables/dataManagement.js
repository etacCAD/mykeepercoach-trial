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
exports.exportKeeperData = exports.deleteKeeperData = void 0;
/**
 * deleteKeeperData — Full COPPA/GDPR data deletion.
 * exportKeeperData — Data portability (JSON export).
 */
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const validation_1 = require("../utils/validation");
const firebase_functions_1 = require("firebase-functions");
const db = admin.firestore();
const storage = admin.storage();
// Subcollections to process
const SUBCOLLECTIONS = [
    "assessments",
    "matchReports",
    "drillSessions",
    "milestones",
    "trainingLoad",
    "videoClips",
];
// ────────────────────────────────────────────────────────────
// Delete
// ────────────────────────────────────────────────────────────
exports.deleteKeeperData = (0, https_1.onCall)(async (request) => {
    const { uid } = (0, validation_1.requireAuth)(request.auth);
    const { keeperId } = request.data;
    if (!keeperId) {
        throw new https_1.HttpsError("invalid-argument", "keeperId is required.");
    }
    // Only coach or linked parent can delete
    const keeper = await (0, validation_1.requireCoachOrParent)(keeperId, uid);
    firebase_functions_1.logger.warn("Starting keeper data deletion", { keeperId, initiatedBy: uid });
    // 1. Delete all subcollections
    for (const sub of SUBCOLLECTIONS) {
        const snap = await db.collection("keepers").doc(keeperId).collection(sub).get();
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        if (snap.size > 0) {
            await batch.commit();
            firebase_functions_1.logger.info(`Deleted ${snap.size} docs from ${sub}`, { keeperId });
        }
    }
    // 2. Delete Cloud Storage files
    try {
        const bucket = storage.bucket();
        const [files] = await bucket.getFiles({ prefix: `videos/${keeperId}/` });
        await Promise.all(files.map((file) => file.delete()));
        firebase_functions_1.logger.info(`Deleted ${files.length} storage files`, { keeperId });
    }
    catch (err) {
        firebase_functions_1.logger.warn("Storage deletion partial failure (may not exist)", { keeperId });
    }
    // 3. Delete keeper profile document
    await keeper.ref.delete();
    // 4. Delete keeper's user account if it exists
    if (keeper.keeperUserId) {
        try {
            await db.collection("users").doc(keeper.keeperUserId).delete();
            await admin.auth().deleteUser(keeper.keeperUserId);
            firebase_functions_1.logger.info("Deleted keeper's auth account", { keeperUserId: keeper.keeperUserId });
        }
        catch (err) {
            firebase_functions_1.logger.warn("Keeper user deletion skipped (may not exist)", { keeperUserId: keeper.keeperUserId });
        }
    }
    // 5. Log audit record
    await db.collection("auditLog").add({
        action: "deleteKeeperData",
        keeperId,
        keeperName: keeper.name,
        initiatedBy: uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    firebase_functions_1.logger.info("Keeper data deletion complete", { keeperId });
    return { success: true, deletedKeeperId: keeperId };
});
// ────────────────────────────────────────────────────────────
// Export
// ────────────────────────────────────────────────────────────
exports.exportKeeperData = (0, https_1.onCall)(async (request) => {
    const { uid } = (0, validation_1.requireAuth)(request.auth);
    const { keeperId } = request.data;
    if (!keeperId) {
        throw new https_1.HttpsError("invalid-argument", "keeperId is required.");
    }
    // Only coach or linked parent can export
    const keeper = await (0, validation_1.requireCoachOrParent)(keeperId, uid);
    // Build export bundle
    const bundle = {
        keeperProfile: keeper,
        exportedAt: new Date().toISOString(),
        exportedBy: uid,
    };
    // Fetch all subcollection data
    for (const sub of SUBCOLLECTIONS) {
        const snap = await db.collection("keepers").doc(keeperId).collection(sub).get();
        bundle[sub] = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }
    // Generate signed URLs for video clips (valid 24 hours)
    try {
        const bucket = storage.bucket();
        const [files] = await bucket.getFiles({ prefix: `videos/${keeperId}/` });
        const videoUrls = {};
        for (const file of files) {
            const [url] = await file.getSignedUrl({
                action: "read",
                expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
            });
            videoUrls[file.name] = url;
        }
        bundle.videoDownloadUrls = videoUrls;
    }
    catch {
        bundle.videoDownloadUrls = {};
    }
    firebase_functions_1.logger.info("Keeper data exported", { keeperId, subcollections: SUBCOLLECTIONS.length });
    return bundle;
});
//# sourceMappingURL=dataManagement.js.map