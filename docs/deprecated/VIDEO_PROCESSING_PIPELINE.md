# Video Processing Pipeline

> This document defines the end-to-end lifecycle of match video in My Keeper Coach — from upload through AI analysis, highlight clip extraction, and storage pruning.

---

## Overview

Match videos are uploaded by coaches for AI analysis. After processing, only meaningful highlight clips are retained. All idle footage and the original full video are deleted. This keeps cloud storage costs low while preserving the moments that matter for player development.

```
Upload Full Video
      ↓
AI Analysis (Gemini) → detects key moment timestamps
      ↓
Server-side clip extraction (Cloud Run + ffmpeg)
  - Extract ±30s windows around each key moment
  - Delete idle / standing-around segments
      ↓
Delete original full video
      ↓
Store highlight clips + metadata in Firestore
```

---

## Key Moment Definitions

These are the moment types the Gemini prompt should be instructed to identify. Each moment is defined by a **timestamp** (or timestamp range) in the video plus a **type label**.

### Tier 1 — Always Save (direct goalkeeper actions)

| Moment Type | Label | Description |
|---|---|---|
| Save attempt | `save_attempt` | Keeper makes a save or diving stop |
| Goal conceded | `goal_conceded` | Ball crosses the line |
| Distribution | `distribution` | Keeper punts, throws, or plays out from back |
| Cross / aerial claim | `cross_claim` | Keeper comes off line to claim a cross or corner |
| 1v1 / breakaway | `one_v_one` | Keeper faces a solo attacker |
| Penalty | `penalty` | Penalty kick attempt |
| Shot on target | `shot_on_target` | Any shot that requires a genuine save or goes in |

### Tier 2 — Save If Space Allows (contextual actions)

| Moment Type | Label | Description |
|---|---|---|
| Communication | `communication` | Keeper organizes defense or calls for ball (AI detects positioning changes + set piece context) |
| Rush off line | `rush_off_line` | Keeper charges out to close angles or win a loose ball |
| Positioning adjustment | `positioning_shift` | Significant repositioning during open play (e.g., tracking ball switch) |
| Set piece management | `set_piece` | Corner, free kick, or throw-in in danger zone — keeper's reaction tracked |

### Tier 3 — Never Save (prune these)

| Moment Type | Label | Description |
|---|---|---|
| Idle standing | `idle` | Keeper standing, not involved in play — ball is far from danger zone |
| Mid-game stoppage | `stoppage` | Water breaks, injuries, substitutions unrelated to keeper |
| Generic open play | `open_play_distant` | Ball in opponent's half, keeper not active |

---

## Clip Extraction Rules

