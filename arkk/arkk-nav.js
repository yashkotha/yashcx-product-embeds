/*
 * arkk-nav.js - collapsible main navigation (CANVAS-SPEC.md §4).
 * Linked (defer) on all 13 Arkk pages, alongside arkk.js. Mirrors arkk.js's
 * own conventions (DOM built with createElement/createElementNS, no HTML
 * strings, strict IIFE, honours prefers-reduced-motion via the attribute
 * transition already gated in arkk-nav.css).
 *
 * No hrefs are touched here - this file only toggles a root data attribute
 * and injects one button, so it cannot reintroduce the clean-URL routing
 * regression documented in NAV-DIAGNOSIS.md.
 */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var KEY = 'arkk.nav.collapsed';

  function icon(d) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  function isCollapsed() { return document.documentElement.dataset.navCollapsed === '1'; }

  function setCollapsed(on, btn) {
    if (on) document.documentElement.dataset.navCollapsed = '1';
    else delete document.documentElement.dataset.navCollapsed;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* storage unavailable - in-memory only */ }
    if (btn) {
      btn.setAttribute('aria-expanded', String(!on));
      btn.setAttribute('aria-label', on ? 'Expand navigation' : 'Collapse navigation');
      btn.title = on ? 'Expand navigation' : 'Collapse navigation';
    }
  }

  function boot() {
    var head = document.querySelector('.sidebar-head');
    if (!head) return;

    // Native tooltip on every nav item (readable when the label is hidden).
    document.querySelectorAll('.nav-item').forEach(function (a) {
      if (a.title) return;
      var t = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) a.title = t;
    });

    // Collapsed rail hides the workspace switcher, leaving only the logo
    // tile - carry the workspace name over as its tooltip.
    var logo = head.querySelector('.logo');
    if (logo && !logo.title) {
      var ws = head.querySelector('.ws-switch');
      var wsName = ws ? (ws.textContent || '').replace(/\s+/g, ' ').trim() : '';
      logo.title = wsName ? 'Workspace: ' + wsName : 'Workspace';
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'arkk-nav-toggle';
    btn.appendChild(icon('M15 5l-7 7 7 7'));
    setCollapsed(isCollapsed(), btn); // sync aria/title to the state the 4.1 guard already applied
    btn.addEventListener('click', function () { setCollapsed(!isCollapsed(), btn); });
    head.appendChild(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
