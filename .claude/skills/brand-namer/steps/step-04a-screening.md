# Step 04a: Competitive Screening

**Progress:** Step 8 of 13 — Next: Domains & Pool Recovery (step-04b)
**Reads:** `brand-namer-output/02-shortlist.md` | **Writes:** `brand-namer-output/03-validation.md` (created here), `brand-namer-output/02-shortlist.md` (`taken_but_loved`, recovery survivors)

## Purpose

Catch the conflicts training data missed: recent companies, small competitors, names that only surface via web search.

## Done when

- Validation tooling tier detected and its capabilities and gaps communicated to the user
- Every shortlisted name screened with the same baseline search templates
- Results categorized Clear / Flagged / Taken, with flagged names resolved inline
- Dead names offered for riffing via the batched validation-death menu
- Technical registry screening applied when naming a dev tool, library, or plugin

## Guardrails

- Define the search templates before starting and apply the same set to every name. Improvised per-name queries produce signal that cannot be compared across names.
- Bucket taken names; never delete them. A taken name the user loved tells you exactly which territory to riff in.

---

## Execution

### Part 1: Validation Setup

#### Parallel subagents for validation

Validation is factual and parallelizable. It does not need the creative reasoning generation requires, so when screening 5 or more names, spawn one subagent per name in a single turn (the Agent tool, `model: "haiku"`, `effort: "low"`) rather than running sequential searches yourself. Each subagent gets a self-contained brief:

```
Search the web for "[name]" as a company, brand, or software product, and for
"[name]" together with "[industry]". Use the same two queries for every name.
Classify: Clear (no conflicts) / Flagged (something exists, different industry or
tiny or defunct) / Taken (active company or product with this name in a related space).
Return: name, status, conflicts_found (each with a URL and one line on what it is).
```

Keep domain checks out of the subagent briefs and out of this step: step 04b runs them in one call to the bundled script, which covers every name across the standard TLDs in a couple of seconds. Here, twenty sequential searches become two or three minutes of parallel work, and you consolidate the subagent results into the screening table.

#### Validation tools and limitations

**Set up before starting validation.** Web searches are unreliable proxies for domain availability and trademark clearance. Use the right tools:

