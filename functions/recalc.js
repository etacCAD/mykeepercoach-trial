const admin = require('firebase-admin');

// Initialize with default credentials
admin.initializeApp({
  projectId: 'goalie-coach' // Or it will pick it up automatically
});
const db = admin.firestore();

async function run() {
  console.log("Starting recalculation of past sessions...");
  try {
    const snapshot = await db.collectionGroup('sessions').where('status', '==', 'ready').get();
    console.log(`Found ${snapshot.size} ready sessions to check.`);

    let updatedCount = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // We only recalculate if it has an analysis and skills
      if (data.analysis && data.analysis.skills) {
        const skills = data.analysis.skills;
        
        // Find all non-null scores
        const validScores = Object.values(skills)
          .map(s => s?.score)
          .filter(score => typeof score === "number" && !isNaN(score));
        
        let newRating = null;
        if (validScores.length > 0) {
          const average100 = validScores.reduce((a, b) => a + b, 0) / validScores.length;
          newRating = parseFloat((average100 / 10).toFixed(1));
        }

        const oldRating = data.analysis.overallRating;

        if (newRating !== null && newRating !== oldRating) {
          console.log(`Updating session ${doc.id} \n  Old Rating: ${oldRating} \n  New Rating: ${newRating}`);
          
          await doc.ref.update({
            'analysis.overallRating': newRating
          });
          
          updatedCount++;
        } else if (newRating === null && oldRating !== null) {
            console.log(`Updating session ${doc.id} (all null skills) \n  Old Rating: ${oldRating} \n  New Rating: null`);
            await doc.ref.update({
              'analysis.overallRating': null
            });
            updatedCount++;
        }
      }
    }
    
    console.log(`\nSuccess! Updated ${updatedCount} sessions.`);
    process.exit(0);
  } catch (err) {
    console.error("Error updating sessions:", err);
    process.exit(1);
  }
}

run();
