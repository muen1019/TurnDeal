param([string]$PromptText = '')
$ErrorActionPreference = 'Stop'
$previousFormatterKey = $env:OPENAI_API_KEY
$formatterSecureKey = Read-Host 'Enter a NEW OpenAI API key (hidden; not saved)' -AsSecureString
$formatterPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($formatterSecureKey)
try {
  $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($formatterPointer).Trim()
  if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) { throw 'Empty API key' }
  if ($env:OPENAI_API_KEY -notmatch '^sk-[A-Za-z0-9_-]{20,}$') {
    throw 'Invalid key format. Paste the full key without quotes, asterisks or backslash escapes. Key was not printed or saved.'
  }
  $formatterDemoPath = Join-Path $PSScriptRoot '../examples/formatter-llm.ts'
  if ($PromptText) { & node $formatterDemoPath $PromptText } else { & node $formatterDemoPath }
  $formatterExitCode = $LASTEXITCODE
} finally {
  $env:OPENAI_API_KEY = $previousFormatterKey
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($formatterPointer)
  $formatterSecureKey.Dispose()
}
exit $formatterExitCode
