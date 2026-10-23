# Step 04f: Final Presentation

**Progress:** Step 13 of 13 — Next: End (or cycle back)
**Reads:** `brand-namer-output/03-validation.md` | **Writes:** `brand-namer-output/04-final.md`

## Purpose

Present the survivors in tiers with an honest account of how thoroughly the session explored.

## Done when

- Tiers 1, 2, and 3 presented with rationale, domains, social handles, and caveats
- Session stats included, with weak areas flagged plainly
- Top 3 recommendation, next steps, and a cycle-back offer
- The user is genuinely satisfied, not "fine"

## Guardrails

- Do not accept "these are fine" passively. Name what was under-explored and offer one more round aimed at it; the best names often come in round two.
- Include Tier 3. The names the user loved that died in validation show what they are drawn to and seed the next round.

---

## Execution

### Tiered presentation

Present the surviving names in a categorized shortlist. The exact format should adapt to what the user has asked for (casual list, formal document, table, etc.), but always include these elements:

#### Tier 1: Available & Clear
Names where: the name itself appears unused in the relevant space, at least one good domain is available, trademark risk is low, and key social handles are available or obtainable.

For each name:
- The name
- Naming category it came from
- 2-3 sentence rationale (why this name works for this brand)
- Available domain(s)
- Social handle availability (which platforms are clear)
- Any notes or caveats

#### Tier 2: Available with Caveats
Names where: the core concept is strong but there are minor issues — e.g., .com is taken but .ai is available, or there's a small company with the name in a different industry.

#### Tier 3: Strong but Likely Unavailable
Names the user loved during ideation that didn't survive validation. Include them as reference points — they reveal what the user is drawn to and can seed further exploration if needed.

### Session Quality Self-Assessment

Include a transparent self-assessment in the final presentation:

```
Session stats:
- Total candidates generated: [N]
- Naming categories attempted: [N] of 11
- Generation approaches used: [short list from 01-candidates.md]
- Structural mix of finalists: [N] found words, [N] compounds, [N] coined, [N] other
- Cross-model sources used: [list or "none"]
```

If any of these metrics are weak (< 60 candidates, < 6 categories, > 80% one structural type, no cross-model), flag it honestly: "This session under-explored [area]. A follow-up session focusing on [specific techniques/categories] would likely produce stronger candidates."

### Closing Recommendations

- Top 3 recommendation with brief justification
- Suggested next steps (trademark attorney consultation, domain registration, social handle reservation)
- Offer to do another round if the user wants to explore further
- If the user expresses lukewarm sentiment ("these are fine," "good enough"), acknowledge it: "I hear you — 'good enough' isn't the goal. We under-explored [specific areas]. Want to do one more round focused on [specific techniques] before closing?"

### Cycle-back

If the De-risk loop has reduced the pool below ~5 strong candidates, or the user isn't excited about survivors, cycle back to Loop 2 with dead names as seeds. See pool recovery in step-04b.

---

## Menu

- **[A]** Another round — cycle back to generation with dead names as seeds
- **[R]** Revise — adjust the brief and re-generate
- **[D]** Done — finalize and save

**My recommendation:** If you're excited about at least 2-3 names in Tier 1, go with [D] and get them to a trademark attorney. If the session stats show under-exploration or you're not feeling it, [A] for another round is almost always worth it — the best names often come in round 2.

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF user expresses lukewarm sentiment: Challenge it, as the guardrail says: "I hear you — 'good enough' isn't the goal. We under-explored [specific areas]. Want to do one more round focused on [specific techniques] before closing?" Then re-display this menu.
IF [A]: Save `04-final.md`, then loop back to generation (step-02a or step-02c) with dead names as seeds.
IF [R]: Save `04-final.md`, then loop back to brief revision (step-01a).
IF [D]: Save `04-final.md` with final frontmatter, mark session complete.
