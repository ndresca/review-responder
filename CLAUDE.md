# autoplier

AI-powered review response tool for restaurants. Google-first MVP.

## Commands

```bash
npm run dev        # Next.js dev server
npm run build      # production build
npm test           # Vitest unit tests (run once)
npm run test:watch # Vitest watch mode
```

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/google/route.ts           # GET — initiates Google OAuth, sets state cookie
│   │   ├── auth/google/callback/route.ts  # GET — exchanges code, creates locations + brand_voices
│   │   ├── cron/route.ts                  # GET /api/cron — Vercel cron handler
│   │   ├── stripe/checkout/route.ts       # POST — creates Stripe checkout session
│   │   └── stripe/webhook/route.ts        # POST — handles Stripe webhook events
│   ├── dashboard/page.tsx            # Dashboard — status hero, activity feed, auto-reply toggle
│   ├── onboarding/page.tsx           # Onboarding — 5-step wizard (connect, voice, calibrate, digest, payment)
│   ├── settings/page.tsx             # Settings — location, brand voice, notifications, danger zone
│   ├── globals.css                   # Global design tokens from DESIGN.md
│   ├── layout.tsx                    # Root layout with Google Fonts
│   └── page.tsx                      # Landing page — hero, steps, testimonials, pricing
├── lib/
│   ├── crypto.ts              # AES-256-GCM encrypt/decrypt (OAUTH_ENCRYPTION_KEY)
│   ├── crypto.test.ts         # 7 unit tests for crypto
│   ├── gbp-client.ts          # Google Business Profile API wrapper
│   └── types.ts               # Shared types: BrandVoice, Review, CalibrationExample
├── prompts/
│   ├── calibration.ts         # Prompt builder for onboarding calibration
│   ├── generate-response.ts   # Prompt builder for review response generation
│   └── quality-check.ts       # Prompt builder + QualityCheckResult type
└── services/
    └── auto-post.ts           # Core auto-post loop — processLocation()
supabase/
└── schema.sql                 # Postgres schema with RLS (run via supabase db push)
vercel.json                    # Cron schedule: /api/cron every 15 minutes
```

## Environment variables

See `.env.example`. Required for cron jobs: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OAUTH_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`. OAuth flow also needs `GOOGLE_REDIRECT_URI`. Stripe integration requires `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET`.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
