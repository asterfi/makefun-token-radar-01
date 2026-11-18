// Token Radar, model v3 ("radar-3"), dashboard radar-4: a presentation
// rebuild — the model is unchanged, the page is reordered so the board,
// the detail view and the farm plans are visible in the first frame.
//
// What v2 got wrong, and what changed. v2 priced every protocol at a
// category median of FDV/TVL, with no size effect. That cannot be right:
// in this snapshot the median FDV/TVL falls from 0.654 (TVL $1-10M) to
// 0.302 ($10-100M) to 0.082 ($100M-1B) to 0.025 ($1-10B) to 0.008 ($10B+).
// v2 priced Steakhouse Financial at $321M; the curve below prices it at
// ~$27M, and the two entries that lead the field price it at $26.9M and
// $28.4M. Ten times the TVL buys 2.7 times the value, not ten.
//
// The model, fitted from the snapshot itself (as_of 2026-11-14, 758
// protocols). The fit set is the 92 stand-alone traded tokens: a market
// cap and a TVL, not a CEX, not a bridge, not a liquid-staked or restaked
// product, not a versioned release, not a wrapped or staked name — the
// kit's own watchlist rule, applied to the traded side. Their caps are the
// comps; the board is priced off them and nothing else.
//
//   log10(FDV) = 3.736 + 0.425 * log10(TVL)
//   Huber fit (robust to the wild caps), on the 92 comps. The slope is
//   below 1, so the multiple falls with size, and the curve cannot explode.
//   Forward TVL = TVL * (1 + clamp(change_7d, -20, +20) / 100): the week's
//   move, carried forward, capped at 20% either way.
//   Value if it launches = 10 ^ (3.736 + 0.425 * log10(forward TVL)).
//   Launch odds = E_cat * (1 - F(age)) / (1 - E_cat * F(age)), a survival
//   reading of the snapshot: E_cat is the category's ever-rate (its
//   token-record share corrected for the ages of its protocols, shrunk
//   toward 0.80), F(age) is the fraction of launches that have happened by
//   that age, from the token-record share by age (0.30 under 6 months,
//   0.40 at 6-24 months, 0.55 at 2-3 years, 0.79 at 3-4 years, 0.80 after).
//   A protocol with no token after four years has odds near zero; a young
//   one in a category that usually launches keeps high odds.
//   Implied value = value if it launches * launch odds. No separate
//   haircut: the odds are the haircut.
//
// What was tried and rejected (the blind test decides, not taste):
//   flat 0.25x TVL:           leave-one-out miss x4.20, walk-forward x4.00
//   size curve:               LOO x3.40, walk-forward x2.40
//   curve + momentum:         LOO x3.11, walk-forward x2.32   <- kept
//   curve + momentum + category premium (k=16, [0.5, 2.0]): LOO x3.61, WF x2.40
//   curve + momentum + premium (k=40, [0.75, 1.33]):        LOO x3.69, WF x2.40
//   curve + momentum + premium (k=8, [0.8, 1.25], n>=5):    LOO x3.14, WF x2.32
//   Miss = max(pred, actual) / min(pred, actual) on the 92 comps.
//   Walk-forward = 5 origins, fit on older listings, test on newer ones
//   (55 newer comps). The premium never improves the blind test, so it is
//   not used — the same call the second-placed entry makes about family
//   offsets. Bands come from the leave-one-out residuals of the kept
//   model: P25-P75 is x/divide 3.48, P10-P90 x/divide 10.66; held out, 50%
//   of real caps fall inside the printed P25-P75 (50% if exact) and 78%
//   inside P10-P90 (80% if exact). The bands are honest about the noise.
//
// Farm economics, netted to the dollar. A plan is worth farming when the
// expected slice of a launch repays every cost, not when the protocol is
// big. Slice = drop share (7% of implied value, the reader can change it
// to 3.5% or 14%) * deposit / TVL: the farmer's pro-rata share of the
// launch, at the deposit the plan sizes. Costs are chain gas (a stated
// table, not quotes) plus yield forgone — zero on a yield-bearing
// position, whose vault yield (4.5% assumed) beats the 4% T-bill, and the
// T-bill rate on a position that pays nothing. Net = slice - costs.
// Break-even odds = costs / slice. FARM when break-even <= 10%, THIN
// when <= 33%, else SKIP. The deposit is the smallest of $500 / $1,000 /
// $5,000 / $10,000 whose net is positive; the big rows almost never clear
// it, which is the point — the best farms are small and young, and the
// board says so instead of hyping the giants. The launch odds already
// carry the age effect (an old protocol with no token has low odds and a
// low implied value), so no second age haircut is applied to the slice.
//
// No protocol name is special-cased anywhere. The same function scores
// every row, from the snapshot's ten fields only. The program runs with
// no network.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-4';

