$ErrorActionPreference = 'Stop'

# TLS 1.2 for older Windows PowerShell (GitHub / CDN require it)
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
    # Ignore if not applicable
}

# ================================
# CONFIGURATION
# ================================
$version = '39.0.1.Final'
$base = "wildfly-$version"
$zipName = "$base.zip"

# Prefer official distribution host first (stable asset URLs), then GitHub releases
$zipUrlOfficial = "https://download.jboss.org/wildfly/$version/$zipName"
$zipUrlGitHub = "https://github.com/wildfly/wildfly/releases/download/$version/$zipName"

$checksum256UrlOfficial = "$zipUrlOfficial.sha256"
$checksum256UrlGitHub = "$zipUrlGitHub.sha256"

# Keep in sync with published wildfly-39.0.1.Final.zip (GitHub release asset). Update when bumping $version.
$embeddedZipSha256 = '2f2f24e786a4a3d0e3fb348aa45f70d7278be00844bc8593a2a50d4d8714f97a'

# Installation directory:
# C:\jwebgen\wildfly-39.0.1.Final
$installRoot = Join-Path $env:SystemDrive 'jwebgen'
$wildflyDir = Join-Path $installRoot $base
$binDir = Join-Path $wildflyDir 'bin'

# Download location:
# C:\Users\<User>\Downloads
$downloadsDir = Join-Path $env:USERPROFILE 'Downloads'
$zipPath = Join-Path $downloadsDir $zipName
$checksum256Path = Join-Path $downloadsDir "$zipName.sha256"

# ================================
# HELPERS
# ================================
function Test-CurlAvailable {
    return $null -ne (Get-Command -Name curl.exe -ErrorAction SilentlyContinue)
}

function Download-File {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$OutFile
    )

    if (Test-Path -LiteralPath $OutFile) {
        Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
    }

    $ua = 'jwebgen-installer/1 (Windows; PowerShell)'
    $iwrArgs = @{
        Uri             = $Url
        OutFile         = $OutFile
        ErrorAction     = 'Stop'
        UseBasicParsing = $true
        MaximumRedirection = 10
        UserAgent       = $ua
    }

    try {
        Invoke-WebRequest @iwrArgs
    }
    catch {
        if (Test-CurlAvailable) {
            $curl = (Get-Command -Name curl.exe).Source
            & $curl '-fSL' '-o' $OutFile '-A' $ua $Url
            if ($LASTEXITCODE -ne 0) {
                throw "Download failed (curl exit $LASTEXITCODE): $Url"
            }
        }
        else {
            throw
        }
    }

    if (-not (Test-Path -LiteralPath $OutFile)) {
        throw "Download failed"
    }
}

function Get-Sha256FromFile {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "SHA256 checksum file not found"
    }

    $text = [string](Get-Content -LiteralPath $Path -Raw)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
        $text = $text.Substring(1)
    }
    $text = $text.Trim()
    $m = [regex]::Match($text, '[0-9a-fA-F]{64}')
    if (-not $m.Success) {
        throw "SHA256 checksum parse error"
    }
    return $m.Value.ToLowerInvariant()
}

function Test-WildFlyZipLayout {
    param(
        [Parameter(Mandatory)][string]$ZipPath,
        [Parameter(Mandatory)][string]$ExpectedRootName
    )

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($e in $zip.Entries) {
            if ($e.FullName.Replace('\', '/') -eq ($ExpectedRootName + '/jboss-modules.jar')) {
                return $true
            }
        }
        return $false
    }
    finally {
        $zip.Dispose()
    }
}

function Get-FileDigest {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidateSet('SHA256', 'SHA384', 'SHA512')][string]$Algorithm
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

    # Drop old jwebgen WildFly bin entries from USER Path; append uses same $normalizedBin as the membership test.
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

    $normalizedBinLower = $normalizedBin.ToLowerInvariant()
    $entriesLower = @($entries | ForEach-Object { $_.ToLowerInvariant() })
    if ($entriesLower -notcontains $normalizedBinLower) {
        $entries += $normalizedBin
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

    # Download ZIP: official first, then GitHub
    $zipSource = 'unknown'
    try {
        Download-File -Url $zipUrlOfficial -OutFile $zipPath
        $zipSource = 'download.jboss.org'
    }
    catch {
        Download-File -Url $zipUrlGitHub -OutFile $zipPath
        $zipSource = 'github.com'
    }
    Write-Host "WildFly zip downloaded from $zipSource"

    $len = (Get-Item -LiteralPath $zipPath).Length
    if ($len -lt 40MB) {
        throw "Downloaded zip is unexpectedly small ($len bytes); refusing to extract"
    }

    $verified = $false
    $expectedSha256 = $null

    try {
        Download-File -Url $checksum256UrlOfficial -OutFile $checksum256Path
        $expectedSha256 = Get-Sha256FromFile -Path $checksum256Path
    }
    catch {
        try {
            Download-File -Url $checksum256UrlGitHub -OutFile $checksum256Path
            $expectedSha256 = Get-Sha256FromFile -Path $checksum256Path
        }
        catch {
            $expectedSha256 = $null
        }
    }

    if ($null -ne $expectedSha256) {
        $actualSha256 = Get-FileDigest -Path $zipPath -Algorithm SHA256
        if ($expectedSha256 -ne $actualSha256) {
            throw "SHA256 checksum mismatch for WildFly zip"
        }
        $verified = $true
        Write-Host 'WildFly zip verified (SHA256 from distribution checksum file)'
    }

    if (-not $verified -and -not [string]::IsNullOrWhiteSpace($embeddedZipSha256)) {
        $actualSha256 = Get-FileDigest -Path $zipPath -Algorithm SHA256
        $want = $embeddedZipSha256.Trim().ToLowerInvariant()
        if ($want -ne $actualSha256) {
            throw "SHA256 checksum mismatch for WildFly zip (embedded expected hash for this jwebgen release)"
        }
        $verified = $true
        Write-Host 'WildFly zip verified (embedded SHA256 for this installer version)'
    }

    if (-not $verified) {
        if (-not (Test-WildFlyZipLayout -ZipPath $zipPath -ExpectedRootName $base)) {
            throw "Could not verify WildFly zip (no checksum files; zip does not contain ${base}/jboss-modules.jar)"
        }
        Write-Host 'WildFly zip layout OK (checksum files unavailable; verified jboss-modules.jar entry only)'
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
    Remove-Item -LiteralPath $checksum256Path -Force -ErrorAction SilentlyContinue
}
