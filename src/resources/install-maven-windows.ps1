$ErrorActionPreference = 'Stop'

# ================================
# CONFIGURATION
# ================================
$version = '3.9.15'
$base = "apache-maven-$version"
$zipName = "$base-bin.zip"

# URLs
$primaryUrl = "https://downloads.apache.org/maven/maven-3/$version/binaries/$zipName"
$fallbackUrl = "https://archive.apache.org/dist/maven/maven-3/$version/binaries/$zipName"

$primaryChecksumUrl = "$primaryUrl.sha512"
$fallbackChecksumUrl = "$fallbackUrl.sha512"

# Installation directory:
# C:\jwebgen\apache-maven-3.9.15
$installRoot = Join-Path $env:SystemDrive 'jwebgen'
$mavenDir = Join-Path $installRoot $base
$binDir = Join-Path $mavenDir 'bin'

# Download location:
# C:\Users\<User>\Downloads
$downloadsDir = Join-Path $env:USERPROFILE 'Downloads'
$zipPath = Join-Path $downloadsDir $zipName
$checksumPath = Join-Path $downloadsDir "$zipName.sha512"

# ================================
# HELPERS
# ================================
function Download-File {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$OutFile
    )

    if (Test-Path -LiteralPath $OutFile) {
        Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
    }

    Invoke-WebRequest -Uri $Url -OutFile $OutFile -ErrorAction Stop

    if (-not (Test-Path -LiteralPath $OutFile)) {
        throw "Download failed"
    }

    # Apply minimum size check only to ZIP archives.
    if ([IO.Path]::GetExtension($OutFile).Equals('.zip', [StringComparison]::OrdinalIgnoreCase)) {
        if ((Get-Item -LiteralPath $OutFile).Length -lt 10000) {
            throw "Downloaded ZIP file too small (corrupted)"
        }
    }
}

function Get-Sha512FromFile {
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Checksum file not found"
    }

    $text = Get-Content -LiteralPath $Path -Raw
    if ($null -eq $text) {
        throw "Checksum file is empty"
    }

    $text = [string]$text

    # Remove BOM if present.
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
        $text = $text.Substring(1)
    }

    $text = $text.Trim()

    # Extract the first 128-hex-character SHA-512 digest.
    $match = [regex]::Match($text, '[0-9a-fA-F]{128}')
    if (-not $match.Success) {
        throw "Checksum parse error"
    }

    return $match.Value.ToLowerInvariant()
}

function Get-FileDigest {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidateSet('SHA1', 'SHA256', 'SHA384', 'SHA512')][string]$Algorithm
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found for hashing"
    }

    $getFileHashCmd = Get-Command -Name Get-FileHash -ErrorAction SilentlyContinue
    if ($getFileHashCmd) {
        return (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant()
    }

    $stream = [IO.File]::OpenRead($Path)
    try {
        $hasher = [Security.Cryptography.HashAlgorithm]::Create($Algorithm)
        if (-not $hasher) {
            throw "Hash algorithm not available: $Algorithm"
        }
        try {
            $bytes = $hasher.ComputeHash($stream)
        }
        finally {
            $hasher.Dispose()
        }
        return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
    }
    finally {
        $stream.Dispose()
    }
}

function Resolve-NormalizedPath {
    param(
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    try {
        return [IO.Path]::GetFullPath($Path).TrimEnd('\')
    }
    catch {
        return $Path.TrimEnd('\')
    }
}

function Set-UserEnvironment {
    [Environment]::SetEnvironmentVariable('MAVEN_HOME', $mavenDir, 'User')

    $canonicalBinPath = Resolve-NormalizedPath $binDir
    $canonicalBinPathLower = if ($canonicalBinPath) { $canonicalBinPath.ToLowerInvariant() } else { '' }
    $normalizedInstallRootRaw = Resolve-NormalizedPath $installRoot
    if (-not $normalizedInstallRootRaw) {
        throw "Cannot resolve install root path (check SystemDrive and jwebgen install folder)."
    }
    $normalizedInstallRoot = $normalizedInstallRootRaw.ToLowerInvariant()

    $currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entryObjects = @()

    if (-not [string]::IsNullOrWhiteSpace($currentUserPath)) {
        $entryObjects = $currentUserPath -split ';' |
            ForEach-Object {
                $original = [string]$_
                if ([string]::IsNullOrWhiteSpace($original)) { return $null }
                $normalized = Resolve-NormalizedPath $original
                [PSCustomObject]@{
                    Original = $original
                    Normalized = $normalized
                }
            } |
            Where-Object { $_ -and $_.Normalized } |
            Where-Object {
                $normalizedLower = $_.Normalized.ToLowerInvariant()
                -not (
                    $normalizedLower.StartsWith($normalizedInstallRoot) -and
                    $_.Normalized -match 'apache-maven-[^\\]+\\bin$'
                )
            }
    }

    $hasCanonicalBin = $entryObjects |
        Where-Object { $_.Normalized.ToLowerInvariant() -eq $canonicalBinPathLower } |
        Select-Object -First 1

    $entries = @($entryObjects | ForEach-Object { $_.Original })
    if (-not $hasCanonicalBin) {
        $entries += $canonicalBinPath
    }

    $newPath = ($entries -join ';').Trim(';')
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}

# ================================
# INIT
# ================================
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
New-Item -ItemType Directory -Force -Path $downloadsDir | Out-Null

try {
    # Download ZIP and checksum from the same source.
    try {
        Download-File -Url $primaryUrl -OutFile $zipPath
        Download-File -Url $primaryChecksumUrl -OutFile $checksumPath
    }
    catch {
        Download-File -Url $fallbackUrl -OutFile $zipPath
        Download-File -Url $fallbackChecksumUrl -OutFile $checksumPath
    }

    # Verify checksum.
    $expected = Get-Sha512FromFile -Path $checksumPath
    $actual = Get-FileDigest -Path $zipPath -Algorithm SHA512

    if ($expected -ne $actual) {
        throw "Checksum failed"
    }

    # Remove previous installation.
    if (Test-Path -LiteralPath $mavenDir) {
        Remove-Item -LiteralPath $mavenDir -Recurse -Force -ErrorAction Stop
    }

    # Extract ZIP.
    Expand-Archive -LiteralPath $zipPath -DestinationPath $installRoot -Force

    # Locate extracted Maven directory.
    $possible = Get-ChildItem -LiteralPath $installRoot -Directory |
        Where-Object { $_.Name -like "apache-maven-$version*" } |
        Select-Object -First 1

    if (-not $possible) {
        throw "Maven folder not found after extraction"
    }

    # Normalize extracted directory name if needed.
    if ((Resolve-NormalizedPath $possible.FullName) -ne (Resolve-NormalizedPath $mavenDir)) {
        Move-Item -LiteralPath $possible.FullName -Destination $mavenDir -Force -ErrorAction Stop
    }

    # Verify installation.
    if (-not (Test-Path -LiteralPath (Join-Path $binDir 'mvn.cmd'))) {
        throw "Invalid Maven installation"
    }

    # Configure environment variables.
    Set-UserEnvironment
}
finally {
    # Cleanup downloaded files.
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $checksumPath -Force -ErrorAction SilentlyContinue
}
