import type { ContactChannel } from './types'

// Drop incomplete channels — rows where label, value, or when_to_use is
// empty (or whitespace-only) after trim. The ContactChannelsForm component
// lets owners mid-edit a partially typed row, but the server validator
// (src/app/api/settings/save/route.ts) rejects any row missing
// label / value / when_to_use. Pre-filter on the client before POST so a
// half-typed row doesn't 400 the entire save.
//
// Both onboarding/page.tsx (handleStep2Continue) and settings/page.tsx
// (handleSave) call this — keep behavior symmetrical so a row that
// passes through onboarding will also pass through settings, and vice
// versa.
export function filterCompleteChannels(channels: ContactChannel[]): ContactChannel[] {
  return channels.filter(
    (c) => c.label.trim().length > 0 && c.value.trim().length > 0 && c.when_to_use.trim().length > 0,
  )
}
