import io
import os
import tempfile
import asyncio
import logging
from typing import Optional, Dict
from deep_translator import MyMemoryTranslator, GoogleTranslator
import edge_tts
from faster_whisper import WhisperModel

logger = logging.getLogger("audio_processor")
logger.setLevel(logging.INFO)

# Map supported language code (2-char) to Edge-TTS Voice Name
LANGUAGE_VOICES: Dict[str, str] = {
    "en": "en-US-GuyNeural",
    "es": "es-ES-AlvaroNeural",
    "zh": "zh-CN-YunxiNeural",
    "fr": "fr-FR-HenriNeural",
    "ar": "ar-SA-HamedNeural",
    "pt": "pt-BR-AntonioNeural",
    "ja": "ja-JP-KeitaNeural",
}

# Map supported language code (2-char) to MyMemoryTranslator language tags
MYMEMORY_LANG_MAP: Dict[str, str] = {
    "en": "en-US",
    "es": "es-ES",
    "zh": "zh-CN",
    "fr": "fr-FR",
    "ar": "ar-SA",
    "pt": "pt-BR",
    "ja": "ja-JP",
}

# Global Whisper model instance (lazy loaded)
_whisper_model: Optional[WhisperModel] = None

def get_whisper_model() -> WhisperModel:
    global _whisper_model
    if _whisper_model is None:
        logger.info("Loading faster-whisper 'tiny' model...")
        # Use CPU with int8 quantization for lightweight fast inference
        _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _whisper_model


def detect_audio_suffix(audio_bytes: bytes) -> str:
    if audio_bytes.startswith(b"\x1a\x45\xdf\xa3"):
        return ".webm"
    elif audio_bytes.startswith(b"OggS"):
        return ".ogg"
    elif audio_bytes.startswith(b"RIFF"):
        return ".wav"
    elif b"ftyp" in audio_bytes[:32]:
        return ".m4a"
    elif audio_bytes.startswith(b"ID3") or (len(audio_bytes) > 2 and audio_bytes[0] == 0xFF and (audio_bytes[1] & 0xE0) == 0xE0):
        return ".mp3"
    return ".webm"


def transcribe_audio_bytes(audio_bytes: bytes, language_hint: Optional[str] = None) -> str:
    """
    Transcribes raw audio bytes (PCM/WAV/WebM/m4a/etc.) using faster-whisper with VAD filter.
    Returns the recognized text string.
    """
    if not audio_bytes or len(audio_bytes) == 0:
        return ""

    model = get_whisper_model()
    suffix = detect_audio_suffix(audio_bytes)

    # Write bytes to temporary file for Whisper processing
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        lang = language_hint if language_hint in LANGUAGE_VOICES else None
        segments, info = model.transcribe(
            tmp_path,
            language=lang,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            beam_size=1,
        )
        text_segments = [segment.text.strip() for segment in segments if segment.text.strip()]
        full_text = " ".join(text_segments).strip()
        return full_text
    except Exception as e:
        logger.error(f"Error during audio transcription: {e}")
        return ""
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translates text from source_lang to target_lang using MyMemoryTranslator
    with GoogleTranslator fallback.
    """
    if not text or not text.strip():
        return ""
    if source_lang == target_lang:
        return text.strip()

    src_mm = MYMEMORY_LANG_MAP.get(source_lang, source_lang)
    tgt_mm = MYMEMORY_LANG_MAP.get(target_lang, target_lang)

    # Primary translation: MyMemory
    try:
        translator = MyMemoryTranslator(source=src_mm, target=tgt_mm)
        translated = translator.translate(text)
        if translated and translated.strip():
            return translated.strip()
    except Exception as e:
        logger.warning(f"MyMemory translation failed: {e}. Trying GoogleTranslator...")

    # Fallback translation: GoogleTranslator
    try:
        translator = GoogleTranslator(source=source_lang, target=target_lang)
        translated = translator.translate(text)
        if translated and translated.strip():
            return translated.strip()
    except Exception as e:
        logger.error(f"GoogleTranslator fallback failed: {e}")

    return text.strip()


async def synthesize_speech(text: str, target_lang: str) -> bytes:
    """
    Synthesizes speech for text in target_lang using edge-tts.
    Returns MP3 audio bytes.
    """
    if not text or not text.strip():
        return b""

    voice = LANGUAGE_VOICES.get(target_lang, "en-US-GuyNeural")
    try:
        communicate = edge_tts.Communicate(text, voice)
        audio_buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])
        return audio_buffer.getvalue()
    except Exception as e:
        logger.error(f"Error during edge-tts synthesis: {e}")
        return b""
