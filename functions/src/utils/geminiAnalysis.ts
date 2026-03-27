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
import { GoogleGenAI } from "@google/genai";
import * as path from "path";
import * as os from "os";
import { GEMINI_MODEL } from "../constants";

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

// ── Helper: Delay ────────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
 * Handles the full pipeline via Google AI Studio (@google/genai)
 * by securely channeling the backend Storage file through the Gemini File API.
 */
export async function analyzeWebSession({
  sessionRef,
  sessionData,
  bucket,
  ageGroup,
}: AnalyzeWebSessionParams): Promise<Record<string, any>> {
  const uploadedGeminiFiles: string[] = [];
  
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in the environment.");
    
    // Extract video storage paths
    const videos: Array<{ storagePath: string; actionSegments?: Array<{ start: number; end: number }> }> =
      sessionData.videos || [];
    const allVideoPaths = videos.map((v) => v.storagePath).filter(Boolean);
    if (allVideoPaths.length === 0) throw new Error("No videos in session");

    // Verify all videos exist before proceeding to prevent cryptic "No such object" crashes
    for (const p of allVideoPaths) {
      const [exists] = await bucket.file(p).exists();
      if (!exists) {
        throw new Error("Video file is missing from storage. It may have been deleted or the upload was interrupted. Please delete this session and upload again.");
      }
    }

    // Initialize AI Studio SDK
    const ai = new GoogleGenAI({ apiKey });
    
    // Download and upload each video to Gemini File API
    const geminiVideoParts: any[] = [];
    
    for (const storagePath of allVideoPaths) {
      console.log(`[gemini] Processing video: ${storagePath}`);
      
      const fileName = path.basename(storagePath);
      const tempFilePath = path.join(os.tmpdir(), fileName);
      const mimeType = storagePath.toLowerCase().endsWith(".mov") ? "video/mov" : "video/mp4";
      
      console.log(`[gemini] Downloading to local temp memory buffer: ${tempFilePath}`);
      await bucket.file(storagePath).download({ destination: tempFilePath });
      
      console.log(`[gemini] Uploading temp buffer to Gemini AI Studio File API...`);
      let uploadedFile = await ai.files.upload({ file: tempFilePath, config: { mimeType } });
      
      if (!uploadedFile.name) throw new Error(`Gemini File API returned no file name for ${fileName}`);
      uploadedGeminiFiles.push(uploadedFile.name);
      
      // Delete the temp file from memory immediately to save space!
      try {
        const fs = require('fs');
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch(e) {}
      
      // Wait for Gemini File API to finish processing the video frames natively
      console.log(`[gemini] Waiting for Gemini AI Studio to process the video context window...`);
      while (uploadedFile.state === "PROCESSING") {
        await delay(5000);
        uploadedFile = await ai.files.get({ name: uploadedFile.name! });
      }
      
      if (uploadedFile.state === "FAILED") {
        throw new Error(`Gemini File API failed to process the video ${fileName}`);
      }
      
      console.log(`[gemini] Video processed successfully! URI: ${uploadedFile.uri}`);
      
      geminiVideoParts.push({
        fileData: {
          fileUri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType
        }
      });
    }

    // Build action segment hints from per-video motion detection data (if any existed before dumb-pipe)
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

    console.log(`[gemini] Analyzing session ${sessionRef.id} with ${geminiVideoParts.length} video(s) natively on Google AI Studio...`);

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...geminiVideoParts
          ],
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const rawText = result.text;
    if (!rawText) throw new Error("No text response received from Gemini");

    const analysis = parseGeminiJson(rawText);

    // Calculate overallRating deterministically (1-10 scale based on valid 0-100 scores)
    const skills = analysis.skills || {};
    const validScores = Object.values(skills)
      .map((s: any) => s?.score)
      .filter((score) => typeof score === "number" && !isNaN(score));
    
    if (validScores.length > 0) {
      const average100 = validScores.reduce((a: number, b: number) => a + b, 0) / validScores.length;
      analysis.overallRating = parseFloat((average100 / 10).toFixed(1));
    } else {
      analysis.overallRating = null; 
    }

    // Update Firestore — success
    await sessionRef.update({
      status: "ready",
      analysis,
      analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      errorMessage: admin.firestore.FieldValue.delete(),
    });

    console.log(`[gemini] Session ${sessionRef.id} complete using Google AI Studio. Rating: ${analysis.overallRating}`);
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
  } finally {
    // Clean up Gemini AI Studio Files to prevent hitting limits and billing leaks!
    try {
      if (uploadedGeminiFiles.length > 0) {
        console.log(`[gemini] Sweeping ${uploadedGeminiFiles.length} temporary files from Gemini AI Studio...`);
        const apiKey = process.env.GEMINI_API_KEY;
        const ai = new GoogleGenAI({ apiKey: apiKey! });
        for (const name of uploadedGeminiFiles) {
          await ai.files.delete({ name }).catch(() => {});
        }
      }
    } catch(cleanupErr) {
      console.warn("[gemini] Failed to sweep AI Studio Files:", cleanupErr);
    }
  }
}
