import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "../constants";

const BASE_PROMPT = `You are "Ted", an AI chatbot built to support My Keeper Coach users.
Your personality is inspired by Ted Lasso: unfailingly positive, encouraging, kid/young-adult friendly, and highly supportive.
You have a "goldfish memory" for mistakes (meaning you encourage keepers to forget their mistakes quickly and move on).

COACHING FRAMEWORK & BEHAVIOR:
Instead of giving a full, verbose answer right away when asked how to improve a skill, you MUST first ask clarifying questions to understand the player's current context.
1. Ask what they have worked on so far or recently regarding that skill.
2. Ask if they have received any training, direction, or feedback from their coach already.
3. Determine if they need help with the strategy/understanding, or if it's more about physical skills, positioning, and repetition.
Wait for their response to understand where they are at before giving your full recommendation.

FORMATTING & STYLE:
1. Keep your answers VERY concise and in bite-sized pieces. Do not be overly verbose or give too much information at once.
2. ALWAYS format your responses with proper paragraphs. You MUST use blank lines (line breaks) between paragraphs to make the text easy to read. Never generate a giant wall of text.

STRICT RESTRICTIONS:
1. NEVER discuss politics, religion, or controversial real-world topics.
2. NEVER be mean-spirited, harsh, or use inappropriate language.
3. Keep answers concise, helpful, and energetic.
4. If you don't know something, admit it cheerfully!

My Keeper Coach is an app for youth goalkeeper development that helps track progress using 8 core skill pillars, match reports, and video analysis.

USING PLAYER DATA:
When player context is provided below, use it naturally and proactively in your coaching:
- Reference their actual skill scores when giving advice (e.g. "Your distribution is sitting at 6.2 right now — here's how to push it higher")
- When asked "what should I work on?", prioritize their lowest-rated pillars
- When asked about their last game, draw from the latest coaching notes provided
- Always tell the player you can look further back than the last 5 sessions if they'd like to see a longer trend — just let them know and you'll factor it in`;

interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

interface SkillScore {
  score?: number | string | null;
  feedback?: string;
}

interface SessionAnalysis {
  overallRating?: string | number;
  skills?: Record<string, SkillScore>;
  coachingNotes?: string;
}

interface SessionDoc {
  status?: string;
  analysis?: SessionAnalysis;
  createdAt?: admin.firestore.Timestamp;
  label?: string;
}

/**
 * Fetch the player's last N completed sessions from Firestore.
 * "Completed" = status is "ready" (covers both initial analysis and re-analyzed sessions).
 */
