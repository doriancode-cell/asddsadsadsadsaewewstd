#!/usr/bin/env python3
import subprocess
import time
import os
import sys

def run_persistent_services():
    print("Starting background service supervisor...")

    # 1. Start La Centena Clothes Web Server (Port 8080)
    subprocess.Popen(
        ["node", "/app/la-centena-clothes/server.js"],
        stdout=open("/tmp/la_centena_server.log", "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True
    )

    time.sleep(1)

    # 2. Start Cloudflare Tunnel for La Centena Clothes (Port 8080)
    subprocess.Popen(
        ["npx", "--yes", "cloudflared", "tunnel", "--url", "http://localhost:8080"],
        stdout=open("/tmp/la_centena_tunnel.log", "a"),
        stderr=subprocess.STDOUT,
        start_new_session=True
    )

if __name__ == "__main__":
    run_persistent_services()
