param(
  [string]$Message = "Sync cad to web and deploy",
  [switch]$NoPush,
  [switch]$SkipSubtree
)

$ErrorActionPreference = 'Stop'

$repo = 'D:\開発\s-cad'
$srcIndex = Join-Path $repo 'index.html'
$dstIndex = Join-Path $repo 'web\cad.html'
$srcCad = Join-Path $repo 'cad'
$dstCad = Join-Path $repo 'web\cad'
$srcFavicon = Join-Path $repo 'favicon.svg'
$dstFavicon = Join-Path $repo 'web\favicon.svg'

Write-Host '[1/6] Sync files to web...' -ForegroundColor Cyan
Copy-Item -Path $srcIndex -Destination $dstIndex -Force
Copy-Item -Path $srcFavicon -Destination $dstFavicon -Force
if (Test-Path $dstCad) { Remove-Item -Path $dstCad -Recurse -Force }
Copy-Item -Path $srcCad -Destination $dstCad -Recurse -Force

Write-Host '[2/6] Set cad page title...' -ForegroundColor Cyan
$c = Get-Content -Raw $dstIndex -Encoding UTF8
$c = $c -replace '<title>.*?</title>', '<title>S-CAD App</title>'
Set-Content -Path $dstIndex -Value $c -Encoding UTF8

Write-Host '[3/6] Git add/commit...' -ForegroundColor Cyan
git -C $repo add -A
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

Write-Host '[4/6] Push main...' -ForegroundColor Cyan
git -C $repo push origin main

if ($SkipSubtree) {
  Write-Host 'SkipSubtree enabled. main only pushed.' -ForegroundColor Yellow
  exit 0
}

Write-Host '[5/6] Rebuild web-only-deploy branch...' -ForegroundColor Cyan
$exists = git -C $repo branch --list web-only-deploy
if ($exists) { git -C $repo branch -D web-only-deploy }
git -C $repo subtree split --prefix web -b web-only-deploy | Out-Null

Write-Host '[6/6] Force push web-only-deploy...' -ForegroundColor Cyan
git -C $repo push -f origin web-only-deploy

Write-Host 'Done: main + web-only-deploy updated.' -ForegroundColor Green
