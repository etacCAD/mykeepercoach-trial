import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { analyzeVideo } from "./analyzeVideo";

const db = admin.firestore();
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const VALID_CONTENT_TYPES = ["video/mp4", "video/quicktime"];

export const onVideoUploaded = onObjectFinalized(
  { timeoutSeconds: 540, secrets: ["GEMINI_API_KEY"] },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;
    const fileSize = event.data.size;

    if (!filePath) return;

    // Only process videos in the expected path: keepers/{keeperId}/videos/{clipId}.mp4
    const pathParts = filePath.split("/");
    if (pathParts[0] !== "keepers" || pathParts[2] !== "videos" || pathParts.length < 4) {
      return; // Not our path, ignore
    }

    const keeperId = pathParts[1];
    const clipFileName = pathParts[pathParts.length - 1];
    const clipId = clipFileName.replace(/\.[^.]+$/, ""); // Remove extension

    logger.info("Video uploaded — starting validation", { filePath, keeperId, clipId });

    // ── Step 1: Validate content type
    if (!contentType || !VALID_CONTENT_TYPES.includes(contentType)) {
      logger.warn("Invalid content type, deleting", { filePath, contentType });
      await admin.storage().bucket().file(filePath).delete();
      await updateClipStatus(keeperId, clipId, "failed", "Invalid file type. Only MP4 and MOV are supported.");
      return;
    }

    // ── Step 2: Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      logger.warn("Video too large, deleting", { filePath, fileSize });
      await admin.storage().bucket().file(filePath).delete();
      await updateClipStatus(keeperId, clipId, "failed", "Video exceeds the 500MB limit.");
      return;
    }

    // ── Step 3: Get signed URL + set status → analyzing
    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);
    const [storageUrl] = await file.getSignedUrl({
      action: "read",
      expires: "2030-01-01",
    });

    // Get clip doc to grab metadata (coachUserId, matchDate, opponent, sessionType)
    const clipRef = db.collection("keepers").doc(keeperId).collection("videoClips").doc(clipId);
    const clipDoc = await clipRef.get();
    const clipData = clipDoc.data() ?? {};

    await clipRef.set(
      {
        storageURL: storageUrl,
        fileSizeBytes: fileSize,
        status: "analyzing",
      },
      { merge: true }
    );

    logger.info("Clip set to analyzing, calling Gemini", { keeperId, clipId });

    // ── Step 4: AI Analysis
    try {
      const reportId = await analyzeVideo({
        filePath,
        signedUrl: storageUrl,
        keeperId,
        clipId,
        matchDate: clipData.matchDate?.toDate?.()?.toISOString(),
        opponent: clipData.opponent,
        coachUserId: clipData.coachUserId ?? "",
        sessionType: clipData.sessionType ?? "game", // ADDED FOR NEW FEATURE
      });

      // ── Step 5: Mark clip ready with report link
      await clipRef.update({
        status: "ready",
        matchReportId: reportId,
      });

      logger.info("AI pipeline complete", { keeperId, clipId, reportId });
    } catch (err: any) {
      logger.error("AI analysis failed, marking clip failed", { keeperId, clipId, err });
      await updateClipStatus(keeperId, clipId, "failed", "AI analysis failed. Please try again.");
    }
  }
);

async function updateClipStatus(keeperId: string, clipId: string, status: string, errorMessage?: string) {
  const ref = db.collection("keepers").doc(keeperId).collection("videoClips").doc(clipId);
  if (ref) {
    await ref.set({ status, ...(errorMessage ? { errorMessage } : {}) }, { merge: true });
  }
}
