/**
 * adminUpdateUser — Admin callable to update a player's name, email, and/or password.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export const adminUpdateUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  if (request.auth.token.email !== "evan@tacanni.com") {
    throw new HttpsError("permission-denied", "Only administrators can update users.");
  }

  const { uid, displayName, email, password, firstName, lastName } = request.data as {
    uid: string;
    displayName?: string;
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };

  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  try {
    // Build Auth update payload
    const authUpdate: admin.auth.UpdateRequest = {};
    if (displayName !== undefined && displayName.trim()) authUpdate.displayName = displayName.trim();
    if (email !== undefined && email.trim()) authUpdate.email = email.trim();
    if (password !== undefined && password.length >= 6) authUpdate.password = password;

    if (Object.keys(authUpdate).length > 0) {
      await admin.auth().updateUser(uid, authUpdate);
    }

    // Sync Firestore profile
    const firestoreUpdate: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (authUpdate.displayName) firestoreUpdate.displayName = authUpdate.displayName;
    if (authUpdate.email) firestoreUpdate.email = authUpdate.email;
    if (firstName !== undefined) firestoreUpdate.firstName = firstName.trim();
    if (lastName !== undefined) firestoreUpdate.lastName = lastName.trim();

    await admin.firestore().collection("users").doc(uid).set(firestoreUpdate, { merge: true });

    logger.info("Admin updated user", { uid, fields: Object.keys(authUpdate) });
    return { success: true };
  } catch (error: any) {
    logger.error("adminUpdateUser error", error);
    throw new HttpsError("internal", error.message || "Failed to update user.");
  }
});
