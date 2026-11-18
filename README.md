# Token Radar — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/asterfi/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/asterfi/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that ranks pre-token protocols by implied launch value, from the
sealed DefiLlama snapshot (as_of 2026-11-14, 758 protocols, watchlist 40).

## Model (radar-3)

Not the starter's flat 0.25x TVL. Implied value is fitted from the 92
stand-alone traded tokens in the snapshot: a Huber log10 regression,
log10(FDV) = 3.736 + 0.425 × log10(forward TVL), where forward TVL applies
the 7-day change capped at ±20%. Size is the whole story — median FDV/TVL
falls from 0.65x at $1–10M TVL to 0.008x above $10B, which a flat multiple
cannot see. Implied value = curve value × launch odds, where odds are a
survival reading from the category ever-rate and the token-record share by
age. A category premium was tried with every shrinkage weight and rejected:
it never improves the blind test.

Blind-tested, honestly: leave-one-out miss ×3.11 and walk-forward miss
×2.32 (fit on older listings, test on newer ones), vs the flat starter at
×4.20 / ×4.00. Bands come from leave-one-out residuals: P25–P75 ×/÷ 3.48,
P10–P90 ×/÷ 10.66, holding 50% / 78% of actuals. Rank ranges come from 200
bootstrap refits of the curve. Every implied value is a ranking with wide
bars, not a price — the dashboard states this plainly.

## Board

198 rows: all 40 watchlist protocols + 158 off-list pre-token protocols,
ranked by implied value. The watchlist is the floor, never the ceiling.
Only stand-alone pre-token protocols can be ranked: 416 token-bearing
protocols, 43 bridges, 43 liquid staking / restaking, 42 exchange-custody
and 16 versioned / wrapped products are set aside by rule and shown in the
audit bar; the 24 live tokens are shown in a separate Live-token view.
Verdicts are FARM 14 / THIN 64 / SKIP 120, from deposit-sized farm plans:
slice = 7% drop share × implied value × deposit / TVL, less chain gas and
yield forgone, with FARM at break-even ≤ 10% and THIN at ≤ 33%. Every row
carries 8 costed farm steps with an exit rule and a review date.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only, no network. `main.ts` reads
`/input/snapshot.json`, writes `board.json`, `data.js`, copies `dashboard/`
and `screenshots/`, and writes `dossier.json` via the vendored kit library.

## Bounty

https://make.fun/bounty/token-radar-01 — $1,325, ends 2026-12-14 10:00 UTC.
