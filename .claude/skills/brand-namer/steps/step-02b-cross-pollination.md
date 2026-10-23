# Step 02b: Cross-Pollination with Other LLMs

**Progress:** Step 5 of 13 — Next: Creative Riffing (step-02c)
**Reads:** `brand-namer-output/01-candidates.md` | **Writes:** `brand-namer-output/01-candidates.md` (append), `brand-namer-output/cross-pollination-prompt.md`, `brand-namer-output/codex-round-<N>.md`

## Purpose

Widen the possibility space with other models' creative biases.

## Done when

- Cross-pollination offered (it is a standing offer in every deep session; the user can decline)
- If accepted, a self-contained prompt written to `brand-namer-output/cross-pollination-prompt.md`, then either run through the Codex CLI, handed to the user to paste into another LLM, or run in a fresh Claude context
- Results, whether returned by Codex, pasted back, or returned by the subagent, are deduplicated, attributed to their source, flagged for conflicts, and merged into `01-candidates.md`

## Guardrails

- Deduplicate results against the existing pool and keep the source on every candidate. A name two models produced independently is a validation signal, not a duplicate to drop silently.
- Ask before the first Codex run in a session, and say what is sent. The prompt carries the full brief and the candidate pool to OpenAI through the user's account, and the brief is often confidential. Once they have said yes, run further rounds in the same session without asking again; the approval covers the session, not the step.

---

## Execution

Different LLMs have different creative biases. OpenAI's models trend toward punchy consumer brands and portmanteaus, Gemini toward technical and systematic foreign-root exploration, Grok toward irreverent options. A second model breaks the convergence habits of the first, which is why this round is worth the detour even after three isolated generation teams: the teams had different stances but the same model.

**Timing:** Offer after the first gallery round in 2a, or after the first round of user reactions in Focused Mode. Cross-pollination is also valuable during 2c (riffing) and 4b (pool recovery); offer it at any point where fresh perspectives would help.

**For consumer/lifestyle/fashion/food briefs, strongly recommend cross-pollination.** Consumer naming rewards lateral creativity, sensory vocabulary, and cultural reference that different models approach from genuinely different angles. Frame it as a near-default: "For consumer brands, I'd strongly recommend a round from another model. It has been the highest-yield stage in live sessions."

### Building the cross-pollination prompt

The same prompt serves all three routes below, so build it once and save it to `brand-namer-output/cross-pollination-prompt.md`. It is **self-contained**: the other model sees nothing else. Include:

