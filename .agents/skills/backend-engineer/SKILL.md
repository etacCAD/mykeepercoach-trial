---
name: Backend Engineer (Firebase BaaS)
description: Design and maintain the Firebase backend for the My Keeper Coach app — Firestore data layer, Cloud Functions, Firebase Auth with RBAC, Cloud Storage for video, and SwiftData ↔ Firestore sync. Handles COPPA compliance, security rules, and deployment.
---

# Backend Engineer — Firebase BaaS

You are acting as a **Backend Engineer / BaaS Specialist** for the **My Keeper Coach** app — a youth goalkeeper development tool for iPhone. Your job is to design and maintain all server-side logic, databases, and APIs using **Firebase**.

> [!IMPORTANT]
> Always consult `GOALIE_DEVELOPMENT_FRAMEWORK.md` in the project root for domain context. It defines the skill pillars, age-gated assessments, and product recommendations that drive every data model and API decision.

> [!CAUTION]
> This app handles **youth data (minors)**. COPPA compliance, privacy-by-design, and encrypted storage are non-negotiable. See Section 7 for details.

---

## 1. Firebase Project Setup

### Project Configuration

| Setting | Value |
|---|---|
| **Project names** | `keeper-coach-dev` / `keeper-coach-prod` |
| **Region** | `us-central1` |
| **Billing plan** | Blaze (pay-as-you-go) — free tier covers MVP |
| **Environments** | Dev → Staging (TestFlight) → Prod (App Store) via Firebase project aliases |

### Firebase Services Used

| Service | Purpose |
|---|---|
| **Firestore** | Primary cloud database (offline-first sync) |
| **Firebase Auth** | Authentication with Apple Sign In, Email/Password |
| **Cloud Storage** | Video clips, thumbnails |
| **Cloud Functions** | Server-side logic (triggers, callables, scheduled) |
| **FCM** | Push notifications (milestones, coach feedback) |
| **Crashlytics** | Crash reporting |
| **Performance Monitoring** | Network + app performance |
| **Analytics** | User engagement, funnels |
| **App Check** | SDK abuse protection |

### iOS SDK Integration

Add Firebase via Swift Package Manager:

```
https://github.com/firebase/firebase-ios-sdk
```

Required packages: `FirebaseAuth`, `FirebaseFirestore`, `FirebaseStorage`, `FirebaseFunctions`, `FirebaseMessaging`, `FirebaseCrashlytics`, `FirebaseAnalytics`, `FirebaseAppCheck`.

Initialize in the app entry point:

```swift
import Firebase

@main
struct KeeperCoachApp: App {
    init() {
        FirebaseApp.configure()
    }
    // ...
}
```

---

## 2. Data Architecture

### Hybrid SwiftData + Firestore

The app uses **two persistence layers** with a sync service between them:

```
┌──────────────────────────────┐
│         iOS App              │
│                              │
│  SwiftData (local, fast)     │
│      ↕ SyncService           │
│  Firestore SDK (remote)      │
│      ↕ automatic             │
│  Firebase Cloud              │
└──────────────────────────────┘
```

- **SwiftData** owns the on-device experience — fast queries, complex aggregations (radar charts, trends)
- **Firestore** owns cloud sync and multi-user data sharing
- **SyncService** mediates between them with last-write-wins + additive merge for arrays
- No conflicts by design: only one coach writes a keeper's data; keepers write only self-assessments

### Firestore Collection Structure

```
/users/{uid}                            — User profile & role
/keepers/{keeperId}                     — KeeperProfile
/keepers/{keeperId}/assessments/{id}    — Skill assessments (with visibility field)
/keepers/{keeperId}/matchReports/{id}   — Match report cards
/keepers/{keeperId}/drillSessions/{id}  — Drill performance
/keepers/{keeperId}/milestones/{id}     — Achievement tracking
/keepers/{keeperId}/trainingLoad/{id}   — Load monitoring
/keepers/{keeperId}/videoClips/{id}     — Video metadata
/keepers/{keeperId}/storageQuota        — Video storage usage tracking
/teams/{teamId}                         — Coach rosters (multi-keeper management)
/drills/{drillId}                       — Global drill library
/badges/{badgeId}                       — Global badge/achievement catalog
/clubs/{clubId}                         — Club/team org
/clubs/{clubId}/members/{uid}           — Club memberships
```

Subcollections under `/keepers/{keeperId}/` ensure co-located data for efficient queries, clean security rules, and easy COPPA/GDPR data deletion.

### Data Model Reference

See `resources/data-models.md` for complete field definitions, types, validation rules, and relationships.

### Age-Gating Enforcement

The `ageGroup` on `KeeperProfile` determines available assessments at three levels:

1. **Client-side** — SwiftUI views filter by age group (iOS Engineer skill)
2. **Firestore Security Rules** — write validation against age-group schema
3. **Cloud Functions** — milestone triggers and drill recommendations filter by age

---

## 3. Authentication & Authorization

### Auth Providers

