$ErrorActionPreference = 'Stop'
$v = '10.1.39'
$base = "apache-tomcat-$v"
$zip = "$base-windows-x64.zip"
$primaryUrl = "https://dlcdn.apache.org/tomcat/tomcat-10/v$v/bin/$zip"
$fallbackUrl = "https://archive.apache.org/dist/tomcat/tomcat-10/v$v/bin/$zip"
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

if (-not (Test-Path -LiteralPath (Join-Path $installDir 'webapps'))) {
  throw "Tomcat install verification failed: missing webapps folder."
}

[Environment]::SetEnvironmentVariable('TOMCAT_HOME', $installDir, 'User')
[Environment]::SetEnvironmentVariable('CATALINA_HOME', $installDir, 'User')

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
