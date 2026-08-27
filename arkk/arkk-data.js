/*
 * arkk-data.js - canonical Northgate data spine for the Arkk demo.
 * Loaded FIRST (before arkk.js) on every page. Exposes window.ArkkData
 * (frozen, read-only). One shared seed source: if a page needs a datum not
 * yet here, ADD it to this file - never hardcode a second copy of a fact
 * that already lives here.
 */
(function () {
  'use strict';

  function freeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.keys(o).forEach(function (k) { freeze(o[k]); });
      Object.freeze(o);
    }
    return o;
  }

  var user = { name: 'Tom Heffes', role: 'Tax Lead', org: 'Northgate', initials: 'TH', email: 't.heffes@northgate.example' };

  var workspaces = [
    { id: 'northgate', name: 'Northgate', periods: 2 },
    { id: 'halden-group', name: 'Halden Group', periods: 0 },
    { id: 'northgate-dooel', name: 'Northgate DOOEL', periods: 0 }
  ];

  var quarter = { id: 'Q4 2024', label: 'Q4 2024', status: 'in-progress', closeTarget: '2024-11-15', score: 62, entities: 186, ccs: 1284, uplift: '£ 28.9m', journals: 186 };

  var entities = [
    { slug: 'connect-finco', name: 'Connect Finco', uplift: '£ 12.4m', share: '43%' },
    { slug: 'northgate-solutions', name: 'Northgate Solutions', uplift: '£ 7.8m', share: '27%' },
    { slug: 'connect-bidco', name: 'Connect Bidco', uplift: '£ 4.0m', share: '14%' },
    { slug: 'northgate-dooel', name: 'Northgate DOOEL', uplift: '£ 1.6m', share: '6%' },
    { slug: 'new-wave', name: 'New Wave Broadband', uplift: '£ 1.99m', share: '7%' }
  ];

  var rollups = ['New operations', 'Group treasury', 'Finance & IT services', 'Sales & Marketing', 'Central services'];

  var costCentres = [
    { code: '5170', name: 'New cost centre', parent: 'New operations rollup', gross: '£ 0' },
    { code: '5177', name: 'Renamed cost centre', parent: 'Finance & IT services', gross: '£ 2.1m' },
    { code: '5183', name: 'Unrecognised transaction code', parent: 'Sales & Marketing', gross: '£ 1.2m' },
    { code: '5188', name: 'New cost centre', parent: 'Central services', gross: '£ 0.4m' },
    { code: '5190', name: 'Sales & Marketing rollup', parent: 'Sales & Marketing', gross: '£ 1.1m' },
    { code: '5191', name: 'New cost centre', parent: 'Sales & Marketing', gross: '£ 0' }
  ];

  var runs = [
    { id: 'TP-Q4-2024-13', kind: 'flow', status: 'In progress', when: 'now', value: '£ 28.9m', extra: 'Close the quarter' },
    { id: 'TP-Q4-2024-12', kind: 'live', status: 'Running', when: '12:42', value: '£ 28.9m', extra: '9,832 / 14,200 tx' },
    { id: 'TP-Q4-2024-11', kind: 'generic', status: 'Complete', statusClass: 'done', when: '2h ago | 10:18', value: '£ 26.4m', extra: '2m 04s | dry calculate' },
    { id: 'TP-Q4-2024-10', kind: 'generic', status: 'Complete', statusClass: 'done', when: 'Yesterday | 16:02', value: '£ 25.1m', extra: '1m 58s | dry calculate' },
    { id: 'TP-Q3-2024', kind: 'generic', status: 'Posted', statusClass: 'done', when: '21 Oct | 14:30', value: '£ 26.8m', extra: '186 journals | Maria R.' },
    { id: 'TP-Q3-2024-DRY-6', kind: 'generic', status: 'Complete', statusClass: 'done', when: '21 Oct | 14:12', value: '£ 26.8m', extra: '2m 22s | dry calculate' },
    { id: 'TP-Q3-2024-DRY-5', kind: 'failed', status: 'Failed', statusClass: 'danger', when: '18 Oct | 09:14', value: '-', extra: 'TB schema drift' }
  ];

  var reports = [
    { id: 'country-by-country', name: 'Country-by-country report', format: 'XLSX', pages: 12 },
    { id: 'tp-policy-summary', name: 'TP policy summary', format: 'PDF', pages: 6 },
    { id: 'master-file', name: 'Master file', format: 'PDF', pages: 34 },
    { id: 'local-file', name: 'Local file | Connect Finco', format: 'PDF', pages: 18 },
    { id: 'benchmarking-pack', name: 'Benchmarking pack', format: 'XLSX', pages: 9 }
  ];

  /* Full triage shape (found/scope/options) - the single source of truth for
     the exceptions queue. exceptions.html clones this into a working array
     at load (JSON round-trip - these objects are frozen below) and overlays
     persisted triage state (arkk.exceptions.v1) on top. Anything that only
     needs the summary (palette, notifications) reads title/code/href. */
  var exceptions = [
    {
      id: 'cc-5170', kind: 'cc', code: '5170', title: 'New cost centre needs a rollup', tag: 'UNMAPPED', status: 'New',
      meta: 'Legacy group | £ 0 | no parent rollup', href: 'exceptions?new=cc-5170',
      found: 'New cost centre 5170 has no parent rollup, so it is excluded from every matrix cell.',
      scope: 'Legacy group | 1 entity | £ 0 gross',
      options: [
        { pill: 'markup-7', label: 'Assign to New operations rollup', desc: 'Arkk’s best match, 92% similar', selected: true },
        { pill: 'markup-5', label: 'Assign to Group treasury', desc: 'Alternative rollup with similar cost profile' },
        { pill: 'at-cost', label: 'Create a new rollup', desc: 'Start a dedicated rollup for this cost centre' },
        { pill: 'ignore', label: 'Ignore this period', desc: 'Skip for Q4 2024 | revisit next close' }
      ]
    },
    {
      id: 'cc-5183', kind: 'cc', code: '5183', title: 'Unrecognised transaction code 5183', tag: 'NEW', status: 'New',
      meta: 'BU Operations | £ 1.2m | no matrix rule', href: 'exceptions?new=cc-5183',
      found: 'Transaction code 5183 does not match any existing cost-centre group in BU Operations.',
      scope: 'BU Operations | 1 entity | £ 1.2m gross',
      noConfidentMatch: true,
      options: [
        { pill: 'markup-7', label: 'Assign to Sales & Marketing', desc: 'Closest cost profile, low confidence' },
        { pill: 'markup-5', label: 'Assign to Central services', desc: 'Alternative rollup' },
        { pill: 'at-cost', label: 'Create a new rollup', desc: 'Start a dedicated rollup for this code' },
        { pill: 'ignore', label: 'Ignore this period', desc: 'Skip for Q4 2024 | revisit next close' }
      ]
    },
    {
      id: 'cc-5188', kind: 'cc', code: '5188', title: 'New cost centre missing an owner', tag: 'UNMAPPED', status: 'New',
      meta: 'Central services | £ 0.4m | missing owner', href: 'exceptions?new=cc-5188',
      found: 'Cost centre 5188 has no assigned owner, so approvals cannot route to a Tax Lead.',
      scope: 'Central services | 1 entity | £ 0.4m gross',
      options: [
        { pill: 'markup-7', label: 'Assign to Group treasury', desc: 'Arkk’s best match, 87% similar', selected: true },
        { pill: 'markup-5', label: 'Assign to Finance & IT services', desc: 'Alternative rollup' },
        { pill: 'at-cost', label: 'Create a new rollup', desc: 'Start a dedicated rollup for this cost centre' },
        { pill: 'ignore', label: 'Ignore this period', desc: 'Skip for Q4 2024 | revisit next close' }
      ]
    },
    {
      id: 'txn-88213', kind: 'txn', code: 'TXN-88213', title: 'Cross-entity transfer needs a match', tag: 'NEW', status: 'Assigned',
      meta: 'Routine group | £ 340k | ambiguous counterparty', href: 'exceptions?new=txn-88213',
      found: 'Transaction TXN-88213 references a counterparty entity that is not yet in the Q4 hierarchy.',
      scope: 'Routine group | 2 entities | £ 340k gross',
      options: [
        { pill: 'markup-7', label: 'Match to Connect Bidco', desc: 'Arkk’s best match, 81% similar', selected: true },
        { pill: 'markup-5', label: 'Match to New Wave Broadband', desc: 'Alternative counterparty' },
        { pill: 'at-cost', label: 'Flag for manual review', desc: 'Send to Tax Lead for confirmation' },
        { pill: 'ignore', label: 'Ignore this period', desc: 'Skip for Q4 2024 | revisit next close' }
      ]
    },
    {
      id: 'cc-5191', kind: 'cc', code: '5191', title: 'Cost centre 5191 duplicate suspected', tag: 'UNMAPPED', status: 'New',
      meta: 'Sales & Marketing | £ 0 | duplicate code suspected', href: 'exceptions?new=cc-5191',
      found: 'Cost centre 5191 shares a code prefix with 5190, already mapped. This may be a duplicate.',
      scope: 'Sales & Marketing | 1 entity | £ 0 gross',
      options: [
        { pill: 'markup-7', label: 'Merge into 5190', desc: 'Arkk’s best match, 95% similar', selected: true },
        { pill: 'markup-5', label: 'Assign to Sales & Marketing rollup', desc: 'Keep as a distinct cost centre' },
        { pill: 'at-cost', label: 'Create a new rollup', desc: 'Start a dedicated rollup for this cost centre' },
        { pill: 'ignore', label: 'Ignore this period', desc: 'Skip for Q4 2024 | revisit next close' }
      ]
    },
    {
      id: 'cc-5177', kind: 'cc', code: '5177', title: 'Renamed cost centre needs a rule', tag: 'NEW', status: 'Assigned',
      meta: 'Finance & IT | £ 2.1m | rule not migrated', href: 'exceptions?new=cc-5177',
      found: 'Cost centre 5177 was renamed from "IT support" and its markup rule did not carry over.',
      scope: 'Finance & IT services | 1 entity | £ 2.1m gross',
      options: [
        { pill: 'markup-7', label: 'Re-apply Cost +7% (prior rule)', desc: 'Arkk’s best match, 99% similar', selected: true },
        { pill: 'markup-5', label: 'Apply Cost +5% instead', desc: 'Alternative markup' },
        { pill: 'at-cost', label: 'Apply At cost', desc: 'Pass-through, no markup' },
        { pill: 'ignore', label: 'Ignore this period', desc: 'Skip for Q4 2024 | revisit next close' }
      ]
    },
    {
      id: 'txn-88250', kind: 'txn', code: 'TXN-88250', title: 'Intercompany recharge FX mismatch', tag: 'NEW', status: 'New',
      meta: 'Legacy group | £ 610k | currency mismatch', href: 'exceptions?new=txn-88250',
      found: 'Transaction TXN-88250 was posted in USD but the counterparty entity reports in EUR.',
      scope: 'Legacy group | 1 entity | £ 610k gross',
      simulateOfflineError: true,
      options: [
        { pill: 'markup-7', label: 'Convert at period-close rate', desc: 'Arkk’s best match, 90% similar', selected: true },
        { pill: 'markup-5', label: 'Convert at transaction-date rate', desc: 'Alternative FX treatment' },
        { pill: 'at-cost', label: 'Flag for manual review', desc: 'Send to Tax Lead for confirmation' },
        { pill: 'ignore', label: 'Ignore this period', desc: 'Skip for Q4 2024 | revisit next close' }
      ]
    }
  ];

  var pages = [
    { id: 'overview', name: 'Overview', href: './' },
    { id: 'matrix', name: 'Cost matrix', href: 'matrix.html' },
    { id: 'benchmarking', name: 'Benchmarking', href: 'transfer-pricing.html' },
    { id: 'hierarchy', name: 'Hierarchy', href: 'hierarchy.html' },
    { id: 'runs', name: 'Runs', href: 'runs.html' },
    { id: 'workflows', name: 'Workflows', href: 'workflows.html' },
    { id: 'data-sources', name: 'Data sources', href: 'data-sources.html' },
    { id: 'reports', name: 'Reports', href: 'reports.html' },
    { id: 'exceptions', name: 'Exceptions', href: 'exceptions.html' },
    { id: 'settings', name: 'Settings', href: 'settings.html' }
  ];

  var notifications = [
    { id: 'n-close', kind: 'deadline', title: 'Q4 2024 close due in 3 days', meta: 'Target 15 Nov | 186 journals staged', href: 'runs.html' },
    { id: 'n-exc', kind: 'exception', title: '7 exceptions need triage', meta: '3 new since last close', href: 'exceptions.html' },
    { id: 'n-fx', kind: 'exception', title: 'FX warning on run TP-Q4-2024-13', meta: 'USD posted against EUR counterparty', href: 'run-detail?run=TP-Q4-2024-13' }
  ];

  var matrixRegions = {
    europe: { label: 'European allocations', count: 18 },
    'north-america': { label: 'North America', count: 12 },
    'asia-pacific': { label: 'Asia-Pacific', count: 12 }
  };

  var shortcuts = [
    { keys: '⌘K', desc: 'Open command palette' },
    { keys: '↑ / ↓', desc: 'Move through a queue' },
    { keys: 'Enter', desc: 'Open highlighted' },
    { keys: 'Esc', desc: 'Close overlay' },
    { keys: 'Delete', desc: 'Remove selected node (Workflows)' },
    { keys: '⌘Z / ⌘Y', desc: 'Undo / redo (Workflows)' },
    { keys: 'Space + drag', desc: 'Pan canvas (Workflows)' }
  ];

  var guides = [
    { id: 'close-quarter', title: 'Close the quarter', href: './', steps: [
      'Open Overview and review the readiness score.',
      'Run a dry-calc from Next best actions.',
      'Resolve any warnings on the run detail page.',
      'Approve and post to the GL.',
      'Confirm Overview shows the quarter as posted.'
    ] },
    { id: 'triage-exception', title: 'Triage an exception', href: 'exceptions.html', steps: [
      'Open Exceptions and select an item from the queue.',
      'Read what Arkk found and the suggested fix.',
      'Pick a resolution option or assign it to a teammate.',
      'Resolve the exception | it drops off the queue.'
    ] },
    { id: 'edit-matrix-rule', title: 'Edit a matrix rule', href: 'matrix.html', steps: [
      'Open Cost matrix and click any cell.',
      'Pick a markup rule and review the estimated change.',
      'Save the change to return to the matrix.'
    ] },
    { id: 'reparent-hierarchy', title: 'Reparent the hierarchy', href: 'hierarchy.html', steps: [
      'Open Hierarchy and find the cost centre to move.',
      'Drag it into its new parent rollup.',
      'Review the move summary and commit the move.',
      'Approve the hierarchy once every move is reviewed.'
    ] },
    { id: 'build-workflow', title: 'Build a workflow', href: 'workflows.html', steps: [
      'Open Workflows and drag a node from the palette onto the canvas.',
      'Connect nodes to define the pipeline order.',
      'Run a dry run to preview the sequence.',
      'Save the workflow when it is ready.'
    ] }
  ];

  window.ArkkData = freeze({
    user: user, workspaces: workspaces, quarter: quarter, entities: entities, rollups: rollups,
    costCentres: costCentres, runs: runs, reports: reports, exceptions: exceptions, pages: pages,
    notifications: notifications, matrixRegions: matrixRegions, shortcuts: shortcuts, guides: guides
  });
})();
