import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export const logSharedReportView = onCall(async (request) => {
  const { shareId } = request.data as { shareId: string };
  if (!shareId || typeof shareId !== "string") {
    throw new HttpsError("invalid-argument", "shareId is required.");
  }

  const db = admin.firestore();

  try {
    const reportRef = db.collection("sharedReports").doc(shareId);
    
    // Use a transaction or robust read-modify-write? 
    // Incrementing is easiest with FieldValue.
    
    await db.runTransaction(async (transaction) => {
      const reportSnap = await transaction.get(reportRef);
      if (!reportSnap.exists) {
        throw new HttpsError("not-found", "Shared report not found.");
      }
      
      const data = reportSnap.data();
      if (!data) return;

      const expiresAt = data.expiresAt;
      if (expiresAt && expiresAt.toMillis() < Date.now()) {
        throw new HttpsError("failed-precondition", "Shared report has expired.");
      }

      transaction.update(reportRef, {
        views: admin.firestore.FieldValue.increment(1)
      });
    });

    logger.info("Logged view for shared report", { shareId });
    return { success: true };
  } catch (error: any) {
    logger.error("logSharedReportView error", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "Failed to log shared report view.");
  }
});
