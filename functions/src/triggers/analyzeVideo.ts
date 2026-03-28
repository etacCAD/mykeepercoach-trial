import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { GoogleGenAI } from "@google/genai";
import * as path from "path";
import * as os from "os";

const db = admin.firestore();

// ── Gemini response schema ───────────────────────────────────────────────────

const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    saves: { type: "NUMBER", description: "Number of saves made by the goalkeeper" },
    shotsOnTargetFaced: { type: "NUMBER", description: "Total shots on target faced" },
    goalsConceded: { type: "NUMBER", description: "Goals conceded" },
    unsaveableGoals: { type: "NUMBER", description: "Goals that were unsaveable (e.g., deflections, penalties with no chance)" },
    errorsLeadingToGoal: { type: "NUMBER", description: "Goalkeeper errors directly leading to a goal" },
    crossesFaced: { type: "NUMBER", description: "Total crosses into the box faced" },
    crossesClaimed: { type: "NUMBER", description: "Crosses cleanly caught/claimed" },
    crossesPunched: { type: "NUMBER", description: "Crosses punched clear" },
    crossesMissed: { type: "NUMBER", description: "Crosses missed or dropped" },
    oneVOneFaced: { type: "NUMBER", description: "1v1 situations faced" },
    oneVOneSaved: { type: "NUMBER", description: "1v1 situations saved" },
    distributionAccuracyPercent: { type: "NUMBER", description: "Distribution accuracy as a decimal 0.0-1.0" },
    positioningRating: { type: "NUMBER", description: "Positioning quality rating 1-10" },
    communicationRating: { type: "NUMBER", description: "Communication/organization rating 1-10" },
    composure: { type: "NUMBER", description: "Composure under pressure rating 1-10" },
    overallRating: { type: "NUMBER", description: "Overall goalkeeper performance rating 1-10" },
    strengthNote1: { type: "STRING", description: "First key strength observed" },
    strengthNote2: { type: "STRING", description: "Second key strength observed" },
    strengthNote3: { type: "STRING", description: "Third key strength observed" },
    weaknessNote1: { type: "STRING", description: "First area to improve" },
    weaknessNote2: { type: "STRING", description: "Second area to improve" },
    coachComments: { type: "STRING", description: "2-3 sentence coaching summary of the performance" },
  },
  required: ["saves", "shotsOnTargetFaced", "goalsConceded", "overallRating", "coachComments"],
};

const GAME_PROMPT = `You are an expert youth goalkeeper coach and video analyst. Analyze this goalkeeper match video carefully.

Focus ONLY on the goalkeeper. Observe and count:
- Every save attempt (successful or not)
- Goals conceded and their nature (unsaveable vs. error)
- Cross situations (claimed, punched, missed)
- 1v1 breakaway situations
- Distribution quality (kicks, throws, passes)
- Positioning, communication, and composure throughout

Return your analysis as a structured JSON object matching the schema. Be conservative and accurate — do not guess if the footage is unclear. For any stat you cannot observe, use 0. For ratings, use the full 1–10 scale.

Coach comments should be encouraging, specific, and actionable — written directly to the goalkeeper.`;

const PRACTICE_PROMPT = `You are an expert youth goalkeeper coach and video analyst. Analyze this goalkeeper PRACTICE/TRAINING video carefully.

Focus ONLY on the goalkeeper's technique, form, and repetition quality, rather than match pressure. Observe:
- Shot stopping technique and diving form
- Handling consistency (catching vs parrying)
- Footwork and set position before shots
- Distribution repetition quality if present
- General work rate and focus

Since this is a practice environment, "goals conceded" or "saves" might just represent reps. Treat each rep as a "shot faced".
Return your analysis as a structured JSON object matching the schema. For any stat that doesn't apply to this drill/practice, use 0. For ratings, use the full 1–10 scale to rate their technique.

Coach comments should focus on growth, form correction, and repetition quality — written directly to the goalkeeper.`;

