#!/usr/bin/env bash
# Cancel a pending Phase 3 launch.
#
# Handles both scheduling paths:
#   1. the Windows Task Scheduler one-shot (schtasks) — the primary mechanism
#   2. a detached sleeping launcher recorded in logs/phase3.pid — the fallback
#
# `at`/`atrm` are NOT used: at.exe is deprecated on Windows 11 and returns
# "The binding handle is invalid."
set -uo pipefail

PROJECT_DIR="${PROJECT_DIR:-/e/Brawl-Banpick}"
TASK_NAME="${TASK_NAME:-Phase3FeatureSelection}"
PIDFILE="$PROJECT_DIR/logs/phase3.pid"
found=0

echo "=== scheduled task ==="
# PowerShell cmdlets rather than schtasks.exe: schtasks argument quoting breaks
# on paths containing spaces when invoked through Git Bash.
if powershell -NoProfile -Command "if(Get-ScheduledTask -TaskName '$TASK_NAME' -EA SilentlyContinue){exit 0}else{exit 1}"; then
  powershell -NoProfile -Command "Unregister-ScheduledTask -TaskName '$TASK_NAME' -Confirm:\$false" \
    && { echo "deleted scheduled task '$TASK_NAME'"; found=1; }
else
  echo "no scheduled task named '$TASK_NAME'"
fi

echo "=== detached launcher ==="
if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" && echo "killed sleeping launcher pid $PID" && found=1
  else
    echo "pidfile present but pid $PID is not running (stale)"
  fi
  rm -f "$PIDFILE"
else
  echo "no pidfile at $PIDFILE"
fi

[ "$found" -eq 1 ] && echo "cancelled." || echo "nothing pending to cancel."
