# Goalie Coach: Analytics & Event Dictionary

This document outlines the standard user actions we want to track using Firebase Analytics / Google Analytics for the Goalie Coach iOS App.

This data is used to populate internal metrics so the Customer Success / Coaching teams can see user engagement via the Admin Portal, and also to trigger re-engagement loops (e.g. push notification reminders).

## 1. Core Engagement Events

| Event Name | Trigger Condition | Parameters |
| :--- | :--- | :--- |
| `app_open` | The user launches or forensic returns to the Goalie Coach app. | None (`user_id` is auto-collected by Firebase). |
| `login` | User successfully logs in. | `method` ("email", "apple", "google") |
| `sign_up` | User successfully completes the onboarding flow. | `role` ("keeper", "coach", "parent")<br>`age_group` ("U8-U13", "U14-U18") |
| `subscription_started` | User begins a free trial or pays for a subscription tier. | `tier` ("premium_coach")<br>`trial` (boolean) |

## 2. Assessment & Video Events

| Event Name | Trigger Condition | Parameters |
| :--- | :--- | :--- |
| `video_upload_started` | User taps "Upload Video" from gallery or camera. | None |
| `video_upload_complete` | Video successfully finishes uploading to Cloud Storage. | `duration_seconds`<br>`file_size_mb` |
| `assessment_requested` | User submits the video for AI or Coach rating. | `type` ("ai_tagging", "coach_review") |
| `assessment_viewed` | User opens a completed assessment report. | `assessment_id`<br>`rating_tier` (e.g. "Excellent", "Needs Work") |
| `milestone_unlocked` | User hits a development framework milestone. | `milestone_id`<br>`pillar_name` |

## 3. Drill & Practice Events

| Event Name | Trigger Condition | Parameters |
| :--- | :--- | :--- |
| `drill_started` | User clicks into a drill from the library or recommendation engine. | `drill_id`<br>`drill_name`<br>`pillar` (e.g. "Diving", "Distribution") |
| `drill_completed` | User marks the drill as complete. | `drill_id`<br>`duration_minutes` |
| `practice_session_logged` | User submits a manual practice or game log. | `session_type` ("practice", "game")<br>`shots_faced`<br>`saves_made` |

## Implementation Notes

- **Firebase User ID Check**: Automatically bind Firebase Analytics to the authenticated user using `Analytics.setUserID(user.uid)`.
- **User Properties**: Set persistent user properties so they appear appended to every event: `user_role`, `subscription_tier`, `club_id`.
- **Data Syncing**: Track events like `drill_completed` in Firebase Analytics, but remember to also increment a `totalDrillsCompleted` counter directly on their Firestore User/Keeper profile so the Admin Portal Web App can easily display the number without querying BigQuery.
