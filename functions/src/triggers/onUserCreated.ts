import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

/**
 * Trigger: onCreate for a new User Document
 * Path: users/{userId}
 * 
 * Purpose: Assigns a unique, readable numeric ID to each new user.
 * It uses a global counter "counters/users" to ensure uniqueness.
 */
export const onUserCreated = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const db = admin.firestore();
    const counterRef = db.collection("counters").doc("users");

    try {
      const userNumber = await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let newCount = 1000; // Start user numbers at 1000
        if (counterDoc.exists) {
          const currentCount = counterDoc.data()?.count || 1000;
          newCount = currentCount + 1;
        }

        // Update the counter
        transaction.set(counterRef, { count: newCount }, { merge: true });

        // Update the user document
        const userRef = db.collection("users").doc(userId);
        transaction.update(userRef, { userNumber: newCount });

        return newCount;
      });

      functions.logger.info(`Assigned userNumber ${userNumber} to user ${userId}`);
    } catch (error) {
      functions.logger.error("Error assigning userNumber", error);
    }
  });
