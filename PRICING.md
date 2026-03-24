# My Keeper Coach — Pricing Strategy

> This document defines pricing tiers, rationale, and positioning. All GTM skills should reference this before making pricing-related claims or doing conversion work.

---

## Competitive Landscape (Research: March 2026)

| Product | Price | What It Does |
|---|---|---|
| **Trace PlayerFocus Basic** | $25/mo or $180/yr | Auto video capture + highlights. Hardware required. |
| **Trace PlayerFocus Pro** | $35/mo or $300/yr | Full analytics, heatmaps, downloads. Hardware required. |
| **The Keeper Club** | $20/mo or $210/yr | GK training videos + community membership |
| **TeamSnap Premium** | $10/mo or $100/yr | Team logistics, scheduling — not GK-specific |
| **Coachbetter** | $7–$13/mo | Session planning software for coaches |
| **Onform** | $29/mo or $299/yr | Unlimited clients, video analysis — not GK-specific |
| **Hudl (team)** | $2,000+/yr | Full team video — enterprise level |
| **Private GK sessions** | $100–$200/hr | 1-on-1 coaching — our most relevant comparison |

**Key insight:** The closest competitor with AI + video is Trace at $25–35/mo — but it requires hardware and isn't GK-specific. The pure-GK community plays (The Keeper Club) are $20/mo with no data layer. We sit in the gap: GK-specific + AI-powered + no hardware required.

---

## Pricing Recommendation

### Philosophy

> Price to the **value delivered**, not the cost to build. The value anchor is the $100–$200/hr private GK session — our product replaces the need for that or dramatically multiplies its effectiveness.

**Positioning principle:** "Less than a pair of goalkeeper gloves per month."
- Premium youth goalkeeper gloves (Reusch, Uhlsport): $60–$120 per pair
- Our goal: price below $30/mo so it's an obvious yes

---

### Recommended Tier Structure

#### Free Tier (Permanent)
**Price:** $0/month  
**Access:**
- 1 keeper profile
- 1 video upload per month
- Basic radar chart (read-only, last session only)
- No AI match report card

**Purpose:** Drive app store discoverability and word-of-mouth. Free users become paid referrers.  
**Limitation design:** The free tier should feel genuinely useful but clearly incomplete — the moment a coach wants historical tracking or the AI report card, they upgrade.

---

#### Coach Pro (Primary Paid Tier)
**Price:** **$14.99/month** or **$119/year** (~$9.99/mo billed annually, save 33%)  
**Access:**
- Unlimited keeper profiles
- Unlimited video uploads
- AI match report card (within 5 hours of upload)
- Full radar chart with historical trends
- Session notes + milestone badges
- Parent share view

**Pricing rationale:**
- Below Trace ($25–35/mo) and they require hardware
- Above Keeper Club ($20/mo) but we deliver data, not just videos
- Under $15/mo clears most "is it worth it?" mental friction for coaches
- Annual at ~$10/mo is the push to lock in retention

---

#### Club/Academy (Future — Phase 2)
**Price:** **$79/month** (up to 5 coaches) or **$149/month** (unlimited coaches)  
**Access:**
- Everything in Coach Pro
- Club dashboard: see all keepers across all coaches
- Club branding on report cards
- Admin controls, coach management
- Dedicated support

**Purpose:** Turn clubs into distribution. One sale = 3–8 coaches.  
**When to launch:** After 100 individual paying coaches — use club pilots to de-risk the product.

---

### Pricing Psychology Notes

- **Anchor the private session:** "One private GK session costs $100–200. This is $14.99 a month."
- **Use annual pricing as the default:** Show monthly price ($9.99) prominently when offering annual plan. Stripe checkout should default to annual.
- **Trial structure:** Extended free trial until June 30, 2026 for POC phase. After POC, move to 14-day free trial → paywall.
- **Never discount publicly.** Offer extended trials for club partnerships. Never slash the price on the paywall — it signals low value.

---

## Revenue Model Projections

| Coaches | Monthly (mix 70% annual / 30% monthly) | ARR |
|---|---|---|
| 50 | ~$600/mo | ~$7,200 |
| 200 | ~$2,400/mo | ~$28,800 |
| 1,000 | ~$12,000/mo | ~$144,000 |
| 5,000 | ~$60,000/mo | ~$720,000 |

Target at 12 months: **200 paying coaches → ~$29K ARR**

---

## Paywall Trigger

The paywall should be shown when a coach:
1. Tries to view their second AI report card, OR
2. Tries to add a second keeper profile, OR
3. Tries to view historical trends (more than 1 session back)

Never block the first value moment. The first report card should always be free.

---

## Pricing Copy

**Tagline:** "Less than a pair of goalkeeper gloves."

**Monthly CTA:** "Start free — upgrade for $14.99/month anytime."

**Annual CTA:** "Get a full year for $119. That's $9.99/month — less than one private GK session."