- **Domain availability:** Use WHOIS via CLI for definitive registration checks (see step-04b for full server map and method). WHOIS catches registered-but-parked domains that web searches miss. Check `.com`, `.ai`, `.co`, `.io` for every candidate. For `.app`/`.dev` TLDs, use RDAP as fallback. Web search (`site:[name].[tld]`) is a supplementary check for whether a registered domain has an active website, but is NOT sufficient to determine registration status.
- **Trademark search:** [MarkerAPI](https://markerapi.com/) offers text-based USPTO trademark search via REST API (paid). [Apify AI Trademark Conflict Analyzer](https://apify.com/vibexcoder/ai-trademark-conflict-analyzer/api/mcp) provides risk scores and phonetic matching as an MCP server (needs Apify account). The [jordanburke/trademark-mcp-server](https://github.com/jordanburke/trademark-mcp-server) searches by serial/registration number only (not by name) and requires a USPTO API key. For common English words (e.g., "Triage," "Assay"), a trademark attorney is essential for Class 9/42 clearance.
- **Marques françaises (INPI) :** `scripts/check-inpi.mjs` interroge l'API de diffusion de l'INPI (marques FR, UE et OMPI en une recherche) à l'étape 04d. Vérifiez ici si `INPI_USERNAME` et `INPI_PASSWORD` sont définis (`node -e "console.log(!!(process.env.INPI_USERNAME && process.env.INPI_PASSWORD))"`) et, sinon, prévenez l'utilisateur dès maintenant qu'il peut créer un compte gratuit sur data.inpi.fr avant l'étape 04d.
- **Social handles:** Search `x.com/[name]`, `instagram.com/[name]`, and LinkedIn company pages directly.

If no trademark tools are available, use web search proxies (`"[name]" trademark USPTO software`) but note the limitation clearly to the user.

#### Validation degradation tiers

Not every session has access to full tooling. Adapt validation depth to what's available:

| Tier | Tools available | What you can do |
|---|---|---|
| **Tier A (Full)** | Bash (WHOIS/RDAP) + web search + trademark API + social search | Full validation pipeline: definitive domain registration via WHOIS, competitive screen via web search, trademark search, social handle checks |
| **Tier B (Bash + Web)** | Bash (WHOIS/RDAP) + web search | Definitive domain registration via WHOIS, competitive screening via web search, trademark via `"[name]" trademark USPTO` proxies. Note trademark limitations to user. |
| **Tier C (Web only)** | Web search only | Competitive screening via web search, domain checks via `site:[name].[tld]` searches (misses parked/inactive domains). Note limitations to user. |
| **Tier D (Offline)** | No external tools | Conflict flagging from training data only (inline flags). Heuristic risk labeling based on name characteristics (common English words = high risk, compounds = lower risk, coined = lowest risk). Recommend the user do their own domain/trademark checks and provide a checklist. |

Detect your tier at the start of this step and inform the user: "I have access to [tools]. This means I can [capabilities]. For [gaps], I recommend [workaround]."

### Part 2: Competitive Screening

The inline flagging throughout Loop 2 has already caught conflicts visible in training data. This stage catches what training data missed — recent companies, small competitors, and names that only show up via web search.

Confirm the shortlist with the user: "Here are the [N] names we're taking into validation: [list]. The flags caught some obvious conflicts during generation. Now I'll do web searches to catch anything my training data missed, then check domains, generate variations where needed, screen trademarks, and check social handles. Ready to proceed?"

For each shortlisted name (focusing on those WITHOUT existing flags — flagged names get a lighter check), do a web search:

- Search: `"[name]"` — is there a well-known company or product with this exact name?
- Search: `"[name]" + [industry/category]` — is there a direct competitor using it?

**Consistent search templates:** Define query templates BEFORE starting and apply the same set to every name in the batch. For example: Template A: `"[name]" software company platform`, Template B: `"[name]" [industry] AI`. Do NOT improvise different search variations for different names — inconsistent queries produce inconsistent signal, making results incomparable. If a name warrants deeper investigation after the standard pass, run additional searches, but the baseline must be consistent.

**Categorize each name after this pass:**
- **Clear** — no obvious conflicts found
- **Flagged** — there's something out there with this name but it might not be a conflict (different industry, tiny company, defunct)
- **Taken** — there's a clear, active company/product with this name in a related space

**Resolving "Flagged" names inline:** Include a "Decision" column directly in the competitive screening table for flagged names. Don't present a separate resolution menu — fold it into the same view:

| Name | Status | Conflict | Decision |
|---|---|---|---|
| Siftworks | Clear | — | — |
| Gauge | Taken | Gauge.ai, GaugeOnline | → riff or note for later |
| Headland | Flagged | Headlands Technologies (quant trading) | Proceed / Kill / Defer to attorney? |

Ask the user to mark each flagged name inline. This keeps the flow administrative-light and avoids a separate resolution step.

Report results to the user. **Do NOT remove "Taken" names from the working set.** Move them to a "Taken — available for riffing & deepening" bucket. A taken name that the user loves is a powerful creative signal: it tells you exactly what emotional territory to explore. Use taken names as inputs to:
- **Riffing (2c techniques):** SCAMPER, etymological mining, adjacent metaphors, compound creation, structural shifts
- **Deepening (3a techniques):** Constraint Removal (what if the domain didn't matter — what's the *feeling* you want?), Inversion (what makes this name work — now find something available with the same properties), Six Thinking Hats (evaluate the taken name's strengths systematically, then hunt for available names that hit the same marks)
- **Variation Generation (4c):** prefix/suffix, creative respelling, compound extensions

The goal is to find an *available* name that carries the same energy. Taken names are creative assets, not dead ends.

#### Validation-death trigger (batched)
When names die in competitive screening, don't fire a recovery prompt for each one individually. Collect all deaths from the validation round, then present one consolidated recovery menu:

"**[N] names died in this round:**

| Name | Killed by | What made it compelling |
|---|---|---|
| [Name 1] | [conflict] | [energy/quality the user liked] |
| [Name 2] | [conflict] | [energy/quality] |
| ... | ... | ... |

Then present this step's menu, whose [R] and [N] options act on this table. The user picks dead names by number, or says "all". This turns validation failures into generation triggers while keeping the session flowing.

#### Technical project screening (for dev tools, open source, skills, MCPs, plugins)
When naming a technical project, add these sources to the competitive screen:

- **GitHub:** Search `github.com/search?q=[name]&type=repositories` — look for repos with >100 stars or active development
- **npm:** Search `npmjs.com/search?q=[name]` — check for published packages with meaningful download counts
- **PyPI:** Search `pypi.org/search/?q=[name]` — check for published Python packages
- **VS Code Marketplace:** Search for extensions with the name
- **MCP server registries:** Search Smithery.ai, mcp.run, and glama.ai for registered MCP servers
- **Claude Code skills directories:** Search awesome-claude-code-skills repos and similar directories
- **Docker Hub:** Search for official or popular images with the name
- **Homebrew:** Search `brew search [name]` formulae

Categorize technical conflicts the same way (Clear / Flagged / Taken). A 50-star GitHub repo in an unrelated domain is "Flagged"; a 5,000-star repo in the same space is "Taken." Package registry names are particularly important — if `npm install [name]` already resolves to something, that's a meaningful conflict even if the package is small.

---

## Menu

**[R]** Riff on dead names — pick by number or "all"; I generate available alternatives with the same energy and screen them here
**[N]** Note for later — add the picked dead names to the taken-but-loved bucket for pool recovery in 04b
**[C]** Continue — proceed to Domain Checks (Step 9 of 13)

**My recommendation:** [If names died: name the one or two with the strongest user energy and recommend [R] on them now, since a taken name with the right feeling is the best seed for an available one; recommend [N] for the rest. If nothing died, or the survivors are plentiful: [C].]

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [R]: For the picked names, grouped by what made them compelling, load `references/naming-techniques.md` and generate 5-10 alternatives per group using the recovery techniques above (SCAMPER, etymological mining, adjacent metaphors, structural shifts; compounds for B2B briefs, respellings and alternate real spellings for consumer briefs). Screen the new names with this step's search templates, add the survivors to `02-shortlist.md` with source `recovery-04a`, record the dead originals under `taken_but_loved`, then re-display this menu.
IF [N]: Add the picked names to `taken_but_loved` in `02-shortlist.md` frontmatter with `killed_by` and `compelling_because`, then re-display this menu.
IF [C]: Save `03-validation.md`, update frontmatter `stepsCompleted`, load next step (`steps/step-04b-domains.md`).
