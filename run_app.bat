@echo off
title Iniciar App de Llamadas con Traducción
echo ===================================================
echo   Iniciando App de Llamadas con Traducción de Voz
echo ===================================================
echo.

cd /d "%~dp0\voice-translate-app"

echo [1/4] Iniciando Backend FastAPI en http://localhost:8000 ...
start "Backend FastAPI (Puerto 8000)" cmd /k "cd /d backend && venv\Scripts\python.exe asgi.py"

timeout /t 3 /nobreak >nul

echo [2/4] Iniciando Frontend Expo en http://localhost:8081 ...
start "Frontend Expo (Puerto 8081)" cmd /k "cd /d frontend && npx expo start --web"

timeout /t 4 /nobreak >nul

echo [3/4] Iniciando Gateway Proxy en http://localhost:3000 ...
start "Gateway Proxy (Puerto 3000)" cmd /k "cd /d frontend && node proxy.js"

timeout /t 2 /nobreak >nul

echo [4/4] Iniciando Tunel Seguro HTTPS (Cloudflare) ...
start "Tunel HTTPS Cloudflare" cmd /k "cloudflared tunnel --url http://localhost:3000"

echo.
echo ===================================================
echo  Servidores iniciados con exito!
echo  - Acceso en tu PC:       http://localhost:8081
echo  - Gateway Unificado:     http://localhost:3000
echo  - Tunel Seguro HTTPS:    (Ver ventana del tunel Cloudflare)
echo ===================================================
echo.
pause
