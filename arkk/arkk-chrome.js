/*
 * arkk-chrome.js - shared-chrome surfaces, wired once, used identically on
 * all 13 pages + settings.html: command palette, notifications drawer,
 * history drawer, workspace switcher popover, account popover, help
 * overlay. Loaded LAST (after arkk.js/arkk-nav.js). Relies on window.Arkk
 * (utils/overlay/store/toast/activity) and window.ArkkData (seed) already
 * being present - both load earlier via <script defer>, so by the time this
 * file's own DOMContentLoaded handler runs, both are guaranteed ready.
 *
 * Ownership: every element this file wires either (a) currently carries no
 * handler at all (ws-switch, bell, History icon, user-chip, avatar) - safe
 * to attach directly - or (b) currently carries data-quiet="Label" - in
 * which case this file removes that attribute as part of wiring so the
 * generic initQuietNav() fallback in arkk.js never double-handles the
 * click. No markup files are edited; every change happens at wire time.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.Arkk || !window.ArkkData) return; /* never a hard dead end even if load order breaks */
    var Arkk = window.Arkk, D = window.ArkkData;
    var el = Arkk.el, icon = Arkk.icon, clear = Arkk.clear;

    /* -----------------------------------------------------------------
       Small helpers shared by every surface below
       ----------------------------------------------------------------- */
    function relTime(ts) {
      var diff = Math.max(0, Date.now() - ts);
      var m = Math.round(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      var h = Math.round(m / 60);
      if (h < 24) return h + 'h ago';
      var d = Math.round(h / 24);
      return d + 'd ago';
    }

    function row(opts) {
      return el('div', { cls: opts.cls || '', style: opts.style || '' });
    }

    function pill(text, cls) {
      return el('span', { cls: 'status-pill ' + (cls || ''), text: text, style: 'font-size:11px;' });
    }

    /* =====================================================================
       1. Command palette (⌘K)
       ===================================================================== */
    function buildIndex() {
      var items = [];
      D.pages.forEach(function (p) { items.push({ group: 'Pages', label: p.name, meta: 'Page', href: p.href }); });
      D.entities.forEach(function (e) { items.push({ group: 'Entities', label: e.name, meta: 'Entity', href: 'entity?e=' + e.slug }); });
      D.costCentres.forEach(function (c) { items.push({ group: 'Cost centres', label: c.code + ' ' + c.name, meta: 'Cost centre | ' + c.parent, href: 'matrix.html' }); });
      D.runs.forEach(function (r) { items.push({ group: 'Runs', label: r.id, meta: r.status, href: 'run-detail?run=' + encodeURIComponent(r.id) }); });
      D.exceptions.forEach(function (x) { items.push({ group: 'Exceptions', label: x.title, meta: x.code, href: x.href }); });
      D.reports.forEach(function (r) { items.push({ group: 'Reports', label: r.name, meta: r.format, href: 'reports.html#' + r.id }); });
      items.push({ group: 'Actions', label: 'Calculate Q4 2024', meta: 'Action', href: 'index.html' === currentFile() ? null : './', action: 'calc' });
      items.push({ group: 'Actions', label: 'Export overview (CSV)', meta: 'Action', action: 'export-overview' });
      items.push({ group: 'Actions', label: 'Open settings', meta: 'Action', href: 'settings.html' });
      items.push({ group: 'Actions', label: 'Open help', meta: 'Action', action: 'help' });
      items.push({ group: 'Actions', label: 'Reset demo', meta: 'Action', action: 'reset' });
      return items;
    }

    function currentFile() {
      var p = location.pathname.split('/');
      var last = p[p.length - 1];
      return last === '' ? 'index.html' : last;
    }

    function suggestedItems(index) {
      var pages = index.filter(function (i) { return i.group === 'Pages'; }).slice(0, 3);
      var recent = Arkk.activity.all().filter(function (a) { return a.kind === 'nav' && a.href; }).slice(0, 2).map(function (a) {
        return { group: 'Recent', label: a.title, meta: relTime(a.ts), href: a.href };
      });
      var actions = index.filter(function (i) { return i.group === 'Actions'; });
      return pages.concat(recent, actions);
    }

    function filterItems(index, q) {
      if (!q) return suggestedItems(index);
      var needle = q.toLowerCase();
      return index.filter(function (i) {
        return i.label.toLowerCase().indexOf(needle) !== -1 || (i.meta || '').toLowerCase().indexOf(needle) !== -1;
      });
    }

    function runPaletteAction(item, close) {
      if (item.action === 'help') { close(); openHelp(); return; }
      if (item.action === 'reset') { close(); Arkk.resetAll(); location.reload(); return; }
      if (item.action === 'export-overview') {
        close();
        Arkk.exportCSV('northgate-q4-2024-overview.csv', ['Metric', 'Value'], [
          ['Readiness', D.quarter.score], ['Entities', D.quarter.entities], ['Cost centres', D.quarter.ccs], ['Uplift', D.quarter.uplift]
        ]);
        return;
      }
      if (item.action === 'calc') { close(); window.location.href = './'; return; }
      Arkk.activity.log({ kind: 'nav', title: item.label, meta: item.meta, href: item.href });
      close();
      window.location.href = item.href;
    }

    function openPalette() {
      var index = buildIndex();
      var overlay = Arkk.overlay({ mode: 'palette', label: 'Command palette' });
      var wrap = overlay.body;
      wrap.style.padding = '0';

      var head = el('div', { style: 'display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--line-2);' });
      head.appendChild(icon('M21 21l-4.3-4.3', { cls: 'ico-sm' }));
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Jump to a page, entity, run, exception or report';
      input.setAttribute('data-autofocus', '');
      input.style.cssText = 'flex:1; border:0; outline:0; background:transparent; font-size:14px; color:var(--ink); font-family:inherit;';
      head.appendChild(input);
      var kbd = el('span', { cls: 'kbd', text: 'Esc' });
      head.appendChild(kbd);
      wrap.appendChild(head);

      var listWrap = el('div', { style: 'max-height:56vh; overflow-y:auto; padding:8px;' });
      wrap.appendChild(listWrap);

      var flat = [];
      var highlight = 0;

      function render(q) {
        clear(listWrap);
        var items = filterItems(index, q);
        flat = items;
        highlight = 0;
        if (!items.length) {
          var empty = el('div', { style: 'padding:26px 14px; text-align:center; color:var(--ink-3); font-size:13px;' });
          empty.appendChild(document.createTextNode('No matches for ‘' + q + '’. Try a page name, entity or run id.'));
          listWrap.appendChild(empty);
          return;
        }
        var lastGroup = null;
        items.forEach(function (item, i) {
          if (item.group !== lastGroup) {
            lastGroup = item.group;
            listWrap.appendChild(el('div', { text: item.group, style: 'font-size:10.5px; letter-spacing:0.08em; text-transform:uppercase; color:var(--ink-4); padding:8px 10px 4px;' }));
          }
          var r = el('div', {
            cls: 'arkk-palette-row', style: 'display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:9px; cursor:pointer;' + (i === highlight ? ' background:var(--bg-2);' : '')
          });
          r.dataset.idx = String(i);
          r.appendChild(el('span', { text: item.label, style: 'flex:1; font-size:13.5px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;' }));
          r.appendChild(el('span', { text: item.meta || '', style: 'font-size:11.5px; color:var(--ink-3); flex:0 0 auto;' }));
          r.addEventListener('mouseenter', function () { setHighlight(i); });
          r.addEventListener('click', function () { runPaletteAction(item, overlay.close); });
          listWrap.appendChild(r);
        });
      }

      function setHighlight(i) {
        highlight = i;
        Array.prototype.forEach.call(listWrap.querySelectorAll('.arkk-palette-row'), function (r) {
          r.style.background = (parseInt(r.dataset.idx, 10) === highlight) ? 'var(--bg-2)' : 'transparent';
        });
        var el2 = listWrap.querySelector('.arkk-palette-row[data-idx="' + highlight + '"]');
        if (el2) el2.scrollIntoView({ block: 'nearest' });
      }

      input.addEventListener('input', function () { render(input.value.trim()); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (flat.length) setHighlight((highlight + 1) % flat.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (flat.length) setHighlight((highlight - 1 + flat.length) % flat.length); }
        else if (e.key === 'Enter') { e.preventDefault(); if (flat[highlight]) runPaletteAction(flat[highlight], overlay.close); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          if (!flat.length) return;
          var curGroup = flat[highlight] ? flat[highlight].group : null;
          var next = highlight;
          for (var n = 0; n < flat.length; n++) { next = (next + 1) % flat.length; if (flat[next].group !== curGroup) break; }
          setHighlight(next);
        }
      });

      render('');
    }

    /* =====================================================================
       2. Notifications drawer
       ===================================================================== */
    var notifStore = Arkk.store('arkk.notif.v1', function () { return { read: [], snoozed: {} }; });

    function unreadCount() {
      var state = notifStore.get();
      var now = Date.now();
      return D.notifications.filter(function (n) {
        var snoozedUntil = state.snoozed[n.id];
        var isSnoozed = snoozedUntil && snoozedUntil > now;
        return state.read.indexOf(n.id) === -1 && !isSnoozed;
      }).length;
    }

    function updateNotifBadges() {
      var count = unreadCount();
      document.querySelectorAll('.icon-btn[title="Notifications"]').forEach(function (btn) {
        var badge = btn.querySelector('.arkk-notif-badge');
        if (!badge) {
          badge = el('span', { cls: 'arkk-notif-badge', style: 'position:absolute; top:-4px; right:-4px; min-width:16px; height:16px; padding:0 4px; border-radius:8px; background:var(--brand); color:#fff; font-size:10px; font-weight:600; line-height:16px; text-align:center; font-family:inherit;' });
          btn.style.position = 'relative';
          btn.appendChild(badge);
        }
        badge.textContent = String(count);
        badge.style.display = count > 0 ? '' : 'none';
      });
      document.querySelectorAll('a[data-quiet="Inbox"] .count, .nav-item .count').forEach(function (c) {
        var item = c.closest('.nav-item');
        if (item && /Inbox/.test(item.textContent)) c.textContent = String(count);
      });
    }

    function openNotifications() {
      var state = notifStore.get();
      var overlay = Arkk.overlay({ mode: 'drawer', label: 'Notifications' });
      var wrap = overlay.body;
      wrap.style.padding = '0';

      var head = el('div', { style: 'display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--line-2);' });
      head.appendChild(el('div', { text: 'Notifications', style: 'font-size:15px; font-weight:600; color:var(--ink);' }));
      var markAll = el('button', { cls: 'btn ghost', text: 'Mark all read', type: 'button', style: 'padding:5px 10px; font-size:12px;' });
      head.appendChild(markAll);
      wrap.appendChild(head);

      var listWrap = el('div', { style: 'flex:1; overflow-y:auto; padding:12px 14px;' });
      wrap.appendChild(listWrap);

      function render() {
        state = notifStore.get();
        clear(listWrap);
        var now = Date.now();
        var unread = unreadCount();
        if (unread === 0) {
          var caughtUp = el('div', { style: 'display:flex; align-items:center; gap:10px; padding:12px 12px; margin-bottom:10px; background:var(--mint-soft); border-radius:10px; font-size:12.5px; color:var(--mint-ink);' });
          caughtUp.appendChild(icon('M5 12l4 4 10-10', { strokeWidth: '2.4' }));
          caughtUp.appendChild(document.createTextNode('You are all caught up for ' + D.quarter.label + '.'));
          listWrap.appendChild(caughtUp);
        }
        D.notifications.forEach(function (n) {
          var isRead = state.read.indexOf(n.id) !== -1;
          var snoozedUntil = state.snoozed[n.id];
          var isSnoozed = snoozedUntil && snoozedUntil > now;
          var card = el('div', { style: 'padding:12px 12px; border-radius:10px; margin-bottom:6px; background:' + (isSnoozed ? 'var(--bg-2)' : 'var(--surface)') + '; border:1px solid var(--line-2); opacity:' + (isSnoozed ? '0.6' : '1') + ';' });
          var top = el('div', { style: 'display:flex; align-items:flex-start; gap:8px;' });
          var titleWrap = el('div', { style: 'flex:1;' });
          titleWrap.appendChild(el('div', { text: n.title, style: 'font-size:13px; font-weight:500; color:var(--ink);' }));
          titleWrap.appendChild(el('div', { text: isSnoozed ? 'Snoozed until ' + new Date(snoozedUntil).toLocaleDateString() : n.meta, style: 'font-size:12px; color:var(--ink-3); margin-top:2px;' }));
          top.appendChild(titleWrap);
          if (!isRead && !isSnoozed) top.appendChild(pill('New', 'in-progress'));
          card.appendChild(top);

          var actions = el('div', { style: 'display:flex; gap:8px; margin-top:8px;' });
          if (isSnoozed) {
            var unsnooze = el('button', { cls: 'btn ghost', text: 'Unsnooze', type: 'button', style: 'padding:4px 8px; font-size:11.5px;' });
            unsnooze.addEventListener('click', function () {
              var s = notifStore.get(); delete s.snoozed[n.id]; notifStore.set(s, true); render(); updateNotifBadges();
            });
            actions.appendChild(unsnooze);
          } else {
            var openBtn = el('a', { cls: 'btn ghost', text: 'Open', style: 'padding:4px 8px; font-size:11.5px;' });
            openBtn.href = n.href;
            openBtn.addEventListener('click', function () {
              var s = notifStore.get(); if (s.read.indexOf(n.id) === -1) s.read.push(n.id); notifStore.set(s, true);
              Arkk.activity.log({ kind: 'nav', title: n.title, href: n.href });
            });
            actions.appendChild(openBtn);
            var snoozeBtn = el('button', { cls: 'btn ghost', text: 'Snooze', type: 'button', style: 'padding:4px 8px; font-size:11.5px;' });
            snoozeBtn.addEventListener('click', function () {
              var s = notifStore.get(); s.snoozed[n.id] = Date.now() + 24 * 60 * 60 * 1000; notifStore.set(s, true); render(); updateNotifBadges();
            });
            actions.appendChild(snoozeBtn);
            if (!isRead) {
              var markOne = el('button', { cls: 'btn ghost', text: 'Mark read', type: 'button', style: 'padding:4px 8px; font-size:11.5px; margin-left:auto;' });
              markOne.addEventListener('click', function () {
                var s = notifStore.get(); if (s.read.indexOf(n.id) === -1) s.read.push(n.id); notifStore.set(s, true); render(); updateNotifBadges();
              });
              actions.appendChild(markOne);
            } else {
              var markUnread = el('button', { cls: 'btn ghost', text: 'Mark unread', type: 'button', style: 'padding:4px 8px; font-size:11.5px; margin-left:auto;' });
              markUnread.addEventListener('click', function () {
                var s = notifStore.get(); s.read = s.read.filter(function (id) { return id !== n.id; }); notifStore.set(s, true); render(); updateNotifBadges();
              });
              actions.appendChild(markUnread);
            }
          }
          card.appendChild(actions);
          listWrap.appendChild(card);
        });
      }

      markAll.addEventListener('click', function () {
        var s = notifStore.get();
        D.notifications.forEach(function (n) { if (s.read.indexOf(n.id) === -1) s.read.push(n.id); });
        notifStore.set(s, true);
        render();
        updateNotifBadges();
      });

      render();
    }

    function snoozeAllNotifications() {
      var s = notifStore.get();
      var until = Date.now() + 24 * 60 * 60 * 1000;
      D.notifications.forEach(function (n) { s.snoozed[n.id] = until; });
      notifStore.set(s, true);
      updateNotifBadges();
      return D.notifications.length;
    }

    /* =====================================================================
       3. History drawer
       ===================================================================== */
    var SEED_HISTORY = [
      { ts: Date.now() - 26 * 60 * 60 * 1000, kind: 'run', title: 'TP-Q3-2024 posted to GL', meta: '186 journals | Maria R.', href: 'run-detail?run=TP-Q3-2024' },
      { ts: Date.now() - 30 * 60 * 60 * 1000, kind: 'run', title: 'Dry run TP-Q3-2024-DRY-6 complete', meta: '2m 22s', href: 'run-detail?run=TP-Q3-2024-DRY-6' },
      { ts: Date.now() - 5 * 60 * 60 * 1000, kind: 'exception', title: '4 exceptions resolved today', meta: 'auto + manual', href: 'exceptions.html' },
      { ts: Date.now() - 40 * 60 * 60 * 1000, kind: 'data', title: 'Hierarchy v4.2 approved', meta: 'by Maria R.', href: 'hierarchy.html' }
    ];

    function bucketOf(kind) {
      if (kind === 'run' || kind === 'post') return 'runs';
      if (kind === 'exception') return 'exceptions';
      if (kind === 'data' || kind === 'export' || kind === 'sync' || kind === 'report') return 'data';
      return 'other';
    }

    function openHistory(filterHint) {
      var overlay = Arkk.overlay({ mode: 'drawer', label: 'History' });
      var wrap = overlay.body;
      wrap.style.padding = '0';

      var head = el('div', { style: 'padding:16px 18px 10px; border-bottom:1px solid var(--line-2);' });
      head.appendChild(el('div', { text: 'History', style: 'font-size:15px; font-weight:600; color:var(--ink); margin-bottom:10px;' }));
      var seg = el('div', { cls: 'seg' });
      var tabs = [['all', 'All'], ['runs', 'Runs'], ['exceptions', 'Exceptions'], ['data', 'Data']];
      var active = filterHint || 'all';
      var btns = {};
      tabs.forEach(function (t) {
        var b = el('button', { text: t[1], type: 'button' });
        if (t[0] === active) b.classList.add('on');
        b.addEventListener('click', function () {
          active = t[0];
          Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('on', k === active); });
          render();
        });
        btns[t[0]] = b;
        seg.appendChild(b);
      });
      head.appendChild(seg);
      wrap.appendChild(head);

      var listWrap = el('div', { style: 'flex:1; overflow-y:auto; padding:10px 14px;' });
      wrap.appendChild(listWrap);

      function render() {
        clear(listWrap);
        var merged = SEED_HISTORY.concat(Arkk.activity.all().filter(function (a) { return a.title; }));
        merged.sort(function (a, b) { return b.ts - a.ts; });
        var filtered = active === 'all' ? merged : merged.filter(function (m) { return bucketOf(m.kind) === active; });
        if (!filtered.length) {
          listWrap.appendChild(el('div', { text: 'Nothing here yet.', style: 'padding:20px 8px; color:var(--ink-3); font-size:13px;' }));
          return;
        }
        filtered.slice(0, 40).forEach(function (item) {
          var r = el('div', { style: 'display:flex; align-items:flex-start; gap:10px; padding:10px 6px; border-bottom:1px solid var(--line-2);' });
          var body = el('div', { style: 'flex:1; min-width:0;' });
          body.appendChild(el('div', { text: item.title, style: 'font-size:13px; color:var(--ink);' }));
          var metaLine = el('div', { style: 'font-size:11.5px; color:var(--ink-3); margin-top:2px;' });
          metaLine.textContent = relTime(item.ts) + (item.meta ? ' | ' + item.meta : '');
          body.appendChild(metaLine);
          r.appendChild(body);
          r.appendChild(pill(bucketOf(item.kind) === 'other' ? (item.kind || 'nav') : bucketOf(item.kind), ''));
          if (item.href) {
            var open = el('a', { text: 'Open', style: 'color:var(--brand); font-size:12px; flex:0 0 auto; margin-left:4px;' });
            open.href = item.href;
            r.appendChild(open);
          }
          listWrap.appendChild(r);
        });
      }

      render();
    }

    /* =====================================================================
       4. Workspace switcher popover
       ===================================================================== */
    var wsStore = Arkk.store('arkk.ws.v1', function () { return { selected: 'northgate' }; });

    function currentWorkspace() {
      var id = wsStore.get().selected || 'northgate';
      var found = D.workspaces.filter(function (w) { return w.id === id; })[0];
      return found || D.workspaces[0];
    }

    function refreshWsSwitches() {
      var ws = currentWorkspace();
      document.querySelectorAll('.ws-switch').forEach(function (btn) {
        if (btn.firstChild && btn.firstChild.nodeType === 3) btn.firstChild.nodeValue = ws.name + ' ';
      });
    }

    function showWorkspaceBanner(ws) {
      var crumbs = document.querySelector('.crumbs');
      if (!crumbs) return;
      var existing = document.querySelector('.arkk-ws-banner');
      if (existing) existing.remove();
      if (ws.id === 'northgate') return;
      var banner = el('div', {
        cls: 'arkk-ws-banner',
        style: 'display:flex; align-items:center; gap:12px; background: linear-gradient(180deg, var(--peach-soft), var(--surface)); border-radius: var(--r-md); padding: 12px 16px; margin: 14px 0 20px;'
      });
      var body = el('div', { style: 'flex:1; font-size:13px; color:var(--ink-2);' });
      body.appendChild(el('b', { text: 'Viewing ' + ws.name + '.', style: 'color:var(--ink);' }));
      body.appendChild(document.createTextNode(' This workspace has no calculated periods yet.'));
      banner.appendChild(body);
      var back = el('button', { cls: 'btn ghost', text: 'Switch back to Northgate', type: 'button' });
      back.addEventListener('click', function () { selectWorkspace('northgate'); });
      banner.appendChild(back);
      crumbs.insertAdjacentElement('afterend', banner);
    }

    function selectWorkspace(id) {
      wsStore.set({ selected: id }, false);
      refreshWsSwitches();
      showWorkspaceBanner(currentWorkspace());
    }

    function openWorkspacePopover(anchor) {
      var content = el('div', { style: 'padding:10px;' });
      content.appendChild(el('div', { text: 'Switch workspace', style: 'font-size:11.5px; letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-4); padding:6px 8px;' }));
      var current = currentWorkspace();
      D.workspaces.forEach(function (w) {
        var r = el('button', { type: 'button', style: 'display:flex; align-items:center; justify-content:space-between; width:100%; text-align:left; gap:10px; padding:9px 10px; border-radius:9px; border:0; background:transparent; cursor:pointer; font-family:inherit;' });
        var left = el('div');
        left.appendChild(el('div', { text: w.name, style: 'font-size:13.5px; color:var(--ink); font-weight:500;' }));
        left.appendChild(el('div', { text: w.periods ? w.periods + ' periods' : 'No calculated periods', style: 'font-size:11.5px; color:var(--ink-3);' }));
        r.appendChild(left);
        if (w.id === current.id) r.appendChild(icon('M5 12l4 4 10-10', { cls: 'ico-xs', strokeWidth: '2.4' }));
        r.addEventListener('mouseenter', function () { r.style.background = 'var(--bg-2)'; });
        r.addEventListener('mouseleave', function () { r.style.background = 'transparent'; });
        r.addEventListener('click', function () { selectWorkspace(w.id); closePopover(); });
        content.appendChild(r);
      });
      var footer = el('div', { style: 'border-top:1px solid var(--line-2); margin-top:6px; padding-top:6px;' });
      var manage = el('a', { text: 'Manage workspaces', style: 'display:block; padding:8px 10px; font-size:12.5px; color:var(--brand);' });
      manage.href = 'settings.html#workspaces';
      footer.appendChild(manage);
      content.appendChild(footer);
      openAnchoredPopover(anchor, content, 260);
    }

    /* =====================================================================
       5. Account popover
       ===================================================================== */
    function openAccountPopover(anchor) {
      var content = el('div', { style: 'padding:12px;' });
      var head = el('div', { style: 'display:flex; align-items:center; gap:10px; padding:2px 6px 10px; border-bottom:1px solid var(--line-2); margin-bottom:6px;' });
      var av = el('span', { cls: 'user-chip', text: D.user.initials, style: 'width:32px; height:32px;' });
      head.appendChild(av);
      var idBlock = el('div');
      idBlock.appendChild(el('div', { text: D.user.name, style: 'font-size:13.5px; font-weight:600; color:var(--ink);' }));
      idBlock.appendChild(el('div', { text: D.user.role + ' | ' + D.user.org, style: 'font-size:11.5px; color:var(--ink-3);' }));
      head.appendChild(idBlock);
      content.appendChild(head);

      function menuRow(label, handler) {
        var r = el('button', { type: 'button', text: label, style: 'display:block; width:100%; text-align:left; padding:8px 8px; border-radius:8px; border:0; background:transparent; cursor:pointer; font-size:13px; color:var(--ink); font-family:inherit;' });
        r.addEventListener('mouseenter', function () { r.style.background = 'var(--bg-2)'; });
        r.addEventListener('mouseleave', function () { r.style.background = 'transparent'; });
        r.addEventListener('click', handler);
        content.appendChild(r);
        return r;
      }

      menuRow('Settings', function () { closePopover(); window.location.href = 'settings.html'; });
      menuRow('Help', function () { closePopover(); openHelp(); });
      menuRow('Reset demo', function () { closePopover(); Arkk.resetAll(); location.reload(); });

      var note = el('div', { style: 'margin-top:6px; padding:8px; border-radius:8px; background:var(--bg-2); font-size:11.5px; color:var(--ink-3);' });
      note.appendChild(el('b', { text: 'Demo session', style: 'color:var(--ink-2);' }));
      note.appendChild(document.createTextNode(' | sign-out is disabled in this preview.'));
      content.appendChild(note);

      openAnchoredPopover(anchor, content, 260);
    }

    /* -----------------------------------------------------------------
       Lightweight anchored popover (workspace / account) - same glass
       surface as Arkk.overlay, positioned near its trigger instead of
       centered/drawer. Own small implementation so Arkk.overlay's two
       modes stay simple; dismiss on backdrop click / Esc, matches the
       house motion spec (fade + 6px translate, <=220ms, reduced-motion
       final state).
       ----------------------------------------------------------------- */
    var popoverState = { node: null, anchor: null, onKey: null, onClick: null };
    function closePopover() {
      if (!popoverState.node) return;
      var node = popoverState.node;
      var anchor = popoverState.anchor;
      popoverState.node = null;
      popoverState.anchor = null;
      document.removeEventListener('keydown', popoverState.onKey, true);
      document.removeEventListener('mousedown', popoverState.onClick, true);
      /* Keyboard flows: if focus is inside the closing panel (Esc while on a
         menu row), hand it back to the trigger instead of dropping to body. */
      if (anchor && node.contains(document.activeElement)) {
        try { anchor.focus(); } catch (e) { /* anchor gone - nothing to restore */ }
      }
      function remove() { if (node.parentNode) node.parentNode.removeChild(node); }
      if (Arkk.reduce) { remove(); }
      else {
        node.style.opacity = '0'; node.style.transform = 'translateY(4px)';
        setTimeout(remove, 180);
      }
    }
    function openAnchoredPopover(anchor, content, width) {
      closePopover();
      var rect = anchor.getBoundingClientRect();
      var w = width || 240;
      var panel = el('div', {
        style: 'position:fixed; z-index:560; width:' + w + 'px; max-width:92vw;' +
               'background: oklch(100% 0 0 / 0.94); backdrop-filter:saturate(140%) blur(16px); -webkit-backdrop-filter:saturate(140%) blur(16px);' +
               'border:1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); overflow:hidden;' +
               'opacity:0; transform:translateY(4px); transition:opacity var(--dur-ui) var(--ease-house), transform var(--dur-ui) var(--ease-house);'
      });
      panel.appendChild(content);
      document.body.appendChild(panel);
      /* Anchored placement with vertical flip (DEFECT FIX: the account
         popover from the sidebar footer used to open BELOW its trigger and
         got pushed off the bottom of the viewport - only its top sliver was
         visible). Measure the real panel first (it is in the DOM, opacity 0),
         prefer below, flip fully above the trigger when below does not fit,
         and clamp inside the viewport as a last resort. position:fixed on
         <body> also means no overflow-hidden ancestor can ever clip it. */
      var margin = 8;
      var h = panel.offsetHeight;
      var top;
      if (rect.bottom + margin + h <= window.innerHeight - margin) top = rect.bottom + margin;
      else if (rect.top - margin - h >= margin) top = rect.top - margin - h;
      else top = Math.max(margin, Math.min(rect.top, window.innerHeight - h - margin));
      var left = Math.min(Math.max(margin, rect.left), window.innerWidth - w - margin);
      panel.style.top = top + 'px';
      panel.style.left = left + 'px';
      popoverState.node = panel;
      popoverState.anchor = anchor;

      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); closePopover(); } }
      function onClick(e) { if (!panel.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closePopover(); }
      popoverState.onKey = onKey; popoverState.onClick = onClick;
      document.addEventListener('keydown', onKey, true);
      setTimeout(function () { document.addEventListener('mousedown', onClick, true); }, 0);

      if (Arkk.reduce) { panel.style.transition = 'none'; panel.style.opacity = '1'; panel.style.transform = 'translateY(0)'; }
      else requestAnimationFrame(function () { panel.style.opacity = '1'; panel.style.transform = 'translateY(0)'; });
    }

    /* =====================================================================
       6. Help overlay
       ===================================================================== */
    function openHelp(preselectId) {
      var overlay = Arkk.overlay({ mode: 'palette', label: 'Help' });
      var wrap = overlay.body;
      wrap.style.padding = '0';

      var head = el('div', { style: 'padding:16px 18px 12px; border-bottom:1px solid var(--line-2);' });
      head.appendChild(el('div', { text: 'Help', style: 'font-size:16px; font-weight:600; color:var(--ink); margin-bottom:10px;' }));
      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search shortcuts and guides';
      searchInput.setAttribute('data-autofocus', '');
      searchInput.style.cssText = 'width:100%; box-sizing:border-box; border:1px solid var(--line); border-radius:9px; padding:8px 10px; font-size:13px; font-family:inherit; background:var(--bg-3); color:var(--ink);';
      head.appendChild(searchInput);
      wrap.appendChild(head);

      var body = el('div', { style: 'flex:1; overflow-y:auto; padding:14px 18px;' });
      wrap.appendChild(body);

      function render(q) {
        clear(body);
        var needle = (q || '').toLowerCase();

        var shortcuts = D.shortcuts.filter(function (s) { return !needle || s.desc.toLowerCase().indexOf(needle) !== -1 || s.keys.toLowerCase().indexOf(needle) !== -1; });
        if (shortcuts.length) {
          body.appendChild(el('div', { text: 'Shortcuts', style: 'font-size:11.5px; letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-4); margin-bottom:8px;' }));
          shortcuts.forEach(function (s) {
            var r = el('div', { style: 'display:flex; align-items:center; justify-content:space-between; padding:6px 0;' });
            r.appendChild(el('span', { cls: 'kbd', text: s.keys }));
            r.appendChild(el('span', { text: s.desc, style: 'font-size:12.5px; color:var(--ink-2); text-align:right;' }));
            body.appendChild(r);
          });
        }

        var guides = D.guides.filter(function (g) { return !needle || g.title.toLowerCase().indexOf(needle) !== -1 || g.steps.join(' ').toLowerCase().indexOf(needle) !== -1; });
        if (guides.length) {
          body.appendChild(el('div', { text: 'Guides', style: 'font-size:11.5px; letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-4); margin:16px 0 8px;' }));
          guides.forEach(function (g) {
            var card = el('div', { style: 'border:1px solid var(--line-2); border-radius:10px; padding:10px 12px; margin-bottom:8px;' });
            var gHead = el('div', { style: 'display:flex; align-items:center; justify-content:space-between; cursor:pointer;' });
            gHead.appendChild(el('b', { text: g.title, style: 'font-size:13px; color:var(--ink);' }));
            var chev = icon('M7 10l5 5 5-5', { cls: 'ico-xs' });
            gHead.appendChild(chev);
            card.appendChild(gHead);
            var stepsWrap = el('ol', { style: 'margin:10px 0 8px; padding-left:18px; font-size:12.5px; color:var(--ink-2); display:' + (g.id === preselectId ? 'block' : 'none') + ';' });
            g.steps.forEach(function (s) { stepsWrap.appendChild(el('li', { text: s, style: 'margin-bottom:4px;' })); });
            card.appendChild(stepsWrap);
            var start = el('a', { cls: 'btn ghost', text: 'Start', style: 'padding:4px 10px; font-size:11.5px; display:' + (g.id === preselectId ? 'inline-flex' : 'none') + ';' });
            start.href = g.href;
            card.appendChild(start);
            gHead.addEventListener('click', function () {
              var open = stepsWrap.style.display !== 'none';
              stepsWrap.style.display = open ? 'none' : 'block';
              start.style.display = open ? 'none' : 'inline-flex';
            });
            body.appendChild(card);
          });
        }

        if (!shortcuts.length && !guides.length) {
          body.appendChild(el('div', { text: 'No matches. Try “palette”, “exception”, or “workflow”.', style: 'padding:20px 4px; color:var(--ink-3); font-size:13px;' }));
        }
      }

      searchInput.addEventListener('input', function () { render(searchInput.value.trim()); });
      render('');
      if (preselectId) {
        setTimeout(function () {
          var target = Array.prototype.filter.call(body.querySelectorAll('b'), function (b) { return D.guides.some(function (g) { return g.id === preselectId && g.title === b.textContent; }); })[0];
          if (target) target.closest('div').scrollIntoView({ block: 'center' });
        }, 80);
      }
    }

    /* =====================================================================
       Wiring
       ===================================================================== */
    document.querySelectorAll('.topbar .search').forEach(function (box) {
      box.style.cursor = 'pointer';
      box.addEventListener('mousedown', function (e) { e.preventDefault(); openPalette(); });
      var input = box.querySelector('input');
      if (input) {
        /* Keyboard-focus path (Tab), not just the mousedown-preventDefault
           path above: hand off to the real palette instead of leaving a
           focused-but-inert input. */
        input.addEventListener('focus', function () { input.blur(); openPalette(); });
      }
    });

    document.querySelectorAll('[data-focus-search]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); openPalette(); });
    });

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); }
    });

    document.querySelectorAll('.icon-btn[title="History"]').forEach(function (btn) {
      btn.addEventListener('click', function () { openHistory(); });
    });

    document.querySelectorAll('.icon-btn[title="Notifications"]').forEach(function (btn) {
      btn.addEventListener('click', function () { openNotifications(); });
    });

    document.querySelectorAll('a[data-quiet="Inbox"]').forEach(function (a) {
      a.removeAttribute('data-quiet');
      a.addEventListener('click', function (e) { e.preventDefault(); openNotifications(); });
    });

    document.querySelectorAll('.ws-switch').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.preventDefault(); openWorkspacePopover(btn); });
    });

    document.querySelectorAll('.top-actions .user-chip, .sidebar-foot .user-chip, .rail .me').forEach(function (chip) {
      chip.style.cursor = 'pointer';
      /* The chips are plain divs; in the collapsed rail the avatar is the
         ONLY remaining account trigger, so it must be keyboard-operable. */
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('role', 'button');
      chip.setAttribute('aria-haspopup', 'menu');
      if (!chip.title) chip.title = D.user.name + ' | Account';
      chip.setAttribute('aria-label', chip.title);
      chip.addEventListener('click', function () { openAccountPopover(chip); });
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAccountPopover(chip); }
      });
    });
    document.querySelectorAll('.sidebar-foot .more[data-quiet="Account menu"]').forEach(function (a) {
      a.removeAttribute('data-quiet');
      a.addEventListener('click', function (e) { e.preventDefault(); openAccountPopover(a); });
    });

    document.querySelectorAll('[data-quiet="Settings"]').forEach(function (a) {
      a.removeAttribute('data-quiet');
      a.addEventListener('click', function (e) { e.preventDefault(); window.location.href = 'settings.html'; });
    });

    document.querySelectorAll('[data-quiet="Help"]').forEach(function (a) {
      a.removeAttribute('data-quiet');
      a.addEventListener('click', function (e) { e.preventDefault(); openHelp(); });
    });

    refreshWsSwitches();
    showWorkspaceBanner(currentWorkspace());
    updateNotifBadges();

    window.Arkk.chrome = {
      openPalette: openPalette,
      openNotifications: openNotifications,
      openHistory: openHistory,
      openWorkspace: openWorkspacePopover,
      openAccount: openAccountPopover,
      help: openHelp,
      snoozeAllNotifications: snoozeAllNotifications,
      unreadNotifCount: unreadCount
    };
  });
})();
