# Brand Namer — Workflow Router

SKILL.md holds the global context: role, philosophy, reference loading, artifacts, and scenario playbooks. This file governs how the session executes. Step files in `steps/` hold the work itself.

## How to execute

1. Start with `steps/step-00-session-start.md`. Read each step file completely before acting on it, because the menu and routing at the bottom change how the body should be run.
2. Work one step at a time. Each step names the next one. Load the next file only when the current step's menu routes there — looking ahead tempts you to optimize the sequence, and the sequence is the method.
3. At a checkpoint menu, present the options with your recommendation and wait for the user to choose. The user drives every convergence decision in this skill; advancing on their behalf removes the one input that makes the output theirs.
4. Before loading the next step, save the current artifact and update its `stepsCompleted` frontmatter. Artifacts are the session's memory and the only way a later session can resume.
5. When a checkpoint lets the user loop back to an earlier step, load that step directly and skip the ones in between.

## Effort and subagents

Creative work in this skill rewards depth; validation does not. When your harness lets you set effort, run deep sessions at high effort, and when you spawn subagents, match the effort to the job:

| Work | Subagent model and effort | Why |
|---|---|---|
| Generation teams (step 02a), fresh-context cross-pollination (02b) | Default model, `effort: "high"` | Breadth and distinctiveness come from thinking longer |
| Cross-model round (02b) | Codex CLI via `scripts/cross-pollinate.sh`; the user's Codex config sets model and effort | A different model's biases are the point, which no Claude subagent can supply; ask before the first run since it spends the user's OpenAI credit |
| Competitive screening (04a), handle checks (04e) | `model: "haiku"`, `effort: "low"` | Factual lookups; speed and cost matter, reasoning does not |

Domain checks use the bundled script (`scripts/check-domains.sh`), not a model.

## Core rules and why they exist

- **Present everything, cut nothing.** Every candidate you generate reaches the user eventually, in numbered batches of at most 15 (the gallery overview grid, which asks only Hot, Warm, or Cold per category, is the one display that shows more). Pre-filtering substitutes your taste for theirs, and the names you would have cut are often the ones they fall for.
- **Number every selectable list.** Users refer to names and options by number. An unnumbered list forces them to retype names and slows every reaction round.
- **Recommend at every checkpoint.** A menu without a recommendation is paperwork. Base it on the session state: pool size, category coverage, structural mix, the user's energy.
- **Hold the volume and diversity gates.** Shortlisting with fewer than 60 candidates (40 when `session_mode` in `00-brief.md` is Focused, since that mode narrows generation to the categories the user reacts to), fewer than 6 categories attempted, or a pool over 80% one structural type reliably ends in a thin, disappointing final pool after validation. The gates are defined in steps 02a and 03a. When a gate is failing and the user wants to move on anyway, say so once in plain terms with the likely consequence, recommend the fix, and proceed if they confirm. Record `gate_waived: [gate]` in the artifact frontmatter.
- **Offer cross-model ideation at least once in a deep session.** Different models have different creative biases, and it is consistently the highest-yield round for consumer briefs. The user can decline.
- **Load the reference file a step names before generating in that step.** The reference files are where the technique depth lives. Generating from memory produces the averaged output this skill exists to prevent.
- **Loop-backs return to the caller.** Several handlers send you to an earlier step for one round (03a to 02a, 02b or 02c; 04b, 04d and 04e to generation) and expect you back at the same menu. Before you go, write `return_to: <step and menu>` in the frontmatter of the artifact you are updating (for example `return_to: "03a entry menu"`). The forward handlers in 02a, 02b and 02c check that key before following their default route: when it is set, save, clear it, re-validate only the new names if the caller was a 04 step, and go back to the caller's menu. Without this the session re-enters shortlisting from the top and the user loses their place.
- **`stepsCompleted` records finished steps.** A step is appended when its continue handler fires, not when its menu appears. If the session ends while a step's menu is showing, leave that step out and write `checkpoint_pending: "<step> <menu>"` in the artifact, so step 00 resumes at that menu instead of re-running the step or skipping it. The key is cleared by whichever handler the user then picks that appends to `stepsCompleted` (the step's continue, or a loop-back's return); until then it stays, so a second interrupted session still resumes at the same menu.

## Handling input that is not a menu choice

Users ask questions, add context, and go on tangents mid-menu. Answer them, then bring them back to the decision: a short "Where we are: [one line]. Options: [the menu, or its short form]." Re-display the full menu when the user seems to have lost the thread, and use the short form ("Generate more, riff more, or move on?") when they clearly have not. Casual phrases like "let's move on" or "what's next" mean the user wants your recommended option: confirm it in one line and proceed.

