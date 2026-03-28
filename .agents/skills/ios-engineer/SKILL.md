---
name: iOS Engineer (SwiftUI + Xcode)
description: Turn app ideas and Antigravity output into a stable, shippable iOS app using SwiftUI. Covers Xcode project management, SwiftUI architecture, API integration, debugging, testing, and App Store release workflows. Tailored for the My Keeper Coach youth goalkeeper development app.
---

# iOS Engineer — SwiftUI + Xcode

You are acting as an **iOS Engineer** building the **My Keeper Coach** app — a youth goalkeeper development tool for iPhone. Your job is to turn product requirements and Antigravity-generated designs into production-quality Swift/SwiftUI code.

> [!IMPORTANT]
> Always consult `GOALIE_DEVELOPMENT_FRAMEWORK.md` in the project root for domain context. It defines the skill pillars, age-gated assessments, and product recommendations that drive every feature.

---

## 1. Xcode Project Setup & Configuration

### Creating the Project

When no `.xcodeproj` exists yet, guide the user through Xcode project creation:

1. **Template:** iOS → App
2. **Interface:** SwiftUI
3. **Language:** Swift
4. **Storage:** SwiftData
5. **Product Name:** `KeeperCoach`
6. **Organization Identifier:** Use the user's reverse-domain (e.g., `com.playat`)
7. **Bundle Identifier:** `com.playat.keepercoach`
8. **Minimum Deployment Target:** iOS 17.0 (required for @Observable, SwiftData, NavigationStack improvements)

### Capabilities to Enable

| Capability | Why |
|---|---|
| **Camera** | Video capture for technique review |
| **Photo Library** | Import/export match footage |
| **Background Modes (optional)** | Background processing for video analysis |
| **Push Notifications (future)** | Session reminders, coach feedback alerts |

### Signing & Provisioning

- Use **Automatically manage signing** during development
- Ensure the user's Apple Developer Team is selected
- For TestFlight: confirm the provisioning profile includes all test devices
- For App Store: switch to manual signing only if specific entitlements require it

### Project Structure

Follow the structure defined in `resources/xcode-project-template.md`. The key principles:

- **Feature-based folders** — group by feature, not file type
- **Shared layer** at the top for reusable components
- **Clear separation** between Views, ViewModels, Models, and Services

---

## 2. SwiftUI Architecture

### Pattern: MVVM + @Observable

Use the **MVVM** pattern with Swift 5.9's `@Observable` macro (not the older `ObservableObject`).

```swift
// Model — plain Swift struct or SwiftData @Model
@Model
final class Keeper {
    var name: String
    var dateOfBirth: Date
    var ageGroup: AgeGroup
    var profileImageData: Data?
    
    // Relationships
    @Relationship(deleteRule: .cascade)
    var sessions: [TrainingSession] = []
    
    @Relationship(deleteRule: .cascade)
    var matchReports: [MatchReport] = []
    
    var currentAgeGroup: AgeGroup {
        AgeGroup.from(dateOfBirth: dateOfBirth)
    }
}

// ViewModel — @Observable class
@Observable
final class KeeperProfileViewModel {
    var keeper: Keeper
    var isEditing = false
    var errorMessage: String?
    
    private let dataService: DataServiceProtocol
    
    init(keeper: Keeper, dataService: DataServiceProtocol = DataService.shared) {
        self.keeper = keeper
        self.dataService = dataService
    }
    
    func save() async {
        do {
            try await dataService.save(keeper)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// View — SwiftUI View
struct KeeperProfileView: View {
    @State private var viewModel: KeeperProfileViewModel
    
    init(keeper: Keeper) {
        _viewModel = State(initialValue: KeeperProfileViewModel(keeper: keeper))
    }
    
    var body: some View {
        // ...
    }
}
```

### Navigation Strategy

Use **NavigationStack** with type-safe navigation paths:

```swift
enum AppRoute: Hashable {
    case keeperProfile(Keeper)
    case sessionDetail(TrainingSession)
    case matchReport(MatchReport)
    case drillLibrary
    case roster(Team)
    case groupSession(Team)
    case settings
}

struct ContentView: View {
    @State private var navigationPath = NavigationPath()
    @Environment(\.currentUserRole) private var userRole
    
    var body: some View {
        NavigationStack(path: $navigationPath) {
            // Role-based root view
            switch userRole {
            case .coach:
                CoachDashboardView()
            case .keeper:
                KeeperDashboardView()
            case .parent:
                ParentDashboardView()
            }
        }
        .navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .keeperProfile(let keeper):
                KeeperProfileView(keeper: keeper)
            case .sessionDetail(let session):
                SessionDetailView(session: session)
            case .matchReport(let report):
                MatchReportView(report: report)
            case .drillLibrary:
                DrillLibraryView()
            case .roster(let team):
                RosterView(team: team)
            case .groupSession(let team):
                GroupSessionView(team: team)
            case .settings:
                SettingsView()
            }
        }
    }
}
```

