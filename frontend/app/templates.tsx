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

interface Template {
  id: string;
  name: string;
  avatar: string;
  avatar_color: string;
  personality: string;
  template_category: string;
}

export default function TemplatesScreen() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/agents/templates`);
      setTemplates(res.data);
    } catch (error) {
      console.log('Error loading templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createFromTemplate = async (templateId: string, name: string) => {
    try {
      await axios.post(`${API_URL}/api/agents/from-template/${templateId}`);
      Alert.alert('Success', `${name} agent created!`);
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to create agent');
    }
  };

  const getAvatarIcon = (avatar: string): keyof typeof Ionicons.glyphMap => {
    const icons: { [key: string]: string } = {
      planet: 'planet', 'code-slash': 'code-slash', pencil: 'pencil',
      analytics: 'analytics', school: 'school', briefcase: 'briefcase',
    };
    return (icons[avatar] || 'planet') as keyof typeof Ionicons.glyphMap;
  };

  const categories = [...new Set(templates.map(t => t.template_category || 'general'))];

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Agent Templates</Text>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {isLoading ? (
            <Text style={styles.loadingText}>Loading templates...</Text>
          ) : (
            categories.map(category => (
              <View key={category} style={styles.section}>
                <Text style={styles.sectionTitle}>{category}</Text>
                {templates
                  .filter(t => (t.template_category || 'general') === category)
                  .map(template => (
                    <TouchableOpacity
                      key={template.id}
                      style={styles.templateCard}
                      onPress={() => createFromTemplate(template.id, template.name)}
                    >
                      <View style={[styles.templateAvatar, { backgroundColor: template.avatar_color + '20' }]}>
                        <Ionicons name={getAvatarIcon(template.avatar)} size={28} color={template.avatar_color} />
                      </View>
                      <View style={styles.templateInfo}>
                        <Text style={styles.templateName}>{template.name}</Text>
                        <Text style={styles.templatePersonality}>{template.personality}</Text>
                      </View>
                      <View style={[styles.useBadge, { backgroundColor: template.avatar_color + '20' }]}>
                        <Text style={[styles.useText, { color: template.avatar_color }]}>Use</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: METALLIC.platinum },
  scrollContent: { padding: 16 },
  loadingText: { color: METALLIC.titanium, textAlign: 'center', paddingVertical: 20 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: METALLIC.titanium, marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  templateCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  templateAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  templateInfo: { flex: 1, marginLeft: 14 },
  templateName: { fontSize: 17, fontWeight: '600', color: METALLIC.platinum },
  templatePersonality: { fontSize: 13, color: METALLIC.titanium, marginTop: 2 },
  useBadge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  useText: { fontSize: 13, fontWeight: '600' },
});
