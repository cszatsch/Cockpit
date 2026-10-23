# Step 02a: Divergent Generation

**Progress:** Step 4 of 13 — Next: Cross-Pollination (step-02b)
**Reads:** `brand-namer-output/00-brief.md` | **Writes:** `brand-namer-output/01-candidates.md` (created here)

## Purpose

Fill the possibility space. Generate broadly across naming categories and structural types so that validation has something left to kill.

## Done when

- 60+ unique candidates (40+ when `session_mode` is Focused)
- 6+ of the 11 naming categories attempted, with at least 5 candidates each
- 3+ structural types represented (found words, compounds, coined, blends, respellings, foreign-root)
- For B2B briefs, compounds and coined names make up at least 30% of the pool
- The brief type's must-run moves each run as a labeled pass

## Guardrails

- Run the hard gate check before presenting the menu, so the user sees pool health before deciding whether to move on.

---

## Execution

Read `references/naming-categories.md`, `references/brand-psychology.md`, and the brief type's file now: `references/consumer-naming.md` for consumer, fashion, food, and beauty briefs, or `references/enterprise-naming.md` for B2B, enterprise, and developer tools. The must-run moves below come from the brief type's file, and you run them in this step.

Use the brand archetype, personality dimensions, and feeling spectrum from the psychology reference to ensure names don't just sound good but *feel right* for the brand's emotional territory.

### Running count

Let the user decide when they have enough. Some sessions need 40 names, others need 150. Above the gates, the user decides when there are enough; keep generating with breadth and quality for as long as they want more. Include a candidate count only when the user needs orientation (e.g., after a large round or when asked) — don't report after every batch.

**Focused Mode:** Present category-by-category as generated. Still aim for breadth — at least 50 candidates internally across all categories before the user starts cutting.

### Tree of Thought: three independent teams

One model generating "three branches" is still one mind with one set of habits; the branches share vocabulary and drift toward the same neighborhood. Genuine divergence needs genuinely separate contexts. In a deep or focused session, when you can spawn subagents, run the first generation round as **three isolated teams working the same brief**, following Lexicon Branding's three-team method:

| Team | Stance | Why it widens the space |
|---|---|---|
| **On-brief** | Name this brand as its best self | The straightforward read of the brief |
| **Adjacent category** | Name this as a brand in a more desirable neighboring category (spirits for a sauce, fragrance for skincare, outdoor gear for apparel, a design studio for a dev tool), then keep every name whose codes transfer | Borrows the vocabulary of a category with richer naming culture |
| **Far-off domain** | Name this as if it were three unrelated products in turn (a perfume house, a climbing-gear company, a jazz label; pick frames far from the brief), then keep every name whose energy transfers | Produces the unexpected names, and the least overlap with the other teams |

Distance is what buys divergence. In testing on a consumer brief, a "name a rival" team reproduced about a quarter of the on-brief team's names, while the far-off-domain team shared almost none with either. The rival stance was then tried as the B2B alternative and did worse: on a cybersecurity brief it shared 42% of its names with the on-brief team, because a challenger "breaking the category's conventions" still names from inside the category, and from the same territories. So B2B briefs use the same three stances as consumer briefs. Choose the adjacent category for its richer naming culture: a design studio or an instrument maker for a developer tool, a scientific publisher for a data product, a private bank for a fintech, an architecture practice for an infrastructure platform. When the brief's category has no neighbor with a richer naming culture than its own, run a **second far-off team** instead, with three frames unlike the first team's. Give the adjacent and far-off teams the territories as orientation rather than as a constraint, since a team handed the on-brief team's semantic fields tends back toward them.

Spawn all three in one turn and **wait for them in the foreground** (the Agent tool with `run_in_background: false`, default model, `effort: "high"`). Nothing useful can happen until all three return, and a session that spawns them in the background and ends its turn can mistake that pause for the end of the session. Each team reads the reference files itself and returns a table. Give each the same brief with only the stance line changed:

