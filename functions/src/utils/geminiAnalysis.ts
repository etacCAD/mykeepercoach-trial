/**
 * geminiAnalysis — Shared Gemini analysis utility for web sessions.
 *
 * Single source of truth for:
 *   - Gemini model & SDK initialization
 *   - Goalkeeper analysis prompt
 *   - Video part building (signed URLs)
 *   - JSON response parsing
 *   - Firestore status updates
 *
 * Used by: api.ts, onWebSessionUploaded.ts, reAnalyzeSession.ts
 */
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── Constants ────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";

// ── Prompt Builder ───────────────────────────────────────────────────────────

export function buildWebSessionPrompt(params: {
  matchLabel: string;
  goalieNumber?: string;
  jerseyColor?: string;
  ageGroup?: string | null;
  actionSegments?: Array<{ video: number; start: string; end: string }>;
}): string {
  const { matchLabel, goalieNumber, jerseyColor, ageGroup, actionSegments } = params;
  const numberLine = goalieNumber ? `Jersey number: ${goalieNumber}.` : "";
  const colorLine = jerseyColor ? `Jersey color: ${jerseyColor}.` : "";

  let ageInstruction = "";
  if (ageGroup === "U8-U10") {
    ageInstruction = "CRITICAL: The goalkeeper is very young (U8-U10). Use very simple, highly encouraging language. Frame areas for improvement as 'adventures' or 'fun challenges'. Use emojis like ⭐, 🚀, or 🔥. Be extremely positive and focus on having fun and trying hard.";
  } else if (ageGroup === "U11-U13") {
    ageInstruction = "CRITICAL: The goalkeeper is U11-U13. Use encouraging but slightly more technical language. Focus on basic fundamentals, handling, and positioning.";
  } else if (ageGroup === "U14-U16") {
    ageInstruction = "CRITICAL: The goalkeeper is U14-U16. Use standard coaching terminology. Provide balanced feedback on percentages, positioning, and decision making.";
  } else if (ageGroup === "U17-U18" || ageGroup === "U17+") {
    ageInstruction = "CRITICAL: The goalkeeper is U17-U18. Use advanced tactical and technical language. Include references to xG, expected saves, and high-level decision making. Be direct, analytical, and professional.";
  }

  // Inject segment hints when available (from client-side motion detection)
  let segmentHint = "";
  if (actionSegments && actionSegments.length > 0) {
    const segList = actionSegments
      .map((s) => `  - Video ${s.video}: ${s.start} – ${s.end}`)
      .join("\n");
    segmentHint = `\n\nThe video has been trimmed to highlight segments. Key action periods detected:\n${segList}\nFocus your analysis on these segments — they contain the most relevant goalkeeper activity.`;
  }

  return `You are an expert goalkeeper coach analyzing match footage.

Match: ${matchLabel}. ${numberLine} ${colorLine}${segmentHint}
${ageInstruction}

Watch this goalkeeper footage carefully and return ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:

{
  "overallRating": <number 1-10>,
  "summary": "<2-3 sentence overall match summary>",
  "coachNote": "<personalized coaching note for the keeper, 2-3 sentences>",
  "skills": {
    "Shot Stopping": { "score": <0-100 or null>, "feedback": "<1-2 sentences>" },
    "Positioning": { "score": <0-100 or null>, "feedback": "<1-2 sentences>" },
    "Cross Management": { "score": <0-100 or null>, "feedback": "<1-2 sentences>" },
    "Distribution": { "score": <0-100 or null>, "feedback": "<1-2 sentences>" },
    "Communication": { "score": <0-100 or null>, "feedback": "<1-2 sentences>" },
    "1v1 Situations": { "score": <0-100 or null>, "feedback": "<1-2 sentences>" }
  },

IMPORTANT: If a skill was NOT clearly observed or cannot be properly evaluated from the footage, set its score to null and explain why in feedback. Do NOT guess or default to 50%. Only score skills you can genuinely evaluate from what you see.
  "stats": {
    "saves": <int>,
    "goalsConceded": <int>,
    "shotsOnTarget": <int>,
    "crossesClaimed": <int>,
    "cleanSheet": <boolean>
  },
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "areasToImprove": ["<area 1>", "<area 2>"],
  "highlights": [
    {
      "timestamp": "<MM:SS>",
      "description": "<why it's important, e.g. tough 1v1 save or great movement>",
      "type": "<e.g., 'Tough Save', '1v1', 'Coachable Moment'>"
    }
  ]
}

Ensure you keep 3-10 highlights or coachable moments in the 'highlights' array. Always save tough saves 1v1 or when they have to move a lot to make the save.`;
}

