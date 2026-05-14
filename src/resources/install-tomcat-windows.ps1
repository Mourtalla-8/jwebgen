$ErrorActionPreference = 'Stop'

# TLS 1.2 for older Windows PowerShell
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}

# ================================
# CONFIGURATION
# ================================
$version = '10.1.55'
$base = "apache-tomcat-$version"
$zipName = "$base-windows-x64.zip"

# Keep in sync with published apache-tomcat-10.1.55-windows-x64.zip when bumping $version.
$embeddedZipSha512 = '6f8923f0fdb3b5f8e54bd837c99ab148144ae6baebd34f00e33b2c8ddcde922f07513fbee86fc38621597b1775e0ca1b30062e011678c195580eafdb424110b3'

$primaryUrl = "https://dlcdn.apache.org/tomcat/tomcat-10/v$version/bin/$zipName"
$fallbackUrl = "https://archive.apache.org/dist/tomcat/tomcat-10/v$version/bin/$zipName"
$sha512Primary = "$primaryUrl.sha512"
$sha512Fallback = "$fallbackUrl.sha512"

$installRoot = Join-Path $env:SystemDrive 'jwebgen'
$tomcatDir = Join-Path $installRoot $base
$binDir = Join-Path $tomcatDir 'bin'

$downloadsDir = Join-Path $env:USERPROFILE 'Downloads'
$zipPath = Join-Path $downloadsDir $zipName

# ================================
# HELPERS
# Download-File: coarse size check only (rejects tiny HTML/error bodies). Cryptographic integrity is
# ALWAYS enforced immediately after the zip download in the INIT block via Verify-TomcatZipSha512.
# ================================
function Download-File {
    param([string]$Url,[string]$OutFile)

    if (Test-Path $OutFile) {
        Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
    }

    $ua = 'jwebgen-installer/1 (Windows; PowerShell)'
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -ErrorAction Stop -UseBasicParsing -MaximumRedirection 10 -UserAgent $ua

    $len = (Get-Item $OutFile).Length
    # Secondary guard only (~12 MB floor). Primary integrity: SHA512 in INIT (Apache .sha512 or embedded).
    if ($len -lt 12582912) {
        throw "Download-File: Tomcat zip too small ($len bytes) for '$OutFile' - expected well over 12 MB; may be corrupt or an error page."
    }
}

function Download-ChecksumText {
    param([string]$Url)
    $ua = 'jwebgen-installer/1 (Windows; PowerShell)'
    try {
        return (Invoke-WebRequest -Uri $Url -UseBasicParsing -MaximumRedirection 10 -UserAgent $ua -ErrorAction Stop).Content
    }
    catch {
        return $null
    }
}

function Parse-Sha512FromApacheChecksumFile {
    param([Parameter(Mandatory)][string]$Text)
    $m = [regex]::Match([string]$Text, '([0-9a-fA-F]{128})')
    if (-not $m.Success) {
        throw "Could not parse SHA512 from checksum file"
    }
    return $m.Groups[1].Value.ToLowerInvariant()
}

function Get-FileDigestSha512 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA512).Hash.ToLowerInvariant()
}

function Verify-TomcatZipSha512 {
    param(
        [Parameter(Mandatory)][string]$ZipPath,
        [Parameter(Mandatory)][string]$ExpectedHex
    )
    $actual = Get-FileDigestSha512 -Path $ZipPath
    $exp = $ExpectedHex.ToLowerInvariant()
    if ($actual -ne $exp) {
        try {
            Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
        }
        catch {
        }
        throw "SHA512 checksum mismatch for Tomcat zip (rejected download removed). Expected: $exp  Actual: $actual"
    }
}