### Window Size
- **Pre-roll**: 10 seconds before the detected moment timestamp
- **Post-roll**: 20 seconds after the detected moment timestamp
- **Max clip duration**: 30 seconds total
- If two key moments are within 30 seconds of each other, merge them into a single clip (don't create two overlapping clips)

### Clip Naming Convention

```
/videos/{keeperId}/highlights/{matchReportId}/{clipId}_{momentType}_{timestamp}.mp4
/videos/{keeperId}/highlights/{matchReportId}/{clipId}_{momentType}_{timestamp}_thumb.jpg
```

### Clip Metadata (stored in Firestore)

```
/keepers/{keeperId}/videoClips/{clipId}

{
  clipId: string,
  matchReportId: string,
  momentType: string,               // e.g. "save_attempt"
  momentLabel: string,              // human-readable label
  startTimestamp: number,           // seconds into original video
  clipDuration: number,             // seconds (max 30)
  storageURL: string,               // Cloud Storage download URL
  thumbnailURL: string,
  aiConfidenceScore: number,        // 0.0–1.0 from Gemini
  coachNotes: string | null,        // coach can annotate after the fact
  isHighlight: boolean,             // coach can star a clip
  createdAt: timestamp,
  fileSizeBytes: number             // for quota tracking
}
```

---

## Storage Quota

| Rule | Value |
|---|---|
| **Quota per keeper** | 10 GB |
| **Quota tracking location** | `/keepers/{keeperId}/storageQuota` |
| **Quota enforcement** | Cloud Function checks quota before accepting new uploads |
| **Over-quota behavior** | Block new upload; notify coach with storage breakdown |
| **Quota fields** | `totalBytes`, `clipCount`, `lastUpdated` |

### Quota Document Structure

```
/keepers/{keeperId}/storageQuota

{
  totalBytes: number,       // sum of all clip fileSizeBytes
  clipCount: number,
  quotaLimitBytes: 10737418240,   // 10 GB in bytes
  lastUpdated: timestamp
}
```

Quota is updated atomically after each successful clip write and after each clip deletion.

---

## Cloud Function Pipeline

### Step 1 — `onVideoUploaded` (Storage trigger)

**Trigger**: new file written to `/videos/{keeperId}/raw/{videoId}.mp4`

Responsibilities:
1. Validate file type (`video/mp4`, `video/quicktime`)
2. Validate file size (reject if > 20GB)
3. Check keeper's current storage quota — reject with error if at limit
4. Write a `processingJob` document to Firestore with status `queued`
5. Enqueue the video for Gemini analysis (Pub/Sub message or direct Cloud Run job)

---

### Step 2 — `analyzeVideoWithGemini` (Cloud Run or 2nd-gen Function)

**Trigger**: Pub/Sub message from Step 1

Responsibilities:
1. Generate a signed URL for the raw video
2. Send to Gemini with a structured prompt (see below)
3. Parse the JSON response → array of `{ timestamp, momentType, confidenceScore, description }`
4. Write detected moments back to the `processingJob` document
5. Enqueue clip extraction job

**Gemini Prompt Structure:**

```
You are analyzing a youth goalkeeper match video. 
Identify all key moments involving the goalkeeper.

For each moment return a JSON array with:
- timestamp_seconds: number (when the moment occurs)
- moment_type: one of [save_attempt, goal_conceded, distribution, cross_claim, 
  one_v_one, penalty, shot_on_target, communication, rush_off_line, 
  positioning_shift, set_piece]
- confidence_score: 0.0 to 1.0
- description: one sentence description for the coach

Only include Tier 1 and Tier 2 moments. Do NOT include idle time, 
stoppages, or moments where the keeper is not actively involved.
Minimum confidence threshold: 0.6

Return ONLY a valid JSON array. No commentary.
```

---

### Step 3 — `extractHighlightClips` (Cloud Run with ffmpeg)

**Trigger**: processingJob document updated with detected moments

Responsibilities:
1. Pull the list of timestamps from the processingJob
2. Merge overlapping or adjacent windows (within 30s of each other)
3. For each merged window:
   - `start = max(0, timestamp - 10)`
   - `end = min(videoDuration, timestamp + 20)`
   - Run `ffmpeg` to extract the clip
   - Generate a thumbnail at the midpoint frame
   - Upload clip + thumbnail to Cloud Storage highlights path
   - Write `videoClips/{clipId}` document to Firestore
   - Update keeper's `storageQuota` document
4. Delete the original raw video from Cloud Storage
5. Update processingJob status to `complete`

**ffmpeg Command:**
```bash
ffmpeg -ss {start} -i {input_path} -t {duration} \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -movflags +faststart \
  {output_path}
```

---

### Step 4 — `onProcessingJobComplete` (Firestore trigger)

**Trigger**: `processingJob.status` updated to `complete`

Responsibilities:
1. Update the linked `matchReport` with `videoProcessingStatus: "complete"` and `clipCount`
2. Send FCM push notification to coach: "Video analysis complete — {clipCount} highlights saved"
3. Clean up the processingJob document (or archive it)

---

## Processing Job Document

```
/processingJobs/{jobId}

{
  jobId: string,
  keeperId: string,
  matchReportId: string,
  rawVideoPath: string,       // Cloud Storage path to original
  status: "queued" | "analyzing" | "extracting" | "complete" | "failed",
  detectedMoments: [
    {
      timestamp: number,
      momentType: string,
      confidenceScore: number,
      description: string
    }
  ],
  clipCount: number,
  errorMessage: string | null,
  createdAt: timestamp,
  completedAt: timestamp | null
}
```

---

## Storage Lifecycle

| File Type | Retention |
|---|---|
| Raw / full match video | **Deleted immediately** after clip extraction completes |
| Highlight clips | Retained indefinitely until coach manually deletes or quota exceeded |
| Thumbnails | Retained alongside their clip |
| Processing job docs | Archived (soft-deleted) after 30 days |

---

## Error Handling

| Failure Point | Behavior |
|---|---|
| Gemini returns no moments | Mark job as `complete`, no clips created, notify coach |
| ffmpeg extraction fails | Mark job as `failed`, retain raw video for retry |
| Upload quota exceeded | Reject upload at Step 1; do not start analysis |
| Gemini API timeout | Retry up to 3 times with exponential backoff; mark `failed` after |
| Storage write fails | Retry clip upload; do not delete original until all clips written |

---

## Coach-Facing Review (Future Feature)

After analysis, coaches will see:
- A feed of highlight clips organized by moment type
- Confidence score badge on each clip (Low / Medium / High)
- Ability to delete individual clips they don't want
- Ability to star/highlight clips to share with the keeper or parent
- Storage usage bar showing GB used vs. 10 GB quota

---

*Last updated: 2026-03-22*
