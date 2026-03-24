# Release Checklist — My Keeper Coach

## Pre-Release (Before Archiving)

### Code Quality
- [ ] All compiler warnings resolved
- [ ] No `// TODO:` or `// FIXME:` items remaining for this release
- [ ] SwiftLint passes with no errors
- [ ] All `#Preview` blocks working in Xcode

### Testing
- [ ] Unit tests pass (`⌘U`)
- [ ] UI tests pass
- [ ] Manual testing on physical device (at least one iPhone model)
- [ ] Tested on minimum supported iOS version (iOS 17.0)
- [ ] Offline mode tested — app works without connectivity
- [ ] Data persistence verified — kill and relaunch retains data
- [ ] **Role-based flows tested:**
  - [ ] Coach: create team → add keeper → log session → match report → invite parent
  - [ ] Keeper: accept invite → self-assess → view badges → watch highlights
  - [ ] Parent: accept invite → view dashboard → verify no raw stats visible

### App Configuration
- [ ] Bundle identifier correct (`com.playat.keepercoach`)
- [ ] Version number incremented (Settings → General → Version)
- [ ] Build number incremented (Settings → General → Build)
- [ ] Deployment target set to iOS 17.0
- [ ] Required device capabilities correct in Info.plist

### Privacy & Permissions
- [ ] `NSCameraUsageDescription` set with clear explanation
- [ ] `NSPhotoLibraryUsageDescription` set with clear explanation
- [ ] All permission prompts tested on fresh install
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) present and accurate

### COPPA & Data Privacy
- [ ] Age detection verified: keepers under 13 trigger parent consent flow
- [ ] Parent consent email sends correctly (`sendParentConsentEmail` Cloud Function)
- [ ] Restricted account mode works: under-13 without consent cannot create data
- [ ] Parent consent revocation triggers `deleteKeeperData` — full data wipe confirmed
- [ ] Sensitive fields (`composure`, `selfReflectionNotes`, `selfRating`) not visible in parent view
- [ ] `visibility` field on assessments correctly hides `coachOnly` data from keeper and parent
- [ ] Data export works (`exportKeeperData` — GDPR data portability)
- [ ] No third-party analytics SDKs that would violate COPPA

### Localization
- [ ] All user-facing strings use `String(localized:)` or `.xcstrings`
- [ ] No hardcoded English strings in SwiftUI views
- [ ] Date/number formatting uses user locale (`.formatted()` API)
- [ ] Terminology consistent ("goalkeeper" vs "keeper" — decide and standardize)

---

## TestFlight Build

### Archive & Upload
- [ ] Select "Any iOS Device (arm64)" as build target
- [ ] Product → Archive
- [ ] In Organizer: Validate App (fix any issues)
- [ ] In Organizer: Distribute App → TestFlight & App Store
- [ ] Wait for "Processing" to complete in App Store Connect

### TestFlight Configuration
- [ ] Add release notes for testers (what to test, known issues)
- [ ] Enable build for intended test groups
- [ ] Verify testers receive notification
- [ ] Confirm app installs and launches on tester devices

---

## App Store Submission

### App Store Connect Setup
- [ ] App screenshots for required device sizes:
  - iPhone 6.7" (iPhone 15 Pro Max)
  - iPhone 6.1" (iPhone 15 Pro)
  - iPhone 5.5" (iPhone 8 Plus — if supporting older)
- [ ] App description written (focus on parent/coach value)
- [ ] Keywords set (goalkeeper, soccer, training, development, youth, coaching)
- [ ] Support URL provided
- [ ] Privacy policy URL provided
- [ ] App category: Sports
- [ ] Age rating questionnaire completed
- [ ] App icon (1024×1024) uploaded

### Review Preparation
- [ ] Demo account credentials provided (if login required)
- [ ] Review notes explain any non-obvious features
- [ ] All third-party SDK compliance confirmed
- [ ] No private API usage

### Post-Submission
- [ ] Monitor App Store Connect for review status
- [ ] Respond promptly to any reviewer questions
- [ ] Prepare marketing assets for launch day
- [ ] Plan version 1.0.1 bug-fix release cadence

---

## Post-Release

- [ ] Monitor crash reports in Xcode Organizer
- [ ] Check App Store reviews for early feedback
- [ ] Verify analytics/telemetry flowing (if implemented)
- [ ] Tag release in git: `git tag -a v1.0.0 -m "Initial release"`
