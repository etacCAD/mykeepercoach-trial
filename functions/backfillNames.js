const admin = require('firebase-admin');

// Initialize Firebase Admin (assuming default credentials or emulators are set up)
// You may need to provide a service account key path if running against production:
// const serviceAccount = require('./serviceAccountKey.json');
// admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
// For local execution against the default project:
admin.initializeApp();

const db = admin.firestore();

async function backfillNames() {
  console.log('Starting name backfill...');
  const usersSnap = await db.collection('users').get();
  
  if (usersSnap.empty) {
    console.log('No users found.');
    return;
  }

  let updatedCount = 0;
  let skippedCount = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const uid = doc.id;
    
    // Skip if already split
    if (data.firstName || data.lastName) {
      skippedCount++;
      continue;
    }

    if (data.displayName) {
      const nameParts = data.displayName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      await db.collection('users').doc(uid).update({
        firstName,
        lastName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Updated user ${uid} (${data.displayName}) -> First: ${firstName}, Last: ${lastName}`);
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log('Backfill complete!');
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
}

backfillNames().catch(console.error);