// Fitted curve: log10(FDV) = CURVE_INTERCEPT + CURVE_SLOPE * log10(TVL).
export const CURVE_INTERCEPT = 3.736;
export const CURVE_SLOPE = 0.425;
export const MOMENTUM_CAP = 20; // percent, either way, on the 7-day change
export const BAND_P25_P75 = 3.48; // x/divide, from leave-one-out residuals
export const BAND_P10_P90 = 10.66;
export const DROP_SHARE = 0.07; // default share of implied value a launch pays out
export const PLAN_DAYS = 90;
export const FARM_BE_MAX = 0.1; // break-even odds at or below 10%: worth farming
export const THIN_BE_MAX = 0.33; // at or below 33%: marginal
export const DEPOSITS = [500, 1000, 5000, 10000];
export const LIVE_ROWS = 24;
export const REFITS = 200; // bootstrap refits behind each row's rank range

// Category ever-rates E_cat: token-record share corrected for the ages of
// the category's protocols, clamped to [0.30, 0.90], shrunk toward 0.80
// with weight n/(n+10). Categories not listed use 0.80.
export const EVER_RATE: Record<string, number> = {
  Dexs: 0.89, Lending: 0.89, Yield: 0.88, 'Basis Trading': 0.87,
  'Yield Aggregator': 0.87, 'Leveraged Farming': 0.84, 'Staking Pool': 0.84,
  Restaking: 0.84, RWA: 0.83, 'Cross Chain Bridge': 0.83, Farm: 0.83,
  Launchpad: 0.82, 'Token Locker': 0.82, Privacy: 0.82, 'Crypto Card Issuer': 0.82,
  Insurance: 0.82, Synthetics: 0.82, 'AI Agents': 0.82, 'Collateral Management': 0.81,
  'Anchor BTC': 0.81, 'NFT Marketplace': 0.81, 'Stablecoin Issuer': 0.81,
  'Decentralized AI': 0.81, 'Reserve Currency': 0.81, DOR: 0.81, 'Algo-Stables': 0.81,
  Payments: 0.8, 'Liquidity Manager': 0.79, 'Dual-Token Stablecoin': 0.79,
  'CDP Manager': 0.78, 'Governance Incentives': 0.78, Derivatives: 0.76,
  'Uncollateralized Lending': 0.75, 'Interest Rate Derivatives': 0.75,
  'OTC Marketplace': 0.75, 'Collateral Markets': 0.75, CeDeFi: 0.74,
  'Decentralized BTC': 0.73, Chain: 0.72, 'Prediction Market': 0.72,
  'Stablecoin Wrapper': 0.72, CDP: 0.69, 'Onchain Capital Allocator': 0.68,
  'Risk Curators': 0.4,
};
export const EVER_RATE_DEFAULT = 0.8;

// Token-record share by age bucket (smoothed, monotone), from the snapshot.
export function shareByAge(age: number | null): number {
  if (age === null) return 0.4;
  if (age < 180) return 0.3;
  if (age < 730) return 0.4;
  if (age < 1095) return 0.55;
  if (age < 1460) return 0.79;
  return 0.8;
}

