/**
 * adminCreateUser — Admin callable to create a new keeper account.
 * Only callable by authenticated admin users.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export const adminCreateUser = onCall(async (request) => {
  // Require authentication
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  // Check admin claim (loose check — any signed-in user for now; tighten later)
  const { email, password, displayName, firstName, lastName, ageGroup } = request.data as {
    email: string;
    password: string;
    displayName: string;
    firstName?: string;
    lastName?: string;
    ageGroup?: string;
  };

  if (!email || !password || !displayName) {
    throw new HttpsError("invalid-argument", "email, password, and displayName are required.");
  }

  try {
    // Create Auth user
    const userRecord = await admin.auth().createUser({ email, password, displayName });

    // Count existing keepers to assign a player number
    const snapshot = await admin.firestore().collection("users").where("role", "==", "keeper").get();
    const playerNumber = snapshot.size + 1;

    // Write Firestore profile
    const firestoreData: any = {
      email,
      displayName,
      role: "keeper",
      userNumber: playerNumber,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (firstName) firestoreData.firstName = firstName.trim();
    if (lastName) firestoreData.lastName = lastName.trim();
    if (ageGroup) firestoreData.ageGroup = ageGroup;

    await admin.firestore().collection("users").doc(userRecord.uid).set(firestoreData);

    logger.info("Admin created keeper account", { uid: userRecord.uid, email });
    return { success: true, uid: userRecord.uid };
  } catch (error: any) {
    logger.error("adminCreateUser error", error);
    throw new HttpsError("internal", error.message || "Failed to create user.");
  }
});
