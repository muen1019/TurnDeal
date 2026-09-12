$ErrorActionPreference = 'Stop'
$previousAppKey = $env:OPENAI_API_KEY
$previousAppMode = $env:OFFERMESH_RUNTIME_MODE
$appSecureKey = Read-Host 'OpenAI API key (hidden; not saved)' -AsSecureString
$appPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($appSecureKey)
try {
  $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($appPointer).Trim()
  if ($env:OPENAI_API_KEY -notmatch '^sk-[A-Za-z0-9_-]{20,}$') { throw 'Invalid API key format; key was not printed or saved.' }
  $env:OFFERMESH_RUNTIME_MODE = 'live'
  & node (Join-Path $PSScriptRoot 'dev.mjs')
  $appExitCode = $LASTEXITCODE
} finally {
  $env:OPENAI_API_KEY = $previousAppKey
  $env:OFFERMESH_RUNTIME_MODE = $previousAppMode
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($appPointer)
  $appSecureKey.Dispose()
}
exit $appExitCode
