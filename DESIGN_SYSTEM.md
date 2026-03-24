# Goalie Coach — Design System & UX Specification

> **Role:** Designer / UX  
> **Date:** March 14, 2026  
> **Target Platform:** iOS 17+ (iPhone SE → iPhone 16 Pro Max)

---

## 1. Design Philosophy

The Goalie Coach app must feel **premium, sporty, and encouraging**. It's a development tool, not a stats dump — every screen should motivate the goalkeeper and simplify the coach's workflow.

### Core UX Principles

| Principle | How It Shows Up |
|---|---|
| **Clarity over density** | One primary action per screen. No information overload. |
| **Encouraging by default** | Progress is celebrated. Mistakes are framed as growth opportunities. |
| **Age-appropriate** | U8–U10 sees stars and badges. U14+ sees charts and percentages. |
| **Coach-efficient** | Match logging in under 60 seconds. One-tap session start. |
| **Offline-confident** | No loading spinners — data is always local-first. Sync is invisible. |

---

## 2. Color System

### Primary Palette

| Token | Hex | Usage |
|---|---|---|
| `background.primary` | `#0B1426` | Main app background (deep navy) |
| `background.secondary` | `#111D33` | Card backgrounds, elevated surfaces |
| `background.tertiary` | `#182740` | Input fields, inactive elements |
| `accent.green` | `#00E676` | Primary CTA, positive metrics, success states |
| `accent.blue` | `#448AFF` | Secondary actions, links, informational elements |
| `accent.yellow` | `#FFD740` | Warnings, medium-level metrics, stars |
| `accent.red` | `#FF5252` | Errors, critical alerts (used sparingly) |

### Text Colors

| Token | Hex | Usage |
|---|---|---|
| `text.primary` | `#FFFFFF` | Headlines, primary labels |
| `text.secondary` | `#B0BEC5` | Subtitles, descriptions, captions |
| `text.tertiary` | `#546E7A` | Placeholders, disabled text |
| `text.onAccent` | `#0B1426` | Text on green/yellow buttons |

### Semantic Colors

| Token | Usage | Color |
|---|---|---|
| `rating.excellent` | 8–10 rating range | `accent.green` |
| `rating.good` | 6–7 rating range | `accent.blue` |
| `rating.developing` | 4–5 rating range | `accent.yellow` |
| `rating.needsWork` | 1–3 rating range | `accent.red` |

### Glassmorphism Effect

Cards and elevated surfaces use a subtle glass effect:
- Background: `background.secondary` at 70% opacity
- Border: 1px `#FFFFFF` at 8% opacity
- Blur: 20pt backdrop blur
- Corner radius: 16pt

---

## 3. Typography

**Font Family:** SF Pro (system font — ships with iOS, supports Dynamic Type)

| Style | Weight | Size | Line Height | Usage |
|---|---|---|---|---|
| `display` | Bold | 34pt | 41pt | Screen titles ("Match Report") |
| `headline` | Semibold | 22pt | 28pt | Section headers ("Recent Activity") |
| `title` | Semibold | 17pt | 22pt | Card titles ("Rapid Fire Saves") |
| `body` | Regular | 17pt | 22pt | Descriptions, form labels |
| `callout` | Regular | 16pt | 21pt | Stats labels ("Save %") |
| `subhead` | Regular | 15pt | 20pt | Secondary info (dates, durations) |
| `caption` | Regular | 12pt | 16pt | Badges, tags, footnotes |
| `stat.large` | Bold | 48pt | 52pt | Hero stats ("73%", "7.2") |
| `stat.medium` | Bold | 28pt | 34pt | Card stats ("12", "5") |

> **Dynamic Type:** All text styles must scale with the user's accessibility settings. Use `Font.system(.body)` style mapping, not hardcoded sizes.

---

## 4. Spacing & Layout

### Spacing Scale

| Token | Value | Usage |
|---|---|---|
| `space.xs` | 4pt | Icon-to-text gap |
| `space.sm` | 8pt | Intra-component padding |
| `space.md` | 12pt | Between related elements |
| `space.lg` | 16pt | Card internal padding |
| `space.xl` | 24pt | Between sections |
| `space.xxl` | 32pt | Screen top/bottom margins |

### Layout Grid

- **Screen margins:** 16pt (leading/trailing)
- **Card spacing:** 12pt vertical gap
- **Tab bar height:** 49pt (iOS standard)
- **Safe area:** Always respect notch/Dynamic Island and home indicator

---

## 5. Component Library

### 5.1 Buttons

#### Primary Button (CTA)
- Background: `accent.green`
- Text: `text.onAccent`, `title` weight
- Height: 52pt
- Corner radius: 14pt
- Tap animation: Scale to 0.96 with haptic feedback (light impact)
- Example: "Start Session", "Save Report", "Share Report"

