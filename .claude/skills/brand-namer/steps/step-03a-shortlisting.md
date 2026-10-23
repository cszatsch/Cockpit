# Step 03a: Convergent Shortlisting

**Progress:** Step 7 of 13 — Next: Competitive Screening (step-04a)
**Reads:** `brand-namer-output/01-candidates.md` | **Writes:** `brand-namer-output/02-shortlist.md`

## Purpose

User-driven convergence, with a gate on the way in and a gate on the way out.

## Done when

- Entry gate status displayed before shortlisting begins
- The user chose what to keep; a preference profile built from their keep/cut patterns
- Definitions and etymology provided for the top 5-10 picks where they add value
- The shortlist written in the deliverable shape below: a ranked top five with case and risk, every name defined, variants collapsed, a scorecard and a pre-mortem
- The brief type's evaluations shown per name, not claimed
- Exit gate status displayed before validation
- Riffing checklist satisfied or explicitly waived
- 15+ names entering validation, or the user waived the shortlist-size gate

## Guardrails

- Show both gate checks. The user should know pool quality before shortlisting and again before validation, because validation kills 80-90% of found words and a thin shortlist produces a thin result.
- Load `references/naming-techniques.md` for the riffing checklist if it is not already in context.

---

## Phase 1: Entry Checkpoint (Loop 2 → Loop 3 Transition)

### Hard gate checks

Before presenting the entry menu, run the three hard gate checks by reading `01-candidates.md` frontmatter:

1. **Candidate count gate:** If < 60 candidates (< 40 when `session_mode` is Focused), warn: "We have [N] candidates — below the [60/40] minimum for a strong shortlist." Recommend [G] or [X] before [S].
2. **Category coverage gate:** Display the coverage table. If < 6 categories attempted, recommend trying missing categories.
3. **Structural diversity gate:** If > 80% of candidates are one type (found words, compounds, or coined), flag it and recommend generating alternatives.

### Status summary and menu

Display the full status summary, then present the menu:

"**Status:** [N] unique candidates across [M] categories.
**Category coverage:** [N] of 11 attempted. Not yet tried: [list].
**Structural mix:** [N]% found words, [N]% compounds, [N]% coined/other.
**Approaches tried:** [from frontmatter]. **Worth trying:** [one or two that fit the gaps].

**[G]** Generate more — fresh round in specific directions, an untried category, or one of the approaches above
**[X]** Cross-pollinate — a round from another model, run through Codex or pasted from another LLM
**[R]** Riff more — apply riffing or deepening techniques to favorites before converging
**[S]** Start shortlisting — review all candidates, pick favorites for validation
**[O]** Other — tell me what you need

**My recommendation:** [Always include a specific recommendation with rationale. If any hard gate is failing, recommend addressing it before [S]. For example: "I'd hold off on shortlisting — your pool is 85% found words with only 3 categories attempted. I recommend [G] to try Coined/Invented and Sound-Symbolic, then [R] for SCAMPER and language shift. That gives us structural diversity before the validation bloodbath."]"

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [G]: Write `return_to: "03a entry menu"` in `01-candidates.md` frontmatter, then read fully and follow `steps/step-02a-generation.md` for a fresh generation round in user-specified directions. Its [S] handler brings you back here.
IF [X]: Write `return_to: "03a entry menu"` in `01-candidates.md` frontmatter, then read fully and follow `steps/step-02b-cross-pollination.md` for one round (Codex when installed, otherwise a paste-in prompt). Its [C] handler brings you back here.
IF [R]: Write `return_to: "03a entry menu"` in `01-candidates.md` frontmatter, then read fully and follow `steps/step-02c-riffing.md` to apply the specified riffing or deepening techniques. Its [C] handler brings you back here.
IF [S]: Proceed to Phase 2 (Shortlisting Process) below.
IF [O]: Address the user's request, then re-display this menu.

---

## Phase 2: Shortlisting Process

### User-directed shortlisting

The user decides how many rounds of ideation they want. Your role:

- When the user reacts to names ("I like these, not those"), generate more in the directions they prefer
- When they say "these feel too corporate," pivot toward warmer/friendlier categories
- When they narrow to a set of favorites, confirm: "Ready to move into validation, or want another round?"
- Respect the user's timeline. If they want to go fast, move to validation with a larger shortlist. If they want to explore, keep generating.

