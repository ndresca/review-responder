# TODOS

## [ ] Request GBP API quota increase from Google

**What:** Submit a Google API quota increase request for the GBP Management API (My Business Reviews API).

**Why:** Default quota is 1,500 requests/day. At 15 locations polling every 15 minutes, you hit the ceiling. Google's approval process takes weeks — waiting until you're blocked means churned customers.

**Pros:** Unblocks growth past 15 locations. Gives runway to scale to 100+ locations without re-architecture.

**Cons:** Requires Google review and approval. Can't guarantee timeline.

**Context:** The auto-post cron job fires every 15 minutes per location (96 calls/location/day). With N locations, daily quota = 96N. At N=15 you hit 1,440 — right at the ceiling. Staggered polling helps (no burst), but doesn't change the daily total. Initiate this request before signing customer 10.

**Depends on:** First paying customers.

---

## [ ] Identify the AI review response tool NU Kitchen (Worcester) is using

**What:** Follow up with NU Kitchen to learn which product or workflow their hire is using to automate Google review responses.

**Why:** NU Kitchen said "it's been working out" — this is your closest known live competitor. You need to know what it is, what it costs, and what the output quality looks like before finalizing positioning.

**Pros:** Competitive intelligence. Know whether you're competing against a product or a custom Zapier workflow. Understand their quality bar.

**Cons:** None — this is a 5-minute follow-up.

**Context:** From customer discovery DM on 04/03: "we recently hired someone who automated our google review responses with AI. That's been working out for us. I'm not sure what product he is using." Andres already asked for the product name — awaiting response. If NU Kitchen doesn't follow up, try a direct search: Birdeye, Podium, Grade.us, Reputation.com all have AI response features. Or it's a custom Make/Zapier + ChatGPT workflow.

**Depends on:** NU Kitchen follow-up.
