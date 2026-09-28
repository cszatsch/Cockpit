/* RISE · IA — données de démonstration et règles métier partagées.
   Script classique : expose window.RISE_IA. À remplacer par les appels API (voir IA - specification.md). */
(function () {
  const PROVIDERS = [
    { id: 'anthropic', n: 'Anthropic', st: 'ok', lat: 392, logo: './assets/logos/lh-anthropic.svg', mono: true },
    { id: 'openai', n: 'OpenAI', st: 'ok', lat: 466, logo: './assets/logos/lh-openai.svg', mono: true },
    { id: 'mistral', n: 'Mistral AI', st: 'ok', lat: 523, logo: './assets/logos/lh-mistral-color.svg' },
    { id: 'google', n: 'Google', st: 'err', err: '401 · clé refusée', logo: './assets/logos/lh-gemini-color.svg' },
    { id: 'cohere', n: 'Cohere', st: 'ok', lat: 288, ini: 'Co', tint: '#39594d' }
  ];

  // cat : 'llm' | 'embedding' | 'reranking'
  // price.unit : 'tokens' (in, out en € / M tokens) | 'requests' (per1k en € / 1 000 requêtes)
  // rel : date de sortie ISO · maxOut : LLM uniquement · dims / dim : dimensions acceptées et par défaut (embedding)
  const MODELS = [
    { id: 'sonnet45', pv: 'anthropic', n: 'Claude Sonnet 4.5', d: 'Raisonnement et rédaction', cat: 'llm', rel: '2025-09-29', maxOut: 64000, price: { unit: 'tokens', in: 2.8, out: 14 }, act: true },
    { id: 'haiku45', pv: 'anthropic', n: 'Claude Haiku 4.5', d: 'Rapide et économique', cat: 'llm', rel: '2025-10-15', maxOut: 64000, price: { unit: 'tokens', in: 0.92, out: 4.6 }, act: true },
    { id: 'gpt5mini', pv: 'openai', n: 'GPT-5 mini', d: 'Polyvalent, faible coût', cat: 'llm', rel: '2025-08-07', maxOut: 128000, price: { unit: 'tokens', in: 0.23, out: 1.85 }, act: true },
    { id: 'mistralL2', pv: 'mistral', n: 'Mistral Large 2', d: 'Modèle européen', cat: 'llm', rel: '2024-07-24', maxOut: 32000, price: { unit: 'tokens', in: 1.85, out: 5.5 }, act: true },
    { id: 'gemini25pro', pv: 'google', n: 'Gemini 2.5 Pro', d: 'Long contexte', cat: 'llm', rel: '2025-06-17', maxOut: 65536, price: { unit: 'tokens', in: 1.15, out: 9.2 }, act: true },
    { id: 'te3large', pv: 'openai', n: 'text-embedding-3-large', d: 'Vecteurs 3 072 dimensions', cat: 'embedding', rel: '2024-01-25', dims: [3072, 1536, 1024, 512, 256], dim: 3072, price: { unit: 'tokens', in: 0.12 }, act: true },
    { id: 'mistralEmbed', pv: 'mistral', n: 'Mistral Embed', d: 'Vecteurs 1 024 dimensions', cat: 'embedding', rel: '2023-12-11', dims: [1024], dim: 1024, price: { unit: 'tokens', in: 0.09 }, act: true },
    { id: 'geminiEmb', pv: 'google', n: 'Gemini Embedding', d: 'Multilingue', cat: 'embedding', rel: '2025-07-14', dims: [3072, 1536, 768], dim: 3072, price: { unit: 'tokens', in: 0.14 }, act: true },
    { id: 'rerank35', pv: 'cohere', n: 'Rerank 3.5', d: 'Reclassement multilingue', cat: 'reranking', rel: '2024-12-02', price: { unit: 'requests', per1k: 1.85 }, act: true }
  ];

  // vol : volume réel des 30 derniers jours (M tokens ou requêtes) · est : estimation tant que vol est null (fonction sans historique ; req = questions / mois)
  // needOut : sortie maximale requise · isNew : badge « Nouveau » · scope : 'cockpit' (défaut) ou 'console'
  const FUNCTIONS = [
    { id: 'insights', n: 'Analyse des données et insights', sh: 'Insights', cat: 'llm', d: 'Lit les données du projet et produit les signaux, écarts et recommandations.', vol: { in: 6.8, out: 1.1 } },
    { id: 'gestion', n: 'Création, modification et suppression des données', sh: 'Gestion des données', cat: 'llm', d: 'Prépare les modifications demandées à Jev, l’assistant du Cockpit ; l’utilisateur les valide avant enregistrement.', vol: { in: 2.4, out: 0.6 } },
    { id: 'rapports', n: 'Génération de rapports', sh: 'Rapports', cat: 'llm', isNew: true, needOut: 38000, d: 'Rédige les rapports de comité, hebdomadaires et de phase.', vol: { in: 1.9, out: 0.9 } },
    { id: 'guidage', n: 'Guider l’utilisateur sur la console', sh: 'Guidage console', cat: 'llm', isNew: true, scope: 'console', d: 'Répond aux administrateurs : où se trouve un réglage, comment le configurer, quoi corriger.', vol: null, est: { in: 0.9, out: 0.25, req: 800 } },
    { id: 'doc_vec', group: 'documents', step: 1, n: 'Vectorisation', sh: 'Vectorisation', cat: 'embedding', d: 'Texte → vecteurs, pour la recherche sémantique.', vol: { in: 4.2 } },
    { id: 'doc_rrk', group: 'documents', step: 2, n: 'Reclassement', sh: 'Reclassement', cat: 'reranking', d: 'Trie les passages par pertinence.', vol: { req: 3150 } },
    { id: 'doc_syn', group: 'documents', step: 3, n: 'Synthèse', sh: 'Synthèse', cat: 'llm', d: 'Rédige décisions, actions, risques.', vol: { in: 3.9, out: 0.7 } }
  ];
  const GROUPS = { documents: { n: 'Documents', d: 'Le texte extrait suit la ligne de gauche à droite. Une station à l’arrêt éteint la suite.' } };

  const ASSIGN = {
    insights: { p: 'gemini25pro', f: 'sonnet45' },
    gestion: { p: 'sonnet45', f: 'gpt5mini' },
    rapports: { p: 'sonnet45', f: 'mistralL2' },
    guidage: { p: 'haiku45', f: 'gpt5mini' },
    doc_vec: { p: 'geminiEmb', f: '' },
    doc_rrk: { p: 'rerank35', f: '' },
    doc_syn: { p: 'haiku45', f: 'mistralL2' }
  };

  const CAT = { llm: { l: 'LLM', d: 'Génère du texte' }, embedding: { l: 'Embedding', d: 'Vectorise des textes' }, reranking: { l: 'Reranking', d: 'Reclasse des résultats' } };

  // ——— règles
  const nf = (v, d) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = v => v == null ? '—' : (v >= 10 ? nf(Math.round(v), 0) : nf(v, 2)) + ' €';
  const num = s => { const v = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : null; };

  const model = (models, id) => models.find(m => m.id === id) || null;
  const prov = (provs, id) => provs.find(p => p.id === id) || null;
  const usable = (m, provs) => !!m && m.act && (prov(provs, m.pv) || {}).st === 'ok';

  function cost(fn, m) {
    if (!m || !fn) return null; const p = m.price || {}, v = fn.vol || fn.est || {};
    if (p.unit === 'requests') return (v.req || 0) / 1000 * (p.per1k || 0);
    return (v.in || 0) * (p.in || 0) + (v.out || 0) * (p.out || 0);
  }
  function priceLabel(m) {
    const p = m.price || {};
    if (p.unit === 'requests') return nf(p.per1k, 2) + ' € / 1 000 req.';
    return p.out != null ? nf(p.in, 2) + ' · ' + nf(p.out, 2) + ' € / M' : nf(p.in, 2) + ' € / M entrée';
  }
  // Tarif court affiché dans la vue réseau
  const priceShort = m => { const p = m.price || {}; return p.unit === 'requests' ? nf(p.per1k, 2) + ' /1k' : nf(p.out != null ? p.out : p.in, 2); };

  // Ancienneté : < 12 mois récent · 12–24 à surveiller · > 24 ancien
  function age(rel, now) {
    if (!rel) return null; const d = new Date(rel), n = now || new Date();
    const mo = Math.max(0, (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth() - (n.getDate() < d.getDate() ? 1 : 0));
    const tier = mo < 12 ? 'recent' : mo <= 24 ? 'watch' : 'old';
    return { mo, tier, l: mo === 0 ? 'Ce mois-ci' : mo + ' mois', tierL: { recent: 'Récent', watch: 'À surveiller', old: 'Ancien' }[tier] };
  }

  // État brut : ok | fallback | down. Puis propagation dans un groupe : une étape down suspend les suivantes (blocked).
  function states(fns, asg, models, provs) {
    const raw = {}; fns.forEach(f => {
      const a = asg[f.id] || {}, p = model(models, a.p), s = model(models, a.f);
      const pOk = usable(p, provs), sOk = usable(s, provs);
      raw[f.id] = { st: pOk ? 'ok' : sOk ? 'fallback' : 'down', live: pOk ? p : sOk ? s : null, p, s, pOk, sOk };
    });
    const groups = {}; fns.filter(f => f.group).forEach(f => (groups[f.group] = groups[f.group] || []).push(f));
    Object.values(groups).forEach(list => {
      list.sort((a, b) => a.step - b.step); let stop = null;
      list.forEach(f => { if (stop) { raw[f.id].blockedBy = stop; raw[f.id].st0 = raw[f.id].st; raw[f.id].st = 'blocked'; } else if (raw[f.id].st === 'down') stop = f; });
    });
    return raw;
  }
  // Capacité de sortie : needOut = longueur du plus long rendu attendu (tokens)
  const kTok = v => v >= 1000 ? Math.round(v / 1000) + 'k' : String(v || 0);
  const fitsOut = (fn, m) => !fn || !fn.needOut || !m || m.cat !== 'llm' || (m.maxOut || 0) >= fn.needOut;
  const isEst = fn => !!fn && !fn.vol && !!fn.est;
  const catModels = (models, cat) => models.filter(m => m.cat === cat && m.act);
  // Embedding : dimension retenue (choix de l'affectation, sinon défaut du modèle) et réindexation.
  const dimOf = (a, models) => { const m = model(models, (a || {}).p); return !m || m.cat !== 'embedding' ? null : (+(a || {}).d || m.dim || null); };
  const reindex = (before, after, models) => !!(before && before.p) && (before.p !== (after || {}).p || dimOf(before, models) !== dimOf(after, models));
  const REINDEX_WARNING = "Changer de modèle d'embedding oblige à réindexer tous les documents. Chaque modèle a son propre espace vectoriel : les vecteurs de deux modèles différents ne sont pas compatibles, même s'ils ont la même dimension. Sans réindexation, la recherche renverra des résultats faux ou incohérents.";

  window.RISE_IA = { PROVIDERS, MODELS, FUNCTIONS, GROUPS, ASSIGN, CAT, eur, nf, num, model, prov, usable, cost, priceLabel, priceShort, age, states, catModels, dimOf, reindex, REINDEX_WARNING, kTok, fitsOut, isEst };
})();