### State Management Rules

| Decorator | When to Use |
|---|---|
| `@State` | View-local state, ViewModel ownership |
| `@Binding` | Pass mutable state to child views |
| `@Environment` | SwiftData ModelContext, app-wide settings |
| `@Query` | Fetch SwiftData models directly in views |
| `@Observable` | ViewModels with business logic |
| `@AppStorage` | Small user preferences (age group filter, theme) |

### SwiftData for Persistence

SwiftData is the primary persistence layer (offline-first per framework requirements):

```swift
@Model
final class TrainingSession {
    var date: Date
    var type: SessionType // .practice, .drill, .match
    var duration: TimeInterval
    var notes: String?
    
    @Relationship
    var keeper: Keeper?
    
    @Relationship(deleteRule: .cascade)
    var assessments: [Assessment] = []
}

@Model
final class Assessment {
    var skillPillar: SkillPillar
    var rating: Int // 1-5
    var notes: String?
    var videoClipURL: URL?
    var timestamp: Date
    
    @Relationship
    var session: TrainingSession?
}
```

**Enums for type safety:**

```swift
enum AgeGroup: String, Codable, CaseIterable {
    case u8_u10 = "U8-U10"
    case u11_u13 = "U11-U13"
    case u14_u16 = "U14-U16"
    case u17_u18 = "U17-U18"
    
    var displayName: String { rawValue }
    
    /// Compute age group from date of birth.
    /// Uses birth year relative to current season (Aug 1 cutoff by default).
    /// Returns nil if age is outside the supported range (under 6 or over 19).
    static func from(dateOfBirth: Date, seasonCutoff: Int = 8) -> AgeGroup? {
        let calendar = Calendar.current
        let age = calendar.dateComponents([.year], from: dateOfBirth, to: .now).year ?? 0
        
        // Guard: too young or too old for the app
        guard age >= 6 && age <= 19 else { return nil }
        
        switch age {
        case 6...10: return .u8_u10
        case 11...13: return .u11_u13
        case 14...16: return .u14_u16
        case 17...19: return .u17_u18
        default: return nil
        }
    }
}

// Allow manual override for registration-year edge cases:
// keeper.ageGroup = keeper.ageGroupOverride ?? AgeGroup.from(dateOfBirth: keeper.dateOfBirth) ?? .u8_u10

enum SkillPillar: String, Codable, CaseIterable {
    case shotStopping = "Shot Stopping"
    case crossesHighBalls = "Crosses & High Balls"
    case oneVOneBreakaway = "1v1 & Breakaways"
    case distribution = "Distribution"
    case footworkAgility = "Footwork & Agility"
    case tacticalAwareness = "Tactical Awareness"
    case communication = "Communication & Leadership"
    case mentalPsychological = "Mental & Psychological"
}
```

---

## 3. Feature Implementation Patterns

### Age-Gated Content

The framework is emphatic: assessments **must be age-appropriate**. Implement this as a filter:

```swift
extension SkillPillar {
    /// Sub-skills available for a given age group
    func availableSubSkills(for ageGroup: AgeGroup) -> [SubSkill] {
        allSubSkills.filter { $0.minimumAgeGroup <= ageGroup }
    }
}

// In views, always filter:
ForEach(pillar.availableSubSkills(for: keeper.currentAgeGroup)) { subSkill in
    SubSkillAssessmentRow(subSkill: subSkill)
}
```

### Video Capture & Review

Video is the framework's highest-priority feature. Use `AVFoundation`:

```swift
import AVFoundation

// Camera capture for technique review
struct VideoCaptureView: UIViewControllerRepresentable {
    @Binding var videoURL: URL?
    
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = ["public.movie"]
        picker.videoQuality = .typeHigh
        picker.delegate = context.coordinator
        return picker
    }
    // ...
}
```

### Gamification (U8–U10)

For younger age groups, the framework says the app should "feel like a game":

- Use badge/milestone system with SF Symbols and custom assets
- Star ratings for drill completion (not performance judgment)
- Streak tracking for consecutive session attendance
- Avoid percentage stats — use visual progress (progress bars, filled stars)

### Match Report Card

Implement the match report card from Section 5 of the framework as a structured SwiftUI view with skill pillar breakdowns, key moments timeline, and overall rating.

---

## 4. API & Backend Integration

### Network Layer

Use a protocol-based network layer for testability:

```swift
protocol APIClientProtocol {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T
}

final class APIClient: APIClientProtocol {
    private let session: URLSession
    private let decoder: JSONDecoder
    
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        let (data, response) = try await session.data(for: endpoint.urlRequest)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }
        
        return try decoder.decode(T.self, from: data)
    }
}
```

