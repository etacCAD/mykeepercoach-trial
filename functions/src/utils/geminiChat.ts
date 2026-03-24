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

export interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export interface ChatWithTedParams {
  messages: ChatMessage[];
  uid?: string | null;
  context?: any;
}

export async function chatWithTed({ messages, uid, context }: ChatWithTedParams): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: BASE_PROMPT + (uid ? "\n(Logged in user context: " + JSON.stringify(context) + ")" : "\n(Pre-login user)"),
  });

  // Extract the latest message and history. History must strictly alternate or we can just send the last N messages to startChat
  const history = messages.slice(0, -1);
  const latestMessage = messages[messages.length - 1].parts[0].text;

  const chat = model.startChat({
    history: history,
  });

  const result = await chat.sendMessage(latestMessage);
  const responseText = result.response.text();

  // Log the conversation to Firestore
  try {
    const db = admin.firestore();
    await db.collection("tedConversations").add({
      uid: uid || "anonymous",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userMessage: latestMessage,
      botResponse: responseText,
      context: context || null
    });
  } catch (err) {
    console.error(`[tedChat] Failed to log conversation:`, err);
  }

  return responseText;
}
