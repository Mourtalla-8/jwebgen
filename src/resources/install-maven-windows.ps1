$ErrorActionPreference = 'Stop'
$v = '3.9.9'
$zipName = "apache-maven-$v-bin.zip"
$primaryUrl = "https://downloads.apache.org/maven/maven-3/$v/binaries/$zipName"
$fallbackUrl = "https://archive.apache.org/dist/maven/maven-3/$v/binaries/$zipName"
$url = $primaryUrl
$shaUrl = "$primaryUrl.sha512"
$fallbackShaUrl = "$fallbackUrl.sha512"
$zip = Join-Path $env:TEMP "apache-maven-$v-bin.zip"
$destRoot = Join-Path $env:LOCALAPPDATA 'Programs'
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null
try {
  Invoke-WebRequest -Uri $primaryUrl -OutFile $zip -UseBasicParsing
} catch {
  $url = $fallbackUrl
  $shaUrl = $fallbackShaUrl
  Invoke-WebRequest -Uri $fallbackUrl -OutFile $zip -UseBasicParsing
}
try {
  $shaText = ''
  try {
    $shaText = [string](Invoke-WebRequest -Uri $shaUrl -UseBasicParsing).Content
  } catch {
    $shaText = [string](Invoke-WebRequest -Uri $fallbackShaUrl -UseBasicParsing).Content
    $shaUrl = $fallbackShaUrl
  }

  # Parse flexible .sha512 formats:
  # - optional UTF-8 BOM
  # - optional leading whitespace / blank lines
  # - either: "<HASH>" or "<HASH> <filename>" or "<HASH> *<filename>"
  if ($shaText.Length -gt 0 -and $shaText[0] -eq [char]0xFEFF) {
    $shaText = $shaText.Substring(1)
  }
  $m = [regex]::Match($shaText, '(?im)^[\s\r\n]*([0-9a-f]{128})\b')
  if (-not $m.Success) {
    throw "Could not parse checksum from $shaUrl"
  }
  $expected = $m.Groups[1].Value.ToLowerInvariant()
  if (-not $expected -or $expected.Length -ne 128 -or $expected -notmatch '^[0-9a-f]{128}$') {
    throw "Could not parse checksum from $shaUrl"
  }
  $actual = (Get-FileHash -Path $zip -Algorithm SHA512).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Checksum verification failed for apache-maven-$v-bin.zip"
  }
  Expand-Archive -LiteralPath $zip -DestinationPath $destRoot -Force
} catch {
  if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  }
  throw
}
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
