Set WshShell = CreateObject("WScript.Shell")
strDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir
WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -Command ""Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True
WshShell.Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ""$first = $true; while ($true) { if ($first) { $first = $false; node --no-warnings server/index.mjs --open } else { node --no-warnings server/index.mjs }; Start-Sleep -Seconds 1 }""", 0, False
