param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('doctor', 'init', 'build', 'validate', 'assetlinks')]
  [string]$Command
)

$ErrorActionPreference = 'Stop'

function Invoke-Bubblewrap {
  param([string[]]$Arguments)
  & npx.cmd '@bubblewrap/cli@latest' @Arguments
}

switch ($Command) {
  'doctor' {
    Invoke-Bubblewrap @('doctor')
    break
  }

  'init' {
    if (-not $env:ORBIT_TWA_MANIFEST_URL) {
      throw 'Set ORBIT_TWA_MANIFEST_URL first, for example: https://goal-orbit-app.pages.dev/manifest.webmanifest'
    }

    Invoke-Bubblewrap @(
      'init',
      "--manifest=$env:ORBIT_TWA_MANIFEST_URL",
      '--directory=android'
    )
    break
  }

  'build' {
    if (-not (Test-Path -LiteralPath 'android\twa-manifest.json')) {
      throw 'android\twa-manifest.json was not found. Run init after publishing the PWA first.'
    }

    Push-Location android
    try {
      Invoke-Bubblewrap @('build')
    } finally {
      Pop-Location
    }
    break
  }

  'validate' {
    if (-not $env:ORBIT_PWA_URL) {
      throw 'Set ORBIT_PWA_URL first, for example: https://goal-orbit-app.pages.dev/'
    }

    Invoke-Bubblewrap @('validate', "--url=$env:ORBIT_PWA_URL")
    break
  }

  'assetlinks' {
    if (-not (Test-Path -LiteralPath 'android\twa-manifest.json')) {
      throw 'android\twa-manifest.json was not found.'
    }

    Push-Location android
    try {
      Invoke-Bubblewrap @('fingerprint', 'generateAssetLinks', '--output=..\assetlinks.generated.json')
    } finally {
      Pop-Location
    }
    break
  }
}
