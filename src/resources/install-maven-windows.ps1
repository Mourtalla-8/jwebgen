$ErrorActionPreference = 'Stop'
$v = '3.9.9'
$url = "https://dlcdn.apache.org/maven/maven-3/$v/binaries/apache-maven-$v-bin.zip"
$zip = Join-Path $env:TEMP "apache-maven-$v-bin.zip"
$destRoot = Join-Path $env:LOCALAPPDATA 'Programs'
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath $destRoot -Force
$binPath = Join-Path (Join-Path $destRoot "apache-maven-$v") 'bin'
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
