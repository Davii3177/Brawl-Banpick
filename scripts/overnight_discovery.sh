#!/usr/bin/env bash
# Overnight loop: let the crawler accumulate, re-run the expanded sweep each cycle,
# and keep every report so signals can be watched for stability as volume grows.
# A signal that appears in one cycle and vanishes the next was never real.
set -uo pipefail
cd /e/Brawl-Banpick
LOG="logs/overnight_$(date +%Y%m%d_%H%M%S).log"
CYCLES="${1:-8}"
GAP="${2:-2700}"   # 45 min between cycles

echo "overnight discovery: $CYCLES cycles, ${GAP}s apart -> $LOG" | tee -a "$LOG"
for c in $(seq 1 "$CYCLES"); do
  N=$(node -e "const{Store}=require('./crawler/lib/db');const d=new Store();console.log(d.one('SELECT COUNT(*) n FROM matches WHERE is_ranked=1 AND team_size=3').n);d.close()" 2>/dev/null)
  echo "=== cycle $c/$CYCLES  $(date -u +%H:%M:%SZ)  corpus=$N ===" | tee -a "$LOG"
  node phase3/harness/discover2.js --boot 1200 --tag "c${c}" >> "$LOG" 2>&1 \
    && echo "  cycle $c ok" | tee -a "$LOG" \
    || echo "  cycle $c FAILED (continuing)" | tee -a "$LOG"
  [ "$c" -lt "$CYCLES" ] && sleep "$GAP"
done
echo "=== done $(date -u +%H:%M:%SZ) ===" | tee -a "$LOG"