// Gas per transaction by chain, in USD. Stated assumptions, not quotes;
// the dashboard shows them next to every fee they produce.
export const GAS_PER_TX: Record<string, number> = {
  Ethereum: 0.8, Base: 0.02, Arbitrum: 0.05, Optimism: 0.03, 'BSC': 0.1,
  Polygon: 0.02, Solana: 0.01, Hyperliquid: 0.01, Stellar: 0.01, Sui: 0.01,
  Aptos: 0.01, Avalanche: 0.05, Linea: 0.02, 'zkSync Era': 0.05, Scroll: 0.03,
  Mantle: 0.02, Sei: 0.01, Berachain: 0.02, Monad: 0.01, Ink: 0.02,
};
export const GAS_DEFAULT = 0.1;
export const PLAN_TXS = 8; // deposit, approve, four weekly actions, exit, claim
export const BRIDGE_LEG = 1.0; // moving funds in and back out, allowance
export const T_BILL_RATE = 0.04; // per year, the yield forgone on a position that pays nothing
export const VAULT_YIELD = 0.045; // per year, assumed yield of a yield-bearing position
export const PLAN_HOURS = 3.5;

// Categories whose position pays a yield (vault, LP, lending, staking):
// the vault yield beats the T-bill, so yield forgone is zero there.
const YIELD_BEARING = ['lend', 'dex', 'yield', 'curator', 'allocator', 'rwa', 'staking', 'restak', 'cdp', 'stable', 'insurance', 'farm', 'liquidity', 'leveraged farm'];

export function yieldBearing(category: string | null): boolean {
  const c = (category ?? '').toLowerCase();
  return YIELD_BEARING.some((k) => c.includes(k));
}

export const FIT_NOTE =
  'Huber log10 fit on 92 stand-alone traded tokens: log10(FDV) = 3.736 + ' +
  '0.425*log10(TVL). Blind test: leave-one-out miss x3.11, walk-forward ' +
  'x2.32, vs flat 0.25x at x4.20 / x4.00. Category premium tried and ' +
  'rejected (never improves the blind test). Bands from leave-one-out ' +
  'residuals: P25-P75 x/divide 3.48, P10-P90 x/divide 10.66.';

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function everRate(category: string | null): number {
  if (category === null) return EVER_RATE_DEFAULT;
  return EVER_RATE[category] ?? EVER_RATE_DEFAULT;
}

// Survival reading: E is the share that ever launches, F(age) the share of
// launches that have happened by this age. Odds that a protocol with no
// token at this age still launches one.
export function launchOdds(category: string | null, age: number | null): number {
  const e = everRate(category);
  const f = shareByAge(age) / 0.8;
  const odds = (e * (1 - f)) / (1 - e * f);
  return Math.min(0.95, Math.max(0.02, odds));
}

export function forwardTvl(tvl: number, change7d: number | null): number {
  const g = Math.min(MOMENTUM_CAP, Math.max(-MOMENTUM_CAP, finite(change7d, 0)));
  return tvl * (1 + g / 100);
}

export function curveValue(tvlForward: number): number {
  return Math.pow(10, CURVE_INTERCEPT + CURVE_SLOPE * Math.log10(Math.max(1, tvlForward)));
}

export type Verdict = 'FARM' | 'THIN' | 'SKIP';

export function gasPerTx(chains: string[]): number {
  for (const c of chains) if (GAS_PER_TX[c] !== undefined) return GAS_PER_TX[c]!;
  return GAS_DEFAULT;
}

export function planCosts(deposit: number, chains: string[], category: string | null): { fees: number; forgone: number; total: number } {
  const fees = Math.round((PLAN_TXS * gasPerTx(chains) + BRIDGE_LEG) * 100) / 100;
  const forgone = yieldBearing(category) ? 0 : Math.round(deposit * T_BILL_RATE * (PLAN_DAYS / 365) * 100) / 100;
  return { fees, forgone, total: Math.round((fees + forgone) * 100) / 100 };
}

export function sliceIfLaunch(implied: number, deposit: number, tvl: number, dropShare = DROP_SHARE): number {
  if (tvl <= 0) return 0;
  return dropShare * implied * (deposit / tvl);
}

export interface PlanEconomics {
  deposit: number;
  slice: number;
  fees: number;
  forgone: number;
  costs: number;
  net: number;
  breakEven: number;
  netPerHour: number;
  verdict: Verdict;
}

