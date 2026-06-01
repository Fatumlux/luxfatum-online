$ErrorActionPreference = "Continue"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

$passCount = 0
$warnCount = 0
$failCount = 0

function Pass($Message) {
  $script:passCount++
  Write-Host "PASS $Message"
}

function Warn($Message) {
  $script:warnCount++
  Write-Host "WARN $Message"
}

function Fail($Message) {
  $script:failCount++
  Write-Host "FAIL $Message"
}

function Require-File($Path) {
  if (Test-Path $Path -PathType Leaf) {
    Pass "Found $Path."
  } else {
    Fail "Missing $Path."
  }
}

function Require-Dir($Path) {
  if (Test-Path $Path -PathType Container) {
    Pass "Found $Path/."
  } else {
    Fail "Missing $Path/."
  }
}

function Run-Cmd($Message, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -eq 0) {
    Pass $Message
  } else {
    Fail $Message
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
$staticOnly = $false

if (-not $node) {
  Warn "Node.js was not found. Skipping dependency installation."
  $staticOnly = $true
} elseif (-not $npm) {
  Warn "npm was not found. Skipping dependency installation."
  $staticOnly = $true
} else {
  Pass "Found Node.js $(node --version) and npm $(npm --version)."

  $installExit = 0
  if (Test-Path "package-lock.json" -PathType Leaf) {
    npm ci
    $installExit = $LASTEXITCODE
  } else {
    npm install
    $installExit = $LASTEXITCODE
  }

  if ($installExit -ne 0) {
    Warn "Dependency installation failed. Falling back to available project checks."
    $staticOnly = $true
  } else {
    Pass "Dependencies installed from package manifest."
  }
}

$bash = Get-Command bash -ErrorAction SilentlyContinue
if ($bash) {
  if ($staticOnly) {
    $env:STATIC_ONLY = "1"
  }
  bash tools/check_project.sh
  exit $LASTEXITCODE
}

Warn "Bash was not found. Running PowerShell checks."

Require-File "AGENTS.md"
Require-File "progress.txt"
Require-File "DESIGN_BRIEF.md"
Require-File "ARCHITECTURE.md"
Require-File "DOMAIN_MODEL.md"
Require-File "README.md"
Require-File "package.json"
Require-File "index.html"
Require-File "src/main.tsx"
Require-File "server.js"
Require-File ".codex/setup.sh"
Require-File "tools/bootstrap_linux.sh"
Require-File "tools/bootstrap_windows.ps1"
Require-File "tools/check_project.sh"

Require-Dir "src"
Require-Dir "public"
Require-Dir "scripts"
Require-Dir "tools"
Require-Dir ".codex"

if (Select-String -Path "progress.txt" -Pattern "\[DONE\] STEP_01_PROJECT_CONTRACT_AND_SCAFFOLD" -Quiet) {
  Pass "STEP_01 is marked DONE."
} else {
  Warn "STEP_01 is not marked DONE yet."
}

$firstTodo = Select-String -Path "progress.txt" -Pattern "^\[TODO\]" | Select-Object -First 1
if ($firstTodo) {
  Pass "First TODO is $($firstTodo.Line -replace '^\[TODO\]\s*', '')."
} else {
  Warn "No TODO items found in progress.txt."
}

if ($node -and (Test-Path "server.js" -PathType Leaf)) {
  node --check server.js
  if ($LASTEXITCODE -eq 0) {
    Pass "server.js syntax check."
  } else {
    Fail "server.js syntax check."
  }
}

if ($npm -and (Test-Path "package.json" -PathType Leaf)) {
  if ($staticOnly) {
    Warn "Static-only mode; skipped npm script checks."
  } elseif (Test-Path "node_modules" -PathType Container) {
    Run-Cmd "npm run check." { npm run check --if-present }
    Run-Cmd "npm run typecheck." { npm run typecheck --if-present }
    Run-Cmd "npm run validate:domain." { npm run validate:domain --if-present }
    Run-Cmd "npm run test:rules." { npm run test:rules --if-present }
    Run-Cmd "npm run smoke:ui." { npm run smoke:ui --if-present }
    Run-Cmd "npm run build." { npm run build --if-present }
  } else {
    Warn "node_modules is missing; skipped npm script checks and kept static checks only."
  }
}

Write-Host "SUMMARY PASS=$passCount WARN=$warnCount FAIL=$failCount"

if ($failCount -gt 0) {
  exit 1
}

exit 0
