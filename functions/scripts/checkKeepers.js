// Firebase Admin script to check and fix keeper documents in Firestore
process.env.FIRESTORE_EMULATOR_HOST = ''; // ensure we hit real Firestore
const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'goalie-coach-dev-11a17',
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

async function main() {
  console.log('Fetching all keeper documents from Firestore...\n');
  
  const snapshot = await db.collection('keepers').get();
  
  if (snapshot.empty) {
    console.log('❌ NO keeper documents found in Firestore at all!');
    console.log('The push from SwiftData is failing silently.');
    return;
  }
  
  console.log(`Found ${snapshot.size} keeper(s):\n`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`  name: ${data.name}`);
    console.log(`  coachUserId: ${data.coachUserId}`);
    console.log(`  keeperInviteCode: ${data.keeperInviteCode || '❌ MISSING'}`);
    console.log(`  keeperUserId: ${data.keeperUserId || '(none)'}`);
    console.log('');
  });
}

main().catch(console.error);
