/*
 * Aucune infobulle dans le Cockpit ni dans la Console (demande du commanditaire, 10/10/2026).
 * Les infobulles du navigateur viennent de l'attribut `title` (et des éléments <title> des SVG) : ce module les retire dès
 * qu'ils apparaissent dans la page (rendu initial et mises à jour, grâce à un MutationObserver), quel que soit l'écran ou le
 * composant qui les pose. Leur texte n'est pas perdu pour l'accessibilité : un élément sans texte visible ni nom accessible
 * (bouton à icône, pastille…) le reçoit en `aria-label`. Chargé une seule fois par api.js (Cockpit), admin-api.js (Console)
 * et auth-api.js (pages de connexion).
 */
(function (root) {
  if (!root || !root.document || root.__riseSansInfobulles) return;
  root.__riseSansInfobulles = true;
  const SVG = 'http://www.w3.org/2000/svg';

  /** Nom accessible déjà fourni, ou texte visible : l'ancien titre ne sert pas. */
  const named = (el) => el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || (el.textContent || '').trim() !== '';

  /** Retire le titre d'un élément ; s'il n'a pas de nom, le titre devient son `aria-label`. */
  function strip(el) {
    const t = el.getAttribute('title');
    if (t == null) return;
    if (t.trim() && !named(el)) el.setAttribute('aria-label', t.trim());
    el.removeAttribute('title');
  }

  /** <title> d'un SVG : son texte passe au SVG parent s'il n'a pas de nom, puis il est vidé (sans retirer le nœud du rendu). */
  function stripSvgTitle(t) {
    const txt = (t.textContent || '').trim(), p = t.parentNode;
    if (!txt) return;
    if (p && p.setAttribute && !p.hasAttribute('aria-label')) p.setAttribute('aria-label', txt);
    t.textContent = '';
  }

  function sweep(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.hasAttribute('title')) strip(node);
    if (node.localName === 'title' && node.namespaceURI === SVG) stripSvgTitle(node);
    node.querySelectorAll('[title]').forEach(strip);
    node.querySelectorAll('title').forEach((t) => { if (t.namespaceURI === SVG) stripSvgTitle(t); });
  }

  function start() {
    sweep(root.document.body);
    new root.MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'attributes') { if (m.target.nodeType === 1) strip(m.target); }
        else if (m.type === 'characterData') { const p = m.target.parentNode; if (p && p.localName === 'title' && p.namespaceURI === SVG) stripSvgTitle(p); }
        else m.addedNodes.forEach(sweep);
      }
    }).observe(root.document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'], characterData: true });
  }

  if (root.document.body) start(); else root.document.addEventListener('DOMContentLoaded', start, { once: true });
})(typeof globalThis !== 'undefined' ? globalThis : this);
