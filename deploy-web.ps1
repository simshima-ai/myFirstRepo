param(
  [string]$Message = "Deploy web updates",
  [switch]$NoPush,
  [switch]$SkipSubtree,
  [switch]$IncludeAllChanges
)

$ErrorActionPreference = 'Stop'

$repo = 'D:\開発\s-cad'

Write-Host '[1/4] Git add/commit...' -ForegroundColor Cyan
if ($IncludeAllChanges) {
  Write-Host 'Staging all changes (-IncludeAllChanges).' -ForegroundColor Yellow
  git -C $repo add -A
} else {
  Write-Host 'Staging web/* only.' -ForegroundColor Yellow
  git -C $repo add web
}

$staged = git -C $repo diff --cached --name-only
if (-not $staged) {
  Write-Host 'No changes to commit.' -ForegroundColor Yellow
  exit 0
}
git -C $repo commit -m $Message

if ($NoPush) {
  Write-Host 'NoPush enabled. Commit only.' -ForegroundColor Yellow
  exit 0
}

Write-Host '[2/4] Push main...' -ForegroundColor Cyan
git -C $repo push origin main

if ($SkipSubtree) {
  Write-Host 'SkipSubtree enabled. main only pushed.' -ForegroundColor Yellow
  exit 0
}

Write-Host '[3/4] Rebuild web-only-deploy branch...' -ForegroundColor Cyan
$exists = git -C $repo branch --list web-only-deploy
if ($exists) { git -C $repo branch -D web-only-deploy }
git -C $repo subtree split --prefix web -b web-only-deploy | Out-Null

Write-Host '[4/4] Force push web-only-deploy...' -ForegroundColor Cyan
git -C $repo push -f origin web-only-deploy

Write-Host 'Done: main + web-only-deploy updated.' -ForegroundColor Green
