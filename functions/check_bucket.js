const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'goalie-coach-dev-11a17'
});

async function run() {
  const bucket = admin.storage().bucket('goalie-coach-dev-11a17.firebasestorage.app');
  console.log("Bucket name:", bucket.name);
  
  try {
    const [policy] = await bucket.iam.getPolicy({requestedPolicyVersion: 3});
    console.log("IAM Policy bindings for aiplatform / function execution:", JSON.stringify(policy.bindings.filter(b => JSON.stringify(b).includes("aiplatform") || JSON.stringify(b).includes("appspot")), null, 2));
    
    // Check if the file from the screenshot exists
    const filePath = 'videos/iBakcTrmoeXjv7dSfLxf90ss8wd2/1774475169318_0_re-DE871A06-9CC8-4460-AD96-26A541DB26DD_002.MOV';
    const [exists] = await bucket.file(filePath).exists();
    console.log(`File ${filePath} exists?`, exists);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
