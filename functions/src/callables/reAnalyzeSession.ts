import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * Callable: reAnalyzeSession
 * Re-triggers Gemini analysis for an existing web session that got stuck or failed.
 * Called from the dashboard with { sessionId, targetUserId? }.
 *
 * When an admin views a user's dashboard via impersonation (?uid=...), the client
 * passes targetUserId so we look up the session under the correct user's collection.
 */
export const reAnalyzeSession = onCall(
  { secrets: ["GEMINI_API_KEY"], timeoutSeconds: 3600, memory: "8GiB", cpu: 8, concurrency: 1, invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const callerUid = request.auth.uid;
    const { sessionId, targetUserId } = request.data as { sessionId: string; targetUserId?: string };

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "sessionId is required.");
    }

    // If a targetUserId is provided, allow cross-user lookup.
    // Follows the same loose check as other admin callables — tighten with custom claims later.
    let userId = callerUid;
    if (targetUserId && targetUserId !== callerUid) {
      userId = targetUserId;
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
    await sessionRef.update({
      status: "processing",
      errorMessage: admin.firestore.FieldValue.delete(),
      stepTimestamps: { queuedAt: admin.firestore.FieldValue.serverTimestamp() },
    });

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

