const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "goalie-coach-dev-11a17"
});
const bucket = admin.storage().bucket();
console.log("Bucket name:", bucket.name);
