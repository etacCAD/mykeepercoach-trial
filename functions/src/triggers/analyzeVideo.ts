import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const db = admin.firestore();

// ── Gemini response schema ───────────────────────────────────────────────────

const ANALYSIS_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    saves: { type: SchemaType.NUMBER, description: "Number of saves made by the goalkeeper" },
    shotsOnTargetFaced: { type: SchemaType.NUMBER, description: "Total shots on target faced" },
    goalsConceded: { type: SchemaType.NUMBER, description: "Goals conceded" },
    unsaveableGoals: { type: SchemaType.NUMBER, description: "Goals that were unsaveable (e.g., deflections, penalties with no chance)" },
    errorsLeadingToGoal: { type: SchemaType.NUMBER, description: "Goalkeeper errors directly leading to a goal" },
    crossesFaced: { type: SchemaType.NUMBER, description: "Total crosses into the box faced" },
    crossesClaimed: { type: SchemaType.NUMBER, description: "Crosses cleanly caught/claimed" },
    crossesPunched: { type: SchemaType.NUMBER, description: "Crosses punched clear" },
    crossesMissed: { type: SchemaType.NUMBER, description: "Crosses missed or dropped" },
    oneVOneFaced: { type: SchemaType.NUMBER, description: "1v1 situations faced" },
    oneVOneSaved: { type: SchemaType.NUMBER, description: "1v1 situations saved" },
    distributionAccuracyPercent: { type: SchemaType.NUMBER, description: "Distribution accuracy as a decimal 0.0-1.0" },
    positioningRating: { type: SchemaType.NUMBER, description: "Positioning quality rating 1-10" },
    communicationRating: { type: SchemaType.NUMBER, description: "Communication/organization rating 1-10" },
    composure: { type: SchemaType.NUMBER, description: "Composure under pressure rating 1-10" },
    overallRating: { type: SchemaType.NUMBER, description: "Overall goalkeeper performance rating 1-10" },
    strengthNote1: { type: SchemaType.STRING, description: "First key strength observed" },
    strengthNote2: { type: SchemaType.STRING, description: "Second key strength observed" },
    strengthNote3: { type: SchemaType.STRING, description: "Third key strength observed" },
    weaknessNote1: { type: SchemaType.STRING, description: "First area to improve" },
    weaknessNote2: { type: SchemaType.STRING, description: "Second area to improve" },
    coachComments: { type: SchemaType.STRING, description: "2-3 sentence coaching summary of the performance" },
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
  const { filePath, signedUrl, keeperId, clipId, matchDate, opponent, coachUserId, sessionType } = params;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  logger.info("Starting Gemini video analysis", { keeperId, clipId, sessionType });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", // Updated to 2.5-flash as used in web app
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: ANALYSIS_SCHEMA as any,
    },
  });

  // Determine MIME type from file path
  const mimeType = filePath.endsWith(".mov") ? "video/quicktime" : "video/mp4";

  let analysisResult: any;

  try {
    const promptToUse = sessionType === "practice" ? PRACTICE_PROMPT : GAME_PROMPT;
    
    const result = await model.generateContent([
      promptToUse,
      {
        fileData: {
          mimeType,
          fileUri: signedUrl,
        },
      },
    ]);

    const rawText = result.response.text();
    analysisResult = JSON.parse(rawText);

    logger.info("Gemini analysis complete", { keeperId, clipId, overallRating: analysisResult.overallRating });
  } catch (err) {
    logger.error("Gemini analysis failed", { keeperId, clipId, err });
    throw err;
  }

  // Build the Firestore MatchReport document
  const reportId = db.collection("keepers").doc(keeperId).collection("matchReports").doc().id;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const reportDoc = {
    id: reportId,
    coachUserId,
    matchDate: matchDate ? admin.firestore.Timestamp.fromDate(new Date(matchDate)) : now,
    opponent: opponent ?? null,
    sessionType: sessionType ?? "game", // ADDED: sessionType field
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