function Normalize([string]$p) {
    if (-not $p) { return $null }
    try { return [IO.Path]::GetFullPath($p).TrimEnd('\') }
    catch { return $p.TrimEnd('\') }
}

function Set-UserEnvironment {

    [Environment]::SetEnvironmentVariable('TOMCAT_HOME', $tomcatDir, 'User')
    [Environment]::SetEnvironmentVariable('CATALINA_HOME', $tomcatDir, 'User')

    $binN = Normalize $binDir
    $rootN = (Normalize $installRoot).ToLower()

    $current = [Environment]::GetEnvironmentVariable('Path','User')
    $entries = @()

    # Remove stale jwebgen Tomcat bin entries from USER Path only (does not touch $tomcatDir on disk).
    if ($current) {
        $entries = $current -split ';' |
            Where-Object { $_ } |
            ForEach-Object { Normalize $_ } |
            Where-Object {
                $_ -and -not (
                    $_.ToLower().StartsWith($rootN) -and $_ -match 'tomcat-[^\\]+\\bin$'
                )
            }
    }

    if ($entries -notcontains $binN) {
        $entries += $binN
    }

    [Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
}

# ================================
# INIT
# ================================
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
New-Item -ItemType Directory -Force -Path $downloadsDir | Out-Null

try {

    # silent java check
    try { java -version *> $null } catch {}

    # download Tomcat zip, then mandatory SHA512 verification (Apache mirror or embedded fallback)
    try { Download-File $primaryUrl $zipPath }
    catch { Download-File $fallbackUrl $zipPath }

    $expectedSha = $null
    $sumText = Download-ChecksumText $sha512Primary
    if ($null -eq $sumText) { $sumText = Download-ChecksumText $sha512Fallback }
    if ($null -ne $sumText) {
        $expectedSha = Parse-Sha512FromApacheChecksumFile -Text $sumText
        Write-Host 'Tomcat zip checksum source: Apache .sha512 file'
    }
    else {
        $expectedSha = $embeddedZipSha512.Trim().ToLowerInvariant()
        Write-Host 'Tomcat zip checksum source: embedded SHA512 (this jwebgen release)'
    }
    Verify-TomcatZipSha512 -ZipPath $zipPath -ExpectedHex $expectedSha
    Write-Host 'Tomcat zip verified (SHA512)'

    # staging SAFE
    $staging = Join-Path $installRoot ('_jwg_tomcat_' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $staging | Out-Null

    try {

        Expand-Archive -LiteralPath $zipPath -DestinationPath $staging -Force

        # 🔥 FIX IMPORTANT: detect ANY tomcat folder dynamically
        $candidate = Get-ChildItem $staging -Directory |
            Where-Object { $_.Name -like "apache-tomcat-$version*" } |
            Select-Object -First 1

        if (-not $candidate) {
            throw "Tomcat folder not found after extraction"
        }

        $candidateDir = $candidate.FullName
        $candidateBin = Join-Path $candidateDir 'bin'

        if (-not (Test-Path $candidateBin)) {
            throw "Invalid Tomcat structure"
        }

        if (-not (Test-Path (Join-Path $candidateBin 'startup.bat'))) {
            throw "Tomcat incomplete"
        }

        # Reinstall: back up conf/ then remove prior $tomcatDir (see Copy-Item block below).
        if (Test-Path $tomcatDir) {
            $confDir = Join-Path $tomcatDir 'conf'
            if (Test-Path -LiteralPath $confDir) {
                $backupDir = Join-Path $installRoot ('tomcat-conf-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
                try {
                    Copy-Item -LiteralPath $confDir -Destination $backupDir -Recurse -Force -ErrorAction Stop
                    Write-Host "Previous Tomcat conf backed up to: $backupDir"
                }
                catch {
                    throw "Could not back up Tomcat conf to ${backupDir}: $($_.Exception.Message). Aborting install to avoid losing your configuration."
                }
            }
            Remove-Item $tomcatDir -Recurse -Force -ErrorAction Stop
        }

        Move-Item $candidateDir $tomcatDir -Force

        Set-UserEnvironment
    }
    finally {
        Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
finally {
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
}