# Xcode Project Template — My Keeper Coach

## Recommended Folder Structure

```
KeeperCoach/
├── App/
│   ├── KeeperCoachApp.swift          # @main entry point, ModelContainer setup
│   ├── ContentView.swift             # Root view with NavigationStack
│   └── AppConstants.swift            # App-wide constants
│
├── Features/
│   ├── Dashboard/
│   │   ├── DashboardView.swift
│   │   ├── DashboardViewModel.swift
│   │   └── Components/
│   │       ├── SkillRadarChart.swift
│   │       └── RecentSessionCard.swift
│   │
│   ├── KeeperProfile/
│   │   ├── KeeperProfileView.swift
│   │   ├── KeeperProfileViewModel.swift
│   │   ├── KeeperEditView.swift
│   │   └── Components/
│   │       ├── AgeGroupBadge.swift
│   │       └── MilestoneCard.swift
│   │
│   ├── Session/
│   │   ├── SessionListView.swift
│   │   ├── SessionDetailView.swift
│   │   ├── SessionViewModel.swift
│   │   ├── NewSessionView.swift
│   │   └── Components/
│   │       ├── AssessmentRow.swift
│   │       ├── SkillPillarPicker.swift
│   │       └── SessionTimeline.swift
│   │
│   ├── MatchReport/
│   │   ├── MatchReportView.swift
│   │   ├── MatchReportViewModel.swift
│   │   ├── MatchReportCardView.swift
│   │   └── Components/
│   │       ├── ActionCategoryRow.swift
│   │       ├── KeyMomentTimeline.swift
│   │       └── OverallRatingGauge.swift
│   │
│   ├── DrillLibrary/
│   │   ├── DrillLibraryView.swift
│   │   ├── DrillDetailView.swift
│   │   └── DrillViewModel.swift
│   │
│   ├── VideoReview/
│   │   ├── VideoCaptureView.swift
│   │   ├── VideoPlaybackView.swift
│   │   ├── VideoTaggingView.swift
│   │   └── VideoViewModel.swift
│   │
│   └── Settings/
│       ├── SettingsView.swift
│       ├── ParentModeView.swift
│       ├── PrivacySettingsView.swift   # Visibility defaults for assessments
│       └── StorageManagementView.swift # Video storage quota display
│
├── Features/
│   ├── Onboarding/
│   │   ├── OnboardingFlowView.swift    # First-run: role selection (Coach/Keeper/Parent)
│   │   ├── CoachSetupView.swift        # Create first team + add keepers
│   │   ├── KeeperInviteView.swift      # Enter invite code / scan QR
│   │   ├── ParentInviteView.swift      # Accept parent invite link
│   │   └── OnboardingViewModel.swift
│   │
│   ├── Roster/
│   │   ├── RosterView.swift            # Multi-keeper team management
│   │   ├── RosterViewModel.swift
│   │   ├── AddKeeperView.swift         # Add keeper to team
│   │   ├── InviteParentView.swift      # Generate parent invite from keeper profile
│   │   └── GroupSessionView.swift      # Log assessments for multiple keepers at once
│   │
│   ├── KeeperSelf/
│   │   ├── KeeperDashboardView.swift   # Keeper's own view (milestones, highlights, self-assess)
│   │   ├── KeeperSelfAssessView.swift  # Self-rating entry
│   │   ├── MyHighlightsView.swift      # Browse tagged video clips by skill pillar
│   │   └── KeeperSelfViewModel.swift
│   │
│   ├── ParentDashboard/
│   │   ├── ParentDashboardView.swift   # Curated, positive-focused parent view
│   │   ├── ParentDashboardVM.swift
│   │   └── Components/
│   │       ├── AttendanceStreakCard.swift
│   │       ├── MilestoneCarousel.swift
│   │       └── SkillTrendCard.swift    # With contextual help text for parents
│   │
├── Models/
│   ├── Keeper.swift                  # @Model
│   ├── TrainingSession.swift         # @Model
│   ├── Assessment.swift              # @Model
│   ├── MatchReport.swift             # @Model
│   ├── Drill.swift                   # @Model
│   ├── Milestone.swift               # @Model
│   ├── Team.swift                    # @Model — coach roster management
│   ├── Badge.swift                   # @Model — global achievement definitions
│   ├── VideoStorageQuota.swift       # @Model — per-keeper storage tracking
│   ├── Enums/
│   │   ├── AgeGroup.swift
│   │   ├── SkillPillar.swift
│   │   ├── SessionType.swift
│   │   ├── ActionCategory.swift
│   │   └── AssessmentVisibility.swift # coachOnly | coachAndKeeper | coachKeeperAndParent
│   └── Extensions/
│       └── Date+Helpers.swift
│
├── Services/
│   ├── DataService.swift             # SwiftData CRUD operations
│   ├── SyncService.swift             # Offline-first sync
│   ├── VideoService.swift            # AVFoundation capture/processing
│   ├── NetworkMonitor.swift          # Connectivity monitoring
│   └── APIClient.swift               # Remote API (when backend exists)
│
├── Shared/
│   ├── Components/
│   │   ├── SkillRatingView.swift     # Reusable 1-5 star/scale input
│   │   ├── ProgressBar.swift
│   │   ├── EmptyStateView.swift
│   │   ├── LoadingView.swift
│   │   └── ErrorBanner.swift
│   ├── Modifiers/
│   │   ├── CardModifier.swift
│   │   └── AgeGateModifier.swift
│   ├── Theme/
│   │   ├── Colors.swift              # App color palette
│   │   ├── Typography.swift          # Font styles
│   │   └── Spacing.swift             # Layout constants
│   └── Preview/
│       ├── PreviewContainer.swift    # In-memory ModelContainer
│       └── SampleData.swift          # Mock keepers, sessions, etc.
│
├── Resources/
│   ├── Assets.xcassets/
│   │   ├── AppIcon.appiconset/
│   │   ├── Colors/
│   │   └── Images/
│   ├── Localizable.xcstrings
│   └── Info.plist
│
└── Tests/
    ├── KeeperCoachTests/
    │   ├── KeeperTests.swift
    │   ├── AgeGroupTests.swift
    │   ├── SkillPillarTests.swift
    │   └── DataServiceTests.swift
    └── KeeperCoachUITests/
        ├── KeeperFlowUITests.swift
        └── SessionFlowUITests.swift
```

## Key Conventions

| Convention | Rule |
|---|---|
| **One type per file** | File name matches the primary type |
| **Feature folders** | Group by feature, not by layer |
| **Components subfolder** | Small, reusable views scoped to a feature |
| **Shared folder** | Cross-feature reusable components and design tokens |
| **Preview data** | All preview helpers live in `Shared/Preview/` |
| **Tests mirror source** | Test file names match source file names + "Tests" suffix |

## ModelContainer Setup

```swift
@main
struct KeeperCoachApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [
            Keeper.self,
            TrainingSession.self,
            Assessment.self,
            MatchReport.self,
            Drill.self,
            Milestone.self,
            Team.self,
            Badge.self,
            VideoStorageQuota.self
        ])
    }
}
```
