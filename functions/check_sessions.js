const admin = require("firebase-admin");
admin.initializeApp({
  projectId: "goalie-coach-dev-11a17"
});

async function run() {
  const db = admin.firestore();
  console.log("Fetching recent sessions...");
  const usersSnap = await db.collection("users").limit(10).get();
  
  for (const userDoc of usersSnap.docs) {
    const sessionsSnap = await userDoc.ref.collection("sessions")
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();
      
    if (!sessionsSnap.empty) {
      console.log(`User: ${userDoc.id}`);
      for (const sessionDoc of sessionsSnap.docs) {
        const data = sessionDoc.data();
        console.log(`  Session: ${sessionDoc.id} | Name: ${data.opponent} | Status: ${data.status} | Error: ${data.errorMessage}`);
      }
    }
  }
}

run().catch(console.error).finally(() => process.exit(0));
