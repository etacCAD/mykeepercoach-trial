/**
 * checkTrialStatus — Check the current trial status for the authenticated user.
 *
 * Called on page load to sync trial state. If the trial has expired,
 * it updates the custom claim to trialActive: false.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export const checkTrialStatus = onCall(async (request) => {
  // Must be signed in
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const uid = request.auth.uid;
  const db = admin.firestore();
  const userRef = db.collection("users").doc(uid);

  try {
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return { isTrialActive: false, daysRemaining: 0, expiryDate: null, trialUsed: false };
    }

    const userData = userSnap.data()!;

    // No trial ever activated
    if (!userData.trialExpiryDate) {
      return { isTrialActive: false, daysRemaining: 0, expiryDate: null, trialUsed: userData.freeTrialUsed === true };
    }

    const expiryDate = userData.trialExpiryDate.toDate();
    const now = new Date();
    const isActive = now < expiryDate;
    const msRemaining = Math.max(0, expiryDate.getTime() - now.getTime());
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    // If expired, update custom claim
    if (!isActive) {
      const existingClaims = (await admin.auth().getUser(uid)).customClaims || {};
      if (existingClaims.trialActive !== false) {
        await admin.auth().setCustomUserClaims(uid, {
          ...existingClaims,
          trialActive: false,
        });
        logger.info("Trial expired — claim updated", { uid });
      }
    }

    return {
      isTrialActive: isActive,
      daysRemaining,
      expiryDate: expiryDate.toISOString(),
      trialUsed: true,
    };
  } catch (error: any) {
    logger.error("checkTrialStatus error", error);
    throw new HttpsError("internal", error.message || "Failed to check trial status.");
  }
});
