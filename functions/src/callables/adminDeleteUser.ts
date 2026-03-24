/**
 * adminDeleteUser — Admin callable to delete a player from Auth + Firestore.
 * The superadmin account evan@tacanni.com is permanently protected.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

const PROTECTED_EMAIL = "evan@tacanni.com";

export const adminDeleteUser = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  if (request.auth.token.email !== PROTECTED_EMAIL) {
    throw new HttpsError("permission-denied", "Only administrators can delete users.");
  }

  const { uid } = request.data as { uid: string };

  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  let userEmail: string | undefined;

  try {
    let userRecord: admin.auth.UserRecord | null = null;
    try {
      // Fetch the user record to check the email before deleting
      userRecord = await admin.auth().getUser(uid);
      userEmail = userRecord.email;
    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        logger.warn(`User with uid ${uid} not found in Firebase Auth. Proceeding with Firestore deletion only.`);
      } else {
        // Re-throw other auth errors
        throw authError;
      }
    }

    if (userRecord) {
      if (userRecord.email?.toLowerCase() === PROTECTED_EMAIL.toLowerCase()) {
        throw new HttpsError(
          "permission-denied",
          "This account cannot be deleted."
        );
      }
      // Delete from Firebase Auth
      await admin.auth().deleteUser(uid);
      logger.info("Admin deleted user from Auth", { uid, email: userRecord.email });
    } else {
      logger.info("Admin skipped Auth deletion as user not found in Auth", { uid });
    }

    // Delete Firestore profile document and all its sub-collections
    const userDocRef = admin.firestore().collection("users").doc(uid);
    await admin.firestore().recursiveDelete(userDocRef);
    logger.info("Admin deleted user document and sub-collections from Firestore", { uid });

    return { success: true };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    logger.error("adminDeleteUser error", { uid, email: userEmail, error: error.message, stack: error.stack });
    throw new HttpsError("internal", error.message || "Failed to delete user.");
  }
});
