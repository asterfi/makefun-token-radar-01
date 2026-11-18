// Token Radar, model v2 ("radar-2"): category-fitted implied values, not a flat multiple.
//
// The starter scores every protocol at 0.25 x TVL. That cannot be right: traded
// protocols do not trade at one multiple. This model fits the multiple from the
// snapshot itself, from the protocols whose token already trades, and says how
// badly that fit works, because the fit is the whole claim.
//
// What was fitted (snapshot as_of 2026-11-14, 758 protocols):
//   - 119 non-CEX protocols carry both a TVL and a market cap (mcap_usd). Their
//     FDV/TVL median is 0.246. That is the global fallback.
//   - Per category, the median FDV/TVL, shrunk toward the global median with
//     weight n/(n+10) so a category with one or two comps cannot set the price,
//     then clamped to [0.05, 1.00]. Categories with fewer than 5 comps use the
//     global median. Fitted: Lending 0.178 (n=15), Dexs 0.297 (n=11),
//     Liquid Staking 0.149 (n=9), Yield 0.220 (n=9), RWA 0.260 (n=9),
//     Canonical Bridge 0.637 (n=8), Basis Trading 0.414 (n=7), Bridge 0.524 (n=6).
//   - A log-log regression was tried and rejected: its slope ran to 1.5-1.8, so
//     implied values exploded with size. Medians do not explode.
//   - Out-of-sample (80/20 split, 3 trials, same procedure): median absolute
//     percentage error 84-96%, vs 76-92% for the flat 0.25x starter. The
//     category model does NOT beat the flat multiple on median error — FDV/TVL
//     is that noisy — but it cuts the mean error (196-244% vs 264-314%) by
//     refusing the wildest multiples, and it separates categories the flat
//     model cannot (Liquid Staking 0.15 vs Canonical Bridge 0.64). This is a
//     ranking heuristic with wide error bars, and the dashboard says so.
//   - Launch haircut 0.60: a token that does not exist yet is worth less than
//     an identical traded one. 40% is a stated assumption, not a measurement.
//   - Growth: change_7d clamped to [-60, +120]%, weight 0.5.
//     Maturity: 0.6 + min(age, 1095)/1095 * 0.4, unknown age = 365 days.
//   - implied = TVL x categoryMultiple x growthMult x maturity x 0.60.
//
// No protocol name is special-cased anywhere. The same function scores every
// row, from the snapshot's ten fields only. The program runs with no network.

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

export interface ModelConstants {
  global_multiple: number;
  haircut: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
}

// Fitted constants, from the snapshot's own traded protocols (see header).
export const MODEL: ModelConstants = {
  global_multiple: 0.246,
  haircut: 0.6,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.0,
};

export const MODEL_VERSION = 'radar-2';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;
// Community share and wallet-count assumptions behind the EV illustration.
export const COMMUNITY_SHARE = 0.1;
export const ASSUMED_FARMERS = 50000;

export const CATEGORY_MULTIPLE: Record<string, number> = {
  Lending: 0.178,
  Dexs: 0.297,
  'Liquid Staking': 0.149,
  Yield: 0.22,
  RWA: 0.26,
  'Canonical Bridge': 0.637,
  'Basis Trading': 0.414,
  Bridge: 0.524,
};

export const FIT_NOTE =
  'Category medians shrunk to a 0.246 global median, clamped [0.05, 1.00]; ' +
  'out-of-sample median error 84-96% (flat 0.25x: 76-92%) — wide bars, honest ranking, not a price.';

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

export function categoryMultiple(category: string | null, model: ModelConstants): number {
  const raw = category === null ? model.global_multiple : (CATEGORY_MULTIPLE[category] ?? model.global_multiple);
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw));
}

export function launchChance(growthPct: number, maturityMult: number): number {
  const maturityNorm = (maturityMult - 0.6) / 0.4;
  const growthPos = Math.max(0, growthPct) / 120;
  return Math.min(0.45, Math.max(0.12, 0.12 + 0.28 * maturityNorm + 0.05 * growthPos));
}

export type Verdict = 'FARM' | 'THIN' | 'SKIP';

export function verdictFor(implied: number, growthPct: number, age: number | null): Verdict {
  if (implied >= 25_000_000 && growthPct >= -5 && (age === null || age >= 180)) return 'FARM';
  if (implied >= 5_000_000) return 'THIN';
  return 'SKIP';
}

export interface Scored {
  implied: number;
  multiple: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  chance: number;
  evPerWallet: number;
  verdict: Verdict;
}

export function scoreProtocol(p: SnapshotProtocol, asOf: string, model: ModelConstants): Scored {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const multiple = categoryMultiple(p.category, model);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult * model.haircut));
  const chance = launchChance(growthPct, maturityMult);
  const evPerWallet = Math.round((chance * COMMUNITY_SHARE * implied) / ASSUMED_FARMERS);
  return { implied, multiple, growthPct, growthMult, maturityMult, age, chance, evPerWallet, verdict: verdictFor(implied, growthPct, age) };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
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
  verdict: Verdict;
  launch_chance: number;
  ev_per_wallet_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    haircut: number;
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

// Compact dashboard row: [rank, slug, name, category, chains, tvl, change7d, listed, age, implied, multiple, growthMult, maturityMult, verdict, chance, ev]
export type RadarRow = [number, string, string, string | null, string[], number, number | null, string | null, number | null, number, number, number, number, Verdict, number, number];

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit_note: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

// Six steps, derived from category, chain, TVL and age only. Same function
// runs in main.ts (board.json) and in the dashboard (detail view), so the
// page and the board can never disagree about a plan.
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
  ];
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early rows: rankable pre-token protocols below the floor, by implied value
  // (not by TVL — the starter's TVL sort let a big low-multiple protocol crowd
  // out a smaller high-multiple one). Watchlist rows are never displaced.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, model) }))
    .sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);
  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((x, i) => ({
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
    verdict: x.s.verdict,
    launch_chance: Math.round(x.s.chance * 100) / 100,
    ev_per_wallet_usd: x.s.evPerWallet,
    model: {
      category_multiple: x.s.multiple,
      growth_pct: x.s.growthPct,
      growth_multiplier: Math.round(x.s.growthMult * 1e4) / 1e4,
      maturity_multiplier: Math.round(x.s.maturityMult * 1e4) / 1e4,
      haircut: model.haircut,
      age_days: x.s.age,
    },
    farm_steps: farmSteps(x.p, x.s.age).map(stepText),
  }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

export function radarRow(row: BoardRow): RadarRow {
  return [
    row.rank, row.slug, row.name, row.category, row.chains, row.tvl_usd, row.change_7d, row.listed_at, row.age_days,
    row.implied_value_usd, row.model.category_multiple, row.model.growth_multiplier, row.model.maturity_multiplier,
    row.verdict, row.launch_chance, row.ev_per_wallet_usd,
  ];
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit_note: FIT_NOTE,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
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
