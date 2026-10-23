# Step 04b: Domain Availability + Pool Recovery

**Progress:** Step 9 of 13 — Next: Variation Generation (step-04c)
**Reads:** `brand-namer-output/03-validation.md` | **Writes:** `brand-namer-output/03-validation.md` (update)

## Purpose

Get definitive domain registration status for every survivor, and recover the pool when validation has thinned it.

## Done when

- All survivors checked on `.com`, `.ai`, `.co`, and `.io`
- A validation log records which checks each name has passed
- Pool recovery offered when fewer than about 5 strong candidates remain (strong: clear in 04a and holding an open `.com`, or an open TLD the brief type can carry, such as `.ai` or `.io` for B2B or `.co` for consumer)
- Recovery capped at 3 rounds, with a decision checkpoint after each

## Guardrails

- Use WHOIS or RDAP, not web search. Web search misses registered-but-parked domains, which is most of them.
- Ask before each recovery round and stop at 3. Recovery produces names that need validation, which kills names, which triggers more recovery; without a cap the loop never ends.

---

## Execution

### Domain availability check

For each surviving name, check domain registration across key TLDs:

- `.com` (most important for most use cases)
- `.ai` (increasingly important for tech companies)
- `.co` (common alternative)
- `.io` (developer/tech standard)
- Additional ccTLDs if the brief involves domain hacks (`.ly`, `.is`, `.us`, `.me`, `.al`, `.it`, `.to`)

#### Method: the bundled script

Run the skill's domain checker, which does registry WHOIS with the right server per TLD, falls back to RDAP, runs all lookups in parallel, and prints a markdown grid you can present directly:

```bash
bash <skill directory>/scripts/check-domains.sh Brine "Slow Riot" Nettle Loam
bash <skill directory>/scripts/check-domains.sh -t com,ai,co,io,ly,is Supply Genius   # custom TLDs
bash <skill directory>/scripts/check-domains.sh -r Brine Nettle                        # raw TSV
```

`<skill directory>` is the base directory reported when this skill loaded. Names are normalized to domain labels (lowercase, spaces and punctuation removed). Twenty names across four TLDs return in about two seconds. The script needs `whois`, `curl`, and `perl`, all present on macOS and most Linux, and no API keys.

Status values and what to do with them:

| Status | What it means | Next step |
|---|---|---|
| **✅ available** | Not registered: WHOIS said no match, or the TLD's RDAP registry returned 404 | Candidate for the user to register |
| **❌ registered** | Registered, which may mean parked, for sale, or active | Optionally web-search `site:[name].[tld]` to tell a live site from a parked one, since a parked domain may be purchasable |
| **❓ unknown** | No authoritative answer: timeout, rate limit, or a TLD with no WHOIS or RDAP route | Re-run, or check manually. Never treat unknown as available |

Rate limits are the usual cause of unknowns on a large batch; re-running the unknowns a minute later normally resolves them.

**If the script cannot run** (no shell, or a locked-down environment), do the lookups by hand with the same logic: `whois -h <registry server> <domain>` using the server map in the script (`whois.verisign-grs.com` for `.com`, `whois.nic.io`, `whois.nic.ai`, `whois.registry.co`, `whois.nic.ly`, `whois.isnic.is`), reading "no match / not found / no entries" as available and a record with `Domain Name:` or `Registrar:` as registered. For `.app` and `.dev`, which have no public WHOIS, use RDAP: `curl -sL -o /dev/null -w '%{http_code}' https://rdap.org/domain/<domain>`, where 404 is available and 200 is registered. Only trust a 404 when the request was redirected to a registry; a 404 from rdap.org itself means no route, not availability.

Present the grid to the user as returned, with any notes on parked-but-purchasable domains.

### Validation log

Maintain a running log of which checks have been completed for each name. This prevents re-running expensive searches when names re-enter the pipeline through recovery loops or new generation rounds. Track:
- **Competitive screen:** done/not done (4a)
- **Domain check:** done/not done (4b)
- **Trademark screen:** done/not done (4d)
- **Social handle check:** done/not done (4e)

When new names enter the pipeline (from recovery riffing, new generation rounds, or variation generation), only run checks they haven't already passed. When saving stage outputs to markdown, include this log so it persists across sessions.

### Checkpoint: generate more?

After presenting domain results, ask the user:

"We're down to [N] candidates after competitive and domain checks. Want to continue to trademark screening with these, or would you like to generate more options first? I can riff on the taken names that had strong energy, run a fresh generation round in directions you liked, or try a deepening technique to find new territory."

