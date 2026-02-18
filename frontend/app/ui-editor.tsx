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

const THEME_PRESETS = [
  {
    id: 'midnight',
    name: 'Midnight Purple',
    primary_color: '#8B5CF6',
    accent_color: '#06B6D4',
    background_gradient: ['#0F0F1A', '#1A1A2E', '#16213E'],
    chat_bubble_user: '#8B5CF6',
    chat_bubble_assistant: '#1E1E2E',
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    primary_color: '#3B82F6',
    accent_color: '#10B981',
    background_gradient: ['#0A1628', '#1E3A5F', '#0F4C81'],
    chat_bubble_user: '#3B82F6',
    chat_bubble_assistant: '#1A2D4A',
  },
  {
    id: 'sunset',
    name: 'Sunset Glow',
    primary_color: '#F59E0B',
    accent_color: '#EF4444',
    background_gradient: ['#1A0F0F', '#2D1F1F', '#3D2A2A'],
    chat_bubble_user: '#F59E0B',
    chat_bubble_assistant: '#2A1A1A',
  },
  {
    id: 'forest',
    name: 'Forest Night',
    primary_color: '#10B981',
    accent_color: '#84CC16',
    background_gradient: ['#0A1A14', '#142E23', '#1A3D2E'],
    chat_bubble_user: '#10B981',
    chat_bubble_assistant: '#152E22',
  },
  {
    id: 'rose',
    name: 'Rose Gold',
    primary_color: '#EC4899',
    accent_color: '#F472B6',
    background_gradient: ['#1A0F14', '#2D1A22', '#3D2430'],
    chat_bubble_user: '#EC4899',
    chat_bubble_assistant: '#2A1520',
  },
  {
    id: 'cyber',
    name: 'Cyberpunk',
    primary_color: '#06B6D4',
    accent_color: '#F43F5E',
    background_gradient: ['#0A0F14', '#14202E', '#1A2A3D'],
    chat_bubble_user: '#06B6D4',
    chat_bubble_assistant: '#15202A',
  },
];

const PRIMARY_COLORS = [
  '#8B5CF6', '#3B82F6', '#06B6D4', '#10B981', '#84CC16',
  '#F59E0B', '#EF4444', '#F43F5E', '#EC4899', '#A855F7',
];

const ACCENT_COLORS = [
  '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899',
  '#8B5CF6', '#3B82F6', '#84CC16', '#F472B6', '#A855F7',
];

interface UIConfig {
  id: string;
  theme: string;
  primary_color: string;
  accent_color: string;
  background_gradient: string[];
  chat_bubble_user: string;
  chat_bubble_assistant: string;
  font_size: string;
  animations_enabled: boolean;
}