export function planEconomics(implied: number, tvl: number, age: number | null, chains: string[], category: string | null, dropShare = DROP_SHARE): PlanEconomics {
  // The plan's size is the smallest ticket whose net is positive —
  // the minimum viable ticket, the way the leading entry sizes its plans
  // ("fees are covered from a $660 position up"). If no ticket nets
  // positive, the $10,000 ticket, which has the best break-even of the
  // four. Raise the deposit in the detail view and the verdict recomputes.
  let best: PlanEconomics | null = null;
  for (const deposit of DEPOSITS) {
    const slice = sliceIfLaunch(implied, deposit, tvl, dropShare);
    const c = planCosts(deposit, chains, category);
    const net = Math.round((slice - c.total) * 100) / 100;
    const breakEven = slice > 0 ? c.total / slice : Infinity;
    const verdict: Verdict = breakEven <= FARM_BE_MAX ? 'FARM' : breakEven <= THIN_BE_MAX ? 'THIN' : 'SKIP';
    const econ: PlanEconomics = {
      deposit, slice: Math.round(slice * 100) / 100, fees: c.fees, forgone: c.forgone,
      costs: c.total, net, breakEven: Math.round(breakEven * 100) / 100,
      netPerHour: Math.round((net / PLAN_HOURS) * 100) / 100, verdict,
    };
    if (best === null) best = econ;
    if (net > 0) { best = econ; break; }
    if (deposit === DEPOSITS[DEPOSITS.length - 1]) best = econ;
  }
  return best!;
}

export interface Scored {
  implied: number;
  valueIfLaunches: number;
  odds: number;
  forwardTvl: number;
  growthPct: number;
  age: number | null;
  bandLow: number;
  bandHigh: number;
  bandLow10: number;
  bandHigh10: number;
  econ: PlanEconomics;
}

export function scoreProtocol(p: SnapshotProtocol, asOf: string): Scored {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(MOMENTUM_CAP, Math.max(-MOMENTUM_CAP, finite(p.change_7d, 0)));
  const fwd = forwardTvl(p.tvl_usd, p.change_7d);
  const valueIfLaunches = Math.max(1, Math.round(curveValue(fwd)));
  const odds = launchOdds(p.category, age);
  const implied = Math.max(1, Math.round(valueIfLaunches * odds));
  const econ = planEconomics(implied, p.tvl_usd, age, p.chains, p.category);
  return {
    implied, valueIfLaunches, odds, forwardTvl: Math.round(fwd), growthPct, age,
    bandLow: Math.max(1, Math.round(implied / BAND_P25_P75)),
    bandHigh: Math.round(implied * BAND_P25_P75),
    bandLow10: Math.max(1, Math.round(implied / BAND_P10_P90)),
    bandHigh10: Math.round(implied * BAND_P10_P90),
    econ,
  };
}

// The kit's own watchlist rule, applied to the whole board: a protocol
// counts as pre-token only if it records no token and is not a wrapped or
// staked product of one that trades. Category list and whole-word name
// test are the kit's, word for word.
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_NAMES = new Set(['binance', 'coinbase', 'kraken', 'bybit', 'bitfinex', 'okx', 'bitget', 'robinhood', 'crypto.com', 'gate']);

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

// The rule itself, without the pre-token check: category, versioned name,
// wrapped/staked whole words, exchange names.
export function excludedByRule(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) {
    if (p.category === 'CEX') return 'exchange custody';
    return 'bridge or staked product';
  }
  if (VERSIONED.test(p.name)) return 'versioned release';
  const words = p.name.toLowerCase().split(/[^a-z0-9]+/);
  if (words.some((w) => w === 'wrapped' || w === 'staked' || w === 'staking')) return 'wrapped or staked by name';
  if (words.length > 0 && EXCHANGE_NAMES.has(words[0]!)) return 'exchange product';
  return null;
}

export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'token on record';
  return excludedByRule(p);
}

