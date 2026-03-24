# My Keeper Coach — Data Models Reference

> **Sprint 1 Foundation** — Updated March 14, 2026  
> Incorporates: Simplification Review, Foundational Data Models, Subscription Spec, Club Hierarchy

---

## Enums

### Visibility (MVP: 2 levels)

```swift
// MVP: 2 levels. Phase 2 splits `shared` into `coachAndKeeper` / `coachKeeperAndParent`
enum Visibility: String, Codable {
    case `private`   // Coach-only (mental health notes, internal observations)
    case shared      // Visible to anyone linked to this keeper
}
```

```javascript
// Firestore valid values: 'private' | 'shared'
```

| Context | Default Visibility |
|---|---|
| Mental & Psychological ratings | `private` |
| Coach free-text notes | `private` |
| Composure, self-reflection | `private` |
| Skill pillar ratings | `shared` |
| Match report card (overall) | `shared` |
| Milestones | `shared` (always) |

### Age Group (MVP: 2 tiers)

```swift
enum AgeGroup: String, Codable, CaseIterable {
    case young = "U8-U13"   // Foundation + Skill Acquisition
    case older = "U14-U18"  // Skill Refinement + Performance

    var displayName: String { rawValue }

    /// Suggests an age group from DOB — coach always has final say
    static func suggested(from dateOfBirth: Date) -> AgeGroup? {
        let age = Calendar.current.dateComponents([.year], from: dateOfBirth, to: .now).year ?? 0
        switch age {
        case ..<6: return nil        // Too young — show guidance
        case 6...13: return .young
        case 14...19: return .older
        default: return nil          // Over 19 — show adult message
        }
    }
}
```

### Subscription Status

```swift
enum SubscriptionStatus: String, Codable {
    case trial    // 1 free match (limited report)
    case active   // Paid $99/yr
    case expired  // Subscription lapsed
    case none     // No subscription
}
```

---

## 1. User

**Firestore path:** `/users/{uid}`  
**SwiftData:** `@Model final class AppUser`

| Field | Type | Required | Description |
|---|---|---|---|
| `uid` | `string` | ✅ | Firebase Auth UID (document ID) |
| `email` | `string` | ✅ | Login email |
| `displayName` | `string` | ✅ | Full name |
| `role` | `string` enum | ✅ | `coach` \| `keeper` \| `parent` |
| `avatarURL` | `string?` | ❌ | Profile photo URL |
| `isMinor` | `bool` | ✅ | Under 18 flag |
| `parentConsentGranted` | `bool` | ✅ (if minor) | COPPA consent status |
| `parentEmail` | `string?` | ❌ | Required if `isMinor && age < 13` |
| `clubId` | `string?` | ❌ | FK to `/clubs/{clubId}` — null for independent coaches (Phase 2) |
| `clubRole` | `string?` enum | ❌ | `director` \| `keeperCoach` \| `teamCoach` — null if not in a club (Phase 2) |
| `linkedKeeperId` | `string?` | ❌ | For parent role: which keeper they're linked to |
| `invitedByUserId` | `string?` | ❌ | Coach who invited this parent |
| `inviteCode` | `string?` | ❌ | Unique code used to link parent to keeper |
| `inviteAcceptedAt` | `timestamp?` | ❌ | When the parent accepted the invite |
| `subscriptionTier` | `string` enum | ✅ | `free` \| `coach_unlocked` (auto at 5+ subscribed keepers) |
| `freeTrialUsed` | `bool` | ✅ | Has the 1-match free trial been consumed |
| `subscribedKeeperCount` | `number` | ✅ | Count of keepers with active subscriptions under this coach |
| `createdAt` | `timestamp` | ✅ | Server timestamp |
| `lastActiveAt` | `timestamp` | ✅ | Last app open |

**Validation:**
- `role` must be one of `coach`, `keeper`, `parent`
- If `isMinor == true` and age < 13, `parentEmail` is required
- `email` must match `request.auth.token.email`
- `clubId` and `clubRole` are always null in MVP (future-proofed)

---

## 2. KeeperProfile

