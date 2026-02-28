import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
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
  warning: '#F59E0B',
};

interface Memory {
  id: string;
  content: string;
  category: string;
  importance: number;
  created_at: string;
}

const CATEGORIES = [
  { id: 'general', label: 'General', icon: 'document-text', color: METALLIC.accent },
  { id: 'preference', label: 'Preference', icon: 'heart', color: '#EC4899' },
  { id: 'fact', label: 'Fact', icon: 'bulb', color: METALLIC.warning },
  { id: 'context', label: 'Context', icon: 'layers', color: METALLIC.success },
];

export default function MemoryScreen() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newImportance, setNewImportance] = useState(5);
  const [agentId, setAgentId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const agentRes = await axios.get(`${API_URL}/api/agents`);
      if (agentRes.data.length > 0) {
        const id = agentRes.data[0].id;
        setAgentId(id);
        const memRes = await axios.get(`${API_URL}/api/memories?agent_id=${id}`);
        setMemories(memRes.data);
      }
    } catch (error) {
      console.log('Error loading memories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addMemory = async () => {
    if (!newContent.trim()) {
      Alert.alert('Error', 'Please enter memory content');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/memories`, {
        agent_id: agentId,
        content: newContent.trim(),
        category: newCategory,
        importance: newImportance,
      });
      setShowAddModal(false);
      setNewContent('');
      setNewCategory('general');
      setNewImportance(5);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to add memory');
    }
  };

  const deleteMemory = async (id: string) => {
    Alert.alert('Delete Memory', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/api/memories/${id}`);
            loadData();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const clearAllMemories = () => {
    Alert.alert('Clear All Memories', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/api/memories/agent/${agentId}`);
            loadData();
          } catch (error) {
            Alert.alert('Error', 'Failed to clear');
          }
        },
      },
    ]);
  };

  const getCategoryInfo = (cat: string) => CATEGORIES.find(c => c.id === cat) || CATEGORIES[0];

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Memory Bank</Text>
          <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
            <Ionicons name="add" size={26} color={METALLIC.accent} />
          </TouchableOpacity>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={METALLIC.accent} />
          <Text style={styles.infoText}>
            Memories help the agent remember context across conversations.
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {isLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : memories.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="hardware-chip-outline" size={48} color={METALLIC.titanium} />
              <Text style={styles.emptyTitle}>No Memories</Text>
              <Text style={styles.emptyText}>Add memories to help your agent remember</Text>
            </View>
          ) : (
            <>
              <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>{memories.length} Memories</Text>
                <TouchableOpacity onPress={clearAllMemories}>
                  <Text style={styles.clearText}>Clear All</Text>
                </TouchableOpacity>
              </View>
              {memories.map(memory => {
                const cat = getCategoryInfo(memory.category);
                return (
                  <View key={memory.id} style={styles.memoryCard}>
                    <View style={styles.memoryHeader}>
                      <View style={[styles.categoryBadge, { backgroundColor: cat.color + '20' }]}>
                        <Ionicons name={cat.icon as any} size={14} color={cat.color} />
                        <Text style={[styles.categoryText, { color: cat.color }]}>{cat.label}</Text>
                      </View>
                      <View style={styles.importanceBadge}>
                        <Text style={styles.importanceText}>{memory.importance}/10</Text>
                      </View>
                    </View>
                    <Text style={styles.memoryContent}>{memory.content}</Text>
                    <TouchableOpacity style={styles.deleteButton} onPress={() => deleteMemory(memory.id)}>
                      <Ionicons name="trash-outline" size={16} color={METALLIC.titanium} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>

        {/* Add Modal */}
        <Modal visible={showAddModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Memory</Text>
              
              <Text style={styles.label}>Content</Text>
              <View style={styles.textAreaContainer}>
                <TextInput
                  style={styles.textArea}
                  value={newContent}
                  onChangeText={setNewContent}
                  placeholder="What should the agent remember?"
                  placeholderTextColor={METALLIC.titanium}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryOption, newCategory === cat.id && { borderColor: cat.color }]}
                    onPress={() => setNewCategory(cat.id)}
                  >
                    <Ionicons name={cat.icon as any} size={18} color={newCategory === cat.id ? cat.color : METALLIC.titanium} />
                    <Text style={[styles.categoryOptionText, newCategory === cat.id && { color: cat.color }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Importance: {newImportance}</Text>
              <View style={styles.importanceSlider}>
                {[1, 3, 5, 7, 10].map(val => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.importanceDot, newImportance === val && styles.importanceDotActive]}
                    onPress={() => setNewImportance(val)}
                  >
                    <Text style={styles.importanceDotText}>{val}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={addMemory}>
                  <LinearGradient colors={[METALLIC.accent, '#4F46E5']} style={styles.saveGradient}>
                    <Text style={styles.saveText}>Save</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  addButton: { padding: 4 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16,
    padding: 12, backgroundColor: 'rgba(99,102,241,0.1)', borderRadius: 12,
  },
  infoText: { flex: 1, fontSize: 13, color: METALLIC.silver, lineHeight: 18 },
  scrollContent: { padding: 16, paddingTop: 0 },
  loadingText: { color: METALLIC.titanium, textAlign: 'center', paddingVertical: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginTop: 12 },
  emptyText: { fontSize: 14, color: METALLIC.titanium, marginTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: METALLIC.titanium, textTransform: 'uppercase', letterSpacing: 1 },
  clearText: { fontSize: 13, color: '#EF4444' },
  memoryCard: {
    padding: 14, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  memoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  categoryText: { fontSize: 11, fontWeight: '600' },
  importanceBadge: { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  importanceText: { fontSize: 11, color: METALLIC.titanium },
  memoryContent: { fontSize: 14, color: METALLIC.platinum, lineHeight: 20 },
  deleteButton: { position: 'absolute', top: 14, right: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: METALLIC.darkSteel, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: METALLIC.titanium, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  textAreaContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  textArea: { padding: 12, fontSize: 15, color: METALLIC.platinum, minHeight: 80, textAlignVertical: 'top' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  categoryOptionText: { fontSize: 13, color: METALLIC.titanium },
  importanceSlider: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  importanceDot: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  importanceDotActive: { backgroundColor: METALLIC.accent, borderColor: METALLIC.accent },
  importanceDotText: { fontSize: 13, fontWeight: '600', color: METALLIC.platinum },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12 },
  cancelText: { fontSize: 15, fontWeight: '600', color: METALLIC.titanium },
  saveButton: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  saveGradient: { padding: 14, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
