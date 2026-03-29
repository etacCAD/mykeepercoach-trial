import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";

/**
 * Triggered when a video is uploaded to: videos/{userId}/{filename}
 * Finds the matching pending session doc, sends the video to Gemini,
 * and writes the structured analysis back to the session doc.
 */
export const onWebSessionUploaded = onObjectFinalized(
  { timeoutSeconds: 540, secrets: ["GEMINI_API_KEY"], memory: "8GiB", cpu: 8, concurrency: 1 },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath) return;

    // Only process: videos/{userId}/{anything}
    const parts = filePath.split("/");
    if (parts[0] !== "videos" || parts.length < 3) return;

    const userId = parts[1];
    const contentType = event.data.contentType || "";

    // Only process video files
    if (!contentType.startsWith("video/")) {
      console.log(`Skipping non-video file: ${filePath}`);
      return;
    }

    const db = admin.firestore();

    // Find the most recent pending session for this user that contains this storage path
    const sessionsRef = db.collection("users").doc(userId).collection("sessions");
    const pending = await sessionsRef
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    if (pending.empty) {
      console.log(`No pending session found for user ${userId}`);
      return;
    }

    // Match by storagePath in the videos array
    let sessionRef: FirebaseFirestore.DocumentReference | null = null;
    let sessionData: FirebaseFirestore.DocumentData | null = null;

    for (const docSnap of pending.docs) {
      const data = docSnap.data();
      const videos: Array<{ storagePath: string }> = data.videos || [];
      if (videos.some((v) => v.storagePath === filePath)) {
        sessionRef = docSnap.ref;
        sessionData = data;
        break;
      }
    }

    if (!sessionRef || !sessionData) {
      console.log(`No session matched storagePath: ${filePath}`);
      return;
    }

    // Check if all videos in the session have been uploaded
    const allVideoPaths: string[] = (sessionData.videos || []).map(
      (v: { storagePath: string }) => v.storagePath
    );

    const bucket = admin.storage().bucket(event.data.bucket);

    // Verify all sibling files exist in Storage before triggering analysis
    const existChecks = await Promise.all(
      allVideoPaths.map(async (p) => {
        try {
          const [exists] = await bucket.file(p).exists();
          return exists;
        } catch {
          return false;
        }
      })
    );

    if (!existChecks.every(Boolean)) {
      console.log("Not all videos uploaded yet — waiting for the rest.");
      return;
    }

    // Mark as processing so duplicate triggers are ignored
    await sessionRef.update({
      status: "processing",
      "stepTimestamps.queuedAt": admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Analyzing session ${sessionRef.id} for user ${userId}`);

    try {
      const { analyzeWebSession } = await import("../utils/geminiAnalysis");
      await analyzeWebSession({ sessionRef, sessionData, bucket });
      console.log(`Session ${sessionRef.id} analysis complete.`);
    } catch (err) {
      console.error("Analysis failed:", err);
      // analyzeWebSession already updates Firestore status to 'failed'
    }
  }
);
