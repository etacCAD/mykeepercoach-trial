// Script to set CORS on firebase storage bucket
// Run from /functions directory: node set-cors.js
const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'goalie-coach-dev-11a17',
  storageBucket: 'goalie-coach-dev-11a17.firebasestorage.app',
});

const bucket = admin.storage().bucket();

const corsConfig = [
  {
    origin: [
      'https://goalie-coach-dev-11a17.web.app',
      'https://goalie-coach-dev-11a17.firebaseapp.com',
      'http://localhost:5000',
      'http://localhost:5001',
    ],
    method: ['GET', 'HEAD'],
    responseHeader: ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
    maxAgeSeconds: 3600,
  },
];

bucket.setCorsConfiguration(corsConfig)
  .then(() => {
    console.log('✅ CORS configuration set successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error setting CORS:', err.message);
    process.exit(1);
  });
