import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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
  danger: '#EF4444',
};

const AVATARS = [
  { id: 'planet', icon: 'planet' },
  { id: 'robot', icon: 'hardware-chip' },
  { id: 'sparkles', icon: 'sparkles' },
  { id: 'flash', icon: 'flash' },
  { id: 'diamond', icon: 'diamond' },
  { id: 'flame', icon: 'flame' },
  { id: 'cube', icon: 'cube' },
  { id: 'prism', icon: 'prism' },
];

const COLORS = [
  '#7C7C8A', '#6366F1', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#A855F7', '#14B8A6', '#F97316', '#84CC16',
];

const MODELS = [
  { id: 'grok-3-latest', label: 'Grok 3', sublabel: 'Latest', provider: 'xAI' },
  { id: 'grok-3-fast', label: 'Grok 3', sublabel: 'Fast', provider: 'xAI' },
  { id: 'grok-3', label: 'Grok 3', sublabel: 'Recommended', provider: 'xAI' },
  { id: 'grok-3-mini', label: 'Grok 3 Mini', sublabel: 'Fast', provider: 'xAI' },
  { id: 'grok-4-0709', label: 'Grok 4', sublabel: 'Most Capable', provider: 'xAI' },
  { id: 'claude-placeholder', label: 'Claude', sublabel: 'Soon', provider: 'Anthropic', disabled: true },
  { id: 'kimi-placeholder', label: 'Kimi', sublabel: 'Soon', provider: 'Moonshot', disabled: true },
];

