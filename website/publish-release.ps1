param(
  [Parameter(Mandatory = $true)][string] $WrappedWrangler,
  [Parameter(Mandatory = $true)][string] $StagingPath,
  [string] $Repository = 'pealz1/carbon',
  [string] $Tag = '',
  [switch] $AllowDraft,
  [switch] $InitializeCatalog
)
$ErrorActionPreference = 'Stop'
$env:CLOUDFLARE_ACCOUNT_ID = '8c28d68df63ec3278045b5cc68a0bba5'
$bucket = 'carbon-private-releases'
$work = (New-Item -ItemType Directory -Force -Path $StagingPath).FullName

function RunValue {
  param([string] $Tool, [string[]] $Arguments)
  $output = & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Tool exited with code $LASTEXITCODE" }
  return $output
}

$viewExtra = if ($Tag) { @($Tag) } else { @() }
$release = RunValue 'gh' (@('release', 'view', '--repo', $Repository, '--json', 'tagName,isDraft,isPrerelease,body,publishedAt,createdAt,assets') + $viewExtra) | ConvertFrom-Json
if (($release.isDraft -and !$AllowDraft) -or $release.isPrerelease -or $release.tagName -notmatch '^v\d+\.\d+\.\d+$') { throw 'Expected a stable release. Use -AllowDraft for a signed private release.' }
$versionFolder = (New-Item -ItemType Directory -Force -Path (Join-Path $work $release.tagName)).FullName
$assets = @($release.assets | Where-Object name -Match '\.(exe|msi|dmg|AppImage|deb|rpm|tar\.gz|sig)$|^latest\.json$')
if ($assets.Count -lt 2) { throw 'Missing release assets.' }

function UploadReleaseObject {
  param([string] $Key, [string] $Path)
  & $WrappedWrangler r2 object put "$bucket/$Key" --remote --file $Path
  if ($LASTEXITCODE -ne 0) { throw "Upload failed for $Key" }
}

foreach ($asset in $assets) {
  if ($asset.name -notmatch '^[A-Za-z0-9._-]+$') { throw 'Unexpected release filename.' }
  $local = Join-Path $versionFolder $asset.name
  if (!(Test-Path -LiteralPath $local) -or (Get-Item -LiteralPath $local).Length -ne $asset.size) {
    RunValue 'gh' @('release', 'download', $release.tagName, '--repo', $Repository, '--dir', $versionFolder, '--pattern', $asset.name, '--clobber') | Out-Null
  }
  if ((Get-Item -LiteralPath $local).Length -ne $asset.size) { throw "Unexpected size for $($asset.name)" }
  if ($asset.name -ne 'latest.json') { UploadReleaseObject "$($release.tagName)/$($asset.name)" $local }
}

$update = Get-Content -LiteralPath (Join-Path $versionFolder 'latest.json') -Raw | ConvertFrom-Json -AsHashtable
if ("v$($update.version)" -ne $release.tagName -or !$update.platforms.Count) { throw 'The updater manifest does not match the release.' }
$catalogAssets = @($assets | Where-Object { $_.name -ne 'latest.json' -and $_.name -notmatch '\.(sig|tar\.gz)$' } | ForEach-Object {
  @{ name = $_.name; size = $_.size; browser_download_url = "/downloads/$($release.tagName)/$($_.name)" }
})
$expected = @($assets | ForEach-Object name)
foreach ($platform in $update.platforms.Values) {
  $assetName = [uri]::UnescapeDataString(([uri]$platform.url).Segments[-1])
  if ($assetName -notin $expected -or ($assetName + '.sig') -notin $expected -or !$platform.signature) {
    throw "Updater asset or signature missing for $assetName"
  }
  $signature = (Get-Content -LiteralPath (Join-Path $versionFolder ($assetName + '.sig')) -Raw).Trim()
  if ($signature -cne $platform.signature) { throw "Updater signature mismatch for $assetName" }
  $platform.url = "https://getcarbon.cc/downloads/$($release.tagName)/$assetName"
}

$entries = @(
  @{ tag_name = $release.tagName; body = $release.body; published_at = ($release.publishedAt ?? $release.createdAt); assets = $catalogAssets }
  if ($InitializeCatalog) {
    $history = RunValue 'gh' @('release', 'list', '--repo', $Repository, '--exclude-drafts', '--exclude-pre-releases', '--limit', '100', '--json', 'tagName,publishedAt') | ConvertFrom-Json
    foreach ($item in $history) {
      if ($item.tagName -eq $release.tagName) { continue }
      $entry = RunValue 'gh' @('release', 'view', $item.tagName, '--repo', $Repository, '--json', 'body') | ConvertFrom-Json
      @{ tag_name = $item.tagName; body = $entry.body; published_at = $item.publishedAt; assets = @() }
    }
  } else {
    $previous = Join-Path $work 'previous-catalog.json'
    RunValue $WrappedWrangler @('r2', 'object', 'get', "$bucket/catalog.json", '--remote', '--file', $previous) | Out-Null
    $older = Get-Content -LiteralPath $previous -Raw | ConvertFrom-Json
    if (!$older.releases) { throw 'The existing changelog is invalid.' }
    $older.releases | Where-Object tag_name -NE $release.tagName
  }
)

$manifest = Join-Path $work 'latest.json'
$catalog = Join-Path $work 'catalog.json'
$update | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifest -Encoding utf8NoBOM
@{ releases = $entries } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $catalog -Encoding utf8NoBOM
UploadReleaseObject 'latest.json' $manifest
UploadReleaseObject 'catalog.json' $catalog
Write-Output "Published $($release.tagName) installers and $($entries.Count) changelog entries."