async function fetchPlayerContext(uid: string): Promise<string> {
  const db = admin.firestore();

  // 1. Fetch user profile
  let firstName = "Keeper";
  let ageGroup = "Unknown";
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (userSnap.exists) {
      const userData = userSnap.data()!;
      firstName = userData.firstName || userData.displayName?.split(" ")[0] || firstName;
      ageGroup = userData.ageGroup || ageGroup;
    }
  } catch (err) {
    console.warn("[tedChat] Failed to fetch user profile:", err);
  }

  // 2. Fetch last 8 sessions ordered by date (fetch 8, take first 5 that are ready)
  let completedSessions: SessionDoc[] = [];
  try {
    const sessionsSnap = await db
      .collection("users")
      .doc(uid)
      .collection("sessions")
      .orderBy("createdAt", "desc")
      .limit(8)
      .get();

    sessionsSnap.forEach((d) => {
      const data = d.data() as SessionDoc;
      // Include "ready" status — this covers both first-time analyses and re-analyzed sessions
      if (data.status === "ready" && data.analysis) {
        completedSessions.push(data);
      }
    });

    // Cap at 5 most recent ready sessions
    completedSessions = completedSessions.slice(0, 5);
  } catch (err) {
    console.warn("[tedChat] Failed to fetch sessions:", err);
    return `\n\n(Note: Player data could not be loaded this session. Coach generically.)`;
  }

  if (completedSessions.length === 0) {
    return `\n\nPLAYER CONTEXT:
- Name: ${firstName}
- Age Group: ${ageGroup}
- Sessions: No completed sessions yet — they are brand new! Encourage them to upload their first match.`;
  }

  // 3. Compute per-skill averages across last 5 sessions
  const skillSums: Record<string, number> = {};
  const skillCounts: Record<string, number> = {};
  let overallSum = 0;
  let overallCount = 0;

  completedSessions.forEach((s) => {
    const analysis = s.analysis!;
    const overall = Number(analysis.overallRating);
    if (!isNaN(overall)) { overallSum += overall; overallCount++; }

    if (analysis.skills) {
      Object.entries(analysis.skills).forEach(([key, val]) => {
        const sc = Number(val?.score);
        if (!isNaN(sc) && sc > 0) {
          skillSums[key] = (skillSums[key] || 0) + sc;
          skillCounts[key] = (skillCounts[key] || 0) + 1;
        }
      });
    }
  });

  const avgOverall = overallCount > 0 ? (overallSum / overallCount).toFixed(1) : "N/A";

  // Build skill averages string, sorted lowest first (most in need of work)
  const skillAvgs: { name: string; avg: number }[] = Object.keys(skillSums).map((k) => ({
    name: k,
    avg: Math.round((skillSums[k] / skillCounts[k]) * 10) / 10,
  }));
  skillAvgs.sort((a, b) => a.avg - b.avg); // lowest first

  const skillLines = skillAvgs
    .map((s) => `  - ${s.name}: ${s.avg}/10${s.avg < 6 ? " ⚠ (needs focus)" : ""}`)
    .join("\n");

  // 4. Pull latest session coaching notes
  const latestSession = completedSessions[0];
  const latestNotes = latestSession?.analysis?.coachingNotes
    ? `"${latestSession.analysis.coachingNotes.trim().substring(0, 500)}${latestSession.analysis.coachingNotes.length > 500 ? "..." : ""}"`
    : "No coaching notes available for the latest session.";

  const sessionLabel = latestSession?.label || "Most recent match";
  const sessionDate = latestSession?.createdAt
    ? new Date(latestSession.createdAt.seconds * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return `

PLAYER CONTEXT (${completedSessions.length} of last 5 completed sessions analyzed):
- Name: ${firstName}
- Age Group: ${ageGroup}
- Overall Rating (avg): ${avgOverall}/10
- Total sessions in window: ${completedSessions.length}

SKILL RATINGS — averaged over last ${completedSessions.length} session(s), scale 0–10 (sorted lowest first):
${skillLines || "  No skill data available."}

LATEST MATCH REPORT — ${sessionLabel}${sessionDate ? " · " + sessionDate : ""}:
${latestNotes}

REMINDER: Always offer to look further back (beyond 5 sessions) if the player wants a longer trend view. Keep responses concise.`;
}

/**
 * Callable: tedChat
 * Handles chatbot interactions with Gemini via Google AI Studio.
 * Server-side fetches player data for personalized coaching context.
 */
export const tedChat = onCall(
  { timeoutSeconds: 30, invoker: "public", secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    const { messages } = request.data as {
      messages: ChatMessage[];
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages array required");
    }

    const uid = request.auth?.uid || null;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in the environment.");

    // Build system prompt — fetch real player data server-side if authenticated
    let playerContextBlock: string;
    if (uid) {
      playerContextBlock = await fetchPlayerContext(uid);
    } else {
      playerContextBlock = "\n\n(Pre-login visitor — no player data available. Coach generically.)";
    }

    const systemInstructionText = BASE_PROMPT + playerContextBlock;

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: messages,
      config: {
        systemInstruction: systemInstructionText,
      },
    });

    const responseText = result.text;

    if (!responseText) {
      throw new Error("No text response received from Gemini");
    }

    const latestMessage = messages[messages.length - 1].parts[0].text;

    // Log to Firestore
    try {
      const db = admin.firestore();
      await db.collection("tedConversations").add({
        uid: uid || "anonymous",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userMessage: latestMessage,
        botResponse: responseText,
        hasPlayerContext: uid !== null,
      });
    } catch (err) {
      console.error("[tedChat] Failed to log conversation:", err);
    }

    return { reply: responseText };
  }
);
