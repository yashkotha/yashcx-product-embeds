/*
 * workflows.js - page-local logic for workflows.html only.
 * Not merged into arkk.js (shared.css and arkk.js stay untouched / LAW).
 * DOM is built with createElement/textContent throughout - no HTML strings
 * (matches arkk.js's own convention). Wraps in a strict IIFE, wires on
 * DOMContentLoaded, honours Arkk.reduce.
 *
 * Reconstructed to ARCHITECTURE.md's layer model: a single-transform world
 * (#wfWorld) under a non-scrolling viewport (#wfViewport), with all chrome
 * living in #wfOverlay as a SIBLING of the world, never a descendant of it.
 * No native scroll anywhere - see the camera core in section 6 below.
 */
(function () {
  'use strict';

  var reduce = (window.Arkk && typeof window.Arkk.reduce === 'boolean') ? window.Arkk.reduce : matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (/[?&]force-reduced-motion=1/.test(location.search)) reduce = true;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var STORE_KEY = 'arkk.workflows.v1';

  function afterDelay(ms, fn) { if (reduce) { fn(); } else { setTimeout(fn, ms); } }

  var idCounter = 0;
  function genId() { idCounter++; return 'n' + Date.now().toString(36) + idCounter; }

  /* -----------------------------------------------------------------------
     DOM helpers - safe construction only (createElement + textContent).
     ----------------------------------------------------------------------- */
  function mk(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'text') n.textContent = attrs[k];
        else n.setAttribute(k, attrs[k]);
      }
    }
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function txt(s) { return document.createTextNode(s); }

  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function iconFrame(cls) {
    return svgEl('svg', { viewBox: '0 0 24 24', class: cls || 'ico-sm', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  }
  function iconFromPaths(cls, defs) {
    var svg = iconFrame(cls);
    defs.forEach(function (shape) { svg.appendChild(svgEl(shape.tag, shape.attrs)); });
    return svg;
  }

  /* -----------------------------------------------------------------------
     Node type registry - identity is chip fill + icon + label only.
     Card border is always neutral --line (hard rule §1).
     ----------------------------------------------------------------------- */
  var ICON_DEFS = {
    trigger:   [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } }, { tag: 'path', attrs: { d: 'M12 7v5l3 2' } }],
    source:    [{ tag: 'ellipse', attrs: { cx: 12, cy: 6, rx: 8, ry: 3 } }, { tag: 'path', attrs: { d: 'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6' } }],
    transform: [{ tag: 'path', attrs: { d: 'M9 4c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3M15 4c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3' } }],
    check:     [{ tag: 'path', attrs: { d: 'M4 5h16l-6.5 8.2v6.3l-3 1.5v-7.8z' } }],
    approval:  [{ tag: 'path', attrs: { d: 'M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z' } }, { tag: 'path', attrs: { d: 'M9 12l2 2 4-4' } }],
    export:    [{ tag: 'path', attrs: { d: 'M12 15V3M7 8l5-5 5 5M4 21h16' } }]
  };
  function typeIcon(type, cls) { return iconFromPaths(cls || 'ico-sm', ICON_DEFS[type] || []); }

  var TYPES = {
    trigger:   { label: 'Schedule / Trigger',     chip: 't-trigger',   inputs: 0, outputs: ['out'] },
    source:    { label: 'Source',                 chip: 't-source',    inputs: 1, outputs: ['out'] },
    transform: { label: 'Transform / Calc',       chip: 't-transform', inputs: 1, outputs: ['out'] },
    check:     { label: 'Check / Exception gate', chip: 't-check',     inputs: 1, outputs: ['meets', 'exc'] },
    approval:  { label: 'Approval',                chip: 't-approval',  inputs: 1, outputs: ['out'] },
    export:    { label: 'Export / Post',          chip: 't-export',    inputs: 1, outputs: [] }
  };

  function statusMeta(status) {
    if (status === 'ready') return { cls: 'in-progress', text: 'Ready' };
    if (status === 'ran') return { cls: 'done', text: 'Ran' };
    if (status === 'needsConfig') return { cls: 'warn', text: 'Needs config' };
    return { cls: 'queued', text: 'Idle' };
  }

  /* Run-simulation overrides the foot pill while a node is mid-sim. */
  function simStatusMeta(simState) {
    if (simState === 'running') return { cls: 'in-progress', text: 'Running' };
    if (simState === 'ran') return { cls: 'done', text: 'Ran' };
    return null;
  }

  /* -----------------------------------------------------------------------
     Palette catalogue (static data, click-to-add - the guaranteed path).
     ----------------------------------------------------------------------- */
  var PALETTE = [
    { heading: 'Triggers', items: [
      { type: 'trigger', name: 'Schedule', summary: 'Runs on a cadence' },
      { type: 'trigger', name: 'Event', summary: 'New entity or new exception' }
    ] },
    { heading: 'Sources', items: [
      { type: 'source', name: 'SAP trial balance', summary: 'General ledger feed' },
      { type: 'source', name: 'Workday cost centres', summary: 'Cost centre master' },
      { type: 'source', name: 'FX rates', summary: 'Currency feed' },
      { type: 'source', name: 'Intercompany parties', summary: 'Related-party feed' }
    ] },
    { heading: 'Transforms', items: [
      { type: 'transform', name: 'Apply hierarchy', summary: 'Map to cost centres' },
      { type: 'transform', name: 'Apply markup rules', summary: 'From the cost matrix' },
      { type: 'transform', name: 'Calculate markup', summary: 'Entity pairs' },
      { type: 'transform', name: 'Match pairs', summary: 'Intercompany matching' },
      { type: 'transform', name: 'Assemble pack', summary: 'Report bundle' }
    ] },
    { heading: 'Checks', items: [
      { type: 'check', name: 'Check', summary: 'Evaluate a condition' },
      { type: 'check', name: 'Exception gate', summary: 'Route by exception type' }
    ] },
    { heading: 'Approvals', items: [
      { type: 'approval', name: 'Approval', summary: 'Human sign-off' }
    ] },
    { heading: 'Outputs', items: [
      { type: 'export', name: 'Post to GL', summary: 'Reversible' },
      { type: 'export', name: 'Publish to Reports', summary: 'Report pack' },
      { type: 'export', name: 'Notify', summary: 'Email or in-app' }
    ] }
  ];

  /* -----------------------------------------------------------------------
     Templates (6, all canon-grounded). Node meta count === seeded node
     count, verified in the self-audit. Edge tuples: [fromIdx, toIdx, port, count]
     port omitted = 'out'; 'meets' / 'exc' used for Check nodes.
     ----------------------------------------------------------------------- */
  var TEMPLATES = [
    {
      id: 'quarter-close', name: 'Quarter-close orchestration', complexity: 'Advanced', lead: 'export',
      desc: 'Mirrors the frozen close pipeline end to end, from trial balance to posted journals.',
      touches: ['SAP', 'Workday', 'FX rates', 'GL'],
      nodes: [
        { type: 'trigger', name: 'Schedule', summary: 'Quarter-end' },
        { type: 'source', name: 'SAP trial balance', summary: 'General ledger | EUR, GBP, USD' },
        { type: 'source', name: 'Workday cost centres', summary: 'Cost centre master' },
        { type: 'source', name: 'FX rates', summary: '74% freshness' },
        { type: 'transform', name: 'Apply hierarchy', summary: '182 cost centres' },
        { type: 'transform', name: 'Apply markup rules', summary: '23 of 23 cells' },
        { type: 'transform', name: 'Calculate markup', summary: '186 entity pairs' },
        { type: 'transform', name: 'Generate journals', summary: '372 lines | 186 journals' },
        { type: 'check', name: 'Review exceptions', summary: 'Gate before sign-off' },
        { type: 'approval', name: 'Approval', summary: 'Owner: Tom Heffes' },
        { type: 'export', name: 'Post to GL', summary: 'Reversible' }
      ],
      edges: [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9, 'meets'], [9, 10]]
    },
    {
      id: 'exception-triage', name: 'Exception triage routing', complexity: 'Standard', lead: 'check',
      desc: 'Classifies open exceptions and routes each to an owner for sign-off.',
      touches: ['Exceptions', 'Owners'],
      nodes: [
        { type: 'trigger', name: 'Schedule', summary: 'Daily 07:00' },
        { type: 'source', name: 'Open exceptions', summary: '7 open' },
        { type: 'check', name: 'Classify', summary: 'FX | intercompany | missing owner' },
        { type: 'approval', name: 'Approval', summary: 'Owner: Tom Heffes' },
        { type: 'export', name: 'Notify owner', summary: 'Email and in-app' }
      ],
      edges: [[0, 1], [1, 2], [2, 3, 'meets'], [3, 4]]
    },
    {
      id: 'intercompany-matching', name: 'Intercompany matching sweep', complexity: 'Standard', lead: 'transform',
      desc: 'Matches CONNECT FINCO ledger lines against counterparties and flags what is left over.',
      touches: ['SAP', 'Intercompany'],
      nodes: [
        { type: 'source', name: 'CONNECT FINCO ledger', summary: 'LUX entity' },
        { type: 'source', name: 'Counterparty ledger', summary: 'Related parties' },
        { type: 'transform', name: 'Match pairs', summary: 'Line-level match' },
        { type: 'check', name: 'Unmatched gate', summary: 'unmatched > 0' },
        { type: 'export', name: 'Flag report', summary: 'To Reports' }
      ],
      edges: [[0, 2], [1, 2], [2, 3, 'out', '187 pairs'], [3, 4, 'exc', '3 unmatched']]
    },
    {
      id: 'dry-run-variance', name: 'Dry-run + variance alert schedule', complexity: 'Standard', lead: 'trigger',
      desc: 'Runs a dry calculation weekly and alerts on variance before anything posts.',
      touches: ['SAP'],
      nodes: [
        { type: 'trigger', name: 'Schedule', summary: 'Weekly Monday' },
        { type: 'source', name: 'Trial balance', summary: 'SAP feed' },
        { type: 'transform', name: 'Dry calc', summary: 'No post' },
        { type: 'check', name: 'Variance gate', summary: '> £50k' },
        { type: 'export', name: 'Notify Tom', summary: 'Dry only | nothing posts' }
      ],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4, 'meets']]
    },
    {
      id: 'report-pack', name: 'Report pack generation + distribution', complexity: 'Standard', lead: 'export',
      desc: 'Assembles a local report pack from posted journals and publishes it once signed off.',
      touches: ['GL', 'Reports'],
      nodes: [
        { type: 'trigger', name: 'Schedule', summary: 'Quarter-end +2d' },
        { type: 'source', name: 'Posted journals', summary: 'From GL' },
        { type: 'transform', name: 'Assemble pack', summary: 'Local file pack' },
        { type: 'check', name: 'Pack complete', summary: 'Validate coverage' },
        { type: 'approval', name: 'Approval', summary: 'Owner: Tom Heffes' },
        { type: 'export', name: 'Publish to Reports', summary: 'Report pack' }
      ],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4, 'meets'], [4, 5]]
    },
    {
      id: 'entity-onboarding', name: 'New-entity onboarding checks', complexity: 'Routine', lead: 'check',
      desc: 'Checks a newly added entity has an owner, a cost-centre mapping and a markup rule.',
      touches: ['Workday'],
      nodes: [
        { type: 'trigger', name: 'New entity added', summary: '4 unassigned today' },
        { type: 'source', name: 'Entity master', summary: 'Workday cost centre master' },
        { type: 'check', name: 'Has owner, CC, rule?', summary: '3-point check' },
        { type: 'approval', name: 'Approval', summary: 'Owner: Tom Heffes' },
        { type: 'export', name: 'Add to hierarchy', summary: 'Commit mapping' }
      ],
      edges: [[0, 1], [1, 2], [2, 3, 'meets'], [3, 4]]
    }
  ];

  /* -----------------------------------------------------------------------
     Config option sets (rule-grid pickers - the Arkk form idiom).
     ----------------------------------------------------------------------- */
  var CADENCES = ['Quarter-end', 'Weekly Monday', 'Daily 07:00', 'New entity added', 'New exception'];
  var SYSTEMS = ['SAP trial balance', 'Workday cost centres', 'FX rates', 'Intercompany parties'];
  var OWNERS = ['Tom Heffes', 'John Doe', 'Maria R.'];
  var DESTINATIONS = ['Post to GL', 'Publish to Reports', 'Notify Tom'];

  /* -----------------------------------------------------------------------
     Layered auto-layout (left to right by graph depth). World coordinates -
     the world has no fixed extent; it grows with content (§9).
     ----------------------------------------------------------------------- */
  function layoutGraph(nodeDefs, edgeDefs) {
    var n = nodeDefs.length;
    var incoming = [], outgoing = [];
    for (var i = 0; i < n; i++) { incoming.push([]); outgoing.push([]); }
    edgeDefs.forEach(function (e) { outgoing[e[0]].push(e[1]); incoming[e[1]].push(e[0]); });
    var depth = new Array(n).fill(-1);
    function calcDepth(idx, guard) {
      if (depth[idx] >= 0) return depth[idx];
      if (guard[idx]) return 0;
      guard[idx] = true;
      if (!incoming[idx].length) { depth[idx] = 0; return 0; }
      var maxD = 0;
      incoming[idx].forEach(function (p) { maxD = Math.max(maxD, calcDepth(p, guard)); });
      depth[idx] = maxD + 1;
      return depth[idx];
    }
    for (i = 0; i < n; i++) calcDepth(i, {});
    var cols = {};
    for (i = 0; i < n; i++) { (cols[depth[i]] = cols[depth[i]] || []).push(i); }
    var colKeys = Object.keys(cols).map(Number).sort(function (a, b) { return a - b; });
    /* Bug-fix (diagnosis §2, root cause of the cropped/tiny canvas complaint):
       a strict one-column-per-depth layout turns a mostly-linear template
       (e.g. an 11-step close routine) into a ~6.5:1 wide horizontal strip,
       which forces fitToView() to zoom out so far the graph reads as tiny
       with huge dead space above/below. Wrap columns into bands so the
       overall bbox aspect ratio stays viewport-friendly instead of one long
       strip - edges still connect the same nodes, they just bend down into
       the next band every COLS_PER_BAND columns. */
    var COLS_PER_BAND = 5;
    var BAND_GAP = 90;
    /* 150px row pitch: cards grew taller with the uniform 26px icon tile,
       so the old 120px pitch left stacked cards nearly touching. */
    var ROW_PITCH = 150;
    var positions = new Array(n);
    var bandTopY = 40;
    var bandMaxRows = 0;
    colKeys.forEach(function (colKey, i) {
      var colInBand = i % COLS_PER_BAND;
      if (colInBand === 0 && i > 0) {
        bandTopY += bandMaxRows * ROW_PITCH + BAND_GAP;
        bandMaxRows = 0;
      }
      var rows = cols[colKey];
      bandMaxRows = Math.max(bandMaxRows, rows.length);
      rows.forEach(function (idx, row) {
        positions[idx] = { x: 40 + colInBand * 260, y: bandTopY + row * ROW_PITCH };
      });
    });
    return positions;
  }

  /* -----------------------------------------------------------------------
     Application state.
     ----------------------------------------------------------------------- */
  var state = {
    meta: { name: 'Q4 close orchestration', savedAt: null },
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    paletteCollapsed: false,
    dockCollapsed: false,
    panArmed: false,
    camAutoFit: false, // §setCam - true only while cam is exactly where fitToView() last put it
    simRunning: false,
    showGallery: false,
    view: 'build',
    drawerState: 'closed', // closed | open | collapsed
    teaching: { dismissed: [] },
    assistant: {
      messages: [],
      traceRevealedCount: 0,
      traceLines: [],
      stage: 'idle',
      draftActive: false,
      suggestion1: null,
      suggestion2: null,
      demoRefs: null
    }
  };

  /* §1.2 - camera. Screen px translate + unitless scale. Not persisted in
     the graph store; own pref key. Not in undo history (view state). */
  var cam = { x: 80, y: 60, s: 1 };
  var S_MIN = 0.35, S_MAX = 2.0;
  var FIT_MIN = 0.12;   // fit-to-view may zoom out below the interactive S_MIN so a wide graph is always fully framed
  var WORLD_PAD = 400, EDGE_KEEP = 120;

  /* §6 - bounded history stack (client directive: full undo/redo, not a
     single-step revert). Snapshot-based; graph is tiny so deep-clone cost is
     negligible and snapshots are immune to inverse-op bugs. */
  var history = { past: [], future: [] };
  var HISTORY_CAP = 50;

  function seedFirstRun() {
    state.nodes = [{ id: genId(), type: 'trigger', name: 'Schedule', summary: 'Not yet configured', status: 'needsConfig', x: 40, y: 40, config: {} }];
    state.edges = [];
    state.meta = { name: 'Q4 close orchestration', savedAt: null };
    state.selectedNodeId = null;
    state.showGallery = true;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) return null;
      return parsed;
    } catch (e) { return null; }
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        meta: state.meta,
        nodes: state.nodes.map(function (n) { return { id: n.id, type: n.type, name: n.name, summary: n.summary, status: n.status, x: n.x, y: n.y, config: n.config || {} }; }),
        edges: state.edges.map(function (e) { return { id: e.id, from: e.from, to: e.to, kind: e.kind, count: e.count || null }; }),
        teaching: state.teaching
      }));
    } catch (e) { /* storage unavailable - state stays in-memory for this load only */ }
  }
  var saveTimer = null;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 800); }

  /* -----------------------------------------------------------------------
     Session-scoped prefs (camera, panel collapse). Kept separate from the
     graph STORE_KEY so they survive independently of a graph reset (§3.4/§9).
     ----------------------------------------------------------------------- */
  function loadPref(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      var parsed = JSON.parse(raw);
      return (parsed === null || parsed === undefined) ? fallback : parsed;
    } catch (e) { return fallback; }
  }
  function savePref(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
  }

  /* -----------------------------------------------------------------------
     §6 - full history stack. cloneGraph/restore + commit/undo/redo.
     ----------------------------------------------------------------------- */
  function cloneGraph() {
    return {
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      edges: JSON.parse(JSON.stringify(state.edges)),
      meta: JSON.parse(JSON.stringify(state.meta)),
      selectedNodeId: state.selectedNodeId,
      selectedEdgeId: state.selectedEdgeId
    };
  }
  function restore(snap) {
    state.nodes = snap.nodes;
    state.edges = snap.edges;
    state.meta = snap.meta;
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
  }
  function commit(label) {
    history.past.push({ label: label, snap: cloneGraph() });
    if (history.past.length > HISTORY_CAP) history.past.shift();
    history.future.length = 0;
    updateHistoryUI();
  }
  function undo() {
    if (!history.past.length) return;
    var entry = history.past.pop();
    history.future.push({ label: entry.label, snap: cloneGraph() });
    restore(entry.snap);
    render();
    updateHistoryUI();
    showToast('Undo: ' + entry.label);
  }
  function redo() {
    if (!history.future.length) return;
    var entry = history.future.pop();
    history.past.push({ label: entry.label, snap: cloneGraph() });
    restore(entry.snap);
    render();
    updateHistoryUI();
    showToast('Redo: ' + entry.label);
  }
  function resetHistory() { history.past.length = 0; history.future.length = 0; updateHistoryUI(); }
  function updateHistoryUI() {
    if ($undoBtn) { $undoBtn.disabled = !history.past.length; $undoBtn.setAttribute('aria-disabled', String(!history.past.length)); }
    if ($redoBtn) { $redoBtn.disabled = !history.future.length; $redoBtn.setAttribute('aria-disabled', String(!history.future.length)); }
  }

  /* -----------------------------------------------------------------------
     DOM refs + keyed element caches.
     ----------------------------------------------------------------------- */
  var $body, $viewport, $world, $edgesSvg, $palette, $dock, $gallery, $validateBar, $validateCount, $validateLinks,
      $nameInput, $statusPill, $draftBar, $runDrawer, $toast, $canvasRegion;
  var $zoomLabel, $zoomOutBtns, $zoomInBtns, $undoBtn, $redoBtn;
  var nodeEls = {};
  var edgeEls = {};
  var dockTab = 'config';

  function q(id) { return document.getElementById(id); }
  function nodeById(id) { for (var i = 0; i < state.nodes.length; i++) if (state.nodes[i].id === id) return state.nodes[i]; return null; }

  /* -----------------------------------------------------------------------
     Toast + inline confirm (never a native confirm()).
     ----------------------------------------------------------------------- */
  var toastTimer = null;
  function showToast(text, ms) {
    $toast.textContent = text;
    $toast.hidden = false;
    void $toast.offsetWidth;
    $toast.classList.add('in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      $toast.classList.remove('in');
      setTimeout(function () { $toast.hidden = true; }, reduce ? 0 : 260);
    }, ms || 2600);
  }

  function confirmInline(anchorEl, message, onConfirm) {
    var existing = document.querySelector('.wf-confirm-pop');
    if (existing) existing.remove();
    var pop = mk('div', 'wf-confirm-pop');
    var rect = anchorEl.getBoundingClientRect();
    pop.style.top = (rect.bottom + 8) + 'px';
    pop.style.left = Math.max(8, rect.right - 260) + 'px';
    pop.appendChild(mk('div', 'txt', { text: message }));
    var actions = mk('div', 'actions');
    var cancelBtn = mk('button', 'btn soft', { type: 'button', text: 'Cancel' });
    var okBtn = mk('button', 'btn primary', { type: 'button', text: 'Confirm' });
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    pop.appendChild(actions);
    document.body.appendChild(pop);
    function close() { pop.remove(); document.removeEventListener('mousedown', onDoc, true); }
    function onDoc(ev) { if (!pop.contains(ev.target) && ev.target !== anchorEl) close(); }
    cancelBtn.addEventListener('click', close);
    okBtn.addEventListener('click', function () { close(); onConfirm(); });
    setTimeout(function () { document.addEventListener('mousedown', onDoc, true); }, 0);
  }

  /* -----------------------------------------------------------------------
     Validation engine - advisory only, live on every mutation.
     ----------------------------------------------------------------------- */
  function incomingEdges(nodeId) { return state.edges.filter(function (e) { return e.to.node === nodeId; }); }
  function outgoingEdges(nodeId, port) { return state.edges.filter(function (e) { return e.from.node === nodeId && (!port || e.from.port === port); }); }

  function hasApprovalAncestor(nodeId, guard) {
    guard = guard || {};
    if (guard[nodeId]) return false;
    guard[nodeId] = true;
    var ins = incomingEdges(nodeId);
    for (var i = 0; i < ins.length; i++) {
      var srcId = ins[i].from.node;
      var src = nodeById(srcId);
      if (src && src.type === 'approval') return true;
      if (hasApprovalAncestor(srcId, guard)) return true;
    }
    return false;
  }

  function validateGraph() {
    var issues = [];
    state.nodes.forEach(function (node) {
      var def = TYPES[node.type];
      if (!def) return;
      if (def.inputs > 0 && incomingEdges(node.id).length === 0) {
        issues.push({ nodeId: node.id, label: node.name + ' | not connected' });
      }
      if (node.type === 'check') {
        if (outgoingEdges(node.id, 'exc').length === 0) {
          issues.push({ nodeId: node.id, label: node.name + ' | exception path goes nowhere' });
        }
      }
      if (node.type === 'export' && incomingEdges(node.id).length > 0 && !hasApprovalAncestor(node.id)) {
        issues.push({ nodeId: node.id, label: node.name + ' | no sign-off before posting to the GL' });
      }
    });
    return issues;
  }

  function isPortUnconnected(node, port) {
    if (port === 'in') return TYPES[node.type].inputs > 0 && incomingEdges(node.id).length === 0;
    return port === 'exc' && outgoingEdges(node.id, port).length === 0;
  }

  /* -----------------------------------------------------------------------
     Rendering - palette (static, rendered once). §3.2 markup contract.
     ----------------------------------------------------------------------- */
  function togglePalette() {
    state.paletteCollapsed = !state.paletteCollapsed;
    $body.classList.toggle('pal-collapsed', state.paletteCollapsed);
    savePref('arkk.workflows.paletteCollapsed', state.paletteCollapsed);
    var btn = q('wfPaletteToggle');
    if (btn) {
      btn.setAttribute('aria-expanded', String(!state.paletteCollapsed));
      /* DEFECT FIX: the "Steps" label is display:none while collapsed (see
         .wf-body.pal-collapsed .wf-palette-head .heading), so the tooltip
         is the only remaining name for the rail - it must say what the
         click will do, not stay stuck on "Collapse" forever. */
      var label = state.paletteCollapsed ? 'Expand steps panel' : 'Collapse steps panel';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
    /* Bug-fix (diagnosis §3): the grid column swap resizes #wfViewport but
       previously nothing recomputed the camera, so content stayed pinned at
       whatever scale it was fit to when the panel was last open - even once
       the canvas tripled in width. Re-fit once the grid-column transition
       settles (§ refitIfAutoFit guards against clobbering a manual view). */
    afterDelay(reduce ? 0 : 280, refitIfAutoFit);
  }

  function renderPaletteOnce() {
    clear($palette);
    var head = mk('div', 'wf-palette-head');
    head.appendChild(mk('div', 'heading', { text: 'Steps' }));
    var toggle = mk('button', 'wf-panel-toggle', {
      type: 'button', id: 'wfPaletteToggle',
      'aria-controls': 'wfPalette', 'aria-expanded': String(!state.paletteCollapsed),
      'aria-label': 'Collapse steps panel', title: 'Collapse steps panel'
    });
    toggle.appendChild(iconFromPaths('ico-xs', [{ tag: 'path', attrs: { d: 'M15 5l-7 7 7 7' } }]));
    toggle.addEventListener('click', togglePalette);
    head.appendChild(toggle);
    $palette.appendChild(head);
    PALETTE.forEach(function (cat) {
      var catEl = mk('div', 'wf-palette-cat');
      catEl.appendChild(mk('div', 'heading', { text: cat.heading }));
      cat.items.forEach(function (item) {
        var btn = mk('button', 'palette-node', { type: 'button', title: item.name });
        var chip = mk('span', 'wf-chip ' + TYPES[item.type].chip);
        chip.appendChild(typeIcon(item.type, 'ico-xs'));
        btn.appendChild(chip);
        /* THE FIX (bug 2.1): the label is a real element with a class - was
           previously mk('span', '', {text: item.name}), a classless span the
           collapse CSS could never target. */
        btn.appendChild(mk('span', 'pnode-label', { text: item.name }));
        btn.appendChild(mk('span', 'pnode-grab', { text: '||' }));
        btn.addEventListener('click', function () { addFromPalette(item); });
        catEl.appendChild(btn);
      });
      $palette.appendChild(catEl);
    });
  }

  function nextFreeSlot(col) {
    var x = 40 + col * 260;
    var y = 40;
    var taken = {};
    state.nodes.forEach(function (n) { if (n.x === x) taken[n.y] = true; });
    while (taken[y]) y += 150;
    return { x: x, y: y };
  }

  function addFromPalette(item) {
    var col;
    if (state.selectedNodeId) {
      var sel = nodeById(state.selectedNodeId);
      col = sel ? Math.round((sel.x - 40) / 260) + 1 : 1;
    } else {
      var maxX = 40;
      state.nodes.forEach(function (n) { maxX = Math.max(maxX, n.x); });
      col = state.nodes.length ? Math.round((maxX - 40) / 260) + 1 : 0;
    }
    var slot = nextFreeSlot(col);
    commit('add step');
    var node = { id: genId(), type: item.type, name: item.name, summary: item.summary, status: 'needsConfig', x: slot.x, y: slot.y, config: {} };
    state.nodes.push(node);
    state.selectedNodeId = node.id;
    state.showGallery = false;
    render();
    /* Bug-fix (diagnosis "navigation doesn't work" - a palette click silently
       added a node off-screen at the current stale scale with no re-center,
       so it looked like nothing happened). Pan the camera to the new node so
       it's always visible immediately. */
    panToNode(node.id);
  }

  /* -----------------------------------------------------------------------
     Rendering - nodes (keyed, so only genuinely new nodes get the entrance
     transition; existing nodes are repositioned / updated in place).
     ----------------------------------------------------------------------- */
  function renderNodeContent(el, node) {
    clear(el);
    var def = TYPES[node.type];
    var sMeta = simStatusMeta(node.simState) || statusMeta(node.status);
    el.classList.toggle('sim-running', node.simState === 'running');

    var head = mk('div', 'wf-node-head');
    var chip = mk('span', 'wf-chip ' + def.chip);
    chip.appendChild(typeIcon(node.type, 'ico-xs'));
    head.appendChild(chip);
    head.appendChild(mk('span', 'nm', { text: node.name }));
    if (node.draft) {
      var draftPill = mk('span', 'pill lilac', { text: 'Draft' });
      draftPill.style.cssText = 'padding:1px 7px;font-size:10px;';
      head.appendChild(draftPill);
    }
    head.appendChild(mk('span', 'kebab', { title: 'More', text: String.fromCharCode(8942) }));
    el.appendChild(head);

    el.appendChild(mk('div', 'wf-node-sum', { text: node.summary || '' }));

    var foot = mk('div', 'wf-node-foot');
    var pill = mk('span', 'status-pill ' + sMeta.cls);
    pill.appendChild(mk('span', 'dot'));
    pill.appendChild(txt(sMeta.text));
    foot.appendChild(pill);
    var withCount = state.edges.filter(function (e) { return (e.from.node === node.id || e.to.node === node.id) && e.count; })[0];
    if (withCount) foot.appendChild(mk('span', 'wf-count', { text: withCount.count }));
    el.appendChild(foot);

    if (def.inputs > 0) {
      var portIn = mk('span', 'wf-port in ' + (isPortUnconnected(node, 'in') ? 'unconnected' : 'connected'));
      portIn.dataset.port = 'in';
      el.appendChild(portIn);
    }
    def.outputs.forEach(function (p) {
      var cls = p === 'meets' ? 'meets' : (p === 'exc' ? 'exc' : '');
      var connState = outgoingEdges(node.id, p).length ? 'connected' : (p === 'exc' ? 'unconnected' : '');
      var portOut = mk('span', ('wf-port out ' + cls + ' ' + connState).replace(/\s+/g, ' ').trim());
      portOut.dataset.port = p;
      el.appendChild(portOut);
    });
  }

  function renderNodes() {
    var seen = {};
    state.nodes.forEach(function (node) {
      seen[node.id] = true;
      var el = nodeEls[node.id];
      var isNew = false;
      if (!el) {
        el = document.createElement('div');
        el.className = 'wf-node';
        el.dataset.id = node.id;
        $world.appendChild(el);
        nodeEls[node.id] = el;
        isNew = true;
      }
      renderNodeContent(el, node);
      el.classList.toggle('wide', node.type === 'trigger');
      el.classList.toggle('selected', state.selectedNodeId === node.id);
      el.classList.toggle('draft', !!node.draft);
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      if (isNew && !reduce) {
        el.classList.add('entering');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            el.style.transition = 'opacity var(--dur-ui) var(--ease-house), transform var(--dur-ui) var(--ease-house)';
            el.classList.remove('entering');
          });
        });
      }
      wireNodeEvents(el, node);
    });
    Object.keys(nodeEls).forEach(function (id) {
      if (!seen[id]) { nodeEls[id].remove(); delete nodeEls[id]; }
    });
  }

  function wireNodeEvents(el, node) {
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('pointerdown', function (ev) { onNodePointerDown(ev, node.id); });
    }
    el.querySelectorAll('.wf-port.out').forEach(function (p) {
      p.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); onPortPointerDown(ev, node.id, p.dataset.port); });
    });
    var kebab = el.querySelector('.kebab');
    if (kebab) {
      kebab.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      kebab.addEventListener('click', function (ev) { ev.stopPropagation(); openNodeMenu(ev, node.id); });
    }
    var nm = el.querySelector('.nm');
    if (nm) nm.addEventListener('dblclick', function (ev) { ev.stopPropagation(); startRenameNode(node.id, nm); });
  }

  /* §1.3 - node drag. The node lives in world coords; offsetLeft/offsetTop
     are unaffected by the parent's CSS transform, so a screen drag delta
     becomes a world delta by dividing by scale, exactly as before zoom. */
  function onNodePointerDown(ev, nodeId) {
    if (ev.button !== undefined && ev.button !== 0) return;
    var el = nodeEls[nodeId];
    if (!el) return;
    var startX = ev.clientX, startY = ev.clientY;
    var origLeft = el.offsetLeft, origTop = el.offsetTop;
    var moved = false;
    var committed = false;
    function move(e2) {
      var dx = (e2.clientX - startX) / cam.s, dy = (e2.clientY - startY) / cam.s;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (moved) {
        if (!committed) { commit('move step'); committed = true; }
        el.style.left = (origLeft + dx) + 'px';
        el.style.top = (origTop + dy) + 'px';
        updateEdgesTouching(nodeId);
      }
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (moved) {
        var snappedX = Math.max(20, Math.round(el.offsetLeft / 20) * 20);
        var snappedY = Math.max(20, Math.round(el.offsetTop / 20) * 20);
        var node = nodeById(nodeId);
        if (node) { node.x = snappedX; node.y = snappedY; }
        render();
      } else {
        selectNode(nodeId);
      }
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function selectNode(id) { state.selectedNodeId = id; state.selectedEdgeId = null; render(); }

  function openNodeMenu(ev, nodeId) {
    var existing = document.querySelector('.wf-node-menu');
    if (existing) existing.remove();
    var menu = mk('div', 'wf-node-menu');
    var rect = ev.target.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = Math.max(8, rect.right - 132) + 'px';
    var dup = mk('button', '', { type: 'button', text: 'Duplicate' });
    var del = mk('button', '', { type: 'button', text: 'Delete' });
    menu.appendChild(dup);
    menu.appendChild(del);
    document.body.appendChild(menu);
    function close() { menu.remove(); document.removeEventListener('mousedown', onDoc, true); }
    function onDoc(e2) { if (!menu.contains(e2.target)) close(); }
    dup.addEventListener('click', function () { close(); duplicateNode(nodeId); });
    del.addEventListener('click', function () { close(); requestDeleteNode(nodeId, ev.target); });
    setTimeout(function () { document.addEventListener('mousedown', onDoc, true); }, 0);
  }

  function duplicateNode(nodeId) {
    var n = nodeById(nodeId);
    if (!n) return;
    commit('duplicate step');
    var copy = { id: genId(), type: n.type, name: n.name + ' copy', summary: n.summary, status: n.status, x: n.x + 20, y: n.y + 20, config: JSON.parse(JSON.stringify(n.config || {})) };
    state.nodes.push(copy);
    state.selectedNodeId = copy.id;
    render();
  }

  function requestDeleteNode(nodeId, anchorEl) {
    var n = nodeById(nodeId);
    if (!n) return;
    var edgeCount = state.edges.filter(function (e) { return e.from.node === nodeId || e.to.node === nodeId; }).length;
    if (edgeCount === 0) { deleteNode(nodeId); return; }
    confirmInline(anchorEl, 'Delete "' + n.name + '"? Its ' + edgeCount + ' connected edge' + (edgeCount === 1 ? '' : 's') + ' will be removed too.', function () { deleteNode(nodeId); });
  }

  function deleteNode(nodeId) {
    commit('delete step');
    state.nodes = state.nodes.filter(function (n) { return n.id !== nodeId; });
    state.edges = state.edges.filter(function (e) { return e.from.node !== nodeId && e.to.node !== nodeId; });
    if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
    render();
    showToast('Step deleted. Undo (⌘Z)');
  }

  function startRenameNode(nodeId, nmEl) {
    var node = nodeById(nodeId);
    if (!node) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.value = node.name;
    input.style.cssText = 'font-size:13px;font-weight:500;color:var(--ink);border:1px solid var(--brand-line);border-radius:5px;padding:1px 4px;width:100%;';
    nmEl.replaceWith(input);
    input.focus();
    input.select();
    var original = node.name;
    function commitRename() {
      var val = input.value.trim() || node.name;
      if (val !== original) { commit('rename step'); node.name = val; }
      render();
    }
    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = node.name; input.blur(); } });
  }

  /* -----------------------------------------------------------------------
     Rendering - edges (keyed; only new edges get the draw-in animation).
     ----------------------------------------------------------------------- */
  /* Ports render as 7px-deep integrated nubs on the card edge, so edges
     anchor at the nub's outer face, not the card border itself. */
  var PORT_NUB = 7;
  function portCoords(nodeId, port) {
    var el = nodeEls[nodeId];
    if (!el) return { x: 0, y: 0 };
    var w = el.offsetWidth, h = el.offsetHeight;
    var x = el.offsetLeft, y = el.offsetTop;
    if (port === 'in') return { x: x - PORT_NUB, y: y + h * 0.5 };
    if (port === 'meets') return { x: x + w + PORT_NUB, y: y + h * 0.3 };
    if (port === 'exc') return { x: x + w + PORT_NUB, y: y + h * 0.7 };
    return { x: x + w + PORT_NUB, y: y + h * 0.5 };
  }

  function edgePathD(x1, y1, x2, y2) {
    var c = Math.max(36, Math.min(Math.abs(x2 - x1) * 0.5, 160));
    return 'M' + x1 + ',' + y1 + ' C' + (x1 + c) + ',' + y1 + ' ' + (x2 - c) + ',' + y2 + ' ' + x2 + ',' + y2;
  }

  /* Arrowhead marker, built once, referenced by every non-rubber edge. */
  function buildArrowMarker() {
    if (q('wfArrow')) return;
    var defs = svgEl('defs', {});
    var marker = svgEl('marker', {
      id: 'wfArrow', viewBox: '0 0 10 10', refX: '8.5', refY: '5',
      markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse'
    });
    marker.appendChild(svgEl('path', {
      d: 'M1,1 L9,5 L1,9', fill: 'none',
      stroke: 'oklch(18% 0.014 254 / 0.40)', 'stroke-width': '1.6',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    defs.appendChild(marker);
    $edgesSvg.appendChild(defs);
  }

  function computeEdgeGeom(edge) {
    var a = portCoords(edge.from.node, edge.from.port);
    var b = portCoords(edge.to.node, edge.to.port);
    return { d: edgePathD(a.x, a.y, b.x, b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  function updateEdgesTouching(nodeId) {
    state.edges.forEach(function (edge) {
      if (edge.from.node !== nodeId && edge.to.node !== nodeId) return;
      var cache = edgeEls[edge.id];
      if (!cache) return;
      var g = computeEdgeGeom(edge);
      cache.path.setAttribute('d', g.d);
      cache.hit.setAttribute('d', g.d);
      if (cache.pill) { cache.pill.style.left = g.mx + 'px'; cache.pill.style.top = g.my + 'px'; }
    });
    if (state.selectedEdgeId) renderEdgeDelete();
  }

  function renderEdges() {
    buildArrowMarker();
    var seen = {};
    state.edges.forEach(function (edge) {
      seen[edge.id] = true;
      var cache = edgeEls[edge.id];
      var isNew = false;
      if (!cache) {
        var hitEl = svgEl('path', { class: 'edge-hit' });
        var pathEl = svgEl('path', { class: 'edge' + (edge.kind === 'exception' ? ' exception' : ''), 'marker-end': 'url(#wfArrow)' });
        $edgesSvg.appendChild(hitEl);
        $edgesSvg.appendChild(pathEl);
        cache = { path: pathEl, hit: hitEl, pill: null };
        edgeEls[edge.id] = cache;
        isNew = true;
        hitEl.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); selectEdge(edge.id); });
        hitEl.addEventListener('mouseenter', function () { if (state.selectedEdgeId !== edge.id) pathEl.classList.add('hover'); });
        hitEl.addEventListener('mouseleave', function () { pathEl.classList.remove('hover'); });
      }
      cache.path.classList.toggle('selected', state.selectedEdgeId === edge.id);
      var g = computeEdgeGeom(edge);
      cache.path.setAttribute('d', g.d);
      cache.hit.setAttribute('d', g.d);
      if (edge.count) {
        if (!cache.pill) {
          var pill = mk('div', 'wf-edge-pill' + (edge.kind === 'exception' ? ' exception' : ''));
          $world.appendChild(pill);
          cache.pill = pill;
        }
        cache.pill.textContent = edge.count;
        cache.pill.style.left = g.mx + 'px';
        cache.pill.style.top = g.my + 'px';
      } else if (cache.pill) {
        cache.pill.remove();
        cache.pill = null;
      }
      if (isNew && !reduce) {
        try {
          var len = cache.path.getTotalLength();
          cache.path.style.strokeDasharray = String(len);
          cache.path.style.strokeDashoffset = String(len);
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              cache.path.style.transition = 'stroke-dashoffset 560ms var(--ease-house)';
              cache.path.style.strokeDashoffset = '0';
            });
          });
        } catch (e) { /* getTotalLength unsupported in some headless edge cases - degrade to static */ }
      }
    });
    Object.keys(edgeEls).forEach(function (id) {
      if (!seen[id]) {
        edgeEls[id].path.remove();
        edgeEls[id].hit.remove();
        if (edgeEls[id].pill) edgeEls[id].pill.remove();
        delete edgeEls[id];
        if (state.selectedEdgeId === id) state.selectedEdgeId = null;
      }
    });
    renderEdgeDelete();
  }

  /* -----------------------------------------------------------------------
     Edge selection + delete.
     ----------------------------------------------------------------------- */
  function selectEdge(edgeId) {
    state.selectedEdgeId = edgeId;
    state.selectedNodeId = null;
    render();
  }

  function edgeById(id) { for (var i = 0; i < state.edges.length; i++) if (state.edges[i].id === id) return state.edges[i]; return null; }

  function deleteEdge(edgeId) {
    commit('disconnect');
    state.edges = state.edges.filter(function (e) { return e.id !== edgeId; });
    if (state.selectedEdgeId === edgeId) state.selectedEdgeId = null;
    render();
    showToast('Connection removed. Undo (⌘Z)');
  }

  var $edgeDelBtn = null;
  function renderEdgeDelete() {
    if ($edgeDelBtn) { $edgeDelBtn.remove(); $edgeDelBtn = null; }
    var edge = state.selectedEdgeId ? edgeById(state.selectedEdgeId) : null;
    if (!edge || !edgeEls[edge.id]) return;
    var g = computeEdgeGeom(edge);
    var btn = mk('button', 'wf-edge-del', { type: 'button', 'aria-label': 'Delete connection', title: 'Delete connection' });
    btn.appendChild(iconFromPaths('ico-xs', [{ tag: 'path', attrs: { d: 'M6 6l12 12M18 6L6 18' } }]));
    btn.style.left = g.mx + 'px';
    btn.style.top = g.my + 'px';
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); deleteEdge(edge.id); });
    btn.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
    $world.appendChild(btn);
    $edgeDelBtn = btn;
  }

  /* -----------------------------------------------------------------------
     §1.3 - connect gesture (rubber-band -> commit). Live endpoint uses the
     screen->world inverse map, not scrollLeft-based cursor math.
     ----------------------------------------------------------------------- */
  function onPortPointerDown(ev, nodeId, port) {
    if (port === 'in') return;
    ev.preventDefault();
    var tempPath = svgEl('path', { class: 'edge rubber' });
    $edgesSvg.appendChild(tempPath);
    function move(e2) {
      var start = portCoords(nodeId, port);
      var w = screenToWorld(e2.clientX, e2.clientY);
      tempPath.setAttribute('d', edgePathD(start.x, start.y, w.x, w.y));
    }
    function up(e2) {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      tempPath.remove();
      var el = document.elementFromPoint(e2.clientX, e2.clientY);
      var targetNodeEl = el && el.closest ? el.closest('.wf-node') : null;
      if (!targetNodeEl) { showToast("Nothing to connect to. Release on a step's left port to wire it."); return; }
      commitConnect(nodeId, port, targetNodeEl.dataset.id);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function commitConnect(fromNodeId, fromPort, toNodeId) {
    if (!toNodeId) { showToast("Nothing to connect to. Release on a step's left port to wire it."); return; }
    if (toNodeId === fromNodeId) { showToast("A step can't feed itself. Pick a different target."); return; }
    var toNode = nodeById(toNodeId);
    if (!toNode || TYPES[toNode.type].inputs === 0) { showToast("Triggers start a flow, they don't take an input."); return; }
    var dup = state.edges.some(function (e) { return e.from.node === fromNodeId && e.from.port === fromPort && e.to.node === toNodeId; });
    if (dup) { showToast('Already connected.'); return; }
    commit('connect');
    var edge = { id: genId(), from: { node: fromNodeId, port: fromPort }, to: { node: toNodeId, port: 'in' }, kind: fromPort === 'exc' ? 'exception' : 'happy', count: null };
    state.edges.push(edge);
    render();
  }

  /* -----------------------------------------------------------------------
     Validation bar rendering.
     ----------------------------------------------------------------------- */
  function renderValidation() {
    var issues = validateGraph();
    if (!issues.length) { $validateBar.hidden = true; return issues; }
    $validateBar.hidden = false;
    $validateCount.textContent = issues.length + (issues.length === 1 ? ' step needs' : ' steps need') + ' attention';
    clear($validateLinks);
    issues.forEach(function (iss, i) {
      if (i > 0) $validateLinks.appendChild(mk('span', 'sep', { text: '|' }));
      var a = mk('a', '', { href: '#', text: iss.label });
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        panToNode(iss.nodeId);
        selectNode(iss.nodeId);
      });
      $validateLinks.appendChild(a);
    });
    return issues;
  }

  /* -----------------------------------------------------------------------
     Toolbar status pill.
     ----------------------------------------------------------------------- */
  function renderToolbarStatus() {
    var issues = validateGraph();
    var pill;
    if (issues.length) pill = { cls: 'warn', text: 'Needs attention' };
    else if (state.meta.savedAt && (Date.now() - state.meta.savedAt) < 4000) pill = { cls: 'done', text: 'Saved just now' };
    else if (state.meta.savedAt) pill = { cls: 'queued', text: 'Saved' };
    else pill = { cls: 'queued', text: 'Draft' };
    $statusPill.className = 'status-pill ' + pill.cls;
    clear($statusPill);
    $statusPill.appendChild(mk('span', 'dot'));
    $statusPill.appendChild(txt(pill.text));
    if ($nameInput.value !== state.meta.name && document.activeElement !== $nameInput) $nameInput.value = state.meta.name;
  }

  /* -----------------------------------------------------------------------
     Config dock (Arkk form idiom, copied page-local per REV-2).
     ----------------------------------------------------------------------- */
  function buildRuleGrid(options, current, onPick) {
    var grid = mk('div', 'rule-grid');
    options.forEach(function (opt) {
      var optEl = mk('div', 'rule-option' + (current === opt ? ' selected' : ''));
      optEl.appendChild(mk('span', '', { text: opt }));
      optEl.addEventListener('click', function () { onPick(opt); });
      grid.appendChild(optEl);
    });
    return grid;
  }

  function buildConfigBody(node) {
    var wrap = mk('div');
    if (node.type === 'trigger') {
      wrap.appendChild(buildRuleGrid(CADENCES, node.config.cadence, function (val) {
        commit('config change'); node.config.cadence = val; node.summary = val; node.status = 'ready'; render();
      }));
    } else if (node.type === 'source') {
      wrap.appendChild(buildRuleGrid(SYSTEMS, node.config.system, function (val) {
        commit('config change'); node.config.system = val; node.summary = val; node.status = 'ready'; render();
      }));
    } else if (node.type === 'check' || node.type === 'approval') {
      wrap.appendChild(buildRuleGrid(OWNERS, node.config.owner || 'Tom Heffes', function (val) {
        commit('config change'); node.config.owner = val; node.summary = (node.type === 'check' ? 'Route to ' : 'Sign-off: ') + val; node.status = 'ready'; render();
      }));
    } else if (node.type === 'export') {
      wrap.appendChild(buildRuleGrid(DESTINATIONS, node.config.destination, function (val) {
        commit('config change'); node.config.destination = val; node.summary = val; node.status = 'ready'; render();
      }));
    } else {
      var field = mk('div', 'wf-config-field');
      field.appendChild(mk('label', '', { text: 'What does this step compute?' }));
      var input = mk('input', '', { type: 'text' });
      input.value = node.summary || '';
      var origSummary = node.summary;
      input.addEventListener('blur', function () {
        if (input.value !== origSummary) commit('config change');
        node.summary = input.value; node.status = 'ready'; render();
      });
      field.appendChild(input);
      wrap.appendChild(field);
    }
    return wrap;
  }

  function buildAdvancedBody(node) {
    var wrap = mk('div');
    function row(k, vEl) {
      var r = mk('div', 'wf-adv-row');
      r.appendChild(mk('span', 'k', { text: k }));
      r.appendChild(vEl);
      wrap.appendChild(r);
    }
    row('Step id', mk('span', 'v mono', { text: node.id }));
    row('Retry policy', mk('span', 'v', { text: node.config.retry || 'None' }));
    if (node.type === 'export') {
      var toggle = mk('span', 'wf-toggle' + (node.config.reversible !== false ? ' on' : ''));
      toggle.addEventListener('click', function () { commit('config change'); node.config.reversible = node.config.reversible === false ? true : false; render(); });
      row('Reversible', toggle);
    }
    var notesField = mk('div', 'wf-config-field');
    notesField.style.marginTop = '10px';
    notesField.appendChild(mk('label', '', { text: 'Notes' }));
    var notesInput = mk('input', '', { type: 'text', placeholder: 'Reference a prior step with {{ }} (e.g. {{calc.markup}})' });
    notesInput.value = node.config.notes || '';
    var origNotes = node.config.notes || '';
    notesInput.addEventListener('blur', function () {
      if (notesInput.value !== origNotes) commit('config change');
      node.config.notes = notesInput.value; render();
    });
    notesField.appendChild(notesInput);
    wrap.appendChild(notesField);
    return wrap;
  }

  function buildConfigDock(node) {
    var def = TYPES[node.type];
    var root = mk('div', 'edit-card');
    root.style.cssText = 'border:0;border-radius:0;';

    var head = mk('div', 'edit-head');
    head.appendChild(buildDockCollapseBtn());
    head.appendChild(mk('div', 'label', { text: def.label }));
    var h2 = mk('h2');
    var chip = mk('span', 'wf-chip ' + def.chip);
    chip.appendChild(typeIcon(node.type, 'ico-xs'));
    h2.appendChild(chip);
    var nameInput = mk('input', '', { type: 'text' });
    nameInput.value = node.name;
    nameInput.style.cssText = 'border:none;background:transparent;font:inherit;font-size:20px;width:100%;color:var(--ink);';
    var origName = node.name;
    nameInput.addEventListener('blur', function () {
      var val = nameInput.value.trim() || node.name;
      if (val !== origName) commit('rename step');
      node.name = val; render();
    });
    h2.appendChild(nameInput);
    head.appendChild(h2);

    var seg = mk('div', 'seg');
    seg.style.cssText = 'margin-top:12px;margin-left:0;';
    [['config', 'Config'], ['advanced', 'Advanced']].forEach(function (pair) {
      var b = mk('button', dockTab === pair[0] ? 'on' : '', { type: 'button', text: pair[1] });
      b.addEventListener('click', function () { dockTab = pair[0]; render(); });
      seg.appendChild(b);
    });
    head.appendChild(seg);
    root.appendChild(head);

    var body = mk('div', 'edit-body wf-config-wrap');
    body.appendChild(dockTab === 'config' ? buildConfigBody(node) : buildAdvancedBody(node));
    root.appendChild(body);

    var footWrap = mk('div');
    footWrap.style.cssText = 'padding:0 22px 20px;';
    var back = mk('button', 'btn ghost', { type: 'button', text: 'Back to assistant' });
    back.style.width = '100%';
    back.addEventListener('click', function () { state.selectedNodeId = null; render(); });
    footWrap.appendChild(back);
    root.appendChild(footWrap);

    return root;
  }

  /* -----------------------------------------------------------------------
     Assistant - scripted, deterministic (no live model).
     ----------------------------------------------------------------------- */
  var INTENT_CHIPS = ['Automate the Q4 close', 'Route FX exceptions', 'Weekly variance alert'];
  var TRACE_DEMO = ['Reading your description', 'Mapping to Arkk steps', 'Found 3 feeds: SAP, Workday, FX rates', 'Placing calculate step', 'Checking exception routing', 'Drafting a sign-off before post'];
  var TRACE_GENERIC = ['Reading your description', 'Mapping to Arkk steps', 'Drafting a starting point'];

  function isDemoIntent(text) { return /quarter|q4|fx|variance/i.test(text || ''); }

  function buildSuggestionBox(s, lines, actions) {
    var box = mk('div', 'wf-a-suggestion' + (s.resolved ? ' resolved' : ''));
    if (s.resolved) {
      var p = mk('span', 'status-pill done');
      p.appendChild(mk('span', 'dot'));
      p.appendChild(txt(s.resolvedLabel));
      box.appendChild(p);
      return box;
    }
    lines.forEach(function (line) { box.appendChild(mk('div', 'txt', { text: line })); });
    var actionsWrap = mk('div', 'actions');
    actions.forEach(function (a) {
      var cls = a.primary ? 'btn primary' : 'btn soft';
      var btn = mk('button', cls, { type: 'button', text: a.label });
      btn.addEventListener('click', a.onClick);
      actionsWrap.appendChild(btn);
    });
    box.appendChild(actionsWrap);
    return box;
  }

  function buildDockCollapseBtn() {
    var btn = mk('button', 'wf-panel-toggle wf-dock-collapse-btn', { type: 'button', 'aria-label': 'Collapse panel', title: 'Collapse panel' });
    btn.appendChild(iconFromPaths('ico-xs', [{ tag: 'path', attrs: { d: 'M9 5l7 7-7 7' } }]));
    btn.addEventListener('click', toggleDock);
    return btn;
  }

  function buildAssistantDock() {
    var a = state.assistant;
    var root = mk('div', 'wf-assistant');

    var headEl = mk('div', 'wf-a-head');
    var pillLilac = mk('span', 'pill lilac');
    pillLilac.appendChild(mk('span', 'dot'));
    pillLilac.appendChild(txt('Assistant'));
    headEl.appendChild(pillLilac);
    headEl.appendChild(mk('div', 'wf-a-disclaimer', { text: 'The assistant drafts steps from your description. Check owners, thresholds and anything that posts before you run it.' }));
    headEl.appendChild(buildDockCollapseBtn());
    root.appendChild(headEl);

    var bodyEl = mk('div', 'wf-a-body');
    bodyEl.id = 'wfABody';

    if (!a.messages.length && a.stage === 'idle') {
      var chips = mk('div', 'wf-a-chips');
      INTENT_CHIPS.forEach(function (c) {
        var chip = mk('button', 'wf-a-chip', { type: 'button', text: c });
        chip.addEventListener('click', function () { runAssistant(c); });
        chips.appendChild(chip);
      });
      bodyEl.appendChild(chips);
    }

    a.messages.forEach(function (m) {
      var msg = mk('div', 'wf-a-msg');
      if (m.role === 'user') {
        msg.appendChild(mk('b', '', { text: 'You: ' }));
        msg.appendChild(txt(m.text));
      } else {
        msg.textContent = m.text;
      }
      bodyEl.appendChild(msg);
    });

    if (a.traceLines.length && a.stage !== 'idle') {
      var trace = mk('div', 'wf-trace');
      a.traceLines.forEach(function (line, i) {
        trace.appendChild(mk('div', 'wf-trace-line' + (i < a.traceRevealedCount ? ' in' : ''), { text: line }));
      });
      bodyEl.appendChild(trace);
    }

    if (a.suggestion1 || a.suggestion2) {
      var sugg = mk('div', 'wf-a-suggestions');
      if (a.suggestion1) {
        sugg.appendChild(buildSuggestionBox(a.suggestion1,
          ['1. I routed FX exceptions to John Doe. Your description said Tom - want me to fix the owner?'],
          [
            { label: 'Route to Tom Heffes', primary: true, onClick: function () { handleSuggestion('1-fix'); } },
            { label: 'Keep John Doe', primary: false, onClick: function () { handleSuggestion('1-keep'); } }
          ]));
      }
      if (a.suggestion2) {
        sugg.appendChild(buildSuggestionBox(a.suggestion2,
          ['2. Add an approval step before posting to the GL?'],
          [{ label: 'Add approval', primary: true, onClick: function () { handleSuggestion('2-add'); } }]));
      }
      bodyEl.appendChild(sugg);
    }

    root.appendChild(bodyEl);

    var footEl = mk('div', 'wf-a-foot');
    var textarea = mk('textarea', 'wf-a-input', { rows: '3', placeholder: 'Describe a routine - e.g. every quarter end, pull the three feeds, run the dry calc, route FX exceptions to Tom, post after approval.' });
    textarea.id = 'wfAInput';
    footEl.appendChild(textarea);
    var sendWrap = mk('div', 'wf-a-send');
    var sendBtn = mk('button', 'btn primary', { type: 'button', text: 'Send' });
    sendBtn.addEventListener('click', function () {
      var text = textarea.value.trim();
      if (!text) return;
      runAssistant(text);
    });
    sendWrap.appendChild(sendBtn);
    footEl.appendChild(sendWrap);
    root.appendChild(footEl);

    return root;
  }

  function toggleDock() {
    state.dockCollapsed = !state.dockCollapsed;
    $body.classList.toggle('dock-collapsed', state.dockCollapsed);
    savePref('arkk.workflows.dockCollapsed', state.dockCollapsed);
    var tab = $dock.querySelector('.wf-dock-tab');
    if (tab) tab.setAttribute('aria-expanded', String(!state.dockCollapsed));
    /* Bug-fix (diagnosis §3) - see togglePalette(). */
    afterDelay(reduce ? 0 : 280, refitIfAutoFit);
  }

  function buildDockTab() {
    var tab = mk('div', 'wf-dock-tab', { role: 'button', tabindex: '0', 'aria-expanded': String(!state.dockCollapsed), 'aria-controls': 'wfDock', 'aria-label': 'Expand panel' });
    tab.appendChild(iconFromPaths('ico-xs', [{ tag: 'path', attrs: { d: 'M15 5l-7 7 7 7' } }]));
    tab.appendChild(txt(state.selectedNodeId ? 'Configure' : 'Assistant'));
    function activate() { toggleDock(); }
    tab.addEventListener('click', activate);
    tab.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); } });
    return tab;
  }

  function renderDock() {
    clear($dock);
    $dock.appendChild(buildDockTab());
    if (state.selectedNodeId && nodeById(state.selectedNodeId)) {
      $dock.appendChild(buildConfigDock(nodeById(state.selectedNodeId)));
    } else {
      $dock.appendChild(buildAssistantDock());
    }
  }

  function traceReveal(lines, onDone) {
    state.assistant.traceLines = lines;
    state.assistant.traceRevealedCount = reduce ? lines.length : 0;
    state.assistant.stage = 'tracing';
    render();
    if (reduce) { onDone(); return; }
    var i = 0;
    function next() {
      i++;
      state.assistant.traceRevealedCount = i;
      render();
      if (i < lines.length) afterDelay(320 + (i % 2) * 60, next);
      else afterDelay(300, onDone);
    }
    afterDelay(320, next);
  }

  function runAssistant(text) {
    state.assistant.messages.push({ role: 'user', text: text });
    state.selectedNodeId = null;
    var demo = isDemoIntent(text);
    render();
    traceReveal(demo ? TRACE_DEMO : TRACE_GENERIC, function () {
      if (demo) streamDemoDraft(); else streamGenericDraft();
    });
  }

  function isFirstRunOnly() {
    return state.nodes.length === 1 && state.nodes[0].summary === 'Not yet configured';
  }

  function currentOffsetX() {
    var offsetX = 40;
    if (isFirstRunOnly() || !state.nodes.length) return 40;
    state.nodes.forEach(function (n) { offsetX = Math.max(offsetX, n.x + 260); });
    return offsetX;
  }

  function streamDemoDraft() {
    var offsetX = currentOffsetX();
    var replaceWhole = offsetX === 40;
    var defs = [
      { type: 'trigger', name: 'Schedule', summary: 'Quarter-end' },
      { type: 'source', name: 'SAP trial balance', summary: 'General ledger feed' },
      { type: 'source', name: 'Workday cost centres', summary: 'Cost centre master' },
      { type: 'source', name: 'FX rates', summary: 'Currency feed' },
      { type: 'transform', name: 'Dry calc', summary: 'No post' },
      { type: 'check', name: 'Route FX exceptions', summary: 'Route FX → John Doe' },
      { type: 'export', name: 'Post to GL', summary: 'Reversible' }
    ];
    var edgeDefs = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4], [4, 5], [5, 6, 'meets']];
    var positions = layoutGraph(defs, edgeDefs);
    var newNodes = defs.map(function (d, i) {
      return { id: genId(), type: d.type, name: d.name, summary: d.summary, status: 'ready', x: positions[i].x + (replaceWhole ? 0 : offsetX), y: positions[i].y, config: d.type === 'check' ? { owner: 'John Doe' } : {}, draft: true };
    });
    var newEdges = edgeDefs.map(function (e) {
      var port = e[2] || 'out';
      return { id: genId(), from: { node: newNodes[e[0]].id, port: port }, to: { node: newNodes[e[1]].id, port: 'in' }, kind: port === 'exc' ? 'exception' : 'happy', count: null, draft: true };
    });
    state.assistant.demoRefs = { checkId: newNodes[5].id, exportId: newNodes[6].id };
    commit('AI draft');
    if (replaceWhole) { state.nodes = []; state.edges = []; }
    state.assistant.stage = 'streaming';
    streamNodes(newNodes, newEdges, function () {
      state.assistant.stage = 'draft';
      state.assistant.draftActive = true;
      state.assistant.suggestion1 = { resolved: false };
      state.assistant.suggestion2 = { resolved: false };
      showDraftBar();
      render();
    });
  }

  function streamGenericDraft() {
    var offsetX = currentOffsetX();
    var replaceWhole = offsetX === 40;
    var defs = [
      { type: 'trigger', name: 'Schedule', summary: 'Set a cadence' },
      { type: 'source', name: 'Data source', summary: 'Pick a feed' },
      { type: 'export', name: 'Notify', summary: 'Email or in-app' }
    ];
    var edgeDefs = [[0, 1], [1, 2]];
    var positions = layoutGraph(defs, edgeDefs);
    var newNodes = defs.map(function (d, i) { return { id: genId(), type: d.type, name: d.name, summary: d.summary, status: 'needsConfig', x: positions[i].x + (replaceWhole ? 0 : offsetX), y: positions[i].y, config: {}, draft: true }; });
    var newEdges = edgeDefs.map(function (e) { return { id: genId(), from: { node: newNodes[e[0]].id, port: 'out' }, to: { node: newNodes[e[1]].id, port: 'in' }, kind: 'happy', count: null, draft: true }; });
    commit('AI draft');
    if (replaceWhole) { state.nodes = []; state.edges = []; }
    state.assistant.stage = 'streaming';
    streamNodes(newNodes, newEdges, function () {
      state.assistant.stage = 'draft';
      state.assistant.draftActive = true;
      showDraftBar();
      render();
    });
  }

  function streamNodes(newNodes, newEdges, onDone) {
    if (reduce) {
      newNodes.forEach(function (n) { state.nodes.push(n); });
      newEdges.forEach(function (e) { state.edges.push(e); });
      render();
      onDone();
      return;
    }
    var i = 0;
    function nextNode() {
      if (i >= newNodes.length) { afterDelay(120, edgesPhase); return; }
      state.nodes.push(newNodes[i]);
      render();
      i++;
      afterDelay(70, nextNode);
    }
    function edgesPhase() {
      var j = 0;
      function nextEdge() {
        if (j >= newEdges.length) { onDone(); return; }
        state.edges.push(newEdges[j]);
        render();
        j++;
        afterDelay(60, nextEdge);
      }
      nextEdge();
    }
    nextNode();
  }

  function showDraftBar() {
    clear($draftBar);
    $draftBar.hidden = false;
    $draftBar.appendChild(mk('div', 'txt', { text: 'Draft from your description. Nothing is saved yet.' }));
    var actions = mk('div', 'actions');
    var modifyBtn = mk('button', 'btn soft', { type: 'button', text: 'Modify prompt' });
    var discardBtn = mk('button', 'btn soft', { type: 'button', text: 'Discard' });
    var keepBtn = mk('button', 'btn primary', { type: 'button', text: 'Keep draft' });
    actions.appendChild(modifyBtn);
    actions.appendChild(discardBtn);
    actions.appendChild(keepBtn);
    $draftBar.appendChild(actions);
    void $draftBar.offsetWidth;
    $draftBar.classList.add('in');
    keepBtn.addEventListener('click', keepDraft);
    discardBtn.addEventListener('click', discardDraft);
    modifyBtn.addEventListener('click', function () { discardDraft(); var input = q('wfAInput'); if (input) input.focus(); });
  }

  function hideDraftBar() {
    $draftBar.classList.remove('in');
    afterDelay(reduce ? 0 : 260, function () { $draftBar.hidden = true; clear($draftBar); });
  }

  function springSettle(nodeId) {
    var el = nodeEls[nodeId];
    if (el && !reduce) { el.classList.add('wf-spring-settle'); setTimeout(function () { el.classList.remove('wf-spring-settle'); }, 300); }
  }

  function keepDraft() {
    commit('keep AI draft');
    state.nodes.forEach(function (n) {
      if (n.draft) { n.draft = false; springSettle(n.id); }
    });
    state.edges.forEach(function (e) { if (e.draft) e.draft = false; });
    state.assistant.draftActive = false;
    hideDraftBar();
    render();
  }

  function discardDraft() {
    commit('discard draft');
    clearSimStates();
    state.nodes = state.nodes.filter(function (n) { return !n.draft; });
    state.edges = state.edges.filter(function (e) { return !e.draft; });
    if (!state.nodes.length) seedFirstRun();
    state.assistant.draftActive = false;
    state.assistant.suggestion1 = null;
    state.assistant.suggestion2 = null;
    state.assistant.demoRefs = null;
    state.assistant.messages.push({ role: 'assistant', text: 'Draft discarded.' });
    hideDraftBar();
    render();
  }

  function handleSuggestion(key) {
    var refs = state.assistant.demoRefs;
    if (!refs) return;
    if (key === '1-fix') {
      commit('owner correction');
      var check = nodeById(refs.checkId);
      if (check) {
        check.config.owner = 'Tom Heffes';
        check.summary = 'Route FX → Tom Heffes';
        springSettle(refs.checkId);
      }
      state.assistant.suggestion1 = { resolved: true, resolvedLabel: 'Owner corrected' };
      render();
      showToast('Got it, exceptions go to Tom.');
    } else if (key === '1-keep') {
      state.assistant.suggestion1 = { resolved: true, resolvedLabel: 'Kept John Doe' };
      render();
    } else if (key === '2-add') {
      addApprovalBeforeExport();
      state.assistant.suggestion2 = { resolved: true, resolvedLabel: 'Approval added' };
      render();
    }
  }

  function addApprovalBeforeExport() {
    var refs = state.assistant.demoRefs;
    if (!refs) return;
    var checkNode = nodeById(refs.checkId);
    var exportNode = nodeById(refs.exportId);
    if (!checkNode || !exportNode) return;
    commit('add approval');
    var edge = state.edges.filter(function (e) { return e.from.node === refs.checkId && e.from.port === 'meets' && e.to.node === refs.exportId; })[0];
    var approvalNode = { id: genId(), type: 'approval', name: 'Approval', summary: 'Owner: Tom Heffes', status: 'ready', x: exportNode.x, y: exportNode.y, config: { owner: 'Tom Heffes' }, draft: state.assistant.draftActive };
    exportNode.x = exportNode.x + 260;
    state.nodes.push(approvalNode);
    if (edge) edge.to = { node: approvalNode.id, port: 'in' };
    state.edges.push({ id: genId(), from: { node: approvalNode.id, port: 'out' }, to: { node: exportNode.id, port: 'in' }, kind: 'happy', count: null, draft: state.assistant.draftActive });
    render();
    springSettle(approvalNode.id);
    springSettle(refs.exportId);
  }

  /* -----------------------------------------------------------------------
     Gallery (rendered once; visibility toggled by render()).
     ----------------------------------------------------------------------- */
  function renderGalleryOnce() {
    clear($gallery);
    var head = mk('div', 'wf-gallery-head');
    var headLeft = mk('div');
    headLeft.appendChild(mk('h3', '', { text: 'Start from a routine your team already runs.' }));
    headLeft.appendChild(mk('div', 'sub', { text: 'Templates seed a live, connected canvas - every step stays fully editable.' }));
    head.appendChild(headLeft);
    var closeBtn = mk('button', 'btn ghost wf-gallery-close', { type: 'button', text: 'Close' });
    closeBtn.addEventListener('click', function () { state.showGallery = false; render(); });
    head.appendChild(closeBtn);
    $gallery.appendChild(head);

    var grid = mk('div', 'wf-gallery');

    var blank = mk('div', 'tpl-card blank');
    var blankIco = mk('div', 'ico-wrap');
    blankIco.style.cssText = 'background:var(--bg-2);color:var(--ink-3);';
    blankIco.appendChild(iconFromPaths('ico-sm', [{ tag: 'path', attrs: { d: 'M12 5v14M5 12h14' } }]));
    blank.appendChild(blankIco);
    blank.appendChild(mk('div', 'ttl', { text: 'Start blank' }));
    blank.appendChild(mk('div', 'desc', { text: 'A single Schedule step. Add the rest by hand.' }));
    blank.addEventListener('click', function () {
      /* DEFECT FIX (canvas auto-fit on load): this used to skip fitToView(),
         unlike resetDemo() and applyTemplate() right below. Whatever camera
         a previous, larger graph left behind (e.g. an 11-node template
         zoomed to 38%) stuck around for the new single-node graph, so it
         rendered tiny and adrift instead of centered. */
      function apply() { commit('start blank'); seedFirstRun(); state.showGallery = false; state.meta.name = 'New workflow'; render(); fitToView(); }
      if (state.nodes.length > 1) confirmInline(blank, 'Replace current workflow? Starting blank will clear your current canvas.', apply);
      else apply();
    });
    grid.appendChild(blank);

    TEMPLATES.forEach(function (tpl) {
      var card = mk('div', 'tpl-card');
      card.dataset.tpl = tpl.id;
      var ico = mk('div', 'ico-wrap wf-chip ' + TYPES[tpl.lead].chip);
      ico.appendChild(typeIcon(tpl.lead, 'ico-sm'));
      card.appendChild(ico);
      card.appendChild(mk('div', 'ttl', { text: tpl.name }));
      card.appendChild(mk('div', 'desc', { text: tpl.desc }));
      var touches = mk('div', 'touches');
      tpl.touches.forEach(function (t) { touches.appendChild(mk('span', 'tag', { text: t })); });
      card.appendChild(touches);
      var footerMeta = mk('div', 'footer-meta');
      footerMeta.appendChild(mk('span', 'pill', { text: tpl.nodes.length + ' steps' }));
      footerMeta.appendChild(mk('span', 'sep', { text: '|' }));
      footerMeta.appendChild(mk('span', 'tag ghost', { text: tpl.complexity }));
      card.appendChild(footerMeta);
      card.addEventListener('click', function () { applyTemplate(tpl.id, card); });
      grid.appendChild(card);
    });

    $gallery.appendChild(grid);
  }

  function applyTemplate(tplId, anchorEl) {
    var tpl = TEMPLATES.filter(function (t) { return t.id === tplId; })[0];
    if (!tpl) return;
    function doApply() {
      commit('template seed');
      var positions = layoutGraph(tpl.nodes, tpl.edges);
      var newNodes = tpl.nodes.map(function (d, i) {
        return { id: genId(), type: d.type, name: d.name, summary: d.summary, status: 'ready', x: positions[i].x, y: positions[i].y, config: {} };
      });
      var newEdges = tpl.edges.map(function (e) {
        var port = e[2] || 'out';
        return { id: genId(), from: { node: newNodes[e[0]].id, port: port }, to: { node: newNodes[e[1]].id, port: 'in' }, kind: port === 'exc' ? 'exception' : 'happy', count: e[3] || null };
      });
      state.meta.name = tpl.name;
      state.selectedNodeId = null;
      state.showGallery = false;
      state.nodes = [];
      state.edges = [];
      streamNodes(newNodes, newEdges, function () { render(); afterDelay(reduce ? 0 : 260, function () { fitToView(); }); });
    }
    if (state.nodes.length > 1) confirmInline(anchorEl || document.body, 'Replace current workflow? Starting "' + tpl.name + '" will clear your current canvas.', doApply);
    else doApply();
  }

  /* -----------------------------------------------------------------------
     §4 - dry-run drawer, flex sibling of the viewport with three states:
     closed (hidden) / open (280px) / collapsed (40px strip). Mirrors run-
     detail.html's canon timeline verbatim.
     ----------------------------------------------------------------------- */
  var DRY_RUN_STEPS = [
    { ttl: 'Load trial balance', meta: '14,200 tx | 0.4s' },
    { ttl: 'Apply hierarchy', meta: '182 cost centres | 0.7s' },
    { ttl: 'Apply markup rules', meta: '23 of 23 cells | 0.3s' },
    { ttl: 'Calculate markup', meta: '186 entity pairs' },
    { ttl: 'Generate journals', meta: '372 lines | 186 journals' },
    { ttl: 'Review exceptions', meta: '3 exceptions routed' }
  ];

  function setDrawerState(next) {
    state.drawerState = next;
    $runDrawer.hidden = next === 'closed';
    $runDrawer.classList.toggle('open', next === 'open');
    $runDrawer.classList.toggle('collapsed', next === 'collapsed');
    /* Bug-fix (diagnosis §3) - the drawer is a flex sibling that shrinks the
       viewport above it when opened; re-fit (not just re-clamp) so the
       board reframes into the shorter viewport instead of clipping. */
    afterDelay(reduce ? 0 : 220, function () { recomputeClamp(); refitIfAutoFit(); });
  }

  function buildDrawerHead() {
    var head = mk('div', 'wf-run-drawer-head');
    var ttl = mk('div', 'ttl');
    ttl.appendChild(iconFromPaths('ico-sm', [{ tag: 'path', attrs: { d: 'M5 4l14 8-14 8z' } }]));
    ttl.appendChild(txt(' Dry run '));
    var pill = mk('span', 'status-pill warn');
    pill.appendChild(mk('span', 'dot'));
    pill.appendChild(txt('Dry run only | nothing posts to the GL'));
    ttl.appendChild(pill);
    head.appendChild(ttl);
    var actions = mk('div', 'actions');
    var collapseBtn = mk('button', 'icon-btn wf-run-collapse-btn', { type: 'button', title: 'Collapse to strip', 'aria-label': 'Collapse dry run to a strip' });
    collapseBtn.appendChild(iconFromPaths('ico-sm', [{ tag: 'path', attrs: { d: 'M6 9l6 6 6-6' } }]));
    collapseBtn.addEventListener('click', function (ev) { ev.stopPropagation(); setDrawerState(state.drawerState === 'collapsed' ? 'open' : 'collapsed'); });
    actions.appendChild(collapseBtn);
    var closeBtn = mk('button', 'icon-btn', { type: 'button', title: 'Close', id: 'wfRunClose' });
    closeBtn.appendChild(iconFromPaths('ico-sm', [{ tag: 'path', attrs: { d: 'M6 6l12 12M18 6L6 18' } }]));
    closeBtn.addEventListener('click', function (ev) { ev.stopPropagation(); closeRunDrawer(); });
    actions.appendChild(closeBtn);
    head.appendChild(actions);
    head.addEventListener('click', function () { if (state.drawerState === 'collapsed') setDrawerState('open'); });
    return head;
  }

  function openRunDrawer() {
    if (!state.teaching.dryRan) { state.teaching.dryRan = true; renderTeaching(); }
    clear($runDrawer);
    $runDrawer.appendChild(buildDrawerHead());

    var body = mk('div', 'wf-run-drawer-body');
    var list = mk('div', 'checklist');
    list.id = 'wfRunChecklist';
    DRY_RUN_STEPS.forEach(function (s, i) {
      var row = mk('div', 'checklist-row');
      row.dataset.i = String(i);
      row.appendChild(mk('div', 'mark', { text: String(i + 1) }));
      var bodyDiv = mk('div', 'body');
      bodyDiv.appendChild(mk('div', 'ttl', { text: s.ttl }));
      bodyDiv.appendChild(mk('div', 'meta', { text: s.meta }));
      row.appendChild(bodyDiv);
      var slot = mk('div', 'slot-tag', { text: 'Queued' });
      slot.dataset.slot = String(i);
      row.appendChild(slot);
      list.appendChild(row);
    });
    body.appendChild(list);
    $runDrawer.appendChild(body);

    setDrawerState('open');
    runStepSequence(0);
  }

  function runStepSequence(i) {
    if (i >= DRY_RUN_STEPS.length) return;
    var row = $runDrawer.querySelector('.checklist-row[data-i="' + i + '"]');
    if (!row) return;
    var mark = row.querySelector('.mark');
    var slot = row.querySelector('[data-slot]');
    mark.classList.add('active');
    slot.textContent = 'Running';
    slot.classList.add('active');
    afterDelay(reduce ? 0 : 420, function () {
      mark.classList.remove('active');
      mark.classList.add('done');
      clear(mark);
      mark.appendChild(iconFromPaths('ico-xs', [{ tag: 'path', attrs: { d: 'M5 12l4 4 10-10' } }]));
      slot.textContent = 'Done';
      slot.classList.remove('active');
      slot.classList.add('done');
      runStepSequence(i + 1);
    });
  }

  function closeRunDrawer() {
    setDrawerState('closed');
    afterDelay(reduce ? 0 : 0, function () { clear($runDrawer); });
  }

  /* -----------------------------------------------------------------------
     Run simulation - canvas-level lead-in that feeds the dry-run drawer:
     walks the live graph in depth order, flashing each node to "running"
     then "ran" and briefly weighting its incoming edges, then opens the
     same drawer the header's Dry run button opens.
     ----------------------------------------------------------------------- */
  function orderNodesByDepth() {
    var incoming = {};
    state.nodes.forEach(function (n) { incoming[n.id] = []; });
    state.edges.forEach(function (e) { if (incoming[e.to.node]) incoming[e.to.node].push(e.from.node); });
    var depth = {};
    function calc(id, guard) {
      if (depth[id] !== undefined) return depth[id];
      if (guard[id]) return 0;
      guard[id] = true;
      var ins = incoming[id] || [];
      if (!ins.length) { depth[id] = 0; return 0; }
      var maxD = 0;
      ins.forEach(function (p) { maxD = Math.max(maxD, calc(p, guard)); });
      depth[id] = maxD + 1;
      return depth[id];
    }
    state.nodes.forEach(function (n) { calc(n.id, {}); });
    return state.nodes.slice().sort(function (a, b) { return depth[a.id] - depth[b.id]; });
  }

  function clearSimStates() {
    state.nodes.forEach(function (n) { delete n.simState; });
  }

  function flashIncomingEdges(nodeId) {
    incomingEdges(nodeId).forEach(function (e) {
      var cache = edgeEls[e.id];
      if (!cache) return;
      cache.path.classList.add('hover');
      afterDelay(300, function () { cache.path.classList.remove('hover'); });
    });
  }

  function runSimulationStep(order, i) {
    if (i >= order.length) {
      state.simRunning = false;
      q('wfSimBtn').removeAttribute('aria-disabled');
      q('wfSimBtn').disabled = false;
      openRunDrawer();
      return;
    }
    var node = order[i];
    node.simState = 'running';
    renderNodes();
    flashIncomingEdges(node.id);
    afterDelay(reduce ? 0 : 420, function () {
      node.simState = 'ran';
      renderNodes();
      runSimulationStep(order, i + 1);
    });
  }

  function runSimulation(anchorEl) {
    if (state.simRunning) return;
    var order = orderNodesByDepth();
    if (!order.length) return;
    function start() {
      state.simRunning = true;
      q('wfSimBtn').setAttribute('aria-disabled', 'true');
      q('wfSimBtn').disabled = true;
      if (reduce) {
        order.forEach(function (n) { n.simState = 'ran'; });
        renderNodes();
        state.simRunning = false;
        q('wfSimBtn').removeAttribute('aria-disabled');
        q('wfSimBtn').disabled = false;
        openRunDrawer();
      } else {
        runSimulationStep(order, 0);
      }
    }
    var issues = validateGraph();
    if (issues.length) {
      confirmInline(anchorEl || q('wfSimBtn'), issues.length + (issues.length === 1 ? ' step needs' : ' steps need') + ' attention. Simulate anyway?', start);
    } else {
      start();
    }
  }

  /* -----------------------------------------------------------------------
     Reset demo.
     ----------------------------------------------------------------------- */
  function resetDemo(anchorEl) {
    confirmInline(anchorEl, 'Reset the demo workflow? Your changes here will clear.', function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* no-op */ }
      seedFirstRun();
      state.assistant = { messages: [], traceRevealedCount: 0, traceLines: [], stage: 'idle', draftActive: false, suggestion1: null, suggestion2: null, demoRefs: null };
      state.teaching = { dismissed: [] };
      resetHistory();
      closeRunDrawer();
      hideDraftBar();
      render();
      fitToView();
    });
  }

  /* =========================================================================
     §1.2 - CAMERA CORE. cam = {x:Tx, y:Ty, s:scale}. Single write to
     #wfWorld's transform after every mutation. No scrollLeft/scrollTop
     anywhere (grep-ban, §12).
     ========================================================================= */
  function applyCamera() {
    $world.style.transform = 'translate(' + cam.x + 'px, ' + cam.y + 'px) scale(' + cam.s + ')';
    updateZoomUI();
  }

  function screenToWorld(clientX, clientY) {
    var r = $viewport.getBoundingClientRect();
    var px = clientX - r.left, py = clientY - r.top;
    return { x: (px - cam.x) / cam.s, y: (py - cam.y) / cam.s };
  }

  function contentBBox() {
    if (!state.nodes.length) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(function (n) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 208); maxY = Math.max(maxY, n.y + 66);
    });
    return { x0: minX, y0: minY, x1: maxX, y1: maxY };
  }

  /* Soft post-hoc clamp - never blocks mid-drag, keeps >= EDGE_KEEP px of the
     padded content bbox inside the viewport. If content < viewport, allow
     free centering (min>max case). */
  function clampPan(c) {
    var bbox = contentBBox();
    if (!bbox) return c;
    var bx0 = bbox.x0 - WORLD_PAD, by0 = bbox.y0 - WORLD_PAD, bx1 = bbox.x1 + WORLD_PAD, by1 = bbox.y1 + WORLD_PAD;
    var vw = $viewport.clientWidth, vh = $viewport.clientHeight;
    var minTx = EDGE_KEEP - bx1 * c.s, maxTx = vw - EDGE_KEEP - bx0 * c.s;
    var minTy = EDGE_KEEP - by1 * c.s, maxTy = vh - EDGE_KEEP - by0 * c.s;
    var x = c.x, y = c.y;
    if (minTx <= maxTx) x = Math.min(Math.max(x, minTx), maxTx);
    if (minTy <= maxTy) y = Math.min(Math.max(y, minTy), maxTy);
    return { x: x, y: y, s: c.s };
  }

  function recomputeClamp() {
    cam = clampPan(cam);
    applyCamera();
  }

  function setCam(next, opts) {
    opts = opts || {};
    var floor = opts.minScale || S_MIN;
    next.s = Math.max(floor, Math.min(S_MAX, next.s));
    cam = opts.skipClamp ? next : clampPan(next);
    applyCamera();
    savePref('arkk.workflows.cam', cam);
    /* Bug-fix (diagnosis §3, "no re-fit on resize/collapse"): track whether
       the camera is still exactly where fitToView() last put it. Only that
       state is safe to silently recompute when a panel collapses or the
       window resizes - the moment a person manually pans/zooms/resets we
       must never again yank their view back to a fit, so every other
       setCam() caller (drag pan, wheel zoom, +/- buttons, 100% reset)
       reports isFit:false here (the default) and clears the flag. */
    state.camAutoFit = !!opts.isFit;
  }

  function updateZoomUI() {
    if ($zoomLabel) $zoomLabel.textContent = Math.round(cam.s * 100) + '%';
    if ($zoomOutBtns) $zoomOutBtns.forEach(function (b) { b.disabled = cam.s <= S_MIN; b.setAttribute('aria-disabled', String(cam.s <= S_MIN)); });
    if ($zoomInBtns) $zoomInBtns.forEach(function (b) { b.disabled = cam.s >= S_MAX; b.setAttribute('aria-disabled', String(cam.s >= S_MAX)); });
  }

  /* §1.2 - zoom around a screen point, keeping the world point under it
     stationary while s -> s2. Derived from screenX = worldX*s + Tx. */
  function zoomAround(px, py, sTarget) {
    var s2 = Math.max(S_MIN, Math.min(S_MAX, sTarget));
    var tx2 = px - (px - cam.x) * (s2 / cam.s);
    var ty2 = py - (py - cam.y) * (s2 / cam.s);
    setCam({ x: tx2, y: ty2, s: s2 });
  }

  function zoomAroundViewportCenter(sTarget) {
    var vw = $viewport.clientWidth, vh = $viewport.clientHeight;
    zoomAround(vw / 2, vh / 2, sTarget);
  }

  /* §1.2 - fit-to-view: frame the live node bbox, margin M, never zoom past
     100% on fit. */
  function fitToView() {
    var bbox = contentBBox();
    if (!bbox) return;
    var vw = $viewport.clientWidth, vh = $viewport.clientHeight;
    var M = 60;
    var bboxW = Math.max(1, bbox.x1 - bbox.x0), bboxH = Math.max(1, bbox.y1 - bbox.y0);
    // Frame the whole graph: allow zooming out to FIT_MIN (below the interactive S_MIN)
    // so a wide board in a narrow viewport is never partially clipped. Never past 100%.
    var s = Math.max(FIT_MIN, Math.min(Math.min((vw - 2 * M) / bboxW, (vh - 2 * M) / bboxH), 1));
    var tx = (vw - bboxW * s) / 2 - bbox.x0 * s;
    var ty = (vh - bboxH * s) / 2 - bbox.y0 * s;
    setCam({ x: tx, y: ty, s: s }, { skipClamp: true, minScale: FIT_MIN, isFit: true });
  }

  /* Re-run fitToView after the viewport's own size actually changed (panel
     collapse/expand, drawer open/close, window resize) - but only while the
     camera is still exactly where the last auto-fit left it (§ setCam). A
     manual pan/zoom clears that flag and permanently opts the session out
     until the next explicit Fit click or template load. */
  function refitIfAutoFit() {
    if (state.camAutoFit && state.nodes.length) fitToView();
  }

  function panToNode(nodeId) {
    var node = nodeById(nodeId);
    if (!node) return;
    var vw = $viewport.clientWidth, vh = $viewport.clientHeight;
    var cx = node.x + 104, cy = node.y + 33;
    setCam({ x: vw / 2 - cx * cam.s, y: vh / 2 - cy * cam.s, s: cam.s });
  }

  /* §Q5 - plain wheel = pan (matches Figma/Miro); ⌘/Ctrl+wheel = zoom-at-
     cursor. Only the viewport remaps wheel; drawer/dock/palette keep native
     overflow:auto scroll untouched. */
  function onViewportWheel(e) {
    e.preventDefault();
    var r = $viewport.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey) {
      var sTarget = cam.s * (1 - e.deltaY * 0.0015);
      zoomAround(px, py, sTarget);
    } else {
      setCam({ x: cam.x - e.deltaX, y: cam.y - e.deltaY, s: cam.s });
    }
  }

  /* -----------------------------------------------------------------------
     Runs view (Build|Runs seg - a real link out, never a dead control).
     ----------------------------------------------------------------------- */
  function renderShellView() {
    $viewport.querySelectorAll('.wf-runs-panel').forEach(function (n) { n.remove(); });
    if (state.view === 'runs') {
      var panel = mk('div', 'wf-runs-panel');
      panel.style.cssText = 'position:absolute;inset:0;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:30px;z-index:6;';
      var msg = mk('div', '', { text: 'Runs for this workflow will appear here once it is saved and scheduled.' });
      msg.style.cssText = 'font-size:13px;color:var(--ink-2);max-width:340px;';
      panel.appendChild(msg);
      panel.appendChild(mk('a', 'btn', { href: 'runs.html', text: 'Go to Runs and journals' }));
      $viewport.appendChild(panel);
    }
  }

  /* -----------------------------------------------------------------------
     Teaching layer - first-run dropzone (world child, board content) +
     auto-ticking checklist (viewport overlay, never pans away).
     ----------------------------------------------------------------------- */
  function checkmark() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ico-xs');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M5 12l4 4 10-10');
    svg.appendChild(p);
    return svg;
  }

  function checklistItems() {
    var has = function (t) { return state.nodes.some(function (n) { return n.type === t; }); };
    var outputWired = state.nodes.some(function (n) {
      return n.type === 'export' && incomingEdges(n.id).length > 0;
    });
    return [
      { ttl: 'Add a trigger', done: has('trigger') },
      { ttl: 'Add a source', done: has('source') },
      { ttl: 'Add a check', done: has('check') },
      { ttl: 'Connect to an output', done: outputWired },
      { ttl: 'Dry run', done: !!(state.teaching && state.teaching.dryRan) }
    ];
  }

  function renderTeaching() {
    $world.querySelectorAll('.wf-dropzone').forEach(function (n) { n.remove(); });
    $viewport.querySelectorAll('.wf-checklist-card').forEach(function (n) { n.remove(); });
    if (state.showGallery || state.view === 'runs') return;

    if (isFirstRunOnly()) {
      var dz = mk('div', 'wf-dropzone', { text: 'Drag your first step here, or pick a template below.' });
      dz.style.cssText = 'left:40px;top:150px;width:208px;height:96px;cursor:pointer;';
      dz.addEventListener('click', function () { state.showGallery = true; render(); });
      $world.appendChild(dz);
    }

    var items = checklistItems();
    var complete = items.every(function (i) { return i.done; });
    var dismissed = state.teaching && state.teaching.dismissed && state.teaching.dismissed.indexOf('checklist') !== -1;
    if (!complete && !dismissed) {
      var card = mk('div', 'wf-checklist-card');
      card.style.cssText = 'top:14px;right:14px;width:264px;';
      var head = mk('div', 'wf-cc-head');
      head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
      head.appendChild(mk('span', '', { text: 'Get to a first run' }));
      var hide = mk('button', 'icon-btn', { type: 'button', 'aria-label': 'Dismiss checklist', text: '✕' });
      hide.style.cssText = 'width:18px;height:18px;font-size:11px;';
      hide.addEventListener('click', function () {
        if (!state.teaching.dismissed) state.teaching.dismissed = [];
        state.teaching.dismissed.push('checklist');
        render();
      });
      head.appendChild(hide);
      card.appendChild(head);
      var list = mk('div', 'checklist');
      var firstOpen = true;
      items.forEach(function (it) {
        var row = mk('div', 'checklist-row');
        var markCls = it.done ? 'mark done' : (firstOpen ? 'mark active' : 'mark');
        if (!it.done) firstOpen = false;
        var mark = mk('div', markCls);
        if (it.done) mark.appendChild(checkmark());
        row.appendChild(mark);
        var body = mk('div', 'body');
        body.appendChild(mk('div', 'ttl', { text: it.ttl }));
        row.appendChild(body);
        row.appendChild(mk('div', 'slot-tag' + (it.done ? ' done' : ''), { text: it.done ? 'Done' : 'To do' }));
        list.appendChild(row);
      });
      card.appendChild(list);
      $viewport.appendChild(card);
    }
  }

  /* -----------------------------------------------------------------------
     Master render.
     ----------------------------------------------------------------------- */
  function render() {
    renderNodes();
    renderEdges();
    renderDock();
    renderValidation();
    renderToolbarStatus();
    renderTeaching();
    $gallery.hidden = !state.showGallery;
    scheduleSave();
  }

  /* -----------------------------------------------------------------------
     §1.2/Q5 - drag-to-pan the viewport. Empty-area drag always pans;
     holding Space arms pan-over-anything (incl. over nodes) and suppresses
     node drag. Pan is a pure cam.x/y translate in screen px, independent of
     scale - never native scroll.
     ----------------------------------------------------------------------- */
  function onViewportPointerDown(ev) {
    var isEmptyTarget = ev.target === $viewport || ev.target === $world;
    if (!isEmptyTarget && !state.panArmed) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.preventDefault();
    var startX = ev.clientX, startY = ev.clientY;
    var startCam = { x: cam.x, y: cam.y, s: cam.s };
    var moved = false;
    $world.classList.add('transforming');
    $viewport.classList.add('panning');
    function move(e2) {
      var dx = e2.clientX - startX, dy = e2.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      setCam({ x: startCam.x + dx, y: startCam.y + dy, s: startCam.s });
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      $world.classList.remove('transforming');
      $viewport.classList.remove('panning');
      if (!moved && isEmptyTarget) {
        state.selectedNodeId = null;
        state.selectedEdgeId = null;
        render();
      }
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  /* -----------------------------------------------------------------------
     Guide popover (§2.2) - replaces the removed hero description.
     ----------------------------------------------------------------------- */
  function showGuidePopover(anchorEl) {
    var existing = document.querySelector('.wf-guide-pop');
    if (existing) { existing.remove(); return; }
    var pop = mk('div', 'wf-guide-pop');
    var rect = anchorEl.getBoundingClientRect();
    pop.style.top = (rect.bottom + 8) + 'px';
    pop.style.left = Math.max(8, rect.right - 300) + 'px';
    pop.appendChild(mk('div', 'ttl', { text: 'Workflows' }));
    pop.appendChild(mk('div', 'txt', { text: 'Compose a transfer-pricing routine once, then let it run every close. Start from a template, wire it by hand, or describe it and let the assistant draft it.' }));
    var ol = document.createElement('ol');
    ['Click a step in the left panel to add it, then drag from its dot to connect.', 'Select a step to configure it in the right panel.', 'Run a dry run before you save - nothing posts to the GL.'].forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      ol.appendChild(li);
    });
    pop.appendChild(ol);
    document.body.appendChild(pop);
    function close() { pop.remove(); document.removeEventListener('mousedown', onDoc, true); }
    function onDoc(ev) { if (!pop.contains(ev.target) && ev.target !== anchorEl) close(); }
    setTimeout(function () { document.addEventListener('mousedown', onDoc, true); }, 0);
  }

  /* -----------------------------------------------------------------------
     Boot.
     ----------------------------------------------------------------------- */
  function boot() {
    $body = q('wfBody');
    $viewport = q('wfViewport');
    $world = q('wfWorld');
    $edgesSvg = q('wfEdges');
    $canvasRegion = q('wfCanvasRegion');
    $palette = q('wfPalette');
    $dock = q('wfDock');
    $gallery = q('wfGallery');
    $validateBar = q('wfValidateBar');
    $validateCount = q('wfValidateCount');
    $validateLinks = q('wfValidateLinks');
    $nameInput = q('wfNameInput');
    $statusPill = q('wfStatusPill');
    $draftBar = q('wfDraftBar');
    $runDrawer = q('wfRunDrawer');
    $toast = q('wfToast');
    $zoomLabel = q('wfZoomLabel');
    $zoomOutBtns = [q('wfZoomOut')];
    $zoomInBtns = [q('wfZoomIn')];
    $undoBtn = q('wfUndoBtn');
    $redoBtn = q('wfRedoBtn');

    var loaded = loadState();
    if (loaded) {
      state.meta = loaded.meta || state.meta;
      state.nodes = loaded.nodes || [];
      state.edges = loaded.edges || [];
      state.teaching = loaded.teaching || { dismissed: [] };
      state.showGallery = state.nodes.length <= 1;
    } else {
      seedFirstRun();
    }

    renderPaletteOnce();
    renderGalleryOnce();

    $nameInput.value = state.meta.name;
    $nameInput.addEventListener('input', function () { state.meta.name = $nameInput.value; renderToolbarStatus(); scheduleSave(); });
    $nameInput.addEventListener('blur', function () { render(); });

    q('wfTemplatesBtn').addEventListener('click', function () { state.showGallery = true; render(); });
    q('wfValidateToggleBtn').addEventListener('click', function () {
      var issues = validateGraph();
      render();
      if (!issues.length) showToast('No issues found.');
      else $validateBar.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    });
    q('wfHelpBtn').addEventListener('click', function (ev) { showGuidePopover(ev.currentTarget); });

    // Camera + zoom cluster (§1.2)
    cam = loadPref('arkk.workflows.cam', { x: 80, y: 60, s: 1 });
    q('wfZoomOut').addEventListener('click', function () { zoomAroundViewportCenter(cam.s - 0.1); });
    q('wfZoomIn').addEventListener('click', function () { zoomAroundViewportCenter(cam.s + 0.1); });
    $zoomLabel.addEventListener('click', function () { zoomAroundViewportCenter(1); });
    q('wfZoomFit2').addEventListener('click', function () { fitToView(); });
    applyCamera();

    // History (§6)
    $undoBtn.addEventListener('click', undo);
    $redoBtn.addEventListener('click', redo);
    updateHistoryUI();

    // Collapsible palette / dock (§3), persisted independently of the graph
    state.paletteCollapsed = loadPref('arkk.workflows.paletteCollapsed', false);
    state.dockCollapsed = loadPref('arkk.workflows.dockCollapsed', false);
    $body.classList.toggle('pal-collapsed', state.paletteCollapsed);
    $body.classList.toggle('dock-collapsed', state.dockCollapsed);
    if (state.paletteCollapsed) {
      var paletteToggleBtn = q('wfPaletteToggle');
      if (paletteToggleBtn) {
        paletteToggleBtn.setAttribute('aria-label', 'Expand steps panel');
        paletteToggleBtn.setAttribute('title', 'Expand steps panel');
      }
    }

    // Run simulation
    q('wfSimBtn').addEventListener('click', function (ev) { runSimulation(ev.currentTarget); });

    q('pageResetBtn').addEventListener('click', function (ev) { resetDemo(ev.currentTarget); });
    q('pageDryRunBtn').addEventListener('click', openRunDrawer);
    q('pageSaveBtn').addEventListener('click', function () {
      state.meta.savedAt = Date.now();
      persist();
      render();
      showToast('Saved just now.');
    });

    var viewSeg = q('wfViewSeg');
    viewSeg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        viewSeg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        state.view = b.dataset.view;
        renderShellView();
      });
    });

    $viewport.addEventListener('pointerdown', onViewportPointerDown);
    $viewport.addEventListener('wheel', onViewportWheel, { passive: false });
    /* Bug-fix (diagnosis §3): browser-window resize used to only re-clamp
       pan bounds, never recompute scale - so a wide/short window resize
       left the graph pinned at a stale zoom. Debounced so a drag-resize
       doesn't thrash fitToView on every frame. */
    var resizeRefitTimer = null;
    window.addEventListener('resize', function () {
      recomputeClamp();
      clearTimeout(resizeRefitTimer);
      resizeRefitTimer = setTimeout(refitIfAutoFit, reduce ? 0 : 200);
    });

    document.addEventListener('keydown', function (ev) {
      var active = document.activeElement;
      var inField = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (ev.key === 'Escape') {
        if (state.drawerState !== 'closed') { closeRunDrawer(); return; }
        if (state.showGallery && state.nodes.length > 1) { state.showGallery = false; render(); return; }
        if (state.selectedEdgeId) { state.selectedEdgeId = null; render(); return; }
        if (state.selectedNodeId) { state.selectedNodeId = null; render(); return; }
      }
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && !inField) {
        if (state.selectedEdgeId) { deleteEdge(state.selectedEdgeId); return; }
        if (state.selectedNodeId) { requestDeleteNode(state.selectedNodeId, nodeEls[state.selectedNodeId] || document.body); return; }
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z' && !inField) {
        ev.preventDefault();
        if (ev.shiftKey) redo(); else undo();
      }
      if ((ev.ctrlKey) && ev.key.toLowerCase() === 'y' && !inField) {
        ev.preventDefault();
        redo();
      }
      if (ev.code === 'Space' && !inField && !state.panArmed) {
        ev.preventDefault();
        state.panArmed = true;
        $viewport.style.cursor = 'grab';
      }
    });
    document.addEventListener('keyup', function (ev) {
      if (ev.code === 'Space' && state.panArmed) {
        state.panArmed = false;
        $viewport.style.cursor = '';
      }
    });

    // Deep links: ?template=<id> and ?intent=q4-close
    var params = new URLSearchParams(location.search);
    var tplParam = params.get('template');
    var intentParam = params.get('intent');
    if (tplParam && TEMPLATES.some(function (t) { return t.id === tplParam; })) {
      applyTemplate(tplParam, document.body);
    } else if (intentParam === 'q4-close') {
      state.selectedNodeId = null;
      afterDelay(reduce ? 0 : 400, function () { runAssistant('Automate the Q4 close'); });
    }

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
