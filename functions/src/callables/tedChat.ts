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

My Keeper Coach is an app for youth goalkeeper development that helps track progress using 8 core skill pillars, match reports, and video analysis.`;

interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

/**
 * Callable: tedChat
 * Handles chatbot interactions with Gemini via Google AI Studio.
 */
export const tedChat = onCall(
  { timeoutSeconds: 30, invoker: "public", secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    const { messages, context } = request.data as {
      messages: ChatMessage[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context?: any;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages array required");
    }

    const uid = request.auth?.uid || null;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in the environment.");

    const ai = new GoogleGenAI({ apiKey });
    const systemInstructionText = BASE_PROMPT + (uid ? "\n(Logged in user context: " + JSON.stringify(context) + ")" : "\n(Pre-login visitor)");

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: messages,
      config: {
        systemInstruction: systemInstructionText,
      }
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
        context: context || null,
      });
    } catch (err) {
      console.error("[tedChat] Failed to log conversation:", err);
    }

    return { reply: responseText };
  }
);
