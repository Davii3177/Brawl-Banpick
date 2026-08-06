# Health report

Generated 2026-08-05T04:02:27.288Z · db `E:\Brawl-Banpick\data\corpus.db`

## ALERTS

- **Suspected-loss polls 21.0% exceed the 5% criterion — intervals too long.**

## 1. Duplication factor (per team size)

| team_size | unique_matches | records | duplication |
|---|---|---|---|
| 3 | 2162 | 2217 | 1.03 |

A 3v3 match is discoverable 6 times, a 5v5 ten times — hence the split. See findings.md #7
for why a low value here is not automatically a fault.

## 2. Throughput

| metric | value |
|---|---|
| Unique ranked matches (total) | 2162 |
| Unique ranked matches (24h) | 2162 |
| Battlelog calls (24h) | 509 |
| **Unique ranked matches per call** | **4.25** |

## 3. Estimated loss

| metric | value |
|---|---|
| Successful polls (24h) | 509 |
| Polls returning >= 22 new battles | 107 |
| Suspected-loss rate | 21.0% (criterion: < 5%) |

## 4. Map x mode coverage

| mode | map_name | n |
|---|---|---|
| knockout | New Horizons | 115 |
| brawlBall | Sneaky Fields | 111 |
| bounty | Layer Cake | 103 |
| bounty | Hideout | 102 |
| brawlBall | Center Stage | 95 |
| gemGrab | Double Swoosh | 91 |
| gemGrab | Hard Rock Mine | 89 |
| brawlBall | Pinball Dreams | 85 |
| gemGrab | Crystal Arcade | 84 |
| heist | Hot Potato | 84 |
| hotZone | Dueling Beetles | 84 |
| hotZone | Ring of Fire | 84 |
| bounty | Shooting Star | 83 |
| bounty | Dry Season | 77 |
| gemGrab | Undermine | 77 |
| hotZone | Open Business | 77 |
| knockout | Out in the Open | 77 |
| heist | Bridge Too Far | 76 |
| gemGrab | Gem Fort | 74 |
| brawlBall | Triple Dribble | 72 |
| gemGrab | Rustic Arcade | 70 |
| knockout | Flaring Phoenix | 66 |
| heist | Safe Zone | 64 |
| heist | Kaboom Canyon | 58 |
| gemGrab | Deathcap Trap | 57 |

### Thin (< 500 matches)

| mode | map_name | n |
|---|---|---|
| hotZone | Parallel Plays | 52 |
| knockout | Belle's Rock | 55 |
| gemGrab | Deathcap Trap | 57 |
| heist | Kaboom Canyon | 58 |
| heist | Safe Zone | 64 |
| knockout | Flaring Phoenix | 66 |
| gemGrab | Rustic Arcade | 70 |
| brawlBall | Triple Dribble | 72 |
| gemGrab | Gem Fort | 74 |
| heist | Bridge Too Far | 76 |
| bounty | Dry Season | 77 |
| gemGrab | Undermine | 77 |
| hotZone | Open Business | 77 |
| knockout | Out in the Open | 77 |
| bounty | Shooting Star | 83 |

## 5. Pool health

| metric | value |
|---|---|
| Active tags | 1344 |
| Parked tags | 0 |
| Total | 1344 |
| Enriched (ranked tier resolved) | 1343 (99.9%) |

### Ranked tier distribution

| tier | n |
|---|---|
| MASTERS III | 1 |
| MASTERS II | 26 |
| MASTERS I | 75 |
| LEGENDARY III | 84 |
| LEGENDARY II | 151 |
| LEGENDARY I | 252 |
| MYTHIC III | 103 |
| MYTHIC II | 126 |
| MYTHIC I | 184 |
| DIAMOND III | 61 |
| DIAMOND II | 62 |
| DIAMOND I | 55 |
| GOLD III | 15 |
| GOLD II | 23 |
| GOLD I | 27 |
| SILVER III | 12 |
| SILVER II | 10 |
| SILVER I | 67 |
| BRONZE I | 3 |

### Budget split (24h)

| endpoint | n |
|---|---|
| players | 1344 |
| battlelog | 509 |
| clubs/members | 24 |
| rankings/clubs | 6 |

## 6. Freshness

Median lag battle_time -> first_seen: **2327.6 min**

## Rejections and errors (24h)

| reason | n |
|---|---|
| flat players array (showdown-style), not a teams battle | 1743 |
| expected 2 teams, got 4 | 1430 |
| expected 2 teams, got 5 | 717 |
| expected 2 teams, got 1 | 1 |

_no data yet_
