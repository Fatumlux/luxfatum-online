#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

warn() {
  echo "WARN $1"
}

pass() {
  echo "PASS $1"
}

if ! command -v node >/dev/null 2>&1; then
  warn "Node.js was not found. Skipping dependency installation and running static checks only."
  bash tools/check_project.sh
  exit $?
fi

if ! command -v npm >/dev/null 2>&1; then
  warn "npm was not found. Skipping dependency installation and running static checks only."
  bash tools/check_project.sh
  exit $?
fi

pass "Found Node.js $(node --version) and npm $(npm --version)."

install_status=0
if [ -f package-lock.json ]; then
  npm ci || install_status=$?
else
  npm install || install_status=$?
fi

if [ "$install_status" -ne 0 ]; then
  warn "Dependency installation failed. Falling back to available project checks."
  export STATIC_ONLY=1
else
  pass "Dependencies installed from package manifest."
fi

chmod +x tools/check_project.sh 2>/dev/null || true
bash tools/check_project.sh