**Firestore path:** `/keepers/{keeperId}`  
**SwiftData:** `@Model final class KeeperProfile`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Auto-generated document ID |
| `keeperUserId` | `string?` | ❌ | FK to `/users/{uid}` — linked when keeper creates account |
| `coachUserId` | `string` | ✅ | FK to coach's `/users/{uid}` |
| `parentUserIds` | `array<string>` | ❌ | FKs to parent `/users/{uid}` — supports 2 parents |
| `name` | `string` | ✅ | Keeper's full name |
| `dateOfBirth` | `timestamp` | ✅ | Used to compute age group |
| `ageGroup` | `string` enum | ✅ | `U8-U13` \| `U14-U18` (computed from DOB, overridable) |
| `ageGroupOverride` | `string?` enum | ❌ | Manual override for registration-year edge cases |
| `jerseyNumber` | `number?` | ❌ | Helps coaches distinguish keepers quickly |
| `isActive` | `bool` | ✅ | Default `true`; soft-archive when keeper leaves |
| `teamName` | `string?` | ❌ | Team within a club (e.g., "U14 Blue") |
| `clubName` | `string?` | ❌ | Current club name |
| `clubId` | `string?` | ❌ | FK to `/clubs/{clubId}` — null for independent coaches (Phase 2) |
| `profileImageData` | `bytes?` | ❌ | Small profile thumbnail (base64) |
| `parentInviteCode` | `string?` | ❌ | Active 8-char invite code for parent linking |
| `parentInviteCreatedAt` | `timestamp?` | ❌ | When invite was generated |
| `parentInviteExpiry` | `timestamp?` | ❌ | 7-day expiry for security |
| `subscriptionStatus` | `string` enum | ✅ | `trial` \| `active` \| `expired` \| `none` |
| `subscriptionExpiry` | `timestamp?` | ❌ | When the current subscription period ends |
| `subscriberUserId` | `string?` | ❌ | Who is paying (parent UID or coach UID) |
| `originalTransactionId` | `string?` | ❌ | Apple transaction ID for support |
| `createdAt` | `timestamp` | ✅ | Server timestamp |
| `updatedAt` | `timestamp` | ✅ | Server timestamp |

**Computed property (iOS):**

```swift
extension KeeperProfile {
    /// The effective age group — override takes priority
    var effectiveAgeGroup: AgeGroup {
        if let override = ageGroupOverride { return override }
        return AgeGroup.suggested(from: dateOfBirth) ?? .older
    }
}
```

**Relationships (subcollections):**
- `/keepers/{keeperId}/assessments/` → Assessment
- `/keepers/{keeperId}/matchReports/` → MatchReport
- `/keepers/{keeperId}/drillSessions/` → DrillSession
- `/keepers/{keeperId}/milestones/` → Milestone
- `/keepers/{keeperId}/trainingLoad/` → TrainingLoad
- `/keepers/{keeperId}/videoClips/` → VideoClip

**Validation:**
- `coachUserId` must reference a user with `role == 'coach'`
- `ageGroup` must be `U8-U13` or `U14-U18`
- `isActive` defaults to `true` on creation
- `subscriptionStatus` defaults to `none` on creation

---

## 3. Assessment

**Firestore path:** `/keepers/{keeperId}/assessments/{assessmentId}`  
**SwiftData:** `@Model final class Assessment`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Auto-generated |
| `assessorUserId` | `string` | ✅ | Who made the assessment |
| `assessorRole` | `string` enum | ✅ | `coach` \| `self` |
| `context` | `string` enum | ✅ | `practice` \| `drill` \| `game` |
| `assessmentDate` | `timestamp` | ✅ | When the assessment occurred |
| `skillRatings` | `map<string, int>` | ✅ | Pillar name → rating (1–5) |
| `notes` | `string?` | ❌ | Free-text notes |
| `visibility` | `string` enum | ✅ | `private` \| `shared` |
| `createdAt` | `timestamp` | ✅ | Server timestamp |

> [!IMPORTANT]
> The `isSensitive` field has been **removed**. Use `visibility: 'private'` instead. This simplifies the access model to a single field.

**Default visibility by skill pillar:**

| Pillar | Default |
|---|---|
| `mentalPsychological` | `private` |
| All others | `shared` |

**Skill Rating Keys** (age-gated — not all appear for all age groups):

| Key | Display Name | Min Age Group |
|---|---|---|
| `shotStopping` | Shot Stopping | U8-U13 |
| `crossesHighBalls` | Crosses & High Balls | U14-U18 |
| `oneVOneBreakaway` | 1v1 & Breakaways | U8-U13 |
| `distribution` | Distribution | U8-U13 (simplified for Young) |
| `footworkAgility` | Footwork & Agility | U8-U13 |
| `tacticalAwareness` | Tactical Awareness | U8-U13 (basic for Young) |
| `communication` | Communication & Leadership | U8-U13 (basic for Young) |
| `mentalPsychological` | Mental & Psychological | U8-U13 (basic for Young) |

