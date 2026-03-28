import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * v2 onRequest: analyzeV2
 * Accepts POST with { sessionId, idToken }
 * CORS-enabled for the web app. Delegates to shared geminiAnalysis utility.
 */
export const analyzeV2 = onRequest(
  {
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 540,
    memory: "2GiB",
    concurrency: 1,
    invoker: "public",
    cors: [
      "https://goalie-coach-dev-11a17.web.app",
      "https://goalie-coach-dev-11a17.firebaseapp.com",
      "https://www.mykeepercoach.com",
      "https://mykeepercoach.com",
      "http://localhost:5000",
      "http://localhost:3144",
    ],
  },
  async (req, res) => {
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

    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (e: any) {
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

    const sessionData = sessionSnap.data()!;

    // Mark processing
    await sessionRef.update({ status: "processing", errorMessage: admin.firestore.FieldValue.delete() });

    // Respond immediately — analysis runs async
    res.json({ success: true, message: "Analysis started" });

    // Delegate to shared utility (fire-and-forget)
    const { analyzeWebSession } = await import("../utils/geminiAnalysis");
    const bucket = admin.storage().bucket();

    analyzeWebSession({ sessionRef, sessionData, bucket }).catch((err: any) => {
      console.error(`[analyzeV2] Session ${sessionId} failed:`, err.message);
    });
  }
);