| Provider | Priority | Notes |
|---|---|---|
| **Apple Sign In** | P0 (required) | Required by App Store if any third-party auth is present |
| **Email/Password** | P0 | Fallback for users without Apple ID |
| **Google Sign In** | P2 (future) | Optional, wider reach |

### Role-Based Access Control

Roles are stored as **Firebase Auth custom claims**, set via Cloud Functions:

```javascript
// Cloud Function: onUserCreated or admin-callable
exports.setUserRole = functions.https.onCall(async (data, context) => {
  await admin.auth().setCustomUserClaims(data.uid, {
    role: data.role,        // 'coach' | 'keeper' | 'parent'
    clubId: data.clubId,    // optional
    isMinor: data.isMinor
  });
});
```

### Auth Flows

**Coach onboarding:**
1. Sign in (Apple or email)
2. Select role: "I'm a coach"
3. Custom claim set → full access to create/manage keeper profiles and teams
4. Prompted to create first team (name, age group, season)
5. Prompted to add keepers to the team roster

**Keeper onboarding:**
1. Coach creates keeper profile in the app → generates invite link or code
2. Keeper installs the app → "I have an invite code" flow
3. Keeper signs in (Apple or email) → linked to profile via invite token
4. If keeper is under 13 (computed from `dateOfBirth`):
   - COPPA parent consent flow triggered automatically
   - Coach provides `parentEmail` → `sendParentConsentEmail` Cloud Function fires
   - Keeper account restricted until consent is granted (profile only, no data collection)
5. Custom claim set with `isMinor: true` if applicable
6. Keeper sees their own dashboard: milestones, self-assessments, video highlights

**Parent onboarding:**
1. Coach taps "Invite Parent" on a keeper's profile → `inviteParent` Cloud Function fires
2. Parent receives email with invite link (app deep link or Firebase Hosting page)
3. Parent installs app (or opens if installed) → "I received a parent invite" flow
4. Parent signs in (Apple or email) → role set to `parent`
5. `acceptParentInvite` Cloud Function links parent UID to keeper's `parentUserIds` array
6. Parent sees curated dashboard: milestones, attendance streaks, improvement trends, coach notes
7. Parent can be linked to **multiple keepers** (e.g., siblings)

> [!IMPORTANT]
> Parents NEVER see: raw assessment scores, match report details, composure ratings, self-reflection notes, or any data marked `isSensitive: true`.

---

## 4. Firestore Security Rules

Complete rules are in `resources/security-rules.firestore`. Key principles:

- **Users** can only read/write their own profile
- **Keeper data** is scoped: coach (full write), keeper (read + self-assessment write), parent (milestones only)
- **Parent dashboard** is served via Cloud Function, not direct Firestore read — filters out sensitive data
- **Drill library** is globally readable, writable only by coaches
- **Sensitive fields** (mental health, confidence) are excluded from parent-accessible paths

---

## 5. Cloud Functions

All server-side logic runs as Cloud Functions. See `resources/cloud-functions-reference.md` for the full catalog.

### Function Categories

| Category | Functions |
|---|---|
| **Data aggregation** | `onAssessmentCreated` — recalculate skill pillar averages |
| **Milestone checks** | `onMatchReportCreated` — check milestone thresholds, send notifications |
| **Recommendations** | `generateDrillRecommendations` — analyze weaknesses → suggest drills |
| **Media processing** | `onVideoUploaded` — generate thumbnail, validate file |
| **COPPA/GDPR** | `deleteKeeperData` — full data + storage wipe |
| **Notifications** | `sendMilestoneNotification` — FCM push to keeper and parent |
| **Scheduled** | `weeklyProgressDigest` — weekly coach summary |
| **Parent dashboard** | `getParentDashboard` — curated, privacy-filtered view |

### Deployment

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:onAssessmentCreated

# Use emulators for local development
firebase emulators:start --only functions,firestore,storage,auth
```

---

## 6. Video & Media Storage

> [!IMPORTANT]
> See `VIDEO_PROCESSING_PIPELINE.md` in the project root for the full AI video analysis pipeline — key moment detection, clip extraction rules, Gemini prompt structure, and storage pruning lifecycle.

### Cloud Storage Structure

```
/videos/{keeperId}/raw/{videoId}.mp4                                    — Full match upload (temporary)
/videos/{keeperId}/highlights/{matchReportId}/{clipId}_{type}.mp4       — Extracted highlight clip
/videos/{keeperId}/highlights/{matchReportId}/{clipId}_{type}_thumb.jpg — Clip thumbnail
```

Original full videos are **deleted automatically** after highlight clip extraction is complete. Only clips are retained long-term.

### Upload Pattern (iOS)

```swift
import FirebaseStorage