**Validation:**
- `skillRatings` values must be 1–5
- If `assessorRole == 'self'`, `assessorUserId` must match keeper's `keeperUserId`
- `visibility` must be `private` or `shared`

---

## 4. MatchReport

**Firestore path:** `/keepers/{keeperId}/matchReports/{reportId}`  
**SwiftData:** `@Model final class MatchReport`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Auto-generated |
| `coachUserId` | `string` | ✅ | Coach who created the report |
| `matchDate` | `timestamp` | ✅ | Game date |
| `opponent` | `string?` | ❌ | Opponent team name |
| `overallRating` | `number` | ✅ | 1.0–10.0 overall rating |
| `shotStopping` | `map` | ✅ | `{saves, cleanCatches, parries, goalsConceded, unsaveable, errorsLeadingToGoal}` |
| `crosses` | `map` | ❌ (age-gated) | `{faced, claimed, punched, missed}` |
| `oneVOne` | `map` | ❌ (age-gated) | `{faced, saved}` |
| `distribution` | `map` | ❌ | `{accuracyPercent, decisionQuality, counterAttackThrows}` |
| `positioning` | `number?` | ❌ | 1–10 rating |
| `communication` | `number?` | ❌ | 1–10 rating |
| `composure` | `number?` | ❌ | 1–10 rating |
| `composureVisibility` | `string` enum | ✅ | Default: `private` |
| `keyMoments` | `array<map>` | ❌ | `[{minute, type, description}]` — type: `highlight` \| `error` |
| `selfReflectionNotes` | `string?` | ❌ | Keeper's self-reflection |
| `selfReflectionVisibility` | `string` enum | ✅ | Default: `private` |
| `selfRating` | `number?` | ❌ | Keeper's self-rating (1–10) |
| `selfRatingVisibility` | `string` enum | ✅ | Default: `shared` |
| `reportVisibility` | `string` enum | ✅ | Default: `shared` — controls overall report card |
| `isTrialReport` | `bool` | ✅ | Generated during free trial (limited output) |
| `developmentFocus` | `array<string>` | ❌ | Up to 3 free-text focus areas (replaces auto-linked drill recommendations) |
| `createdAt` | `timestamp` | ✅ | Server timestamp |

---

## 5. DrillSession

**Firestore path:** `/keepers/{keeperId}/drillSessions/{sessionId}`  
**SwiftData:** `@Model final class DrillSession`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Auto-generated |
| `drillId` | `string` | ✅ | FK to `/drills/{drillId}` |
| `coachUserId` | `string?` | ❌ | Coach who ran the drill |
| `sessionDate` | `timestamp` | ✅ | When the drill occurred |
| `repetitions` | `number` | ✅ | Number of reps |
| `successRate` | `number` | ✅ | 0.0–1.0 (success / total) |
| `qualityRating` | `number` | ❌ | 1–5 coach quality rating |
| `notes` | `string?` | ❌ | Coach notes |
| `sessionPhase` | `string` enum | ❌ | `warmup` \| `technical` \| `scenario` \| `game` \| `cooldown` |
| `videoClipIds` | `array<string>` | ❌ | References to video clips |
| `createdAt` | `timestamp` | ✅ | Server timestamp |

---

## 6. Drill (Global Library)

**Firestore path:** `/drills/{drillId}`  
**SwiftData:** `@Model final class Drill`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Auto-generated |
| `name` | `string` | ✅ | Drill name |
| `description` | `string` | ✅ | How to perform the drill |
| `skillPillars` | `array<string>` | ✅ | Which pillars this drill develops |
| `minAgeGroup` | `string` enum | ✅ | `U8-U13` \| `U14-U18` |
| `diagramURL` | `string?` | ❌ | Static diagram image (MVP — video demos deferred per SIMP-10) |
| `equipmentNeeded` | `array<string>` | ❌ | Required equipment |
| `durationMinutes` | `number` | ✅ | Estimated duration |
| `difficulty` | `string` enum | ✅ | `beginner` \| `intermediate` \| `advanced` |
| `isBuiltIn` | `bool` | ✅ | System drill vs. coach-created |
| `createdByCoachId` | `string?` | ❌ | Coach who created it (if custom) |
| `createdAt` | `timestamp` | ✅ | Server timestamp |

