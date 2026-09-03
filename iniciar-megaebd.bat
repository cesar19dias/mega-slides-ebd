@echo off
title MegaEBD - Gerador de Slides para EBD
echo.
echo ========================================================
echo   Iniciando MegaEBD (Gerador de Slides EBD)...
echo ========================================================
echo.
cd /d "%~dp0"
start http://localhost:3000
npm run dev
