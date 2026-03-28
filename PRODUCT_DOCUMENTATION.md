# Goalie Coach User Product & Architecture Documentation

## Overview
My Keeper Coach is an AI-powered analytics and development platform for youth soccer goalkeepers and their coaches. The platform enables users to upload match footage, which is then processed by a cloud-native pipeline using Google Vertex AI (Gemini) to provide personalized coaching feedback, skill scores (e.g., Shot Stopping, Positioning), overall ratings, and game highlights. 

## App Architecture
- **Frontend Layer:** HTML/CSS/Vanilla JS (deployed on Render, or Firebase Hosting). Interacts directly with Firebase via the Modular SDK.
- **Backend & Database:** Firebase BaaS (Firestore, Cloud Functions, Cloud Storage, Firebase Auth).
- **AI Processing:** Google Cloud Vertex AI utilizing the `gemini-1.5-flash` model. 

---

## The Video Processing Pipeline
The core product loop consists of video upload and serverless AI analysis. Below is the documentation of how this pipeline operates and the key variables governing its speed and reliability.

### 1. Upload Phase (Client-Side)
When a user initiates an upload (`public/js/dashboard/upload.js`), the following occurs:
1. **Session Creation:** A pending UI session document is written to Firestore (`users/{uid}/sessions`).
2. **Pre-processing / Network Prep:** The frontend limits the upload batch to a maximum of 10 videos.
3. **Direct-to-Storage Upload:** Videos are securely uploaded directly from the browser to Firebase Storage (`videos/{uid}/...`). This is done concurrently for all files in the batch.
4. **Completion:** The session document in Firestore is updated with the storage paths once all client uploads complete. Status remains `pending`.

#### Variables Impacting Upload Speed:
- **Client Network Speed:** The primary bottleneck is the user's upstream bandwidth.
- **Video Quantity and File Sizes:** More videos or higher resolution files (e.g., 4K vs 1080p) will significantly increase the data payload.
- **Concurrency Rate:** The browser handles multiple uploads via `Promise.allSettled`. Network congestion can occur if too many large files are uploaded over a weak connection.

### 2. Analysis Phase (Server-Side)
Once files hit Firebase Storage, the backend takes over (`functions/lib/triggers/onWebSessionUploaded.js` & `geminiAnalysis.js`):
1. **Trigger Authorization:** A Cloud Function (`onObjectFinalized`) fires. It first verifies that *all* associated sibling videos for the pending session have finished uploading before proceeding.
2. **Direct Reference:** Instead of downloading the heavy video files into the Cloud Function memory, the script passes direct Google Cloud Storage URIs (`gs://...`) to the Vertex AI API.
3. **LLM Execution:** The function prompts `gemini-1.5-flash` with the provided context (Age Group, Team Names, Jersey Color) and the raw video URIs.
4. **Structured JSON Output:** The LLM returns a strictly formatted JSON response consisting of ratings, explanations, and timestamped highlights. This is parsed and written to Firestore, marking the session `ready` for the user dashboard.

#### Variables Impacting Analysis Speed:
- **Cloud Function Cold Starts:** The trigger function may occasionally pause momentarily while Google Cloud spins up the Node.js container.
- **Total Combined Video Duration:** Because Vertex AI analyzes the entire contextual length of the video file, processing time scales linearly with the length of the footage.
- **Motion Clipping & Action Segments:** The frontend can pass timestamp bounds known as `actionSegments`. While this instructs the AI on *where to look*, Vertex AI currently still processes the full file payload, dependent on its internal video parsing frame rate.
- **Vertex AI Latency / `gemini-1.5-flash` Queues:** Depending on Google's regional capacity (`us-central1`), time to generate tokens can fluctuate. Flash is optimized for speed, but deep video grounding inherently takes longer than text generation.
- **Cloud Function Limits:** The background worker is capped at a strict **540-second (9-minute) timeout** and **1GiB of memory**. If the analysis logic + Vertex processing exceeds 9 minutes, the job will forcefully terminate and fail.