#### Secondary Button
- Background: `background.tertiary`
- Border: 1px `accent.blue`
- Text: `accent.blue`, `title` weight
- Height: 48pt
- Corner radius: 14pt
- Example: "Cancel", "View All", "Edit"

#### Icon Button
- Size: 44×44pt (minimum tap target)
- Icon: 22pt SF Symbol
- Background: `background.secondary` (circle)
- Example: Back arrow, settings gear, camera icon

### 5.2 Cards

#### Stat Card
- Layout: Vertical — label on top, large stat below
- Background: Glassmorphism effect
- Size: Flexible width (⅓ of screen in 3-column layout)
- Corner radius: 16pt
- Padding: 16pt all sides

#### Activity Card
- Layout: Horizontal — date/type on left, rating on right
- Background: Glassmorphism effect  
- Height: ~76pt
- Corner radius: 16pt
- Right chevron for navigation
- Tap highlight: Brief opacity reduction

#### Drill Card
- Layout: Horizontal — thumbnail (64×64) | title + tags + description | play button
- Background: Glassmorphism effect
- Corner radius: 16pt
- Thumbnail corner radius: 12pt
- Tags: Pill-shaped badges below title

### 5.3 Navigation

#### Tab Bar (4 tabs)
| Tab | Icon (SF Symbol) | Label |
|---|---|---|
| Dashboard | `house.fill` | Dashboard |
| Sessions | `calendar` | Sessions |
| Drills | `figure.soccer` | Drills |
| Profile | `person.fill` | Profile |

- Active: `accent.green` icon + label
- Inactive: `text.tertiary` icon + label
- Background: `background.primary` with top border 0.5px `#FFFFFF` at 10%

#### Navigation Bar
- Style: Large title (iOS standard)
- Background: `background.primary` (translucent)
- Back button: SF Symbol `chevron.left` in `accent.blue`

### 5.4 Charts & Data Visualization

#### Radar Chart (Skill Pillars)
- 6 axes representing skill pillars
- Fill: `accent.green` at 30% opacity
- Stroke: `accent.green` at 100%, 2pt
- Grid lines: `text.tertiary` at 20%, 0.5pt
- Labels: `caption` style in `text.secondary`
- Size: 240×240pt centered

#### Progress Bar (Skill Rating)
- Track: `background.tertiary`, height 6pt, full corner radius
- Fill: Semantic color based on rating value
- Label: Skill name left-aligned, score right-aligned
- Height: 6pt

#### Rating Ring (Overall Score)
- Circular progress indicator
- Gradient stroke: `accent.green` → `accent.blue`
- Track: `background.tertiary`
- Stroke width: 8pt
- Center: Score in `stat.large` style
- Size: 140×140pt

### 5.5 Badges & Tags

#### Skill Pillar Tag
- Background: Pillar-specific color at 15% opacity
- Text: Pillar-specific color, `caption` style
- Corner radius: 6pt
- Padding: 4pt horizontal, 2pt vertical

#### Difficulty Badge
- **Beginner:** Green background, "Beginner" label
- **Intermediate:** Blue background, "Intermediate" label  
- **Advanced:** Yellow background, "Advanced" label
- Corner radius: 6pt
- Text: `caption` bold

#### Age Group Badge
- Background: `accent.blue`
- Text: `text.primary`, `caption` bold
- Corner radius: 8pt
- Example: "U13"

### 5.6 Filter Chips (Pill Selector)
- Inactive: `background.tertiary` background, `text.secondary` text
- Active: `accent.green` background, `text.onAccent` text
- Height: 32pt
- Corner radius: 16pt (full round)
- Horizontal scroll when overflow

### 5.7 Form Inputs
- Background: `background.tertiary`
- Border: 1px `#FFFFFF` at 8%
- Focus border: `accent.blue`
- Text: `text.primary`, `body` style
- Placeholder: `text.tertiary`
- Height: 48pt
- Corner radius: 12pt

---

## 6. Iconography

### System Icons (SF Symbols)

Use Apple's SF Symbols exclusively for consistency and accessibility:

| Context | Symbol | Variant |
|---|---|---|
| Shot Stopping | `hand.raised.fill` | Filled |
| Crosses & High Balls | `arrow.up.circle.fill` | Filled |
| 1v1 & Breakaways | `figure.run` | Default |
| Distribution | `arrow.right.circle.fill` | Filled |
| Footwork & Agility | `figure.walk` | Default |
| Tactical Awareness | `brain.head.profile` | Default |
| Communication | `megaphone.fill` | Filled |
| Mental & Psychological | `brain` | Default |
| Video Capture | `video.fill` | Filled |
| Stopwatch / Duration | `timer` | Default |
| Star / Rating | `star.fill` | Filled |
| Warning / Error | `exclamationmark.triangle.fill` | Filled |
| Positive Moment | `star.circle.fill` | Filled |
| Calendar / Date | `calendar` | Default |

