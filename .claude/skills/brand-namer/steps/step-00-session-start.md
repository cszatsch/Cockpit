# Step 00: Session Start

**Progress:** Step 1 of 13 — Next: Brand Brief (step-01a)
**Reads:** filesystem (`brand-namer-output/` directory) | **Writes:** nothing yet

## Purpose

Detect whether a previous session exists, route to resume or fresh start, and determine the session type that governs the rest of the pipeline.

## Done when

- Session state detected (new or resuming) and any existing artifacts inventoried
- The user has made an explicit routing decision
- Session type (quick, deep, iterative, validation-only) determined, or the user asked when signals are ambiguous

## Guardrails

- No name candidates in this step. The brief does not exist yet, and names generated now anchor the user's taste before you know what you are naming.
- Check the filesystem for `brand-namer-output/` before assuming a fresh start. Resuming saves the user repeating an hour of work.

---

## Execution

### 1. Check for existing artifacts

Immediately check whether `brand-namer-output/` exists and which artifacts are present. The possible artifacts are:

| Artifact | File | Indicates |
|----------|------|-----------|
| Brief | `00-brief.md` | Loop 1 complete — brief, territories, whitespace captured |
| Candidates | `01-candidates.md` | Loop 2 complete — divergent generation done |
| Shortlist | `02-shortlist.md` | Loop 3 complete — convergent selection done |
| Validation | `03-validation.md` | Loop 4 in progress — de-risking underway |
| Final | `04-final.md` | Full pipeline complete |

For each artifact found, read its YAML frontmatter to extract:
- `project` — the naming project identifier
- `stepsCompleted` — which steps have been completed
- `session_mode` — Explorer or Focused
- `session_type` — quick, deep, iterative, or validation-only
- Any other frontmatter fields that capture session state (territories, naming architecture, etc.)

### 2. Route based on artifact state

#### If artifacts exist

Summarize what was found to the user. Be specific:

> "I found your previous session artifacts for **[project name from frontmatter]**. Here's where you left off:
>
> - **Brief** (`00-brief.md`): [summary — naming target, audience, key personality notes]
> - **Candidates** (`01-candidates.md`): [summary — how many candidates, which territories, whether riffing was completed]
> - [etc. for each artifact found]
>
> Based on the artifacts, you're ready to resume at **[detected step]**."

Then present resume options (see Menu below).

Resume point: read `stepsCompleted` from the most advanced artifact and resume at the step after its last entry, using the routing table in workflow.md (after "02a" go to 02b, after "03a" to 04a, after "04b" to 04c, and so on). Which files exist is not enough: `03-validation.md` is created in 04a and updated by every 04 step, so its presence alone says nothing about how far validation got. If a `checkpoint_pending` key is set, the previous session ended at that menu; resume there and leave the key in place until the user picks an option that moves on. If a `return_to` key is set, the previous session stopped mid-loop-back; resume at the step it names. If `04-final.md` exists with "04f" completed, present it and offer another round. Only when an artifact has no `stepsCompleted` at all, fall back to the file: brief only → 02a, candidates → 03a, shortlist → 04a, validation → 04b, and confirm the guess with the user.

#### If no artifacts exist

This is a new session. Check whether the user has already provided context in the conversation — uploaded documents (pitch decks, business plans, PRDs, competitive analyses), a description of what they're building, or any other material that would feed into the brief.

If context is present: Acknowledge it and route to step-01a (Brand Brief).
If no context yet: Welcome the user and route to step-01a (Brand Brief).

### 3. Detect session type

The session type decides which steps run; the definitions, signals, and quick-mode fast path are in `workflow.md` under "Session types and routing". Infer it from the user's signals: a detailed brief or "get this right" means deep; "just brainstorm some ideas" or a sparse brief means quick; "I already have names, just check them" means validation only; a returning user with artifacts on disk means iterative. Users rarely use this vocabulary, so read intent from context.

If the signals are genuinely ambiguous, ask:

> "Would you like a **quick brainstorm** (I'll generate a batch of names for you to react to — about 10-15 minutes) or a **thorough naming engagement** (we'll define territories, generate across categories, riff on favorites, and validate the finalists — about 45-60 minutes)?"

Capture the session type so it can be written to `00-brief.md` frontmatter in step-01a.

### 4. Confirm routing

Once you know the session state (new or resuming) and the session type (quick/deep/iterative/validation-only), present the appropriate menu and wait for the user to confirm before proceeding.

If the user prefers just the final answer with no intermediate artifacts, note this preference — skip saves during the pipeline and only produce `04-final.md` at the end.

---

## Menu

### If existing artifacts were found:

**[R]** Resume — continue from where we left off (Step [detected step])
**[F]** Fresh start — archive old artifacts and begin a new session
**[V]** View — show me the existing artifacts before I decide

**My recommendation:** [From the artifacts you just read, not a stock line: name the project and the step they stopped at, say how much work resuming saves ("the brief and 180 candidates are already here"), and recommend [R] if the project matches what the user is describing now, [F] if the brief names a different target, [V] if the frontmatter is sparse or the timestamp is old enough that the user may not remember the session.]

### If no existing artifacts (new session):

**[C]** Continue — full engagement, proceed to Brand Brief (Step 2 of 13)
**[Q]** Quick brainstorm — three brief questions, one gallery, light riff, top 8-10 with domains; about 15 minutes
**[N]** Validate names I already have — a three-question brief, then competitive, domain, trademark and handle checks on your list

**My recommendation:** [From the session type you detected and what the user has already said. Deep or iterative signals: if their opening message carried a target, audience, and competitors, say the brief is half-written and recommend [C] to confirm it; if it was a sentence, say what the brief still needs (audience, personality, competitors) and that a pitch deck or PRD would answer most of it; if they attached documents, name what you took from them. Quick signals: recommend [Q] and say what it skips (territories, cross-model round, full validation). A list of names in the opening message: recommend [N].]

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [R]: Read the most advanced artifact's frontmatter, confirm the resume point with the user, then read fully and follow the detected step file.
IF [F]: Move existing `brand-namer-output/` to `brand-namer-output-archived-[timestamp]/`, create a fresh `brand-namer-output/` directory, then read fully and follow: `steps/step-01a-brief.md`
IF [V]: Display a summary of each artifact's contents (read frontmatter + first section of each), then re-display the resume menu ([R] / [F]).
IF [C]: Read fully and follow: `steps/step-01a-brief.md`
IF [Q]: Run the quick mode fast path from workflow.md in place: three brief questions, 30-40 names across 4-5 categories as one gallery (Five Senses Scan for consumer and physical products), one reaction round, light riff with compound alternatives for B2B, then the top 8-10 with rationale and domain suggestions from `scripts/check-domains.sh`. Load `references/naming-categories.md` before generating. Write artifacts only if the user asks. End by offering the full engagement if they want to go deeper.
IF [N]: Ask three questions (what is being named and what it does; the category and the main competitors; anything the names must avoid), then take the user's list. Write `00-brief.md` with `session_type: validation-only`, `session_mode: focused`, the answers, and `stepsCompleted: ["00", "01a"]`, and `02-shortlist.md` with the names as the shortlist, `riffing_checklist: { status: waived, notes: "validation-only session" }`, and `stepsCompleted: ["00", "01a", "03a"]`. Then read fully and follow: `steps/step-04a-screening.md`.
