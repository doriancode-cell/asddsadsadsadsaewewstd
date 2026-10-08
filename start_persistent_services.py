#!/usr/bin/env python3
import subprocess
import time
import os
import sys

def run_persistent_services():
    print("Starting background service supervisor...")

    # 1. Start FastAPI Backend (Port 8000)
    subprocess.Popen(
        ["python3", "/app/voice-translate-app/backend/asgi.py"],
        stdout=open("/tmp/asgi_backend.log", "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True
    )

    # 2. Start Expo Frontend Web (Port 8081)
    subprocess.Popen(
        ["npx", "expo", "start", "--web", "--port", "8081"],
        cwd="/app/voice-translate-app/frontend",
        stdout=open("/tmp/expo_frontend.log", "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True
    )

    time.sleep(3)

    # 3. Start Gateway Proxy (Port 3000)
    subprocess.Popen(
        ["node", "/app/voice-translate-app/frontend/proxy.js"],
        stdout=open("/tmp/proxy_gateway.log", "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True
    )

    # 4. Start Cloudflare Tunnel (Port 3000)
    subprocess.Popen(
        ["npx", "--yes", "cloudflared", "tunnel", "--url", "http://localhost:3000"],
        stdout=open("/tmp/cloudflared_gateway.log", "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True
    )

if __name__ == "__main__":
    run_persistent_services()
