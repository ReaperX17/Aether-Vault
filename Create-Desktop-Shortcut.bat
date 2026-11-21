@echo off
cd /d "%~dp0"
echo Creating Desktop shortcut for AetherVault MTG Deckbuilder...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$WshShell = New-Object -ComObject WScript.Shell; $Desktop = [Environment]::GetFolderPath('Desktop'); $Shortcut = $WshShell.CreateShortcut((Join-Path $Desktop 'AetherVault MTG Deckbuilder.lnk')); $Shortcut.TargetPath = '%~dp0Start-AetherVault.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Description = 'Launch AetherVault MTG Inventory & Deck Builder locally'; $Shortcut.IconLocation = 'shell32.dll,43'; $Shortcut.Save()"
echo.
echo Done! Look on your Windows Desktop for "AetherVault MTG Deckbuilder".
echo You can double-click it anytime to run AetherVault completely offline without tokens!
pause
