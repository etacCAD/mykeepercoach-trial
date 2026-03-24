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
exports.onVideoUploaded = void 0;
const storage_1 = require("firebase-functions/v2/storage");
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const analyzeVideo_1 = require("./analyzeVideo");
const db = admin.firestore();
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const VALID_CONTENT_TYPES = ["video/mp4", "video/quicktime"];
exports.onVideoUploaded = (0, storage_1.onObjectFinalized)({ timeoutSeconds: 540, secrets: ["GEMINI_API_KEY"] }, async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;
    const fileSize = event.data.size;
    if (!filePath)
        return;
    // Only process videos in the expected path: keepers/{keeperId}/videos/{clipId}.mp4
    const pathParts = filePath.split("/");
    if (pathParts[0] !== "keepers" || pathParts[2] !== "videos" || pathParts.length < 4) {
        return; // Not our path, ignore
    }
    const keeperId = pathParts[1];
    const clipFileName = pathParts[pathParts.length - 1];
    const clipId = clipFileName.replace(/\.[^.]+$/, ""); // Remove extension
    firebase_functions_1.logger.info("Video uploaded — starting validation", { filePath, keeperId, clipId });
    // ── Step 1: Validate content type
    if (!contentType || !VALID_CONTENT_TYPES.includes(contentType)) {
        firebase_functions_1.logger.warn("Invalid content type, deleting", { filePath, contentType });
        await admin.storage().bucket().file(filePath).delete();
        await updateClipStatus(keeperId, clipId, "failed", "Invalid file type. Only MP4 and MOV are supported.");
        return;
    }
    // ── Step 2: Validate file size
    if (fileSize > MAX_FILE_SIZE) {
        firebase_functions_1.logger.warn("Video too large, deleting", { filePath, fileSize });
        await admin.storage().bucket().file(filePath).delete();
        await updateClipStatus(keeperId, clipId, "failed", "Video exceeds the 500MB limit.");
        return;
    }
    // ── Step 3: Get signed URL + set status → analyzing
    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);
    const [storageUrl] = await file.getSignedUrl({
        action: "read",
        expires: "2030-01-01",
    });
    // Get clip doc to grab metadata (coachUserId, matchDate, opponent, sessionType)
    const clipRef = db.collection("keepers").doc(keeperId).collection("videoClips").doc(clipId);
    const clipDoc = await clipRef.get();
    const clipData = clipDoc.data() ?? {};
    await clipRef.set({
        storageURL: storageUrl,
        fileSizeBytes: fileSize,
        status: "analyzing",
    }, { merge: true });
    firebase_functions_1.logger.info("Clip set to analyzing, calling Gemini", { keeperId, clipId });
    // ── Step 4: AI Analysis
    try {
        const reportId = await (0, analyzeVideo_1.analyzeVideo)({
            filePath,
            signedUrl: storageUrl,
            keeperId,
            clipId,
            matchDate: clipData.matchDate?.toDate?.()?.toISOString(),
            opponent: clipData.opponent,
            coachUserId: clipData.coachUserId ?? "",
            sessionType: clipData.sessionType ?? "game", // ADDED FOR NEW FEATURE
        });
        // ── Step 5: Mark clip ready with report link
        await clipRef.update({
            status: "ready",
            matchReportId: reportId,
        });
        firebase_functions_1.logger.info("AI pipeline complete", { keeperId, clipId, reportId });
    }
    catch (err) {
        firebase_functions_1.logger.error("AI analysis failed, marking clip failed", { keeperId, clipId, err });
        await updateClipStatus(keeperId, clipId, "failed", "AI analysis failed. Please try again.");
    }
});
async function updateClipStatus(keeperId, clipId, status, errorMessage) {
    const ref = db.collection("keepers").doc(keeperId).collection("videoClips").doc(clipId);
    if (ref) {
        await ref.set({ status, ...(errorMessage ? { errorMessage } : {}) }, { merge: true });
    }
}
//# sourceMappingURL=onVideoUploaded.js.map