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

# Installation directory:
# C:\jwebgen\apache-maven-3.9.15
$installRoot = Join-Path $env:SystemDrive 'jwebgen'
$mavenDir = Join-Path $installRoot $base
$binDir = Join-Path $mavenDir 'bin'

# Download location:
# C:\Users\<User>\Downloads
$downloadsDir = Join-Path $env:USERPROFILE 'Downloads'
$zipPath = Join-Path $downloadsDir $zipName

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

function Set-UserEnvironment {
    param(
        [Parameter(Mandatory)][string]$MavenDir,
        [Parameter(Mandatory)][string]$BinDir,
        [Parameter(Mandatory)][string]$InstallRoot
    )

    # Environment variable
    [Environment]::SetEnvironmentVariable('MAVEN_HOME', $MavenDir, 'User')

    # Normalize helper
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

                # Remove any previous C:\jwebgen\apache-maven-*\bin entry
                -not (
                    $entryLower.StartsWith($normalizedInstallRoot) -and
                    $entryLower -match 'apache-maven-[^\\]+\\bin$'
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

    # Download with fallback
    try {
        Download-File -Url $primaryUrl -OutFile $zipPath
    }
    catch {
        Download-File -Url $fallbackUrl -OutFile $zipPath
    }

    # Remove previous installation
    if (Test-Path -LiteralPath $mavenDir) {
        Remove-Item -LiteralPath $mavenDir -Recurse -Force -ErrorAction Stop
    }

    # Extract ZIP
    Expand-Archive -LiteralPath $zipPath -DestinationPath $installRoot -Force

    # Verify installation
    if (-not (Test-Path -LiteralPath $mavenDir)) {
        throw "Maven directory not found after extraction"
    }

    if (-not (Test-Path -LiteralPath $binDir)) {
        throw "Invalid Maven structure"
    }

    if (-not (Test-Path -LiteralPath (Join-Path $binDir 'mvn.cmd'))) {
        throw "Maven installation incomplete"
    }

    # Configure environment variables
    Set-UserEnvironment `
        -MavenDir $mavenDir `
        -BinDir $binDir `
        -InstallRoot $installRoot
}
finally {
    # Cleanup downloaded archive
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
}