export default function UIEditorScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<UIConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Custom settings
  const [primaryColor, setPrimaryColor] = useState('#8B5CF6');
  const [accentColor, setAccentColor] = useState('#06B6D4');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ui-config`);
      setConfig(res.data);
      setPrimaryColor(res.data.primary_color);
      setAccentColor(res.data.accent_color);
      setAnimationsEnabled(res.data.animations_enabled);
      
      // Check if current config matches a preset
      const matchingPreset = THEME_PRESETS.find(
        p => p.primary_color === res.data.primary_color &&
             JSON.stringify(p.background_gradient) === JSON.stringify(res.data.background_gradient)
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

  const applyPreset = async (preset: typeof THEME_PRESETS[0]) => {
    setSelectedPreset(preset.id);
    setPrimaryColor(preset.primary_color);
    setAccentColor(preset.accent_color);
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const preset = THEME_PRESETS.find(p => p.id === selectedPreset);
      const updateData = {
        primary_color: primaryColor,
        accent_color: accentColor,
        chat_bubble_user: primaryColor,
        animations_enabled: animationsEnabled,
        ...(preset && {
          background_gradient: preset.background_gradient,
          chat_bubble_assistant: preset.chat_bubble_assistant,
        }),
      };

      await axios.put(`${API_URL}/api/ui-config`, updateData);
      Alert.alert('Success', 'UI settings saved! Changes will apply on restart.');
      router.back();
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrentGradient = () => {
    const preset = THEME_PRESETS.find(p => p.id === selectedPreset);
    return preset?.background_gradient || ['#0F0F1A', '#1A1A2E', '#16213E'];
  };

  if (isLoading) {
    return (
      <LinearGradient colors={['#0F0F1A', '#1A1A2E', '#16213E']} style={styles.container}>
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
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>UI Editor</Text>
          <TouchableOpacity
            onPress={saveConfig}
            style={[styles.saveButton, { backgroundColor: primaryColor }, isSaving && styles.saveButtonDisabled]}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Preview */}
          <View style={styles.previewSection}>
            <Text style={styles.sectionTitle}>Preview</Text>
            <View style={[styles.previewCard, { borderColor: primaryColor + '40' }]}>
              <View style={styles.previewHeader}>
                <View style={[styles.previewAvatar, { backgroundColor: primaryColor }]}>
                  <Ionicons name="planet" size={24} color="#fff" />
                </View>
                <View>
                  <Text style={styles.previewName}>Nova</Text>
                  <View style={styles.previewStatus}>
                    <View style={[styles.statusDot, { backgroundColor: accentColor }]} />
                    <Text style={styles.statusText}>Online</Text>
                  </View>
                </View>
              </View>
              <View style={styles.previewMessages}>
                <View style={[styles.previewBubbleAssistant]}>
                  <Text style={styles.bubbleText}>Hello! How can I help?</Text>
                </View>
                <View style={[styles.previewBubbleUser, { backgroundColor: primaryColor }]}>
                  <Text style={styles.bubbleTextUser}>Tell me about yourself</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Theme Presets */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Theme Presets</Text>
            <View style={styles.presetGrid}>
              {THEME_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.presetCard,
                    selectedPreset === preset.id && { borderColor: preset.primary_color, borderWidth: 2 },
                  ]}
                  onPress={() => applyPreset(preset)}
                >
                  <LinearGradient
                    colors={preset.background_gradient as any}
                    style={styles.presetGradient}
                  >
                    <View style={[styles.presetDot, { backgroundColor: preset.primary_color }]} />
                    <View style={[styles.presetDotSmall, { backgroundColor: preset.accent_color }]} />
                  </LinearGradient>
                  <Text style={styles.presetName}>{preset.name}</Text>
                  {selectedPreset === preset.id && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={preset.primary_color}
                      style={styles.presetCheck}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Primary Color */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Primary Color</Text>
            <View style={styles.colorGrid}>
              {PRIMARY_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    primaryColor === color && styles.colorSelected,
                  ]}
                  onPress={() => {
                    setPrimaryColor(color);
                    setSelectedPreset(null);
                  }}
                >
                  {primaryColor === color && (
                    <Ionicons name="checkmark" size={18} color="#fff" />
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
                    accentColor === color && styles.colorSelected,
                  ]}
                  onPress={() => setAccentColor(color)}
                >
                  {accentColor === color && (
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Animations Toggle */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setAnimationsEnabled(!animationsEnabled)}
            >
              <View style={styles.toggleInfo}>
                <Ionicons name="sparkles" size={24} color={accentColor} />
                <View style={styles.toggleTextContainer}>
                  <Text style={styles.toggleTitle}>Animations</Text>
                  <Text style={styles.toggleSubtitle}>Enable smooth transitions</Text>
                </View>
              </View>
              <View
                style={[
                  styles.toggleSwitch,
                  animationsEnabled && { backgroundColor: primaryColor },
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    animationsEnabled && styles.toggleKnobActive,
                  ]}
                />
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
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 28,
  },
  previewSection: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  previewCard: {
    backgroundColor: 'rgba(30, 30, 46, 0.8)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  previewStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  previewMessages: {
    gap: 10,
  },
  previewBubbleAssistant: {
    backgroundColor: 'rgba(31, 41, 55, 0.8)',
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
  bubbleText: {
    color: '#E5E7EB',
    fontSize: 14,
  },
  bubbleTextUser: {
    color: '#fff',
    fontSize: 14,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetCard: {
    width: '47%',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  presetGradient: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  presetDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  presetDotSmall: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  presetName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 10,
  },
  presetCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleTextContainer: {
    gap: 2,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  toggleSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#374151',
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  bottomSpacing: {
    height: 40,
  },
});
