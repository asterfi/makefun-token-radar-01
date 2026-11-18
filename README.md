# Token Radar — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/asterfi/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/asterfi/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that ranks pre-token protocols by implied launch value, from the
sealed DefiLlama snapshot (as_of 2026-11-14, 758 protocols, watchlist 40).

## Model (radar-2)

Not the starter's flat 0.25x TVL. The multiple is fitted per category from the
119 non-CEX protocols whose token already trades: median FDV/TVL per category,
shrunk toward the global median 0.246x with weight n/(n+10), clamped to
[0.05, 1.00]. A 40% launch haircut is applied. Growth (7d, clamped
[-60, +120]%, weight 0.5) and maturity (age, 0.6–1.0) multiply in.

Out-of-sample (80/20, 3 trials): median absolute error 84–96%, vs 76–92%
for the flat starter — the category model does not win on median error, but
it cuts mean error and separates categories. The dashboard states this
plainly; every implied value is a ranking with wide bars, not a price.

## Board

200 rows: all 40 watchlist protocols + 160 early pre-token protocols below
the $50M floor, chosen by implied value (not TVL). Token-bearing protocols
are kept out of the board and shown in a separate Live-token view (top 24 by
market cap). Every row carries 6 costed farm steps and a verdict
(FARM / THIN / SKIP) plus an illustrative EV per wallet (10% community
share, 50,000 assumed farmers — stated assumptions).

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only, no network. `main.ts` reads
`/input/snapshot.json`, writes `board.json`, `data.js`, copies `dashboard/`
and `screenshots/`, and writes `dossier.json` via the vendored kit library.

## Bounty

https://make.fun/bounty/token-radar-01 — $1,325, ends 2026-12-14 10:00 UTC.