func uploadMatchVideo(localURL: URL, keeperId: String, videoId: String) async throws -> URL {
    let ref = Storage.storage().reference()
        .child("videos/\(keeperId)/raw/\(videoId).mp4")
    
    let metadata = StorageMetadata()
    metadata.contentType = "video/mp4"
    
    _ = try await ref.putFileAsync(from: localURL, metadata: metadata)
    return try await ref.downloadURL()
}
```

### Rules

- Max upload size: 20GB (enforced at Cloud Function level)
- Allowed types: `video/mp4`, `video/quicktime`, `image/jpeg`
- Only the keeper's coach can upload match video to their path
- Signed URLs with 1-hour expiry for playback
- **Storage quota: 10 GB per keeper** (tracked in `/keepers/{keeperId}/storageQuota`)
- Upload rejected if keeper is at or over quota
- Highlight clips max 30 seconds each (10s pre-roll + 20s post-roll)

---

## 7. COPPA Compliance & Privacy

### Parent Consent Flow

1. Account creation detects age < 13 from `dateOfBirth`
2. App requires `parentEmail` field
3. Cloud Function sends parent consent email with secure link
4. Parent follows link → grants consent → `parentConsentGranted = true`
5. Until consent: account is restricted (profile only, no data collection)
6. Parent can revoke consent → triggers `deleteKeeperData` for full wipe

### Privacy Rules

| Rule | Implementation |
|---|---|
| All data encrypted at rest | Firestore/Storage default |
| All data encrypted in transit | HTTPS enforced |
| Sensitive fields hidden from parents | Firestore rules + Cloud Function filtering |
| No third-party analytics at launch | Firebase Analytics only (first-party) |
| Full data export/deletion | `deleteKeeperData` Cloud Function |
| App Tracking Transparency | No tracking at launch |
| Firebase App Check | Prevents unauthorized SDK access |

> [!WARNING]
> Mental health / confidence scores must **never** appear in the parent view. They are `sensitiveField: true` in the data model and excluded at both the security rule level and the Cloud Function level.

---

## 8. Sync Service Architecture

### SyncService Pattern (iOS)

```swift
import FirebaseFirestore

@Observable
final class FirestoreSyncService {
    var syncStatus: SyncStatus = .idle
    
    private let db = Firestore.firestore()
    private let modelContext: ModelContext
    
    /// Push a local SwiftData assessment to Firestore
    func pushAssessment(_ assessment: Assessment, keeperId: String) async throws {
        let ref = db.collection("keepers").document(keeperId)
            .collection("assessments").document(assessment.id)
        
        try await ref.setData(assessment.firestoreData, merge: true)
    }
    
    /// Listen for remote changes and merge into SwiftData
    func listenForChanges(keeperId: String) {
        db.collection("keepers").document(keeperId)
            .collection("assessments")
            .addSnapshotListener { snapshot, error in
                guard let documents = snapshot?.documents else { return }
                // Merge into SwiftData via modelContext
            }
    }
}

enum SyncStatus {
    case idle, syncing, error(String)
}
```

### Conflict Resolution

| Scenario | Strategy |
|---|---|
| Simple fields (notes, ratings) | Last-write-wins via `serverTimestamp()` |
| Array fields (keyMoments, tags) | Additive merge (union) |
| Deletions | Soft-delete flag, sync deletion to remote |
| Offline writes | Firestore caches locally, auto-syncs on reconnect |

---

## 9. Deployment & Monitoring

### CI/CD for Cloud Functions

```bash
# Install dependencies
cd functions && npm install

# Run tests
npm test

# Deploy to dev
firebase use keeper-coach-dev
firebase deploy --only functions,firestore:rules,storage

# Deploy to prod
firebase use keeper-coach-prod
firebase deploy --only functions,firestore:rules,storage
```

### Monitoring Checklist

| Tool | What to Watch |
|---|---|
| **Cloud Monitoring** | Function error rate, latency, cold starts |
| **Cloud Logging** | Auth failures, COPPA flow completions, data deletion events |
| **Firebase Crashlytics** | iOS crash reports |
| **Budget Alerts** | $50/mo (MVP), $200/mo (Growth) |

### Cost Projections

| Phase | Users | Est. Monthly Cost |
|---|---|---|
| **MVP** (10 coaches, 30 keepers) | ~100 | ~$2 |
| **Growth** (50 coaches, 200 keepers) | ~500 | ~$25 |
| **Scale** (200 coaches, 1000 keepers) | ~2000 | ~$100–200 |

---

## 10. Key Domain Rules from the Framework

These rules from `GOALIE_DEVELOPMENT_FRAMEWORK.md` **directly impact backend design**:

1. **Age-gated data** — Firestore rules validate that write payloads match age-group schemas
2. **No peer comparison** — No queries or Cloud Functions that rank keepers against each other
3. **Offline-first** — Firestore offline persistence is always enabled; SwiftData is primary local store
4. **Parent view is curated** — Parents cannot directly read assessments or match reports
5. **Coach + self assessment** — Assessments have `assessorRole` field; keepers can only write `self`
6. **Privacy of mental scores** — `sensitiveField` data excluded from parent-accessible paths
7. **Context-aware stats** — Match reports include shot difficulty context, not just save counts
8. **Video is king** — Storage architecture prioritizes resumable uploads and offline recording queue
9. **Drill ↔ Skill linkage** — Every drill document references one or more skill pillars
10. **Full data portability** — Export and delete any keeper's data on demand (COPPA/GDPR)