// ── JSON Parser ──────────────────────────────────────────────────────────────

/** Strip markdown code fences and parse JSON from Gemini response text. */
export function parseGeminiJson(raw: string): Record<string, any> {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

// ── Video Part Builder ───────────────────────────────────────────────────────

export interface VideoPart {
  fileData: { mimeType: string; fileUri: string };
}

/** Build Gemini video parts from storage paths using signed URLs. */
export async function buildVideoPartsFromSignedUrls(
  bucket: ReturnType<typeof admin.storage.prototype.bucket>,
  storagePaths: string[]
): Promise<VideoPart[]> {
  return Promise.all(
    storagePaths.map(async (p) => {
      const [signedUrl] = await bucket.file(p).getSignedUrl({
        action: "read" as const,
        expires: Date.now() + 30 * 60 * 1000, // 30 min
      });
      return {
        fileData: { mimeType: "video/mp4", fileUri: signedUrl },
      };
    })
  );
}

// ── Main Analysis Function ───────────────────────────────────────────────────

export interface AnalyzeWebSessionParams {
  sessionRef: FirebaseFirestore.DocumentReference;
  sessionData: FirebaseFirestore.DocumentData;
  bucket: ReturnType<typeof admin.storage.prototype.bucket>;
  ageGroup?: string | null;
}

/**
 * Run Gemini analysis on a web session.
 *
 * Handles the full pipeline:
 *   1. Extract video storage paths from session data
 *   2. Build signed-URL video parts
 *   3. Build the prompt with match metadata
 *   4. Call Gemini 2.5 Flash
 *   5. Parse the JSON response
 *   6. Update Firestore with results (status: 'ready') or error (status: 'failed')
 *
 * @returns The parsed analysis object on success
 * @throws On failure (after updating Firestore status to 'failed')
 */
export async function analyzeWebSession({
  sessionRef,
  sessionData,
  bucket,
  ageGroup,
}: AnalyzeWebSessionParams): Promise<Record<string, any>> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    // Extract video storage paths
    const videos: Array<{ storagePath: string; actionSegments?: Array<{ start: number; end: number }> }> =
      sessionData.videos || [];
    const allVideoPaths = videos.map((v) => v.storagePath).filter(Boolean);
    if (allVideoPaths.length === 0) throw new Error("No videos in session");

    // Build video parts from signed URLs
    const videoParts = await buildVideoPartsFromSignedUrls(bucket, allVideoPaths);

    // Build action segment hints from per-video motion detection data
    const actionSegments: Array<{ video: number; start: string; end: string }> = [];
    videos.forEach((v, idx) => {
      if (v.actionSegments && v.actionSegments.length > 0) {
        v.actionSegments.forEach((seg) => {
          const fmt = (s: number) =>
            `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
          actionSegments.push({ video: idx + 1, start: fmt(seg.start), end: fmt(seg.end) });
        });
      }
    });

    // Build prompt with match context + segment hints
    const matchLabel = `${sessionData.myTeam || "Home"} vs. ${sessionData.opponent || "Away"}`;
    const prompt = buildWebSessionPrompt({
      matchLabel,
      goalieNumber: sessionData.goalieNumber,
      jerseyColor: sessionData.jerseyColor,
      ageGroup,
      actionSegments: actionSegments.length > 0 ? actionSegments : undefined,
    });

    // Initialize Gemini and call
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    console.log(`[gemini] Analyzing session ${sessionRef.id} with ${videoParts.length} video(s)${actionSegments.length > 0 ? `, ${actionSegments.length} segment hint(s)` : ""}`);

    const result = await model.generateContent([prompt, ...videoParts]);
    const rawText = result.response.text().trim();
    const analysis = parseGeminiJson(rawText);

    // Update Firestore — success
    await sessionRef.update({
      status: "ready",
      analysis,
      analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      errorMessage: admin.firestore.FieldValue.delete(),
    });

    console.log(`[gemini] Session ${sessionRef.id} complete. Rating: ${analysis.overallRating}`);
    return analysis;
  } catch (err) {
    // Update Firestore — failure
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[gemini] Session ${sessionRef.id} failed:`, errorMessage);
    await sessionRef.update({
      status: "failed",
      errorMessage,
    });
    throw err;
  }
}

