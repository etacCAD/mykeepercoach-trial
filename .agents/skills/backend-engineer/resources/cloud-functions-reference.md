# My Keeper Coach — Cloud Functions Reference

> **Sprint 1 Foundation** — Updated March 14, 2026  
> Incorporates: MVP simplifications, parent invite flow, subscription validation

---

## Deployment

```bash
functions/
├── src/
│   ├── index.ts
│   ├── triggers/
│   │   ├── onAssessmentCreated.ts
│   │   ├── onMatchReportCreated.ts
│   │   └── onVideoUploaded.ts
│   ├── callables/
│   │   ├── setUserRole.ts
│   │   ├── generateParentInvite.ts
│   │   ├── acceptParentInvite.ts
│   │   ├── validateSubscription.ts
│   │   ├── getParentDashboard.ts
│   │   ├── deleteKeeperData.ts
│   │   └── exportKeeperData.ts
│   └── utils/
│       └── validation.ts
├── package.json
└── tsconfig.json
```

```bash
firebase deploy --only functions
firebase emulators:start --only functions,firestore,storage,auth
```

---

## 1. Firestore Triggers

### `onAssessmentCreated`

**Trigger:** Firestore `onCreate` on `/keepers/{keeperId}/assessments/{assessmentId}`

**Purpose:** Recalculate skill pillar aggregate scores.

```typescript
export const onAssessmentCreated = onDocumentCreated(
  "keepers/{keeperId}/assessments/{assessmentId}",
  async (event) => {
    const keeperId = event.params.keeperId;
    // 1. Fetch all assessments for this keeper
    // 2. Compute rolling average per skill pillar
    // 3. Update aggregated scores on keeper profile
    // 4. Check if any milestone thresholds are met
  }
);
```

---

### `onMatchReportCreated`

**Trigger:** Firestore `onCreate` on `/keepers/{keeperId}/matchReports/{reportId}`

**Purpose:** Update rolling match stats and check milestones.

**Logic:**
1. Compute rolling save percentage (last 5 matches)
2. Update match count and rating trend on keeper profile
3. Check milestone conditions (clean sheet, distribution accuracy, etc.)
4. If milestone achieved → create milestone document

---

### `onVideoUploaded`

**Trigger:** Cloud Storage `onFinalize` on `videos/{keeperId}/{context}/{clipId}.mp4`

**Purpose:** Generate thumbnail with validation.

**Logic:**
1. Validate content type (`video/mp4` or `video/quicktime`)
2. Validate file size (≤ 500MB)
3. Generate thumbnail → upload to `{clipId}_thumb.jpg`
4. Update `/keepers/{keeperId}/videoClips/{clipId}` with `thumbnailURL`
5. If validation fails → delete file + update metadata with error

---

## 2. Callable Functions

### `setUserRole`

**Trigger:** HTTPS callable

**Purpose:** Set Firebase Auth custom claims for RBAC.

**Input:**
```typescript
interface SetUserRoleInput {
  uid: string;
  role: 'coach' | 'keeper' | 'parent';
  clubId?: string;      // null in MVP
  clubRole?: string;    // null in MVP
  isMinor: boolean;
}
```

**Logic:**
1. Validate role value
2. Set custom claims: `{ role, clubId, clubRole, isMinor }`
3. Update `/users/{uid}` document

---

### `generateParentInvite`

**Trigger:** HTTPS callable

**Purpose:** Generate an invite code for a parent to connect to a keeper's profile.

**Auth:** Only callable by the keeper's assigned coach.

**Input:**
```typescript
interface GenerateParentInviteInput {
  keeperId: string;
}
```

**Output:**
```typescript
interface GenerateParentInviteOutput {
  inviteCode: string;    // 8-character alphanumeric
  expiresAt: string;     // ISO timestamp (7 days from now)
}
```

**Logic:**
1. Verify caller is the keeper's coach (`isCoachOf`)
2. Generate secure 8-character alphanumeric invite code
3. Write to keeper profile:
   - `parentInviteCode = code`
   - `parentInviteCreatedAt = serverTimestamp()`
   - `parentInviteExpiry = now + 7 days`
