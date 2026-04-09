# Changelog

All notable changes to Autoplier will be documented in this file.

## [0.1.0.0] - 2026-04-06

### Added
- Landing page with hero, how-it-works steps, testimonials, and pricing section
- Onboarding wizard: 4-step flow for Google connect, brand voice, calibration, and digest preferences
- Dashboard with status hero, activity feed with stagger-in animations, and auto-reply toggle
- Settings page with location config, brand voice preview, notification toggles, and danger zone
- Global design tokens (CSS custom properties) matching DESIGN.md: Fraunces, Instrument Sans, DM Mono typography, warm parchment palette, 560px max-width
- Dark mode support via `prefers-color-scheme` media query
- Reduced motion support via `prefers-reduced-motion` media query

### Fixed
- Clamped star rating component to prevent crash on out-of-range values
- Moved calibration loading timers into useEffect with cleanup to prevent memory leaks
- Removed `window.matchMedia` from render path to avoid SSR hydration issues
- Fixed dragover CSS class persisting after file drop