> [!NOTE]
> Per SIMP-10, MVP drills use text descriptions + diagrams. `videoURL` field is removed. Add it back in Phase 2 when demo videos are produced.

---

## 7. Milestone

**Firestore path:** `/keepers/{keeperId}/milestones/{milestoneId}`  
**SwiftData:** `@Model final class Milestone`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Auto-generated |
| `title` | `string` | ✅ | e.g., "First clean collapse dive" |
| `description` | `string` | ✅ | Achievement description |
| `ageGroup` | `string` enum | ✅ | `U8-U13` \| `U14-U18` |
| `skillPillar` | `string?` | ❌ | Related skill pillar |
| `achieved` | `bool` | ✅ | Whether unlocked |
| `achievedDate` | `timestamp?` | ❌ | When achieved |
| `badgeIconName` | `string` | ✅ | SF Symbol or custom icon name |

> [!TIP]
> Milestones are always `shared` visibility — visible to all linked roles including parents.

---

## 8. TrainingLoad

**Firestore path:** `/keepers/{keeperId}/trainingLoad/{weekId}`  
**SwiftData:** `@Model final class TrainingLoad`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | ISO week identifier (e.g., `2026-W11`) |
| `weekStartDate` | `timestamp` | ✅ | Monday of the week |
| `sessionsCount` | `number` | ✅ | Sessions that week |
| `avgIntensity` | `number` | ❌ | 1–10 average intensity |
| `bodyMapPains` | `array<map>` | ❌ | `[{location, severity, notes}]` |
| `overtrainingAlert` | `bool` | ✅ | Auto-computed flag |
| `notes` | `string?` | ❌ | Keeper or coach notes |

**Body map locations:** `wrist_left`, `wrist_right`, `shoulder_left`, `shoulder_right`, `knee_left`, `knee_right`, `hip_left`, `hip_right`, `head`, `back`, `other`

---

## 9. VideoClip

**Firestore path:** `/keepers/{keeperId}/videoClips/{clipId}`  
**SwiftData:** `@Model final class VideoClip`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Auto-generated |
| `storageURL` | `string` | ✅ | Firebase Storage download URL |
| `thumbnailURL` | `string?` | ❌ | Auto-generated thumbnail |
| `durationSeconds` | `number` | ✅ | Clip length |
| `context` | `string` enum | ✅ | `drill` \| `match` \| `practice` |
| `linkedEntityId` | `string?` | ❌ | ID of linked drill session or match report |
| `tags` | `array<string>` | ❌ | Searchable tags |
| `fileSizeBytes` | `number` | ✅ | File size for quota tracking |
| `createdAt` | `timestamp` | ✅ | Server timestamp |

---

## 10. SwiftData Model Alignment

SwiftData models mirror Firestore documents. Use a `Codable` extension to convert:

```swift
extension Assessment {
    var firestoreData: [String: Any] {
        [
            "assessorUserId": assessorUserId,
            "assessorRole": assessorRole.rawValue,
            "context": context.rawValue,
            "assessmentDate": Timestamp(date: assessmentDate),
            "skillRatings": skillRatings.mapValues { $0 },
            "notes": notes as Any,
            "visibility": visibility.rawValue,
            "createdAt": FieldValue.serverTimestamp()
        ]
    }
}
```

### Schema Versioning (Day One)

```swift
enum KeeperCoachSchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] = [
        KeeperProfile.self, Assessment.self, MatchReport.self,
        DrillSession.self, Drill.self, Milestone.self,
        TrainingLoad.self, VideoClip.self
    ]
}

enum KeeperCoachMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] = [
        KeeperCoachSchemaV1.self
    ]
    static var stages: [MigrationStage] = []
}
```

---

## Removed from MVP

| Model/Field | Reason | Planned Phase |
|---|---|---|
| `isSensitive` field | Replaced by `visibility` enum | — |
| `videoURL` on Drill | SIMP-10: text + diagrams only | Phase 2 |
| Team collection | Independent coaches only in MVP | Phase 2 |
| Badge collection | Gamification deferred | Phase 2 |
| VideoStorageQuota | Quota enforcement deferred | Phase 2 |
| 4-tier `AgeGroup` | SIMP-7: 2 tiers for MVP | Phase 2 |
| 3-level `AssessmentVisibility` | SIMP-6: 2 levels for MVP | Phase 2 |
