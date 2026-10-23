# Step 01b: Territories & Whitespace

**Progress:** Step 3 of 13 — Next: Divergent Generation (step-02a)
**Reads:** `brand-namer-output/00-brief.md` | **Writes:** `brand-namer-output/00-brief.md` (update with territories, whitespace, session mode)

## Purpose

Define 3-5 naming territories and map the competitive whitespace so that generation is intentionally diverse rather than many names in one vibe.

## Done when

- 3-5 territories defined, each with emotional promise, semantic field, phonetic profile, and anti-patterns
- Competitive whitespace mapped and presented to the user
- Session mode (Explorer or Focused) determined
- Default territory checks applied (Personified for daily-use tools, Animal/Nature for consumer briefs)

## Guardrails

- Still no name candidates. Territories are the generation lanes; names produced before the lanes are aligned cluster in the first vibe you happened to reach for.
- Present the whitespace map before continuing. It is how the user gains confidence the names will not echo their competitors.

---

## Execution

Read `brand-namer-output/00-brief.md` to load the brief before proceeding.

### 1b. Naming Territories

Before generating names, define 3-5 naming territories — distinct creative directions that each represent a coherent brand world. This prevents generation from being "many names in the same vibe" and ensures intentional diversity.

#### Tree of Thought: Territory exploration

Don't generate territories sequentially. Instead, explore broadly and prune:

1. **Branch:** Generate 8-10 candidate territories internally — cast a wide net across different emotional registers, semantic domains, and phonetic textures. Include at least 2 territories that feel unexpected or uncomfortable for the brief.

2. **Evaluate:** Score each territory against three criteria simultaneously:
   - **Differentiation from competitors** — does this territory occupy whitespace, or overlap with how competitors already name themselves?
   - **Brief alignment** — does the territory's emotional promise match the user's stated personality, archetype, and #1 job?
   - **Generative potential** — will this territory produce a rich pool of diverse candidates, or will it run dry after 5-6 obvious names?

3. **Prune:** Select the 3-5 territories that score strongest across all three criteria. Drop territories that overlap with each other or with the competitive set.

4. **Default territory checks:** Before finalizing, apply these brief-type-specific checks:

   **For daily-use tools, OS, or assistants** — something the user will talk to or about every day — always include **"Personified / Domain Figures"** as one of the 3-5 territories. This territory mines: historical figures from the product's domain (e.g., Benjamin Graham for VC, Florence Nightingale for healthcare), clean first/last names with the right phonetic energy, and names that pass the "coffee shop test" ("Let me check [name]"). Prompt the user: "Who are the famous figures in [domain] that you admire?" Their answers become generation seeds. The user can still drop this territory during alignment, but it should be presented by default — personified names are consistently strong for daily-use products and often emerge as the user's preferred direction.

   **For consumer/physical product/fashion/lifestyle briefs** — always include **"Animal / Nature Curator"** as one of the 3-5 territories. This territory mines: creatures that embody the brand's core action (magpies collect shiny objects, moths are drawn to light, kestrels hover with precision before striking), plants and trees with relevant symbolism (rowan for protection, briar for resilience, sloe for dark sophistication), and natural phenomena that mirror the product experience. Prompt the user: "What creature or natural thing does what your brand does?" Session testing shows animal/nature names consistently emerge as a dominant direction for consumer brands — they carry rich metaphorical depth, are instantly imageable, and pass the badge test effortlessly. The user can still drop this territory during alignment.

5. **Present:** Show only the pruned territories to the user. Note which territories you explored and dropped, and why — this transparency builds trust and lets the user rescue a dropped territory if they disagree.

For each surviving territory, define:
- **Territory name** (e.g., "Calm Precision," "Maker Energy," "Institutional Trust")
- **Emotional promise** — what the user feels encountering this brand
- **Semantic field** — the word families and metaphor domains to mine
- **Phonetic profile** — sound texture that fits (reference `references/brand-psychology.md`)
- **Anti-patterns** — what this territory should NOT sound like

Present the territories to the user for alignment before proceeding. They may adjust, merge, add territories, or rescue dropped ones. Each territory becomes a generation lane in Loop 2.

### 1c. Competitive Whitespace Mapping

Before generating, map the naming landscape the brand will live in.

Using the competitors identified in the brief:
- What naming patterns dominate the category? (e.g., "every fintech is [noun]Pay")
- What phonetic shapes are overused?
- What metaphor domains are crowded?
- Where is the whitespace — naming territory no competitor occupies?

Present a brief competitive map to the user:

> "Your competitors cluster around **[pattern]**. The whitespace is **[description]**. I'll weight generation toward the whitespace."

This sharpens generation and gives the user confidence that names won't accidentally sound like the competitive set.

### Session mode (infer, don't ask)

**Explorer Mode:** Maximum ideation first. Generate across all categories, present everything organized by category for the user to react to. Best when the user wants to see the full possibility space before making any cuts.

**Focused Mode:** Step-by-step with user input at each stage. Present one category at a time, get reactions, riff only on what the user likes, check in frequently. Best when the user wants to stay in control and iterate collaboratively.

Both modes use the same pipeline — they just differ in when the user enters the loop. **Infer the mode from the user's signals rather than asking explicitly.** Signals:
- "Show me everything" / "I want to see the full range" → **Explorer**
- "Let's go step by step" / "walk me through options" → **Focused**
- A detailed brief with clear taste signals → **Explorer** (they know what they want, show them breadth)
- A sparse brief with uncertain taste → **Focused** (build understanding incrementally)

Only ask when the signals are genuinely ambiguous.

The chosen mode is captured in `00-brief.md` frontmatter so it persists across sessions.

If the user gave you a sparse brief ("I need a name for my AI startup"), work with what you have but note the gaps. You can generate a first round and let their reactions fill in what the brief didn't.

---

## Menu

**[A]** Add territory — define an additional naming territory
**[D]** Drop territory — remove a territory that doesn't fit
**[R]** Revise — adjust a territory's definition
**[C]** Continue — save territories and proceed to Divergent Generation (Step 4 of 13)

**My recommendation:** [From the territories and whitespace you just presented: name the territory you expect to be richest for this brief and why, the one you are least sure of, and any dropped territory worth rescuing given the user's seed words or admired names. Recommend [C] when the set spans at least two distinct emotional registers and occupies the whitespace; recommend [A] or [R] when the territories cluster in one register or all sit near the competitors' pattern.]

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [A]: Ask the user to describe the new territory (or propose one based on their input). Define it with the full structure (name, emotional promise, semantic field, phonetic profile, anti-patterns). Add it to the territory list and re-display this menu.
IF [D]: Ask which territory to drop (or confirm if they've named one). Remove it and re-display this menu.
IF [R]: Ask which territory to revise and what to change. Update the definition and re-display this menu.
IF [C]: Update `brand-namer-output/00-brief.md` — add territories (with full definitions), competitive whitespace summary, and session mode to the YAML frontmatter. Update `stepsCompleted: ["00", "01a", "01b"]`. Then read fully and follow: `steps/step-02a-generation.md`
