# My Keeper Coach — Analytics Baseline

> Week 0 baseline document. Everything starts at zero — this is the foundation we measure all growth from.  
> Established: March 2026 (POC launch week)

---

## Current Status: Week 0

| Metric | Current | Target (Month 1) | Target (Month 3) | Target (Month 6) |
|---|---|---|---|---|
| **Weekly Active Coaches (WAC)** | 0 | 5 | 25 | 100 |
| **Trial signups (total)** | 0 | 10 | 75 | 300 |
| **Trial → upload rate** | — | > 40% | > 50% | > 55% |
| **Paying coaches** | 0 | 0 (trial only) | 10 | 60 |
| **Trial page CVR** | — | > 20% | > 25% | > 30% |
| **Blended CAC** | — | $0 (organic) | $0 (organic) | < $40 |
| **MRR** | $0 | $0 | ~$150 | ~$900 |

---

## UTM Tracking Convention

All links to the app or trial page must be UTM-tagged. Standard format:

```
utm_source=[channel]&utm_medium=[type]&utm_campaign=[name]&utm_content=[variant]
```

### Source Values
| Source | Use For |
|---|---|
| `instagram` | Instagram bio link, story links |
| `tiktok` | TikTok bio link |
| `youtube` | YouTube description links |
| `email` | All email links |
| `apple_search_ads` | Apple Search Ads |
| `meta` | Facebook/Instagram paid ads |
| `direct_outreach` | Personal DMs or emails to coaches |
| `partnership` | Club or org partner referrals |
| `organic` | Blog posts, SEO |

### Medium Values
| Medium | Use For |
|---|---|
| `social` | Organic social posts |
| `cpc` | All paid ads |
| `email` | Email sequences |
| `referral` | Partner/affiliate links |
| `content` | Blog/YouTube descriptions |

### Example UTMs
```
Trial page from Instagram bio:
/trial.html?utm_source=instagram&utm_medium=social&utm_campaign=bio_link

Trial page from TikTok paid ad:
/trial.html?utm_source=tiktok&utm_medium=cpc&utm_campaign=gk_coach_retargeting&utm_content=save_hook_v1

Trial page from email sequence Day 3:
/trial.html?utm_source=email&utm_medium=email&utm_campaign=trial_onboarding&utm_content=day3_upload_prompt
```

---

## Analytics Stack

| Tool | Purpose | Status |
|---|---|---|
| **Firebase Analytics** | In-app behavior, funnel, WAC | 🟢 Assumed live |
| **App Store Connect** | Install sources, ASO metrics | 🟢 Available |
| **ConvertKit Analytics** | Email open rates, CTR, sequence performance | 🔴 Not set up yet |
| **Firebase UTM Reports** | Channel attribution for signups | 🟡 Needs UTM tagging to activate |
| **Manual weekly spreadsheet** | Until Firebase dashboards are built | 🟢 Start immediately |

---

## Weekly Tracking Spreadsheet

Until automated dashboards are in place, track manually every Monday:

```
Week | WAC | New Signups | Uploads | Reports Opened | Top Channel | Notes
-----|-----|-------------|---------|----------------|-------------|------
Wk1  |  0  |      0      |    0    |       0        |      —      | POC launch
```

---

## Funnel Definitions

| Stage | Definition | How to Measure |
|---|---|---|
| **Visitor** | Lands on trial.html | Firebase / UTM |
| **Signup** | Creates an account | Firebase Auth events |
| **Activated** | Uploads ≥1 video | Firestore upload count |
| **Engaged** | Opens ≥1 report card | Firestore report view event |
| **Weekly Active (WAC)** | Upload OR report view in 7-day window | Firebase query |
| **Paying** | Active subscription | Firestore subscriptionStatus = active |
| **Retained** | Paying + WAC in month 2+ | Cohort query |

---

## Key Ratios to Track

| Ratio | Formula | What It Tells Us |
|---|---|---|
| **Activation rate** | Uploads / Signups | Is onboarding working? |
| **Engagement rate** | Report opens / Uploads | Is the AI output valuable? |
| **Trial conversion** | Paying / Activated | Is the paywall working? |
| **Retention** | WAC M2 / WAC M1 | Are coaches sticking? |
| **Referral rate** | Signups from referral / Total signups | Is word-of-mouth working? |

---

## First Experiment Queue

Run these experiments as soon as there's sufficient traffic (50+ signups):

1. **Trial page headline A/B** — Current hero H1 vs. pain-led variant
2. **Onboarding email Day 0 subject line** — "Welcome" vs. specific upload prompt
3. **App Store primary screenshot** — Save shot vs. radar chart vs. report card

Document all results in the Analytics Expert skill experiment log.