If the user wants more: loop back to Loop 2 (riffing on taken seeds or fresh generation), then re-validate only the NEW names (check the validation log — skip names already screened).

### Pool recovery checkpoint

After the domain check, assess the surviving pool. If validation (4a-4b) has reduced the pool below about 5 strong candidates (clear in 04a with an open `.com`, or an open TLD the brief type can carry: `.ai` or `.io` for B2B, `.co` for consumer), or if the user's favorites were disproportionately killed, proactively offer to resurrect earlier names:

"The validation pipeline was aggressive — we're down to [N] survivors. But several names that got killed had strong energy. Want me to bring any of these back for riffing and deepening? I won't use the taken names directly, but I can use them as starting points to generate available alternatives that carry the same feeling."

Present the taken-but-loved bucket from `02-shortlist.md` frontmatter, plus any names the user starred during ideation that were cut. For each, note:
- Why it was killed (competitor, domain, trademark)
- What made it compelling (the emotional territory, the phonetic quality, the story type)

Let the user select which (if any) to bring back into the mix. Then:
1. **Apply the core riffing techniques** to each taken-but-loved direction (grouped by theme, not individual names). The recovery track depends on the brief type, because the move that saves a B2B name (an institutional compound) is the move that kills a consumer one on a shelf:
   - All briefs: SCAMPER (all 7 lenses); synonym explosion (5-10 synonyms per root); zoom in/out and adjacent metaphor
   - B2B briefs: compound creation (each root x 5+ second words); creative respelling (Y-for-I, K-for-C, dropped vowels); tech branding patterns (-OS, -ware, -wise, -er, -base, -box) when the brief is tech
   - Consumer briefs: alternate real spellings and creative respelling; sensory vocabulary from the Five Senses Scan in the same emotional territory; language shift (French, Italian, Spanish, Japanese); arbitrary and absurd associations. No institutional compounds.

   Then ask: "Want me to go deeper with additional techniques?" If yes, escalate to:
   - Language shift (Latin, Greek for B2B; add the consumer languages above for consumer)
   - Systematic affix exploration (prefix AND suffix positions; for consumer briefs, playful affixes only)
   - Lexicon Three-Team stances (on-brief, adjacent category, far-off domain)
   - Conceptual riffing (TRIZ, First Principles, Analogical Reasoning)
2. **Present riff results to the user for reaction** before validating — let them pick favorites
3. **Re-validate the new candidates before they rejoin the pool:** run them through 4a (competitive screen — including technical project screening if applicable) and 4b (domain check, with explicit TLD searches) then update `03-validation.md`. Only candidates that pass re-enter the active pool alongside the original survivors.

This is a mini-loop, not a full pipeline restart. Pool recovery is often where the BEST names emerge — the taken-but-loved names tell you exactly what emotional territory works, and the full riffing toolkit finds available alternatives in that territory.

### Loop exit criteria

Recovery loops can amplify churn — each round generates new candidates that need validation, which kills more names, which triggers more recovery. Prevent endless loops:

- **Maximum 3 recovery rounds** before forcing a decision checkpoint: "We've done [N] recovery rounds. We have [M] survivors. Options: (a) proceed to final presentation with these, (b) one more targeted round on a specific direction, (c) step back and reframe the brief."
- **Minimum delta check:** If a recovery round produces fewer than 3 new viable candidates (post-validation), the technique is exhausted. Switch to a different approach or accept the current pool.
- **Explicit stop gate:** After each recovery round, ask: "Continue recovering, or work with what we have?" Don't auto-loop.

---

## Menu

- **[G]** Generate more — riff on dead names or fresh generation (loop to step-02c or step-02a)
- **[R]** Recover — run pool recovery on taken-but-loved names
- **[C]** Continue — proceed to Variation Generation (Step 10 of 13)

**My recommendation:** If fewer than 5 candidates are clear in 04a and hold an open `.com` or a TLD the brief type can carry (flagged names do not count, even with an open domain), use [R] to recover before continuing. Pool recovery often produces the session's best names. If the pool is healthy (5+), proceed with [C].

Wait for the user's selection before proceeding.

IF user provides non-menu input: Respond, then bring them back to this menu (see workflow.md).
IF [G]: Write `return_to: "04b menu"` in `01-candidates.md` frontmatter, then read fully and follow `steps/step-02c-riffing.md` to riff on dead names or `steps/step-02a-generation.md` for fresh generation. Its continue handler brings you back here; run 4a and 4b on the new names only, then re-display this menu.
IF [R]: Run pool recovery process described above, then re-display this menu.
IF [C]: Update `03-validation.md` frontmatter `stepsCompleted`, load next step (`steps/step-04c-variations.md`).
