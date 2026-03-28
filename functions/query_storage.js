import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({ projectId: "goalie-coach-dev-11a17" });
const db = getFirestore();

async function run() {
  const sessions = await db.collection("users").doc("qSFV1XI86fWxZff9WrNkOuJd9hw2").collection("sessions").get();
  
  let targetSession = null;
  sessions.forEach(d => {
    if (d.data().label && d.data().label.includes("testhighlights vs. pipetest gem25")) {
      targetSession = { id: d.id, ...d.data() };
    }
  });

  if (!targetSession) {
    console.log("Session not found");
    return;
  }
  
  console.log("Found session:", targetSession.id);
  const paths = (targetSession.videos || []).map(v => v.storagePath);
  console.log("Paths:", paths);

  const bucket = getStorage().bucket("goalie-coach-dev-11a17.firebasestorage.app");
  for (const p of paths) {
    const [exists] = await bucket.file(p).exists();
    console.log(`Path ${p} exists: ${exists}`);
  }
}

run().catch(console.error);