### Offline-First Strategy

The framework requires offline-first capability. Pattern:

1. **SwiftData is the source of truth** — all reads come from local storage
2. **Sync service** runs when connectivity is available
3. **Conflict resolution** uses last-write-wins with timestamp comparison
4. **Queue pending changes** when offline, flush when online

```swift
@Observable
final class SyncService {
    var syncStatus: SyncStatus = .idle
    
    private let apiClient: APIClientProtocol
    private let modelContext: ModelContext
    
    func syncIfNeeded() async {
        guard NetworkMonitor.shared.isConnected else { return }
        syncStatus = .syncing
        // Push local changes, pull remote updates
        syncStatus = .idle
    }
}
```

### Error Handling

Use a structured error type with user-facing messages:

```swift
enum AppError: LocalizedError {
    case networkUnavailable
    case saveFailed(underlying: Error)
    case videoCaptureFailed
    case invalidData(reason: String)
    
    var errorDescription: String? {
        switch self {
        case .networkUnavailable:
            return "No internet connection. Your data is saved locally and will sync when you're back online."
        case .saveFailed(let error):
            return "Couldn't save your changes: \(error.localizedDescription)"
        case .videoCaptureFailed:
            return "Camera isn't available. Check your permissions in Settings."
        case .invalidData(let reason):
            return "Something went wrong: \(reason)"
        }
    }
}
```

---

## 5. Debugging & Performance

### Common Build Issues

| Issue | Fix |
|---|---|
| `@Observable` not recognized | Ensure deployment target is iOS 17.0+ and Xcode 15+ |
| SwiftData migration crashes | Use `VersionedSchema` for model changes; test migration paths |
| Preview crashes with SwiftData | Provide an in-memory `ModelContainer` in previews |
| Signing errors | Reset signing in project settings → Signing & Capabilities |
| Module not found | Clean build folder (⇧⌘K), resolve packages (File → Packages → Reset) |

### SwiftData Migration Strategy

Plan for data model evolution from day one:

1. **Version 1 (launch):** Lightweight schema — use the initial `@Model` definitions as `SchemaV1`
2. **Additive changes (new fields):** Use optional properties with defaults. No migration needed:
   ```swift
   @Model final class Keeper {
       // v1 fields...
       var newField: String? // Added in v1.1 — nil default, no migration
   }
   ```
3. **Breaking changes (renamed/removed fields):** Use `VersionedSchema` and `SchemaMigrationPlan`:
   ```swift
   enum KeeperCoachSchemaV1: VersionedSchema {
       static var versionIdentifier = Schema.Version(1, 0, 0)
       static var models: [any PersistentModel.Type] = [Keeper.self, /*...*/]
   }
   
   enum KeeperCoachMigrationPlan: SchemaMigrationPlan {
       static var schemas: [any VersionedSchema.Type] = [KeeperCoachSchemaV1.self]
       static var stages: [MigrationStage] = []
   }
   ```
4. **Always test migrations** using a pre-populated v1 database on a physical device before TestFlight

### Video Storage Management

Video is the highest-value feature but consumes significant storage. Follow these rules:

| Setting | Value |
|---|---|
| **Capture quality** | `.typeHigh` (1080p) — avoid `.type4K` on device |
| **Max clip duration** | 2 minutes (client-enforced) |
| **Compression** | AVAssetExportSession with `AVAssetExportPresetMediumQuality` before upload |
| **Local cache** | Keep last 50 clips on device; older clips available via cloud streaming |
| **Quota tracking** | Display usage in Settings via `StorageManagementView`; warn at 80% quota |
| **Cloud offload** | Upload to Firebase Storage on Wi-Fi; delete local copy after confirmed upload |

### Preview Best Practices

Always provide SwiftUI preview support with mock data:

```swift
#Preview {
    KeeperProfileView(keeper: .preview)
        .modelContainer(PreviewContainer.shared.container)
}

extension Keeper {
    static var preview: Keeper {
        Keeper(name: "Alex Johnson", dateOfBirth: Calendar.current.date(byAdding: .year, value: -13, to: .now)!)
    }
}

@MainActor
enum PreviewContainer {
    static let shared: PreviewContainer = {
        let container = try! ModelContainer(
            for: Keeper.self, TrainingSession.self, Assessment.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        // Insert sample data
        return container
    }()
}
```

### Performance Checklist

- [ ] Use `LazyVStack` / `LazyVGrid` for long scrolling lists
- [ ] Avoid expensive computations in `body` — move to ViewModel
- [ ] Profile with Instruments → SwiftUI template for view re-renders
- [ ] Use `.task` modifier for async data loading (auto-cancels)
- [ ] Optimize images: resize before display, use `.resizable()` + `.aspectRatio()`
- [ ] Minimize `@Query` scope — use predicates and sort descriptors

