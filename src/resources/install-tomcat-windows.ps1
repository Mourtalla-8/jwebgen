$ErrorActionPreference = 'Stop'

# ================================
# CONFIGURATION
# ================================
$version = '10.1.54'
$base = "apache-tomcat-$version"
$zipName = "$base-windows-x64.zip"

$primaryUrl = "https://dlcdn.apache.org/tomcat/tomcat-10/v$version/bin/$zipName"
$fallbackUrl = "https://archive.apache.org/dist/tomcat/tomcat-10/v$version/bin/$zipName"

$installRoot = Join-Path $env:SystemDrive 'jwebgen'
$tomcatDir = Join-Path $installRoot $base
$binDir = Join-Path $tomcatDir 'bin'

$downloadsDir = Join-Path $env:USERPROFILE 'Downloads'
$zipPath = Join-Path $downloadsDir $zipName

# ================================
# HELPERS
# ================================
function Download-File {
    param([string]$Url,[string]$OutFile)

    if (Test-Path $OutFile) {
        Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
    }

    Invoke-WebRequest -Uri $Url -OutFile $OutFile -ErrorAction Stop

    if ((Get-Item $OutFile).Length -lt 10000) {
        throw "Downloaded file corrupted"
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

    # download
    try { Download-File $primaryUrl $zipPath }
    catch { Download-File $fallbackUrl $zipPath }

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

        if (Test-Path $tomcatDir) {
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