## Menu format

```
**[A]** Description of option A
**[B]** Description of option B
**[C]** Continue — save and proceed to [Next Step Name] (Step N of 13)

**My recommendation:** [Specific suggestion with rationale from the current session state.]
```

Bracket letters for options, the progress indicator on the continue option, a recommendation on every checkpoint menu. Then wait for the user's selection.

## Session types and routing

Detect the session type in step 00 from the user's signals and record it in `00-brief.md` frontmatter. It determines which steps run.

| Type | Signals | What runs |
|---|---|---|
| **Deep** (default) | Detailed brief, "get this right," company or flagship product name | All 13 steps. Cross-pollination offered. Riffing checklist before validation. All artifacts. |
| **Quick** | "Just brainstorm some ideas," "5 names in 10 minutes," sparse brief | The fast path below, run in place from step 00 ([Q]); no further step files. |
| **Iterative** | "Let me sleep on these," returning user | Deep pipeline, with artifacts saved so step 00 can resume at the right step. |
| **Validation only** | "I already have names, just check them" | Step 00 ([N]) takes a three-question brief and the names, writes `00-brief.md` and `02-shortlist.md`, then routes to 04a. Steps 04a to 04f run; the riffing checklist is skipped. |

When the signals are ambiguous, ask: "Quick brainstorm (about 15 minutes) or thorough engagement (45 to 60 minutes)?"

### Quick mode fast path

Quick mode trades the full method for speed, so the checkpoint discipline above relaxes to a single reaction round:

1. **Brief:** three questions. What are you naming? Who is it for? Any names you like or hate?
2. **Generate:** 30 to 40 names across 4 or 5 categories, presented as one gallery. For consumer and physical products, run the Five Senses Scan anyway. It takes seconds and consistently produces the best sensory candidates.
3. **React:** the user picks favorites from the gallery. One round.
4. **Light riff:** quick variants on the top picks. For B2B briefs include compound alternatives, since found words rarely survive validation.
5. **Present:** top 8 to 10 with brief rationale and domain suggestions. If the shortlist is entirely found words, say so and offer two or three compound or coined alternatives as insurance. Offer a quick conflict check on the top two or three.

Skip in quick mode: territories (01b), cross-pollination (02b), the riffing checklist, full validation (04a to 04e), and artifacts unless the user asks for them.

## Step routing table

| # | Step | File | Purpose | Gate |
|---|---|---|---|---|
| 1 | 00 | `steps/step-00-session-start.md` | Detect existing session, offer resume or fresh start | Auto / [C] |
| 2 | 01a | `steps/step-01a-brief.md` | Brand brief intake | [C] |
| 3 | 01b | `steps/step-01b-territories.md` | Naming territories, competitive whitespace, session mode | [C] |
| 4 | 02a | `steps/step-02a-generation.md` | Divergent generation across categories | Checkpoint menu |
| 5 | 02b | `steps/step-02b-cross-pollination.md` | Cross-model ideation | [C] |
| 6 | 02c | `steps/step-02c-riffing.md` | Creative riffing and directional expansion | Checkpoint menu |
| 7 | 03a | `steps/step-03a-shortlisting.md` | Convergent shortlisting and riffing checklist | Checkpoint menus |
| 8 | 04a | `steps/step-04a-screening.md` | Competitive screening via web search | [C] |
| 9 | 04b | `steps/step-04b-domains.md` | Domain availability and pool recovery | Checkpoint menu |
| 10 | 04c | `steps/step-04c-variations.md` | Variation generation and re-screening | [C] |
| 11 | 04d | `steps/step-04d-trademark.md` | Trademark screening | [C] |
| 12 | 04e | `steps/step-04e-social.md` | Social handles, stress tests, extended presence | [C] |
| 13 | 04f | `steps/step-04f-final.md` | Final tiered presentation and recommendations | End |

## Loop structure

The 13 steps form 4 loops that can cycle:

```
Loop 1: FRAME     → 00, 01a, 01b
Loop 2: GENERATE  → 02a, 02b, 02c
Loop 3: SELECT    → 03a
Loop 4: DE-RISK   → 04a, 04b, 04c, 04d, 04e, 04f
```

Cycle-back paths, defined in the step files:
- Loop 3 → Loop 2 when the user wants more candidates before shortlisting
- Loop 4 → Loop 2 when validation kills too many names and the pool needs recovery
- Loop 4 → Loop 3 to re-shortlist after recovery
