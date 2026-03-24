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
exports.chatWithTed = chatWithTed;
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
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
async function chatWithTed({ messages, uid, context }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        throw new Error("GEMINI_API_KEY not set");
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
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
    }
    catch (err) {
        console.error(`[tedChat] Failed to log conversation:`, err);
    }
    return responseText;
}
//# sourceMappingURL=geminiChat.js.map