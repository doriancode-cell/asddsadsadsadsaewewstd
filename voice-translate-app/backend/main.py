import base64
import asyncio
import logging
import uuid
import secrets
import string
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from audio_processor import (
    transcribe_audio_bytes,
    translate_text,
    synthesize_speech,
    LANGUAGE_VOICES,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(title="Voice Translation App Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Participant:
    def __init__(self, participant_id: str, speak_lang: str, listen_lang: str, websocket: WebSocket):
        self.participant_id = participant_id
        self.speak_lang = speak_lang
        self.listen_lang = listen_lang
        self.websocket = websocket


class Room:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.participants: Dict[str, Participant] = {}

    def add_participant(self, participant: Participant):
        self.participants[participant.participant_id] = participant

    def remove_participant(self, participant_id: str):
        if participant_id in self.participants:
            del self.participants[participant_id]


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def create_room(self) -> str:
        # Generate random 6-character room code like "ABC-123"
        letters = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(3))
        digits = ''.join(secrets.choice(string.digits) for _ in range(3))
        room_id = f"{letters}-{digits}"
        while room_id in self.rooms:
            letters = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(3))
            digits = ''.join(secrets.choice(string.digits) for _ in range(3))
            room_id = f"{letters}-{digits}"

        self.rooms[room_id] = Room(room_id)
        return room_id

    def get_room(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id.upper())


room_manager = RoomManager()


class CreateRoomResponse(BaseModel):
    room_id: str


class RoomInfoResponse(BaseModel):
    room_id: str
    participant_count: int
    exists: bool


@app.post("/api/rooms/create", response_model=CreateRoomResponse)
async def create_room():
    room_id = room_manager.create_room()
    return CreateRoomResponse(room_id=room_id)


@app.get("/api/rooms/{room_id}", response_model=RoomInfoResponse)
async def get_room_info(room_id: str):
    room = room_manager.get_room(room_id)
    if not room:
        return RoomInfoResponse(room_id=room_id, participant_count=0, exists=False)
    return RoomInfoResponse(room_id=room.room_id, participant_count=len(room.participants), exists=True)


@app.websocket("/ws/call/{room_id}/{participant_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    participant_id: str,
    speak_lang: str = "en",
    listen_lang: str = "es"
):
    await websocket.accept()
    room_id = room_id.upper()

    room = room_manager.get_room(room_id)
    if not room:
        # Auto-create room if joining non-existent ID or normalized
        room = Room(room_id)
        room_manager.rooms[room_id] = room

    participant = Participant(
        participant_id=participant_id,
        speak_lang=speak_lang,
        listen_lang=listen_lang,
        websocket=websocket
    )
    room.add_participant(participant)
    logger.info(f"Participant {participant_id} joined room {room_id} (speak: {speak_lang}, listen: {listen_lang})")

    # Notify participant of successful connection
    await websocket.send_json({
        "type": "connection_established",
        "room_id": room_id,
        "participant_id": participant_id,
        "participants_in_room": len(room.participants)
    })

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")

            if event_type == "audio_chunk":
                audio_b64 = data.get("audio_b64")
                if not audio_b64:
                    continue

                try:
                    audio_bytes = base64.b64decode(audio_b64)
                except Exception as e:
                    logger.error(f"Base64 decode error: {e}")
                    continue

                # 1. Transcribe audio chunk in background thread
                original_text = await asyncio.to_thread(
                    transcribe_audio_bytes, audio_bytes, participant.speak_lang
                )

                if not original_text or not original_text.strip():
                    continue

                logger.info(f"[{room_id}] {participant_id} said: '{original_text}'")

                # Send original transcription back to sender for immediate feedback
                await websocket.send_json({
                    "type": "self_transcription",
                    "sender_id": participant_id,
                    "original_text": original_text,
                    "speak_lang": participant.speak_lang
                })

                # 2. Process translation and TTS for all other participants in the room
                other_participants = [
                    p for p in room.participants.values() if p.participant_id != participant_id
                ]

                for listener in other_participants:
                    target_lang = listener.listen_lang

                    # Translate text to listener's listening language
                    translated_text = await asyncio.to_thread(
                        translate_text, original_text, participant.speak_lang, target_lang
                    )

                    # Synthesize translated speech
                    tts_audio_bytes = await synthesize_speech(translated_text, target_lang)
                    tts_audio_b64 = base64.b64encode(tts_audio_bytes).decode("utf-8") if tts_audio_bytes else ""

                    # Send payload to listener
                    payload = {
                        "type": "translated_audio",
                        "sender_id": participant_id,
                        "original_text": original_text,
                        "translated_text": translated_text,
                        "source_lang": participant.speak_lang,
                        "target_lang": target_lang,
                        "tts_audio_b64": tts_audio_b64
                    }

                    try:
                        await listener.websocket.send_json(payload)
                    except Exception as send_err:
                        logger.error(f"Error sending payload to listener {listener.participant_id}: {send_err}")

            elif event_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info(f"Participant {participant_id} disconnected from room {room_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {participant_id}: {e}")
    finally:
        room.remove_participant(participant_id)
        if len(room.participants) == 0:
            if room_id in room_manager.rooms:
                del room_manager.rooms[room_id]
