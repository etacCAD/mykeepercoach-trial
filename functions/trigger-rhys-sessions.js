/**
 * Admin script: trigger re-analysis for Rhys's stuck sessions.
 * Run from: /functions$ node trigger-rhys-sessions.js
 */
const admin = require("firebase-admin");

admin.initializeApp({ projectId: "goalie-coach-dev-11a17", storageBucket: "goalie-coach-dev-11a17.firebasestorage.app" });

const USER_ID = "iBakcTrmoeXjv7dSfLxf90ss8wd2";

// Session IDs discovered via Firestore inspection
const SESSION_IDS = [
  "friz7qxQAjBV4cEYOwVX", // Mar 1, 2026 · Team Green vs. Game 3 (3 videos)
  "sVWOFGAc3RQ7ghJ7ufLr", // Jan 1, 2026 · Team Green vs. Game 1 (4 videos)
  "yUYeHpP3biczzjcHCyjz", // Feb 1, 2026 · Team Green vs. Game 2 (4 videos)
];

async function main() {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const { analyzeWebSession } = require("./lib/utils/geminiAnalysis");

  for (const sessionId of SESSION_IDS) {
    const sessionRef = db
      .collection("users")
      .doc(USER_ID)
      .collection("sessions")
      .doc(sessionId);

    const snap = await sessionRef.get();
    if (!snap.exists) {
      console.error(`❌ Session not found: ${sessionId}`);
      continue;
    }

    const sessionData = snap.data();
    console.log(`\n➡ Session: ${sessionData.label}`);
    console.log(`   ID: ${sessionId}`);
    console.log(`   Videos: ${sessionData.videos?.length}`);
    console.log(`   Current status: ${sessionData.status}`);

    // Reset to processing
    await sessionRef.update({
      status: "processing",
      errorMessage: admin.firestore.FieldValue.delete(),
    });
    console.log(`   ⏳ Set to 'processing', starting analysis...`);

    try {
      await analyzeWebSession({ sessionRef, sessionData, bucket });
      console.log(`   ✅ Analysis complete!`);
    } catch (err) {
      console.error(`   ❌ Analysis failed:`, err.message || err);
    }
  }

  console.log("\n✅ All sessions processed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
