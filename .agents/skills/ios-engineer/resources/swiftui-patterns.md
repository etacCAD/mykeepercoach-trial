# SwiftUI Patterns — My Keeper Coach

Reusable code patterns for building features in the My Keeper Coach app. Copy and adapt these templates.

---

## 1. Feature View Template

Standard pattern for a feature screen with async data loading:

```swift
import SwiftUI
import SwiftData

struct SessionListView: View {
    @Query(sort: \TrainingSession.date, order: .reverse)
    private var sessions: [TrainingSession]
    
    @State private var showNewSession = false
    
    var body: some View {
        Group {
            if sessions.isEmpty {
                EmptyStateView(
                    icon: "figure.soccer",
                    title: "No Sessions Yet",
                    message: "Tap + to record your first training session.",
                    action: { showNewSession = true }
                )
            } else {
                List(sessions) { session in
                    NavigationLink(value: AppRoute.sessionDetail(session)) {
                        SessionRowView(session: session)
                    }
                }
            }
        }
        .navigationTitle("Sessions")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New Session", systemImage: "plus") {
                    showNewSession = true
                }
            }
        }
        .sheet(isPresented: $showNewSession) {
            NewSessionView()
        }
    }
}

#Preview {
    NavigationStack {
        SessionListView()
    }
    .modelContainer(PreviewContainer.shared)
}
```

---

## 2. ViewModel Pattern with @Observable

```swift
import Foundation
import SwiftData

@Observable
final class MatchReportViewModel {
    // MARK: - Properties
    var matchReport: MatchReport
    var isLoading = false
    var errorMessage: String?
    var showSaveConfirmation = false
    
    private let modelContext: ModelContext
    
    // MARK: - Computed Properties
    var overallRating: Double {
        let ratings = matchReport.assessments.map(\.rating)
        guard !ratings.isEmpty else { return 0 }
        return Double(ratings.reduce(0, +)) / Double(ratings.count)
    }
    
    var skillPillarBreakdown: [(SkillPillar, Double)] {
        SkillPillar.allCases.compactMap { pillar in
            let pillarAssessments = matchReport.assessments.filter { $0.skillPillar == pillar }
            guard !pillarAssessments.isEmpty else { return nil }
            let avg = Double(pillarAssessments.map(\.rating).reduce(0, +)) / Double(pillarAssessments.count)
            return (pillar, avg)
        }
    }
    
    // MARK: - Init
    init(matchReport: MatchReport, modelContext: ModelContext) {
        self.matchReport = matchReport
        self.modelContext = modelContext
    }
    
    // MARK: - Actions
    func save() {
        do {
            try modelContext.save()
            showSaveConfirmation = true
        } catch {
            errorMessage = "Failed to save: \(error.localizedDescription)"
        }
    }
    
    func addKeyMoment(minute: Int, description: String, type: KeyMomentType) {
        let moment = KeyMoment(minute: minute, description: description, type: type)
        matchReport.keyMoments.append(moment)
    }
}
```

---

## 3. Age-Gated View Modifier

Hide content that isn't appropriate for a keeper's age group:

```swift
struct AgeGateModifier: ViewModifier {
    let requiredAgeGroup: AgeGroup
    let currentAgeGroup: AgeGroup
    
    func body(content: Content) -> some View {
        if currentAgeGroup >= requiredAgeGroup {
            content
        }
        // When age group doesn't qualify, view is hidden entirely
    }
}

extension View {
    func ageGated(requires ageGroup: AgeGroup, current: AgeGroup) -> some View {
        modifier(AgeGateModifier(requiredAgeGroup: ageGroup, currentAgeGroup: current))
    }
}

// Usage in a view:
VStack {
    ShotStoppingSection(keeper: keeper) // Always visible
    
    CrossesSection(keeper: keeper)
        .ageGated(requires: .u11_u13, current: keeper.currentAgeGroup)
    
    SweepingSection(keeper: keeper)
        .ageGated(requires: .u14_u16, current: keeper.currentAgeGroup)
}
```

Enable `AgeGroup` comparison:

```swift
extension AgeGroup: Comparable {
    static func < (lhs: AgeGroup, rhs: AgeGroup) -> Bool {
        let order: [AgeGroup] = [.u8_u10, .u11_u13, .u14_u16, .u17_u18]
        let lhsIndex = order.firstIndex(of: lhs) ?? 0
        let rhsIndex = order.firstIndex(of: rhs) ?? 0
        return lhsIndex < rhsIndex
    }
}
```

