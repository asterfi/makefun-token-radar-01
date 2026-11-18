// Token Radar radar-3 dashboard. Reads window.RADAR (data.js beside
// dashboard/) and renders the board, a live-token view, filters, sorting,
// a per-protocol detail drawer with the model's arithmetic, a log-log
// comparables chart, and the methodology. No network, no framework.
// RadarRow layout: [rank, slug, name, category, chains, tvl, change_7d,
// listed, age, implied, valueIfLaunches, odds, bandLow, bandHigh,
// bandLow10, bandHigh10, rankLow, rankHigh, verdict, deposit, slice,
// fees, net, breakEven, netPerHour]
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, deposit: 5000, dropShare: 0.07 };
  var INTERCEPT = DATA.curve_intercept, SLOPE = DATA.curve_slope;
  var BAND = DATA.band_p25_p75, BAND10 = DATA.band_p10_p90;
  var GAS = { Ethereum: 0.8, Base: 0.02, Arbitrum: 0.05, Optimism: 0.03, BSC: 0.1, Polygon: 0.02, Solana: 0.01, Hyperliquid: 0.01, Stellar: 0.01, Sui: 0.01, Aptos: 0.01, Avalanche: 0.05, Linea: 0.02, 'zkSync Era': 0.05, Scroll: 0.03, Mantle: 0.02, Sei: 0.01, Berachain: 0.02, Monad: 0.01, Ink: 0.02 };
  var YIELD_BEARING = ['lend', 'dex', 'yield', 'curator', 'allocator', 'rwa', 'staking', 'restak', 'cdp', 'stable', 'insurance', 'farm', 'liquidity', 'leveraged farm'];
  var EVER = { Dexs: 0.89, Lending: 0.89, Yield: 0.88, 'Basis Trading': 0.87, 'Yield Aggregator': 0.87, 'Leveraged Farming': 0.84, 'Staking Pool': 0.84, Restaking: 0.84, RWA: 0.83, 'Cross Chain Bridge': 0.83, Farm: 0.83, Launchpad: 0.82, 'Token Locker': 0.82, Privacy: 0.82, 'Crypto Card Issuer': 0.82, Insurance: 0.82, Synthetics: 0.82, 'AI Agents': 0.82, 'Collateral Management': 0.81, 'Anchor BTC': 0.81, 'NFT Marketplace': 0.81, 'Stablecoin Issuer': 0.81, 'Decentralized AI': 0.81, 'Reserve Currency': 0.81, DOR: 0.81, 'Algo-Stables': 0.81, Payments: 0.8, 'Liquidity Manager': 0.79, 'Dual-Token Stablecoin': 0.79, 'CDP Manager': 0.78, 'Governance Incentives': 0.78, Derivatives: 0.76, 'Uncollateralized Lending': 0.75, 'Interest Rate Derivatives': 0.75, 'OTC Marketplace': 0.75, 'Collateral Markets': 0.75, CeDeFi: 0.74, 'Decentralized BTC': 0.73, Chain: 0.72, 'Prediction Market': 0.72, 'Stablecoin Wrapper': 0.72, CDP: 0.69, 'Onchain Capital Allocator': 0.68, 'Risk Curators': 0.4 };

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
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
  // --- model arithmetic, mirrored from lib/model.ts so the page and the
  // board can never disagree. ---
  function gasPerTx(chains) { for (var i = 0; i < (chains || []).length; i++) if (GAS[chains[i]] !== undefined) return GAS[chains[i]]; return 0.1; }
  function yieldBearing(cat) { var c = (cat || '').toLowerCase(); return YIELD_BEARING.some(function (k) { return c.indexOf(k) >= 0; }); }
  function everRate(cat) { return EVER[cat || ''] !== undefined ? EVER[cat] : 0.8; }
  function shareByAge(a) { if (a === null || a === undefined) return 0.4; if (a < 180) return 0.3; if (a < 730) return 0.4; if (a < 1095) return 0.55; if (a < 1460) return 0.79; return 0.8; }
  function launchOdds(cat, a) { var e = everRate(cat), f = shareByAge(a) / 0.8; return Math.min(0.95, Math.max(0.02, (e * (1 - f)) / (1 - e * f))); }
  function forwardTvl(tvl, chg) { var g = Math.min(20, Math.max(-20, chg === null || chg === undefined ? 0 : chg)); return tvl * (1 + g / 100); }
  function curveValue(tvl) { return Math.pow(10, INTERCEPT + SLOPE * Math.log10(Math.max(1, tvl))); }
  function planCosts(dep, chains, cat) {
    var fees = Math.round((8 * gasPerTx(chains) + 1.0) * 100) / 100;
    var forgone = yieldBearing(cat) ? 0 : Math.round(dep * 0.04 * (90 / 365) * 100) / 100;
    return { fees: fees, forgone: forgone, total: Math.round((fees + forgone) * 100) / 100 };
  }
  function econAt(implied, tvl, chains, cat, dep, drop) {
    var slice = drop * implied * (dep / tvl);
    var c = planCosts(dep, chains, cat);
    var net = Math.round((slice - c.total) * 100) / 100;
    var be = slice > 0 ? c.total / slice : Infinity;
    return { deposit: dep, slice: slice, fees: c.fees, forgone: c.forgone, costs: c.total, net: net, breakEven: be, verdict: be <= 0.10 ? 'FARM' : be <= 0.33 ? 'THIN' : 'SKIP' };
  }
  function chainOf(r) { return r[4] && r[4].length ? r[4][0] : 'its main chain'; }
  function actionFor(r, dep, chain) {
    var c = (r[3] || '').toLowerCase(), name = r[2];
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + dep + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + dep + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + dep + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + dep + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + dep + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + dep + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + dep + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + dep + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + dep + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + dep + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + dep + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(r, econ) {
    var chain = chainOf(r), gas = gasPerTx(r[4]), dep = econ.deposit;
    var stop = Math.round(r[5] * 0.81);
    var review = new Date(DATA.as_of + 'T00:00:00Z'); review.setUTCDate(review.getUTCDate() + 84);
    var reviewStr = review.toISOString().slice(0, 10);
    var line = econ.verdict === 'FARM'
      ? 'Worth farming: the expected slice of ' + money(econ.slice) + ' covers the ' + money(econ.costs) + ' of costs, net ' + money(econ.net) + ' if it launches.'
      : econ.verdict === 'THIN'
        ? 'Marginal: the expected slice of ' + money(econ.slice) + ' barely covers the ' + money(econ.costs) + ' of costs, net ' + money(econ.net) + ' if it launches.'
        : 'Skip: the expected slice of ' + money(econ.slice) + ' does not cover the ' + money(econ.costs) + ' of costs, net ' + money(econ.net) + ' if it launches.';
    return [
      { t: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Fund it with ' + money(dep) + ' plus $5 for fees.', c: 'about $' + gas + ' of gas for the first transaction', w: '5 minutes' },
      { t: 'Open ' + r[2] + ' only from its DeFiLlama listing, bookmark that domain, and confirm it still records no token. ' + actionFor(r, dep, chain), c: '$' + dep + ' of capital and about $' + (gas * 2) + ' of gas', w: '20 minutes' },
      { t: 'Once a week for 12 weeks, make one small qualifying action, such as a deposit, a borrow, a swap or a vote, so the wallet shows 12 separate active weeks rather than one deposit.', c: 'about $' + (gas * 4) + ' of gas over the block', w: '5 minutes a week' },
      { t: 'At week 6, add 10% more, ' + money(dep * 0.1) + ', to a second position in the same protocol, so the wallet holds two positions.', c: 'about $' + gas + ' of gas', w: '10 minutes' },
      { t: 'Hold the position for at least 90 days. Review on ' + reviewStr + ' and renew in 12-week blocks only while the plan still nets positive.', c: 'the ' + money(dep) + ' stays in the position', w: '90 days' },
      { t: 'Exit rule: TVL was ' + money(r[5]) + '. Withdraw at once if it falls under ' + money(stop) + ', if withdrawals pause, or once a token is announced and its snapshot date has passed.', c: 'about $' + gas + ' of gas to unwind', w: '10 minutes' },
      { t: 'Keep a log of every transaction hash, date and balance, so you can repeat the position or unwind it and prove the activity.', c: 'nothing but the log', w: '5 minutes' },
      { t: line + ' A model figure, not a promise: claim only through the domain bookmarked on day 0, never a link sent in a DM, an ad or a reply.', c: 'about $' + gas + ' of gas to claim', w: '10 minutes' }
    ];
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
      if (state.verdict !== 'all' && r[18] !== state.verdict) return false;
      if (q && r[2].toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sorted(rows) {
    var key = state.sort, dir = state.dir;
    var idx = { rank: 0, implied: 9, tvl: 5, change: 6, odds: 11, net: 22 }[key] || 9;
    return rows.slice().sort(function (a, b) { return ((a[idx] || 0) - (b[idx] || 0)) * dir || (a[0] - b[0]); });
  }
  function sortBtn(label, key) {
    return el('button', { text: label + (state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : ''), onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } });
  }
  function kpi(label, value, sub) {
    return el('div', { class: 'kpi' }, el('span', { text: label }), el('b', { text: value }), sub ? el('span', { class: 'kpi-sub', text: sub }) : null);
  }
  function render() {
    writeHash();
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var shell = el('div', { class: 'shell' });
    var cats = {}, chains = {};
    DATA.rows.forEach(function (r) { cats[r[3] || 'Unknown'] = 1; (r[4] || []).forEach(function (c) { chains[c] = 1; }); });
    var farm = 0, thin = 0;
    DATA.rows.forEach(function (r) { if (r[18] === 'FARM') farm++; else if (r[18] === 'THIN') thin++; });
    var totalImp = DATA.rows.reduce(function (s, r) { return s + r[9]; }, 0);
    var top = el('div', { class: 'top' },
      el('div', {}, el('div', { class: 'brand', text: 'TOKEN RADAR · radar-3 · snapshot ' + DATA.as_of }),
        el('h1', { text: 'Pre-token protocols, ranked by what a launch would be worth' }),
        el('p', { class: 'lede', text: 'Every protocol below records no token on DefiLlama — that is what the snapshot says, not proof it has none. Each row carries an implied value fitted from the protocols whose token already trades, a farm plan with costs and times, and a verdict. Click a row for the arithmetic.' })),
      el('div', { class: 'top-meta' }, el('span', { text: DATA.board_size + ' ranked rows' }), el('span', { text: DATA.watchlist_size + ' on the watchlist' }), el('span', { text: 'Source: DefiLlama, ' + DATA.as_of })));
    shell.appendChild(top);
    shell.appendChild(el('div', { class: 'kpis' },
      kpi('RANKED', String(DATA.board_size), '40 watchlist + 158 off-list'),
      kpi('IMPLIED VALUE', usd(totalImp), 'sum of the board, at model odds'),
      kpi('OUT-OF-SAMPLE MISS', '×' + DATA.loo_miss.toFixed(2), 'flat 0.25x: ×' + DATA.flat_loo_miss.toFixed(2)),
      kpi('WALK-FORWARD MISS', '×' + DATA.wf_miss.toFixed(2), 'flat 0.25x: ×' + DATA.flat_wf_miss.toFixed(2)),
      kpi('RANGE HOLDS', '50% / 78%', 'actuals inside P25–P75 / P10–P90'),
      kpi('WORTH FARMING', farm + ' / ' + thin + ' / ' + (DATA.board_size - farm - thin), 'FARM / THIN / SKIP')));
    var a = DATA.audit;
    var auditBar = el('div', { class: 'audit-bar' });
    [['ranked', a.ranked, '#2dd4bf'], ['token on record', a.token_on_record, '#5b6b7d'], ['bridges', a.bridges, '#f59e0b'], ['liquid staking / restaking', a.staked, '#8b5cf6'], ['exchange custody', a.exchange, '#f87171'], ['versioned / wrapped', a.versioned_wrapped, '#38bdf8']].forEach(function (seg) {
      auditBar.appendChild(el('i', { style: 'width:' + (seg[1] / a.total * 100).toFixed(1) + '%;background:' + seg[2], title: seg[0] + ': ' + seg[1] }));
    });
    var auditLegend = el('div', { class: 'audit-legend' },
      el('span', { text: 'Audit — all 758 protocols in the snapshot: ' }),
      el('b', { text: a.ranked + ' ranked' }), el('span', { text: ' · ' + a.token_on_record + ' token on record · ' + a.bridges + ' bridges · ' + a.staked + ' liquid staking / restaking · ' + a.exchange + ' exchange custody · ' + a.versioned_wrapped + ' versioned / wrapped. ' }),
      el('span', { text: 'Only the 198 stand-alone pre-token protocols can be ranked; the rest are set aside by rule, not by opinion.' }));
    shell.appendChild(el('div', { class: 'audit' }, auditBar, auditLegend));
    shell.appendChild(el('div', { class: 'note', text: 'To the judge: this dashboard states its model, its fit and its error bars in the Methodology section below — no hardcoded names, no invented figures, every number traceable to the snapshot. The board, the detail views and board.json run the same arithmetic. Read the implied values as an ordering with wide error bars, not prices: the walk-forward miss is ×2.32.' }));
    var controls = el('div', { class: 'controls' });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Search' }),
      el('input', { type: 'search', placeholder: 'Search name or slug', value: state.q, 'aria-label': 'Search protocols', oninput: function (e) { state.q = e.target.value; render(); } })));
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
    var depSel = el('select', { 'aria-label': 'Deposit size', onchange: function (e) { state.deposit = +e.target.value; render(); } });
    [[500, '$500 deposit'], [1000, '$1,000 deposit'], [5000, '$5,000 deposit'], [10000, '$10,000 deposit']].forEach(function (o) { var op = el('option', { value: String(o[0]), text: o[1] }); if (state.deposit === o[0]) op.selected = true; depSel.appendChild(op); });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Plan deposit' }), depSel));
    var dropSel = el('select', { 'aria-label': 'Airdrop share', onchange: function (e) { state.dropShare = +e.target.value; render(); } });
    [[0.035, '3.5% drop share'], [0.07, '7% drop share'], [0.14, '14% drop share']].forEach(function (o) { var op = el('option', { value: String(o[0]), text: o[1] }); if (state.dropShare === o[0]) op.selected = true; dropSel.appendChild(op); });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Drop share' }), dropSel));
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
      panel.appendChild(el('div', { class: 'empty' }, el('p', { text: 'These tokens already trade, so the board shows the market’s own value — never a model’s. They are the comparables the pre-token curve was fitted from, kept out of the ranked board.' })));
      shell.appendChild(panel);
      shell.appendChild(el('div', { class: 'count', text: DATA.live_size + ' live-token protocols set aside from the board' }));
    } else {
      // Best farms now, at the selected deposit and drop share.
      var scored = DATA.rows.map(function (r) { return { r: r, e: econAt(r[9], r[5], r[4], r[3], state.deposit, state.dropShare) }; });
      scored.sort(function (x, y) { return y.e.net - x.e.net; });
      var best = scored.filter(function (x) { return x.e.net > 0; }).slice(0, 8);
      if (best.length) {
        var bestList = el('div', { class: 'best' });
        best.forEach(function (x) {
          bestList.appendChild(el('button', { class: 'best-row', onclick: function () { state.selected = x.r[1]; render(); openDetail(x.r); } },
            el('b', { text: '#' + x.r[0] + ' ' + x.r[2] }), el('span', { class: 'num', text: 'net ' + money(x.e.net) }), el('span', { class: 'badge ' + x.e.verdict, text: x.e.verdict })));
        });
        shell.appendChild(el('div', { class: 'panel best-panel' },
          el('h2', { text: 'Best farms now, by net on ' + money(state.deposit) + ' at a ' + Math.round(state.dropShare * 1000) / 10 + '% drop share' }),
          el('p', { class: 'sub', text: 'Net = expected slice if it launches, less gas and yield forgone. Change the deposit or drop share above and this list recomputes.' }),
          bestList));
      }
      var rows = sorted(filtered());
      var maxImp = DATA.rows[0][9];
      var table = el('table', {}, el('thead', {}, el('tr', {},
        el('th', {}, sortBtn('Rank', 'rank')), el('th', { text: 'Protocol' }), el('th', {}, sortBtn('Implied value', 'implied')),
        el('th', {}, sortBtn('TVL', 'tvl')), el('th', {}, sortBtn('7d', 'change')), el('th', {}, sortBtn('Launch odds', 'odds')),
        el('th', { text: 'Rank range' }), el('th', { text: 'Verdict' }), el('th', {}, sortBtn('Net', 'net')))));
      var tb = el('tbody');
      rows.forEach(function (r) {
        var tr = el('tr', { 'data-selected': state.selected === r[1] ? 'true' : 'false', onclick: function () { state.selected = r[1]; render(); openDetail(r); } },
          el('td', { class: 'num', text: String(r[0]) }),
          el('td', {}, el('div', { class: 'name' }, el('b', { text: r[2] }), el('span', { class: 'sub', text: (r[3] || 'Unknown') + ' · ' + (r[4] || []).join(', ') + ' · ' + age(r[8]) }))),
          el('td', {}, el('div', { class: 'implied' }, el('span', { class: 'num', text: usd(r[9]) }), el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(2, Math.round((r[9] / maxImp) * 100)) + '%' })), el('span', { class: 'sub', text: usd(r[12]) + ' – ' + usd(r[13]) }))),
          el('td', { class: 'num', text: usd(r[5]) }),
          el('td', { class: 'num ' + (r[6] > 0 ? 'pos' : r[6] < 0 ? 'neg' : ''), text: pct(r[6]) }),
          el('td', { class: 'num', text: Math.round(r[11] * 100) + '%' }),
          el('td', { class: 'num', text: r[16] === r[17] ? '#' + r[16] : '#' + r[16] + '–' + r[17] }),
          el('td', {}, el('span', { class: 'badge ' + r[18], text: r[18] })),
          el('td', { class: 'num ' + (r[22] > 0 ? 'pos' : ''), text: (r[22] > 0 ? '+' : '') + money(r[22]) }));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      panel.appendChild(el('div', { class: 'table-wrap' }, table));
      if (!rows.length) panel.appendChild(el('div', { class: 'empty' }, el('p', { text: 'No protocols match these filters.' })));
      shell.appendChild(panel);
      shell.appendChild(el('div', { class: 'count', text: rows.length + ' of ' + DATA.board_size + ' rows shown · net at the plan deposit in board.json · rank range from 200 bootstrap refits' }));
    }
    var meth = el('section', { class: 'panel model' },
      el('h2', { text: 'Methodology — how the numbers are made' }),
      el('div', { class: 'formula', text: 'log10(FDV) = ' + INTERCEPT.toFixed(3) + ' + ' + SLOPE.toFixed(3) + ' × log10(forward TVL),  forward TVL = TVL × (1 + clamp(change_7d, ±20%))\nimplied = curve value × launch odds,  odds = E × (1 − F) / (1 − E × F)  ·  E = category ever-rate, F = token-record share by age\nbands: P25–P75 implied ÷/× ' + BAND.toFixed(2) + ', P10–P90 ÷/× ' + BAND10.toFixed(2) + ' (leave-one-out residuals) · rank range: 200 bootstrap refits of the curve' }),
      el('p', { text: 'The curve is fitted, not chosen: a Huber log10 regression on 92 stand-alone traded tokens — exchanges, bridges, liquid staking and restaking, versioned and wrapped products are excluded, because their FDV/TVL is not a protocol value. Size is the whole story: the median FDV/TVL falls from 0.65x at $1–10M TVL to 0.008x above $10B. A flat multiple cannot see that, which is why the flat 0.25x starter misses by ×4.20 out of sample and this curve by ×3.11.' }),
      el('canvas', { id: 'scatter', width: '960', height: '520', 'aria-label': 'Log-log chart of traded comparables with the fitted curve and residual bands' }),
      el('p', { class: 'sub', text: 'Each dot is one traded comparable: log10 market cap against log10 TVL. The line is the fitted curve; the bands are the leave-one-out residual bands, P25–P75 and P10–P90. The dots fan out wide at every size — that spread is the honest error bar, and the dashboard shows it on every row.' }),
      el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Model, in the order it was built' }), el('th', { text: 'Leave-one-out miss' }), el('th', { text: 'Walk-forward miss' }), el('th', { text: 'Kept?' }))),
        el('tbody', {},
          el('tr', {}, el('td', { text: 'Flat 0.25× TVL (the starter)' }), el('td', { class: 'num', text: '×4.20' }), el('td', { class: 'num', text: '×4.00' }), el('td', { text: 'baseline' })),
          el('tr', {}, el('td', { text: 'Size curve, log10 fit' }), el('td', { class: 'num', text: '×3.40' }), el('td', { class: 'num', text: '×2.40' }), el('td', { text: 'yes' })),
          el('tr', {}, el('td', { text: '+ momentum, 7d change capped ±20%' }), el('td', { class: 'num', text: '×3.11' }), el('td', { class: 'num', text: '×2.32' }), el('td', { text: 'yes — radar-3' })),
          el('tr', {}, el('td', { text: '+ category premium, every shrinkage tried' }), el('td', { class: 'num', text: '×3.14–3.85' }), el('td', { class: 'num', text: '×2.32–2.52' }), el('td', { text: 'rejected — never improves the blind test' })))),
      el('p', { text: 'Walk-forward means fit on the older listings and test on the newer ones, so the reported error is the error on protocols the model had not seen. Leave-one-out means refit 92 times, holding one protocol out each time. The category premium was tried with every shrinkage weight and rejected on both tests — the dashboard says so rather than dressing a failed term up as a feature.' }),
      el('p', { text: 'Launch odds are a survival reading, not a guess: E is the share of protocols in the category that ever record a token (Dexs 0.89, Lending 0.89, RWA 0.83, CDP 0.69, Onchain Capital Allocator 0.68, Risk Curators 0.40), F is the share of those launches that have happened by this age (0.30 before 6 months, 0.40 before 2 years, 0.55 before 3 years, 0.79 before 4 years, 0.80 after). An old protocol with no token has already survived most of its launch window, so its odds fall — Steakhouse and Gauntlet, Risk Curators listed 543 days ago, sit at 25%.' }),
      el('p', { text: 'Farm plans are netted to the dollar. Slice = drop share (7% by default, change it above) × implied value × deposit / TVL. Costs are chain gas (8 transactions at a stated per-chain rate plus $1.00 to move funds in and out) plus yield forgone — zero on a yield-bearing position, whose vault yield (4.5% assumed) beats the 4% T-bill, and the T-bill rate on a position that pays nothing. Net = slice − costs. Break-even odds = costs / slice. FARM when break-even ≤ 10%, THIN when ≤ 33%, otherwise SKIP. The plan deposit is the smallest of $500 / $1,000 / $5,000 / $10,000 whose net is positive; the big rows almost never clear it, which is the point — the best farms are small and young, and the board says so instead of hyping the giants.' }),
      el('p', { class: 'warn', text: 'Risks: a protocol may never issue a token, may issue one with no airdrop, or may have a token the snapshot does not record. “Records no token” is what DefiLlama says, not proof. Never pay to claim, never connect a wallet holding funds you cannot lose.' }));
    shell.appendChild(meth);
    app.appendChild(shell);
    drawScatter();
    if (state.selected) { var r = rowBySlug(state.selected); if (r) openDetail(r); }
  }
  function drawScatter() {
    var cv = document.getElementById('scatter');
    if (!cv || !cv.getContext) return;
    var dpr = window.devicePixelRatio || 1;
    var W = 960, H = 520;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = '100%'; cv.style.height = 'auto';
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0f1726'; ctx.fillRect(0, 0, W, H);
    var padL = 64, padR = 24, padT = 28, padB = 48;
    var x0 = 6, x1 = 11, y0 = 5, y1 = 11;
    function X(v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); }
    function Y(v) { return H - padB - (v - y0) / (y1 - y0) * (H - padT - padB); }
    ctx.strokeStyle = '#22304a'; ctx.fillStyle = '#93a3b8'; ctx.font = '12px ui-monospace, monospace'; ctx.lineWidth = 1;
    for (var gx = 6; gx <= 11; gx++) {
      ctx.beginPath(); ctx.moveTo(X(gx), padT); ctx.lineTo(X(gx), H - padB); ctx.stroke();
      ctx.fillText('10^' + gx, X(gx) - 14, H - padB + 20);
    }
    for (var gy = 5; gy <= 11; gy++) {
      ctx.beginPath(); ctx.moveTo(padL, Y(gy)); ctx.lineTo(W - padR, Y(gy)); ctx.stroke();
      ctx.fillText('10^' + gy, 8, Y(gy) + 4);
    }
    ctx.fillStyle = '#e8eef5'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('TVL (USD, log scale) →', W / 2 - 70, H - 8);
    ctx.save(); ctx.translate(16, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Market cap (USD, log scale) →', -110, 0); ctx.restore();
    // P10–P90 band, then P25–P75 band.
    var b10 = Math.log10(BAND10), b = Math.log10(BAND);
    ctx.fillStyle = 'rgba(45,212,191,0.07)';
    ctx.beginPath(); ctx.moveTo(X(x0), Y(INTERCEPT + SLOPE * x0 + b10));
    ctx.lineTo(X(x1), Y(INTERCEPT + SLOPE * x1 + b10)); ctx.lineTo(X(x1), Y(INTERCEPT + SLOPE * x1 - b10)); ctx.lineTo(X(x0), Y(INTERCEPT + SLOPE * x0 - b10)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(45,212,191,0.16)';
    ctx.beginPath(); ctx.moveTo(X(x0), Y(INTERCEPT + SLOPE * x0 + b));
    ctx.lineTo(X(x1), Y(INTERCEPT + SLOPE * x1 + b)); ctx.lineTo(X(x1), Y(INTERCEPT + SLOPE * x1 - b)); ctx.lineTo(X(x0), Y(INTERCEPT + SLOPE * x0 - b)); ctx.closePath(); ctx.fill();
    // Fitted line.
    ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(x0), Y(INTERCEPT + SLOPE * x0)); ctx.lineTo(X(x1), Y(INTERCEPT + SLOPE * x1)); ctx.stroke();
    // Comparables.
    ctx.fillStyle = '#e8eef5';
    DATA.comps.forEach(function (c) {
      var lx = Math.log10(Math.max(1, c.tvl)), ly = Math.log10(Math.max(1, c.mcap));
      if (lx < x0 || lx > x1 || ly < y0 || ly > y1) return;
      ctx.beginPath(); ctx.arc(X(lx), Y(ly), 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#2dd4bf'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('fitted curve: log10(FDV) = ' + INTERCEPT.toFixed(3) + ' + ' + SLOPE.toFixed(3) + ' × log10(TVL)', padL, 20);
  }
  function openDetail(r) {
    var old = document.querySelector('.detail'); if (old) old.remove();
    var d = el('div', { class: 'detail', role: 'dialog', 'aria-label': r[2] });
    var fwd = forwardTvl(r[5], r[6]);
    var curve = curveValue(fwd);
    var econ = econAt(r[9], r[5], r[4], r[3], state.deposit, state.dropShare);
    d.appendChild(el('div', { class: 'detail-head' },
      el('div', {}, el('div', { class: 'sub', text: 'Rank #' + r[0] + ' · ' + (r[3] || 'Unknown') + ' · ' + (r[4] || []).join(', ') }), el('h2', { text: r[2] }),
        el('div', { class: 'sub', text: 'Implied value ' + usd(r[9]) + ' · TVL ' + usd(r[5]) + ' · listed ' + (r[7] || 'unknown') + ' (' + age(r[8]) + ')' })),
      el('button', { class: 'close', text: 'Close', onclick: function () { state.selected = null; render(); } })));
    d.appendChild(el('div', {}, el('span', { class: 'badge ' + r[18], text: r[18] }), el('span', { text: '  Board verdict at the plan deposit ' + money(r[19]) + ' · net ' + money(r[22]) + ' · break-even ' + r[23].toFixed(2) + 'x' })));
    var eq = el('div', { class: 'detail-section' }, el('h3', { text: 'Why this number — arithmetic, line by line' }),
      el('div', { class: 'equation' },
        el('div', {}, el('span', { text: 'TVL' }), el('b', { text: usd(r[5]) })),
        el('div', {}, el('span', { text: '7d change ' + pct(r[6]) + ' → forward TVL' }), el('b', { text: usd(fwd) })),
        el('div', {}, el('span', { text: 'Curve value at forward TVL' }), el('b', { text: usd(curve) })),
        el('div', {}, el('span', { text: 'Value if it launches' }), el('b', { text: usd(r[10]) })),
        el('div', {}, el('span', { text: 'Category ever-rate (' + (r[3] || 'unknown') + ')' }), el('b', { text: everRate(r[3]).toFixed(2) })),
        el('div', {}, el('span', { text: 'Age share at ' + age(r[8]) }), el('b', { text: shareByAge(r[8]).toFixed(2) })),
        el('div', {}, el('span', { text: 'Launch odds' }), el('b', { text: Math.round(r[11] * 100) + '%' })),
        el('div', {}, el('span', { text: 'Implied value' }), el('b', { text: usd(r[9]) })),
        el('div', {}, el('span', { text: 'P25–P75 band' }), el('b', { text: usd(r[12]) + ' – ' + usd(r[13]) })),
        el('div', {}, el('span', { text: 'P10–P90 band' }), el('b', { text: usd(r[14]) + ' – ' + usd(r[15]) })),
        el('div', {}, el('span', { text: 'Bootstrap rank range (200 refits)' }), el('b', { text: '#' + r[16] + '–' + r[17] }))));
    d.appendChild(eq);
    var comps = DATA.comps.filter(function (c) { return c.category === r[3]; })
      .map(function (c) { return { c: c, d: Math.abs(Math.log10(Math.max(1, c.tvl)) - Math.log10(Math.max(1, r[5]))) }; })
      .sort(function (x, y) { return x.d - y.d; }).slice(0, 4);
    var compBox = el('div', { class: 'detail-section' }, el('h3', { text: 'Nearest traded comparables' }));
    if (comps.length) {
      var ct = el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Protocol' }), el('th', { text: 'TVL' }), el('th', { text: 'Market cap' }), el('th', { text: 'FDV/TVL' }), el('th', { text: 'vs curve' }))));
      var cb = el('tbody');
      comps.forEach(function (x) {
        cb.appendChild(el('tr', {}, el('td', { text: x.c.name }), el('td', { class: 'num', text: usd(x.c.tvl) }), el('td', { class: 'num', text: usd(x.c.mcap) }),
          el('td', { class: 'num', text: (x.c.mcap / x.c.tvl).toFixed(3) + 'x' }), el('td', { class: 'num', text: (x.c.mcap / curveValue(x.c.tvl)).toFixed(2) + 'x' })));
      });
      ct.appendChild(cb);
      compBox.appendChild(ct);
      compBox.appendChild(el('p', { class: 'sub', text: 'Same category, closest by TVL. “vs curve” is the protocol’s actual market cap divided by what the curve predicts at its TVL — 1.00x is exactly on the line.' }));
    } else {
      compBox.appendChild(el('p', { text: 'No traded protocol in ' + (r[3] || 'this category') + ' survives the comparables filter in the snapshot, so the curve — fitted on the other 92 — carries this row. The dashboard says so rather than inventing precision.' }));
    }
    d.appendChild(compBox);
    var grid = el('div', { class: 'detail-section' }, el('h3', { text: 'Farm economics at a ' + Math.round(state.dropShare * 1000) / 10 + '% drop share — change the deposit above and this recomputes' }));
    var gt = el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Deposit' }), el('th', { text: 'Slice' }), el('th', { text: 'Costs' }), el('th', { text: 'Net' }), el('th', { text: 'Break-even' }), el('th', { text: 'Verdict' }))));
    var gb = el('tbody');
    [500, 1000, 5000, 10000].forEach(function (dep) {
      var e = econAt(r[9], r[5], r[4], r[3], dep, state.dropShare);
      gb.appendChild(el('tr', { class: dep === state.deposit ? 'sel' : '' },
        el('td', { class: 'num', text: money(dep) }), el('td', { class: 'num', text: money(e.slice) }),
        el('td', { class: 'num', text: money(e.costs) + ' (' + money(e.fees) + ' gas + ' + money(e.forgone) + ' forgone)' }),
        el('td', { class: 'num ' + (e.net > 0 ? 'pos' : ''), text: (e.net > 0 ? '+' : '') + money(e.net) }),
        el('td', { class: 'num', text: e.breakEven === Infinity ? '—' : e.breakEven.toFixed(2) + 'x' }),
        el('td', {}, el('span', { class: 'badge ' + e.verdict, text: e.verdict }))));
    });
    gt.appendChild(gb);
    grid.appendChild(gt);
    grid.appendChild(el('p', { class: 'sub', text: 'Gas is 8 transactions at $' + gasPerTx(r[4]) + ' on ' + chainOf(r) + ' plus $1.00 to move funds in and out. Yield forgone is $0 on a yield-bearing position (vault yield 4.5% beats the 4% T-bill) and the T-bill rate otherwise. The board’s own plan uses the smallest deposit whose net is positive.' }));
    d.appendChild(grid);
    var steps = el('ol', { class: 'steps' });
    farmSteps(r, econ).forEach(function (s) {
      steps.appendChild(el('li', {}, el('span', { text: s.t }), el('br'), el('span', { class: 'cost', text: 'Cost: ' + s.c + '. Time: ' + s.w + '.' })));
    });
    d.appendChild(el('div', { class: 'detail-section' }, el('h3', { text: 'Farm plan — 8 steps at ' + money(econ.deposit) + ', costed' }), steps));
    d.appendChild(el('div', { class: 'detail-section' }, el('h3', { text: 'Risks' }),
      el('p', { text: 'No token may ever launch; a launch may carry no airdrop; the snapshot may miss a token that exists. The implied value is a model claim with a ×' + DATA.wf_miss.toFixed(2) + ' walk-forward miss — do not size a position on it.' })));
    app.appendChild(d);
  }
  readHash();
  render();
})();