```
You are one of three independent naming teams working the same brief. You cannot
see the other teams' work, and that independence is the point: do not guess at or
avoid what they might produce.

YOUR STANCE: [On-brief | Adjacent category: name this as a <neighboring category>
brand | Far-off domain: name this as if it were a <frame 1>, then a <frame 2>, then a
<frame 3>]. [One sentence on what to keep, from the table.]

THE BRIEF: [body of 00-brief.md: naming target, one-liner, audience, personality,
archetype, feeling spectrum, seed words, constraints, competitors]
TERRITORIES: [each with its emotional promise and semantic field; for the adjacent and
far-off stances add: "these orient you; name from your stance's own vocabulary"]
BRIEF TYPE: [consumer: no institutional -works/-craft/-wise/-ware compounds; include a
Sensory section from a Five Senses Scan (sight, smell, touch, taste, sound) |
B2B: for every found word also give 2-3 compound or coined variants, each as its own
row with Category "Compound" or "Coined" and Approach "variant of <root>"]

First read these two files completely, and use their categories, techniques,
phonesthetics, and anti-patterns:
  <skill directory>/references/naming-categories.md
  <skill directory>/references/[consumer-naming.md | enterprise-naming.md]

Generate 40-60 candidate names:
- at least 6 of the 11 categories, at least 5 names in each
- spread across all the territories
- at least 3 structural types (found word, compound, coined, blend, respelling,
  foreign-root)
- do not self-censor; include names that feel weird, risky, or too much
- avoid the anti-patterns in the reference (verb+ly, tech prefix+suffix, forced
  mythology, Latin pharma mashups, the -a suffix)
- flag conflicts you are confident of with "⚠️ <the company or product>" and ones you
  half-remember with "⚠️? <what you recall>"; a flag with no conflict named is noise,
  so give a reason or no flag, and never invent a conflict
- do not include any of these existing candidates: [list, or "none yet"]

Return only a markdown table, one row per name:
| Name | Category | Territory | Approach (technique or vocabulary mined) | Rationale (12 words max) | Flag |
Category is exactly one of: Evocative, Coined, Blend, Metaphorical, Descriptive,
Found Word, Foreign-Root, Acronymic, Compound, Sound-Symbolic, Institutional
Compound. Angles such as personified, toponym, phrase, numeric, or sensory belong
in the Approach column, not in Category.
Finish with one line: "Richest vein: <the domain or category that gave the most
distinct on-brief names>".
```

When the teams return:

1. **Merge and deduplicate.** Record each name's `source` (team-onbrief, team-adjacent, team-faroff, team-faroff-2). A name two or three teams produced independently is a convergence signal: it is probably strong and probably obvious, so flag it as such rather than dropping the duplicates silently. Expect roughly 150 unique names from three teams of 50-60.
2. **Compare the veins.** The three "Richest vein" lines tell you which semantic domains are productive for this brief. Note them for the user and for later rounds.
3. **Run the must-run moves yourself.** The team prompt does not ask for them, so the main session owns the brief type's must-run moves (below). Before each one, look at the teams' Approach columns: a move a team already ran as a labeled pass counts as done and is not repeated. The rest run in context as their own labeled batches, with the merged pool as the exclusion list, before the gallery is built, so the gallery shows them as rows of their own.
4. **Present through the gallery** exactly as below. The user still sees everything, in numbered batches, and reacts by category.
5. **Translate Hot rows into directions, then run the second wave.** Gallery rows are presentation units; the second wave is aimed at directions. Group the Hot rows that share a vein (a found-word row and the compound row built on the same vocabulary are one direction), give each direction a name, and list the names already in it. Six Hot rows usually become three or four directions. Then spawn one targeted agent per direction, in the foreground as before: the same brief and reference files as the first round, the far-off stance, a paragraph that names the direction and lists the names already in it as the vein to extend, the whole pool from `01-candidates.md` as the exclusion list (a direction-only list let 9% of wave-2 names come back as duplicates of names elsewhere in the pool), and a request for 20-30 new names in the same table format as the first round with the Territory column holding the direction's name. Record each returned name's `source` as `wave2-<direction>`. Fresh contexts aimed at a direction the user has already chosen are where sessions find the name they end up with. Expand in context only when a direction has fewer than ten names and a handful more will do.

