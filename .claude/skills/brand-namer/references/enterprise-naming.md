# Enterprise & B2B Naming Reference

B2B-specific naming techniques, evaluation frameworks, and compliance guidance. Load this file only when the brief is for enterprise software, B2B SaaS, developer tools, or vertical SaaS. Skip for consumer/lifestyle naming.

### Key Rules
1. **Test every finalist across the buyer committee** — the name must score "acceptable or better" for champion, economic buyer, technical evaluator, AND end users. One veto-level score kills the name.
2. **Run the Sales Conversation Fit templates** — elevator pitch, board deck, RFP, Slack, phone call, email signature. Names fail in real speech even when they look good in text.
3. **Check the Vertical Code Calibration table** for your specific vertical — fintech, healthtech, legaltech, cybersecurity, proptech, HR, and devtools each have distinct naming norms.

**Cross-references:** For core naming categories → `naming-categories.md`. For riffing/compound techniques → `naming-techniques.md`. For brand archetypes → `brand-psychology.md`.

---

## Table of Contents

- [Evaluation & Testing Frameworks](#evaluation--testing-frameworks)
  - [Semantic Differential Scaling (Osgood)](#semantic-differential-scaling-osgood)
  - [Phonotactic Probability Scoring](#phonotactic-probability-scoring)
  - [Speech & Channel Robustness Testing](#speech--channel-robustness-testing)
  - [Searchability & AI Retrieval Testing](#searchability--ai-retrieval-testing)
  - [Recall & Recognition Protocols](#recall--recognition-protocols)
  - [Visual Wordform Analysis](#visual-wordform-analysis)
  - [Implicit Association Testing (IAT-lite)](#implicit-association-testing-iat-lite)
- [Distinctiveness Distance Modeling](#distinctiveness-distance-modeling)
- [Algorithmic Generative Search](#algorithmic-generative-search)
  - [Human-in-the-Loop Ranking](#human-in-the-loop-ranking)
- [B2B / Enterprise Naming Techniques](#b2b--enterprise-naming-techniques)
  - [B2B Technique Pipeline Ordering](#b2b-technique-pipeline-ordering)
  - [Buyer Committee Naming](#buyer-committee-naming)
  - [Category Creation Naming](#category-creation-naming)
  - [Sales Conversation Fit](#sales-conversation-fit)
  - [Integration / Ecosystem Naming](#integration--ecosystem-naming)
  - [Analyst / Press Headline Testing](#analyst--press-headline-testing)
  - [Enterprise Objection Preemption](#enterprise-objection-preemption)
  - [Platform vs Point-Solution Naming](#platform-vs-point-solution-naming)
  - [Developer / Technical Credibility Signaling](#developer--technical-credibility-signaling)
  - [Acronym Resilience](#acronym-resilience)
  - [Partner / Channel Naming Grammar](#partner--channel-naming-grammar)
  - [Internal-Champion Forwardability](#internal-champion-forwardability)
  - [Integration Topology Naming](#integration-topology-naming)
  - [Trust-Without-Claims Lexicon](#trust-without-claims-lexicon)
  - [Governance / Audit Vocabulary Mining](#governance--audit-vocabulary-mining)
  - [Vertical Code Calibration](#vertical-code-calibration)
- [Compliance & Governance](#compliance--governance)
  - [Regulated-Industry Lexical Compliance](#regulated-industry-lexical-compliance)
  - [Name Lifecycle & Scenario Stress Tests](#name-lifecycle--scenario-stress-tests)
  - [Portfolio Defense & Variant Strategy](#portfolio-defense--variant-strategy)

---

## Evaluation & Testing Frameworks

Every technique below follows an **execution card** format: Trigger → Steps → Output → Stop condition. This ensures they're actionable during a live session, not just conceptual.

### Semantic Differential Scaling (Osgood)

**Trigger:** 3a (Shortlisting) when comparing 5+ finalists, or when the user says "they all feel the same."
**Steps:**
1. Define 5 bipolar attribute pairs relevant to the brief (use these defaults or customize):

| Scale | 1 | 7 |
|---|---|---|
| Modern | ← | → Traditional |
| Precise | ← | → Creative |
| Premium | ← | → Accessible |
| Institutional | ← | → Friendly |
| Technical | ← | → Human |

2. Score each finalist name on all 5 scales (1-7). In solo sessions, the AI provides estimated scores with rationale. In group sessions, each stakeholder scores independently then averages.
3. Plot the target position (from the brand brief) and compare each name's actual position to it.
**Output:** A comparison table showing each name's score vs. target. Names closest to target are strongest fits.
**Stop:** When the user has enough signal to cut or rank. Usually 1 round suffices.
**Solo-user fallback:** The AI scores each name with reasoning: "I'd rate Siftworks as Precise=6, Institutional=5 because the hard consonants and -works suffix signal industrial authority." The user validates or overrides.

### Phonotactic Probability Scoring

**Trigger:** 2a (Generation) as inline quality check, and 3a (Shortlisting) as evaluation filter.
**Steps:**
1. For each name, count friction points: consonant clusters, unusual phoneme sequences, ambiguous stress, spelling-pronunciation mismatches.
2. Score: 0 friction = easy, 1 = fine, 2 = moderate friction, 3+ = high friction.
3. Cross-reference with target market: a name with moderate friction in English might have high friction in Mandarin.
**Output:** Friction score per name in a comparison table.
**Stop:** Score all shortlisted names once. Don't re-score unless names are modified.

**Quick test:** Count how many consonant clusters, unusual phoneme sequences, or ambiguous stress patterns a name contains. Each one adds friction.

| Name | Friction score | Notes |
|---|---|---|
| Siftworks | Low (1) | Natural English clusters |
| Essai | Low (0) | Simple CVCV-ish |
| Syftware | Medium (2) | "Syf" onset unusual, "ftw" cluster |
| Cruxwise | Medium (1) | "kr" onset is fine, "ks" coda adds slight friction |

### Speech & Channel Robustness Testing
*Confirmed by 2 models.*

Test names in real-world spoken/written channels before committing:

| Test | Method | Failure signal |
|---|---|---|
| **Voicemail test** | Say the name in a voicemail. Can the listener spell it? | Needs repeating or spelling out |
| **Podcast test** | Mention the name once in a sentence. Does it register? | Listener can't recall it 30 seconds later |
| **Phone support test** | "The company name is ___." Can support agent find it? | Autocorrect mangles it |
| **Voice assistant test** | Ask Siri/Alexa to search for the name. Does it resolve? | Wrong transcription |
| **Homophone test** | Is there a common word that sounds identical? | "Sight" / "Site" / "Cite" confusion |

### Searchability & AI Retrieval Testing
*Confirmed by 2 models.*

Modern discoverability is partly an embedding/search problem. Test:

- **Google branded search:** Does googling "[name]" return relevant results or noise?
- **App store search:** Can you find it in 1-2 taps?
- **LLM retrieval:** If someone asks an AI "tell me about [name]," does it find you or something else?
- **Voice assistant resolution:** "Hey Siri, open [name]" — does it resolve correctly?

Coined names and distinctive compounds (Siftworks, Essai) dominate branded search faster than common words (Signal, Proof).

### Recall & Recognition Protocols

| Test | Method | What it measures |
|---|---|---|
| **Immediate recall** | Show 10 names, cover them, ask "which do you remember?" | Short-term stickiness |
| **Delayed recall (24h)** | Show names, ask next day: "what names do you remember?" | Memory persistence |
| **Aided recognition** | Show a list with some names they've seen and some they haven't. "Which did you see before?" | Familiarity vs. true recall |
| **Confusion check** | Show names alongside competitor names. "Which is the new one?" | Distinctiveness from competitive set |

### Visual Wordform Analysis

Assess letter-shape silhouette, ascender/descender rhythm, and logo lockup potential:

- **Ascender/descender mix:** Names with varied heights (Sightcraft: S-i-g-h-t-c-r-a-f-t) create visual rhythm. Names with uniform height (minimum,aurus) look flat.
- **All-caps behavior:** Does the name work in ALL CAPS? SIFTWORKS vs ESSAI — both work.
- **Favicon potential:** Can the first 1-2 letters work as an icon? "Sw" (Siftworks), "Es" (Essai), "Sc" (Sightcraft).
- **Logo lockup:** Does the name have natural visual break points for typographic design?

### Implicit Association Testing (IAT-lite)

Fast reaction-time tasks reveal subconscious associations between name and attributes. A name can test positive explicitly ("yes, it sounds professional") while carrying hidden negative associations ("but it also feels cold").

**Lightweight version:** Ask stakeholders to quickly (under 2 seconds) categorize each name as fitting or not fitting a series of attributes. Speed of response reveals conviction — slow "yes" answers are weak associations.

---

## Distinctiveness Distance Modeling

*Computational technique.*

Quantify similarity to competitor names using:
- **Levenshtein distance** (edit distance in characters)
- **Soundex/Metaphone** (phonetic similarity coding)
- **Embedding similarity** (semantic proximity in vector space)

Flag near-neighbors before legal review. If your name is 1-2 edits from a well-known competitor, confusion risk is high regardless of trademark class.

**Example:** "Asana" and "Asena" are Levenshtein distance 1. "Siftworks" and "Sift" (the fraud company) are phonetically close but structurally distinct enough to coexist.

---

## Algorithmic Generative Search

*Confirmed by 3 models.*

Computational methods for scaling name generation beyond human brainstorming:

| Method | Description | Best for |
|---|---|---|
| **N-gram / Markov chains** | Generate letter sequences based on probability distributions from high-performing brand datasets | Coined names that feel like established brands |
| **Constraint solvers** | Define hard constraints (length, phonotactics, TM risk, domain availability) and search for solutions | Finding available names within strict parameters |
| **Genetic algorithms** | Evolve name candidates through mutation/crossover, scored by weighted objective functions | Exploring large solution spaces efficiently |
| **LLM constrained decoding** | Use language models with hard constraints on output format, length, phoneme patterns | Leveraging LLM creativity within precise boundaries |
| **Embedding-distance filtering** | Generate candidates, then filter by vector distance from competitor names to ensure distinctiveness | Avoiding semantic/phonetic collision |

### Human-in-the-Loop Ranking
Train lightweight preference models on user selection patterns from reaction-gathering rounds (liked/disliked). Use these to guide next-batch generation — deprioritizing patterns the user consistently rejects, amplifying patterns they consistently select.

This is what the preference profile artifact in `02-shortlist.md` enables. The more batches the user reacts to, the sharper the model becomes.

---

## B2B / Enterprise Naming Techniques

Naming techniques specific to B2B software, enterprise platforms, developer tools, and vertical SaaS. B2B naming operates in fundamentally different contexts than consumer naming — formal procurement, multi-stakeholder evaluation, analyst coverage, and ecosystem integration.

### B2B Technique Pipeline Ordering

Apply B2B techniques at the right stage, not all at once:

| Stage | Techniques to apply |
|---|---|
| **Brief (1a)** | Vertical Code Calibration, Regulated-Industry Compliance, Platform vs Point-Solution, Category Creation (are you joining or creating?) |
| **Generation (2a)** | Integration Topology Naming (as a semantic source), Developer-Technical Credibility Signaling (phonetic constraints), Trust-Without-Claims Lexicon, Governance/Audit Vocabulary Mining |
| **Shortlisting (3a)** | Buyer Committee Naming (multi-persona scoring), Sales Conversation Fit (template testing), Internal-Champion Forwardability, Acronym Resilience |
| **Validation (4a-4e)** | Analyst/Press Headline Testing, Ecosystem/Stack Testing, Partner/Channel Grammar, Enterprise Objection Preemption (CISO test, resume test) |

### Buyer Committee Naming
B2B purchases involve 6-10 decision-makers with different priorities. The name must satisfy ALL of them simultaneously.

| Buyer role | What they need from the name | Example that works |
|---|---|---|
| **Champion** (internal advocate) | Easy to pitch internally, memorable, makes them look smart | Snowflake (easy to explain, distinctive) |
| **Economic buyer** (CFO/VP) | Signals ROI, sounds like a serious investment | Palantir (institutional weight) |
| **Technical evaluator** (engineer/architect) | Signals technical depth, not marketing fluff | Stripe (precise, clean, engineer-respected) |
| **Legal/procurement** | No trademark concerns, clean IP story | — (process concern, not name reaction) |
| **End users** (daily operators) | Approachable, not intimidating, easy to say | Notion (friendly, usable, unthreatening) |

**The test:** Evaluate each finalist from each buyer role's perspective. The name that scores "acceptable or better" across ALL roles wins — even if it's not #1 for any single role. B2B naming is consensus optimization, not maximum appeal.

**Worked example (cybersecurity platform):**

| Name | Champion (7=easy to pitch) | Economic buyer (7=serious investment) | Technical eval (7=engineer-respected) | End user (7=easy daily use) | **Avg** |
|---|---|---|---|---|---|
| Caliber | 6 | 6 | 5 | 6 | **5.75** |
| Attest | 5 | 6 | 6 | 5 | **5.50** |
| CyberShield | 4 | 5 | 2 | 5 | **4.00** |

Caliber wins not by being anyone's #1 but by having no score below 5. CyberShield scores well with buyers but the technical evaluator's 2 kills it — one veto-level score defeats four acceptable scores.

### Category Creation Naming
When you're defining a new category (not competing in an existing one), the name often IS the category anchor.

**Examples:**
- **Salesforce** didn't join "CRM" — they anchored "cloud computing." The name combined the buyer's world (sales) with the value prop (force).
- **Gong** created "revenue intelligence" — the name became category shorthand ("we need a Gong-like tool").

**The technique:** Ask: "Joining an existing category or creating one?" If creating: the name must be distinctive enough to become synonymous with the space. Generic/descriptive names can't anchor categories. Evocative, found-word, and coined names can.

### Sales Conversation Fit
B2B names live in formal speech contexts consumer names never touch.

| Context | Template | What to check |
|---|---|---|
| **Elevator pitch** | "We use [name] to [verb]" | Natural flow? |
| **Board presentation** | "[Name] is our platform for [domain]" | Authority? |
| **RFP response** | "The [name] platform provides..." | Enterprise-grade? |
| **Slack/Teams** | "Can you check [name]?" | Short enough for chat? |
| **Phone call** | "I'm calling from [name]" | Pronounceable first-hearing? |
| **Email signature** | "VP Engineering at [name]" | Would a senior leader feel proud? |

### Integration / Ecosystem Naming
B2B products live in stacks. The name must look peer-level alongside the customer's tools.

**The stack test:**
```
[Your name] + Salesforce + Snowflake + Databricks + AWS
```
Does it belong? Or look like the junior partner?

**Integration grammar to test:** "[Name] for Salesforce," "[Name] + Snowflake," "Powered by [Name]," "[Name] Connect / API"

### Analyst / Press Headline Testing
Test in high-stakes formal contexts:
- "Gartner names [Name] a Leader in the [Category] Magic Quadrant"
- "[Name] raises $50M Series B to transform [industry]"
- "[Name] named to Forbes Cloud 100"

Does the name carry enough weight? Too casual → sounds like consumer. Too generic → sounds like a placeholder.

### Enterprise Objection Preemption
Fortune 500 procurement teams need to feel SAFE. The name is often the first trust signal.

**The CISO test:** "Would a Fortune 500 CISO feel comfortable approving a vendor called [name]?"
**The resume test:** "Would a VP of Engineering put '[Name]' on their LinkedIn?"

If there's ANY hesitation, the name has an enterprise trust problem.

### Platform vs Point-Solution Naming

| Type | Strategy | Examples |
|---|---|---|
| **Platform** | Abstract/evocative. Must NOT describe a single function. | Salesforce, Palantir, Notion |
| **Point solution** | Can be more descriptive/function-suggestive. | Calendly, Grammarly, Loom |
| **Platform-aspirant** | Start point-solution, plan platform. Name for the platform. | Slack (messaging → platform) |

**The expansion test:** "If we add a completely different product in 2 years, does the name still work?"

### Developer / Technical Credibility Signaling

**Developer-credible patterns:** Short found words (Stripe, Fly, Deno, Bun), lowercase convention (vercel, supabase), technical vocabulary (Vector, Prisma, Tensor), CLI-friendly (easy to type as a command)

**Business-buyer-credible patterns:** Title case (Salesforce, Workday), institutional compounds (HubSpot, Datadog), familiar enough for non-technical buyers

**The sweet spot:** Names technically credible without being exclusionary. Stripe achieves both — engineers respect it AND business buyers trust it.

### Acronym Resilience
B2B names get shortened. Plan for it.

**Tests:**
- What are the natural initials? Do they conflict with generic acronyms (AI, HR, CRM)?
- Is the abbreviation pronounceable? SNOW (ServiceNow) works. HBSP doesn't.
- Will people shorten the name and lose distinctiveness? "Signalworks" → "Signal" internally = problem.

### Partner / Channel Naming Grammar
Test partnership grammar before committing:
- "[Name] Certified Partner"
- "[Name] for Healthcare"
- "[Name] + AWS" / "Built on [Name]"
- "[Name] University" / "[Name] Marketplace"

Short, compound-ready names partner well. Long names or names with prepositions don't.

### Internal-Champion Forwardability
In B2B, deals advance through internal advocacy. The champion must feel comfortable forwarding the name up, down, and across the org.

**The test:** Imagine the champion typing these messages:
- Slack: "Has anyone looked at [Name]? Could solve our [problem]."
- Email to VP: "I'd like to set up a demo with [Name] — they do [X]."
- In a meeting: "We should evaluate [Name] alongside [Competitor]."

**What to check:** Does the champion feel smart recommending it? Or does the name require explanation/defense? Names that make the champion look like they did good research (Snowflake, Datadog, Stripe) win over names that make them look like they fell for marketing (BuzzMetrics, SynergyFlow).

**Anti-pattern:** Names the champion can't forward without adding "...I know the name is weird, but hear me out." That qualifier kills internal momentum.

### Integration Topology Naming
When the product's core value IS interoperability — connecting systems, bridging data, routing workflows — use connection vocabulary as a naming SOURCE, not just a test.

**Semantic field to mine:**

| Concept | Words |
|---|---|
| **Connection** | Mesh, Bridge, Link, Weave, Fabric, Bond, Splice |
| **Flow/routing** | Relay, Conduit, Pipeline, Channel, Trunk, Circuit |
| **Aggregation** | Hub, Nexus, Confluence, Merge, Meld, Cluster |
| **Translation** | Cipher, Parse, Codec, Adapter, Render |
| **Orchestration** | Conductor, Compose, Chorus, Baton, Score, Tempo, Cadence, Harmony, Sequence, Fugue |
| **Autonomy/self-operation** | Automate, Pilot, Helm, Steer, Govern, Regulate, Sentinel, Daemon |

**Examples:** MuleSoft (mule = beast of burden carrying loads between systems), Boomi (boom = rapid expansion/connection), Confluent (confluence = rivers merging), Segment (data segmentation/routing)

**When to use:** Middleware, integration platforms, iPaaS, data pipelines, API management, ETL tools. NOT for products where integration is secondary.

### Trust-Without-Claims Lexicon
Enterprise buyers need reassurance, but over-claiming triggers skepticism, legal friction, or compliance issues. Build a positive vocabulary of trust that avoids regulated words.

**Words that signal trust WITHOUT over-claiming:**

| Energy | Words | Why they work |
|---|---|---|
| **Verification** | Attest, Verify, Certify, Validate, Confirm | Implies proof without promising outcomes |
| **Visibility** | Clear, Sight, View, Lens, Scope, Reveal | Implies transparency without guaranteeing security |
| **Control** | Govern, Steer, Helm, Command, Guard, Watch | Implies authority without promising protection |
| **Foundation** | Base, Core, Root, Ground, Anchor, Bedrock | Implies reliability without claiming invulnerability |
| **Precision** | True, Exact, Caliber, Mark, Point, Grade | Implies accuracy without promising perfection |

**Words that OVER-CLAIM (avoid for enterprise):** Guarantee, Secure, Safe, Shield, Protect, Defend, Invincible, Bulletproof, Foolproof — these trigger legal review, imply warranties, or sound like marketing rather than engineering.

**Examples of trust-without-claims done well:** Vanta (vantage/advantage without claiming security), OneTrust (trust is aspirational, not a warranty), AuditBoard (audit = verification, board = governance), Drata (derived from "demonstrate" — showing proof)

### Governance / Audit Vocabulary Mining
Enterprise software increasingly sells governance as much as functionality. Mine the governance semantic domain — it's the B2B equivalent of the consumer "ingredient/process" mining technique.

**Vocabulary by governance domain:**

| Domain | Words to mine |
|---|---|
| **Audit & evidence** | Attest, Ledger, Trail, Evidence, Record, Docket, Proof, Log |
| **Controls & policy** | Control, Policy, Rule, Gate, Check, Override, Exception, Threshold |
| **Compliance & standards** | Standard, Mark, Certify, Comply, Conform, Align, Accord |
| **Lineage & provenance** | Lineage, Trace, Origin, Source, Chain, Provenance, Heritage |
| **Risk & assessment** | Assess, Gauge, Score, Rate, Grade, Tier, Flag, Signal |

**Examples:** AuditBoard, Hyperproof, Drata, Vanta, TrustArc, LogicGate, Resolver

**When to use:** GRC (governance, risk, compliance), security, identity, data privacy, financial controls, SOX compliance, audit automation. Also valuable for any B2B product where "audit-ready" is a selling point.

### Vertical Code Calibration
Each B2B vertical has distinct trust thresholds, lexical norms, and naming patterns. A name that works in one vertical may feel wrong in another — not because of meaning, but because of register.

| Vertical | Naming codes | Trust signals | Example brands |
|---|---|---|---|
| **Fintech** | Short, precise, slightly playful OK. Numbers OK. | Speed, simplicity, modern | Ramp, Plaid, Brex, Stripe, Mercury |
| **Healthtech** | Clinical + warm. Latin roots OK. Must feel safe. | Evidence-based, careful, human | Abridge, Nabla, Headway, Olive, Hinge Health |
| **Legaltech** | Classical/institutional register, but the most successful brands are NOT Latin. Authority comes from phonetic weight and unexpected vocabulary, not etymology. The Lex-/Juris- pattern is exhausted. | Authoritative, precise, trustworthy | Clio (mythological), Harvey (personified), Everlaw (compound), Relativity (physics metaphor), Disco (found word) |
| **Cybersecurity (institutional)** | Military/intelligence vocabulary, compound names, institutional weight. Signals "we protect the Fortune 500." | Protection, vigilance, force | CrowdStrike, SentinelOne, Palo Alto Networks, Fortinet |
| **Cybersecurity (minimal-technical)** | Short, clever, developer-credible. Signals "built by engineers, not marketed by suits." | Precision, speed, simplicity | Wiz, Snyk, Vanta, Drata, Orca |
| **Proptech** | Material, architectural, structural. Must bridge tech + physical. | Durability, scale, real-world grounding | Procore, Fieldwire, PlanGrid, Matterport |
| **HR/People** | Warm, human, slightly approachable. Must not sound clinical. | People-first, culture, growth | Lattice, Rippling, Greenhouse, Lever, Culture Amp |
| **DevTools** | Terse, lowercase OK, CLI-friendly. Must signal engineering. | Technical depth, builder credibility | Vercel, Fly, Deno, Railway, Turso |

**The technique:** Identify the vertical. Study 10+ successful brands in that vertical. Extract the naming PATTERN — not individual names. Generate candidates that follow the vertical's pattern while being distinctive within it.

**Anti-pattern:** Using cybersecurity naming codes (dark, aggressive, military) for an HR platform, or HR codes (warm, people, culture) for a security tool. Vertical register mismatch is immediately detectable by buyers who live in that vertical daily.

---

## Compliance & Governance

### Regulated-Industry Lexical Compliance
Sector-specific forbidden or controlled terms:

| Sector | Controlled terms | Why |
|---|---|---|
| **Finance/Banking** | "bank," "trust," "guarantee," "secure," "insured," "deposit," "savings," "credit," "fund/funds," "capital," "treasury," "clearing," "settlement" | Implies regulatory status, FDIC coverage, or licensed financial institution |
| **Fintech/Payments** | "remittance" (implies licensed remitter), "exchange" (implies licensed exchange), "wallet" (regulatory in some jurisdictions), "financial" (when implying licensed status) | Varies by jurisdiction — see jurisdiction notes below |
| **Healthcare** | "medical," "clinical," "diagnostic," "therapy," "cure," "treatment," "prescription" | Implies clinical claims subject to FDA/FTC |
| **Insurance** | "coverage," "policy," "underwrite," "premium," "claims" | Implies licensed insurer status |
| **Legal** | "law," "attorney," "counsel," "legal advice" | Implies bar-licensed practice |
| **Education** | "university," "college," "degree," "certified," "accredited" | Implies accreditation |

**Jurisdiction-specific notes (for international naming):**
- **US:** FDIC restricts "bank," "savings," "trust." State regulators vary.
- **Brazil:** BACEN regulates use of "banco," "financeira," "seguro" (insurance). SUSEP regulates insurance terms.
- **Mexico:** CNBV restricts "banco," "financiera," "crédito." Use of "remesa" may imply licensed remitter.
- **Philippines:** BSP regulates "bank" and "remittance." E-money operators have separate naming constraints.
- **EU/UK:** FCA and ECB restrict "bank," "credit institution." PSD2 regulates payment service terminology.
- **Indonesia:** OJK regulates financial service naming. "Bank" requires a banking license.

Screen name candidates against these lists for the target industry AND jurisdiction before finalizing. For international products, check controlled terms in EACH target market's language.

### Name Lifecycle & Scenario Stress Tests
Evaluate how names age across pivots, acquisitions, and category shifts:

- "What if you expand from VC ops into banking workflows — does the name still work?"
- "What if you're acquired — does the name work as a product name under the acquirer's brand?"
- "What if a PR crisis involves the word in the name — is there a double meaning that becomes a liability?"
- "What if the name becomes a verb — is that verb positive? ('Let me sift that' vs. 'They got triaged')"

### Portfolio Defense & Variant Strategy
Plan defensive registrations alongside the primary name:

- Common misspellings of the chosen name
- Key TLDs (.com, .ai, .co, .io, .org)
- Social handle variants (@name, @getname, @namehq)
- Anti-phishing lookalikes
- Typo-redirect domains

---
