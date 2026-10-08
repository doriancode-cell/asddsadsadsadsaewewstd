import asyncio
import base64
import json
import logging
import urllib.request
import websockets

logging.basicConfig(level=logging.INFO)

async def test_backend_integration():
    base_http = "http://localhost:8000"
    base_ws = "ws://localhost:8000"

    # 1. Test Room Creation Endpoint
    req = urllib.request.Request(f"{base_http}/api/rooms/create", method="POST")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        room_id = data["room_id"]
        print(f"✓ Room Created Successfully: {room_id}")

    # 2. Test Get Room Info Endpoint
    with urllib.request.urlopen(f"{base_http}/api/rooms/{room_id}") as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
        assert data["exists"] is True
        print(f"✓ Room Info Verified: {data}")

    # 3. Test WebSockets: Connect Participant A (User A: speaks ES, listens EN)
    uri_a = f"{base_ws}/ws/call/{room_id}/user_a?speak_lang=es&listen_lang=en"
    uri_b = f"{base_ws}/ws/call/{room_id}/user_b?speak_lang=en&listen_lang=es"

    async with websockets.connect(uri_a) as ws_a, websockets.connect(uri_b) as ws_b:
        conn_a = json.loads(await ws_a.recv())
        conn_b = json.loads(await ws_b.recv())
        print(f"✓ Participant A connected: {conn_a}")
        print(f"✓ Participant B connected: {conn_b}")

        # Send dummy WAV audio chunk from User A (Spanish: 'Hola')
        # Generate a silent 1-second 16kHz WAV header + bytes
        sample_rate = 16000
        num_samples = sample_rate * 1
        data_size = num_samples * 2
        header = bytearray()
        header.extend(b'RIFF')
        header.extend((36 + data_size).to_bytes(4, 'little'))
        header.extend(b'WAVEfmt ')
        header.extend((16).to_bytes(4, 'little')) # Subchunk1Size
        header.extend((1).to_bytes(2, 'little'))  # AudioFormat PCM
        header.extend((1).to_bytes(2, 'little'))  # NumChannels 1
        header.extend((sample_rate).to_bytes(4, 'little'))
        header.extend((sample_rate * 2).to_bytes(4, 'little')) # ByteRate
        header.extend((2).to_bytes(2, 'little'))  # BlockAlign
        header.extend((16).to_bytes(2, 'little')) # BitsPerSample
        header.extend(b'data')
        header.extend((data_size).to_bytes(4, 'little'))
        dummy_wav = bytes(header) + b'\x00' * data_size

        audio_b64 = base64.b64encode(dummy_wav).decode('utf-8')

        await ws_a.send(json.dumps({
            "type": "audio_chunk",
            "audio_b64": audio_b64
        }))

        # Send ping to test heartbeat
        await ws_b.send(json.dumps({"type": "ping"}))
        pong = json.loads(await ws_b.recv())
        assert pong["type"] == "pong"
        print("✓ Ping/Pong WebSocket heartbeat verified")

    print("\n🎉 ALL BACKEND INTEGRATION TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(test_backend_integration())
