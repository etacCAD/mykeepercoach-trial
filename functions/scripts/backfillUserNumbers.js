const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

const db = admin.firestore();

async function backfillUserNumbers() {
  console.log("Starting backfill for user numbers...");
  
  const usersSnapshot = await db.collection("users").get();
  let updatedCount = 0;

  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    
    // Only backfill if they don't already have one
    if (data.userNumber === undefined) {
      const counterRef = db.collection("counters").doc("users");
      
      try {
        const newNumber = await db.runTransaction(async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          
          let newCount = 1000;
          if (counterDoc.exists) {
            newCount = (counterDoc.data()?.count || 1000) + 1;
          }
          
          transaction.set(counterRef, { count: newCount }, { merge: true });
          transaction.update(doc.ref, { userNumber: newCount });
          
          return newCount;
        });
        
        console.log(`Assigned number ${newNumber} to user ${doc.id}`);
        updatedCount++;
      } catch (error) {
        console.error(`Error backfilling user ${doc.id}:`, error);
      }
    } else {
        console.log(`User ${doc.id} already has a number: ${data.userNumber}`);
    }
  }

  console.log(`Backfill complete. Updated ${updatedCount} users.`);
}

backfillUserNumbers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
