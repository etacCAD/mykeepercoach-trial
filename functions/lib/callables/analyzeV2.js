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
exports.analyzeV2 = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * v2 onRequest: analyzeV2
 * Accepts POST with { sessionId, idToken }
 * CORS-enabled for the web app. Delegates to shared geminiAnalysis utility.
 */
exports.analyzeV2 = (0, https_1.onRequest)({
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "1GiB",
    cors: [
        "https://goalie-coach-dev-11a17.web.app",
        "https://goalie-coach-dev-11a17.firebaseapp.com",
        "https://www.mykeepercoach.com",
        "https://mykeepercoach.com",
        "http://localhost:5000",
        "http://localhost:3144",
    ],
}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    // Extract auth token from header or body
    const authHeader = req.headers.authorization || "";
    const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const bodyToken = req.body?.idToken || null;
    const idToken = headerToken || bodyToken;
    if (!idToken) {
        console.error("[analyzeV2] No auth token. Headers:", Object.keys(req.headers).join(", "));
        res.status(401).json({ error: "Missing auth token" });
        return;
    }
    let uid;
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
    }
    catch (e) {
        console.error("[analyzeV2] verifyIdToken failed:", e.code || e.message);
        res.status(401).json({ error: "Invalid auth token", detail: e.code });
        return;
    }
    const { sessionId } = req.body;
    if (!sessionId) {
        res.status(400).json({ error: "sessionId required" });
        return;
    }
    const db = admin.firestore();
    const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
        res.status(404).json({ error: "Session not found" });
        return;
    }
    const sessionData = sessionSnap.data();
    // Mark processing
    await sessionRef.update({ status: "processing", errorMessage: admin.firestore.FieldValue.delete() });
    // Respond immediately — analysis runs async
    res.json({ success: true, message: "Analysis started" });
    // Delegate to shared utility (fire-and-forget)
    const { analyzeWebSession } = await Promise.resolve().then(() => __importStar(require("../utils/geminiAnalysis")));
    const bucket = admin.storage().bucket();
    analyzeWebSession({ sessionRef, sessionData, bucket }).catch((err) => {
        console.error(`[analyzeV2] Session ${sessionId} failed:`, err.message);
    });
});
//# sourceMappingURL=analyzeV2.js.map