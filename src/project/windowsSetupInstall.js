/** Pinned Apache Maven binary release for portable Windows setup (winget Maven is often unavailable). */
export const WINDOWS_MAVEN_PORTABLE_VERSION = '3.9.9';

/**
 * One-shot install: download official Maven binary zip, extract under LOCALAPPDATA\Programs,
 * append ...\bin to the user PATH. Uses -EncodedCommand to avoid brittle cmd quoting.
 * New shells pick up PATH; the current session may not see `mvn` until restart.
 */
export function windowsMavenPortableInstallShellCommand() {
  const v = WINDOWS_MAVEN_PORTABLE_VERSION;
  const script = `
$ErrorActionPreference = 'Stop'
$v = '${v}'
$url = "https://dlcdn.apache.org/maven/maven-3/$v/binaries/apache-maven-$v-bin.zip"
$zip = Join-Path $env:TEMP "apache-maven-$v-bin.zip"
$destRoot = Join-Path $env:LOCALAPPDATA 'Programs'
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath $destRoot -Force
$binPath = Join-Path (Join-Path $destRoot "apache-maven-$v") 'bin'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$norm = { param($p) try { [IO.Path]::GetFullPath($p).TrimEnd('\\') } catch { $p.TrimEnd('\\') } }
$binN = & $norm $binPath
$parts = @()
if ($userPath) { $parts = $userPath -split ';' | Where-Object { $_ } | ForEach-Object { & $norm $_ } }
$have = $parts -contains $binN
if (-not $have) {
  $joined = if ($userPath) { ($userPath.TrimEnd(';') + ';' + $binPath) } else { $binPath }
  [Environment]::SetEnvironmentVariable('Path', $joined, 'User')
}
`.trim();
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}