1. The full brand brief from Loop 1
2. A condensed naming taxonomy: the 11 category names with 1-line descriptions plus the key generation rules (anti-patterns, at least 6 categories, don't self-censor). See "Cross-pollination prompt budget" in SKILL.md for length.
3. Instructions to generate **50+ names across at least 6 categories**, returned as the same table the 02a teams use, so one merge path serves every source:

   ```
   Return only a markdown table, one row per name, no preamble and no code fence:
   | Name | Category | Territory | Approach (technique or vocabulary mined) | Rationale (12 words max) | Flag |
   Category is exactly one of: Evocative, Coined, Blend, Metaphorical, Descriptive,
   Found Word, Foreign-Root, Acronymic, Compound, Sound-Symbolic, Institutional Compound.
   Angles such as personified, toponym, phrase, numeric, or sensory belong in the
   Approach column, not in Category.
   Flag: mark a company or product conflict you are confident of as "⚠️ <the company or
   product>", one you half-remember as "⚠️? <what you recall>", and otherwise leave the
   cell blank. Remarks about length, genericness or regulation belong in Rationale, not Flag.
   Finish with one line: "Richest vein: <the domain or category that gave the most
   distinct on-brief names>".
   ```

   The fixed Category list matters because `categories_used` and the category-coverage gate depend on those eleven names; a free-form "Portmanteau" or "Abstract" would not count.
4. The anti-convergence instructions: explore widely, don't self-censor, include weird and risky options
5. **The list of candidates already generated**, with the instruction: "Here are the [N] names already generated. Do not repeat these. Focus on categories, directions, and domains not already explored."
6. For the Codex route, one closing line: "Answer from this prompt alone. Do not run commands or read files."

Format the prompt so it works as a direct paste, with no setup or preamble needed from the user.

### Route 1: run it through the Codex CLI

When the `codex` command is installed (check with `command -v codex`), run the prompt yourself and merge the results, so the user never copies and pastes. This is true cross-model ideation: Codex runs OpenAI's models with the user's own Codex configuration deciding model and reasoning effort. The script runs Codex in an empty scratch directory with project-document loading off, so the model sees the prompt and nothing from this project.

Before the first run in a session, ask: "I can run this prompt through Codex on your OpenAI account and merge the results myself. It sends the brief and the current name list to OpenAI and uses your Codex allowance or credit; exact usage varies with your configured model and effort. Go ahead?" After a yes, later rounds in the same session proceed without asking.

Number the rounds from the count of `codex` entries already in `cross_model_sources`, then run:

```bash
bash <skill directory>/scripts/cross-pollinate.sh -o brand-namer-output/codex-round-1.md brand-namer-output/cross-pollination-prompt.md 2> brand-namer-output/codex-round-1.log
```

`<skill directory>` is the base directory reported when this skill loaded. Run this with a **ten-minute timeout** (`timeout: 600000` on the Bash tool): a 50-name round at high reasoning effort with a few hundred names to exclude takes two to five minutes, longer than the tool's default two minutes, and a run killed by the timeout looks like a failure when it was only slow. The script prints the model's answer on stdout and writes the same text to the `-o` file only after a successful run, so a failed run never leaves an empty or truncated round file. Codex's own transcript, which echoes the whole prompt, goes to the `.log` file; read its last twenty lines only when the run fails. Pass `-m <model>` only if the user asks for a specific model; otherwise their config decides.

Exit codes, in the order to consider them:

| Exit | Meaning | What to do |
|---|---|---|
| (no exit; tool reports a timeout) | The run was still going at ten minutes | Re-run once in the background and wait for the notice; if it times out again, trim the exclusion list to the last 150 names |
| 2 | Prompt file missing or unreadable | Fix the path; the prompt file is in `brand-namer-output/` |
| 3 | Codex not installed | Go to Route 2 |
| 4, 5, 6 | Script-side problem: temp file, empty answer, or could not write the output | Read the log tail; re-run once; then Route 2 |
| 11 and above | Codex itself failed (exit minus 10 is Codex's own status) | Read the log tail. A 401 or "not logged in" means `codex login` in a terminal; a connection or sandbox-denied message means retry outside any sandbox or let the user run the command in their terminal; a quota or 429 message means wait or Route 2 |

Do not stall the session on a failure: say what the log shows in one line, name the remedy, and offer Route 2 in the meantime.

Merge the returned table through the pipeline below with the source recorded as `codex`. A second Codex round with a different stance (name it as a brand in the most desirable adjacent category; name it as three far-off products and keep what transfers) is cheap and often worth it when the first round came back close to the existing pool.

### Route 2: hand the prompt to the user

When Codex is not installed, or when the user wants a model Codex does not reach (Gemini for systematic foreign-root exploration, Grok for irreverent candidates), present the saved prompt and say which model to paste it into and why. The user returns with results and you merge them with [M].

### Route 3: a fresh Claude context

If nothing reaches another model, or the user prefers not to send the brief outside Claude, run the same prompt in a subagent (the Agent tool, `effort: "high"`, foreground), with the stance changed to one the main session has not taken: name it as a brand in the most desirable adjacent category, or as three far-off products, keeping what transfers. A fresh context with a different stance breaks some of the session's accumulated habits, though not the model's own biases, so say plainly that this is weaker than a different model. Merge through the pipeline below with the source recorded as `claude-fresh-context`.

A note on evidence: the claim that cross-model rounds are the highest-yield stage for consumer briefs comes from one early live session, and no automated eval has exercised this step, because a simulated user declines to spend the user's credit with another provider. Treat the recommendation as experience, not measurement, and tell the user that when they ask.

### When to offer cross-pollination

Include cross-pollination as an option at these checkpoints:
- After the first gallery round (2a): "Want a round from another model before expanding?"
- At the Loop 2 to 3 checkpoint, listed as an option
- During pool recovery (4b): "Your pool is thin. A round from another model often produces the strongest recovery candidates."
- Whenever the hard gate checks reveal structural homogeneity: "Your pool is 90% found words. Another model might generate more coined/compound names."

### Merging results

Whether the table came back from Codex, from the subagent, or was pasted in by the user, process it the same way:

1. **Parse:** Read the table rows, skipping the header row, the `|---|` separator, any code fence, and any preamble or closing line the model added. Keep Name, Category, Territory, Approach, Rationale and Flag. A Flag cell without a ⚠️ or ⚠️? marker is a remark, not a conflict: move it into the rationale and leave the flag blank, so the ⚠️ markers in `01-candidates.md` mean one thing. For a free-text paste-in with no table, fall back to one name per line and ask the user for the model's category labels only if the names are many. Strip bold markers and numbering from names.
2. **Deduplicate:** Check against existing `01-candidates.md`. Flag exact matches as cross-model validation (a name generated independently by two models is a strong signal). Flag near-matches (e.g., "SiftWorks" vs "Sift Works") and let the user choose which form to keep.
3. **Classify:** Record the source (`codex`, `gemini`, `grok`, `chatgpt`, `claude-fresh-context`). Map any Category outside the eleven names to the nearest one and note the original in Approach. Add a conflict flag where you know one: external models return names unflagged, and the main session knows the competitors and category terms from the brief.
4. **Present:** Show the new unique names in the standard reaction-batch format from workflow.md, in the same form used for your own candidates, so the user sees exactly what the other model contributed.
5. **Save:** Append all new unique candidates to `01-candidates.md` with source noted, and add the source to `cross_model_sources` in the frontmatter.

For paste-ins, ask which model generated the results so the source is right.

### Mandatory offer, optional execution

Offer cross-pollination at least once in every deep session, either after the first gallery round or at the Loop 2 to 3 checkpoint. The user can decline ("no, let's keep going") and that is fine, but they should always know the option exists. Don't skip the offer silently.

---

## Menu

**[K]** Run through Codex — I build the prompt, run it through the Codex CLI on your OpenAI account, and merge the results
**[P]** Generate prompt — a ready-to-paste prompt for Gemini, Grok, ChatGPT, or another LLM
**[M]** Merge results — I have paste-in results from another model
**[F]** Fresh Claude context — run the prompt in a separate Claude context with a different stance (weaker than another model; keeps the brief inside Claude)
**[C]** Continue — proceed to Creative Riffing (Step 6 of 13)

**My recommendation:** [If `codex` is installed: recommend [K], for consumer briefs as a near-default and for other briefs as the cheapest way to get a second model's biases into the pool. If it is not installed: for consumer briefs recommend [P] with a named model; for other briefs, "[P] if you have another LLM to hand, otherwise [C] to continue to riffing." Mention [F] only when the pool looks homogeneous or the user has said the brief must stay inside Claude.]

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [K]: Build and save the prompt, confirm the spend and the data sent if this is the first Codex run of the session, run `scripts/cross-pollinate.sh` with a ten-minute timeout, merge the returned table with source `codex`, then re-display this menu (a second round with a different stance, or [C]).
IF [P]: Build and save the prompt, present it to the user for copying with the recommended model, then re-display this menu (user will return with paste-in results or choose [C]).
IF [M]: Process the paste-in results using the merge pipeline above, then re-display this menu.
IF [F]: Build and save the prompt with the changed stance, run it in a foreground subagent at high effort, merge with source `claude-fresh-context`, then re-display this menu.
IF [C]: Save to `brand-namer-output/01-candidates.md`, update frontmatter `stepsCompleted: [..., "02b"]`, then, if `return_to` is set, clear it and go back to that menu (see workflow.md); otherwise read fully and follow: `steps/step-02c-riffing.md`
