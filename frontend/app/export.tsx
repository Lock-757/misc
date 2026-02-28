import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
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
  success: '#10B981',
};

interface Conversation {
  id: string;
  title: string;
  messages: any[];
  updated_at: string;
}

export default function ExportScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/conversations`);
      setConversations(res.data);
    } catch (error) {
      console.log('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === conversations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(conversations.map(c => c.id));
    }
  };

  const exportConversation = async (id: string, format: string) => {
    try {
      const res = await axios.get(`${API_URL}/api/export/conversation/${id}?format=${format}`);
      await Share.share({ message: res.data.content });
    } catch (error) {
      Alert.alert('Error', 'Failed to export');
    }
  };

  const exportAll = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/export/all`);
      await Share.share({ message: JSON.stringify(res.data, null, 2) });
    } catch (error) {
      Alert.alert('Error', 'Failed to export');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Export Data</Text>
          <TouchableOpacity onPress={selectAll} style={styles.selectAllButton}>
            <Text style={styles.selectAllText}>
              {selectedIds.length === conversations.length ? 'Deselect' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Export All Button */}
          <TouchableOpacity style={styles.exportAllCard} onPress={exportAll}>
            <LinearGradient colors={[METALLIC.accent + '20', METALLIC.accent + '10']} style={styles.exportAllGradient}>
              <Ionicons name="cloud-download" size={28} color={METALLIC.accent} />
              <View style={styles.exportAllInfo}>
                <Text style={styles.exportAllTitle}>Export All Data</Text>
                <Text style={styles.exportAllDesc}>Conversations, memories, bookmarks</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={METALLIC.titanium} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Conversations */}
          <Text style={styles.sectionTitle}>Conversations ({conversations.length})</Text>
          {isLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No conversations to export</Text>
            </View>
          ) : (
            conversations.map(convo => (
              <View key={convo.id} style={styles.convoCard}>
                <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelection(convo.id)}>
                  <Ionicons
                    name={selectedIds.includes(convo.id) ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selectedIds.includes(convo.id) ? METALLIC.accent : METALLIC.titanium}
                  />
                </TouchableOpacity>
                <View style={styles.convoInfo}>
                  <Text style={styles.convoTitle} numberOfLines={1}>{convo.title}</Text>
                  <Text style={styles.convoMeta}>
                    {convo.messages?.length || 0} messages • {formatDate(convo.updated_at)}
                  </Text>
                </View>
                <View style={styles.exportButtons}>
                  <TouchableOpacity
                    style={styles.formatButton}
                    onPress={() => exportConversation(convo.id, 'markdown')}
                  >
                    <Text style={styles.formatText}>MD</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.formatButton}
                    onPress={() => exportConversation(convo.id, 'json')}
                  >
                    <Text style={styles.formatText}>JSON</Text>
                  </TouchableOpacity>
                </View>
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
  selectAllButton: { padding: 4 },
  selectAllText: { fontSize: 14, color: METALLIC.accent },
  scrollContent: { padding: 16 },
  exportAllCard: { marginBottom: 24, borderRadius: 14, overflow: 'hidden' },
  exportAllGradient: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
  },
  exportAllInfo: { flex: 1 },
  exportAllTitle: { fontSize: 16, fontWeight: '600', color: METALLIC.platinum },
  exportAllDesc: { fontSize: 12, color: METALLIC.titanium, marginTop: 2 },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: METALLIC.titanium, marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  loadingText: { color: METALLIC.titanium, textAlign: 'center', paddingVertical: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: METALLIC.titanium },
  convoCard: {
    flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  checkbox: { padding: 4 },
  convoInfo: { flex: 1, marginLeft: 10 },
  convoTitle: { fontSize: 14, fontWeight: '500', color: METALLIC.platinum },
  convoMeta: { fontSize: 12, color: METALLIC.titanium, marginTop: 2 },
  exportButtons: { flexDirection: 'row', gap: 6 },
  formatButton: {
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },
  formatText: { fontSize: 11, fontWeight: '600', color: METALLIC.titanium },
});
