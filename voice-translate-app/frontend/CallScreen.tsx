import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import {
  RoomConfig,
  SubtitleMessage,
  TranslatedAudioPayload,
  SelfTranscriptionPayload,
  ConnectionEstablishedPayload,
  SUPPORTED_LANGUAGES,
} from './types';

interface CallScreenProps {
  config: RoomConfig;
  onHangUp: () => void;
}

export const CallScreen: React.FC<CallScreenProps> = ({ config, onHangUp }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(false);
  const [subtitles, setSubtitles] = useState<SubtitleMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState<boolean>(true);

  const wsRef = useRef<WebSocket | null>(null);
  const activeRecordingRef = useRef<Audio.Recording | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const participantIdRef = useRef<string>(`user_${Math.random().toString(36).substring(2, 9)}`);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const currentSoundRef = useRef<Audio.Sound | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);

  const speakLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === config.speakLang);
  const listenLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === config.listenLang);

  useEffect(() => {
    setupAudioAndConnect();

    return () => {
      cleanupCall();
    };
  }, []);

  const setupAudioAndConnect = async () => {
    let micGranted = false;
    try {
      const isWeb = Platform.OS === 'web' || typeof window !== 'undefined';
      if (
        isWeb &&
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        setErrorMessage(
          '⚠️ Modo Solo Escuchar: Los navegadores móviles bloquean el micrófono en páginas HTTP. Para hablar con tu voz abre dos pestañas en la PC o usa HTTPS.'
        );
      }

      try {
        const permission = await Audio.requestPermissionsAsync();
        micGranted = permission.status === 'granted';
      } catch (pErr) {
        console.warn('Error al solicitar permiso de micrófono:', pErr);
        micGranted = false;
      }

      if (!micGranted) {
        setHasMicPermission(false);
        if (!errorMessage) {
          setErrorMessage(
            'Micrófono no disponible. Puedes escuchar la llamada y leer subtítulos traducidos.'
          );
        }
      } else {
        setHasMicPermission(true);
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
          });
        } catch (audioModeErr) {
          console.warn('Error configurando modo de audio:', audioModeErr);
        }
      }
    } catch (e) {
      console.error('Failed to setup audio:', e);
    } finally {
      // Connect WebSocket regardless of mic permission so the user enters the room!
      connectWebSocket(micGranted);
    }
  };

  const connectWebSocket = (recordingAllowed: boolean = true) => {
    let wsUrl = config.serverUrl.replace(/^http/, 'ws');
    const fullWsUrl = `${wsUrl}/ws/call/${config.roomId}/${participantIdRef.current}?speak_lang=${config.speakLang}&listen_lang=${config.listenLang}`;

    console.log('Connecting to WebSocket:', fullWsUrl);
    const ws = new WebSocket(fullWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket Connection Opened');
      setIsConnected(true);
      if (recordingAllowed) {
        startChunkRecording();
      }
      // Heartbeat ping every 10 seconds to keep WebSocket active
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        }
      }, 10000);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        handleIncomingMessage(data);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = (e) => {
      console.error('WebSocket Error:', e);
      setErrorMessage(`No se pudo conectar con el servidor (${config.serverUrl}).`);
    };

    ws.onclose = () => {
      console.log('WebSocket Closed');
      setIsConnected(false);
    };
  };

  const handleIncomingMessage = (data: any) => {
    if (data.type === 'connection_established') {
      const payload = data as ConnectionEstablishedPayload;
      setParticipantCount(payload.participants_in_room);
    } else if (data.type === 'self_transcription') {
      const payload = data as SelfTranscriptionPayload;
      const newSubtitle: SubtitleMessage = {
        id: Math.random().toString(),
        senderId: payload.sender_id,
        isSelf: true,
        originalText: payload.original_text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setSubtitles((prev) => [...prev, newSubtitle]);
    } else if (data.type === 'translated_audio') {
      const payload = data as TranslatedAudioPayload;
      const newSubtitle: SubtitleMessage = {
        id: Math.random().toString(),
        senderId: payload.sender_id,
        isSelf: false,
        originalText: payload.original_text,
        translatedText: payload.translated_text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setSubtitles((prev) => [...prev, newSubtitle]);

      if (payload.tts_audio_b64) {
        audioQueueRef.current.push(payload.tts_audio_b64);
        processAudioQueue();
      }
    }
  };

  const processAudioQueue = async () => {
    if (isPlayingRef.current || isSpeakerMuted || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingRef.current = true;
    const nextAudioB64 = audioQueueRef.current.shift();

    if (!nextAudioB64) {
      isPlayingRef.current = false;
      return;
    }

    try {
      let soundUri: string;

      if (Platform.OS === 'web') {
        soundUri = `data:audio/mp3;base64,${nextAudioB64}`;
      } else {
        // Cross-platform native support (iOS & Android):
        // Write base64 audio to temporary local file, as native MediaPlayer/AVPlayer doesn't support data: URIs
        const fileUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(fileUri, nextAudioB64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        soundUri = fileUri;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: soundUri },
        { shouldPlay: true }
      );
      currentSoundRef.current = sound;

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.isLoaded && status.didJustFinish) {
          await sound.unloadAsync();
          if (Platform.OS !== 'web' && soundUri.startsWith(FileSystem.cacheDirectory || '')) {
            try {
              await FileSystem.deleteAsync(soundUri, { idempotent: true });
            } catch (e) {}
          }
          currentSoundRef.current = null;
          isPlayingRef.current = false;
          processAudioQueue();
        }
      });
    } catch (e) {
      console.error('Error playing TTS audio:', e);
      isPlayingRef.current = false;
      processAudioQueue();
    }
  };

  const startChunkRecording = async () => {
    // Start first chunk and store it in the ref so cycleRecordingChunk can find it
    const firstRecording = await startNewRecording();
    if (firstRecording) {
      activeRecordingRef.current = firstRecording;
      console.log('[Audio] First recording chunk started');
    } else {
      console.warn('[Audio] Could not start first recording chunk');
    }
    // Every 4s: stop current chunk, send it to backend, start a new one
    recordingIntervalRef.current = setInterval(() => {
      cycleRecordingChunk();
    }, 4000);
  };

  const startNewRecording = async (): Promise<Audio.Recording | null> => {
    if (isMuted) return null;
    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      console.log('[Audio] New recording chunk created');
      return recording;
    } catch (e) {
      console.error('[Audio] Error creating recording:', e);
      return null;
    }
  };

  const cycleRecordingChunk = async () => {
    if (isMuted) return;

    const prevRecording = activeRecordingRef.current;

    // 1. Stop and extract audio from previous chunk first
    if (prevRecording) {
      try {
        await prevRecording.stopAndUnloadAsync();
      } catch (e) {
        console.error('[Audio] Error stopping previous recording:', e);
      }
    }

    // 2. Spin up new recording session
    activeRecordingRef.current = await startNewRecording();

    if (prevRecording) {
      try {
        const uri = prevRecording.getURI();
        console.log('[Audio] Chunk URI:', uri);

        if (uri && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          let b64 = '';
          if (Platform.OS === 'web') {
            const response = await fetch(uri);
            const blob = await response.blob();
            console.log('[Audio] Blob type:', blob.type, 'size:', blob.size);
            b64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const res = reader.result as string;
                resolve(res.includes(',') ? res.split(',')[1] : res);
              };
              reader.readAsDataURL(blob);
            });
          } else {
            b64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            try {
              await FileSystem.deleteAsync(uri, { idempotent: true });
            } catch (e) {}
          }

          if (b64) {
            console.log('[Audio] Sending chunk, b64 length:', b64.length);
            wsRef.current?.send(
              JSON.stringify({
                type: 'audio_chunk',
                audio_b64: b64,
              })
            );
          } else {
            console.warn('[Audio] b64 was empty, not sending chunk');
          }
        } else {
          console.warn('[Audio] Cannot send chunk: uri=', !!uri, 'ws state=', wsRef.current?.readyState);
        }
      } catch (e) {
        console.error('[Audio] Error processing audio chunk:', e);
      }
    } else {
      console.warn('[Audio] cycleRecordingChunk: prevRecording was null');
    }
  };

  const cleanupCall = async () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (activeRecordingRef.current) {
      try {
        await activeRecordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      activeRecordingRef.current = null;
    }

    if (currentSoundRef.current) {
      try {
        await currentSoundRef.current.stopAsync();
        await currentSoundRef.current.unloadAsync();
      } catch (e) {}
      currentSoundRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleEndCall = () => {
    cleanupCall();
    onHangUp();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.roomBadge}>
          <View style={[styles.statusDot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
          <Text style={styles.roomCodeText}>Sala: {config.roomId}</Text>
        </View>

        <View style={styles.participantsBadge}>
          <Text style={styles.participantsText}>
            👥 {participantCount} {participantCount === 1 ? 'Participante' : 'Participantes'}
          </Text>
        </View>
      </View>

      {/* Language Bar */}
      <View style={styles.languageBar}>
        <View style={styles.langTag}>
          <Text style={styles.langLabel}>Hablas:</Text>
          <Text style={styles.langValue}>
            {speakLangObj?.flag} {speakLangObj?.name}
          </Text>
        </View>
        <Text style={styles.langArrow}>➔</Text>
        <View style={styles.langTag}>
          <Text style={styles.langLabel}>Escuchas:</Text>
          <Text style={styles.langValue}>
            {listenLangObj?.flag} {listenLangObj?.name}
          </Text>
        </View>
      </View>

      {/* Notice / Permission Banner */}
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.errorBannerClose}
            onPress={() => setErrorMessage(null)}
          >
            <Text style={styles.errorBannerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Live Subtitles & Captions Stream */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.subtitlesContainer}
        contentContainerStyle={styles.subtitlesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {subtitles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🎙️</Text>
            <Text style={styles.emptyStateTitle}>Llamada En Vivo Conectada</Text>
            <Text style={styles.emptyStateSub}>
              Habla con normalidad. Tu voz será traducida y reproducida automáticamente en tiempo real.
            </Text>
          </View>
        ) : (
          subtitles.map((item) => (
            <View
              key={item.id}
              style={[
                styles.messageBubble,
                item.isSelf ? styles.bubbleSelf : styles.bubblePeer,
              ]}
            >
              <Text style={styles.bubbleSender}>
                {item.isSelf ? 'Tú (Original)' : 'Interlocutor (Traducido)'} • {item.timestamp}
              </Text>

              {item.translatedText ? (
                <>
                  <Text style={styles.translatedText}>{item.translatedText}</Text>
                  <Text style={styles.originalTextDimmed}>"{item.originalText}"</Text>
                </>
              ) : (
                <Text style={styles.originalText}>{item.originalText}</Text>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Bottom Control Bar */}
      <View style={styles.controlsBar}>
        {/* Mute Mic */}
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={() => setIsMuted(!isMuted)}
        >
          <Text style={styles.controlIcon}>{isMuted ? '🎙️❌' : '🎙️'}</Text>
          <Text style={styles.controlLabel}>{isMuted ? 'Silenciado' : 'Mic'}</Text>
        </TouchableOpacity>

        {/* Mute Speaker */}
        <TouchableOpacity
          style={[styles.controlButton, isSpeakerMuted && styles.controlButtonActive]}
          onPress={() => setIsSpeakerMuted(!isSpeakerMuted)}
        >
          <Text style={styles.controlIcon}>{isSpeakerMuted ? '🔇' : '🔊'}</Text>
          <Text style={styles.controlLabel}>{isSpeakerMuted ? 'Audio Off' : 'Voz TTS'}</Text>
        </TouchableOpacity>

        {/* Hang Up */}
        <TouchableOpacity style={styles.hangUpButton} onPress={handleEndCall}>
          <Text style={styles.hangUpIcon}>📞</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotConnected: {
    backgroundColor: '#22C55E',
  },
  dotDisconnected: {
    backgroundColor: '#EF4444',
  },
  roomCodeText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 14,
  },
  participantsBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  participantsText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  languageBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  langTag: {
    alignItems: 'center',
  },
  langLabel: {
    color: '#64748B',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  langValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  langArrow: {
    color: '#3B82F6',
    fontSize: 16,
    marginHorizontal: 16,
  },
  subtitlesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  subtitlesContent: {
    paddingVertical: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyStateSub: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  messageBubble: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    maxWidth: '85%',
  },
  bubbleSelf: {
    backgroundColor: '#1E293B',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bubblePeer: {
    backgroundColor: '#1E3A8A',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  bubbleSender: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 4,
  },
  translatedText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  originalTextDimmed: {
    color: '#94A3B8',
    fontSize: 13,
    fontStyle: 'italic',
  },
  originalText: {
    color: '#F8FAFC',
    fontSize: 15,
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#334155',
  },
  controlButtonActive: {
    backgroundColor: '#EF4444',
  },
  controlIcon: {
    fontSize: 22,
  },
  controlLabel: {
    color: '#E2E8F0',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '500',
  },
  hangUpButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DC2626',
  },
  hangUpIcon: {
    fontSize: 26,
    color: '#FFFFFF',
    transform: [{ rotate: '135deg' }],
  },
  errorBanner: {
    backgroundColor: '#3B2D14',
    borderColor: '#EAB308',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBannerText: {
    color: '#FEF08A',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  errorBannerClose: {
    marginLeft: 10,
    padding: 4,
  },
  errorBannerCloseText: {
    color: '#FEF08A',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
