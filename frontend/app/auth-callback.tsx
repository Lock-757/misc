import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Platform } from 'react-native';

const METALLIC = {
  platinum: '#E5E5EA',
  titanium: '#878792',
  accent: '#6366F1',
};

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { handleGoogleCallback } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processCallback = async () => {
      if (Platform.OS !== 'web') {
        router.replace('/login');
        return;
      }

      // Extract session_id from URL fragment
      const hash = window.location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (sessionIdMatch && sessionIdMatch[1]) {
        const sessionId = sessionIdMatch[1];
        
        try {
          await handleGoogleCallback(sessionId);
          // Clear the hash and redirect to home
          window.history.replaceState(null, '', window.location.pathname);
          router.replace('/');
        } catch (error) {
          console.error('Google auth callback error:', error);
          router.replace('/login');
        }
      } else {
        // No session_id found, redirect to login
        router.replace('/login');
      }
    };

    processCallback();
  }, []);

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <ActivityIndicator size="large" color={METALLIC.accent} />
      <Text style={styles.text}>Authenticating...</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: METALLIC.titanium,
  },
});