4. Return the code (coach shares via text, email, or in-person)

> [!TIP]
> The coach can regenerate the code at any time — this invalidates the previous one. Only one active invite code per keeper at a time.

---

### `acceptParentInvite`

**Trigger:** HTTPS callable

**Purpose:** Link a parent account to a keeper profile using an invite code.

**Auth:** Any authenticated user.

**Input:**
```typescript
interface AcceptParentInviteInput {
  inviteCode: string;
}
```

**Output:**
```typescript
interface AcceptParentInviteOutput {
  keeperId: string;
  keeperName: string;
  success: boolean;
}
```

**Logic:**
1. Query all keepers for matching `parentInviteCode`
2. Validate code hasn't expired (`parentInviteExpiry > now`)
3. Add caller's UID to keeper's `parentUserIds` array
4. Update caller's user document:
   - `linkedKeeperId = keeperId`
   - `inviteAcceptedAt = serverTimestamp()`
   - `role = 'parent'` (if not already set)
5. Set custom claims: `{ role: 'parent', linkedKeepers: [...existing, keeperId] }`
6. Clear the invite code fields on the keeper profile

**Errors:**
- `not-found`: No keeper found with this invite code
- `deadline-exceeded`: Invite code has expired
- `already-exists`: Parent is already linked to this keeper

---

### `validateSubscription`

**Trigger:** HTTPS callable

**Purpose:** Lightweight subscription status check for MVP. Validates that a keeper's subscription is active before gating premium features.

**Auth:** Coach or the keeper's subscriber (parent).

**Input:**
```typescript
interface ValidateSubscriptionInput {
  keeperId: string;
}
```

**Output:**
```typescript
interface ValidateSubscriptionOutput {
  keeperId: string;
  status: 'trial' | 'active' | 'expired' | 'none';
  expiresAt?: string;
  canCreateFullReport: boolean;    // true if active or coach unlocked
  isCoachUnlocked: boolean;       // true if coach has 5+ subscribed keepers
  subscribedKeeperCount: number;  // for the coach
}
```

**Logic:**
1. Fetch keeper profile → read `subscriptionStatus` + `subscriptionExpiry`
2. If `subscriptionExpiry < now` and `subscriptionStatus == 'active'` → set to `expired`
3. Fetch coach's user doc → read `subscribedKeeperCount`
4. `canCreateFullReport` = status is `active` OR coach has 5+ subscribed keepers
5. Return status bundle

> [!NOTE]
> For MVP, subscription validation is lightweight — it reads Firestore status set by StoreKit 2 listeners on the iOS client. Server-side receipt validation via Apple's App Store Server API is Phase 2.

---

### `getParentDashboard`

**Trigger:** HTTPS callable

**Purpose:** Curated, privacy-filtered view for parents.

**Auth:** Caller must be in keeper's `parentUserIds`.

**Input:**
```typescript
interface ParentDashboardInput {
  keeperId: string;
}
```

**Output:**
```typescript
interface ParentDashboardOutput {
  keeperName: string;
  ageGroup: string;
  milestones: Array<{
    title: string;
    achievedDate: string;
    badgeIconName: string;
  }>;
  improvementTrend: 'improving' | 'maintaining' | 'new';
  sessionsThisMonth: number;
  matchesThisMonth: number;
  skillHighlights: Array<{
    pillar: string;
    trend: 'up' | 'stable' | 'new';
  }>;
  // No raw scores, no save %, no mental health data, no 'private' visibility data
}
```

> [!WARNING]
> Must NEVER return fields with `visibility == 'private'`, composure ratings, self-reflection notes, or raw assessment scores.

---

### `deleteKeeperData`

**Trigger:** HTTPS callable

**Purpose:** Full COPPA/GDPR data deletion.

**Auth:** Coach or linked parent.

**Logic:**
1. Verify authorization
2. Delete all subcollections under `/keepers/{keeperId}/`
3. Delete all Cloud Storage files under `videos/{keeperId}/`
4. Delete keeper profile document
5. Optionally delete keeper's user account + Firebase Auth
6. Log audit record