---

## 4. Skill Rating Input Component

Reusable rating component for coach and keeper self-assessment:

```swift
struct SkillRatingView: View {
    let title: String
    @Binding var rating: Int
    let maxRating: Int
    
    init(_ title: String, rating: Binding<Int>, maxRating: Int = 5) {
        self.title = title
        self._rating = rating
        self.maxRating = maxRating
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.medium)
            
            HStack(spacing: 4) {
                ForEach(1...maxRating, id: \.self) { value in
                    Image(systemName: value <= rating ? "star.fill" : "star")
                        .font(.title3)
                        .foregroundStyle(value <= rating ? .yellow : .gray.opacity(0.3))
                        .onTapGesture {
                            withAnimation(.spring(duration: 0.2)) {
                                rating = value
                            }
                        }
                }
            }
        }
    }
}

#Preview {
    @Previewable @State var rating = 3
    SkillRatingView("Diving Technique", rating: $rating)
        .padding()
}
```

---

## 5. Radar Chart for Skill Pillars

Visualize a keeper's skill profile across all pillars:

```swift
struct SkillRadarChart: View {
    let data: [(SkillPillar, Double)] // (pillar, 0.0–1.0 normalized score)
    
    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2 - 40
            let count = data.count
            
            guard count >= 3 else { return }
            
            // Draw grid rings
            for ring in 1...5 {
                let ringRadius = radius * Double(ring) / 5.0
                var ringPath = Path()
                for i in 0..<count {
                    let angle = (2 * .pi / Double(count)) * Double(i) - .pi / 2
                    let point = CGPoint(
                        x: center.x + cos(angle) * ringRadius,
                        y: center.y + sin(angle) * ringRadius
                    )
                    if i == 0 { ringPath.move(to: point) }
                    else { ringPath.addLine(to: point) }
                }
                ringPath.closeSubpath()
                context.stroke(ringPath, with: .color(.gray.opacity(0.2)), lineWidth: 1)
            }
            
            // Draw data polygon
            var dataPath = Path()
            for (i, item) in data.enumerated() {
                let angle = (2 * .pi / Double(count)) * Double(i) - .pi / 2
                let value = max(0, min(1, item.1))
                let point = CGPoint(
                    x: center.x + cos(angle) * radius * value,
                    y: center.y + sin(angle) * radius * value
                )
                if i == 0 { dataPath.move(to: point) }
                else { dataPath.addLine(to: point) }
            }
            dataPath.closeSubpath()
            context.fill(dataPath, with: .color(.blue.opacity(0.2)))
            context.stroke(dataPath, with: .color(.blue), lineWidth: 2)
        }
        .aspectRatio(1, contentMode: .fit)
    }
}
```

---

## 6. Offline-Aware View Pattern

Show sync status and handle offline scenarios:

```swift
struct SyncStatusBanner: View {
    let syncStatus: SyncStatus
    
    var body: some View {
        switch syncStatus {
        case .synced:
            EmptyView()
        case .offline:
            Label("Offline — changes saved locally", systemImage: "wifi.slash")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(.ultraThinMaterial)
        case .syncing:
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                Text("Syncing...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial)
        case .error(let message):
            Label(message, systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.red)
                .padding(.horizontal)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(.red.opacity(0.1))
        }
    }
}

enum SyncStatus: Equatable {
    case synced
    case offline
    case syncing
    case error(String)
}
```

---

## 7. Match Report Card View

The flagship output view from the framework (Section 5):

```swift
struct MatchReportCardView: View {
    let report: MatchReport
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Header
                VStack(spacing: 4) {
                    Text(report.keeper?.name ?? "Keeper")
                        .font(.title2.bold())
                    Text("\(report.date.formatted(date: .abbreviated, time: .omitted)) — vs. \(report.opponent)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding()
                
                // Overall Rating
                OverallRatingGauge(rating: report.overallRating)
                    .frame(height: 120)
                    .padding(.horizontal)
                
                Divider()
                
                // Skill Pillar Breakdown
                ForEach(report.pillarSummaries, id: \.pillar) { summary in
                    PillarSummaryRow(summary: summary)
                }
                
                Divider()
                
                // Key Moments
                if !report.keyMoments.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Key Moments")
                            .font(.headline)
                        
                        ForEach(report.keyMoments) { moment in
                            KeyMomentRow(moment: moment)
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
        .navigationTitle("Match Report")
    }
}
```

