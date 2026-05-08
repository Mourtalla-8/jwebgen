$ErrorActionPreference = 'Stop'
$v = '31.0.1.Final'
$base = "wildfly-$v"
$zip = "$base.zip"
$primaryUrl = "https://github.com/wildfly/wildfly/releases/download/$v/$zip"
$fallbackUrl = "https://download.jboss.org/wildfly/$v/$zip"
$zipPath = Join-Path $env:TEMP $zip
$destRoot = Join-Path $env:LOCALAPPDATA 'Programs'
$installDir = Join-Path $destRoot $base
$binPath = Join-Path $installDir 'bin'

New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

if (Test-Path -LiteralPath $installDir) {
  Remove-Item -LiteralPath $installDir -Recurse -Force
}

try {
  Invoke-WebRequest -Uri $primaryUrl -OutFile $zipPath -UseBasicParsing
} catch {
  Invoke-WebRequest -Uri $fallbackUrl -OutFile $zipPath -UseBasicParsing
}

try {
  Expand-Archive -LiteralPath $zipPath -DestinationPath $destRoot -Force
} finally {
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $installDir 'standalone\deployments'))) {
  throw "WildFly install verification failed: missing standalone/deployments folder."
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