**Fallback, when you cannot spawn subagents:** branch in context. For each category, generate three mini-batches of 3-5 names from deliberately different semantic domains (for Found Words: textile vocabulary, then geological, then governance), judge which opened new territory, expand the one or two strongest by 5-10 names, and present everything from the surviving branches. A flat list of 10 names in a category means you explored one neighborhood and stopped.

**Cost, so you can say it to the user before spawning:** each team reads about 1,400 lines of reference and thinks at high effort, so a team runs to roughly 125,000 tokens and five minutes, and the three run in parallel. That one round costs about as much as an entire in-context session through shortlisting did before this method existed. A deep session is a do-once, do-it-right engagement, so full depth is the default: three teams at high effort, and the second wave below for every Hot direction. Economize only if the user asks to, and then by lowering effort to medium rather than dropping a team, since the far-off team is where the divergence comes from.

**Quick mode:** skip branching and generate a single strong batch per category.

### Rules for this stage

- **Attempt at least 6 of the 11 naming categories** in the reference file. Present at least 4 that produced viable results. Note which categories you attempted and found unproductive: "I tried Acronymic and Sound-Symbolic but neither produced strong fits for this brief." If the user says early on "skip [category]" or "I don't want [style]," respect that — remove it from the attempt list and don't count it toward the minimum. The user can permanently disable categories they know they don't want.
- Generate a **minimum of 5 names per category** you use internally. Present ALL candidates to the user — do not select "the strongest" for a curated presentation. The user sees the full pool and decides what to cut (see Philosophy #3).
- **Do not self-censor.** Include names that feel weird, risky, or "too much." The user will filter. Your job is to fill the possibility space.
- **Flag conflicts inline** with a warning emoji during generation. Don't wait for the competitive screen stage.
- Use the **phonesthetic framework** from the reference file to ensure variety in how names sound, not just what they mean.
- Explicitly explore the **Motion & Direction semantic field** (see `references/naming-categories.md`) — names that convey movement, direction, or momentum are often overlooked but effective.
- Consider **Personified Names** (see `references/naming-categories.md`) — human names used as brands (Claude, Alexa, Oscar, Ada). Particularly strong for AI, health, finance, and trust-dependent products.
- If generation feels convergent or safe despite branching, read `references/elicitation-techniques.md` and apply **SCAMPER** to your best candidates or **Inversion** to identify what to avoid. If the session is stuck, try **Constraint Removal** to find the user's true preferences.

### Must-run moves by brief type

Beyond the categories, a handful of moves have earned a place in every deep session of their brief type. In testing, the shortlists that won were built on them, and sessions that left them to chance skipped them. The main session runs each as a visible pass with its own labeled batch and records it in `approaches_tried`; a move a generation team already covered in its table counts, and is noted rather than rerun:

| Consumer, fashion, food, beauty | B2B, enterprise, developer tools |
|---|---|
| Five Senses Scan, shown as its own category | Vertical Code Calibration: read the vertical's row in `references/enterprise-naming.md` before generating |
| Emotional Temperature Mapping | Category Creation Naming: is this joining a category or creating one |
| Cultural Tension Naming | Trust-Without-Claims lexicon, and governance vocabulary where the product carries risk |
| Desired-Self Naming | Integration topology vocabulary when the product is connective tissue |
| Adjacent-Category Code Borrowing | Ownability-first compound track, in parallel (below) |
| Arbitrary / Absurd Association | Personified names for daily-use tools |

Everything else in the reference files stays optional and surfaces through "untried approaches" at the checkpoint.

### Hard gates (generation volume)

Hold these gates before Loop 3 (shortlisting). Proceed past a failing gate only after the user has heard the consequence and confirmed.

**1. Minimum candidate count:**
- **Explorer mode:** Generate at least **60 unique candidates** before entering shortlisting.
- **Focused mode** (`session_mode: focused` in `00-brief.md`): At least **40 unique candidates**, because Focused mode generates only in the categories the user reacts to.
- If you have fewer, continue generating — try categories you haven't used, apply techniques from `references/naming-techniques.md`, or run cross-model ideation. Tell the user: "We have [N] candidates. The skill recommends at least [60/40] for a strong shortlist. Want me to generate more, or proceed with what we have?"

**2. Category coverage:**
- Attempt at least **6 of 11 naming categories** with at least **5 candidates each**.
- Before presenting the Loop 2 to 3 checkpoint menu, display a category coverage table:
  - Categories attempted: [list] (N of 11)
  - Categories producing viable results: [list]
  - Categories NOT yet attempted: [list]
- If fewer than 6 categories were attempted, flag it and generate from missing categories before proceeding.

**3. Structural diversity:**
- The candidate pool must contain names from at least **3 different structural types** (found words, compounds, coined/invented, blends, respellings, foreign-root).
- If the pool is >80% one type (e.g., all found words), flag it before proceeding: "Your pool is [N]% [type]. If validation kills [type], you'll have nothing left. I recommend generating [10-15] alternatives from [other types] before shortlisting."

**Cycling, not counting.** The gates above are about the pool. Technique variety is the means, not a metric: a session that stays in one generation groove produces a pool that looks diverse by count and feels the same to the user. When you present a batch, name the approach that produced it so the user can ask for more of what works, and keep `approaches_tried` and `approaches_worth_trying` in `01-candidates.md` frontmatter as short free-text notes. Before the menu, glance at what is untried and mention the one or two moves most likely to open new territory for this brief.

### Five Senses Scan as formal generation round (consumer/physical product briefs)

**For consumer, fashion, lifestyle, food, beauty, and physical product briefs, run the Five Senses Scan as a dedicated generation pass — not inline commentary.** For each sense (sight, smell, touch, taste, sound), generate 5-10 candidate words grounded in the actual physical product experience, then test each as a standalone name. Cross-pollinate across senses (a visual word for a tactile experience, a sound word for a visual quality). Present the results as their own category in the gallery: **"Sensory (Five Senses Scan)"** alongside Evocative, Found Word, Personified, etc. Session testing shows the Five Senses Scan consistently produces strong consumer name candidates (Glint, Mica, Sloe all emerged from sensory mining) — it deserves category-level visibility, not technique-level footnoting. See `references/consumer-naming.md` for the full scan methodology.

### Ownability-first generation (parallel track) for B2B briefs

For B2B, enterprise, and tech briefs, run this alongside category-based generation, not after it. For every promising found word or evocative name you generate, immediately produce 3-5 compound/coined variants. Present both the found word AND its compound variants in the same batch — the user should see both tracks simultaneously, not found words first and compounds as a recovery afterthought.

**For consumer/fashion/food/beauty briefs:** Skip this ownability-first compound track entirely per SKILL.md guidance ("Nobody in streetwear wears Loamworks"). This skip applies to ALL compound generation techniques in this step, including Prefix × Suffix Matrix and systematic affix exploration — when the brief type is consumer/fashion/food/beauty, these techniques should generate consumer-appropriate combinations (nature+nature, sensory pairings, arbitrary compounds like Datadog/Liquid Death) rather than institutional compounds (-works, -craft, -wise, -ware). The brief type overrides the technique's default output register.

**Why this runs in parallel:** Found words have an 80-90% kill rate in validation. If your gallery is 100% found words, validation will destroy the pool and you'll be generating compounds under time pressure with a frustrated user. Front-loading compounds means the user reacts to both tracks from the start and develops taste preferences for compound patterns early.

**Check before presenting the gallery:** verify that at least 30% of candidates are compounds, coined words, or structural alternatives to found words. If the gallery is >70% found words, generate more compounds before presenting.

Do NOT default to a static suffix list — **generate the compound vocabulary dynamically from the brief.**

**The dynamic compound process:**

1. **Identify the brief's industry, personality, and competitive naming patterns.** What compound structures are natural and credible in this specific space? A fashion brand, a dev tool, and a healthcare company each have completely different compound vocabularies.

2. **Generate 8-12 industry-native compound elements.** Ask: "What suffixes, prefixes, and structural patterns would feel at home next to this brand's competitors?" Examples of how this varies:

   | Brief type | Natural compound elements | Example outputs |
   |---|---|---|
   | **Fashion/accessories** | Studio, & Co, House, Atelier, Edit, Supply, Goods, Society, Collection | Crow Studio, Sloe & Co, Moth House |
   | **Dev tools** | Labs, CLI, Protocol, Engine, Hub, Codex, .dev, SDK | Signal Labs, Forge Protocol, Sift Engine |
   | **Healthcare** | Health, Therapeutics, Bio, Sciences, Medical, Care, Rx | Meridian Health, Lumen Therapeutics |
   | **Finance/VC** | Capital, Partners, Ventures, Group, Advisory, Holdings | Benchmark Capital, Greylock Partners |
   | **Food/beverage** | Co, Kitchen, Provisions, Pantry, Brewing, Goods | Sloe Provisions, Bramble Goods |
   | **Consumer DTC** | Co, Supply, Goods, Club, Shop, Studio, Home | Crow Supply, Moth Club |

   These are illustrative — generate fresh for each brief. The point is that a fashion brand's compound vocabulary (Studio, House, Atelier) is completely different from a SaaS brand's (-works, -craft, -OS) and a static list will always be incomplete or wrong for most briefs.

3. **Generate 4-6 cross-industry compound elements.** The most distinctive compounds borrow from OUTSIDE the brand's industry. "Codex" for a dev tool borrows from medieval manuscripts. "Protocol" for a fashion brand borrows from diplomacy. Ask: "What adjacent or aspirational industry would lend this brand unexpected credibility?" Then mine that industry's vocabulary for compound elements.

4. **Also generate conceptual compounds (unexpected pairings):** Combine the root concept with a word from a completely unrelated semantic field — not [root]+[suffix], but [emotion]+[animal], [action]+[object], [domain]+[surprise]. Think Datadog, Snowflake, Cloudbees energy. The pairing should create a spark of cognitive dissonance that makes the name memorable.

5. **Blended meaning compounds:** Words where both halves contribute meaning and the combination creates a third meaning greater than the sum. Salesforce (sales + force = power behind sales), Workday (work + day = the daily work experience).

6. **Three-team compound outputs:** Apply the Lexicon Three-Team Method to compound generation too — one team generates on-brief compounds, one generates compounds as if the brand sat in the most desirable adjacent category, one generates compounds as if the product were in a far-off category (the same three stances as the first round).

See `references/naming-techniques.md` for tech/SaaS-specific affix tables (useful when the brief IS tech), creative respelling patterns, and the Prefix x Suffix Matrix methodology. But treat those tables as examples of what dynamic generation produces for one specific context, not as the universal compound toolkit.

This ensures that when a found word inevitably dies in validation, you already have compound alternatives that carry the same energy — and that the compounds themselves are creative, not just mechanical suffix-swaps. Present both the found word AND its compounds to the user — let them react to both tracks simultaneously.

### Presentation format

**Gallery Mode (default in Explorer Mode):** Before diving into categories one by one, offer a high-level gallery — the top 3-5 names from each category in a single scannable grid. This lets the user see the full breadth at a glance and identify which categories to explore further.

"Here's a quick overview across all categories. For each row, tell me: (H)ot — expand this, (W)arm — include but don't prioritize, (C)old — skip."

| Category | Top Candidates |
|---|---|
| Evocative | Crest, Verdant, Meridian (warning) |
| Found Word | Plinth, Tally, Gauge |
| Compound | Ironmark, Stonewell, Deepcraft |
| ... | ... |

Then expand the categories the user picks, showing the full numbered list with rationale. In **Focused Mode**, category-by-category remains the default.

### Presentation rules (hard constraints)

- **Max 15 candidates per reaction batch.** A list the user reacts to name by name holds at most 15; split larger sets into sub-batches of 10-15 with a reaction checkpoint after each. The gallery grid is the one exception: it shows 3-5 names per category across all categories at once, because its job is a scan and its only question is Hot, Warm, or Cold per category, not a verdict per name.
- **Number everything selectable.** All tables and lists where the user might need to refer to specific items include reference numbers. This applies to gallery tables, category expansions, riff presentations, checkpoint menus, validation tables — any display with selectable options. Never present a selectable list without numbering.

### Presentation order and pacing

**Three-step presentation: gallery, Hot rows, then Warm and Cold.** In Explorer Mode, start with the gallery grid (top 3-5 per category, H/W/C reactions). Expand the Hot categories one at a time as numbered lists with brief rationale, and run the second wave on the Hot directions. Then the **Warm and Cold step**, which has a fixed shape so those rows are never silently dropped: present each Warm row as its own numbered batch of up to 15 for reactions; then show the Cold rows' names in one numbered list of up to 15 per row with a single line each, asking only whether anything is worth rescuing. Everything the teams and must-run passes produced has now been seen once. Record in `01-candidates.md` which rows were expanded, which were shown as Cold, and which names the user rescued. In Focused Mode, skip the gallery and go straight to category-by-category.

After the user reacts to each category, build their preference profile incrementally: "You consistently picked [patterns]. You consistently skipped [patterns]. This tells me you gravitate toward [summary]." Use this profile to sharpen all subsequent generation and riffing.

**Pacing and what a round is.** A reaction round is one numbered batch of up to 15 names followed by the user's picks; they choose as many or as few as they like, and the preference profile updates after each round. A deep consumer session with three teams, must-run passes, and a second wave reaches 400 or more names, which is 25 to 30 rounds before shortlisting if every row is expanded. Keep that bearable: merge categories with fewer than six names into one batch, lead each round with a one-line read of what the user has been picking so far, and offer at every third round to jump to the Warm-and-Cold step or straight to shortlisting. Say the count out loud when you reach it: "About 12 rounds to go if we expand everything; happy to keep going or to skip ahead."

**User idea capture:** After presenting each batch, ask: "Did any of these spark your own ideas? If a name made you think of something — even a fragment, a vibe, a word — tell me and I'll add it to the pool." Users often have their best naming ideas when reacting to generated candidates, but won't volunteer them unless explicitly invited. Any user-contributed names go into the candidate pool with source labeled as "user-generated" and get the same treatment as AI-generated candidates (riffing, validation, etc.).

**Transparency rule:** After the Warm and Cold step, confirm the count: "You've now seen all [M] candidates across [N] categories; [R] were rescued from Cold rows." If the user chose to stop before the Warm and Cold step, say exactly what remains unseen: "[K] names in [rows] have not been shown. Want to see them now, or move on?" Nothing is hidden, and the user controls the pace.

**Category-by-category presentation:**
Present names one category at a time. For each category:
1. Show a numbered list of candidates (with inline warning flags where applicable) and a brief rationale in parentheses
2. Ask the user: which numbers do you like, dislike, or feel neutral about?
3. Move to the next category

After all categories are presented, summarize the user's favorites across categories before proceeding.

```
### Evocative
1. **Crest** (summit, achievement, the wave's peak)
2. **Verdant** (growth, flourishing, green)
3. **Meridian** (warning) Meridian AI — VC CRM (precision, navigation, measurement)
...

Which numbers do you like? Which feel wrong?
```

### Category prioritization

After the user reacts to Round 1 categories, heavily weight subsequent generation toward their preferred categories. If the user liked Evocative and Found Word but disliked Acronymic and Sound-Symbolic:
- Generate 2-3x more candidates in preferred categories
- Generate riffs primarily on candidates from preferred categories
- Still include 2-3 "surprise" candidates from non-preferred categories per round (the best names sometimes come from unexpected places)

### Adaptive territories

When user reactions during generation or triage reveal a strong pull toward a direction not captured by the original territories (e.g., the user keeps starring personified names even though no "Personified" territory was defined, or gravitates toward chess metaphors), **formally add it as a new territory immediately.** Announce it: "Your reactions are showing a clear pattern toward [direction]. I'm adding this as a formal territory and generating deeply in it now." Then run a focused generation round in that territory (minimum 10 candidates) before continuing the original flow. Update `00-brief.md` frontmatter with the new territory. This prevents the common failure mode where the user's actual taste diverges from the initial brief but the skill keeps generating in the original directions.

### Institutional compound patterns (within Compound generation)

When the brief calls for institutional weight (finance, VC, enterprise, professional services), generate compound combinations dynamically from the brief's semantic territory. The classic pattern is two grounded words that create institutional gravitas:

**Common structural patterns** (generate elements appropriate to the specific brief, not from a static list):
- **Color + Noun:** The BlackRock/Blackstone/Greylock pattern — mine colors that match the brand's emotional territory
- **Quality + Noun:** The TrueVentures/BrightEdge pattern — mine adjectives the brief's personality calls for
- **Material + Feature:** The Irongate/Stonebridge pattern — mine materials relevant to the brand's domain
- **Direction + Feature:** The Northstar/Crosspoint pattern — mine directional words that match the brand's motion
- **Noun + Noun:** The Benchmark/Cornerstone pattern — combine the user's favorite roots with each other

**The key principle:** Generate the elements FROM the brief's vocabulary, not from a fixed list. A craft-focused brand generates different adjectives (True, Fine, Hand, Master) than a tech-focused brand (Deep, Clear, Open, Full). A fashion brand generates different nouns (House, Row, Lane, Mark) than a finance brand (Rock, Gate, Point, Capital). The structural patterns are reusable; the vocabulary must be fresh each time.

### Morphological analysis (Zwicky) — systematic combinatorial generation

When intuitive generation plateaus, use morphological analysis to ensure coverage of the full possibility space. Define the dimensions of the naming problem, list options for each, and systematically combine across dimensions:

| Dimension | Options (example for a VC ops platform) |
|---|---|
| **Semantic field** | vision, craft, navigation, truth, signal, structure |
| **Phonetic texture** | hard/decisive, soft/warm, crisp/precise |
| **Syllable count** | 1, 2, 3 |
| **Word class** | noun, verb, adjective, coined |
| **Language origin** | English, Latin, Greek, compound |

Cross the dimensions: "2-syllable Latin-origin noun with crisp phonetics from the 'truth' semantic field" leads to Verity, Verax, Certus. "1-syllable English verb with hard phonetics from the 'craft' field" leads to Forge, Craft, Build. This ensures you don't inadvertently generate everything from the same narrow slice of the possibility space.

### Before presenting the menu

After presenting the initial pool, run the three hard gate checks and display the status:

**Hard Gate Status:**
- **Candidate count:** [N] candidates ([pass/fail] — minimum [60 in Explorer mode / 40 in Focused mode])
- **Category coverage:** [N] of 11 categories attempted ([pass/fail] — minimum 6)
- **Structural mix:** [breakdown by type] ([pass/fail] — minimum 3 types, no type >80%)

### Offer untried approaches

Alongside the gate status, name the two or three untried approaches most likely to open new territory for this brief, drawn from the reference files for the brief type: for example Toponym mining or Contrarian naming for a brand that is clustering in one register, Desired-Self or Cultural Tension for a consumer brief that is all sensory words, Category Creation or Vertical Code Calibration for a B2B brief that reads generic. Offer them under [G]; if the user wants one, run a batch with it and come back to this menu. The point is to keep cycling through genuinely different moves, not to exhaust a list.

---

## Menu

**[G]** Generate more — fresh round in specific directions, untried categories, or the approaches suggested above
**[X]** Cross-pollinate — a round from another model, run through Codex or pasted from another LLM (proceeds to step-02b)
**[R]** Riff — apply riffing techniques to favorites (proceeds to step-02c)
**[S]** Shortlist — review all candidates, pick favorites (proceeds to step-03a)
**[A]** Add your own — contribute names or fragments that came to mind
**[O]** Other — tell me what you need

**My recommendation:** [If any hard gate is failing, address it here. Otherwise recommend from session state: an untried approach that fits the gaps you see, cross-pollination for consumer briefs, or riffing if the user has clear favorites.]

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [A]: Capture user-contributed names/fragments, add to candidate pool with source "user-generated," offer to riff on them, then re-display this menu.
IF [G]: Run another generation round within this step, then re-display this menu with updated gate status.
IF [O]: Address the user's request, then re-display this menu.
IF [X]: Save to `brand-namer-output/01-candidates.md`, update frontmatter `stepsCompleted: [..., "02a"]`, then read fully and follow: `steps/step-02b-cross-pollination.md`
IF [R]: Save to `brand-namer-output/01-candidates.md`, update frontmatter `stepsCompleted: [..., "02a"]`, then read fully and follow: `steps/step-02c-riffing.md`
IF [S]: Save to `brand-namer-output/01-candidates.md`, update frontmatter `stepsCompleted: [..., "02a"]`, then, if `return_to` is set, clear it and go back to that menu (see workflow.md); otherwise read fully and follow: `steps/step-03a-shortlisting.md`
