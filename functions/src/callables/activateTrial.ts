/**
 * activateTrial — Activate the free trial for the authenticated user.
 *
 * Trial grants full access until the global deadline: June 30, 2026.
 * No credit card required. Each user can only activate once.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

// Hard deadline — every trial user gets the same expiry
const TRIAL_END = new Date("2026-06-30T23:59:59Z");

export const activateTrial = onCall(async (request) => {
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
      throw new HttpsError("not-found", "User profile not found.");
    }

    const userData = userSnap.data()!;

    // Prevent double activation
    if (userData.freeTrialUsed === true) {
      throw new HttpsError("already-exists", "Trial has already been activated for this account.");
    }

    const now = admin.firestore.Timestamp.now();
    const trialExpiry = admin.firestore.Timestamp.fromDate(TRIAL_END);

    // Update user document with trial fields
    await userRef.update({
      freeTrialUsed: true,
      trialOptedInAt: now,
      trialExpiryDate: trialExpiry,
    });

    // Set custom claim so client can check trial status from the token
    await admin.auth().setCustomUserClaims(uid, {
      ...((await admin.auth().getUser(uid)).customClaims || {}),
      trialActive: true,
    });

    logger.info("Trial activated", { uid, expiryDate: TRIAL_END.toISOString() });

    return {
      success: true,
      expiryDate: TRIAL_END.toISOString(),
      message: "Your free trial is active! Full access until June 30, 2026.",
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("activateTrial error", error);
    throw new HttpsError("internal", error.message || "Failed to activate trial.");
  }
});
