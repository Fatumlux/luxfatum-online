#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

if [ -f "tools/bootstrap_linux.sh" ]; then
  exec bash "tools/bootstrap_linux.sh"
fi

echo "FAIL tools/bootstrap_linux.sh is missing."
exit 1
