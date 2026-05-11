$ErrorActionPreference = 'Stop'

# ================================
# CONFIGURATION
# ================================
$version = '39.0.1.Final'
$base = "wildfly-$version"
$zipName = "$base.zip"

# URLs
$primaryUrl = "https://github.com/wildfly/wildfly/releases/download/$version/$zipName"
$fallbackUrl = "https://download.jboss.org/wildfly/$version/$zipName"

$primaryChecksumUrl = "$primaryUrl.sha1"
$fallbackChecksumUrl = "$fallbackUrl.sha1"

# Installation directory:
# C:\jwebgen\wildfly-39.0.1.Final
$installRoot = Join-Path $env:SystemDrive 'jwebgen'
$wildflyDir = Join-Path $installRoot $base
$binDir = Join-Path $wildflyDir 'bin'

# Download location:
# C:\Users\<User>\Downloads
$downloadsDir = Join-Path $env:USERPROFILE 'Downloads'
$zipPath = Join-Path $downloadsDir $zipName
$checksumPath = Join-Path $downloadsDir "$zipName.sha1"

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
}

function Get-Sha1FromFile {
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

    # Remove BOM if present
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
        $text = $text.Substring(1)
    }

    $text = $text.Trim()

    $match = [regex]::Match($text, '[0-9a-fA-F]{40}')
    if (-not $match.Success) {
        throw "Checksum parse error"
    }

    return $match.Value.ToLowerInvariant()
}

# .NET hash avoids reliance on Get-FileHash (missing on some constrained / CI hosts).
function Get-FileDigestHex {
    param(
        [Parameter(Mandatory)][string]$LiteralPath,
        [Parameter(Mandatory)][ValidateSet('SHA512', 'SHA1')][string]$Algorithm
    )

    $hashAlgo = switch ($Algorithm) {
        'SHA512' { [System.Security.Cryptography.SHA512]::Create() }
        'SHA1' { [System.Security.Cryptography.SHA1]::Create() }
    }
    try {
        $fullPath = Convert-Path -LiteralPath $LiteralPath
        $fs = [System.IO.File]::OpenRead($fullPath)
        try {
            $hashBytes = $hashAlgo.ComputeHash($fs)
            return ([BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
        } finally {
            $fs.Dispose()
        }
    } finally {
        $hashAlgo.Dispose()
    }
}

function Set-UserEnvironment {
    param(
        [Parameter(Mandatory)][string]$WildFlyDir,
        [Parameter(Mandatory)][string]$BinDir,
        [Parameter(Mandatory)][string]$InstallRoot
    )

    [Environment]::SetEnvironmentVariable('WILDFLY_HOME', $WildFlyDir, 'User')

    $Normalize = {
        param([string]$p)

        if ([string]::IsNullOrWhiteSpace($p)) {
            return $null
        }

        try {
            return [IO.Path]::GetFullPath($p).TrimEnd('\')
        }
        catch {
            return $p.TrimEnd('\')
        }
    }

    $normalizedBin = & $Normalize $BinDir
    $normalizedInstallRoot = (& $Normalize $InstallRoot).ToLowerInvariant()

    $currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @()

    if (-not [string]::IsNullOrWhiteSpace($currentUserPath)) {
        $entries = $currentUserPath -split ';' |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            ForEach-Object { & $Normalize $_ } |
            Where-Object {
                $entryLower = $_.ToLowerInvariant()

                -not (
                    $entryLower.StartsWith($normalizedInstallRoot) -and
                    $entryLower -match 'wildfly-[^\\]+\\bin$'
                )
            }
    }

    if ($entries -notcontains $normalizedBin) {
        $entries += $BinDir
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
    # Optional Java check (silent)
    try {
        java -version *> $null
    }
    catch {
        # Ignore if Java is not installed
    }

    # Download ZIP with fallback
    try {
        Download-File -Url $primaryUrl -OutFile $zipPath
    }
    catch {
        Download-File -Url $fallbackUrl -OutFile $zipPath
    }

    # Download checksum with fallback
    try {
        Download-File -Url $primaryChecksumUrl -OutFile $checksumPath
    }
    catch {
        Download-File -Url $fallbackChecksumUrl -OutFile $checksumPath
    }

    # Verify checksum
    $expected = Get-Sha1FromFile -Path $checksumPath
    $actual = Get-FileDigestHex -LiteralPath $zipPath -Algorithm SHA1

    if ($expected -ne $actual) {
        throw "Checksum failed"
    }

    # Remove previous installation
    if (Test-Path -LiteralPath $wildflyDir) {
        Remove-Item -LiteralPath $wildflyDir -Recurse -Force -ErrorAction Stop
    }

    # Extract ZIP
    Expand-Archive -LiteralPath $zipPath -DestinationPath $installRoot -Force

    # Verify installation
    if (-not (Test-Path -LiteralPath $wildflyDir)) {
        throw "WildFly directory not found after extraction"
    }

    if (-not (Test-Path -LiteralPath (Join-Path $wildflyDir 'bin'))) {
        throw "Invalid WildFly structure"
    }

    if (-not (Test-Path -LiteralPath (Join-Path $wildflyDir 'standalone'))) {
        throw "Invalid WildFly structure"
    }

    # Configure environment variables
    Set-UserEnvironment `
        -WildFlyDir $wildflyDir `
        -BinDir $binDir `
        -InstallRoot $installRoot

    # Final verification
    if (-not (Test-Path -LiteralPath (Join-Path $binDir 'standalone.bat'))) {
        throw "WildFly installation incomplete"
    }
}
finally {
    # Cleanup downloaded files
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $checksumPath -Force -ErrorAction SilentlyContinue
}
