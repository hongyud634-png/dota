param(
  [Parameter(Mandatory = $true)]
  [string]$RepoUrl
)

$ErrorActionPreference = "Stop"

git remote remove origin 2>$null
git remote add origin $RepoUrl
git push -u origin main

$httpsRepo = $RepoUrl
if ($httpsRepo -match '^git@([^:]+):(.+?)(\.git)?$') {
  $httpsRepo = "https://$($Matches[1])/$($Matches[2])"
}
$httpsRepo = $httpsRepo -replace '\.git$', ''
$encodedRepo = [System.Uri]::EscapeDataString($httpsRepo)

Write-Host ""
Write-Host "Render Blueprint:"
Write-Host "https://dashboard.render.com/blueprint/new?repo=$encodedRepo"
Write-Host ""
Write-Host "After opening the link, select/apply the Blueprint. Render will read render.yaml."
