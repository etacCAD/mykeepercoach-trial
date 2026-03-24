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
exports.api = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
// Route handler factory — registers routes on both "/" and "/api/" prefixes
// so they work whether called directly or via Firebase Hosting rewrite (/api/**)
const router = express.Router();
// ── Ted Chatbot ────────────────────────────────────────────────────────────
// POST /chat
// Unauthenticated or Authenticated (via idToken)
router.post('/chat', async (req, res) => {
    try {
        const { messages, context } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ success: false, error: 'messages array required' });
        }
        // Try to get auth to see if it's a logged-in user
        const authHeader = req.headers.authorization || '';
        const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const bodyToken = req.body?.idToken || null;
        const cookieToken = req.cookies?.__session || null;
        const idToken = headerToken || bodyToken || cookieToken;
        let uid = null;
        if (idToken) {
            try {
                const decoded = await admin.auth().verifyIdToken(idToken);
                uid = decoded.uid;
            }
            catch (e) {
                console.warn('[chat] Invalid token provided, continuing as anonymous.');
            }
        }
        const { chatWithTed } = await Promise.resolve().then(() => __importStar(require("./utils/geminiChat")));
        const reply = await chatWithTed({ messages, uid, context });
        res.json({ success: true, reply });
    }
    catch (error) {
        console.error('[chat] Error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate response' });
    }
});
// Expose minimal config for the frontend if needed
router.get('/config', (req, res) => {
    res.json({
        projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId || "goalie-coach-dev-11a17",
    });
});
// Helper middleware to verify admin in REST routes
async function verifyAdminRest(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.body?.idToken || req.cookies?.__session);
    if (!idToken)
        return res.status(401).json({ success: false, error: 'Missing auth token' });
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        if (decoded.email !== 'evan@tacanni.com' || decoded.email_verified !== true) {
            return res.status(403).json({ success: false, error: 'Permission denied: Admins only' });
        }
        req.user = decoded;
        next();
    }
    catch (e) {
        return res.status(401).json({ success: false, error: 'Invalid auth token' });
    }
}
// Admin: Create User
router.post('/admin/create-user', verifyAdminRest, async (req, res) => {
    const { email, password, displayName, ageGroup } = req.body;
    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName
        });
        await admin.firestore().collection('users').doc(userRecord.uid).set({
            email,
            displayName,
            ageGroup: ageGroup || null,
            role: 'keeper',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ success: true, uid: userRecord.uid });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
// Admin: Roster
router.get('/admin/roster', verifyAdminRest, async (req, res) => {
    try {
        const snapshot = await admin.firestore().collection('users').where('role', '==', 'keeper').get();
        const roster = [];
        snapshot.forEach(doc => {
            roster.push({ uid: doc.id, ...doc.data() });
        });
        res.json({ success: true, roster });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
// ── Analyze session ────────────────────────────────────────────────────────
// POST /analyze  { sessionId }
// Authorization: Bearer <firebase-id-token>
router.post('/analyze', async (req, res) => {
    // Try multiple auth methods:
    // 1. Authorization: Bearer <token> header (standard)
    // 2. req.body.idToken (fallback for Hosting rewrites that may strip headers)
    // 3. __session cookie (Firebase Hosting auth cookie)
    const authHeader = req.headers.authorization || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const bodyToken = req.body?.idToken || null;
    const cookieToken = req.cookies?.__session || null;
    const idToken = headerToken || bodyToken || cookieToken;
    console.log('[analyze] Auth sources - header:', !!headerToken, 'body:', !!bodyToken, 'cookie:', !!cookieToken);
    if (!idToken) {
        console.error('[analyze] No auth token found. Headers:', Object.keys(req.headers).join(', '));
        return res.status(401).json({ success: false, error: 'Missing auth token' });
    }
    let uid;
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
    }
    catch (e) {
        console.error('[analyze] verifyIdToken failed:', e.code || e.message);
        return res.status(401).json({ success: false, error: 'Invalid auth token', detail: e.code });
    }
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId required' });
    }
    const db = admin.firestore();
    const sessionRef = db.collection('users').doc(uid).collection('sessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    const sessionData = sessionSnap.data();
    if (sessionData.status === 'processing') {
        return res.status(409).json({ success: false, error: 'Already processing' });
    }
    // Mark processing immediately so UI updates
    await sessionRef.update({ status: 'processing', errorMessage: admin.firestore.FieldValue.delete() });
    // Fetch the user's ageGroup
    const userSnap = await db.collection('users').doc(uid).get();
    const ageGroup = userSnap.data()?.ageGroup || null;
    // Respond immediately — analysis runs async so it isn't limited by HTTP timeout
    res.json({ success: true, message: 'Analysis started' });
    // ── Async analysis (fire-and-forget after response sent) ──────────────
    const { analyzeWebSession } = await Promise.resolve().then(() => __importStar(require("./utils/geminiAnalysis")));
    const bucket = admin.storage().bucket();
    analyzeWebSession({ sessionRef, sessionData, bucket, ageGroup }).catch((err) => {
        console.error(`[analyze] Session ${sessionId} failed:`, err.message);
    });
});
// Mount router at both "/" (direct function URL) and "/api" (Firebase Hosting rewrite)
app.use('/', router);
app.use('/api', router);
// Export: auth is handled per-route via verifyIdToken
// runWith secrets injects GEMINI_API_KEY for the /chat and /analyze routes
exports.api = functions.runWith({
    secrets: ['GEMINI_API_KEY'],
}).https.onRequest(app);
//# sourceMappingURL=api.js.map