### App Icon Guidance

The app icon should convey:
- **Goalkeeper glove** — the universal symbol for the position
- **Clean geometric design** — modern, not cartoonish
- **Green on dark** — consistent with the app's color scheme
- **No text** — icons with text don't scale well

Recommended approach: A stylized goalkeeper glove silhouette in neon green on a deep navy circular background with a subtle gradient. The glove should face forward, fingers spread — iconic and immediately recognizable.

---

## 7. Screen Map & Flow

### Information Architecture

```
┌─── Tab Bar ───────────────────────────────────┐
│                                               │
│  Dashboard ──→ Keeper Profile                 │
│  (Home)        ├── Skill Radar Chart          │
│                ├── Quick Stats                │
│                ├── Recent Activity            │
│                └── Development Milestones     │
│                                               │
│  Sessions ──→ Session List                    │
│                ├── New Session (Create)        │
│                │   ├── Practice               │
│                │   ├── Drill                  │
│                │   └── Match                  │
│                ├── Session Detail              │
│                │   ├── Skill Assessments      │
│                │   ├── Video Clips            │
│                │   └── Notes                  │
│                └── Match Report Card          │
│                                               │
│  Drills ────→ Drill Library                   │
│                ├── Search & Filter            │
│                ├── Drill Detail               │
│                │   ├── Video Demo             │
│                │   ├── Setup Instructions     │
│                │   └── Linked Skill Pillars   │
│                └── Recommended Drills         │
│                                               │
│  Profile ───→ Settings                        │
│                ├── Keeper Info / Age Group     │
│                ├── Coach Info                  │
│                ├── Parent View Toggle         │
│                ├── Notifications              │
│                └── Data & Privacy             │
│                                               │
└───────────────────────────────────────────────┘
```

### Three Key Screens (Mockups)

The three screen mockups represent the core user experiences:

1. **GK Profile Dashboard** — The "home" screen. What a coach opens before every session and a keeper reviews after every match. Shows the skill radar chart, quick stats, and recent activity.

2. **Match Report Card** — Generated after each match. Shows overall rating, per-pillar breakdown, key stats, and highlighted moments. Shareable with parents.

3. **Drill Library** — Searchable, filterable library of GK-specific drills. Each drill links to skill pillars and provides difficulty level, duration, and video demos.

---

## 8. Three-View Architecture

The same app serves three different user roles with **distinct tab bars, screen structures, and data depth**.

### 8.1 Coach View

The coach may manage **dozens of keepers** across multiple age groups. Efficiency is paramount — every screen should save time, not add it.

#### Coach Tab Bar

| Tab | Icon (SF Symbol) | Label |
|---|---|---|
| Roster | `person.3.fill` | Roster |
| Schedule | `calendar.badge.clock` | Schedule |
| Reports | `chart.bar.doc.horizontal` | Reports |
| Settings | `gearshape` | Settings |

#### Coach Roster Screen ("My Keepers")
- **Header:** Coach name + avatar, "+" button to add a keeper
- **Age-group filter chips** with counts: "All (24)", "U8-U10 (6)", "U11-U13 (9)", etc.
- **Search bar** for quick lookup
- **Keeper list cards** showing:
  - Profile avatar (40×40)
  - Name + age group badge
  - **Mini radar chart thumbnail** (40×40) — at-a-glance skill shape
  - Last session date
  - **Trend indicator dot:** green (improving), yellow (maintaining), red (declining)
  - Right chevron → navigates to keeper detail

#### Coach Keeper Detail Screen
- **Profile header:** Large avatar, name, age group badge, "Edit" button
- **Two side-by-side CTAs:** "Log Session" (green primary) + "Match Report" (blue secondary)
- **Development Trend** indicator: arrow + "Improving / Maintaining / Declining" + time range
- **Overlaid radar chart:** Current month (solid fill) overlaid on previous month (ghost outline)
- **Priority Areas:** Auto-surfaced 2 weakest pillars with yellow badges + "Recommended Drills →" links
- **Recent Sessions:** Compact list of last 3 sessions
- **"Full History" button** at bottom

### 8.2 Keeper View

The keeper's own self-facing view. Motivating and gamified for younger age groups.

#### Keeper Tab Bar

| Tab | Icon (SF Symbol) | Label |
|---|---|---|
| Dashboard | `house.fill` | Dashboard |
| Sessions | `calendar` | Sessions |
| Drills | `figure.soccer` | Drills |
| Profile | `person.fill` | Profile |

*(Screens documented in Section 7 above)*

### 8.3 Parent View

Parents see a **completely different, simplified experience**. No raw statistics, no percentages, no skill pillar breakdowns. Only milestones, growth trends, and encouragement.

