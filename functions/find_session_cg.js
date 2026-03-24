const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp();
const db = getFirestore();
async function run() {
    const snapshot = await db.collectionGroup('sessions').get();
    let found = false;
    snapshot.forEach(doc => {
        const data = doc.data();
        if ((data.label && data.label.includes('Patriots')) || data.status === 'pending' || data.status === 'processing') {
            console.log("Path:", doc.ref.path);
            console.log(doc.id, '=>', data.label, 'Status:', data.status, 'videos:', data.videos, 'error:', data.errorMessage);
            found = true;
        }
    });
    if (!found) console.log("No Patriots or pending sessions found.");
}
run().catch(console.error);
