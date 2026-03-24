import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Callable: reAnalyzeSession
 * Re-triggers Gemini analysis for an existing web session that got stuck or failed.
 * Called from the dashboard with { sessionId }.
 */
export const reAnalyzeSession = onCall(
  { secrets: ["GEMINI_API_KEY"], timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const userId = request.auth.uid;
    const { sessionId } = request.data as { sessionId: string };

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "sessionId is required.");
    }

    const db = admin.firestore();
    const sessionRef = db.collection("users").doc(userId).collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }

    const sessionData = sessionSnap.data()!;
    const videos: { storagePath?: string; url?: string }[] = sessionData.videos || [];

    const videosWithPaths = videos.filter((v) => v.storagePath);
    if (videosWithPaths.length === 0) {
      throw new HttpsError("failed-precondition", "No video paths found on this session.");
    }

    // Mark as processing immediately so UI updates
    await sessionRef.update({ status: "processing", errorMessage: admin.firestore.FieldValue.delete() });

    try {
      const { analyzeWebSession } = await import("../utils/geminiAnalysis");
      const bucket = admin.storage().bucket();
      await analyzeWebSession({ sessionRef, sessionData, bucket });
      return { success: true };
    } catch (err) {
      // analyzeWebSession already updates Firestore status to 'failed'
      throw new HttpsError("internal", `Analysis failed: ${err}`);
    }
  }
);
