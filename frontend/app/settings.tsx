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

const AVATARS = [
  { id: 'planet', icon: 'planet', label: 'Planet' },
  { id: 'robot', icon: 'hardware-chip', label: 'Robot' },
  { id: 'sparkles', icon: 'sparkles', label: 'Sparkles' },
  { id: 'flash', icon: 'flash', label: 'Flash' },
  { id: 'diamond', icon: 'diamond', label: 'Diamond' },
  { id: 'flame', icon: 'flame', label: 'Flame' },
];

const COLORS = [
  '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899',
  '#6366F1', '#14B8A6', '#84CC16', '#F97316', '#F43F5E', '#A855F7',
];

const MODELS = [
  { id: 'grok-3-latest', label: 'Grok 3 (Latest)', provider: 'xAI' },
  { id: 'grok-3-fast', label: 'Grok 3 Fast', provider: 'xAI' },
  { id: 'grok-2', label: 'Grok 2', provider: 'xAI' },
  { id: 'claude-placeholder', label: 'Claude (Coming Soon)', provider: 'Anthropic', disabled: true },
  { id: 'kimi-placeholder', label: 'Kimi (Coming Soon)', provider: 'Moonshot', disabled: true },
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
}

export default function SettingsScreen() {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('planet');
  const [avatarColor, setAvatarColor] = useState('#8B5CF6');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [personality, setPersonality] = useState('');
  const [model, setModel] = useState('grok-3-latest');
  const [temperature, setTemperature] = useState(0.7);

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
        });
      }
      Alert.alert('Success', 'Agent settings saved!');
      router.back();
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const getAvatarIcon = (avatarId: string): keyof typeof Ionicons.glyphMap => {
    const found = AVATARS.find(a => a.id === avatarId);
    return (found?.icon as keyof typeof Ionicons.glyphMap) || 'planet';
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
    <LinearGradient colors={['#0F0F1A', '#1A1A2E', '#16213E']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Agent Settings</Text>
          <TouchableOpacity
            onPress={saveAgent}
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
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
                colors={[avatarColor, avatarColor + '80']}
                style={styles.previewAvatar}
              >
                <Ionicons name={getAvatarIcon(avatar)} size={48} color="#fff" />
              </LinearGradient>
              <Text style={styles.previewName}>{name || 'Unnamed Agent'}</Text>
              <Text style={styles.previewModel}>
                {MODELS.find(m => m.id === model)?.label || model}
              </Text>
            </View>

            {/* Name */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Name</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter agent name"
                  placeholderTextColor="#6B7280"
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
                      avatar === av.id && { borderColor: avatarColor, borderWidth: 2 },
                    ]}
                    onPress={() => setAvatar(av.id)}
                  >
                    <Ionicons
                      name={av.icon as keyof typeof Ionicons.glyphMap}
                      size={28}
                      color={avatar === av.id ? avatarColor : '#9CA3AF'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Avatar Color */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Color</Text>
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
                      <Ionicons name="checkmark" size={18} color="#fff" />
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
                      model === m.id && { borderColor: '#8B5CF6', borderWidth: 2 },
                      m.disabled && styles.modelDisabled,
                    ]}
                    onPress={() => !m.disabled && setModel(m.id)}
                    disabled={m.disabled}
                  >
                    <Text style={[styles.modelLabel, m.disabled && styles.modelLabelDisabled]}>
                      {m.label}
                    </Text>
                    <Text style={styles.modelProvider}>{m.provider}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Temperature */}
            <View style={styles.section}>
              <View style={styles.tempHeader}>
                <Text style={styles.sectionTitle}>Temperature</Text>
                <Text style={styles.tempValue}>{temperature.toFixed(1)}</Text>
              </View>
              <View style={styles.tempSlider}>
                {[0.1, 0.3, 0.5, 0.7, 0.9, 1.0].map((temp) => (
                  <TouchableOpacity
                    key={temp}
                    style={[
                      styles.tempDot,
                      temperature === temp && { backgroundColor: '#8B5CF6' },
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
                <TextInput
                  style={styles.input}
                  value={personality}
                  onChangeText={setPersonality}
                  placeholder="e.g., Friendly and professional"
                  placeholderTextColor="#6B7280"
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
                  placeholder="Define your agent's behavior and capabilities..."
                  placeholderTextColor="#6B7280"
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View style={styles.bottomSpacing} />
          </ScrollView>
        </KeyboardAvoidingView>
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
    backgroundColor: '#8B5CF6',
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  previewAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  previewName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  previewModel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputContainer: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  },
  textAreaContainer: {
    minHeight: 140,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 14,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  avatarOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
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
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  modelGrid: {
    gap: 10,
  },
  modelOption: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modelDisabled: {
    opacity: 0.5,
  },
  modelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  modelLabelDisabled: {
    color: '#6B7280',
  },
  modelProvider: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  tempHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tempValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  tempSlider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 8,
    paddingHorizontal: 16,
  },
  tempDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#374151',
  },
  tempLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  tempLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  bottomSpacing: {
    height: 40,
  },
});