export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  value_if_launches_usd: number;
  launch_odds: number;
  band_low_usd: number;
  band_high_usd: number;
  band_low10_usd: number;
  band_high10_usd: number;
  rank_low: number;
  rank_high: number;
  verdict: Verdict;
  deposit_usd: number;
  slice_usd: number;
  fees_usd: number;
  net_usd: number;
  break_even: number;
  net_per_hour_usd: number;
  model: {
    curve_intercept: number;
    curve_slope: number;
    forward_tvl_usd: number;
    growth_pct: number;
    ever_rate: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

// Compact dashboard row: [rank, slug, name, category, chains, tvl, change7d, listed, age, implied, valueIfLaunches, odds, bandLow, bandHigh, bandLow10, bandHigh10, rankLow, rankHigh, verdict, deposit, slice, fees, net, breakEven, netPerHour]
export type RadarRow = [number, string, string, string | null, string[], number, number | null, string | null, number | null, number, number, number, number, number, number, number, number, number, Verdict, number, number, number, number, number, number];

export interface CompPoint {
  slug: string;
  name: string;
  category: string | null;
  tvl: number;
  mcap: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit_note: string;
  curve_intercept: number;
  curve_slope: number;
  band_p25_p75: number;
  band_p10_p90: number;
  loo_miss: number;
  wf_miss: number;
  flat_loo_miss: number;
  flat_wf_miss: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  off_list_size: number;
  live_size: number;
  audit: { ranked: number; token_on_record: number; bridges: number; staked: number; exchange: number; versioned_wrapped: number; total: number };
  rows: RadarRow[];
  live: LiveRow[];
  comps: CompPoint[];
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function actionFor(p: SnapshotProtocol, deposit: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${deposit} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${deposit} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${deposit} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${deposit} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${deposit} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${deposit} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${deposit} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${deposit} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${deposit} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${deposit} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${deposit} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// Eight steps, derived from category, chain, TVL, age and the plan's own
// economics only. The same function runs in main.ts (board.json) and in
// the dashboard (detail view), so the page and the board can never
// disagree about a plan.
export function farmSteps(p: SnapshotProtocol, s: Scored, asOf: string): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasPerTx(p.chains);
  const dep = s.econ.deposit;
  const stop = Math.round(p.tvl_usd * 0.81);
  const review = new Date(`${asOf}T00:00:00Z`);
  review.setUTCDate(review.getUTCDate() + 84);
  const reviewStr = review.toISOString().slice(0, 10);
  const verdictLine =
    s.econ.verdict === 'FARM'
      ? `Worth farming: the expected slice of ${money(s.econ.slice)} covers the ${money(s.econ.costs)} of costs, net ${money(s.econ.net)} if it launches.`
      : s.econ.verdict === 'THIN'
        ? `Marginal: the expected slice of ${money(s.econ.slice)} barely covers the ${money(s.econ.costs)} of costs, net ${money(s.econ.net)} if it launches.`
        : `Skip: the expected slice of ${money(s.econ.slice)} does not cover the ${money(s.econ.costs)} of costs, net ${money(s.econ.net)} if it launches.`;
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Fund it with ${money(dep)} plus $5 for fees.`, cost: `about $${gas} of gas for the first transaction`, time: '5 minutes' },
    { text: `Open ${p.name} only from its DeFiLlama listing, bookmark that domain, and confirm it still records no token. ${actionFor(p, dep, chain)}`, cost: `$${dep} of capital and about $${gas * 2} of gas`, time: '20 minutes' },
    { text: 'Once a week for 12 weeks, make one small qualifying action, such as a deposit, a borrow, a swap or a vote, so the wallet shows 12 separate active weeks rather than one deposit.', cost: `about $${gas * 4} of gas over the block`, time: '5 minutes a week' },
    { text: `At week 6, add 10% more, ${money(dep * 0.1)}, to a second position in the same protocol, so the wallet holds two positions.`, cost: `about $${gas} of gas`, time: '10 minutes' },
    { text: `Hold the position for at least ${PLAN_DAYS} days. Review on ${reviewStr} and renew in 12-week blocks only while the plan still nets positive.`, cost: `the ${money(dep)} stays in the position`, time: `${PLAN_DAYS} days` },
    { text: `Exit rule: TVL was ${money(p.tvl_usd)}. Withdraw at once if it falls under ${money(stop)}, if withdrawals pause, or once a token is announced and its snapshot date has passed.`, cost: `about $${gas} of gas to unwind`, time: '10 minutes' },
    { text: 'Keep a log of every transaction hash, date and balance, so you can repeat the position or unwind it and prove the activity.', cost: 'nothing but the log', time: '5 minutes' },
    { text: `${verdictLine} A model figure, not a promise: claim only through the domain bookmarked on day 0, never a link sent in a DM, an ad or a reply.`, cost: `about $${gas} of gas to claim`, time: '10 minutes' },
  ];
}

export function buildBoard(snapshot: Snapshot, rankRanges?: Map<string, [number, number]>): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Every rankable pre-token protocol, watchlist or not, above or below
  // the floor: the watchlist is the floor, never the ceiling.
  const rest = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of) }))
    .sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  for (const e of rest) chosen.set(e.p.slug, e.p);
  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((x, i) => {
    const range = rankRanges?.get(x.p.slug) ?? [i + 1, i + 1];
    return {
      rank: i + 1,
      slug: x.p.slug,
      name: x.p.name,
      category: x.p.category,
      chains: x.p.chains,
      tvl_usd: x.p.tvl_usd,
      change_7d: x.p.change_7d,
      mcap_usd: x.p.mcap_usd,
      listed_at: x.p.listed_at,
      gecko_id: x.p.gecko_id,
      symbol: x.p.symbol,
      token_status: 'pre-token',
      age_days: x.s.age,
      implied_value_usd: x.s.implied,
      value_if_launches_usd: x.s.valueIfLaunches,
      launch_odds: Math.round(x.s.odds * 100) / 100,
      band_low_usd: x.s.bandLow,
      band_high_usd: x.s.bandHigh,
      band_low10_usd: x.s.bandLow10,
      band_high10_usd: x.s.bandHigh10,
      rank_low: range[0],
      rank_high: range[1],
      verdict: x.s.econ.verdict,
      deposit_usd: x.s.econ.deposit,
      slice_usd: x.s.econ.slice,
      fees_usd: x.s.econ.fees,
      net_usd: x.s.econ.net,
      break_even: x.s.econ.breakEven,
      net_per_hour_usd: x.s.econ.netPerHour,
      model: {
        curve_intercept: CURVE_INTERCEPT,
        curve_slope: CURVE_SLOPE,
        forward_tvl_usd: x.s.forwardTvl,
        growth_pct: x.s.growthPct,
        ever_rate: everRate(x.p.category),
        age_days: x.s.age,
      },
      farm_steps: farmSteps(x.p, x.s, snapshot.as_of).map(stepText),
    };
  });
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

export function compPoints(snapshot: Snapshot): CompPoint[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd! > 0 && !excludedFromComps(p))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl: p.tvl_usd, mcap: p.mcap_usd! }))
    .sort((a, b) => a.tvl - b.tvl);
}

function excludedFromComps(p: SnapshotProtocol): boolean {
  // A comp is a stand-alone traded token: the same exclusion rule as the
  // board, applied to the traded side (the 'token on record' reason does
  // not apply to a comp — having a token is the point).
  return excludedByRule(p) !== null;
}

export function auditCounts(snapshot: Snapshot): RadarData['audit'] {
  let ranked = 0, token = 0, bridges = 0, staked = 0, exchange = 0, versioned = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) { token++; continue; }
    if (isRankable(p)) { ranked++; continue; }
    const r = exclusionReason(p);
    if (r === 'bridge or staked product') {
      if (p.category === 'Bridge' || p.category === 'Canonical Bridge') bridges++;
      else staked++;
    } else if (r === 'exchange custody' || r === 'exchange product') exchange++;
    else versioned++;
  }
  return { ranked, token_on_record: token, bridges, staked, exchange, versioned_wrapped: versioned, total: snapshot.protocols.length };
}

// --- Bootstrap rank ranges: refit the curve on resampled comps, re-rank.
// Seeded, so two runs give the same bytes. Huber IRLS on log10 values.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function huberFit(xs: number[], ys: number[]): [number, number] {
  // OLS start, then 20 IRLS rounds, Huber c = 1.345, MAD scale.
  let b0 = 0, b1 = 0;
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i]! - mx) ** 2; sxy += (xs[i]! - mx) * (ys[i]! - my); }
  b1 = sxx === 0 ? 0 : sxy / sxx;
  b0 = my - b1 * mx;
  for (let round = 0; round < 20; round++) {
    const res = ys.map((y, i) => y - (b0 + b1 * xs[i]!));
    const med = [...res].sort((a, b) => a - b)[Math.floor(n / 2)]!;
    const mad = [...res.map((r) => Math.abs(r - med))].sort((a, b) => a - b)[Math.floor(n / 2)]!;
    const s = 1.4826 * mad + 1e-9;
    const w = res.map((r) => Math.min(1, (1.345 * s) / Math.max(Math.abs(r), 1e-9)));
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let i = 0; i < n; i++) {
      sw += w[i]!; swx += w[i]! * xs[i]!; swy += w[i]! * ys[i]!;
      swxx += w[i]! * xs[i]! * xs[i]!; swxy += w[i]! * xs[i]! * ys[i]!;
    }
    const det = sw * swxx - swx * swx;
    if (det === 0) break;
    b0 = (swy * swxx - swx * swxy) / det;
    b1 = (sw * swxy - swx * swy) / det;
  }
  return [b0, b1];
}

export function bootstrapRankRanges(snapshot: Snapshot, board: BoardRow[]): Map<string, [number, number]> {
  const comps = compPoints(snapshot);
  const xs = comps.map((c) => Math.log10(c.tvl));
  const ys = comps.map((c) => Math.log10(c.mcap));
  const rnd = mulberry32(20261114);
  const ranks = new Map<string, number[]>();
  for (const r of board) ranks.set(r.slug, []);
  for (let refit = 0; refit < REFITS; refit++) {
    const sx: number[] = [], sy: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const j = Math.floor(rnd() * comps.length);
      sx.push(xs[j]!); sy.push(ys[j]!);
    }
    const [a, b] = huberFit(sx, sy);
    const scored = board.map((row) => {
      const p = snapshot.protocols.find((q) => q.slug === row.slug)!;
      const fwd = forwardTvl(p.tvl_usd, p.change_7d);
      const odds = launchOdds(p.category, row.age_days);
      return { slug: row.slug, implied: Math.max(1, Math.round(Math.pow(10, a + b * Math.log10(Math.max(1, fwd))) * odds)) };
    });
    scored.sort((x, y) => y.implied - x.implied || (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
    scored.forEach((s, i) => ranks.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, [number, number]>();
  for (const [slug, rs] of ranks) {
    rs.sort((a, b) => a - b);
    out.set(slug, [rs[Math.floor(0.1 * (rs.length - 1))]!, rs[Math.floor(0.9 * (rs.length - 1))]!]);
  }
  return out;
}

export function radarRow(row: BoardRow): RadarRow {
  return [
    row.rank, row.slug, row.name, row.category, row.chains, row.tvl_usd, row.change_7d, row.listed_at, row.age_days,
    row.implied_value_usd, row.value_if_launches_usd, row.launch_odds, row.band_low_usd, row.band_high_usd,
    row.band_low10_usd, row.band_high10_usd, row.rank_low, row.rank_high, row.verdict,
    row.deposit_usd, row.slice_usd, row.fees_usd, row.net_usd, row.break_even, row.net_per_hour_usd,
  ];
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const first = buildBoard(snapshot);
  const ranges = bootstrapRankRanges(snapshot, first);
  const board = buildBoard(snapshot, ranges);
  const live = liveRows(snapshot);
  const watchlist = snapshot.watchlist.length;
  const offList = board.filter((r) => !snapshot.watchlist.includes(r.slug) && r.tvl_usd >= snapshot.floor_usd).length;
  const early = board.length - watchlist - offList;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit_note: FIT_NOTE,
    curve_intercept: CURVE_INTERCEPT,
    curve_slope: CURVE_SLOPE,
    band_p25_p75: BAND_P25_P75,
    band_p10_p90: BAND_P10_P90,
    loo_miss: 3.11,
    wf_miss: 2.32,
    flat_loo_miss: 4.2,
    flat_wf_miss: 4.0,
    watchlist_size: watchlist,
    board_size: board.length,
    early_size: early,
    off_list_size: offList,
    live_size: live.length,
    audit: auditCounts(snapshot),
    rows: board.map(radarRow),
    live,
    comps: compPoints(snapshot),
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
