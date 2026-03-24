# My Keeper Coach — Email Platform Setup

> Defines the chosen email platform, setup instructions, and foundational sequence structure. Referenced by the Email & Lifecycle Expert skill.

---

## Recommended Platform: ConvertKit (Kit)

**Why ConvertKit:**
- Free up to 1,000 subscribers — perfect for Stage 0
- Visual automation builder (drag-and-drop lifecycle sequences)
- Excellent deliverability for coaching/creator audience
- Easy for a solo founder to manage without a developer
- Scales cleanly — migrate to Klaviyo when list exceeds 10K

**Sign up at:** kit.com  
**Status:** 🔴 Not yet created — priority action this week

**When to migrate:** At 10,000+ subscribers, evaluate Klaviyo for advanced segmentation and Firestore integration.

---

## Account Setup Checklist

### Week 1 (Before First Signup Goes Live)
- [ ] Create ConvertKit account at kit.com
- [ ] Verify sender domain (mykeepercoach.com or your domain)
- [ ] Set From Name: "Evan at My Keeper Coach" (personal > company)
- [ ] Set Reply-To: a real inbox you monitor
- [ ] Upload brand logo for email header
- [ ] Add unsubscribe footer with physical address (legal requirement)
- [ ] Connect to signup form on trial.html (ConvertKit embed or API)

### Week 2
- [ ] Build "Trial Welcome" automation (see sequence below)
- [ ] Create subscriber tag: `trial_signup`
- [ ] Create subscriber tag: `uploaded_video`
- [ ] Create subscriber tag: `paid_subscriber`
- [ ] Test all automations with a test email address

---

## Tag Architecture

Tags drive segmentation and automation triggers. Apply these consistently:

| Tag | Applied When | Used For |
|---|---|---|
| `trial_signup` | Account created | Triggers welcome sequence |
| `uploaded_video` | First video upload (via API or webhook) | Suppresses upload-nag emails |
| `report_viewed` | First report card opened | Triggers deeper engagement sequence |
| `trial_expiring_7d` | 7 days before trial end | Triggers conversion sequence |
| `paid_subscriber` | Subscription activated | Suppresses all sales emails |
| `churned` | Subscription cancelled | Triggers win-back sequence |
| `inactive_30d` | No login in 30 days | Triggers win-back sequence |
| `icp_club_coach` | Self-identified or inferred | Enables persona-specific content |
| `icp_private_trainer` | Self-identified | Enables persona-specific content |
| `age_group_u8_u10` | Set in app profile | Sends age-appropriate content |

---

## Automation Map

```
[Signup] → Tag: trial_signup
    → Automation: Trial Welcome Sequence (7 emails over 7 days)

[First Upload Detected] → Tag: uploaded_video
    → Automation: First Analysis Sequence (3 emails, cancel if report viewed)

[Trial Day 25] → Tag: trial_expiring_7d
    → Automation: Conversion Sequence (3 emails over 7 days)

[Subscription Active] → Tag: paid_subscriber
    → Remove from all sales automations
    → Add to: Monthly Coach Newsletter

[30 days no login] → Tag: inactive_30d
    → Automation: Win-Back Sequence (3 emails over 4 weeks)

[Subscription Cancelled] → Tag: churned
    → Automation: Win-Back Sequence (3 emails over 4 weeks)
```

---

## Email Sending Schedule

| Type | Cadence | Best Time |
|---|---|---|
| Automated sequences | Triggered by behavior | 8:00am recipient local time |
| Monthly newsletter | First Tuesday of month | 8:00am |
| Product announcements | As needed | Tuesday–Thursday, 8–9am |
| Never send | Monday morning, Friday afternoon | — |

---

## Deliverability Basics

- **Domain verification:** Set up DKIM and SPF records for your sending domain before sending. ConvertKit provides the records.
- **Warm up the list:** First 30 days, don't send to more than 200/day. Ramp up gradually.
- **Clean the list:** After 3 months, remove subscribers who haven't opened in 90 days.
- **Plain text version:** Always include — it increases deliverability and feels less spammy.
- **Subject line length:** Under 50 characters (mobile preview shows 40–50 chars max).

---

## Integration with Firebase

When the Firebase backend is ready, connect ConvertKit via API to:
1. Automatically tag `uploaded_video` when a Firestore upload document is created
2. Automatically tag `paid_subscriber` when `subscriptionStatus` changes to `active`
3. Automatically tag `churned` when `subscriptionStatus` changes to `expired` after being `active`

Until the API integration is built, manually update tags weekly by exporting Firestore data.

---

## Monthly Newsletter Template

**Subject:** The GK Development Digest — [Month] Edition

```
Hi [First Name],

[Opening line — current moment in youth soccer season or recent coaching observation]

---

🧤 COACHING TIP OF THE MONTH

[200 words, age-group specific, actionable technique or drill insight]

---

🆕 WHAT'S NEW IN THE APP

[2-3 sentences on a feature update, improvement, or new capability]

---

👏 COACH SPOTLIGHT

[Name] coaches [age group] keepers at [club type] in [region].

"[Quote about their coaching philosophy or how they use the app]"

— [Name], My Keeper Coach user since [month]

---

📊 KEEPER MILESTONE OF THE MONTH

This month, My Keeper Coach coaches logged [X] uploads and [X] report cards. 
One keeper earned their [Badge Name] milestone — their coach had this to say:
"[Quote, anonymized with permission]"

---

See you on the pitch.

Evan
My Keeper Coach

[Unsubscribe] | [Update Preferences]
```
