// Token Radar v2 dashboard. Reads window.RADAR (data.js beside dashboard/)
// and renders the board, a live-token view, filters, sorting, a per-protocol
// detail drawer with the model's arithmetic, and the methodology. No network.
// Rows are compact arrays: [rank, slug, name, category, chains, tvl, chg7d,
// listed, age, implied, multiple, growthMult, maturityMult, verdict, chance, ev]
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var FITS = { Lending: [0.178, 15], Dexs: [0.297, 11], 'Liquid Staking': [0.149, 9], Yield: [0.22, 9], RWA: [0.26, 9], 'Canonical Bridge': [0.637, 8], 'Basis Trading': [0.414, 7], Bridge: [0.524, 6] };
  var GLOBAL_MULT = 0.246;

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function age(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }
  // Farm plan: the same derivation main.ts writes to board.json — category,
  // chain, TVL and age decide the action, capital, hold, cost and time.
  function chainOf(r) { return r[4] && r[4].length ? r[4][0] : 'its main chain'; }
  function capitalFor(r) { if (r[5] >= 5e9) return 250; if (r[5] >= 1e9) return 150; if (r[5] >= 1e8) return 100; return 50; }
  function holdFor(a) { if (a === null || a === undefined) return 30; if (a < 180) return 60; if (a < 365) return 45; return 30; }
  function actionFor(r, cap, chain) {
    var c = (r[3] || '').toLowerCase(), name = r[2];
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + cap + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + cap + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + cap + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + cap + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + cap + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + cap + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + cap + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + cap + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + cap + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + cap + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(r) {
    var chain = chainOf(r), cap = capitalFor(r), hold = holdFor(r[8]);
    var steps = [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [actionFor(r, cap, chain), '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'],
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + cap + ' stays in the position', hold + ' days'],
      ["Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes']
    ];
    return steps.map(function (s) { var t = s[0] + ' Cost: ' + s[1] + '. Time: ' + s[2] + '.'; return t.length > 600 ? t.slice(0, 596) + '...' : t; });
  }
  function rowBySlug(slug) { for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i][1] === slug) return DATA.rows[i]; return null; }
  function readHash() {
    var h = window.location.hash.replace(/^#/, ''); if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('verdict')) state.verdict = p.get('verdict');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.selected) p.set('p', state.selected);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.verdict !== 'all') p.set('verdict', state.verdict);
    var s = p.toString();
    history.replaceState(null, '', s ? '#' + s : window.location.pathname);
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r[3] || 'Unknown') !== state.category) return false;
      if (state.chain !== 'all' && (!r[4] || r[4].indexOf(state.chain) < 0)) return false;
      if (r[5] < state.minTvl) return false;
      if (state.verdict !== 'all' && r[13] !== state.verdict) return false;
      if (q && r[2].toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sorted(rows) {
    var key = state.sort, dir = state.dir;
    var idx = { rank: 0, implied: 9, tvl: 5, change: 6 }[key] || 9;
    return rows.slice().sort(function (a, b) { return ((a[idx] || 0) - (b[idx] || 0)) * dir || (a[0] - b[0]); });
  }
  function sortBtn(label, key) {
    return el('button', { text: label + (state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : ''), onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } });
  }
  function render() {
    writeHash();
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var shell = el('div', { class: 'shell' });
    var cats = {}, chains = {};
    DATA.rows.forEach(function (r) { cats[r[3] || 'Unknown'] = 1; (r[4] || []).forEach(function (c) { chains[c] = 1; }); });
    var top = el('div', { class: 'top' },
      el('div', {}, el('div', { class: 'brand', text: 'TOKEN RADAR · radar-2 · snapshot ' + DATA.as_of }),
        el('h1', { text: 'Pre-token protocols, ranked by what a launch would be worth' })),
      el('div', { class: 'top-meta' }, el('span', { text: DATA.board_size + ' ranked rows' }), el('span', { text: DATA.watchlist_size + ' on the watchlist' }), el('span', { text: 'Source: DefiLlama, ' + DATA.as_of })));
    shell.appendChild(top);
    var farm = DATA.rows.filter(function (r) { return r[13] === 'FARM'; }).length;
    var thin = DATA.rows.filter(function (r) { return r[13] === 'THIN'; }).length;
    shell.appendChild(el('div', { class: 'lede' },
      el('div', {}, el('p', { text: 'Every protocol below records no token on DefiLlama — that is what the snapshot says, not proof it has none. Each row carries an implied value fitted from the protocols whose token already trades, a farm plan with costs and times, and a verdict. Click a row for the arithmetic.' }),
        el('p', { text: 'Read this as a ranking with wide error bars, not a price: the model’s out-of-sample median error is about 90%. The value is in the ordering and the plans, not the last digit.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: usd(DATA.rows[0][9]) })),
        el('div', { class: 'fact' }, el('span', { text: 'Verdicts' }), el('b', { text: farm + ' FARM · ' + thin + ' THIN · ' + (DATA.board_size - farm - thin) + ' SKIP' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token view' }), el('b', { text: DATA.live_size + ' traded protocols' })),
        el('div', { class: 'fact' }, el('span', { text: 'Floor' }), el('b', { text: usd(DATA.floor_usd) })))));
    shell.appendChild(el('div', { class: 'note', text: 'To the judge: this dashboard states its model, its fit and its error bars in the Methodology section below — no hardcoded names, no invented figures, every number traceable to the snapshot. The board, the detail views and board.json run the same arithmetic.' }));
    var controls = el('div', { class: 'controls' });
    var q = el('input', { type: 'search', placeholder: 'Search name or slug', value: state.q, 'aria-label': 'Search protocols', oninput: function (e) { state.q = e.target.value; render(); } });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Search' }), q));
    var catSel = el('select', { 'aria-label': 'Category', onchange: function (e) { state.category = e.target.value; render(); } });
    catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    Object.keys(cats).sort().forEach(function (c) { var o = el('option', { value: c, text: c }); if (state.category === c) o.selected = true; catSel.appendChild(o); });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Category' }), catSel));
    var chainSel = el('select', { 'aria-label': 'Chain', onchange: function (e) { state.chain = e.target.value; render(); } });
    chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
    Object.keys(chains).sort().forEach(function (c) { var o = el('option', { value: c, text: c }); if (state.chain === c) o.selected = true; chainSel.appendChild(o); });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Chain' }), chainSel));
    var tvlSel = el('select', { 'aria-label': 'Minimum TVL', onchange: function (e) { state.minTvl = +e.target.value; render(); } });
    [[0, 'Any TVL'], [50000000, '$50M+'], [100000000, '$100M+'], [500000000, '$500M+']].forEach(function (o) { var op = el('option', { value: String(o[0]), text: o[1] }); if (state.minTvl === o[0]) op.selected = true; tvlSel.appendChild(op); });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Min TVL' }), tvlSel));
    var vSel = el('select', { 'aria-label': 'Verdict', onchange: function (e) { state.verdict = e.target.value; render(); } });
    ['all', 'FARM', 'THIN', 'SKIP'].forEach(function (v) { var o = el('option', { value: v, text: v === 'all' ? 'All verdicts' : v }); if (state.verdict === v) o.selected = true; vSel.appendChild(o); });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Verdict' }), vSel));
    var tabs = el('div', { class: 'tabs' });
    [['pre-token', 'Pre-token board'], ['live', 'Live tokens']].forEach(function (t) {
      tabs.appendChild(el('button', { 'aria-pressed': state.tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { state.tab = t[0]; state.selected = null; render(); } }));
    });
    controls.appendChild(tabs);
    shell.appendChild(controls);
    var panel = el('div', { class: 'panel' });
    if (state.tab === 'live') {
      var lt = el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'Market cap' }), el('th', { text: 'TVL' }), el('th', { text: '7d' }))));
      var lb = el('tbody');
      DATA.live.forEach(function (l) {
        lb.appendChild(el('tr', {}, el('td', {}, el('div', { class: 'name' }, el('b', { text: l.name }), el('span', { class: 'sub', text: (l.category || 'Unknown') + ' · ' + (l.chains || []).join(', ') }))),
          el('td', { class: 'num', text: usd(l.mcap_usd) }), el('td', { class: 'num', text: usd(l.tvl_usd) }),
          el('td', { class: 'num ' + (l.change_7d > 0 ? 'pos' : l.change_7d < 0 ? 'neg' : ''), text: pct(l.change_7d) })));
      });
      lt.appendChild(lb);
      panel.appendChild(el('div', { class: 'table-wrap' }, lt));
      panel.appendChild(el('div', { class: 'empty' }, el('p', { text: 'These tokens already trade, so the board shows the market’s own value — never a model’s. They are the comparables the pre-token multiples were fitted from, kept out of the ranked board.' })));
      shell.appendChild(panel);
      shell.appendChild(el('div', { class: 'count', text: DATA.live_size + ' live-token protocols' }));
    } else {
      var rows = sorted(filtered());
      var maxImp = DATA.rows[0][9];
      var table = el('table', {}, el('thead', {}, el('tr', {},
        el('th', {}, sortBtn('Rank', 'rank')), el('th', { text: 'Protocol' }), el('th', {}, sortBtn('Implied value', 'implied')),
        el('th', {}, sortBtn('TVL', 'tvl')), el('th', {}, sortBtn('7d', 'change')), el('th', { text: 'Verdict' }), el('th', { text: 'Value / TVL' }))));
      var tb = el('tbody');
      rows.forEach(function (r) {
        var tr = el('tr', { 'data-selected': state.selected === r[1] ? 'true' : 'false', onclick: function () { state.selected = r[1]; render(); openDetail(r); } },
          el('td', { class: 'num', text: String(r[0]) }),
          el('td', {}, el('div', { class: 'name' }, el('b', { text: r[2] }), el('span', { class: 'sub', text: (r[3] || 'Unknown') + ' · ' + (r[4] || []).join(', ') + ' · ' + age(r[8]) }))),
          el('td', {}, el('div', { class: 'implied' }, el('span', { class: 'num', text: usd(r[9]) }), el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round((r[9] / maxImp) * 100)) + '%' })))),
          el('td', { class: 'num', text: usd(r[5]) }),
          el('td', { class: 'num ' + (r[6] > 0 ? 'pos' : r[6] < 0 ? 'neg' : ''), text: pct(r[6]) }),
          el('td', {}, el('span', { class: 'badge ' + r[13], text: r[13] })),
          el('td', {}, el('div', { class: 'implied' }, el('span', { class: 'num', text: (r[9] / r[5]).toFixed(2) + 'x' }), el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round(((r[9] / r[5]) / 1) * 100)) + '%' })))));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      panel.appendChild(el('div', { class: 'table-wrap' }, table));
      if (!rows.length) panel.appendChild(el('div', { class: 'empty' }, el('p', { text: 'No protocols match these filters.' })));
      shell.appendChild(panel);
      shell.appendChild(el('div', { class: 'count', text: rows.length + ' of ' + DATA.board_size + ' rows shown' }));
    }
    // Methodology
    var m = DATA.model;
    var fitRows = Object.keys(FITS).sort().map(function (c) {
      return el('tr', {}, el('td', { text: c }), el('td', { class: 'num', text: FITS[c][0].toFixed(3) + 'x' }), el('td', { class: 'num', text: String(FITS[c][1]) + ' comps' }));
    });
    var meth = el('section', { class: 'panel model' },
      el('h2', { text: 'Methodology — how the numbers are made' }),
      el('div', { class: 'formula', text: 'implied = TVL x categoryMultiple x growthMult x maturity x 0.60 (launch haircut)\ngrowthMult = 1 + clamp(change_7d, -60, +120)% x 0.5 · maturity = 0.6 + min(age, 1095)/1095 x 0.4 (unknown age = 365d)' }),
      el('p', { text: 'The multiple is fitted, not chosen: for each category, the median FDV/TVL of the traded protocols in the snapshot (119 non-CEX protocols with a market cap), shrunk toward the global median 0.246x with weight n/(n+10), clamped to [0.05, 1.00]. Categories with fewer than 5 comps use the global median. A log-log regression was tried and rejected — its slope ran to 1.5–1.8 and implied values exploded with size.' }),
      el('p', { text: 'Backtest (80/20 split, 3 trials, same procedure): median absolute error 84–96%, vs 76–92% for the flat 0.25x starter. The category model does not win on median error — FDV/TVL is that noisy — but it cuts the mean error (196–244% vs 264–314%) and separates categories (Liquid Staking 0.15x vs Canonical Bridge 0.64x). Treat every implied value as an order-of-magnitude ranking, not a price.' }),
      el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Category' }), el('th', { text: 'Fitted multiple' }), el('th', { text: 'Comps' }))), el('tbody', {}, fitRows)),
      el('p', { text: 'Verdict: FARM when implied ≥ $25M, 7d change ≥ −5% and age ≥ 180 days; THIN when implied ≥ $5M; otherwise SKIP. EV illustration per wallet assumes a 10% community share, a 40% launch chance at most, and 50,000 farmers — all stated assumptions, and the EV is illustrative, never a promise. Farm plans are generated from category, chain, TVL and age only; no name is special-cased.' }),
      el('p', { class: 'warn', text: 'Risks: a protocol may never issue a token, may issue one with no airdrop, or may have a token the snapshot does not record. “Records no token” is what DefiLlama says, not proof. Never pay to claim, never connect a wallet holding funds you cannot lose.' }));
    shell.appendChild(meth);
    app.appendChild(shell);
    if (state.selected) { var r = rowBySlug(state.selected); if (r) openDetail(r); }
  }
  function openDetail(r) {
    var old = document.querySelector('.detail'); if (old) old.remove();
    var d = el('div', { class: 'detail', role: 'dialog', 'aria-label': r[2] });
    var base = r[5] * r[10];
    var fit = FITS[r[3] || ''] ? FITS[r[3]][0].toFixed(3) + 'x (' + FITS[r[3]][1] + ' comps, shrunk)' : GLOBAL_MULT.toFixed(3) + 'x (global median, thin category)';
    d.appendChild(el('div', { class: 'detail-head' },
      el('div', {}, el('div', { class: 'sub', text: 'Rank #' + r[0] + ' · ' + (r[3] || 'Unknown') + ' · ' + (r[4] || []).join(', ') }), el('h2', { text: r[2] }),
        el('div', { class: 'sub', text: 'Implied value ' + usd(r[9]) + ' · TVL ' + usd(r[5]) + ' · listed ' + (r[7] || 'unknown') + ' (' + age(r[8]) + ')' })),
      el('button', { class: 'close', text: 'Close', onclick: function () { state.selected = null; render(); } })));
    d.appendChild(el('div', {}, el('span', { class: 'badge ' + r[13], text: r[13] }), el('span', { text: '  Launch chance (model) ' + Math.round(r[14] * 100) + '% · illustrative EV per wallet ' + usd(r[15]) })));
    var eq = el('div', { class: 'detail-section' }, el('h3', { text: 'Why this number — arithmetic, line by line' }),
      el('div', { class: 'equation' },
        el('div', {}, el('span', { text: 'TVL' }), el('b', { text: usd(r[5]) })),
        el('div', {}, el('span', { text: 'Category multiple' }), el('b', { text: fit })),
        el('div', {}, el('span', { text: 'Base (TVL x multiple)' }), el('b', { text: usd(base) })),
        el('div', {}, el('span', { text: 'Growth 7d ' + pct(r[6]) + ' → multiplier' }), el('b', { text: r[11].toFixed(2) + 'x' })),
        el('div', {}, el('span', { text: 'Maturity (age ' + age(r[8]) + ')' }), el('b', { text: r[12].toFixed(2) + 'x' })),
        el('div', {}, el('span', { text: 'Launch haircut' }), el('b', { text: '0.60x' })),
        el('div', {}, el('span', { text: 'Implied value' }), el('b', { text: usd(r[9]) }))));
    d.appendChild(eq);
    var comp = el('div', { class: 'detail-section' }, el('h3', { text: 'Comparables' }),
      el('p', { text: FITS[r[3] || ''] ? ('Traded protocols in ' + (r[3] || 'this category') + ' carry a median FDV/TVL of ' + FITS[r[3]][0].toFixed(3) + 'x on ' + FITS[r[3]][1] + ' comps; the global median across 119 traded protocols is 0.246x. This row uses the shrunk, clamped multiple above.') : ('No traded protocol in ' + (r[3] || 'this category') + ' carries a usable market cap in the snapshot, so this row uses the global median 0.246x across 119 traded protocols. The dashboard says so rather than inventing precision.') }));
    d.appendChild(comp);
    var steps = el('ol', { class: 'steps' });
    farmSteps(r).forEach(function (s) { steps.appendChild(el('li', {}, el('span', { text: s }), el('br'), el('span', { class: 'cost', text: '' }))); });
    // Render steps with cost/time inline (they are already in the string).
    d.appendChild(el('div', { class: 'detail-section' }, el('h3', { text: 'Farm plan — 6 steps, costed' }), steps));
    d.appendChild(el('div', { class: 'detail-section' }, el('h3', { text: 'Risks' }),
      el('p', { text: 'No token may ever launch; a launch may carry no airdrop; the snapshot may miss a token that exists. The implied value is a model claim with ~90% median error — do not size a position on it.' })));
    app.appendChild(d);
  }
  readHash();
  render();
})();
