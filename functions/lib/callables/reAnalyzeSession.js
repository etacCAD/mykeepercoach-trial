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
exports.reAnalyzeSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * Callable: reAnalyzeSession
 * Re-triggers Gemini analysis for an existing web session that got stuck or failed.
 * Called from the dashboard with { sessionId }.
 */
exports.reAnalyzeSession = (0, https_1.onCall)({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    const userId = request.auth.uid;
    const { sessionId } = request.data;
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "sessionId is required.");
    }
    const db = admin.firestore();
    const sessionRef = db.collection("users").doc(userId).collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
        throw new https_1.HttpsError("not-found", "Session not found.");
    }
    const sessionData = sessionSnap.data();
    const videos = sessionData.videos || [];
    const videosWithPaths = videos.filter((v) => v.storagePath);
    if (videosWithPaths.length === 0) {
        throw new https_1.HttpsError("failed-precondition", "No video paths found on this session.");
    }
    // Mark as processing immediately so UI updates
    await sessionRef.update({ status: "processing", errorMessage: admin.firestore.FieldValue.delete() });
    try {
        const { analyzeWebSession } = await Promise.resolve().then(() => __importStar(require("../utils/geminiAnalysis")));
        const bucket = admin.storage().bucket();
        await analyzeWebSession({ sessionRef, sessionData, bucket });
        return { success: true };
    }
    catch (err) {
        // analyzeWebSession already updates Firestore status to 'failed'
        throw new https_1.HttpsError("internal", `Analysis failed: ${err}`);
    }
});
//# sourceMappingURL=reAnalyzeSession.js.map