#### Parent Tab Bar

| Tab | Icon (SF Symbol) | Label |
|---|---|---|
| Progress | `star.fill` | Progress |
| Milestones | `trophy.fill` | Milestones |
| Schedule | `calendar` | Schedule |

#### Parent Progress Screen
- **Encouraging banner:** Gradient card with positive monthly summary ("Great month, Alex! 🌟")
- **Monthly summary:** Sessions attended, matches played (simple counts)
- **Milestones grid:** Badge icons with names and dates (🏆 "First Clean Sheet!", ⭐ "10 Session Streak!")
- **Growth Snapshot:** Simple bar chart showing improvement over 3 months — **no numbers, just visual bars growing**
- **Upcoming:** Next session card with date/time
- **"Message Coach" CTA** in green at bottom

#### Parent Design Rules
- ✅ Show: Milestones, attendance, growth trends, upcoming schedule
- ❌ Never show: Save percentages, skill pillar scores, rating numbers, coach notes, video clips
- Vocabulary: "Great progress!" not "73% save rate"
- Mental/confidence scores are **never visible** to parents

### 8.4 View Architecture Summary

| | **Coach** | **Keeper** | **Parent** |
|---|---|---|---|
| **Primary goal** | Efficient multi-keeper management | Self-motivated development | Peace of mind |
| **Tab count** | 4 | 4 | 3 |
| **Data depth** | Full assessment + all keepers | Own stats + self-assessment | Milestones & trends only |
| **Charts** | Radar per keeper + overlays | Own radar chart | Simple bar chart |
| **Tone** | Professional, efficient | Motivating, gamified | Warm, encouraging |
| **Primary CTA** | "Log Session", "Match Report" | "Start Drill", "Self-Rate" | "Message Coach" |

---

## 9. Micro-Animations & Interactions

| Interaction | Animation | Duration |
|---|---|---|
| Card tap | Scale to 0.96, then spring back | 150ms |
| Tab switch | Cross-fade content, icon bounce | 200ms |
| Radar chart appear | Draw stroke from center outward | 800ms ease-out |
| Rating ring fill | Animate from 0 to score value | 600ms ease-out |
| Progress bar fill | Slide from left | 400ms ease-out |
| Badge unlock | Scale from 0 → 1.1 → 1.0 with confetti | 500ms spring |
| Pull-to-refresh | Native iOS behavior | System default |
| Swipe to delete | iOS standard destructive swipe | System default |

---

## 10. Age-Adaptive UX

The UI adapts based on the keeper's age group:

| Element | U8–U10 | U11–U13 | U14–U16 | U17–U18 |
|---|---|---|---|---|
| **Stats display** | Stars & badges | Simple ratings (1–5) | Percentages & charts | Advanced analytics |
| **Radar chart** | Simplified (3 axes) | Full (6 axes) | Full + trends | Full + benchmarks |
| **Match report** | "Great job!" emphasis | Balanced feedback | Detailed breakdown | Pro-style analysis |
| **Gamification** | Stickers, streaks, stars | Badges, milestones | Achievement system | Performance log |
| **Vocabulary** | "Awesome catch!" | "Good technique" | "73% save rate" | "xG faced: 1.4" |
| **Color intensity** | Brighter, more playful | Standard palette | Standard palette | Standard palette |

---

## 11. Dark Mode

The app is **dark-mode by default** — this is the primary design. The dark theme:
- Reduces glare on outdoor fields (sideline coaching)
- Feels premium and sporty
- Improves battery life on OLED iPhones
- Puts the focus on data visualizations (charts glow on dark)

An optional light mode can be added later using SwiftUI's `@Environment(\.colorScheme)`, but **dark is the hero experience**.

---

## 12. Accessibility

| Requirement | Implementation |
|---|---|
| **Dynamic Type** | All text scales with system settings |
| **VoiceOver** | Every element has a meaningful accessibility label |
| **Color contrast** | All text meets WCAG AA (4.5:1 minimum) |
| **Tap targets** | Minimum 44×44pt for all interactive elements |
| **Reduce Motion** | Respect `UIAccessibility.isReduceMotionEnabled` — disable animations |
| **Color not sole indicator** | Icons and text always accompany color-coded ratings |

---

## 13. Asset Checklist

| Asset | Format | Notes |
|---|---|---|
| App Icon | 1024×1024 PNG | Required for App Store; Xcode generates all sizes |
| Skill pillar icons | SF Symbols | No custom assets needed |
| Onboarding illustrations | SVG/PDF (vector) | 3 screens for first launch |
| Empty state illustrations | SVG/PDF | "No sessions yet", "No match reports" |
| Goalkeeper glove logo | SVG | Used in launch screen and about page |
| Badge/milestone icons | SF Symbols + custom | For gamification (U8–U10 emphasis) |

