import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './HomeScreen';
import { CallScreen } from './CallScreen';
import { RoomConfig } from './types';

export default function App() {
  const [activeConfig, setActiveConfig] = useState<RoomConfig | null>(null);

  const handleJoinRoom = (config: RoomConfig) => {
    setActiveConfig(config);
  };

  const handleHangUp = () => {
    setActiveConfig(null);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {activeConfig ? (
        <CallScreen config={activeConfig} onHangUp={handleHangUp} />
      ) : (
        <HomeScreen onJoinRoom={handleJoinRoom} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
});