interface Agent {
  id: string;
  name: string;
  avatar: string;
  avatar_color: string;
  system_prompt: string;
  personality: string;
  model: string;
  temperature: number;
  adult_mode: boolean;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('planet');
  const [avatarColor, setAvatarColor] = useState('#7C7C8A');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [personality, setPersonality] = useState('');
  const [model, setModel] = useState('grok-3-latest');
  const [temperature, setTemperature] = useState(0.7);
  const [adultMode, setAdultMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadAgent();
  }, []);

  const loadAgent = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/agents`);
      if (res.data.length > 0) {
        const agentData = res.data[0];
        setAgent(agentData);
        setName(agentData.name);
        setAvatar(agentData.avatar);
        setAvatarColor(agentData.avatar_color);
        setSystemPrompt(agentData.system_prompt);
        setPersonality(agentData.personality);
        setModel(agentData.model);
        setTemperature(agentData.temperature);
        setAdultMode(agentData.adult_mode || false);
      }
    } catch (error) {
      console.log('Error loading agent:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAgent = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an agent name');
      return;
    }

    setIsSaving(true);
    try {
      if (agent) {
        await axios.put(`${API_URL}/api/agents/${agent.id}`, {
          name: name.trim(),
          avatar,
          avatar_color: avatarColor,
          system_prompt: systemPrompt.trim(),
          personality: personality.trim(),
          model,
          temperature,
          adult_mode: adultMode,
        });
      } else {
        await axios.post(`${API_URL}/api/agents`, {
          name: name.trim(),
          avatar,
          avatar_color: avatarColor,
          system_prompt: systemPrompt.trim(),
          personality: personality.trim(),
          model,
          temperature,
          adult_mode: adultMode,
        });
      }
      Alert.alert('Saved', 'Agent configuration updated');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAdultMode = () => {
    if (!adultMode) {
      Alert.alert(
        'Enable Adult Mode',
        'This will disable content filtering for chat and image generation. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', style: 'destructive', onPress: () => setAdultMode(true) },
        ]
      );
    } else {
      setAdultMode(false);
    }
  };

  const getAvatarIcon = (avatarId: string): keyof typeof Ionicons.glyphMap => {
    const found = AVATARS.find(a => a.id === avatarId);
    return (found?.icon as keyof typeof Ionicons.glyphMap) || 'planet';
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
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Agent Config</Text>
          <TouchableOpacity
            onPress={saveAgent}
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            disabled={isSaving}
          >
            <LinearGradient
              colors={[METALLIC.accent, '#4F46E5']}
              style={styles.saveGradient}
            >
              <Text style={styles.saveButtonText}>{isSaving ? '...' : 'Save'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Agent Preview */}
            <View style={styles.previewContainer}>
              <LinearGradient
                colors={[METALLIC.gunmetal, METALLIC.darkSteel]}
                style={styles.previewAvatar}
              >
                <View style={[styles.previewAvatarInner, { borderColor: avatarColor }]}>
                  <Ionicons name={getAvatarIcon(avatar)} size={40} color={avatarColor} />
                </View>
              </LinearGradient>
              <Text style={styles.previewName}>{name || 'Agent'}</Text>
            </View>

            {/* Name */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Identity</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={METALLIC.titanium} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Agent name"
                  placeholderTextColor={METALLIC.titanium}
                />
              </View>
            </View>

            {/* Avatar */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Avatar</Text>
              <View style={styles.avatarGrid}>
                {AVATARS.map((av) => (
                  <TouchableOpacity
                    key={av.id}
                    style={[
                      styles.avatarOption,
                      avatar === av.id && styles.avatarOptionSelected,
                    ]}
                    onPress={() => setAvatar(av.id)}
                  >
                    <Ionicons
                      name={av.icon as keyof typeof Ionicons.glyphMap}
                      size={26}
                      color={avatar === av.id ? avatarColor : METALLIC.titanium}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Color */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Accent Color</Text>
              <View style={styles.colorGrid}>
                {COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      avatarColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setAvatarColor(color)}
                  >
                    {avatarColor === color && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Model */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Model</Text>
              <View style={styles.modelGrid}>
                {MODELS.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.modelOption,
                      model === m.id && styles.modelOptionSelected,
                      m.disabled && styles.modelDisabled,
                    ]}
                    onPress={() => !m.disabled && setModel(m.id)}
                    disabled={m.disabled}
                  >
                    <View style={styles.modelInfo}>
                      <Text style={[styles.modelLabel, m.disabled && styles.modelLabelDisabled]}>
                        {m.label}
                      </Text>
                      <Text style={styles.modelSublabel}>{m.sublabel}</Text>
                    </View>
                    <Text style={styles.modelProvider}>{m.provider}</Text>
                    {model === m.id && (
                      <View style={styles.modelCheck}>
                        <Ionicons name="checkmark-circle" size={20} color={METALLIC.accent} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Temperature */}
            <View style={styles.section}>
              <View style={styles.tempHeader}>
                <Text style={styles.sectionTitle}>Temperature</Text>
                <View style={styles.tempValueBadge}>
                  <Text style={styles.tempValue}>{temperature.toFixed(1)}</Text>
                </View>
              </View>
              <View style={styles.tempSlider}>
                {[0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map((temp) => (
                  <TouchableOpacity
                    key={temp}
                    style={[
                      styles.tempDot,
                      temperature === temp && styles.tempDotActive,
                    ]}
                    onPress={() => setTemperature(temp)}
                  />
                ))}
              </View>
              <View style={styles.tempLabels}>
                <Text style={styles.tempLabel}>Precise</Text>
                <Text style={styles.tempLabel}>Creative</Text>
              </View>
            </View>

            {/* Personality */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personality</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="heart-outline" size={20} color={METALLIC.titanium} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={personality}
                  onChangeText={setPersonality}
                  placeholder="e.g., Professional and precise"
                  placeholderTextColor={METALLIC.titanium}
                />
              </View>
            </View>

            {/* System Prompt */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>System Prompt</Text>
              <View style={[styles.inputContainer, styles.textAreaContainer]}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={systemPrompt}
                  onChangeText={setSystemPrompt}
                  placeholder="Define agent behavior and capabilities..."
                  placeholderTextColor={METALLIC.titanium}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Advanced Settings - Hidden by default */}
            <View style={styles.section}>
              <TouchableOpacity 
                style={styles.advancedHeader} 
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <View style={styles.advancedHeaderLeft}>
                  <Ionicons name="settings-outline" size={20} color={METALLIC.titanium} />
                  <Text style={styles.advancedHeaderText}>Advanced Settings</Text>
                </View>
                <Ionicons 
                  name={showAdvanced ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color={METALLIC.titanium} 
                />
              </TouchableOpacity>
              
              {showAdvanced && (
                <View style={styles.advancedContent}>
                  <Text style={styles.advancedWarning}>
                    These settings are for experienced users only
                  </Text>
                  
                  {/* Adult Mode - Now hidden in Advanced */}
                  <TouchableOpacity style={styles.adultModeRow} onPress={toggleAdultMode}>
                    <View style={styles.adultModeInfo}>
                      <View style={[styles.adultModeIcon, adultMode && styles.adultModeIconActive]}>
                        <Ionicons name="shield-outline" size={22} color={adultMode ? METALLIC.danger : METALLIC.titanium} />
                      </View>
                      <View style={styles.adultModeText}>
                        <Text style={styles.adultModeTitle}>Content Filter</Text>
                        <Text style={styles.adultModeDesc}>
                          {adultMode ? 'Unrestricted mode' : 'Safe mode enabled'}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.toggleSwitch, adultMode && styles.toggleSwitchActive]}>
                      <View style={[styles.toggleKnob, adultMode && styles.toggleKnobActive]} />
                    </View>
                  </TouchableOpacity>
                  {adultMode && (
                    <View style={styles.warningBox}>
                      <Ionicons name="warning" size={16} color={METALLIC.danger} />
                      <Text style={styles.warningText}>
                        Content filtering disabled. User discretion advised.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <View style={styles.bottomSpacing} />
          </ScrollView>
        </KeyboardAvoidingView>
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
  content: { flex: 1 },
  scrollContent: { padding: 20 },
  previewContainer: { alignItems: 'center', marginBottom: 32 },
  previewAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  previewAvatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: METALLIC.darkSteel,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  previewName: { fontSize: 22, fontWeight: '600', color: METALLIC.platinum, marginBottom: 8 },
  previewBadges: { flexDirection: 'row', gap: 8 },
  previewBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  previewModel: { fontSize: 12, color: METALLIC.titanium, textTransform: 'uppercase', letterSpacing: 1 },
  adultBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  adultBadgeText: { fontSize: 11, color: METALLIC.danger, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputIcon: { marginLeft: 14 },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 16,
    color: METALLIC.platinum,
  },
  textAreaContainer: { minHeight: 130, alignItems: 'flex-start' },
  textArea: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarOption: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatarOptionSelected: {
    borderColor: METALLIC.accent,
    borderWidth: 2,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOptionSelected: { borderWidth: 3, borderColor: '#fff' },
  modelGrid: { gap: 8 },
  modelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modelOptionSelected: {
    borderColor: METALLIC.accent,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  modelDisabled: { opacity: 0.4 },
  modelInfo: { flex: 1 },
  modelLabel: { fontSize: 16, fontWeight: '600', color: METALLIC.platinum },
  modelLabelDisabled: { color: METALLIC.titanium },
  modelSublabel: { fontSize: 12, color: METALLIC.titanium, marginTop: 2 },
  modelProvider: {
    fontSize: 11,
    color: METALLIC.titanium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 8,
  },
  modelCheck: { marginLeft: 4 },
  tempHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  tempValueBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tempValue: { fontSize: 14, fontWeight: '600', color: METALLIC.accent },
  tempSlider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    padding: 10,
    paddingHorizontal: 18,
  },
  tempDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: METALLIC.gunmetal,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tempDotActive: { backgroundColor: METALLIC.accent, borderColor: METALLIC.accent },
  tempLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  tempLabel: { fontSize: 11, color: METALLIC.titanium, textTransform: 'uppercase', letterSpacing: 1 },
  adultModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  adultModeInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adultModeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adultModeIconActive: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  adultModeText: { gap: 2 },
  adultModeTitle: { fontSize: 15, fontWeight: '600', color: METALLIC.platinum },
  adultModeDesc: { fontSize: 12, color: METALLIC.titanium },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: METALLIC.gunmetal,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: { backgroundColor: METALLIC.danger },
  toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  toggleKnobActive: { alignSelf: 'flex-end' },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  warningText: { flex: 1, fontSize: 12, color: METALLIC.danger, lineHeight: 16 },
  bottomSpacing: { height: 40 },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  advancedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  advancedHeaderText: {
    fontSize: 14,
    fontWeight: '500',
    color: METALLIC.titanium,
  },
  advancedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  advancedWarning: {
    fontSize: 11,
    color: METALLIC.titanium,
    marginBottom: 16,
    fontStyle: 'italic',
  },
});
