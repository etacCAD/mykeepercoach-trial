const admin = require("firebase-admin");
const API_KEY = "AIzaSyAghUU6j4CyBYp5nw9R7foZvg7dqAR2Fy0";

// Initialize Firebase Admin using default credentials
admin.initializeApp({
  projectId: "goalie-coach-dev-11a17"
});

async function main() {
  const db = admin.firestore();
  
  // Find a session to test
  console.log("Looking for a test session...");
  let testSession = null;
  let userId = null;
  
  const usersSnap = await db.collection("users").limit(20).get();
  for (const userDoc of usersSnap.docs) {
    const sessions = await userDoc.ref.collection("sessions").orderBy("createdAt", "desc").limit(5).get();
    for (const s of sessions.docs) {
      if (s.data().opponent?.includes("River FC")) {
        testSession = s;
        userId = userDoc.id;
        break;
      }
    }
    if (testSession) break;
  }
  
  if (!testSession) {
    console.error("Could not find a test session!");
    process.exit(1);
  }
  
  const sessionId = testSession.id;
  console.log(`Found session: ${sessionId} for user ${userId} (${testSession.data().opponent})`);
  
  // 1. Get Custom Token
  console.log("Minting custom token...");
  const customToken = await admin.auth().createCustomToken(userId);
  
  // 2. Exchange for ID Token
  console.log("Exchanging for ID token...");
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const authData = await res.json();
  const idToken = authData.idToken;
  
  if (!idToken) {
    console.error("Failed to get ID token:", authData);
    process.exit(1);
  }
  
  // 3. Trigger reAnalyzeSession callable
  console.log("Triggering reAnalyzeSession Cloud Function...");
  const funcRes = await fetch("https://reanalyzesession-4q6jyjtqva-uc.a.run.app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify({ data: { sessionId } })
  });
  
  const funcData = await funcRes.text();
  console.log(`Function response URL status: ${funcRes.status}`);
  console.log(`Function response data: ${funcData}`);
  
  if (funcRes.status !== 200) {
    console.error("CORS or authentication error occurred!");
    process.exit(1);
  }
  
  // 4. Poll Firestore for updates
  console.log("Polling database for state changes...");
  let isDone = false;
  let attempts = 0;
  
  while (!isDone && attempts < 30) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
    
    const snap = await db.collection("users").doc(userId).collection("sessions").doc(sessionId).get();
    const data = snap.data();
    
    console.log(`[Attempt ${attempts}] Status: ${data.status} | Error: ${data.errorMessage || 'none'}`);
    
    if (data.status === 'ready' || data.status === 'completed' || data.status === 'failed') {
      isDone = true;
      if (data.status === 'failed') {
         console.error("Analysis failed in the backend!");
         process.exit(1);
      } else {
         console.log("Analysis completed successfully!");
         process.exit(0);
      }
    }
  }
  
  if (!isDone) {
    console.log("Timeout waiting for analysis to finish.");
    process.exit(1);
  }
}

main().catch(console.error).finally(() => process.exit(0));
