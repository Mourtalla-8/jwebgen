$ErrorActionPreference = 'Stop'
$v = '10.1.39'
$base = "apache-tomcat-$v"
$zip = "$base-windows-x64.zip"
$primaryUrl = "https://dlcdn.apache.org/tomcat/tomcat-10/v$v/bin/$zip"
$fallbackUrl = "https://archive.apache.org/dist/tomcat/tomcat-10/v$v/bin/$zip"
$destRoot = Join-Path $env:LOCALAPPDATA 'Programs'
$installDir = Join-Path $destRoot $base
$binPath = Join-Path $installDir 'bin'
$stagingRoot = Join-Path $destRoot ("$base-staging-" + [Guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $stagingRoot $zip
$stagedInstallDir = Join-Path $stagingRoot $base
$backupDir = "$installDir.backup-" + (Get-Date -Format 'yyyyMMddHHmmss')

New-Item -ItemType Directory -Force -Path $destRoot | Out-Null
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null

try {
  $downloadUrl = $primaryUrl
  $checksumUrl = "$primaryUrl.sha512"
  try {
    Invoke-WebRequest -Uri $primaryUrl -OutFile $zipPath -UseBasicParsing
  } catch {
    $downloadUrl = $fallbackUrl
    $checksumUrl = "$fallbackUrl.sha512"
    Invoke-WebRequest -Uri $fallbackUrl -OutFile $zipPath -UseBasicParsing
  }

  $shaText = ''
  try {
    $shaText = [string](Invoke-WebRequest -Uri $checksumUrl -UseBasicParsing).Content
  } catch {
    $fallbackChecksumUrl = "$fallbackUrl.sha512"
    $shaText = [string](Invoke-WebRequest -Uri $fallbackChecksumUrl -UseBasicParsing).Content
    $checksumUrl = $fallbackChecksumUrl
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
    throw "Could not parse checksum from $checksumUrl"
  }
  $expected = $m.Groups[1].Value.ToLowerInvariant()
  if (-not $expected -or $expected.Length -ne 128 -or $expected -notmatch '^[0-9a-f]{128}$') {
    throw "Could not parse checksum from $checksumUrl"
  }
  $actual = (Get-FileHash -Path $zipPath -Algorithm SHA512).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Checksum verification failed for $downloadUrl"
  }

  Expand-Archive -LiteralPath $zipPath -DestinationPath $stagingRoot -Force
  if (-not (Test-Path -LiteralPath (Join-Path $stagedInstallDir 'webapps'))) {
    throw "Tomcat staged install verification failed: missing webapps folder."
  }

  $hadExistingInstall = Test-Path -LiteralPath $installDir
  if ($hadExistingInstall) {
    Move-Item -LiteralPath $installDir -Destination $backupDir
  }
  try {
    Move-Item -LiteralPath $stagedInstallDir -Destination $installDir
  } catch {
    if ($hadExistingInstall -and (Test-Path -LiteralPath $backupDir) -and -not (Test-Path -LiteralPath $installDir)) {
      Move-Item -LiteralPath $backupDir -Destination $installDir
    }
    throw
  }
  if ($hadExistingInstall -and (Test-Path -LiteralPath $backupDir)) {
    try {
      Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction Stop
    } catch {
      Write-Warning "Tomcat backup cleanup failed at ${backupDir}: $($_.Exception.Message)"
    }
  }
} finally {
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

[Environment]::SetEnvironmentVariable('TOMCAT_HOME', $installDir, 'User')
[Environment]::SetEnvironmentVariable('CATALINA_HOME', $installDir, 'User')

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$norm = { param($p) try { [IO.Path]::GetFullPath($p).TrimEnd('\') } catch { $p.TrimEnd('\') } }
$binN = & $norm $binPath
$destRootN = (& $norm $destRoot).ToLowerInvariant()
$parts = @()
if ($userPath) {
  $parts = $userPath -split ';' | Where-Object { $_ } | ForEach-Object { & $norm $_ } | Where-Object {
    $entry = $_
    $entryLower = $entry.ToLowerInvariant()
    $underDestRoot = $entryLower.StartsWith($destRootN + '\')
    $tomcatBinUnderRoot = $underDestRoot -and $entryLower -match '\\apache-tomcat-[^\\]+\\bin$'
    -not $tomcatBinUnderRoot
  }
}
$have = $parts -contains $binN
if (-not $have) {
  $joinedBase = ($parts -join ';').Trim(';')
  $joined = if ($joinedBase) { ($joinedBase + ';' + $binPath) } else { $binPath }
  [Environment]::SetEnvironmentVariable('Path', $joined, 'User')
} elseif ($userPath -ne ($parts -join ';')) {
  [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
}
