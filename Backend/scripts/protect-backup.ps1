param(
    [Parameter(Mandatory=$true)][ValidateSet('Protect','Unprotect')][string]$Mode,
    [Parameter(Mandatory=$true)][string]$InputPath,
    [Parameter(Mandatory=$true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This backup envelope uses Windows CurrentUser DPAPI; run with PowerShell 7 on Windows.' }
if (Test-Path -LiteralPath $OutputPath) { throw 'Refusing to overwrite an existing backup file.' }
$entropy = [Text.Encoding]::UTF8.GetBytes('EventLife database backup v1')
if ($Mode -eq 'Protect') {
    $plain = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $InputPath))
    $key = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $nonce = [Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
    $cipher = [byte[]]::new($plain.Length)
    $tag = [byte[]]::new(16)
    $aes = [Security.Cryptography.AesGcm]::new($key,16)
    try { $aes.Encrypt($nonce,$plain,$cipher,$tag) } finally { $aes.Dispose() }
    $wrapped = [Security.Cryptography.ProtectedData]::Protect($key,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $record = @{ version=1; algorithm='AES-256-GCM'; key=[Convert]::ToBase64String($wrapped);
        nonce=[Convert]::ToBase64String($nonce); tag=[Convert]::ToBase64String($tag); data=[Convert]::ToBase64String($cipher);
        sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($plain)) }
    [IO.File]::WriteAllText($OutputPath,($record | ConvertTo-Json -Compress))
} else {
    $record = Get-Content -LiteralPath $InputPath -Raw | ConvertFrom-Json
    if ($record.version -ne 1 -or $record.algorithm -ne 'AES-256-GCM') { throw 'Unsupported backup envelope.' }
    $key = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($record.key),$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $cipher = [Convert]::FromBase64String($record.data)
    $plain = [byte[]]::new($cipher.Length)
    $aes = [Security.Cryptography.AesGcm]::new($key,16)
    try { $aes.Decrypt([Convert]::FromBase64String($record.nonce),$cipher,[Convert]::FromBase64String($record.tag),$plain) } finally { $aes.Dispose() }
    if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($plain)) -ne $record.sha256) { throw 'Backup hash verification failed.' }
    [IO.File]::WriteAllBytes($OutputPath,$plain)
}
[Security.Cryptography.CryptographicOperations]::ZeroMemory($key)
$acl = Get-Acl -LiteralPath $OutputPath
$acl.SetAccessRuleProtection($true,$false)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','Allow'))
Set-Acl -LiteralPath $OutputPath -AclObject $acl
Write-Output 'BACKUP_ENVELOPE_OK'
