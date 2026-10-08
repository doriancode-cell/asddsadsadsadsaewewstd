import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
import { SUPPORTED_LANGUAGES, RoomConfig, LanguageOption } from './types';

interface HomeScreenProps {
  onJoinRoom: (config: RoomConfig) => void;
}

const getDefaultServerUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const port = window.location.port;
    if (!port || port === '80' || port === '443' || port === '3000') {
      return window.location.origin;
    }
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:8000`;
  }
  return 'http://192.168.100.101:8000';
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ onJoinRoom }) => {
  const [speakLang, setSpeakLang] = useState<string>('es');
  const [listenLang, setListenLang] = useState<string>('en');
  const [inputRoomId, setInputRoomId] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>(getDefaultServerUrl());
  const [showServerConfig, setShowServerConfig] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  const generateRoomCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';
    let letters = '';
    let digits = '';
    for (let i = 0; i < 3; i++) {
      letters += chars.charAt(Math.floor(Math.random() * chars.length));
      digits += nums.charAt(Math.floor(Math.random() * nums.length));
    }
    return `${letters}-${digits}`;
  };

  const handleCreateRoom = async () => {
    setHomeError(null);
    setLoading(true);
    const formattedUrl = serverUrl.replace(/\/$/, '');
    try {
      const response = await fetch(`${formattedUrl}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        onJoinRoom({
          roomId: data.room_id,
          speakLang,
          listenLang,
          serverUrl: formattedUrl,
        });
      } else {
        const newCode = generateRoomCode();
        onJoinRoom({
          roomId: newCode,
          speakLang,
          listenLang,
          serverUrl: formattedUrl,
        });
      }
    } catch (e: any) {
      console.warn('Error connecting to backend on create room:', e);
      const newCode = generateRoomCode();
      onJoinRoom({
        roomId: newCode,
        speakLang,
        listenLang,
        serverUrl: formattedUrl,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = () => {
    setHomeError(null);
    const cleanedCode = inputRoomId.trim().toUpperCase();
    if (!cleanedCode) {
      setHomeError('Por favor ingresa un código de sala válido (ej. ABC-123).');
      return;
    }
    const formattedUrl = serverUrl.replace(/\/$/, '');
    onJoinRoom({
      roomId: cleanedCode,
      speakLang,
      listenLang,
      serverUrl: formattedUrl,
    });
  };

  const renderLanguageChips = (
    selectedCode: string,
    onSelect: (code: string) => void
  ) => {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
        {SUPPORTED_LANGUAGES.map((lang: LanguageOption) => {
          const isSelected = selectedCode === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(lang.code)}
            >
              <Text style={styles.chipFlag}>{lang.flag}</Text>
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {lang.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appTitle}>🎙️ Voice Translate</Text>
          <Text style={styles.appSubtitle}>
            Llamadas 1 a 1 con traducción de voz hiperrealista en tiempo real
          </Text>
        </View>

        {/* Section 1: Speak Language */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗣️ Tu Idioma Nativo (Hablar):</Text>
          {renderLanguageChips(speakLang, setSpeakLang)}
        </View>

        {/* Section 2: Listen Language */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎧 Idioma de Escucha (Traducción):</Text>
          {renderLanguageChips(listenLang, setListenLang)}
        </View>

        {/* Action Card */}
        <View style={styles.card}>
          {homeError && (
            <View style={styles.errorAlert}>
              <Text style={styles.errorAlertText}>⚠️ {homeError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleCreateRoom}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'Creando...' : '✨ Crear Nueva Sala'}
            </Text>
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o unirse con código</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.joinRow}>
            <TextInput
              style={styles.input}
              placeholder="Ej. ABC-123"
              placeholderTextColor="#64748B"
              value={inputRoomId}
              onChangeText={setInputRoomId}
              autoCapitalize="characters"
              maxLength={7}
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={handleJoinRoom}>
              <Text style={styles.secondaryButtonText}>Unirse</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Server Config Toggle */}
        <TouchableOpacity
          style={styles.configToggle}
          onPress={() => setShowServerConfig(!showServerConfig)}
        >
          <Text style={styles.configToggleText}>
            ⚙️ {showServerConfig ? 'Ocultar' : 'Configurar'} Servidor Backend
          </Text>
        </TouchableOpacity>

        {showServerConfig && (
          <View style={styles.serverConfigCard}>
            <Text style={styles.serverConfigLabel}>URL del Servidor FastAPI:</Text>
            <TextInput
              style={styles.serverInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://10.0.2.2:8000"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.serverConfigHint}>
              Ejemplos: http://10.0.2.2:8000 (Android Emulator), http://localhost:8000 (Web/iOS), o tu IP local.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 10,
  },
  chipContainer: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  chipFlag: {
    fontSize: 16,
    marginRight: 6,
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#64748B',
    paddingHorizontal: 10,
    fontSize: 13,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 16,
    marginRight: 10,
  },
  secondaryButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  configToggle: {
    marginTop: 24,
    alignItems: 'center',
  },
  configToggleText: {
    color: '#64748B',
    fontSize: 14,
  },
  errorAlert: {
    backgroundColor: '#3B2D14',
    borderColor: '#EAB308',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  errorAlertText: {
    color: '#FEF08A',
    fontSize: 13,
    textAlign: 'center',
  },
  serverConfigCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  serverConfigLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 6,
  },
  serverInput: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 14,
  },
  serverConfigHint: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 6,
  },
});
