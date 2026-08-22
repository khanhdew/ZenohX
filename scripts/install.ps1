<#
.SYNOPSIS
    ZenohX One-Liner Installer for Windows PowerShell
.DESCRIPTION
    Downloads and installs the latest ZenohX desktop application from GitHub Releases.
.EXAMPLE
    irm https://raw.githubusercontent.com/khanhdew/ZenohX/main/scripts/install.ps1 | iex
#>

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = "khanhdew/ZenohX"
$AppName = "ZenohX"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "         ZenohX Windows Installer      " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Fetch Latest Release metadata
Write-Host "[1/3] Fetching latest release info from GitHub..." -ForegroundColor Yellow

$LatestReleaseUrl = "https://api.github.com/repos/$Repo/releases/latest"
$Release = $null

try {
    $Release = Invoke-RestMethod -Uri $LatestReleaseUrl -Headers @{ "User-Agent" = "ZenohX-Installer" } -ErrorAction Stop
    $Tag = $Release.tag_name
} catch {
    $Tag = "v0.1.1"
    Write-Host "  Note: Could not query GitHub API, defaulting to $Tag." -ForegroundColor Gray
}

Write-Host "  Target version: $Tag" -ForegroundColor Green

# 2. Download MSI Package
$MsiName = "ZenohX_x64_en-US.msi"
$DownloadUrl = "https://github.com/$Repo/releases/download/$Tag/$MsiName"
$TempDir = [System.IO.Path]::GetTempPath()
$TempMsiPath = Join-Path $TempDir "$AppName-$Tag.msi"

Write-Host "[2/3] Downloading $MsiName..." -ForegroundColor Yellow
Write-Host "  URL: $DownloadUrl" -ForegroundColor Gray

try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempMsiPath -UseBasicParsing -ErrorAction Stop
} catch {
    # Fallback to direct latest endpoint
    $FallbackUrl = "https://github.com/$Repo/releases/latest/download/$MsiName"
    Write-Host "  Retrying via fallback: $FallbackUrl..." -ForegroundColor Gray
    try {
        Invoke-WebRequest -Uri $FallbackUrl -OutFile $TempMsiPath -UseBasicParsing -ErrorAction Stop
    } catch {
        Write-Host "Error: Failed to download ZenohX installer from GitHub." -ForegroundColor Red
        Write-Host "Please download directly from: https://github.com/$Repo/releases/latest" -ForegroundColor Red
        Exit 1
    }
}

Write-Host "  Download completed." -ForegroundColor Green

# 3. Execute MSI Installer
Write-Host "[3/3] Installing ZenohX..." -ForegroundColor Yellow

try {
    $Process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$TempMsiPath`" /qb" -Wait -PassThru
    if ($Process.ExitCode -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "   ZenohX was successfully installed!   " -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "You can now launch ZenohX from your Start Menu or Desktop shortcut." -ForegroundColor Cyan
    } else {
        Write-Host "Installer finished with code: $($Process.ExitCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error running MSI installer: $_" -ForegroundColor Red
} finally {
    if (Test-Path $TempMsiPath) {
        Remove-Item $TempMsiPath -Force -ErrorAction SilentlyContinue
    }
}
