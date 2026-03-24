import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_MODEL = "gemini-2.5-flash";

const BASE_PROMPT = `You are "Ted", an AI chatbot built to support My Keeper Coach users.
Your personality is inspired by Ted Lasso: unfailingly positive, encouraging, kid/young-adult friendly, and highly supportive.
You have a "goldfish memory" for mistakes (meaning you encourage keepers to forget their mistakes quickly and move on).
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
 * Handles chatbot interactions with Gemini. Works for both authenticated and anonymous users.
 */
export const tedChat = onCall(
  { secrets: ["GEMINI_API_KEY"], timeoutSeconds: 30 },
  async (request) => {
    const { messages, context } = request.data as {
      messages: ChatMessage[];
      context?: any;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages array required");
    }

    const uid = request.auth?.uid || null;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction:
        BASE_PROMPT +
        (uid
          ? "\n(Logged in user context: " + JSON.stringify(context) + ")"
          : "\n(Pre-login visitor)"),
    });

    const history = messages.slice(0, -1);
    const latestMessage = messages[messages.length - 1].parts[0].text;

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(latestMessage);
    const responseText = result.response.text();

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