interface AnalyzeVideoParams {
  filePath: string;
  signedUrl: string;
  keeperId: string;
  clipId: string;
  matchDate?: string;
  opponent?: string;
  coachUserId: string;
  sessionType?: string;
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function analyzeVideo(params: AnalyzeVideoParams): Promise<string> {
  const { filePath, keeperId, clipId, matchDate, opponent, coachUserId, sessionType } = params;

  logger.info("Starting Google AI video analysis", { keeperId, clipId, sessionType });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in the environment. Cannot access Gemini.");

  const ai = new GoogleGenAI({ apiKey });

  // Determine MIME type from file path
  const mimeType = filePath.endsWith(".mov") ? "video/quicktime" : "video/mp4";
  
  const bucket = admin.storage().bucket();
  let analysisResult: any;
  let geminiFileName = "";

  try {
    const promptToUse = sessionType === "practice" ? PRACTICE_PROMPT : GAME_PROMPT;

    // 1. Download to memory buffer
    const fileName = path.basename(filePath);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    logger.info("Downloading video for analysis to memory:", { tempFilePath });
    await bucket.file(filePath).download({ destination: tempFilePath });

    // 2. Upload to Gemini AI Studio
    logger.info("Uploading buffer to Gemini AI Studio...");
    let uploadedFile = await ai.files.upload({ file: tempFilePath, config: { mimeType } });
    if (!uploadedFile.name) throw new Error("Failed to get file name from Gemini File API");
    geminiFileName = uploadedFile.name;

    // Delete local buffer
    try {
      const fs = require('fs');
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (e) {}

    // 3. Poll for processing completion
    logger.info("Waiting for Gemini natively process video...", { geminiFileName });
    while (uploadedFile.state === "PROCESSING") {
      await new Promise(r => setTimeout(r, 5000));
      uploadedFile = await ai.files.get({ name: geminiFileName });
    }

    if (uploadedFile.state === "FAILED") {
      throw new Error("Gemini File API failed to process the video");
    }

    // 4. Generate Content
    logger.info("Prompting Gemini model with video context...");
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: promptToUse },
            { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } }
          ],
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA as any,
      }
    });

    const rawText = result.text;
    if (!rawText) throw new Error("No text response received from Gemini");
    
    analysisResult = JSON.parse(rawText);

    logger.info("Gemini analysis complete", { keeperId, clipId, overallRating: analysisResult.overallRating });
  } catch (err) {
    logger.error("Gemini analysis failed", { keeperId, clipId, err });
    throw err;
  } finally {
    // 5. Cleanup the uploaded video from AI Studio to prevent billing leaks
    if (geminiFileName) {
      try {
        await ai.files.delete({ name: geminiFileName }).catch(() => {});
        logger.info("Cleaned up video from Gemini context", { geminiFileName });
      } catch (e) {}
    }
  }

  // Build the Firestore MatchReport document
  const reportId = db.collection("keepers").doc(keeperId).collection("matchReports").doc().id;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const reportDoc = {
    id: reportId,
    coachUserId,
    matchDate: matchDate ? admin.firestore.Timestamp.fromDate(new Date(matchDate)) : now,
    opponent: opponent ?? null,
    sessionType: sessionType ?? "game",
    overallRating: clamp(analysisResult.overallRating ?? 5, 1, 10),
    shotsOnTargetFaced: positiveInt(analysisResult.shotsOnTargetFaced),
    saves: positiveInt(analysisResult.saves),
    goalsConceded: positiveInt(analysisResult.goalsConceded),
    unsaveableGoals: positiveInt(analysisResult.unsaveableGoals),
    errorsLeadingToGoal: positiveInt(analysisResult.errorsLeadingToGoal),
    cleanCatches: 0,
    parries: 0,
    crossesFaced: positiveInt(analysisResult.crossesFaced),
    crossesClaimed: positiveInt(analysisResult.crossesClaimed),
    crossesPunched: positiveInt(analysisResult.crossesPunched),
    crossesMissed: positiveInt(analysisResult.crossesMissed),
    oneVOneFaced: positiveInt(analysisResult.oneVOneFaced),
    oneVOneSaved: positiveInt(analysisResult.oneVOneSaved),
    distributionAccuracyPercent: clamp(analysisResult.distributionAccuracyPercent ?? 0, 0, 1),
    positioningRating: analysisResult.positioningRating ? clamp(analysisResult.positioningRating, 1, 10) : null,
    communicationRating: analysisResult.communicationRating ? clamp(analysisResult.communicationRating, 1, 10) : null,
    composure: analysisResult.composure ? clamp(analysisResult.composure, 1, 10) : null,
    composureVisibility: "private",
    selfReflectionVisibility: "private",
    selfRatingVisibility: "shared",
    reportVisibility: "shared",
    strengthNote1: analysisResult.strengthNote1 ?? null,
    strengthNote2: analysisResult.strengthNote2 ?? null,
    strengthNote3: analysisResult.strengthNote3 ?? null,
    weaknessNote1: analysisResult.weaknessNote1 ?? null,
    weaknessNote2: analysisResult.weaknessNote2 ?? null,
    coachComments: analysisResult.coachComments ?? null,
    isTrialReport: false,
    
    // AI metadata
    aiGenerated: true,
    videoClipId: clipId,
    createdAt: now,
  };

  await db.collection("keepers").doc(keeperId).collection("matchReports").doc(reportId).set(reportDoc);

  logger.info("Match report created from AI analysis", { keeperId, reportId });

  return reportId;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveInt(value: any): number {
  const n = typeof value === "number" ? Math.round(value) : 0;
  return Math.max(0, n);
}