> [!CAUTION]
> Irreversible. Client must show confirmation dialog and offer data export first.

---

### `exportKeeperData`

**Trigger:** HTTPS callable

**Purpose:** GDPR data portability — export all keeper data as JSON.

**Auth:** Coach or linked parent.

**Input:**
```typescript
interface ExportDataInput {
  keeperId: string;
}
```

**Logic:**
1. Verify authorization
2. Fetch keeper profile + all subcollection data
3. Generate signed URLs for video clips (valid 24 hours)
4. Return JSON bundle

---

### `sendParentConsentEmail`

**Trigger:** HTTPS callable

**Purpose:** COPPA parent consent email for under-13 keepers.

**Input:**
```typescript
interface ConsentEmailInput {
  keeperId: string;
  parentEmail: string;
  keeperName: string;
}
```

**Logic:**
1. Generate secure, time-limited consent token (72 hours)
2. Store on keeper profile as `pendingConsentToken`
3. Send email with consent link (Firebase Hosting page)
4. On consent → set `parentConsentGranted = true`

---

## 3. Deferred Functions

### `bulkImportKeepers` — ⏸️ DEFERRED to Phase 2

> [!NOTE]
> Per SIMP-1: CSV bulk import is not P0. Coaches manually add 1–3 keepers in MVP via "Add Keeper" button. Cloud Function for club-level CSV import deferred until club onboarding ships.

### `weeklyProgressDigest` — ⏸️ DEFERRED to Phase 2

> [!NOTE]
> Per SIMP-3: Push notifications are cut from MVP. Weekly digest requires FCM which is deferred. Text beta coaches manually instead.

### `onMilestoneUpdated` (push notification) — ⏸️ DEFERRED to Phase 2

> [!NOTE]
> Per SIMP-3: Milestone achievement notifications via FCM deferred. Milestone data is still written — notification delivery is what's deferred.

### `generateDrillRecommendations` — ⏸️ DEFERRED to Phase 2

> [!NOTE]
> Per SIMP-8: Auto-linked drill recommendations deferred. Coaches use free-text development notes in MVP. The drill → skill pillar mapping still exists in the data model for Phase 2.

### `computeStorageQuota` — ⏸️ DEFERRED to Phase 2

> [!NOTE]
> Storage quota enforcement deferred. Video storage is tracked via `fileSizeBytes` on each clip but quota computation and alerting is Phase 2.

---

## 4. Error Handling

```typescript
import { HttpsError } from "firebase-functions/v2/https";

throw new HttpsError("permission-denied", "You are not authorized to access this keeper's data.");
throw new HttpsError("not-found", "Keeper profile not found.");
throw new HttpsError("invalid-argument", "Invalid invite code format.");
throw new HttpsError("deadline-exceeded", "Invite code has expired.");
throw new HttpsError("already-exists", "Parent is already linked to this keeper.");
```

### Logging

```typescript
import { logger } from "firebase-functions";

logger.info("Parent invite generated", { keeperId, expiresAt });
logger.info("Parent invite accepted", { keeperId, parentUid });
logger.warn("Expired invite code used", { keeperId, code });
logger.error("Deletion failed", { keeperId, error: err.message });
```

---

## 5. Testing

```bash
firebase emulators:start
npm test
```

| Category | What to Test |
|---|---|
| **Triggers** | Create Firestore doc → verify aggregation |
| **Callables** | Valid/invalid auth → verify access control |
| **Parent invite** | Generate → accept → verify linking |
| **Subscription** | Validate active/expired/trial states |
| **Security rules** | `@firebase/rules-unit-testing` for every role/path |

```typescript
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

// Coach reads private assessment → succeeds
await assertSucceeds(coachDb.doc("keepers/k1/assessments/a1").get());

// Parent reads private assessment → fails
await assertFails(parentDb.doc("keepers/k1/assessments/a1").get());

// Parent reads shared assessment → succeeds
await assertSucceeds(parentDb.doc("keepers/k1/assessments/a2").get());
// (where a2 has visibility: 'shared')
```