### Definitions check during shortlisting

For the user's **top 5-10 picks** — especially obscure words, foreign-roots, or words with non-obvious secondary meanings — include the dictionary definition and etymology. Don't auto-define common words the user obviously knows (Gauge, Relay, Grade). Focus definitions where they add genuine value: revealing etymology that enriches the brand story, surfacing secondary meanings the user might not know, or confirming a foreign word means what they think it means. This serves as a reality check — the user should know exactly what the word means before committing to it.

Format:
```
**Assay** (n./v.) — "to test the quality of a metal or ore; to evaluate or examine"
  Etymology: Old French "essai" (trial, attempt), from Latin "exagium" (weighing)
  As a brand: "Every deal undergoes the assay — a test of quality"
```

This also reveals hidden meanings, alternate definitions, and etymological connections that enrich the brand story.

### Batch elimination (for large pools)

When the candidate pool is large (30+ favorites remaining after gallery reactions), offer batch elimination as a rapid convergence technique. Present remaining candidates in numbered batches of 10 and ask the user to make quick keep/cut decisions for each batch:

"Here are candidates 1–10. Which do you want to keep?"

This approach prevents decision fatigue from seeing the full pool at once, generates clear preference signal quickly (the user's cut patterns reveal taste), and works well as a complement to the H/W/C gallery reactions from step-02a. Session testing showed this was the fastest convergence moment — the user suggested it naturally and cut from 30 to 15 in three quick passes.

After batch elimination, compile the Keeps into the working shortlist. If the pool is thin (<8), offer a second pass on the cuts to rescue any the user regrets dropping.

### Deepening and evaluation techniques — offer the menu

Before the exit checkpoint, offer the user the deepening and evaluation techniques available so they choose what is relevant rather than you pre-selecting:

"Before we move into validation, here are the techniques available. Choose any that interest you, or skip straight to validation:

- **Riffing:** SCAMPER, synonym explosion, affix exploration, creative respelling, industry-native compound patterns, language shift, compound creation, classical stem engineering, conceptual blending
- **Deepening:** SCAMPER on the brief itself, Inversion, Constraint Removal, Six Thinking Hats, Red Team vs Blue Team, First Principles, Analogical Reasoning, TRIZ, Three-Team Method, Pre-Mortem
- **Evaluation:** Semantic Differential Scaling, Morphological Productivity, Brand Architecture test, Speech & Channel Robustness

**My recommendation:** [Name one or two, grounded in this shortlist: a deepening move when the user's picks cluster in one register (Inversion, Constraint Removal), a riffing move when a favorite root has only one form (synonym explosion, language shift), an evaluation when the shortlist is heading to a committee or a product family (Semantic Differential Scaling, Brand Architecture). If the shortlist already carries the brief type's evaluations below and the user's picks are varied, say so and recommend moving on.]

Which would you like to try?"

If the user asks about any technique, explain it briefly. The full library is in `references/elicitation-techniques.md`, `references/naming-techniques.md`, and `references/consumer-naming.md` or `references/enterprise-naming.md` depending on brief type.

### Evaluations that appear in the shortlist, by brief type

Run these on every shortlist and show the result per name. The menu above is for the user's extra picks; these are not optional. In blind testing, the shortlists that carried them were judged markedly more usable, and the names they killed were the right kills. A test listed as applied with no per-name output gives the user nothing to decide from.

**Consumer, fashion, food, and beauty briefs:**
- **Shelf Test, Gift Test, and Social-native tests** (hashtag clean, handle plausible, caption-ready) on every shortlisted name, as a table with a one-word verdict per test (`references/consumer-naming.md`)
- **Price-Signal Calibration:** does each name's register match the brief's price tier
- **Trend-Cycle Audit** on the top ten: which names will date, and why
- **Badgeability** for anything worn or carried: would the customer put it on a hat, a tote, a bottle

**B2B and enterprise briefs:**

**Stack Test** (for briefs with named competitors or partners):
```
Stack Test — does [name] look peer-level alongside the customer's existing tools?
| Shortlisted Name | Stack Context | Verdict |
|---|---|---|
| Weft | Weft + Snowflake + Databricks + Salesforce | Peer-level ✓ |
| Meshworks | Meshworks + AWS + SAP + Workato | Slightly long but credible ✓ |
```

**Sales Conversation Fit:**
Test each shortlisted name in at least 3 of these templates and show the results:
- "Have you heard of [X]?"
- "We just switched to [X] for our [use case]."
- "Let me show you what [X] can do."
- "[X] integrates with your existing stack."

**Buyer Committee scoring:**
Show explicit per-name scoring across roles (Champion, CFO, Technical Evaluator, End User).

**Acronym Resilience:**
For each shortlisted name, show what acronym/abbreviation people will naturally use and whether it conflicts:
```
| Name | Natural shortening | Conflict? |
|---|---|---|
| Caliber | Cal | Clean ✓ |
| Steelthread | ST | May conflict with internal abbreviation |
```

**Enterprise Objection Preemption:**
Test each shortlisted name: "Would a Fortune 500 CISO approve this vendor name? Would a VP put this on their LinkedIn?" Show pass/fail per name.

**Name Lifecycle Stress Test:**
For top 5-10 shortlisted names, test: "What if the company expands beyond [current product]? Does the name still work?" Show results.

**Internal-Champion Forwardability:**
Test: "Can an internal champion easily explain and forward this name via email/Slack?" Show which names are easy vs. hard to forward.

### Multi-perspective evaluation

For high-stakes naming decisions, consider evaluating the shortlist from multiple distinct perspectives simultaneously — not just sequentially through techniques. Frame it as: "Let me look at your top candidates through three lenses at once: the strategist (does this name position you correctly?), the creative (does this name have narrative energy?), and the analyst (does this name have practical risks?)." This cross-pollination often surfaces insights that no single technique catches alone.

### The shortlist deliverable

The shortlist is what the client takes away from ideation, and in blind testing the shape of this document moved the verdict more than the names in it. Write `02-shortlist.md` in this shape:

1. **Top five, ranked.** Each gets a two-line case: what the name means or where it comes from, why it fits this brief, and the one risk the user should know before falling for it.
2. **The rest of the shortlist**, usually 10 to 15 more names. Each carries a one-line definition or etymology (for any word that is not everyday vocabulary), a one-line reason it is here, and its risk or conflict flag. Group by direction if that helps the read, but every name has its own lines.
3. **Variants collapsed.** A root and its ownability variants (Pyx and Pyxhall, Tieline and Tiepoint) are one entry with the alternates noted beside it, not separate slots. The shortlist counts directions the user could choose, not spellings.
4. **A scorecard on the top ten:** SMILE/SCRATCH from `references/brand-psychology.md` as a compact table, alongside the brief type's evaluations above.
5. **A pre-mortem on the top five:** one line each on how the name could have failed eighteen months after launch (`references/elicitation-techniques.md`).
6. **Frontmatter:** the shortlisted names, the preference profile from the user's keep/cut patterns, the riffing checklist status, and session metadata.

Nothing here is a new technique. It is the definitions check, the evaluations, and the pre-mortem gathered into one document the user can decide from.

### Transition trigger

The user has a shortlist of 15 to 20 directions they want validated. Confirm the list, write `02-shortlist.md` in the shape above, then proceed to Phase 3.

---

## Phase 3: Exit Checkpoint (Loop 3 → Loop 4 Transition)

### Hard gate checks

Before presenting the exit menu, run the three hard gate checks:

1. **Shortlist size gate:** If fewer than **15 names** are entering validation, warn: "Your shortlist has [N] names. With an 80-90% kill rate for found words, you'll likely end up with [1-3] survivors. I recommend expanding to 15-20 before validating." Recommend [A], [K], or [G].
2. **Structural diversity gate:** Count roots, one per direction with alternates excluded, since the alternates are the insurance this gate measures the need for. If more than 80% of roots are found words (or any single type), flag it: "Your shortlist is [N]% found words. Compound or coined alternates for each found-word root are the insurance." Recommend [K], whose alternates item is that insurance.
3. **Riffing checklist gate:** Check whether the riffing checklist (below) has been satisfied. If not, recommend [K] before [C].

The checklist is the one home for compound and coined alternates. An earlier menu offered them as a separate option beside the checklist, and for B2B briefs the two did the same work, so sessions ran it twice.

### Status summary and menu

Display the full status summary, then present the menu:

"**Shortlist:** [N] names selected. **Structural mix:** [N]% found words, [N]% compounds, [N]% coined/other.
**Riffing checklist:** [items done / items remaining].

**[A]** Apply more riffing techniques to the shortlist — [name the specific moves not yet made]
**[K]** Run the riffing checklist — close the gaps shown above, including compound or coined alternates for each found-word root, then proceed to validation
**[G]** Go back — generate more candidates first
**[C]** Continue — take the shortlist into Competitive Screening (Step 8 of 13)

**My recommendation:** [Always include a specific recommendation. If any gate is failing, recommend addressing it and say why. Do not recommend [C] when the shortlist is <15 names or >80% found words; those conditions reliably produce a thin, disappointing final pool.]"

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [A]: Apply the specified riffing techniques to the shortlist names, update `02-shortlist.md`, then re-display this exit checkpoint menu with updated gate status.
IF [K]: Display the riffing checklist (below) with current status and work through the uncompleted items. Record the alternates beside their root in `02-shortlist.md` (variants stay collapsed into the root's entry) and add them to `01-candidates.md`. Then re-display this exit checkpoint menu with updated gate status.
IF [G]: Write `return_to: "03a Phase 3 exit menu"` in `01-candidates.md` frontmatter, then read fully and follow `steps/step-02a-generation.md`. Its [S] handler brings you back here; re-run the Phase 1 gate checks on the enlarged pool before re-displaying this menu.
IF [C]: Proceed if the riffing checklist is satisfied or the user has waived it. If gaps remain, display the checklist status and ask once: "The riffing checklist has gaps. Proceed anyway? This will likely leave a thin final pool." If the user confirms, record `riffing_checklist: { status: waived, notes: "<what was skipped>" }` in `02-shortlist.md` and proceed. Route to: `steps/step-04a-screening.md`

### Riffing checklist (before entering Loop 4)

**In deep sessions (default):** complete this checklist, or get the user's explicit waiver, before entering validation. Display it with the status of each item. It exists because found words die in validation at 80-90%, and a shortlist that enters validation without alternatives for each direction comes out nearly empty.

**In quick sessions:** the checklist is skippable, but warn the user once: "Found words have an 80-90% validation kill rate without compound alternatives. Want to riff first, or go straight to validation?" Then respect their choice.

**Core checklist (deep sessions, applied to each direction):**

Before running, check `approaches_tried` and the technique labels on riffs in `01-candidates.md`. Display the checklist with current status:

```
Riffing checklist status:
- [x] SCAMPER — applied during 2c
- [ ] Compound alternates — NOT YET DONE
- [ ] Creative respelling — NOT YET DONE
- [x] Tech branding patterns — applied during 2c

2 of 4 core techniques applied. Recommend completing before validation.
Proceed anyway? (This will likely result in a thin final pool.)
```

If ALL core techniques for the relevant brief type have been applied, note: "Riffing checklist: all core techniques applied. Proceeding to validation." If gaps remain, **surface the gaps explicitly and recommend completing them.** Only proceed without completing if the user explicitly says to skip.

**For B2B/enterprise/tech briefs — core checklist:**
- [ ] **SCAMPER** — Substitute, Combine, Adapt, Modify, Eliminate, Reverse. Apply the full framework systematically to your top 3-5 shortlisted names — don't skip this even when the technique count is already high. SCAMPER catches transformations that other riffing techniques miss because it forces you through all 7 operations rather than letting you gravitate toward your preferred 2-3.
- [ ] **Compound alternates** — three to five compound or coined alternates for each found-word root on the shortlist, chosen for quality rather than filled to a quota. The earlier rule, five compounds for every root, added 163 mechanical names (Nomgrid, Pedfield) to one cybersecurity pool at the last step before validation, none of which the user would choose and all of which were noise in Loop 4. Roots that are already compounds or coined need no alternates.
- [ ] **Creative respelling** — Y-for-I, K-for-C, dropped vowels tested on each root; keep only the spellings that read as a brand rather than a typo
- [ ] **Industry-native compound patterns** — generate 8-12 compound elements (suffixes, prefixes, structural patterns) native to the brief's specific industry, then cross the shortlist's found-word roots with them and keep the credible results; this is where the compound alternates above usually come from. For tech/SaaS this might be -works, -craft, -OS, -ware, -kit, -base. For finance it might be Capital, Partners, Group, Advisors. For healthcare it might be Health, Therapeutics, Sciences, Bio. For legal it might be Counsel-adjacent governance vocabulary. The point is NOT to apply a fixed list — it's to identify what compound structures are credible and natural in this specific vertical, then systematically test your roots against them. See `references/naming-techniques.md` for tech/SaaS examples and the dynamic generation process in SKILL.md step-02a. Adapt or skip if the user has explicitly rejected compound patterns for their brief — note the adaptation in the checklist status.

The B2B goal: for every found word on the shortlist, three to five compound or coined alternates you would be willing to show the user as names in their own right. When the found word dies in validation (and it probably will), the alternates are already in the pipeline.

**For consumer/fashion/lifestyle briefs — core checklist:**
Session testing shows the B2B riffing toolkit (compounds, affixes, tech patterns) produces the wrong kind of names for consumer brands and has very low hit rates (~8%). Replace with consumer-appropriate techniques:
- [ ] **Adjacent metaphor** — each shortlisted direction explored via neighboring metaphorical domains (e.g., "collector" -> which animals collect? which natural processes gather?)
- [ ] **Sensory expansion** — Five Senses Scan applied to shortlisted directions not yet explored sensorially
- [ ] **Nature mining** — creatures, plants, natural phenomena, geological features explored for each direction
- [ ] **French naturalized vocabulary** — naturalized French words tested across shortlisted directions (see `references/consumer-naming.md`). Skip this item, and say so in the checklist status, when the user has rejected French or foreign-root names earlier in the session, or when the brief's register makes them wrong (a streetwear label, a hot sauce with Oregon terroir at its center); it then produces names nobody will choose.
- [ ] **Shelf / Gift / Social-native tests** — run on all shortlisted names: Shelf Test (visualize between competitors on a physical shelf), Gift Test (would someone feel proud giving this?), Social-Native Test (hashtag clean? handle available? caption-ready? verbal sharing test?). These are evaluation tests, not generation techniques — but they must be completed before entering validation because they frequently kill names that look good on paper. If the brief mentions retail placement, DTC, or social media, these tests are non-negotiable.

The consumer goal: for every shortlisted direction, 3-5 alternatives from adjacent metaphorical or sensory territory. Consumer names survive validation through distinctiveness and cultural resonance, not through compound construction.

What this checklist adds beyond step 02c: 02c riffed the directions the user chose at the time; the shortlist usually contains directions that were never riffed, and others whose riffs the user cut. Run the checklist on shortlisted directions with fewer than three surviving alternates, and record "covered in 02c" against the rest instead of riffing them again. In testing, re-riffing already-riffed directions produced near-duplicates of the 02c output and nothing the user picked.

**Extended checklist (offer to the user — "Want me to go deeper with additional techniques?"):**
- [ ] **Synonym explosion** — 5-10 synonyms tested for each key root
- [ ] **Systematic affix exploration** — each root run through the full prefix AND suffix library (B2B only)
- [ ] **Language shift** — core concept translated into Latin, Greek, French at minimum
- [ ] **Cross-model ideation** — if not already done, get names from other LLMs (especially productive for consumer briefs)

### Cycle-back

If the user wants more candidates after reviewing the shortlist, loop back to step-02a. Generate in the directions they've indicated preference for, then return to the Phase 1 entry checkpoint of this file.

---

## Menu

This step has three menus (Phase 1 Entry Checkpoint, Phase 2 Technique Menu, and Phase 3 Exit Checkpoint), each defined inline above. Only [C] on the Phase 3 Exit Checkpoint, with the riffing checklist satisfied or waived, routes to the next step.

Wait for the user's selection at each menu before proceeding.

IF user provides non-menu input: Respond, then bring them back to the current phase's menu (see workflow.md).
IF Phase 3 [C] with riffing checklist satisfied or waived: Update `02-shortlist.md` frontmatter `stepsCompleted`, then read fully and follow: `steps/step-04a-screening.md`