---

## 8. Card Modifier for Consistent Styling

```swift
struct CardModifier: ViewModifier {
    var padding: CGFloat = 16
    
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 4)
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View {
        modifier(CardModifier(padding: padding))
    }
}

// Usage:
VStack {
    Text("Shot Stopping")
    Text("71% save rate")
}
.card()
```

---

## 9. Preview Container

Shared preview setup with sample data:

```swift
@MainActor
enum PreviewContainer {
    static let shared: ModelContainer = {
        let container = try! ModelContainer(
            for: Keeper.self, TrainingSession.self, Assessment.self, MatchReport.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        
        // Sample keeper
        let keeper = Keeper(
            name: "Alex Johnson",
            dateOfBirth: Calendar.current.date(byAdding: .year, value: -13, to: .now)!
        )
        container.mainContext.insert(keeper)
        
        // Sample session
        let session = TrainingSession(
            date: .now.addingTimeInterval(-86400),
            type: .practice,
            duration: 3600,
            notes: "Great focus on diving technique today"
        )
        session.keeper = keeper
        container.mainContext.insert(session)
        
        // Sample assessments
        for pillar in [SkillPillar.shotStopping, .footworkAgility, .distribution] {
            let assessment = Assessment(
                skillPillar: pillar,
                rating: Int.random(in: 3...5),
                notes: nil,
                timestamp: .now
            )
            assessment.session = session
            container.mainContext.insert(assessment)
        }
        
        return container
    }()
}
```

---

## 10. Live Match Ticker — Quick In-Game Logging

Large, tap-friendly buttons for coaches to log actions **during a match** without looking at the screen. Detailed notes and video review happen post-match.

```swift
struct LiveMatchTickerView: View {
    @State private var viewModel: LiveMatchTickerViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            // Timer bar
            HStack {
                Text(viewModel.elapsedTime)
                    .font(.system(.title, design: .monospaced, weight: .bold))
                    .monospacedDigit()
                Spacer()
                Button(viewModel.isRunning ? "Pause" : "Resume") {
                    viewModel.toggleTimer()
                }
                .buttonStyle(.bordered)
            }
            .padding()
            .background(.ultraThinMaterial)
            
            // Quick action grid — large tap targets
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 12),
                GridItem(.flexible(), spacing: 12)
            ], spacing: 12) {
                TickerButton(title: "Save", icon: "hand.raised.fill", color: .green) {
                    viewModel.logAction(.save)
                }
                TickerButton(title: "Goal Conceded", icon: "soccerball", color: .red) {
                    viewModel.logAction(.goalConceded)
                }
                TickerButton(title: "Cross Claimed", icon: "arrow.up.circle.fill", color: .blue) {
                    viewModel.logAction(.crossClaimed)
                }
                TickerButton(title: "Distribution", icon: "arrow.right.circle.fill", color: .orange) {
                    viewModel.logAction(.distribution)
                }
                TickerButton(title: "1v1 Save", icon: "person.fill", color: .green) {
                    viewModel.logAction(.oneVOneSave)
                }
                TickerButton(title: "Key Moment", icon: "star.fill", color: .yellow) {
                    viewModel.logAction(.keyMoment)
                }
            }
            .padding()
            
            // Running tally
            ScrollView(.horizontal) {
                HStack(spacing: 16) {
                    StatPill(label: "Saves", count: viewModel.saveCount)
                    StatPill(label: "Goals", count: viewModel.goalCount)
                    StatPill(label: "Crosses", count: viewModel.crossCount)
                }
                .padding(.horizontal)
            }
        }
        .navigationTitle("Match Live")
    }
}

struct TickerButton: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 32))
                Text(title)
                    .font(.caption.bold())
            }
            .frame(maxWidth: .infinity, minHeight: 80)
            .background(color.opacity(0.15), in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(color)
        }
        .sensoryFeedback(.impact, trigger: title)
    }
}
```

---

## 11. Keeper Self-Service Dashboard

