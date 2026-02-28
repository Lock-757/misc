import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const METALLIC = {
  chrome: '#C0C0C8',
  silver: '#A8A8B0',
  gunmetal: '#2A2A32',
  darkSteel: '#18181D',
  titanium: '#878792',
  platinum: '#E5E5EA',
  accent: '#6366F1',
};

const THEME_PRESETS = [
  {
    id: 'steel',
    name: 'Steel',
    primary_color: '#6366F1',
    accent_color: '#8B5CF6',
    background_gradient: ['#0A0A0F', '#12121A', '#0A0A0F'],
    chat_bubble_user: '#6366F1',
    chat_bubble_assistant: '#2A2A32',
  },
  {
    id: 'titanium',
    name: 'Titanium',
    primary_color: '#7C7C8A',
    accent_color: '#A8A8B0',
    background_gradient: ['#0D0D12', '#16161D', '#0D0D12'],
    chat_bubble_user: '#7C7C8A',
    chat_bubble_assistant: '#252530',
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    primary_color: '#3B82F6',
    accent_color: '#60A5FA',
    background_gradient: ['#08101A', '#101828', '#08101A'],
    chat_bubble_user: '#3B82F6',
    chat_bubble_assistant: '#1E293B',
  },
  {
    id: 'carbon',
    name: 'Carbon',
    primary_color: '#10B981',
    accent_color: '#34D399',
    background_gradient: ['#0A0F0D', '#121A16', '#0A0F0D'],
    chat_bubble_user: '#10B981',
    chat_bubble_assistant: '#1A2A22',
  },
  {
    id: 'copper',
    name: 'Copper',
    primary_color: '#F59E0B',
    accent_color: '#FBBF24',
    background_gradient: ['#0F0D0A', '#1A1610', '#0F0D0A'],
    chat_bubble_user: '#F59E0B',
    chat_bubble_assistant: '#2A251A',
  },
  {
    id: 'rose',
    name: 'Rose Gold',
    primary_color: '#EC4899',
    accent_color: '#F472B6',
    background_gradient: ['#0F0A0D', '#1A1016', '#0F0A0D'],
    chat_bubble_user: '#EC4899',
    chat_bubble_assistant: '#2A1A22',
  },
];

const ACCENT_COLORS = [
  '#6366F1', '#8B5CF6', '#3B82F6', '#06B6D4', '#10B981',
  '#F59E0B', '#EF4444', '#EC4899', '#7C7C8A', '#A855F7',
];

