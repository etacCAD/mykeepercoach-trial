import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export const createShareLink = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in to share a report.");
  }

  const { sessionId, targetUid } = request.data as { sessionId: string; targetUid?: string };
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }

  let uid = request.auth.uid;
  if (targetUid && targetUid !== uid) {
    if (request.auth.token.email !== "evan@tacanni.com") {
      throw new HttpsError("permission-denied", "Only administrators can share on behalf of other users.");
    }
    uid = targetUid; // Use the provided user ID if the admin is impersonating
  }

  const db = admin.firestore();

  try {
    // 1. Fetch user data
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    const userData = userSnap.data();
    const ownerName = userData?.firstName && userData?.lastName 
      ? `${userData.firstName} ${userData.lastName}`
      : userData?.displayName || "A Goalkeeper";

    // 2. Fetch session data
    const sessionSnap = await db.collection("users").doc(uid).collection("sessions").doc(sessionId).get();
    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session not found or you don't have permission.");
    }
    const sessionData = sessionSnap.data();

    if (!sessionData?.analysis) {
        throw new HttpsError("failed-precondition", "Cannot share a report until analysis is complete.");
    }

    // 3. Create shared report object
    // Set expiration to 48 hours from now
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000));
    
    const sharedReportData = {
      ownerName,
      ownerUid: uid,
      originalSessionId: sessionId,
      myTeam: sessionData.myTeam || "",
      opponent: sessionData.opponent || "",
      gameDate: sessionData.gameDate || "",
      label: sessionData.label || "",
      videos: sessionData.videos || [],
      analysis: sessionData.analysis,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      views: 0
    };

    // 4. Write to sharedReports collection
    const shareRef = await db.collection("sharedReports").add(sharedReportData);

    logger.info("Created share link", { uid, sessionId, shareId: shareRef.id });

    return { 
      shareId: shareRef.id,
      expiresAt: expiresAt.toDate().toISOString()
    };
  } catch (error: any) {
    logger.error("createShareLink error", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Failed to create share link.");
  }
});
