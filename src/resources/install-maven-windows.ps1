$ErrorActionPreference = 'Stop'

# ================================
# CONFIGURATION
# ================================
$version = '3.9.15'
$base = "apache-maven-$version"
$zipName = "$base-bin.zip"

$primaryUrl = "https://downloads.apache.org/maven/maven-3/$version/binaries/$zipName"
$fallbackUrl = "https://archive.apache.org/dist/maven/maven-3/$version/binaries/$zipName"

$primaryChecksumUrl = "$primaryUrl.sha512"
$fallbackChecksumUrl = "$fallbackUrl.sha512"

$installRoot = Join-Path $env:SystemDrive 'jwebgen'
$mavenDir = Join-Path $installRoot $base
$binDir = Join-Path $mavenDir 'bin'

$downloadsDir = Join-Path $env:USERPROFILE 'Downloads'
$zipPath = Join-Path $downloadsDir $zipName
$checksumPath = Join-Path $downloadsDir "$zipName.sha512"

# ================================
# HELPERS
# ================================
function Download-File {
    param([string]$Url,[string]$OutFile)

    if (Test-Path $OutFile) {
        Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
    }

    Invoke-WebRequest -Uri $Url -OutFile $OutFile -ErrorAction Stop

    if (-not (Test-Path $OutFile)) {
        throw "Download failed"
    }

    # sanity check size
    if ((Get-Item $OutFile).Length -lt 10000) {
        throw "Downloaded file too small (corrupted)"
    }
}

function Get-Sha512FromFile {
    param([string]$Path)

    $text = Get-Content $Path -Raw
    $text = $text.Trim()

    $line = ($text -split "`n")[0].Trim()
    $hash = $line -replace '\s+.*',''

    if ($hash.Length -ne 128) {
        throw "Checksum invalid"
    }

    return $hash.ToLower()
}

function Normalize-Path([string]$p) {
    if (-not $p) { return $null }
    try { return [IO.Path]::GetFullPath($p).TrimEnd('\') }
    catch { return $p.TrimEnd('\') }
}

function Set-UserEnvironment {

    [Environment]::SetEnvironmentVariable('MAVEN_HOME', $mavenDir, 'User')

    $binN = Normalize-Path $binDir
    $rootN = (Normalize-Path $installRoot).ToLower()

    $current = [Environment]::GetEnvironmentVariable('Path','User')

    $entries = @()

    if ($current) {
        $entries = $current -split ';' |
            Where-Object { $_ } |
            ForEach-Object { Normalize-Path $_ } |
            Where-Object {
                $_ -and -not (
                    $_.ToLower().StartsWith($rootN) -and $_ -match 'maven-[^\\]+\\bin$'
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

    # download
    try { Download-File $primaryUrl $zipPath }
    catch { Download-File $fallbackUrl $zipPath }

    try { Download-File $primaryChecksumUrl $checksumPath }
    catch { Download-File $fallbackChecksumUrl $checksumPath }

    # verify
    $expected = Get-Sha512FromFile $checksumPath
    $actual = (Get-FileHash $zipPath -Algorithm SHA512).Hash.ToLower()

    if ($expected -ne $actual) {
        throw "Checksum failed"
    }

    # CLEAN INSTALL DIR (important fix)
    if (Test-Path $mavenDir) {
        Remove-Item $mavenDir -Recurse -Force -ErrorAction Stop
    }

    # extract SAFE
    Expand-Archive -LiteralPath $zipPath -DestinationPath $installRoot -Force

    # FIX nested folder detection (important)
    $possible = Get-ChildItem $installRoot -Directory |
        Where-Object { $_.Name -like "apache-maven-$version*" } |
        Select-Object -First 1

    if (-not $possible) {
        throw "Maven folder not found after extraction"
    }

    if ($possible.FullName -ne $mavenDir) {
        Move-Item $possible.FullName $mavenDir -Force
    }

    if (-not (Test-Path "$mavenDir\bin\mvn.cmd")) {
        throw "Invalid Maven installation"
    }

    Set-UserEnvironment
}
finally {
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $checksumPath -Force -ErrorAction SilentlyContinue
}
