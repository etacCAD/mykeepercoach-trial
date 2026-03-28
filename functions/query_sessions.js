import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

async function run() {
  const q = await db.collection("users").doc("qSFV1XI86fWxZff9WrNkOuJd9hw2").collection("sessions").orderBy("createdAt", "desc").limit(3).get();
  q.forEach(doc => {
    console.log("Session:", doc.id);
    console.log("Data:", JSON.stringify(doc.data(), null, 2));
  });
}
run().catch(console.error);
