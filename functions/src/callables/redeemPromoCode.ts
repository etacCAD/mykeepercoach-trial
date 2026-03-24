import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export const redeemPromoCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in to redeem a promo code.");
  }

  const { code } = request.data;
  if (!code || typeof code !== "string") {
    throw new HttpsError("invalid-argument", "A valid promo code string must be provided.");
  }

  const uid = request.auth.uid;
  const db = admin.firestore();
  const codeId = code.trim().toUpperCase();

  const codeRef = db.collection("promoCodes").doc(codeId);
  const userRef = db.collection("users").doc(uid);
  const redemptionRef = codeRef.collection("redemptions").doc(uid);

  try {
    const result = await db.runTransaction(async (t) => {
      // 1. Read the promo code
      const codeSnap = await t.get(codeRef);
      if (!codeSnap.exists) {
        throw new HttpsError("not-found", "Invalid promo code.");
      }
      const codeData = codeSnap.data()!;

      // 2. Read the user
      const userSnap = await t.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError("not-found", "User profile not found.");
      }
      const userData = userSnap.data()!;

      // 3. Read the redemption record (prevent double redemption)
      const redemptionSnap = await t.get(redemptionRef);
      if (redemptionSnap.exists) {
        throw new HttpsError("already-exists", "You have already redeemed this promo code.");
      }

      // 4. Validate promo code state
      if (!codeData.isActive) {
        throw new HttpsError("failed-precondition", "This promo code is no longer active.");
      }

      if (codeData.expiresAt && codeData.expiresAt.toMillis() < Date.now()) {
        throw new HttpsError("failed-precondition", "This promo code has expired.");
      }

      if (codeData.maxUses && codeData.currentUses >= codeData.maxUses) {
        throw new HttpsError("resource-exhausted", "This promo code has reached its usage limit.");
      }

      // 5. Apply the benefits (e.g., mark as having promo access)
      // Since the app currently relies on trialExpiryDate for access, we'll set a far future date
      // for promo users (e.g. 1 year from now) or a specific "premium" flag.
      const now = admin.firestore.Timestamp.now();
      
      const updatePayload: any = {
        promoCodeRedeemed: codeId,
        promoCodeRedeemedAt: now,
      };

      // Ensure they don't get kicked out by the trial deadline
      // For now, setting freeTrialUsed to true skips the trial screen, and a long expiry grants access.
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      
      // Keep whichever date is further in the future
      let newExpiry = admin.firestore.Timestamp.fromDate(oneYearFromNow);
      if (userData.trialExpiryDate && userData.trialExpiryDate.toMillis() > newExpiry.toMillis()) {
         newExpiry = userData.trialExpiryDate; 
      }

      updatePayload.freeTrialUsed = true;
      updatePayload.trialOptedInAt = userData.trialOptedInAt || now;
      updatePayload.trialExpiryDate = newExpiry;

      t.update(userRef, updatePayload);

      // 6. Record the redemption
      t.set(redemptionRef, {
        redeemedAt: now,
        uid: uid,
        email: request.auth?.token.email || ""
      });

      // 7. Increment code usage
      t.update(codeRef, {
        currentUses: admin.firestore.FieldValue.increment(1)
      });

      return {
        success: true,
        message: `Promo code ${codeId} successfully redeemed!`,
      };
    });

    // Update custom claim
    await admin.auth().setCustomUserClaims(uid, {
      ...((await admin.auth().getUser(uid)).customClaims || {}),
      trialActive: true,
      hasPromoAccess: true,
    });

    logger.info("Promo code redeemed", { uid, codeId });
    return result;

  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("redeemPromoCode transaction failed", { uid, codeId, error });
    throw new HttpsError("internal", error.message || "Failed to redeem promo code.");
  }
});
