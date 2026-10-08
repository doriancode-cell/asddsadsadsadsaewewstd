export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'zh', name: 'Chino Mandarín', flag: '🇨🇳' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
];

export interface RoomConfig {
  roomId: string;
  speakLang: string;
  listenLang: string;
  serverUrl: string;
}

export interface SubtitleMessage {
  id: string;
  senderId: string;
  isSelf: boolean;
  originalText: string;
  translatedText?: string;
  timestamp: string;
}

export interface TranslatedAudioPayload {
  type: 'translated_audio';
  sender_id: string;
  original_text: string;
  translated_text: string;
  source_lang: string;
  target_lang: string;
  tts_audio_b64: string;
}

export interface SelfTranscriptionPayload {
  type: 'self_transcription';
  sender_id: string;
  original_text: string;
  speak_lang: string;
}

export interface ConnectionEstablishedPayload {
  type: 'connection_established';
  room_id: string;
  participant_id: string;
  participants_in_room: number;
}
