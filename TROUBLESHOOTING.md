# Goalie Coach Troubleshooting Guide: Video Processing & Analysis

This document serves as a living reference for developers to diagnose and resolve issues within the video upload and AI analysis pipeline. It is based on historical issues and solutions we've encountered on the product so far.

**Remember to update this guide whenever a new class of processing bug is fixed!**

---

## 1. Sessions Stuck in "Pending" or "Processing" State

**Symptoms:**
- User uploads a video, but the dashboard continues to show "pending" or "processing" indefinitely.
- The expected analysis JSON never arrives in the Firestore `sessions` document.

**Common Causes & Fixes:**
- **Incomplete Uploads:** The backend `onWebSessionUploaded` Cloud Storage trigger verifies that *all* sibling videos associated with a session exist before it fires the Vertex AI request. If a user closes their browser or loses network connection mid-upload, the session stays natively stuck in `pending`.
  - *Fix:* Check Google Cloud Storage `/videos/{uid}/` to verify if all paths listed in the session's `videos` array actually exist.
- **Function Timeouts or Memory Limits:** If the combined video length is extremely long, the Cloud Function might hit the 9-minute (540s) execution timeout limit or exceed its 1GiB memory allocation.
  - *Fix:* Review the Firebase Cloud Functions logs for `onWebSessionUploaded`. Look for "Timeout", "Crash", or "Memory limit exceeded" entries.

## 2. Vertex AI Permission / IAM Errors

**Symptoms:**
- The Cloud Function executes upon upload, but fails immediately with a `403 Forbidden` or `Permission Denied` error when attempting to generate content.
- The session `status` updates to `failed`.

**Common Causes & Fixes:**
- **Missing Service Account Permissions:** Since the analysis pipeline natively streams video files using `gs://` URIs, the backend relies strictly on Google Cloud permissions.
  - *Fix:* Ensure the default service account running the Cloud Function (typically the App Engine default service account) has the **Vertex AI User** role assigned in the Google Cloud IAM console.

## 3. Architecture Misconfigurations (Client vs. Server)

**Symptoms:**
- API Key exposure warnings, or analysis failing natively on the frontend.

**Common Causes & Fixes:**
- **Legacy Client-Side Calls:** We recently completed a major security migration to eliminate client-side analysis.
  - *Fix:* Ensure NO client-side JavaScript (e.g., `gemini-utils.js`, `dashboard/analysis.js`) attempts to utilize the Gemini API directly. All analysis must remain strictly driven by the `onWebSessionUploaded` Cloud Storage trigger.

## 4. Inaccurate Processing Time Estimates

**Symptoms:**
- The loader in the user dashboard UI hangs or gets stuck at specific "time remaining" estimates.

**Common Causes & Fixes:**
- **Misaligned Estimation Logic:** The frontend (`public/js/dashboard/sessions.js`) utilizes estimation bounds. Because Vertex AI latency fluctuates based on regional load and total video context length, fixed timers eventually drift.
  - *Fix:* If patching the UI, always rely on the Firestore snapshot listener on the session `status` field (`pending` -> `processing` -> `ready`/`failed`). 
