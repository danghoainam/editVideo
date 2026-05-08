@echo off
echo Dang quet sach cac ban cu va khoi dong lai...
taskkill /f /im node.exe >nul 2>&1
echo Da don dep xong. Dang khoi dong Video Pro Editor ban moi nhat...
start http://localhost:3000
node server.js
pause