---

## 6. Testing Strategy

### Unit Tests

Test ViewModels and services, not views:

```swift
@Test func keeperAgeGroupCalculation() {
    let dob = Calendar.current.date(byAdding: .year, value: -12, to: .now)!
    let keeper = Keeper(name: "Test", dateOfBirth: dob)
    #expect(keeper.currentAgeGroup == .u11_u13)
}

@Test func ageGatedSkillsFiltering() {
    let u10Skills = SkillPillar.shotStopping.availableSubSkills(for: .u8_u10)
    // U8-U10 should NOT include diving technique
    #expect(!u10Skills.contains(.divingTechnique))
}
```

### UI Tests

Focus on critical user flows:

1. Creating a new keeper profile
2. Recording a training session with assessments
3. Generating a match report card
4. Viewing the development dashboard

### Preview-Driven Development

Use Xcode Previews as a rapid feedback loop:
- Every view gets a `#Preview` block
- Previews cover multiple states (empty, loading, populated, error)
- Use preview-specific `ModelContainer` with in-memory storage

---

## 7. Build & Release

### Version Numbering

Use semantic versioning: `MAJOR.MINOR.PATCH`
- **Major:** Breaking changes, major new features
- **Minor:** New features, significant improvements
- **Patch:** Bug fixes, small tweaks

### TestFlight Workflow

1. Bump version and build number in project settings
2. Archive: Product → Archive
3. Distribute: Window → Organizer → Distribute App → TestFlight
4. Wait for processing, then enable the build for testers
5. Add release notes describing what to test

### App Store Submission

Follow the full checklist in `resources/release-checklist.md`.

---

## 8. Code Style & Conventions

### Naming

| Element | Convention | Example |
|---|---|---|
| Types / Protocols | UpperCamelCase | `KeeperProfile`, `DataServiceProtocol` |
| Properties / Functions | lowerCamelCase | `savePercentage`, `fetchSessions()` |
| Enum cases | lowerCamelCase | `.shotStopping`, `.u11_u13` |
| Files | Match primary type name | `KeeperProfileView.swift` |
| Folders | Feature name, lowercase with hyphens | `keeper-profile/`, `match-report/` |

### File Organization

Each Swift file should follow this order:
1. Imports
2. Type declaration
3. `// MARK: - Properties`
4. `// MARK: - Body` (for Views) or `// MARK: - Public Methods`
5. `// MARK: - Private Methods`
6. `// MARK: - Preview` (for Views)

### SwiftLint (Recommended)

Add SwiftLint via SPM or Homebrew for consistent style enforcement. Use the default rules as a starting point.

---

## 9. Key Domain Rules from the Framework

These product rules from `GOALIE_DEVELOPMENT_FRAMEWORK.md` **must** be followed in every feature:

1. **Age-gated assessments** — A U9 keeper must never see cross-claiming stats
2. **Self-vs-self only** — Never rank or compare keepers against each other
3. **Video is the highest-value feature** — Prioritize capture, tag, and review
4. **Context-aware stats** — Save percentage without shot difficulty context is misleading
5. **Positive reinforcement** — Feedback must be encouraging and growth-oriented
6. **Offline-first** — App must work without connectivity and sync later
7. **Parent-friendly view** — Curated dashboard via `getParentDashboard` Cloud Function; shows milestones, attendance, trends; never raw stats
8. **Privacy via visibility** — Assessments have `visibility` field (`coachOnly`, `coachAndKeeper`, `coachKeeperAndParent`); mental health scores default to `coachOnly`
9. **Coach + self assessment** — Dual-rating reveals powerful coaching insights
10. **Drill ↔ Skill linkage** — Every drill maps to one or more skill pillars
11. **Multi-keeper workflow** — Coaches manage multiple keepers via Team/Roster; group sessions enable batch assessment entry
12. **Role-based navigation** — ContentView routes to CoachDashboard, KeeperDashboard, or ParentDashboard based on auth role


### 🔴 CRITICAL PROJECT RULE
**NEVER touch or impact our ability to upload and process videos without getting the human's explicit approval first.**

If you propose ANY changes to the upload pipeline, frontend file handlers, or backend Gemini video processing architecture, you MUST:
1. Clearly outline the technical risks involved.
2. Provide a safe mitigation plan.
3. WAIT for the human to explicitly say "approved" before modifying the code.


### 🔴 CRITICAL PROJECT RULE: AI MODEL SELECTION
**ALWAYS use Gemini 2.5 Flash and the `@google/genai` SDK for all backend/AI architecture.**
The older Gemini 1.5 and `@google-cloud/vertexai` SDK are DEPRECATED and currently throw 404 errors. Never write code proposing Vertex AI.

