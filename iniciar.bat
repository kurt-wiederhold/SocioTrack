@echo off
rem Levanta la app en este PC y la abre en Microsoft Edge.
rem Requisitos: WSL (Ubuntu) con PHP y MariaDB, Node.js, y "npm install" ya hecho en frontend.
chcp 65001 >nul
cd /d "%~dp0"

echo Iniciando API (PHP en WSL)... la base MariaDB arranca sola con WSL.
start "Africa Dream - API (no cerrar)" wsl -d Ubuntu -- php -S 127.0.0.1:8000 -t backend/public backend/public/index.php

echo Iniciando pagina (Vite)...
start "Africa Dream - Pagina (no cerrar)" cmd /k npm --prefix frontend run dev -- --port 5173 --strictPort

echo Esperando que la pagina este lista...
timeout /t 6 /nobreak >nul
start "" msedge "http://localhost:5173"

echo.
echo Listo. Para detener todo, cierra las ventanas "API" y "Pagina".
timeout /t 5 >nul
