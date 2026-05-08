$ErrorActionPreference = 'Stop'
$v = '31.0.1.Final'
$base = "wildfly-$v"
$zip = "$base.zip"
$primaryUrl = "https://github.com/wildfly/wildfly/releases/download/$v/$zip"
$fallbackUrl = "https://download.jboss.org/wildfly/$v/$zip"
$checksumUrl = "https://download.jboss.org/wildfly/$v/$zip.sha1"
$destRoot = Join-Path $env:LOCALAPPDATA 'Programs'
$installDir = Join-Path $destRoot $base
$binPath = Join-Path $installDir 'bin'
$stagingRoot = Join-Path $destRoot ("$base-staging-" + [Guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $stagingRoot $zip
$stagedInstallDir = Join-Path $stagingRoot $base

New-Item -ItemType Directory -Force -Path $destRoot | Out-Null
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null

try {
  try {
    Invoke-WebRequest -Uri $primaryUrl -OutFile $zipPath -UseBasicParsing
  } catch {
    Invoke-WebRequest -Uri $fallbackUrl -OutFile $zipPath -UseBasicParsing
  }

  $shaRaw = (Invoke-WebRequest -Uri $checksumUrl -UseBasicParsing).Content
  $expected = ($shaRaw -split '\s+')[0].Trim().ToLowerInvariant()
  if (-not $expected -or $expected.Length -lt 40) {
    throw "Could not parse checksum from $checksumUrl"
  }
  $actual = (Get-FileHash -Path $zipPath -Algorithm SHA1).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Checksum verification failed for $zip"
  }

  Expand-Archive -LiteralPath $zipPath -DestinationPath $stagingRoot -Force
  if (-not (Test-Path -LiteralPath (Join-Path $stagedInstallDir 'standalone\deployments'))) {
    throw "WildFly staged install verification failed: missing standalone/deployments folder."
  }

  if (Test-Path -LiteralPath $installDir) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
  }
  Move-Item -LiteralPath $stagedInstallDir -Destination $installDir
} finally {
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

[Environment]::SetEnvironmentVariable('WILDFLY_HOME', $installDir, 'User')

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$norm = { param($p) try { [IO.Path]::GetFullPath($p).TrimEnd('\') } catch { $p.TrimEnd('\') } }
$binN = & $norm $binPath
$parts = @()
if ($userPath) { $parts = $userPath -split ';' | Where-Object { $_ } | ForEach-Object { & $norm $_ } }
$have = $parts -contains $binN
if (-not $have) {
  $joined = if ($userPath) { ($userPath.TrimEnd(';') + ';' + $binPath) } else { $binPath }
  [Environment]::SetEnvironmentVariable('Path', $joined, 'User')
}
