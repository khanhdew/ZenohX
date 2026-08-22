<#
.SYNOPSIS
    ZenohX One-Liner Installer for Windows PowerShell
.DESCRIPTION
    Downloads and installs the latest ZenohX desktop application (MSI / EXE) from GitHub Releases.
.EXAMPLE
    irm https://raw.githubusercontent.com/khanhdew/ZenohX/main/scripts/install.ps1 | iex
#>

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

$Repo = "khanhdew/ZenohX"
$AppName = "ZenohX"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "         ZenohX Windows Installer      " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Fetch Latest Release metadata from GitHub API
Write-Host "[1/3] Querying latest release from GitHub (https://github.com/$Repo)..." -ForegroundColor Yellow

$LatestReleaseUrl = "https://api.github.com/repos/$Repo/releases/latest"
$Release = $null

try {
    $Release = Invoke-RestMethod -Uri $LatestReleaseUrl -Headers @{ "User-Agent" = "ZenohX-Installer" } -ErrorAction Stop
} catch {
    Write-Host "Error: Could not query GitHub Releases API." -ForegroundColor Red
    Write-Host "Please make sure a release has been published on: https://github.com/$Repo/releases" -ForegroundColor Yellow
    Exit 1
}

if (-not $Release -or -not $Release.tag_name) {
    Write-Host "Error: No published releases found on https://github.com/$Repo/releases." -ForegroundColor Red
    Write-Host "Please make sure the GitHub Actions release build has completed." -ForegroundColor Yellow
    Exit 1
}

$Tag = $Release.tag_name
Write-Host "  Found release: $Tag" -ForegroundColor Green

# 2. Dynamically Locate Windows Installer Asset (.msi or .exe)
$Asset = $Release.assets | Where-Object { 
    $_.name -like "*x64*.msi" -or 
    $_.name -like "*.msi" -or 
    $_.name -like "*setup*.exe" -or 
    $_.name -like "*x64*.exe" 
} | Select-Object -First 1

if (-not $Asset) {
    Write-Host "Error: No Windows installer (.msi or .exe) was found in release $Tag." -ForegroundColor Red
    Write-Host "Available assets in release:" -ForegroundColor Yellow
    $Release.assets | ForEach-Object { Write-Host "  - $($_.name)" -ForegroundColor Gray }
    Exit 1
}

$DownloadUrl = $Asset.browser_download_url
$FileName = $Asset.name
$TempDir = [System.IO.Path]::GetTempPath()
$TempFilePath = Join-Path $TempDir $FileName

Write-Host "[2/3] Downloading $FileName..." -ForegroundColor Yellow
Write-Host "  URL: $DownloadUrl" -ForegroundColor Gray

try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempFilePath -UseBasicParsing -ErrorAction Stop
} catch {
    Write-Host "Error: Failed to download installer package: $_" -ForegroundColor Red
    Write-Host "Download directly from: https://github.com/$Repo/releases/latest" -ForegroundColor Yellow
    Exit 1
}

Write-Host "  Download complete." -ForegroundColor Green

# 3. Execute Installer (.msi via msiexec or .exe installer)
Write-Host "[3/3] Installing ZenohX..." -ForegroundColor Yellow

try {
    if ($FileName.EndsWith(".msi")) {
        $Process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$TempFilePath`" /qb" -Wait -PassThru
    } else {
        $Process = Start-Process -FilePath "$TempFilePath" -Wait -PassThru
    }

    if ($Process.ExitCode -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "   ZenohX was successfully installed!   " -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "Launch ZenohX from your Start Menu or Desktop shortcut." -ForegroundColor Cyan
    } else {
        Write-Host "Installer exited with status code: $($Process.ExitCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error executing installer: $_" -ForegroundColor Red
} finally {
    if (Test-Path $TempFilePath) {
        Remove-Item $TempFilePath -Force -ErrorAction SilentlyContinue
    }
}
