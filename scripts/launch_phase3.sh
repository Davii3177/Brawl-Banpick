#!/usr/bin/env bash
# Delayed, unattended launch of the Phase 3 feature-selection agent.
#
# Two modes:
#   --no-sleep   fire immediately (used by the Task Scheduler entry, which
#                already fires at the absolute time)
#   default      sleep DELAY_SEC first (used for nohup/detached fallback)
#
# --check runs validation only and exits. Run it at creation time: the whole
# point is to fail now rather than in three hours with nobody watching.
set -uo pipefail

PROJECT_DIR="${PROJECT_DIR:-/e/Brawl-Banpick}"
PROMPT_FILE="${PROMPT_FILE:-$PROJECT_DIR/phase3_feature_selection_agent.md}"
DELAY_SEC="${DELAY_SEC:-11160}"          # 3h06m
BUDGET_USD="${BUDGET_USD:-20}"
MAX_TURNS="${MAX_TURNS:-150}"

MODE_SLEEP=1
CHECK_ONLY=0
for a in "$@"; do
  case "$a" in
    --no-sleep) MODE_SLEEP=0 ;;
    --check)    CHECK_ONLY=1; MODE_SLEEP=0 ;;
    --delay=*)  DELAY_SEC="${a#*=}" ;;
  esac
done

cd "$PROJECT_DIR" || { echo "FATAL: cannot cd to $PROJECT_DIR" >&2; exit 1; }
mkdir -p logs scripts

TS="$(date +%Y%m%d_%H%M%S)"
LOG="$PROJECT_DIR/logs/phase3_${TS}.log"
PIDFILE="$PROJECT_DIR/logs/phase3.pid"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }

log "=== phase3 launcher ==="
log "project_dir : $PROJECT_DIR"
log "prompt_file : $PROMPT_FILE"
log "log         : $LOG"
log "budget_usd  : $BUDGET_USD   max_turns: $MAX_TURNS"

# --- Record the intended fire time in ABSOLUTE terms, at creation. ---------
# A human reading this log later must be able to tell whether it fired on
# schedule without doing arithmetic.
if [ "$MODE_SLEEP" -eq 1 ]; then
  FIRE_EPOCH=$(( $(date +%s) + DELAY_SEC ))
  log "delay       : ${DELAY_SEC}s"
  log "SCHEDULED TO FIRE AT : $(date -u -d "@$FIRE_EPOCH" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$FIRE_EPOCH" +%Y-%m-%dT%H:%M:%SZ) (UTC)"
  log "                       $(date -d "@$FIRE_EPOCH" 2>/dev/null || date -r "$FIRE_EPOCH") (local)"
else
  log "mode        : immediate (scheduler fires at the absolute time)"
fi

# --- Validation. Fail loudly, fail NOW. -----------------------------------
fail() { log "VALIDATION FAILED: $*"; log "exiting non-zero without scheduling/running"; exit 2; }

[ -f "$PROMPT_FILE" ] || fail "prompt file not found: $PROMPT_FILE"
[ -s "$PROMPT_FILE" ] || fail "prompt file is empty: $PROMPT_FILE"
log "ok: prompt file present, $(wc -c < "$PROMPT_FILE") bytes"

# Task Scheduler starts with a minimal PATH; npm's global bin is not on it.
export PATH="$PATH:/c/Users/Rayra/AppData/Roaming/npm"

command -v claude >/dev/null 2>&1 || fail "'claude' is not on PATH — install the CLI (npm i -g @anthropic-ai/claude-code) or set it on PATH for the scheduled user"
log "ok: claude at $(command -v claude)  version $(claude --version 2>&1 | head -1)"

# claude auth status exits 0 when logged in.
if ! claude auth status >>"$LOG" 2>&1; then
  fail "'claude auth status' returned non-zero — not authenticated. An unattended run cannot log in."
fi
log "ok: authenticated"

# --- Flag preflight -------------------------------------------------------
# An unknown flag exits 1 immediately. Verified empirically: --max-turns does
# NOT exist in 2.1.221 and would have killed the run three hours from now.
# Check every flag we intend to pass against --help before committing.
HELP="$(claude --help 2>&1)"
for f in --permission-mode --allowedTools --max-budget-usd --output-format --verbose; do
  echo "$HELP" | grep -q -- "$f" || fail "flag $f not supported by claude $(claude --version 2>&1 | head -1) — invocation would exit 1"
done
log "ok: all flags supported"

# --- Auth smoke test ------------------------------------------------------
# 'auth status' can report loggedIn while an actual -p invocation still fails.
# Verified empirically: with --bare, this build reports "Not logged in" and
# exits 1 even though auth status says otherwise. Prove the real path works.
SMOKE="$(timeout 90 claude -p "reply with the single word OK" \
          --permission-mode dontAsk --output-format text 2>&1 | tail -1)"
case "$SMOKE" in
  *OK*) log "ok: live invocation smoke test passed" ;;
  *)    fail "live invocation failed (got: ${SMOKE:-<empty>}) — auth status is not sufficient proof" ;;
esac

if [ "$CHECK_ONLY" -eq 1 ]; then
  log "--check passed; all preconditions satisfied"
  exit 0
fi

# --- Wait, if this invocation owns the delay. -----------------------------
if [ "$MODE_SLEEP" -eq 1 ]; then
  echo $$ > "$PIDFILE"
  log "pid $$ written to $PIDFILE; sleeping ${DELAY_SEC}s"
  sleep "$DELAY_SEC"
  log "woke; starting agent"
fi

# --- Invoke. --------------------------------------------------------------
log "--- agent start ---"
set -o pipefail
# Two flags from the original spec are deliberately NOT passed, both verified
# empirically against claude 2.1.221 on this machine:
#
#   --bare       breaks authentication. With authMethod=claude.ai this build
#                reports "Not logged in · Please run /login" and exits 1, while
#                the identical call without --bare succeeds. Its reproducibility
#                benefit is near zero here anyway: the repo has no CLAUDE.md,
#                no .claude/, and no MCP config for it to suppress.
#   --max-turns  does not exist in this version. Unknown flags exit 1, so this
#                alone would have killed the run at T+3h06m.
#
# --max-budget-usd survives and is the real runaway guard.
claude -p "$(cat "$PROMPT_FILE")" \
  --permission-mode dontAsk \
  --allowedTools "Read,Write,Edit,Bash,WebSearch,WebFetch" \
  --max-budget-usd "$BUDGET_USD" \
  --output-format stream-json --verbose \
  2>&1 | tee -a "$LOG"
STATUS=${PIPESTATUS[0]}

log "--- agent end ---"
log "EXIT STATUS: $STATUS"
rm -f "$PIDFILE"
exit "$STATUS"