The keeper's own view — milestones, self-assessments, and video highlights. Age-appropriate and encouraging.

```swift
struct KeeperDashboardView: View {
    @Query private var milestones: [Milestone]
    @State private var showSelfAssess = false
    let keeper: Keeper
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Greeting
                VStack(spacing: 4) {
                    Text("Hey, \(keeper.name)! 👋")
                        .font(.title.bold())
                    Text("Keep pushing — you're getting better every session.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top)
                
                // Streak card
                AttendanceStreakCard(streak: keeper.currentStreak)
                    .card()
                
                // Recent badges (gamification)
                if !recentBadges.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent Achievements")
                            .font(.headline)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(recentBadges) { milestone in
                                    BadgeCard(milestone: milestone)
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                
                // Self-assessment prompt
                Button {
                    showSelfAssess = true
                } label: {
                    HStack {
                        Image(systemName: "pencil.circle.fill")
                            .font(.title2)
                        VStack(alignment: .leading) {
                            Text("Rate Your Last Session")
                                .font(.headline)
                            Text("How did you feel about your performance?")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .padding()
                    .background(.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
                .padding(.horizontal)
                
                // My Highlights (video clips)
                NavigationLink(value: AppRoute.myHighlights(keeper)) {
                    HStack {
                        Image(systemName: "play.circle.fill")
                            .font(.title2)
                        Text("My Highlights")
                            .font(.headline)
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .padding()
                    .background(.purple.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
                .padding(.horizontal)
            }
        }
        .navigationTitle("My Dashboard")
        .sheet(isPresented: $showSelfAssess) {
            KeeperSelfAssessView(keeper: keeper)
        }
    }
    
    private var recentBadges: [Milestone] {
        milestones.filter(\.achieved).sorted { ($0.achievedDate ?? .distantPast) > ($1.achievedDate ?? .distantPast) }.prefix(5).map { $0 }
    }
}
```

---

## 12. Parent Dashboard View

Curated, positive-focused view for parents. No raw stats — only milestones, trends, and attendance.

```swift
struct ParentDashboardView: View {
    @State private var viewModel: ParentDashboardViewModel
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Keeper name + age group
                VStack(spacing: 4) {
                    Text(viewModel.keeperName)
                        .font(.title.bold())
                    Text(viewModel.ageGroup)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top)
                
                // Attendance streak
                AttendanceStreakCard(streak: viewModel.attendanceStreak)
                    .card()
                
                // Activity summary
                HStack(spacing: 16) {
                    StatCard(title: "Sessions", value: "\(viewModel.sessionsThisMonth)", subtitle: "this month")
                    StatCard(title: "Matches", value: "\(viewModel.matchesThisMonth)", subtitle: "this month")
                }
                .padding(.horizontal)
                
                // Milestones carousel
                if !viewModel.milestones.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Achievements 🏆")
                            .font(.headline)
                            .padding(.horizontal)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(viewModel.milestones) { milestone in
                                    MilestoneCard(milestone: milestone)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
                
                // Skill trends (with contextual help)
                VStack(alignment: .leading, spacing: 12) {
                    Text("Development Trends")
                        .font(.headline)
                    ForEach(viewModel.skillHighlights) { highlight in
                        SkillTrendCard(
                            pillarName: highlight.pillar,
                            trend: highlight.trend,
                            helpText: highlight.displayLabel
                        )
                    }
                }
                .padding(.horizontal)
                
                // Coach notes
                if let coachNotes = viewModel.coachNotes {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Note from Coach", systemImage: "message.fill")
                            .font(.headline)
                        Text(coachNotes)
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }
                    .card()
                    .padding(.horizontal)
                }
            }
        }
        .navigationTitle("Parent Dashboard")
        .task {
            await viewModel.loadDashboard()
        }
    }
}
```

---

## 13. Coach Onboarding Flow

First-run experience: role selection → team creation → first keeper.

