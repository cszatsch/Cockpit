# Step 04e: Social Handles, Stress Tests & Extended Presence Check

**Progress:** Step 12 of 13 — Next: Final Presentation (step-04f)
**Reads:** `brand-namer-output/03-validation.md` | **Writes:** `brand-namer-output/03-validation.md` (update)

## Purpose

Social handle checks, optional stress tests, and an extended presence check for the finalists.

## Done when

- Social handles checked for the names still clear after competitive, domain and trademark screening
- Pre-Mortem and System 1 / System 2 tests offered
- Extended presence check offered for the top 1-3
- Generate-more checkpoint offered if the pool feels thin

## Guardrails

- Check handles only for names still clear after the competitive, domain and trademark screens. Tiers are assigned in 04f, partly from this check, and handle checks on names already flagged waste the user's time.
- The System 1 test is the user's gut, not yours. An LLM can only do analytical evaluation; the split-second reaction that decides how a name lands in the world belongs to the user.

---

## Execution

### Social handle check (names still clear)

For names still clear after the competitive, domain and trademark checks, do a final check on social media handle availability. This applies only to the strongest candidates — don't waste time checking names that have already been flagged.

Search for handle availability on the platforms most relevant to the brand:
- **Twitter/X** — search `x.com/[name]` or `twitter.com/[name]`
- **Instagram** — search `instagram.com/[name]`
- **LinkedIn** — search for company pages with the name
- **TikTok** — if relevant to the brand's audience

Note for each: available, taken by an inactive/unrelated account, or actively in use. A name with a clean sweep across domain + social handles is significantly more valuable.

### Checkpoint: generate more?

After social handle results, if the final pool feels thin or the user isn't excited about any survivors: "We have [N] names with clean availability across domains and social handles. Want to move to final presentation, or generate one more round?" Same loop-back options. Only run the full validation chain (4a+4b+4d+4e) on new names — check the validation log.

### Optional: Pre-Mortem Stress Test

Before final presentation, consider running a **Pre-Mortem Analysis** (see `references/elicitation-techniques.md`) on the top 3-5 candidates. For each: imagine it's 18 months post-launch and the name has caused problems — what went wrong? This surfaces risks that optimism hides. Offer this to the user: "Want me to stress-test these finalists before presenting?"

### Optional: System 1 / System 2 name testing (user-driven)

This exercise must be driven by the user, not the AI. LLMs can only do analytical evaluation (System 2) — they cannot simulate the pre-cognitive, millisecond-level gut reactions that determine how a name actually lands in the real world. The user's gut is the instrument here.

Offer this to the user for the top 3-5 finalists:

"Before we finalize, I'd like to run a quick two-speed test on your finalists. This is based on Daniel Kahneman's System 1/System 2 framework — most name testing only measures analytical thinking, but real-world name encounters happen in split seconds.

**Round 1 — System 1 (gut recall):** Present all finalist names together as a simple list — no rationale, no context, just the names. Then ask:
- 'Which name did your eye land on first?'
- 'Which one made you flinch or feel resistance?'
- 'Which one are you most curious about?'
- 'Which one feels forgettable?'
The user already had gut reactions when they saw the list — these questions surface those reactions before analytical thinking overwrites them.

**Round 2 — System 2 (analytical, take your time):** Now go back through the same names one at a time and evaluate them deliberately: what does this name communicate? What story does it tell? What are its strengths and weaknesses?

**Then we compare:** If a name scores well analytically but triggered a negative gut reaction, the gut usually wins in the real world — customers won't stop to analyze your name, they'll just react. If a name triggered a positive gut reaction but has analytical weaknesses, that's worth investigating — the emotional pull might outweigh the logical objections. The strongest finalists are names where both systems agree."

Record the results in `03-validation.md`. Divergence between System 1 and System 2 scores is a meaningful signal — flag it in the final presentation.

### Extended presence check (offer on final 1-3 only)

For the top 1-3 finalists, offer to check broader digital presence:
- **App stores:** Apple App Store, Google Play — is the name taken by an existing app?
- **Search results:** Google "[name]" — how crowded are the results? Would this brand struggle to rank?
- **Business registries:** Is there an LLC or corporation with this name in the user's target state/country?

"Want me to do a deeper digital presence check on your top picks before we finalize?"

---

## Menu

- **[P]** Pre-Mortem — stress test top 3-5 candidates
- **[T]** Two-Speed Test — System 1/System 2 evaluation
- **[X]** Extended check — deeper digital presence on top 1-3
- **[G]** Generate more — one more round if pool is thin
- **[C]** Continue — proceed to Final Presentation (Step 13 of 13)

**My recommendation:** If you have strong finalists you're excited about, run [P] Pre-Mortem to catch hidden risks, then [T] Two-Speed Test to validate gut alignment. These optional tests take 5-10 minutes and frequently change the final ranking. If the pool feels thin or uninspiring, use [G] first.

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [P]: Run Pre-Mortem on top 3-5, record results in `03-validation.md`, then re-display this menu.
IF [T]: Run System 1/System 2 test (user-driven), record results in `03-validation.md`, then re-display this menu.
IF [X]: Run extended presence check on top 1-3, record results in `03-validation.md`, then re-display this menu.
IF [G]: Write `return_to: "04e menu"` in `01-candidates.md` frontmatter, then read fully and follow `steps/step-02c-riffing.md` (or `steps/step-02a-generation.md` for fresh generation). Its continue handler brings you back here; run 4a, 4b, 4d and 4e on the new names only, then re-display this menu.
IF [C]: Update `03-validation.md` frontmatter `stepsCompleted`, load next step (`steps/step-04f-final.md`).
