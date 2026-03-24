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
exports.onWebSessionUploaded = void 0;
const storage_1 = require("firebase-functions/v2/storage");
const admin = __importStar(require("firebase-admin"));
/**
 * Triggered when a video is uploaded to: videos/{userId}/{filename}
 * Finds the matching pending session doc, sends the video to Gemini,
 * and writes the structured analysis back to the session doc.
 */
exports.onWebSessionUploaded = (0, storage_1.onObjectFinalized)({ timeoutSeconds: 540, secrets: ["GEMINI_API_KEY"] }, async (event) => {
    const filePath = event.data.name;
    if (!filePath)
        return;
    // Only process: videos/{userId}/{anything}
    const parts = filePath.split("/");
    if (parts[0] !== "videos" || parts.length < 3)
        return;
    const userId = parts[1];
    const contentType = event.data.contentType || "";
    // Only process video files
    if (!contentType.startsWith("video/")) {
        console.log(`Skipping non-video file: ${filePath}`);
        return;
    }
    const db = admin.firestore();
    // Find the most recent pending session for this user that contains this storage path
    const sessionsRef = db.collection("users").doc(userId).collection("sessions");
    const pending = await sessionsRef
        .where("status", "==", "pending")
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();
    if (pending.empty) {
        console.log(`No pending session found for user ${userId}`);
        return;
    }
    // Match by storagePath in the videos array
    let sessionRef = null;
    let sessionData = null;
    for (const docSnap of pending.docs) {
        const data = docSnap.data();
        const videos = data.videos || [];
        if (videos.some((v) => v.storagePath === filePath)) {
            sessionRef = docSnap.ref;
            sessionData = data;
            break;
        }
    }
    if (!sessionRef || !sessionData) {
        console.log(`No session matched storagePath: ${filePath}`);
        return;
    }
    // Check if all videos in the session have been uploaded
    const allVideoPaths = (sessionData.videos || []).map((v) => v.storagePath);
    const bucket = admin.storage().bucket(event.data.bucket);
    // Verify all sibling files exist in Storage before triggering analysis
    const existChecks = await Promise.all(allVideoPaths.map(async (p) => {
        try {
            const [exists] = await bucket.file(p).exists();
            return exists;
        }
        catch {
            return false;
        }
    }));
    if (!existChecks.every(Boolean)) {
        console.log("Not all videos uploaded yet — waiting for the rest.");
        return;
    }
    // Mark as processing so duplicate triggers are ignored
    await sessionRef.update({ status: "processing" });
    console.log(`Analyzing session ${sessionRef.id} for user ${userId}`);
    try {
        const { analyzeWebSession } = await Promise.resolve().then(() => __importStar(require("../utils/geminiAnalysis")));
        await analyzeWebSession({ sessionRef, sessionData, bucket });
        console.log(`Session ${sessionRef.id} analysis complete.`);
    }
    catch (err) {
        console.error("Analysis failed:", err);
        // analyzeWebSession already updates Firestore status to 'failed'
    }
});
//# sourceMappingURL=onWebSessionUploaded.js.map