export default function UIEditorScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('steel');
  const [primaryColor, setPrimaryColor] = useState('#6366F1');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ui-config`);
      setPrimaryColor(res.data.primary_color);
      setAnimationsEnabled(res.data.animations_enabled);
      
      const matchingPreset = THEME_PRESETS.find(
        p => p.primary_color === res.data.primary_color
      );
      if (matchingPreset) {
        setSelectedPreset(matchingPreset.id);
      }
    } catch (error) {
      console.log('Error loading UI config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyPreset = (preset: typeof THEME_PRESETS[0]) => {
    setSelectedPreset(preset.id);
    setPrimaryColor(preset.primary_color);
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const preset = THEME_PRESETS.find(p => p.id === selectedPreset);
      await axios.put(`${API_URL}/api/ui-config`, {
        primary_color: primaryColor,
        accent_color: preset?.accent_color || primaryColor,
        chat_bubble_user: primaryColor,
        animations_enabled: animationsEnabled,
        ...(preset && {
          background_gradient: preset.background_gradient,
          chat_bubble_assistant: preset.chat_bubble_assistant,
        }),
      });
      Alert.alert('Saved', 'UI configuration updated');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrentGradient = () => {
    const preset = THEME_PRESETS.find(p => p.id === selectedPreset);
    return preset?.background_gradient || ['#0A0A0F', '#12121A', '#0A0A0F'];
  };

  if (isLoading) {
    return (
      <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
        <SafeAreaView style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={getCurrentGradient() as any} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Appearance</Text>
          <TouchableOpacity
            onPress={saveConfig}
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            disabled={isSaving}
          >
            <LinearGradient
              colors={[primaryColor, primaryColor + 'DD']}
              style={styles.saveGradient}
            >
              <Text style={styles.saveButtonText}>{isSaving ? '...' : 'Apply'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Preview */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preview</Text>
            <View style={styles.previewCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                style={styles.previewGradient}
              >
                <View style={styles.previewHeader}>
                  <View style={[styles.previewAvatar, { backgroundColor: primaryColor + '30' }]}>
                    <Ionicons name="planet" size={22} color={primaryColor} />
                  </View>
                  <View>
                    <Text style={styles.previewName}>Nova</Text>
                    <View style={styles.previewStatus}>
                      <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.statusText}>Online</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.previewMessages}>
                  <View style={styles.previewBubbleAssistant}>
                    <Text style={styles.bubbleText}>How can I assist you?</Text>
                  </View>
                  <View style={[styles.previewBubbleUser, { backgroundColor: primaryColor }]}>
                    <Text style={styles.bubbleTextUser}>Analyze this data</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Themes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Themes</Text>
            <View style={styles.themeGrid}>
              {THEME_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.themeCard,
                    selectedPreset === preset.id && styles.themeCardSelected,
                  ]}
                  onPress={() => applyPreset(preset)}
                >
                  <LinearGradient
                    colors={preset.background_gradient as any}
                    style={styles.themePreview}
                  >
                    <View style={[styles.themeDot, { backgroundColor: preset.primary_color }]} />
                  </LinearGradient>
                  <Text style={styles.themeName}>{preset.name}</Text>
                  {selectedPreset === preset.id && (
                    <View style={[styles.themeCheck, { backgroundColor: preset.primary_color }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Accent Color */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Accent Color</Text>
            <View style={styles.colorGrid}>
              {ACCENT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    primaryColor === color && styles.colorSelected,
                  ]}
                  onPress={() => {
                    setPrimaryColor(color);
                    setSelectedPreset('');
                  }}
                >
                  {primaryColor === color && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Animations */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setAnimationsEnabled(!animationsEnabled)}
            >
              <View style={styles.toggleInfo}>
                <View style={[styles.toggleIcon, { backgroundColor: primaryColor + '20' }]}>
                  <Ionicons name="sparkles" size={20} color={primaryColor} />
                </View>
                <View style={styles.toggleTextContainer}>
                  <Text style={styles.toggleTitle}>Animations</Text>
                  <Text style={styles.toggleSubtitle}>Smooth transitions</Text>
                </View>
              </View>
              <View
                style={[
                  styles.toggleSwitch,
                  animationsEnabled && { backgroundColor: primaryColor },
                ]}
              >
                <View style={[styles.toggleKnob, animationsEnabled && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: METALLIC.platinum, fontSize: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: METALLIC.platinum, letterSpacing: 0.5 },
  saveButton: { borderRadius: 16, overflow: 'hidden' },
  saveButtonDisabled: { opacity: 0.6 },
  saveGradient: { paddingHorizontal: 18, paddingVertical: 8 },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  scrollContent: { padding: 20 },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewGradient: { padding: 16 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  previewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  previewName: { fontSize: 16, fontWeight: '600', color: METALLIC.platinum },
  previewStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 11, color: METALLIC.titanium, textTransform: 'uppercase', letterSpacing: 1 },
  previewMessages: { gap: 10 },
  previewBubbleAssistant: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
  },
  previewBubbleUser: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  bubbleText: { color: METALLIC.platinum, fontSize: 14 },
  bubbleTextUser: { color: '#fff', fontSize: 14 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  themeCard: {
    width: '47%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  themeCardSelected: { borderColor: METALLIC.accent, borderWidth: 2 },
  themePreview: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeDot: { width: 20, height: 20, borderRadius: 10 },
  themeName: {
    color: METALLIC.platinum,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 10,
  },
  themeCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSelected: { borderWidth: 3, borderColor: '#fff' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toggleInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTextContainer: { gap: 2 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: METALLIC.platinum },
  toggleSubtitle: { fontSize: 12, color: METALLIC.titanium },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: METALLIC.gunmetal,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  toggleKnobActive: { alignSelf: 'flex-end' },
  bottomSpacing: { height: 40 },
});
