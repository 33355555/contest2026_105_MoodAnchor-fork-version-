param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "MoodAnchor-tencent-scf.zip")
)

& python (Join-Path $PSScriptRoot "build_package.py") $OutputPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
