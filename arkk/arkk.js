/*
 * arkk.js - shared interaction layer for the Arkk v2/v3 screens.
 * Additive only: provides entrance choreography, count-up numerals, chart
 * draws and affirmative-commit feedback, plus per-page scoped behaviour.
 * All motion respects prefers-reduced-motion (see Arkk.reduce below).
 * DOM is built with createElement/textContent throughout - no HTML strings.
 */
(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Verification-only override: lets Gate 1 testing force the reduced-motion
     branch without OS-level emulation. Has no effect unless the param is present. */
  if (/[?&]force-reduced-motion=1/.test(location.search)) reduce = true;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, opts) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.cls) node.className = opts.cls;
    if (opts.text !== undefined) node.textContent = opts.text;
    if (opts.style) node.style.cssText = opts.style;
    if (opts.attrs) { for (var k in opts.attrs) node.setAttribute(k, opts.attrs[k]); }
    if (opts.type) node.type = opts.type;
    return node;
  }

  function icon(d, opts) {
    opts = opts || {};
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', opts.cls || 'ico-xs');
    svg.setAttribute('fill', opts.fill || 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', opts.strokeWidth || '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* -----------------------------------------------------------------------
     1. Reveal on load - staggers [data-reveal] elements in DOM order.
     ----------------------------------------------------------------------- */
  function revealOnLoad(root) {
    var els = Array.prototype.slice.call((root || document).querySelectorAll('[data-reveal]'));
    if (reduce) {
      els.forEach(function (n) { n.classList.add('in'); });
      return;
    }
    els.forEach(function (n, i) {
      var delay = Math.min(i * 45, 320);
      setTimeout(function () {
        requestAnimationFrame(function () { n.classList.add('in'); });
      }, delay);
    });
  }

  /* -----------------------------------------------------------------------
     2. Count-up numerals.
     ----------------------------------------------------------------------- */
  function formatNum(n, decimals) {
    var fixed = decimals ? n.toFixed(decimals) : Math.round(n).toString();
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function easeHouse(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(node, opts) {
    opts = opts || {};
    var to = opts.to !== undefined ? opts.to : parseFloat(node.getAttribute('data-count'));
    var decimals = opts.decimals !== undefined ? opts.decimals : parseInt(node.getAttribute('data-count-decimals') || '0', 10);
    var prefix = opts.prefix !== undefined ? opts.prefix : (node.getAttribute('data-count-prefix') || '');
    var suffix = opts.suffix !== undefined ? opts.suffix : (node.getAttribute('data-count-suffix') || '');
    var duration = opts.duration || 900;
    if (isNaN(to)) return;

    /* Only the leading text node is written so a nested unit/pct <span>
       already in the markup is preserved untouched. */
    var textNode = node.firstChild;
    if (!textNode || textNode.nodeType !== 3) {
      textNode = document.createTextNode('');
      node.insertBefore(textNode, node.firstChild);
    }

    if (reduce) {
      textNode.nodeValue = prefix + formatNum(to, decimals) + suffix;
      return;
    }

    var from = opts.from !== undefined ? opts.from : 0;
    var start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var val = from + (to - from) * easeHouse(p);
      textNode.nodeValue = prefix + formatNum(val, decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function countUpOnView(node) {
    if (reduce || !('IntersectionObserver' in window)) { countUp(node); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { countUp(node); io.unobserve(node); }
      });
    }, { threshold: 0.4 });
    io.observe(node);
  }

  function initCountUps(root) {
    (root || document).querySelectorAll('[data-count]').forEach(function (n) { countUpOnView(n); });
  }

  /* -----------------------------------------------------------------------
     3. Chart draws - bar/fill growth, sparkline line-draw, ring draw.
     ----------------------------------------------------------------------- */
  function animateBar(node, delay) {
    var to = node.getAttribute('data-to');
    if (!to) return;
    var prop = node.getAttribute('data-prop') || (node.classList.contains('m-bar') ? 'height' : 'width');
    if (reduce) { node.style[prop] = to; return; }
    node.style.transition = 'none';
    node.style[prop] = '0%';
    setTimeout(function () {
      requestAnimationFrame(function () {
        node.style.transition = prop + ' 600ms var(--ease-house)';
        node.style[prop] = to;
      });
    }, delay || 0);
  }

  function drawSpark(svg, delay) {
    var line = svg.querySelector('path.line');
    if (!line || svg.dataset.drawn === '1') return;
    svg.dataset.drawn = '1';
    var len = 0;
    try { len = line.getTotalLength(); } catch (e) { return; }
    if (reduce) return;
    line.style.strokeDasharray = String(len);
    line.style.strokeDashoffset = String(len);
    setTimeout(function () {
      requestAnimationFrame(function () {
        line.style.transition = 'stroke-dashoffset 700ms var(--ease-house)';
        line.style.strokeDashoffset = '0';
      });
    }, delay || 0);
  }

  function drawRing(circle, delay) {
    var dasharray = circle.getAttribute('stroke-dasharray');
    if (!dasharray || circle.dataset.drawn === '1') return;
    circle.dataset.drawn = '1';
    var parts = dasharray.split(/[\s,]+/).map(parseFloat);
    var total = parts[0] + (parts[1] || 0);
    if (reduce) return;
    circle.style.strokeDashoffset = String(total);
    setTimeout(function () {
      requestAnimationFrame(function () {
        circle.style.transition = 'stroke-dashoffset 900ms var(--ease-house)';
        circle.style.strokeDashoffset = '0';
      });
    }, delay || 0);
  }

  function drawChart(root) {
    root = root || document;
    root.querySelectorAll('[data-to]').forEach(function (n, i) { animateBar(n, Math.min(i * 60, 480)); });
    root.querySelectorAll('.spark, svg.spark').forEach(function (svg, i) { drawSpark(svg, Math.min(i * 60, 480)); });
    root.querySelectorAll('.score-ring .fill').forEach(function (c) { drawRing(c, 120); });
  }

  /* -----------------------------------------------------------------------
     4. Commit - affirmative-action spring pop.
     ----------------------------------------------------------------------- */
  function commit(btn) {
    if (!btn || reduce) return;
    btn.classList.remove('committed');
    void btn.offsetWidth;
    btn.classList.add('committed');
    btn.addEventListener('animationend', function handler() {
      btn.classList.remove('committed');
      btn.removeEventListener('animationend', handler);
    });
  }

  function wireCommitButtons(root) {
    (root || document).querySelectorAll('[data-commit]').forEach(function (btn) {
      if (btn.dataset.commitWired === '1') return;
      btn.dataset.commitWired = '1';
      btn.addEventListener('click', function () { commit(btn); });
    });
  }

  function setLeadingText(node, text) {
    if (node.firstChild && node.firstChild.nodeType === 3) node.firstChild.nodeValue = text;
    else node.insertBefore(document.createTextNode(text), node.firstChild);
  }

  window.Arkk = {
    reduce: reduce, el: el, icon: icon, clear: clear,
    revealOnLoad: revealOnLoad, countUp: countUp, countUpOnView: countUpOnView, initCountUps: initCountUps,
    drawChart: drawChart, animateBar: animateBar, drawSpark: drawSpark, drawRing: drawRing,
    commit: commit, wireCommitButtons: wireCommitButtons, setLeadingText: setLeadingText, formatNum: formatNum
  };

  /* =========================================================================
     WAVE 2 - "Close the Quarter" flow persistence (Arkk.flow)
     Schema: { exceptionsCleared, dryRun, warningResolved, posted }
     Missing key / parse failure = all-false fresh-quarter default (defensive).
     ========================================================================= */
  var FLOW_KEY = 'arkk.flow.q4';
  function flowDefault() { return { exceptionsCleared: false, dryRun: null, warningResolved: false, posted: false }; }
  function flowGet() {
    var def = flowDefault();
    try {
      var raw = localStorage.getItem(FLOW_KEY);
      if (!raw) return def;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return def;
      return {
        exceptionsCleared: !!parsed.exceptionsCleared,
        dryRun: parsed.dryRun || null,
        warningResolved: !!parsed.warningResolved,
        posted: !!parsed.posted
      };
    } catch (e) { return def; }
  }
  function flowSet(patch) {
    var next = flowGet();
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k]; }
    try { localStorage.setItem(FLOW_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable - state stays in-memory for this load only */ }
    return next;
  }
  function flowReset() {
    try { localStorage.removeItem(FLOW_KEY); } catch (e) { /* no-op */ }
  }
  window.Arkk.flow = { get: flowGet, set: flowSet, reset: flowReset };

  /* =========================================================================
     WAVE 1 - shared toast surface, promoted out of the old private closure
     inside initQuietNav() so Arkk.toast(msg) can be reused by every real
     commit action (export, save, sync...), not just the data-quiet stub
     fallback. Same visual surface either way - one styled confirmation
     mechanism for the whole app.
     ========================================================================= */
  var toastState = { node: null, hideTimer: null };
  function buildToast() {
    var root = el('div', {
      cls: 'arkk-quiet-toast',
      style: 'position:fixed; right:20px; bottom:20px; z-index:600; max-width:320px;' +
             'display:flex; align-items:flex-start; gap:10px; padding:14px 14px 14px 16px;' +
             'background:oklch(100% 0 0 / 0.92); border:1px solid var(--line); border-radius:var(--r-lg);' +
             'box-shadow:var(--shadow-pop); backdrop-filter:saturate(140%) blur(14px); -webkit-backdrop-filter:saturate(140%) blur(14px);' +
             'opacity:0; transform:translateY(6px); pointer-events:none;' +
             'transition:opacity var(--dur-ui) var(--ease-house), transform var(--dur-ui) var(--ease-house);'
    });
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    var badge = el('span', { style: 'flex:0 0 auto; width:28px; height:28px; border-radius:8px; background:var(--bg-2); color:var(--ink-3); display:grid; place-items:center;' });
    badge.appendChild(icon('M12 8v4M12 16h.01', { cls: 'ico-xs', strokeWidth: '2.2' }));
    var body = el('div', { style: 'flex:1; min-width:0;' });
    var title = el('div', { style: 'font-size:13px; font-weight:500; color:var(--ink);' });
    var sub = el('div', { style: 'font-size:12.5px; color:var(--ink-3); margin-top:2px;' });
    body.appendChild(title); body.appendChild(sub);
    var closeBtn = el('button', { type: 'button', style: 'flex:0 0 auto; width:22px; height:22px; margin:-2px -2px 0 0; border-radius:6px; border:0; background:transparent; color:var(--ink-4); cursor:pointer; display:grid; place-items:center;' });
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.appendChild(icon('M6 6l12 12M6 18L18 6', { cls: 'ico-xs' }));
    closeBtn.addEventListener('click', hideToast);
    root.appendChild(badge); root.appendChild(body); root.appendChild(closeBtn);
    document.body.appendChild(root);
    return { root: root, title: title, sub: sub };
  }
  function hideToast() {
    if (!toastState.node) return;
    toastState.node.root.style.opacity = '0';
    toastState.node.root.style.transform = 'translateY(6px)';
    toastState.node.root.style.pointerEvents = 'none';
  }
  function showToast(msg, opts) {
    opts = opts || {};
    if (!toastState.node) toastState.node = buildToast();
    toastState.node.title.textContent = msg;
    toastState.node.sub.textContent = opts.sub || '';
    toastState.node.sub.style.display = opts.sub ? '' : 'none';
    clearTimeout(toastState.hideTimer);
    requestAnimationFrame(function () {
      toastState.node.root.style.opacity = '1';
      toastState.node.root.style.transform = 'translateY(0)';
      toastState.node.root.style.pointerEvents = 'auto';
    });
    toastState.hideTimer = setTimeout(hideToast, opts.duration || 3400);
  }
  window.Arkk.toast = showToast;

  /* =========================================================================
     WAVE 1 - Arkk.store(key, default) -> namespaced localStorage get/set/reset.
     Defensive: a missing key or a parse failure always returns a fresh
     default, never throws, never leaves a page in a broken state.
     ========================================================================= */
  function makeStore(key, def) {
    function freshDefault() {
      if (typeof def === 'function') return def();
      try { return JSON.parse(JSON.stringify(def)); } catch (e) { return def; }
    }
    function get() {
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return freshDefault();
        var parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return freshDefault();
        return parsed;
      } catch (e) { return freshDefault(); }
    }
    function set(value, replace) {
      var next = replace ? value : get();
      if (!replace) { for (var k in value) { if (Object.prototype.hasOwnProperty.call(value, k)) next[k] = value[k]; } }
      try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) { /* storage unavailable - in-memory only for this load */ }
      return next;
    }
    function reset() {
      try { localStorage.removeItem(key); } catch (e) { /* no-op */ }
      return freshDefault();
    }
    return { get: get, set: set, reset: reset, key: key };
  }
  window.Arkk.store = makeStore;

  function resetAll() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) {
        if (k === 'arkk.nav.collapsed') return;
        if (k === 'arkk_pending_exceptions' || /^arkk\./.test(k)) localStorage.removeItem(k);
      });
    } catch (e) { /* no-op - nothing to clear */ }
  }
  window.Arkk.resetAll = resetAll;

  /* =========================================================================
     WAVE 1 - Arkk.activity - append-only session/local activity log, read by
     the History drawer (arkk-chrome.js) and any page that wants to log a
     real user action (export, post, resolve, generate...).
     ========================================================================= */
  var activityStore = makeStore('arkk.activity.v1', function () { return []; });
  function activityLog(evt) {
    var list = activityStore.get();
    if (!Array.isArray(list)) list = [];
    var entry = { ts: Date.now(), kind: (evt && evt.kind) || 'nav', title: (evt && evt.title) || '', meta: (evt && evt.meta) || '', href: (evt && evt.href) || '' };
    list.unshift(entry);
    if (list.length > 60) list.length = 60;
    activityStore.set(list, true);
    return entry;
  }
  function activityAll() {
    var l = activityStore.get();
    return Array.isArray(l) ? l : [];
  }
  window.Arkk.activity = { log: activityLog, all: activityAll };

  /* =========================================================================
     WAVE 1 - Arkk.download / Arkk.exportCSV - real Blob downloads, no dead
     links. Every "Export"/"Download" affordance in the app routes through
     one of these two so the behaviour (toast + activity log) is consistent.
     ========================================================================= */
  function csvEscape(v) {
    var s = (v === undefined || v === null) ? '' : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function triggerDownload(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { style: 'display:none;' });
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }
  function exportCSV(filename, headers, rows) {
    var lines = [headers.map(csvEscape).join(',')];
    rows.forEach(function (r) { lines.push(r.map(csvEscape).join(',')); });
    triggerDownload(filename, lines.join('\r\n'), 'text/csv;charset=utf-8');
    showToast('Exported ' + filename);
    activityLog({ kind: 'export', title: 'Exported ' + filename });
  }
  window.Arkk.download = triggerDownload;
  window.Arkk.exportCSV = exportCSV;

  /* =========================================================================
     WAVE 1 - Arkk.overlay(opts) - shared glass overlay primitive (centered
     palette/modal OR right drawer). Used by arkk-chrome.js for every shared
     surface (palette, notifications, history, workspace, account, help) and
     available to any page script that needs an inline overlay. Handles
     backdrop, Esc, focus, scroll-lock and prefers-reduced-motion final state.
     Only one overlay open at a time - opening a second closes the first.
     ========================================================================= */
  var overlayState = { current: null };
  function closeOverlay(instant) {
    if (!overlayState.current) return;
    var inst = overlayState.current;
    overlayState.current = null;
    document.removeEventListener('keydown', inst._onKey, true);
    inst.backdrop.removeEventListener('click', inst._onBackdrop);
    document.body.style.overflow = inst._prevOverflow || '';
    function remove() { if (inst.backdrop.parentNode) inst.backdrop.parentNode.removeChild(inst.backdrop); }
    if (reduce || instant) {
      remove();
    } else {
      inst.backdrop.style.opacity = '0';
      inst.panel.style.opacity = '0';
      inst.panel.style.transform = inst._closedTransform;
      setTimeout(remove, 200);
    }
    if (inst._trigger && typeof inst._trigger.focus === 'function') { try { inst._trigger.focus(); } catch (e) { /* trigger no longer focusable */ } }
    if (typeof inst._onClose === 'function') inst._onClose();
  }
  function openOverlay(opts) {
    opts = opts || {};
    if (overlayState.current) closeOverlay(true);
    var mode = opts.mode === 'drawer' ? 'drawer' : 'palette';
    var backdrop = el('div', {
      cls: 'arkk-overlay-backdrop',
      style: 'position:fixed; inset:0; z-index:550; background:oklch(18% 0.02 254 / 0.32); backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px);' +
             'display:flex; ' + (mode === 'drawer' ? 'justify-content:flex-end; align-items:stretch;' : 'justify-content:center; align-items:flex-start; padding-top:12vh;') +
             'opacity:0; transition:opacity var(--dur-ui) var(--ease-house);'
    });
    var openTransform, closedTransform, panelBaseStyle;
    if (mode === 'drawer') {
      openTransform = 'translateX(0)'; closedTransform = 'translateX(14px)';
      panelBaseStyle = 'width:min(420px,94vw); height:100%; border-radius: var(--r-lg) 0 0 var(--r-lg);';
    } else {
      openTransform = 'translateY(0)'; closedTransform = 'translateY(6px)';
      panelBaseStyle = 'width:min(640px,92vw); max-width:640px; max-height:76vh; border-radius: var(--r-lg);';
    }
    var panel = el('div', {
      cls: 'arkk-overlay-panel',
      style: panelBaseStyle + ' background: oklch(100% 0 0 / 0.92); backdrop-filter:saturate(140%) blur(16px); -webkit-backdrop-filter:saturate(140%) blur(16px);' +
             'border:1px solid var(--line); box-shadow: var(--shadow-pop); display:flex; flex-direction:column; overflow:hidden;' +
             'opacity:0; transform:' + closedTransform + '; transition:opacity var(--dur-ui) var(--ease-house), transform var(--dur-ui) var(--ease-house);'
    });
    panel.setAttribute('role', opts.role || 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('tabindex', '-1');
    if (opts.label) panel.setAttribute('aria-label', opts.label);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onBackdropClick(e) { if (e.target === backdrop) closeOverlay(); }
    backdrop.addEventListener('click', onBackdropClick);
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); } }
    document.addEventListener('keydown', onKey, true);

    var inst = {
      backdrop: backdrop, panel: panel, _onBackdrop: onBackdropClick, _onKey: onKey,
      _prevOverflow: prevOverflow, _closedTransform: closedTransform,
      _trigger: opts.trigger || null, _onClose: opts.onClose
    };
    overlayState.current = inst;

    if (reduce) {
      backdrop.style.transition = 'none'; panel.style.transition = 'none';
      backdrop.style.opacity = '1'; panel.style.opacity = '1'; panel.style.transform = openTransform;
    } else {
      requestAnimationFrame(function () {
        backdrop.style.opacity = '1';
        panel.style.opacity = '1';
        panel.style.transform = openTransform;
      });
    }

    if (opts.focus !== false) {
      setTimeout(function () {
        var target = panel.querySelector('[data-autofocus]') || panel;
        try { target.focus(); } catch (e) { /* not focusable - overlay itself still traps Esc/backdrop */ }
      }, reduce ? 0 : 60);
    }

    return { root: panel, body: panel, backdrop: backdrop, close: closeOverlay };
  }
  window.Arkk.overlay = openOverlay;
  window.Arkk.overlayClose = closeOverlay;

  /* =========================================================================
     PAGE: index.html - period switcher (q-tabs) + entity leaderboard links
     ========================================================================= */
  function initIndex() {
    var quarters = document.querySelector('.quarters');
    if (!quarters) return;

    var PERIODS = {
      'Q4 2024': { score: 62, dash: '163.4 263.9', entities: 186, ccs: 1284 },
      'Q3 2024': { score: 48, dash: '126.7 263.9', entities: 181, ccs: 1240 }
    };

    var heroCard = document.querySelector('.hero-card');
    var heroClone = heroCard ? heroCard.cloneNode(true) : null;
    var scoreNum = document.querySelector('.score-num');
    var ring = document.querySelector('.score-ring .fill');
    var statVals = document.querySelectorAll('.stats .score-card .v');

    function restoreHero() {
      if (!heroCard || heroCard.dataset.empty !== '1') return;
      clear(heroCard);
      Array.prototype.forEach.call(heroClone.childNodes, function (n) { heroCard.appendChild(n.cloneNode(true)); });
      heroCard.dataset.empty = '';
      wireCommitButtons(heroCard);
      scoreNum = heroCard.querySelector('.score-num');
      ring = heroCard.querySelector('.score-ring .fill');
    }

    function showNoData(label) {
      if (!heroCard) return;
      heroCard.dataset.empty = '1';
      clear(heroCard);
      var wrap = el('div', { style: 'display:flex; flex-direction:column; gap:14px; align-items:flex-start; padding:8px 4px;' });
      var eyebrow = el('div', { cls: 'mono', text: 'No data yet', style: 'font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-3);' });
      var p = el('p', { text: label + ' has not been calculated in this workspace. Run a calculation to populate the period score, phases and stats.', style: 'margin:0; font-size:14px; color:var(--ink-2); max-width:44ch;' });
      var btn = el('button', { cls: 'btn primary', text: 'Calculate ' + label, type: 'button' });
      btn.setAttribute('data-commit', '');
      wrap.appendChild(eyebrow); wrap.appendChild(p); wrap.appendChild(btn);
      heroCard.appendChild(wrap);
      wireCommitButtons(heroCard);
      btn.addEventListener('click', function () { setTimeout(restoreHero, reduce ? 0 : 260); });
    }
    /* Exposed so initQuarterFlow's "Start Q1 2025" empty-state button (D5) can
       reuse this frozen empty-period path instead of inventing a new screen. */
    window.__arkkShowNoData = showNoData;

    quarters.querySelectorAll('.q-tab').forEach(function (tab) {
      tab.addEventListener('click', function (e) {
        e.preventDefault();
        if (tab.classList.contains('active')) return;
        quarters.querySelectorAll('.q-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var label = tab.textContent.trim();
        var data = PERIODS[label];
        if (!data) { showNoData(label); return; }
        restoreHero();
        if (scoreNum) countUp(scoreNum, { to: data.score, from: parseFloat(scoreNum.firstChild ? scoreNum.firstChild.nodeValue : 0) || 0, duration: 500 });
        if (ring) { ring.setAttribute('stroke-dasharray', data.dash); ring.dataset.drawn = ''; drawRing(ring, 0); }
        if (statVals.length >= 2) {
          countUp(statVals[0], { to: data.entities, duration: 500 });
          countUp(statVals[1], { to: data.ccs, duration: 500 });
        }
      });
    });

    /* E.2 - pipeline "Data feeds" step (step 1, done) opens data-sources.html */
    var dataFeedsStep = document.querySelector('.pipeline .step.done');
    if (dataFeedsStep && /Data feeds/.test(dataFeedsStep.textContent)) {
      dataFeedsStep.style.cursor = 'pointer';
      dataFeedsStep.addEventListener('click', function () { window.location.href = 'data-sources.html'; });
    }

    var slugs = ['connect-finco', 'northgate-solutions', 'connect-bidco', 'northgate-dooel', 'new-wave'];
    document.querySelectorAll('table.leaderboard tbody tr').forEach(function (row, i) {
      var slug = slugs[i] || slugs[0];
      row.style.cursor = 'pointer';
      row.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        window.location.href = 'entity?e=' + slug;
      });
    });
  }

  /* =========================================================================
     PAGE: matrix.html - cell click navigates to matrix-edit with a fast press
     ========================================================================= */
  function initMatrix() {
    var matrix = document.querySelector('table.matrix');
    if (!matrix) return;
    matrix.querySelectorAll('td.cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        if (reduce) { window.location.href = 'matrix-edit.html'; return; }
        cell.style.transition = 'transform 120ms var(--ease-house)';
        cell.style.transform = 'scale(0.99)';
        setTimeout(function () {
          cell.style.transform = 'scale(1)';
          setTimeout(function () { window.location.href = 'matrix-edit.html'; }, 90);
        }, 120);
      });
    });
  }

  /* =========================================================================
     PAGE: matrix-edit.html - rule picker recomputes impact + estimated change
     ========================================================================= */
  function initMatrixEdit() {
    var grid = document.querySelector('.rule-grid');
    if (!grid) return;

    var RULES = {
      'markup-7': { delta: 0.0,  status: 'No change to uplift', tone: 'queued', scale: 1.0 },
      'markup-5': { delta: -1.1, status: 'Reduces uplift to IGL', tone: 'danger', scale: 0.82 },
      'at-cost':  { delta: -2.7, status: 'Reduces uplift to IGL', tone: 'danger', scale: 0.55 },
      'exclude':  { delta: -3.8, status: 'Reduces uplift to IGL', tone: 'danger', scale: 0.0 },
      'ignore':   { delta: -3.8, status: 'Reduces uplift to IGL', tone: 'danger', scale: 0.0 }
    };

    var unsaved = document.querySelector('.unsaved-indicator');
    var signEl = document.querySelector('.est-sign');
    var numEl = document.querySelector('.est-num');
    var statusPill = document.querySelector('.est-status');
    var bars = document.querySelectorAll('.bar-fill');
    var barBaseWidths = Array.prototype.map.call(bars, function (b) { return parseFloat(b.style.width) || 0; });

    function ruleKeyFromOption(opt) {
      var pill = opt.querySelector('.pill');
      if (!pill) return 'ignore';
      var m = pill.className.match(/pill (\S+)/);
      return m ? m[1] : 'ignore';
    }

    grid.querySelectorAll('.rule-option').forEach(function (opt) {
      opt.addEventListener('click', function (e) {
        e.preventDefault();
        if (opt.classList.contains('selected')) return;
        grid.querySelectorAll('.rule-option').forEach(function (o) { o.classList.remove('selected'); });
        opt.classList.add('selected');

        var key = ruleKeyFromOption(opt);
        var rule = RULES[key] || RULES.ignore;
        if (unsaved) unsaved.hidden = false;

        if (signEl) signEl.textContent = rule.delta <= 0 ? '−' : '+';
        if (numEl) countUp(numEl, { to: Math.abs(rule.delta), decimals: 1, duration: 500 });
        if (statusPill) { statusPill.className = 'status-pill est-status ' + rule.tone; statusPill.textContent = rule.status; }

        bars.forEach(function (bar, i) {
          bar.style.transition = 'width 500ms var(--ease-house)';
          bar.style.width = (barBaseWidths[i] * rule.scale) + '%';
        });
      });
    });

    document.querySelectorAll('.btn.primary').forEach(function (btn) {
      if (/Save/.test(btn.textContent)) {
        btn.addEventListener('click', function () {
          commit(btn);
          if (unsaved) unsaved.hidden = true;
          setTimeout(function () { window.location.href = 'matrix.html'; }, reduce ? 0 : 420);
        });
      }
    });

    var discardBtn = Array.prototype.filter.call(document.querySelectorAll('.btn'), function (b) { return b.textContent.trim() === 'Discard'; })[0];
    if (discardBtn) {
      discardBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!unsaved || unsaved.hidden) { window.location.href = 'matrix.html'; return; }
        if (document.querySelector('.discard-confirm')) return;
        var row = el('div', { cls: 'discard-confirm', style: 'display:flex; align-items:center; gap:10px; padding:10px 14px; margin:-8px 0 16px; background:var(--bg-2); border-radius:10px; font-size:13px; color:var(--ink-2);' });
        var label = el('span', { text: 'Discard changes to this rule?' });
        var actions = el('span', { style: 'margin-left:auto; display:flex; gap:8px;' });
        var keep = el('button', { cls: 'btn soft', text: 'Keep editing', type: 'button' });
        var go = el('button', { cls: 'btn', text: 'Discard', type: 'button' });
        actions.appendChild(keep); actions.appendChild(go);
        row.appendChild(label); row.appendChild(actions);
        document.querySelector('.page-head').insertAdjacentElement('afterend', row);
        keep.addEventListener('click', function () { row.remove(); });
        go.addEventListener('click', function () { window.location.href = 'matrix.html'; });
      });
    }
  }

  /* =========================================================================
     PAGE: hierarchy.html - twirl expand/collapse + drag-to-reparent
     ========================================================================= */
  function initHierarchy() {
    var tree = document.querySelector('.tree');
    if (!tree) return;

    tree.querySelectorAll('.twirl:not(.empty)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.tree-row');
        var indent = row.nextElementSibling;
        if (!indent || !indent.classList.contains('indent')) return;
        var open = row.classList.toggle('open');
        btn.style.transition = 'transform var(--dur-micro) var(--ease-house)';
        btn.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
        if (reduce) { indent.style.maxHeight = open ? 'none' : '0'; indent.style.overflow = open ? 'visible' : 'hidden'; return; }
        if (open) {
          indent.style.overflow = 'hidden';
          indent.style.maxHeight = '0px';
          requestAnimationFrame(function () {
            indent.style.transition = 'max-height 260ms var(--ease-house)';
            indent.style.maxHeight = indent.scrollHeight + 'px';
          });
          setTimeout(function () { indent.style.maxHeight = 'none'; indent.style.overflow = 'visible'; }, 280);
        } else {
          indent.style.maxHeight = indent.scrollHeight + 'px';
          indent.style.overflow = 'hidden';
          requestAnimationFrame(function () {
            indent.style.transition = 'max-height 260ms var(--ease-house)';
            indent.style.maxHeight = '0px';
          });
        }
      });
    });

    var indent = tree.querySelector('.indent .indent');
    if (!indent) return;
    var dropLine = indent.querySelector('.drop-line');
    var leaves = Array.prototype.filter.call(indent.querySelectorAll('.tree-row'), function (r) { return !r.classList.contains('dragging'); });
    var moveFromEl = document.querySelector('.move-summary .nest:not(.to) .nm');
    var moveToEl = document.querySelector('.move-summary .nest.to .nm');
    var unsavedTag = document.querySelector('.card-head .unsaved-indicator');

    function showInvalidDropNote() {
      if (document.querySelector('.invalid-drop-note')) return;
      var note = el('div', { cls: 'invalid-drop-note', style: 'display:flex; align-items:center; gap:10px; margin-top:10px; padding:10px 12px; background:var(--bg-2); border-radius:8px; font-size:12px; color:var(--ink-2);' });
      var text = el('span', { text: 'You cannot move a rollup into one of its own children.' });
      var btn = el('button', { cls: 'btn ghost', text: 'Got it', type: 'button', style: 'padding:3px 8px; font-size:11px; margin-left:4px;' });
      note.appendChild(text); note.appendChild(btn);
      document.querySelector('.move-summary').parentElement.appendChild(note);
      btn.addEventListener('click', function () { note.remove(); });
    }

    leaves.forEach(function (row) {
      row.style.cursor = 'grab';
      row.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        var startY = e.clientY;
        var moved = false;

        function onMove(ev) {
          var dy = ev.clientY - startY;
          if (!moved && Math.abs(dy) < 4) return;
          if (!moved) {
            moved = true;
            row.style.transition = 'none';
            row.style.position = 'relative';
            row.style.zIndex = '5';
            row.style.background = 'var(--surface)';
            row.style.boxShadow = 'var(--shadow-pop)';
          }
          row.style.transform = 'translateY(' + dy + 'px)';

          var nearest = null, nearestDist = Infinity, nearestRect = null;
          leaves.forEach(function (sib) {
            if (sib === row) return;
            var r = sib.getBoundingClientRect();
            var mid = r.top + r.height / 2;
            var d = Math.abs(ev.clientY - mid);
            if (d < nearestDist) { nearestDist = d; nearest = sib; nearestRect = r; }
          });
          if (nearest && dropLine) {
            var before = ev.clientY < (nearestRect.top + nearestRect.height / 2);
            if (before) nearest.insertAdjacentElement('beforebegin', dropLine);
            else nearest.insertAdjacentElement('afterend', dropLine);
            dropLine.style.display = 'block';
          }
        }

        function onUp(ev) {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          if (!moved) return;

          var validDrop = !!(dropLine && dropLine.style.display === 'block' && indent.contains(dropLine));
          var withinBounds = (function () {
            var r = indent.getBoundingClientRect();
            return ev.clientY > r.top - 20 && ev.clientY < r.bottom + 20;
          })();

          row.style.transition = 'transform 260ms var(--ease-spring)';

          if (validDrop && withinBounds) {
            dropLine.insertAdjacentElement('beforebegin', row);
            row.style.transform = 'translateY(0)';
            if (unsavedTag) unsavedTag.hidden = false;
            if (moveFromEl) moveFromEl.textContent = 'Finance & IT services';
            if (moveToEl) moveToEl.textContent = 'Finance & IT services';
          } else {
            row.style.transform = 'translateY(0)';
            showInvalidDropNote();
          }

          setTimeout(function () {
            row.style.position = ''; row.style.zIndex = ''; row.style.background = ''; row.style.boxShadow = '';
            if (dropLine) dropLine.style.display = 'none';
          }, 270);
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });

    var cancelBtn = Array.prototype.filter.call(document.querySelectorAll('.btn.soft'), function (b) { return b.textContent.trim() === 'Cancel'; })[0];
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (unsavedTag) unsavedTag.hidden = true;
        var note = document.querySelector('.invalid-drop-note');
        if (note) note.remove();
      });
    }
    var commitMoveBtn = Array.prototype.filter.call(document.querySelectorAll('.btn.primary'), function (b) { return /Commit move/.test(b.textContent); })[0];
    if (commitMoveBtn) commitMoveBtn.addEventListener('click', function () { commit(commitMoveBtn); });
  }

  /* =========================================================================
     PAGE: runs.html - live run ticker + interactive validation row
     ========================================================================= */
  function initRuns() {
    var big = document.querySelector('.hero-card.live .v-big em');
    if (!big) return;

    var txLabel = document.querySelector('.hero-card.live .v-big .tx-count');
    var elapsedLabel = document.querySelector('.live-progress .lp-head .elapsed');
    var stepMarkup = document.querySelector('.lp-step.active');
    var nextStep = stepMarkup ? stepMarkup.nextElementSibling : null;
    var lpFill = document.querySelector('.lp-fill');

    var pct = 72, tx = 9832, totalTx = 14200, elapsed = 107;
    var timer = null, paused = false;

    function tick() {
      pct = Math.min(100, pct + 1.4);
      tx = Math.min(totalTx, Math.round((pct / 100) * totalTx));
      elapsed += 0.35;
      big.textContent = String(Math.round(pct));
      if (txLabel) txLabel.textContent = tx.toLocaleString() + ' / ' + totalTx.toLocaleString() + ' tx';
      if (elapsedLabel) {
        var m = Math.floor(elapsed / 60), s = Math.round(elapsed % 60);
        elapsedLabel.textContent = 'Started 12:42:18 | ' + m + 'm ' + (s < 10 ? '0' : '') + s + 's elapsed';
      }
      if (lpFill) lpFill.style.width = Math.min(100, 80 + pct / 5) + '%';
      if (pct >= 100) {
        clearInterval(timer);
        timer = null;
        if (stepMarkup) { stepMarkup.classList.remove('active'); stepMarkup.classList.add('done'); }
        if (nextStep) nextStep.classList.add('active');
      }
    }

    if (!reduce) timer = setInterval(tick, 350);

    /* WAVE 1 - exposed so runs.html's own inline script can wire a real
       Pause/Resume button without a second, duplicate interval running
       against the same DOM nodes. */
    window.Arkk.runsTicker = {
      toggle: function () {
        if (reduce) return paused;
        if (paused) { timer = setInterval(tick, 350); paused = false; }
        else if (timer) { clearInterval(timer); timer = null; paused = true; }
        return paused;
      },
      isPaused: function () { return paused; }
    };

    /* E.1 - each run-history row navigates to run-detail?run=<id> */
    document.querySelectorAll('.run-row').forEach(function (row) {
      var nameEl = row.querySelector('.title .nm');
      if (!nameEl) return;
      var id = nameEl.textContent.split('|')[0].trim();
      if (!id) return;
      row.style.cursor = 'pointer';
      row.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        window.location.href = 'run-detail?run=' + encodeURIComponent(id);
      });
    });
    /* Journals-preview "View" links also point at run-detail (optional target reuse) */
    document.querySelectorAll('table.journals-table a').forEach(function (a) {
      if (/View/.test(a.textContent)) a.href = 'run-detail?run=TP-Q4-2024-12';
    });

    var checkRows = document.querySelectorAll('.check-row');
    var tbRow = checkRows[0];
    if (tbRow) {
      tbRow.style.cursor = 'pointer';
      tbRow.title = 'Click to preview the failure pattern for this check';
      tbRow.addEventListener('click', function () {
        var failed = tbRow.dataset.failed === '1';
        var ind = tbRow.querySelector('.ind');
        var body = tbRow.querySelector('.body');
        var res = tbRow.querySelector('.res');
        clear(ind); clear(body);
        if (!failed) {
          tbRow.dataset.failed = '1';
          ind.className = 'ind pending';
          ind.style.color = 'var(--coral-ink)';
          ind.appendChild(icon('M12 9v4M12 17h.01', { strokeWidth: '2' }));
          body.appendChild(el('b', { text: '12 transactions did not reconcile to the TB' }));
          var fixWrap = el('div', { style: 'margin-top:4px;' });
          var fixBtn = el('button', { cls: 'btn ghost', text: 'Open 12 rows', type: 'button', style: 'padding:3px 8px; font-size:11px;' });
          fixWrap.appendChild(fixBtn);
          body.appendChild(fixWrap);
          res.textContent = 'needs review';
        } else {
          tbRow.dataset.failed = '';
          ind.className = 'ind pass';
          ind.style.color = '';
          ind.appendChild(icon('M5 12l4 4 10-10', { strokeWidth: '2.6' }));
          body.appendChild(el('b', { text: 'Trial balance reconciled' }));
          res.textContent = '14.2k tx | 0 mismatches';
        }
      });
    }
  }

  /* =========================================================================
     WAVE 2 - "Close the Quarter" flow orchestration (index.html + run-detail.html)
     D0 persistence lives in Arkk.flow above. This section wires beats (b), (e)
     and the reset affordance (D6). Beats (c)/(d) are wired in initRunDetail().
     ========================================================================= */
  function tlIcoCheck(cls) {
    var span = el('span', { cls: 'tl-ico ' + (cls || ''), style: 'width:40px; height:40px;' });
    span.appendChild(icon('M5 12l4 4 10-10', { strokeWidth: '2.4' }));
    return span;
  }

  function markExceptionsCleared() {
    /* Exceptions score-card (index .stats) -> cleared soft-fill treatment */
    var excCard = null;
    document.querySelectorAll('.stats .score-card').forEach(function (c) {
      var label = c.querySelector('.label');
      if (label && /Exceptions/.test(label.textContent)) excCard = c;
    });
    if (excCard && excCard.dataset.flowCleared !== '1') {
      excCard.dataset.flowCleared = '1';
      excCard.style.borderColor = 'var(--mint-line)';
      excCard.style.background = 'linear-gradient(180deg, var(--mint-soft), var(--surface))';
      var label = excCard.querySelector('.label');
      if (label) label.style.color = 'var(--mint-ink)';
      var v = excCard.querySelector('.v');
      if (v) {
        v.style.color = 'var(--mint-ink)';
        /* Set the target BEFORE the global initCountUps() pass runs (this function
           is called from initQuarterFlow, which runs first in DOMContentLoaded) so
           there is only ever one count-up animation for this node - never a race
           between an old in-flight count-up and this override. */
        v.setAttribute('data-count', '0');
      }
      var sub = excCard.querySelector('.sub');
      if (sub) { clear(sub); sub.style.color = 'var(--mint-ink)'; sub.textContent = 'Cleared'; }
    }

    /* "Triage 7 exceptions" next-action -> cleared treatment */
    var actionLink = document.querySelector('.next-actions a[href="exceptions.html"]');
    if (actionLink && actionLink.dataset.flowCleared !== '1') {
      actionLink.dataset.flowCleared = '1';
      var wrap = actionLink.querySelector('.ico-wrap');
      if (wrap) { wrap.className = 'ico-wrap mint'; clear(wrap); wrap.appendChild(icon('M5 12l4 4 10-10', { strokeWidth: '2.4' })); }
      var textEl = actionLink.querySelector('.text');
      if (textEl) {
        clear(textEl);
        textEl.appendChild(el('b', { text: 'Exceptions cleared' }));
        textEl.appendChild(el('div', { cls: 'sub', text: 'All 7 cost centres now map to a rollup' }));
      }
    }
  }

  function renderClosedOverview() {
    markExceptionsCleared();

    /* Period chip - edit to the existing frozen chip, keep its | separator + sentence case */
    var chip = document.querySelector('.page-meta .status-pill.in-progress');
    if (chip) { chip.classList.remove('in-progress'); chip.classList.add('done'); chip.textContent = 'Q4 2024 | Posted'; }

    /* Readiness ring + score -> 100. All targets are set BEFORE the global
       initCountUps()/drawChart() pass runs (renderClosedOverview is called from
       initQuarterFlow, which runs first in DOMContentLoaded - see bottom of file),
       so each node animates exactly once, from its true initial state, with no
       competing/older animation still in flight. */
    var scoreNum = document.querySelector('.score-num');
    if (scoreNum) scoreNum.setAttribute('data-count', '100');

    var ring = document.querySelector('.score-ring .fill');
    if (ring) ring.setAttribute('stroke-dasharray', '263.9 263.9');

    /* Phase bars -> 100%, Approvals loses .todo */
    document.querySelectorAll('.phases .phase').forEach(function (phase) {
      phase.classList.remove('todo');
      phase.classList.add('done');
      var fillEl = phase.querySelector('.phase-fill');
      if (fillEl) fillEl.setAttribute('data-to', '100%');
      var pct = phase.querySelector('.phase-pct');
      if (pct) pct.textContent = '100%';
    });

    /* Pipeline step 5 "Calculate & post" -> done */
    var step5 = document.querySelector('.pipeline .step.next');
    if (step5) {
      step5.classList.remove('next');
      step5.classList.add('done');
      var meta = step5.querySelector('.step-meta');
      if (meta) meta.textContent = 'Posted';
      var fillEl = step5.querySelector('.step-progress-fill');
      if (fillEl) fillEl.setAttribute('data-to', '100%');
      var mark = step5.querySelector('.step-mark');
      if (mark) { clear(mark); mark.appendChild(icon('M5 12l4 4 10-10', { strokeWidth: '2.4' })); }
    }

    /* Resolution banner, injected directly under the crumbs */
    var crumbs = document.querySelector('.crumbs');
    if (crumbs && !document.querySelector('.q4-resolution-banner')) {
      var banner = el('div', {
        cls: 'q4-resolution-banner',
        style: 'background: linear-gradient(180deg, var(--mint-soft), var(--surface)); border-radius: var(--r-md); padding: 14px 18px; margin: 16px 0 22px; display: flex; align-items: center; gap: 14px;'
      });
      banner.setAttribute('data-reveal', '');
      banner.appendChild(tlIcoCheck('mint'));
      var body = el('div', { style: 'flex: 1; font-size: 13px; color: var(--ink-2);' });
      body.appendChild(el('b', { text: 'Q4 2024 posted.', style: 'color: var(--ink);' }));
      body.appendChild(document.createTextNode(' 186 journals | £ 28.9m | closed 3 days under target.'));
      banner.appendChild(body);
      var viewBtn = el('a', { cls: 'btn ghost', text: 'View run TP-Q4-2024-13' });
      viewBtn.href = 'run-detail?run=TP-Q4-2024-13';
      banner.appendChild(viewBtn);
      crumbs.insertAdjacentElement('afterend', banner);
      /* No manual revealOnLoad() call needed here - initQuarterFlow (which calls this
         function) runs BEFORE the single global revealOnLoad() pass in DOMContentLoaded,
         so this banner's [data-reveal] is picked up in that one normal pass. */
    }

    /* Next-best actions cleared -> empty state (design-empty-states pattern) */
    var nextActions = document.querySelector('.next-actions');
    if (nextActions && !nextActions.dataset.flowEmptied) {
      nextActions.dataset.flowEmptied = '1';
      clear(nextActions);
      nextActions.style.cssText = 'display:flex; flex-direction:column; align-items:center; text-align:center; gap:10px; padding:40px 24px;';
      nextActions.appendChild(tlIcoCheck('mint'));
      nextActions.appendChild(el('div', { text: 'Nothing left for Q4 2024', style: 'font-size:14px; font-weight:500; color:var(--ink);' }));
      nextActions.appendChild(el('p', { text: 'The quarter is posted and closed. Start the Q1 2025 close when you are ready.', style: 'margin:0; color:var(--ink-3); font-size:13px; max-width:40ch;' }));
      var startBtn = el('button', { cls: 'btn', text: 'Start Q1 2025', type: 'button' });
      nextActions.appendChild(startBtn);
      startBtn.addEventListener('click', function () {
        if (window.__arkkShowNoData) window.__arkkShowNoData('Q1 2025');
      });
    }
  }

  function wireDryCalc(link) {
    if (link.dataset.flowWired === '1') return;
    link.dataset.flowWired = '1';
    link.addEventListener('click', function (e) {
      e.preventDefault();
      if (link.dataset.running === '1') return;
      link.dataset.running = '1';

      if (reduce) {
        flowSet({ dryRun: 'TP-Q4-2024-13' });
        window.location.href = 'run-detail?run=TP-Q4-2024-13&fresh=1';
        return;
      }

      var textEl = link.querySelector('.text');
      var arrEl = link.querySelector('.arr');
      if (arrEl) arrEl.style.visibility = 'hidden';

      clear(textEl);
      textEl.appendChild(el('b', { text: 'Calculating dry run TP-Q4-2024-13...' }));
      var track = el('div', { style: 'height:4px; background:var(--bg-2); border-radius:3px; overflow:hidden; margin-top:8px; border:1px solid var(--line-2);' });
      var fill = el('div', { style: 'height:100%; width:0%; background:linear-gradient(90deg, var(--brand-2), var(--brand)); border-radius:3px; transition: width 2400ms var(--ease-house);' });
      track.appendChild(fill);
      var sub = el('div', { cls: 'sub', text: 'Applying rules', style: 'margin-top:4px;' });
      textEl.appendChild(track);
      textEl.appendChild(sub);

      requestAnimationFrame(function () { fill.style.width = '100%'; });
      setTimeout(function () { sub.textContent = 'Calculating markup'; }, 900);
      setTimeout(function () { sub.textContent = 'Generating journals'; }, 1700);
      setTimeout(function () {
        flowSet({ dryRun: 'TP-Q4-2024-13' });
        window.location.href = 'run-detail?run=TP-Q4-2024-13&fresh=1';
      }, 2400);
    });
  }

  function initQuarterFlow() {
    /* D6 - quiet reset link, present on index.html and run-detail.html footers */
    document.querySelectorAll('.reset-quarter-link').forEach(function (link) {
      if (link.dataset.flowWired === '1') return;
      link.dataset.flowWired = '1';
      link.addEventListener('click', function (e) {
        e.preventDefault();
        flowReset();
        window.location.reload();
      });
    });

    /* D2 + D5 - index.html only (guarded by presence of .next-actions) */
    var nextActions = document.querySelector('.next-actions');
    if (!nextActions) return;

    var flow = flowGet();
    var dryCalcLink = Array.prototype.filter.call(nextActions.querySelectorAll('.next-action'), function (a) {
      return /Run a dry-calc/.test(a.textContent);
    })[0];

    if (flow.posted) {
      renderClosedOverview();
    } else {
      if (flow.exceptionsCleared) markExceptionsCleared();
      if (dryCalcLink) wireDryCalc(dryCalcLink);
    }
  }

  /* =========================================================================
     PAGE: run-detail.html - RUNS map + FLOW-STATE OVERRIDE (A6) + beats c/d
     ========================================================================= */
  function initRunDetail() {
    var viewFlow = document.getElementById('view-flow');
    if (!viewFlow) return;

    var RUNS_META = {
      'TP-Q4-2024-11':    { kind: 'generic', status: 'Complete', statusClass: 'done',   when: '2h ago | 10:18',    value: '£ 26.4m', extra: '2m 04s | dry calculate' },
      'TP-Q4-2024-10':    { kind: 'generic', status: 'Complete', statusClass: 'done',   when: 'Yesterday | 16:02', value: '£ 25.1m', extra: '1m 58s | dry calculate' },
      'TP-Q3-2024':       { kind: 'generic', status: 'Posted',   statusClass: 'done',   when: '21 Oct | 14:30',    value: '£ 26.8m', extra: '186 journals | Maria R.' },
      'TP-Q3-2024-DRY-6': { kind: 'generic', status: 'Complete', statusClass: 'done',   when: '21 Oct | 14:12',    value: '£ 26.8m', extra: '2m 22s | dry calculate' },
      'TP-Q3-2024-DRY-5': { kind: 'failed',  status: 'Failed',   statusClass: 'danger', when: '18 Oct | 09:14',    value: '-',       extra: 'TB schema drift' }
    };

    var viewLive = document.getElementById('view-live');
    var viewGeneric = document.getElementById('view-generic');
    var viewEmpty = document.getElementById('view-empty');
    var crumbRun = document.getElementById('crumb-run');
    var selected = viewFlow;

    function showOnly(node) {
      [viewFlow, viewLive, viewGeneric, viewEmpty].forEach(function (v) { if (v) v.style.display = (v === node) ? '' : 'none'; });
      selected = node;
    }

    function markWarnRowResolved(row, opts) {
      row.classList.add('resolved');
      var icoWrap = row.querySelector('.warn-ico');
      if (icoWrap) { clear(icoWrap); icoWrap.appendChild(icon('M5 12l4 4 10-10', { strokeWidth: '2.4' })); }
      var bodyEl = row.querySelector('.warn-body');
      if (bodyEl && opts) {
        clear(bodyEl);
        bodyEl.appendChild(el('b', { text: opts.headline }));
        bodyEl.appendChild(el('div', { cls: 'desc', text: opts.desc }));
      }
      var fixEl = row.querySelector('.warn-fix');
      if (fixEl) clear(fixEl);
    }

    function recountWarnings() {
      var openCount = document.querySelectorAll('.warn-row:not(.resolved)').length;
      var pill = document.getElementById('warn-pill');
      if (!pill) return;
      clear(pill);
      pill.className = openCount === 0 ? 'status-pill done' : 'status-pill warn';
      pill.appendChild(el('span', { cls: 'dot' }));
      pill.appendChild(document.createTextNode(openCount + ' open'));
    }

    function unlockApproveBand() {
      var btn = document.getElementById('approve-btn');
      var msg = document.getElementById('approve-msg');
      if (btn) btn.disabled = false;
      if (msg) msg.textContent = '186 journals ready | £ 28.9m uplift | reversible after posting.';
    }

    function wireWarnFx() {
      var btn = document.getElementById('warn-fx-btn');
      var row = document.getElementById('warn-fx');
      if (!btn || !row) return;
      btn.addEventListener('click', function () {
        if (row.dataset.resolved === '1') return;
        row.dataset.resolved = '1';
        commit(btn);

        function finish() {
          markWarnRowResolved(row, {
            headline: 'Resolved | converted at period-close rate',
            desc: '$ 610,000 -> EUR 561,200 at ~1.087.'
          });
          recountWarnings();
          flowSet({ warningResolved: true });
          unlockApproveBand();
        }

        if (reduce) { finish(); return; }
        row.setAttribute('data-crossfade', '');
        row.classList.add('fade-out');
        setTimeout(function () { finish(); row.classList.remove('fade-out'); }, 160);
      });
    }

    function applyPosted() {
      var pill = document.getElementById('run-pill');
      if (pill) { clear(pill); pill.className = 'status-pill done'; pill.appendChild(el('span', { cls: 'dot' })); pill.appendChild(document.createTextNode('Posted to GL | TP-Q4-2024-13')); }
      var trigger = document.getElementById('run-trigger');
      if (trigger) trigger.textContent = '';
      var journalsPill = document.getElementById('journals-pill');
      if (journalsPill) { clear(journalsPill); journalsPill.className = 'status-pill done'; journalsPill.appendChild(el('span', { cls: 'dot' })); journalsPill.appendChild(document.createTextNode('Posted to GL')); }

      var warnFxRow = document.getElementById('warn-fx');
      if (warnFxRow && warnFxRow.dataset.resolved !== '1') {
        warnFxRow.dataset.resolved = '1';
        markWarnRowResolved(warnFxRow, {
          headline: 'Resolved | converted at period-close rate',
          desc: '$ 610,000 -> EUR 561,200 at ~1.087.'
        });
      }
      document.querySelectorAll('.warn-row').forEach(function (row) {
        if (!row.classList.contains('resolved')) markWarnRowResolved(row);
      });
      recountWarnings();

      var band = document.getElementById('approve-band');
      if (band) {
        clear(band);
        band.appendChild(tlIcoCheck('mint'));
        var msg = el('div', { style: 'flex:1; font-size:13px; color:var(--ink-2);' });
        msg.appendChild(document.createTextNode('Posted by '));
        msg.appendChild(el('b', { text: 'Tom Heffes', style: 'color:var(--ink);' }));
        msg.appendChild(document.createTextNode(' | 186 journals | £ 28.9m'));
        band.appendChild(msg);
      }
    }

    function wireApproveBand() {
      var reqBtn = document.getElementById('request-changes-btn');
      var approveBtn = document.getElementById('approve-btn');
      var band = document.getElementById('approve-band');

      if (reqBtn) {
        reqBtn.addEventListener('click', function () {
          if (band.querySelector('.rc-note')) return;
          band.appendChild(el('div', { cls: 'row-key rc-note', text: 'Sent back to John Doe with your comments.', style: 'margin-top:10px; flex-basis:100%;' }));
        });
      }

      if (approveBtn) {
        approveBtn.addEventListener('click', function () {
          if (approveBtn.disabled || approveBtn.dataset.posting === '1') return;
          approveBtn.dataset.posting = '1';
          commit(approveBtn);

          function finish() {
            flowSet({ posted: true });
            applyPosted();
            setTimeout(function () { window.location.href = './'; }, reduce ? 0 : 400);
          }

          if (reduce) { finish(); return; }

          var msgEl = document.getElementById('approve-msg');
          var who = band.querySelector('.who');
          var actions = band.querySelector('.actions');
          if (who) who.style.display = 'none';
          if (actions) actions.style.display = 'none';
          if (msgEl) {
            clear(msgEl);
            msgEl.appendChild(el('div', { text: 'Posting 186 journals to GL...', style: 'font-size:13px; color:var(--ink-2); margin-bottom:8px;' }));
            var track = el('div', { cls: 'lp-bar' });
            var fill = el('div', { cls: 'lp-fill', style: 'width:0%; transition: width 3200ms var(--ease-house);' });
            track.appendChild(fill);
            msgEl.appendChild(track);
            requestAnimationFrame(function () { fill.style.width = '100%'; });
          }
          setTimeout(finish, 3200);
        });
      }
    }

    function renderFlowRun(flow) {
      wireWarnFx();
      wireApproveBand();
      if (flow.posted) {
        applyPosted();
      } else if (flow.warningResolved) {
        var row = document.getElementById('warn-fx');
        if (row) {
          row.dataset.resolved = '1';
          markWarnRowResolved(row, {
            headline: 'Resolved | converted at period-close rate',
            desc: '$ 610,000 -> EUR 561,200 at ~1.087.'
          });
        }
        recountWarnings();
        unlockApproveBand();
      }
      /* else: fresh dry-run - the authored default markup already matches (all open, band locked) */
    }

    function renderGenericRun(meta, id) {
      var titleEl = document.getElementById('generic-title');
      if (titleEl) titleEl.textContent = id + '.';
      var pill = document.getElementById('generic-pill');
      if (pill) {
        clear(pill);
        pill.className = 'status-pill ' + meta.statusClass;
        pill.appendChild(el('span', { cls: 'dot' }));
        pill.appendChild(document.createTextNode(meta.status));
      }
      setText('generic-trigger', meta.when);
      setText('generic-status', meta.status);
      setText('generic-when', meta.when);
      setText('generic-value', meta.value);
      setText('generic-extra', meta.extra);

      if (meta.kind === 'failed') {
        var card = document.getElementById('generic-card');
        if (card) card.classList.add('failed');
        var fixWrap = document.getElementById('generic-fail-fix');
        if (fixWrap) {
          fixWrap.style.display = '';
          setText('generic-fail-msg', 'This dry run failed: ' + meta.extra + '. Fix the source data and re-run - no journals were generated or posted.');
        }
      }
    }

    function setText(id, text) {
      var n = document.getElementById(id);
      if (n) n.textContent = text;
    }

    var params = new URLSearchParams(location.search);
    var runId = params.get('run') || 'TP-Q4-2024-13';

    if (runId === 'TP-Q4-2024-13') {
      showOnly(viewFlow);
      if (crumbRun) crumbRun.textContent = runId;
      renderFlowRun(flowGet());
    } else if (runId === 'TP-Q4-2024-12') {
      showOnly(viewLive);
      if (crumbRun) crumbRun.textContent = runId;
    } else if (RUNS_META[runId]) {
      showOnly(viewGeneric);
      if (crumbRun) crumbRun.textContent = runId;
      renderGenericRun(RUNS_META[runId], runId);
    } else {
      showOnly(viewEmpty);
      if (crumbRun) crumbRun.textContent = 'Unknown run';
    }

    /* view-flow is visible by default, so the single global revealOnLoad()/
       initCountUps()/drawChart() pass (which runs before this function, earlier
       in DOMContentLoaded) already handled it - re-running here would register a
       second count-up/reveal pass on the same nodes. Only the OTHER views were
       display:none during that global pass and need it run now that they are shown. */
    if (selected !== viewFlow) {
      revealOnLoad(selected);
      initCountUps(selected);
      drawChart(selected);
      wireCommitButtons(selected);
    }
  }

  /* =========================================================================
     PAGE: data-sources.html - connection list, degraded-source retry, mapping
     ========================================================================= */
  function initDataSources() {
    var list = document.querySelector('.src-row[data-source]');
    if (!list) return;

    var degradedRow = document.querySelector('.src-row[data-source="legacy-csv"]');
    var retryBtn = document.getElementById('retry-sync-btn');
    var mapBtn = document.getElementById('update-mapping-btn');
    var mapStub = document.getElementById('map-stub');
    var mapConfirmBtn = document.getElementById('map-confirm-btn');
    var degradedDetail = document.getElementById('degraded-detail');

    function markSourceHealthy() {
      if (!degradedRow) return;
      var pill = degradedRow.querySelector('.status-pill');
      if (pill) { clear(pill); pill.className = 'status-pill done'; pill.appendChild(el('span', { cls: 'dot' })); pill.appendChild(document.createTextNode('Synced')); }
      var countEl = degradedRow.querySelector('.count .mono');
      if (countEl) countEl.textContent = '1,880 rows';
      var countMeta = degradedRow.querySelector('.count .qr-meta');
      if (countMeta) countMeta.textContent = '0 held';
      var healthFill = degradedRow.querySelector('.bar-fill');
      if (healthFill) { healthFill.classList.remove('peach'); healthFill.setAttribute('data-to', '99%'); animateBar(healthFill, 0); }
      var healthPct = degradedRow.querySelector('.health .val');
      if (healthPct) healthPct.textContent = '99%';
      if (degradedDetail) degradedDetail.style.display = 'none';
    }

    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        if (retryBtn.dataset.running === '1') return;
        retryBtn.dataset.running = '1';
        commit(retryBtn);

        if (reduce) { markSourceHealthy(); return; }

        var label = retryBtn.textContent;
        setLeadingText(retryBtn, 'Retrying...');
        retryBtn.disabled = true;
        setTimeout(function () {
          retryBtn.disabled = false;
          setLeadingText(retryBtn, label);
          markSourceHealthy();
        }, 2000);
      });
    }

    if (mapBtn && mapStub) {
      mapBtn.addEventListener('click', function () {
        mapStub.style.display = mapStub.style.display === 'none' ? '' : 'none';
      });
    }

    if (mapConfirmBtn) {
      mapConfirmBtn.addEventListener('click', function () {
        commit(mapConfirmBtn);
        markSourceHealthy();
        if (mapStub) mapStub.style.display = 'none';
      });
    }
  }

  /* =========================================================================
     PAGE: reports.html - report card generate/download states
     ========================================================================= */
  function initReports() {
    var grid = document.querySelector('.report-grid');
    if (!grid) return;

    var cbcCard = document.getElementById('report-cbc');
    var cbcFillWrap = document.getElementById('cbc-progress');
    var cbcMeta = document.getElementById('cbc-meta');
    var cbcPill = document.getElementById('cbc-pill');
    var cbcAction = document.getElementById('cbc-action');
    var tableBody = document.getElementById('reports-table-body');
    var cbcRow = document.getElementById('reports-row-cbc');

    function finishCbc() {
      if (cbcPill) { clear(cbcPill); cbcPill.className = 'status-pill done'; cbcPill.appendChild(el('span', { cls: 'dot' })); cbcPill.appendChild(document.createTextNode('Ready')); }
      if (cbcMeta) cbcMeta.textContent = 'Generated just now | 12 tables | XLSX';
      if (cbcFillWrap) cbcFillWrap.style.display = 'none';
      if (cbcAction) {
        clear(cbcAction);
        cbcAction.className = 'btn';
        cbcAction.disabled = false;
        cbcAction.appendChild(icon('M12 3v12M7 10l5 5 5-5M5 21h14'));
        cbcAction.appendChild(document.createTextNode(' Download'));
      }
      if (cbcRow) {
        var statusCell = cbcRow.querySelector('.status-pill');
        if (statusCell) { clear(statusCell); statusCell.className = 'status-pill done'; statusCell.appendChild(el('span', { cls: 'dot' })); statusCell.appendChild(document.createTextNode('Ready')); }
        var genCell = cbcRow.querySelector('.gen-cell');
        if (genCell) genCell.textContent = 'just now';
        var dlCell = cbcRow.querySelector('.dl-cell');
        if (dlCell) { clear(dlCell); dlCell.appendChild(el('a', { text: 'Download', style: 'color: var(--brand);' })).href = '#'; }
      }
    }

    if (cbcCard && cbcFillWrap) {
      var fill = cbcFillWrap.querySelector('.rc-bar > div');
      var stepLbl = document.getElementById('cbc-step-label');
      if (reduce) {
        if (fill) fill.style.width = '68%';
        if (document.getElementById('cbc-refresh-btn')) document.getElementById('cbc-refresh-btn').style.display = '';
      } else {
        var jur = 42;
        requestAnimationFrame(function () { if (fill) fill.style.transition = 'width 4000ms var(--ease-house)'; if (fill) fill.style.width = '100%'; });
        var timer = setInterval(function () {
          jur = Math.min(61, jur + 3);
          if (stepLbl) stepLbl.textContent = 'Building country tables... ' + jur + ' of 61 jurisdictions';
          if (jur >= 61) { clearInterval(timer); finishCbc(); }
        }, 380);
      }
      var refreshBtn = document.getElementById('cbc-refresh-btn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () { finishCbc(); });
    }

    var genAllBtn = document.getElementById('generate-all-btn');
    if (genAllBtn) genAllBtn.addEventListener('click', function () { commit(genAllBtn); });

    /* Card 4 - TP policy summary: generate inline, then append a table row */
    var policyBtn = document.getElementById('policy-generate-btn');
    if (policyBtn) {
      policyBtn.addEventListener('click', function () {
        if (policyBtn.dataset.done === '1') return;
        commit(policyBtn);

        function finish() {
          policyBtn.dataset.done = '1';
          var pill = document.getElementById('policy-pill');
          if (pill) { clear(pill); pill.className = 'status-pill done'; pill.appendChild(el('span', { cls: 'dot' })); pill.appendChild(document.createTextNode('Ready')); }
          var meta = document.getElementById('policy-meta');
          if (meta) meta.textContent = 'Generated just now | 6 pages | PDF';
          clear(policyBtn);
          policyBtn.className = 'btn';
          policyBtn.appendChild(icon('M12 3v12M7 10l5 5 5-5M5 21h14'));
          policyBtn.appendChild(document.createTextNode(' Download'));

          if (tableBody) {
            var row = el('tr');
            ['Q4 2024', 'TP policy summary', 'Tom Heffes', 'just now'].forEach(function (t) {
              row.appendChild(el('td', { text: t }));
            });
            var statusTd = el('td');
            var pill2 = el('span', { cls: 'status-pill done' });
            pill2.appendChild(el('span', { cls: 'dot' }));
            pill2.appendChild(document.createTextNode('Ready'));
            statusTd.appendChild(pill2);
            row.appendChild(statusTd);
            var dlTd = el('td');
            var dlLink = el('a', { text: 'Download', style: 'color: var(--brand);' });
            dlLink.href = '#';
            dlLink.setAttribute('data-quiet', 'Download');
            dlTd.appendChild(dlLink);
            row.appendChild(dlTd);
            tableBody.insertBefore(row, tableBody.firstChild);
          }
        }

        setTimeout(finish, reduce ? 0 : 900);
      });
    }
  }

  /* =========================================================================
     NAV SANITY (runs on every page - shared header/sidebar/topbar/footer live
     identically on all 12 screens) - closes out the "random things open when
     I click certain nav items" defect class. Every destination that has no
     real screen built gets ONE consistent, labeled, dismissible affordance
     instead of a silent scroll-jump or nothing at all:
       [data-quiet="Label"] -> shows the quiet panel (toast) naming the target
       [data-focus-search]  -> focuses the real topbar search field
       [data-noop]          -> already-current state, just eat the click
     Elements with their own real behaviour (q-tabs, table-row nav, commit
     buttons, etc.) are untouched - they carry none of the three attributes
     above, so this delegated listener never intercepts them.
     ========================================================================= */
  function initQuietNav() {
    /* WAVE 1: [data-focus-search] now opens the real command palette
       (arkk-chrome.js) instead of just focusing the input - handled there.
       Any [data-quiet] surface that Wave 1 made real has its attribute
       removed by the owning script before this delegated listener can ever
       see it, so this remains the honest fallback for genuinely unbuilt
       destinations only - never a silent dead end. */
    document.addEventListener('click', function (e) {
      var quiet = e.target.closest('[data-quiet]');
      if (quiet) { e.preventDefault(); showToast(quiet.getAttribute('data-quiet'), { sub: 'Not built in this preview.' }); return; }

      var noop = e.target.closest('[data-noop]');
      if (noop) { e.preventDefault(); return; }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* initQuarterFlow runs FIRST - it may override data-count/data-to targets
       (e.g. index.html's posted-state readiness ring/phase bars) and inject
       data-reveal content (the resolution banner) based on persisted flow state.
       Running it before the single global reveal/count/draw pass below means
       every node animates exactly once, from its true starting state - no
       competing "old target" animation left in flight to race against. */
    initQuarterFlow();
    revealOnLoad();
    initCountUps();
    drawChart();
    wireCommitButtons();
    initIndex();
    initMatrix();
    initMatrixEdit();
    initHierarchy();
    initRuns();
    initRunDetail();
    initDataSources();
    initReports();
    initQuietNav();
  });
})();
