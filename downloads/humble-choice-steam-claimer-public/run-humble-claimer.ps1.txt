param(
  [string]$Url = "",
  [int]$Limit = 20,
  [switch]$Continuous,
  [switch]$DryRun,
  [switch]$GridNavigation,
  [switch]$IncludeClaimed,
  [switch]$KeepSteamOpen,
  [string]$Games = "",
  [string]$GamesFile = "",
  [string]$Profile = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found on PATH. Install Node.js LTS, then run this again."
}
try {
  node --version | Out-Null
} catch {
  throw "Node.js is on PATH, but it could not be executed. Install Node.js LTS from nodejs.org, then open a new PowerShell window."
}

if (-not (Test-Path ".\node_modules\playwright")) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found on PATH. Install Node.js LTS from nodejs.org, then open a new PowerShell window."
  }
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "npx was not found on PATH. Install Node.js LTS from nodejs.org, then open a new PowerShell window."
  }
  Write-Host "Installing Playwright locally in $PSScriptRoot ..."
  npm install
  Write-Host "Installing Playwright Chromium browser ..."
  npx playwright install chromium
}

$nodeArgs = @(".\humble-choice-steam-claimer.mjs", "--limit", "$Limit")

if ($Url) {
  $nodeArgs += @("--url", $Url)
}
if ($Continuous) {
  $nodeArgs += "--continuous"
}
if ($DryRun) {
  $nodeArgs += "--dry-run"
}
if ($GridNavigation) {
  $nodeArgs += "--grid-navigation"
}
if ($IncludeClaimed) {
  $nodeArgs += "--include-claimed"
}
if ($KeepSteamOpen) {
  $nodeArgs += "--keep-steam-open"
}
if ($Games) {
  $nodeArgs += @("--games", $Games)
}
if ($GamesFile) {
  $nodeArgs += @("--games-file", $GamesFile)
}
if ($Profile) {
  $nodeArgs += @("--profile", $Profile)
}

node @nodeArgs
