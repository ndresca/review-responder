# Design System — review-responder

## Product Context
- **What this is:** AI-powered tool that automatically responds to Google reviews for restaurants
- **Who it's for:** Solo restaurant owners who want to set it and forget it — not marketing managers
- **Space/industry:** Review management SaaS (competing against Birdeye, Podium, ReviewTrackers)
- **Project type:** Web app — primarily mobile, with a desktop view

## Aesthetic Direction
- **Direction:** Warm Minimal — analog calm made digital
- **Decoration level:** Intentional — subtle warm paper texture on background; no decorative elements otherwise. The warmth does the work.
- **Mood:** A note on the wall that says "all good." Not a dashboard demanding attention. The product promise is invisible automation — the UI confirms things are running, it does not ask anything of the user.
- **Competitive gap:** Every competitor uses corporate gray/blue enterprise dashboards built for marketing agencies. This product is built for the restaurant owner who wants to not think about reviews at all.

## Typography
- **Display/Hero:** Fraunces 300, upright — optical serif with warmth and slight eccentricity. Used exclusively for the status headline ("Your reviews are handled.") and major section headers. Never italic.
- **Body/UI:** Instrument Sans 400/500/600 — clean but not cold. All labels, navigation, body copy, button text, form fields.
- **Data/Timestamps:** DM Mono 400 — for counts, timestamps, review ratings, version strings. Signals "machine working" without feeling technical.
- **Loading:** Google Fonts CDN
  ```
  https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap
  ```
- **Scale:**
  - xs: 11px / DM Mono — micro labels, metadata
  - sm: 12px / Instrument Sans — secondary labels, hints
  - base: 14–15px / Instrument Sans — body, UI copy
  - lg: 18–20px / Instrument Sans 600 — section headings
  - xl: 28–36px / Fraunces 300 — page titles
  - display: 40–56px / Fraunces 300 — status headline

## Color
- **Approach:** Restrained — one accent, one success, one error. Color is rare and meaningful.
- **Background:** `#F5F0E8` — warm parchment. Never pure white. This is the most important single decision: it immediately separates the product from every SaaS competitor.
- **Surface/Card:** `#FDFAF4` — barely lifted from background. Used for cards, inputs, modals.
- **Primary text:** `#1C1410` — warm near-black. Never pure black.
- **Muted text:** `#8C7B6B` — warm gray-brown. Secondary info, timestamps, labels.
- **Accent:** `#B5760A` — warm amber. Links, CTAs, focus rings. Never used for error states — tomato is reserved for that.
- **Success:** `#3D7A5A` — deep basil green. "Running" status, confirmed responses, positive states. Calm, not neon.
- **Error:** `#C8440F` — tomato. Used only for actual problems (auth expired, billing lapsed). Never decorative.
- **Border:** `rgba(28,20,16,0.10)` — transparent warm black.
- **No blue.** Not one pixel anywhere in the product.
- **Dark mode:** Reduce background to `#1A1510`, surface to `#241E18`, text to `#F0EBE0`. Saturations stay; don't wash out to pure grays.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — generous whitespace is a primary design element, not an afterthought
- **Scale:** 2(2px) 4(4px) 8(8px) 16(16px) 24(24px) 32(32px) 48(48px) 64(64px) 96(96px)
- **Max content width:** 560px, centered. This is a deliberate constraint — the product is a note, not a dashboard.

## Layout
- **Approach:** Single Signal — the entire screen organizes around one dominant status statement. Everything else is subordinate.
- **Grid:** Single centered column at 560px max-width. No sidebars. No multi-column grids on the main dashboard.
- **Border radius:** sm(4px) md(8px) lg(12px) full(9999px for badges/pills)
- **Mobile:** Primary surface. Status fills above the fold on mobile. Activity feed scrolls below.

## Motion
- **Approach:** Intentional — motion is used to reinforce the "it's working" feeling, not to entertain
- **Status pulse:** Slow 4s ease-in-out breathing opacity (1.0 → 0.4 → 1.0) on the running status dot. Calm, not urgent.
- **Activity feed:** Stagger-in entrance on list items (150ms delay per item, ease-out, translateY 8px → 0)
- **Transitions:** 150–200ms ease for state changes (hover, focus, active)
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **No loading spinners** on the main status view — the running state should never look uncertain

## Design Risks (deliberate departures from category norms)
1. **No metrics on the main screen.** Every competitor leads with response rate, average rating, trend charts. This product shows: status, and "N responses sent this week." That's it. Power-user analytics live behind a "see history" tap and are never the hero.
2. **Warm parchment background, not white.** Every SaaS product ships `#FFFFFF` or cold near-white. Parchment signals craft, warmth, and analog calm. Immediately distinctive.
3. **Status in plain English.** "Your reviews are handled." — not a green dot, not "Active," not "98% response rate." A full human sentence at display size.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-05 | Fraunces 300 upright (not italic) for display | Italic felt precarious at large sizes; upright is grounded and authoritative |
| 2026-04-05 | Warm amber `#B5760A` as accent, tomato `#C8440F` reserved for error only | Amber never reads as an error state; prevents false alarm visual association |
| 2026-04-05 | Max 560px content width | Product is a status confirmation, not a dashboard — narrow width enforces that |
| 2026-04-05 | No blue anywhere | Every competitor uses blue; parchment + amber + basil green is the differentiation |
| 2026-04-05 | Initial design system created | Created by /design-consultation based on competitive research + product context |
