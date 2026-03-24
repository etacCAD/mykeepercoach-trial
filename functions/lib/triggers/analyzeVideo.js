"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeVideo = analyzeVideo;
const admin = __importStar(require("firebase-admin"));
const firebase_functions_1 = require("firebase-functions");
const generative_ai_1 = require("@google/generative-ai");
const db = admin.firestore();
// ── Gemini response schema ───────────────────────────────────────────────────
const ANALYSIS_SCHEMA = {
    type: generative_ai_1.SchemaType.OBJECT,
    properties: {
        saves: { type: generative_ai_1.SchemaType.NUMBER, description: "Number of saves made by the goalkeeper" },
        shotsOnTargetFaced: { type: generative_ai_1.SchemaType.NUMBER, description: "Total shots on target faced" },
        goalsConceded: { type: generative_ai_1.SchemaType.NUMBER, description: "Goals conceded" },
        unsaveableGoals: { type: generative_ai_1.SchemaType.NUMBER, description: "Goals that were unsaveable (e.g., deflections, penalties with no chance)" },
        errorsLeadingToGoal: { type: generative_ai_1.SchemaType.NUMBER, description: "Goalkeeper errors directly leading to a goal" },
        crossesFaced: { type: generative_ai_1.SchemaType.NUMBER, description: "Total crosses into the box faced" },
        crossesClaimed: { type: generative_ai_1.SchemaType.NUMBER, description: "Crosses cleanly caught/claimed" },
        crossesPunched: { type: generative_ai_1.SchemaType.NUMBER, description: "Crosses punched clear" },
        crossesMissed: { type: generative_ai_1.SchemaType.NUMBER, description: "Crosses missed or dropped" },
        oneVOneFaced: { type: generative_ai_1.SchemaType.NUMBER, description: "1v1 situations faced" },
        oneVOneSaved: { type: generative_ai_1.SchemaType.NUMBER, description: "1v1 situations saved" },
        distributionAccuracyPercent: { type: generative_ai_1.SchemaType.NUMBER, description: "Distribution accuracy as a decimal 0.0-1.0" },
        positioningRating: { type: generative_ai_1.SchemaType.NUMBER, description: "Positioning quality rating 1-10" },
        communicationRating: { type: generative_ai_1.SchemaType.NUMBER, description: "Communication/organization rating 1-10" },
        composure: { type: generative_ai_1.SchemaType.NUMBER, description: "Composure under pressure rating 1-10" },
        overallRating: { type: generative_ai_1.SchemaType.NUMBER, description: "Overall goalkeeper performance rating 1-10" },
        strengthNote1: { type: generative_ai_1.SchemaType.STRING, description: "First key strength observed" },
        strengthNote2: { type: generative_ai_1.SchemaType.STRING, description: "Second key strength observed" },
        strengthNote3: { type: generative_ai_1.SchemaType.STRING, description: "Third key strength observed" },
        weaknessNote1: { type: generative_ai_1.SchemaType.STRING, description: "First area to improve" },
        weaknessNote2: { type: generative_ai_1.SchemaType.STRING, description: "Second area to improve" },
        coachComments: { type: generative_ai_1.SchemaType.STRING, description: "2-3 sentence coaching summary of the performance" },
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
// ── Main export ──────────────────────────────────────────────────────────────
async function analyzeVideo(params) {
    const { filePath, signedUrl, keeperId, clipId, matchDate, opponent, coachUserId, sessionType } = params;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    firebase_functions_1.logger.info("Starting Gemini video analysis", { keeperId, clipId, sessionType });
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // Updated to 2.5-flash as used in web app
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: ANALYSIS_SCHEMA,
        },
    });
    // Determine MIME type from file path
    const mimeType = filePath.endsWith(".mov") ? "video/quicktime" : "video/mp4";
    let analysisResult;
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
        firebase_functions_1.logger.info("Gemini analysis complete", { keeperId, clipId, overallRating: analysisResult.overallRating });
    }
    catch (err) {
        firebase_functions_1.logger.error("Gemini analysis failed", { keeperId, clipId, err });
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
    firebase_functions_1.logger.info("Match report created from AI analysis", { keeperId, reportId });
    return reportId;
}
// ── Helpers ──────────────────────────────────────────────────────────────────
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function positiveInt(value) {
    const n = typeof value === "number" ? Math.round(value) : 0;
    return Math.max(0, n);
}
//# sourceMappingURL=analyzeVideo.js.map