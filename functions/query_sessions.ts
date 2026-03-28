import * as admin from "firebase-admin";

admin.initializeApp({
  projectId: "goalie-coach-dev-11a17"
});

async function run() {
  const db = admin.firestore();
  const q = await db
    .collection("users")
    .doc("qSFV1XI86fWxZff9WrNkOuJd9hw2")
    .collection("sessions")
    .where("status", "==", "failed")
    .orderBy("createdAt", "desc")
    .limit(3)
    .get();

  if (q.empty) {
    console.log("No failed sessions found.");
    return;
  }

  q.forEach(doc => {
    console.log("Session:", doc.id);
    const data = doc.data();
    if (data.createdAt) {
      data.createdAt = data.createdAt.toDate();
    }
    console.log(JSON.stringify(data, null, 2));
  });
}

run().catch(console.error);