```swift
struct OnboardingFlowView: View {
    @State private var step: OnboardingStep = .roleSelection
    @State private var selectedRole: UserRole?
    
    enum OnboardingStep {
        case roleSelection, coachSetup, keeperInvite, parentInvite, complete
    }
    
    var body: some View {
        NavigationStack {
            switch step {
            case .roleSelection:
                RoleSelectionView { role in
                    selectedRole = role
                    switch role {
                    case .coach: step = .coachSetup
                    case .keeper: step = .keeperInvite
                    case .parent: step = .parentInvite
                    }
                }
            case .coachSetup:
                CoachSetupView {
                    step = .complete
                }
            case .keeperInvite:
                KeeperInviteView { step = .complete }
            case .parentInvite:
                ParentInviteView { step = .complete }
            case .complete:
                EmptyView() // Dismiss and show main app
            }
        }
    }
}

struct RoleSelectionView: View {
    let onSelect: (UserRole) -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            Text("Welcome to My Keeper Coach")
                .font(.largeTitle.bold())
            Text("How will you use the app?")
                .font(.title3)
                .foregroundStyle(.secondary)
            
            ForEach(UserRole.allCases, id: \.self) { role in
                Button { onSelect(role) } label: {
                    HStack {
                        Image(systemName: role.iconName)
                            .font(.title)
                            .frame(width: 44)
                        VStack(alignment: .leading) {
                            Text(role.displayTitle)
                                .font(.headline)
                            Text(role.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
    }
}
```

---

## 14. Decision Quality Input

Quick input for coaches to rate decision quality during post-match review:

```swift
struct DecisionQualityInput: View {
    let moment: String        // e.g., "23' — Came off line for through ball"
    @Binding var quality: DecisionQuality
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(moment)
                .font(.subheadline)
            
            HStack(spacing: 8) {
                ForEach(DecisionQuality.allCases, id: \.self) { option in
                    Button {
                        withAnimation(.spring(duration: 0.2)) {
                            quality = option
                        }
                    } label: {
                        Text(option.label)
                            .font(.caption.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                quality == option ? option.color.opacity(0.2) : Color.gray.opacity(0.1),
                                in: Capsule()
                            )
                            .foregroundStyle(quality == option ? option.color : .secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

enum DecisionQuality: String, CaseIterable, Codable {
    case correct, neutral, incorrect
    
    var label: String {
        switch self {
        case .correct: "✅ Correct"
        case .neutral: "➖ Neutral"
        case .incorrect: "❌ Incorrect"
        }
    }
    
    var color: Color {
        switch self {
        case .correct: .green
        case .neutral: .orange
        case .incorrect: .red
        }
    }
}
```

---

## 15. Badge Grid

Display earned and locked badges in a grid layout, age-gated:

```swift
struct BadgeGridView: View {
    @Query private var milestones: [Milestone]
    let keeper: Keeper
    let allBadges: [Badge]
    
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 16),
                GridItem(.flexible(), spacing: 16),
                GridItem(.flexible(), spacing: 16)
            ], spacing: 16) {
                ForEach(visibleBadges) { badge in
                    BadgeCell(
                        badge: badge,
                        isEarned: earnedBadgeIds.contains(badge.id),
                        earnedDate: milestoneForBadge(badge)?.achievedDate
                    )
                }
            }
            .padding()
        }
        .navigationTitle("Badges")
    }
    
    // Only show badges appropriate for keeper's age group
    private var visibleBadges: [Badge] {
        allBadges.filter { badge in
            AgeGroup(rawValue: badge.ageGroup).map { $0 <= keeper.currentAgeGroup } ?? false
        }
    }
    
    private var earnedBadgeIds: Set<String> {
        Set(milestones.filter(\.achieved).compactMap(\.badgeId))
    }
    
    private func milestoneForBadge(_ badge: Badge) -> Milestone? {
        milestones.first { $0.badgeId == badge.id && $0.achieved }
    }
}

struct BadgeCell: View {
    let badge: Badge
    let isEarned: Bool
    let earnedDate: Date?
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: badge.iconName)
                .font(.system(size: 32))
                .foregroundStyle(isEarned ? .yellow : .gray.opacity(0.3))
                .scaleEffect(isEarned ? 1.0 : 0.8)
            
            Text(badge.title)
                .font(.caption2.bold())
                .multilineTextAlignment(.center)
                .lineLimit(2)
            
            if let date = earnedDate {
                Text(date.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
            isEarned ? Color.yellow.opacity(0.08) : Color.gray.opacity(0.05),
            in: RoundedRectangle(cornerRadius: 12)
        )
        .opacity(isEarned ? 1.0 : 0.5)
    }
}
```
