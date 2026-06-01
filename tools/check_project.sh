#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS $1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  echo "WARN $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "FAIL $1"
}

run_cmd() {
  label="$1"
  shift
  if "$@"; then
    pass "$label"
  else
    fail "$label"
  fi
}

require_file() {
  if [ -f "$1" ]; then
    pass "Found $1."
  else
    fail "Missing $1."
  fi
}

require_dir() {
  if [ -d "$1" ]; then
    pass "Found $1/."
  else
    fail "Missing $1/."
  fi
}

require_file "AGENTS.md"
require_file "progress.txt"
require_file "DESIGN_BRIEF.md"
require_file "ARCHITECTURE.md"
require_file "DOMAIN_MODEL.md"
require_file "README.md"
require_file "package.json"
require_file "index.html"
require_file "src/main.tsx"
require_file "server.js"
require_file ".codex/setup.sh"
require_file "tools/bootstrap_linux.sh"
require_file "tools/bootstrap_windows.ps1"
require_file "tools/check_project.sh"

require_dir "src"
require_dir "public"
require_dir "scripts"
require_dir "tools"
require_dir ".codex"

if grep -q "\[DONE\] STEP_01_PROJECT_CONTRACT_AND_SCAFFOLD" progress.txt; then
  pass "STEP_01 is marked DONE."
else
  warn "STEP_01 is not marked DONE yet."
fi

FIRST_TODO="$(grep -m1 -E '^\[TODO\]' progress.txt || true)"
if [ -n "$FIRST_TODO" ]; then
  pass "First TODO is ${FIRST_TODO#\[TODO\] }."
else
  warn "No TODO items found in progress.txt."
fi

if command -v node >/dev/null 2>&1; then
  pass "Found Node.js $(node --version)."
else
  warn "Node.js not found; skipping Node-based checks."
fi

if command -v npm >/dev/null 2>&1; then
  pass "Found npm $(npm --version)."
else
  warn "npm not found; skipping npm scripts."
fi

if command -v node >/dev/null 2>&1 && [ -f server.js ]; then
  run_cmd "server.js syntax check." node --check server.js
fi

if command -v npm >/dev/null 2>&1 && [ -f package.json ]; then
  if [ "${STATIC_ONLY:-0}" = "1" ]; then
    warn "STATIC_ONLY=1; skipped npm script checks."
  elif [ -d node_modules ]; then
    run_cmd "npm run check." npm run check --if-present
    run_cmd "npm run typecheck." npm run typecheck --if-present
    run_cmd "npm run validate:domain." npm run validate:domain --if-present
    run_cmd "npm run test:rules." npm run test:rules --if-present
    run_cmd "npm run smoke:ui." npm run smoke:ui --if-present
    run_cmd "npm run build." npm run build --if-present
  else
    warn "node_modules is missing; skipped npm script checks and kept static checks only."
  fi
fi

echo "SUMMARY PASS=$PASS_COUNT WARN=$WARN_COUNT FAIL=$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

exit 0
