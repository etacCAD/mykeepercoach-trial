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
import * as fs from "fs";
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
import { GEMINI_MODEL } from "../constants";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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

CRITICAL INSTRUCTIONS FOR VIDEO ANALYSIS:
- Focus EXCLUSIVELY on the goalkeeper.
- The footage may be filmed from a wide variety of angles (behind the goal, midfield, or side angles).
- For side-angle footage or noisy environments, DO NOT interpret background noise, substitute players, crowd movements, parents, or passing cars as on-field action.
- Only analyze the purposeful movements, saves, positioning, and distribution of the active goalkeeper.
- Ignore camera panning artifacts or blurriness.
- EXACT STATS: For the "stats" object (saves, goalsConceded, shotsOnTarget, crossesClaimed), you MUST provide the exact count of events you explicitly observed. DO NOT output percentages, estimations, or arbitrary large numbers (like 70 or 80). These must be realistic single-digit or low double-digit match counts. If you are unsure, default to 0.

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
    
    // Record: video processing has started
    await sessionRef.update({
      "stepTimestamps.processingStartedAt": admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // SEQUENTIALLY download, compress (if needed), upload to Gemini, and delete local buffers
    // This protects the 8GB memory limit from being exceeded by multiple massive videos concurrently.
    const fileUploadResults = [];
    
    for (let index = 0; index < allVideoPaths.length; index++) {
      const storagePath = allVideoPaths[index];
      console.log(`[gemini] [Video ${index + 1}] Processing video: ${storagePath}`);
      
      const fileName = path.basename(storagePath);
      const tempFilePath = path.join(os.tmpdir(), `${sessionRef.id}-${index}-${fileName}`);
      let mimeType = storagePath.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
      
      console.log(`[gemini] [Video ${index + 1}] Downloading to local temp memory buffer: ${tempFilePath}`);
      await bucket.file(storagePath).download({ destination: tempFilePath });

      // Conditional compression if file size > 1.8 GB
      const stats = fs.statSync(tempFilePath);
      const fileSizeInBytes = stats.size;
      const ONE_POINT_EIGHT_GB = 1.8 * 1024 * 1024 * 1024;
      let finalUploadPath = tempFilePath;

      if (fileSizeInBytes > ONE_POINT_EIGHT_GB) {
        console.log(`[gemini] [Video ${index + 1}] is large (${(fileSizeInBytes / (1024 * 1024)).toFixed(2)} MB), compressing via ffmpeg...`);
        const compressedPath = path.join(os.tmpdir(), `compressed_${sessionRef.id}-${index}-${fileName}.mp4`);
        
        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempFilePath)
            .outputOptions([
              "-c:v libx264",
              "-crf 32", // Heavy compression to ensure we get under 2GB limit
              "-preset veryfast", // Balances encoding speed and file size better than ultrafast
              "-r 24", // Drop frame rate to 24fps
              "-c:a aac",
              "-b:a 64k", // Lower audio bitrate
              "-s 854x480" // Downscale to 480p maximum
            ])
            .on("start", (cmd: string) => console.log(`[gemini] [Video ${index + 1}] FFMPEG Start:`, { cmd }))
            .on("end", () => resolve())
            .on("error", (err: Error) => reject(err))
            .save(compressedPath);
        });

        finalUploadPath = compressedPath;
        mimeType = "video/mp4"; // Output from libx264 defaults to mp4 wrapper standard here
        console.log(`[gemini] [Video ${index + 1}] Compression complete.`);
      }
      
      const finalStats = fs.statSync(finalUploadPath);
      if (finalStats.size > 2147483648) {
        throw new Error(`Video is still too large (${(finalStats.size / (1024 * 1024)).toFixed(2)} MB) even after heavy compression. Google AI limit is 2GB. Please cut the video into smaller segments and upload again.`);
      }
      
      console.log(`[gemini] [Video ${index + 1}] Uploading to Gemini AI Studio File API...`);
      let uploadedFile = await ai.files.upload({ file: finalUploadPath, config: { mimeType } });
      
      if (!uploadedFile.name) throw new Error(`Gemini File API returned no file name for ${fileName}`);
      uploadedGeminiFiles.push(uploadedFile.name);
      
      // Delete local buffers IMMEDIATELY to free memory before next iteration
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (finalUploadPath !== tempFilePath && fs.existsSync(finalUploadPath)) {
          fs.unlinkSync(finalUploadPath);
        }
      } catch(e) {}

      fileUploadResults.push({ fileName, uploadedFile, index });
    }

    // CONCURRENTLY wait for all uploaded files to finish processing on Gemini's servers
    const geminiVideoParts = await Promise.all(fileUploadResults.map(async (res) => {
      let { uploadedFile, fileName, index } = res;
      console.log(`[gemini] [Video ${index + 1}] Waiting for Gemini AI Studio to process the video context window...`);
      while (uploadedFile.state === "PROCESSING") {
        await delay(5000);
        uploadedFile = await ai.files.get({ name: uploadedFile.name! });
      }
      
      if (uploadedFile.state === "FAILED") {
        throw new Error(`Gemini File API failed to process the video ${fileName}`);
      }
      
      console.log(`[gemini] [Video ${index + 1}] Video processed successfully! URI: ${uploadedFile.uri}`);
      
      return {
        fileData: {
          fileUri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType
        }
      };
    }));

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

    // Record: AI analysis phase is starting (video upload to Gemini complete)
    await sessionRef.update({
      "stepTimestamps.aiAnalysisStartedAt": admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[gemini] Analyzing session ${sessionRef.id} with ${geminiVideoParts.length} video(s) natively on Google AI Studio...`);

    let analysis: any = null;

    if (geminiVideoParts.length === 1) {
      // Standard single-video execution
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [ { text: prompt }, geminiVideoParts[0] ],
          }
        ],
        config: { responseMimeType: "application/json" }
      });

      const rawText = result.text;
      if (!rawText) throw new Error("No text response received from Gemini");
      analysis = parseGeminiJson(rawText);
    } else {
      // Map-Reduce to avoid 1 Million token limit on 2.5-flash for multiple halves/long segments.
      const partAnalyses: any[] = [];
      for (let i = 0; i < geminiVideoParts.length; i++) {
        console.log(`[gemini] [Video ${i + 1}/${geminiVideoParts.length}] Running partial analysis...`);
        const result = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              role: "user",
              parts: [{ text: prompt + `\n\n[NOTE: This is video part ${i + 1} of ${geminiVideoParts.length}. Analyze just this portion.]` }, geminiVideoParts[i]],
            }
          ],
          config: { responseMimeType: "application/json" }
        });
        const rawText = result.text;
        if (!rawText) throw new Error(`No text response received from Gemini for video ${i + 1}`);
        partAnalyses.push(parseGeminiJson(rawText));
      }

      console.log(`[gemini] Merging ${partAnalyses.length} JSON reports into a final report...`);
      const mergePrompt = `You are a strict JSON data merging assistant for an expert goalkeeper coach. I have analyzed a match video in ${partAnalyses.length} parts to avoid file size limits.
Here are the partial JSON reports for each part:

${JSON.stringify(partAnalyses, null, 2)}

Please merge these partial reports into a single, cohesive, final JSON report matching the exact same schema.
- Average the numerical skill scores across all parts, handling null appropriately.
- Combine strengths, areas to improve, and highlights (keep up to 10 highlights total, prioritized). For highlights, prefix the timestamp with 'Pt1-', 'Pt2-', etc. if necessary, though retaining original timestamps is fine.
- Provide a holistic "summary" and "coachNote" that sounds natural.
- MATHEMATICALLY SUM integer stats like saves, goalsConceded, shotsOnTarget, crossesClaimed. Do NOT use string concatenation (e.g. 7 and 0 is 7, not 70). Do NOT invent or inflate numbers. If the total is unrealistically high (e.g., > 30), reconsider your sum.
- If ANY part had a cleanSheet as false, the final cleanSheet must be false.

Return ONLY the merged valid JSON object (no markdown, no explanation).
The schema is:
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
      "description": "<describe it>",
      "type": "<e.g., 'Tough Save', '1v1'>"
    }
  ]
}`;
      const mergeResult = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: mergePrompt,
        config: { responseMimeType: "application/json" }
      });
      const mergeText = mergeResult.text;
      if (!mergeText) throw new Error("No text response received from Gemini during merge");
      analysis = parseGeminiJson(mergeText);
    }

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
