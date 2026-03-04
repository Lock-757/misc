import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
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
  danger: '#EF4444',
};

interface Agent {
  id: string;
  name: string;
  avatar: string;
  avatar_color: string;
  model: string;
  is_template: boolean;
  has_tools?: boolean;
}

export default function AgentsScreen() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/agents`);
      const filtered = (res.data || []).filter((a: Agent) => !a.is_template);
      filtered.sort((a: Agent, b: Agent) => {
        const aIsDevin = (a.name || '').toLowerCase() === 'devin' || (a.name || '').toLowerCase() === 'devon';
        const bIsDevin = (b.name || '').toLowerCase() === 'devin' || (b.name || '').toLowerCase() === 'devon';
        if (aIsDevin && !bIsDevin) return -1;
        if (!aIsDevin && bIsDevin) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      setAgents(filtered);
    } catch (error) {
      console.log('Error loading agents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createAgent = async () => {
    if (!newAgentName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/agents`, {
        name: newAgentName.trim(),
        avatar: 'planet',
        avatar_color: '#6366F1',
      });
      setShowCreateModal(false);
      setNewAgentName('');
      loadAgents();
    } catch (error) {
      Alert.alert('Error', 'Failed to create agent');
    }
  };

  const deleteAgent = async (id: string) => {
    Alert.alert('Delete Agent', 'This will delete all conversations and data for this agent.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/api/agents/${id}`);
            loadAgents();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete agent');
          }
        },
      },
    ]);
  };

  const getAvatarIcon = (avatar: string): keyof typeof Ionicons.glyphMap => {
    const icons: { [key: string]: string } = {
      planet: 'planet', robot: 'hardware-chip', sparkles: 'sparkles',
      flash: 'flash', diamond: 'diamond', flame: 'flame',
      'code-slash': 'code-slash', pencil: 'pencil', analytics: 'analytics',
      school: 'school', briefcase: 'briefcase',
    };
    return (icons[avatar] || 'planet') as keyof typeof Ionicons.glyphMap;
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Agents</Text>
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.addButton}>
            <Ionicons name="add" size={26} color={METALLIC.accent} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Templates Link */}
          <TouchableOpacity style={styles.templateLink} onPress={() => router.push('/templates')}>
            <LinearGradient colors={['rgba(99,102,241,0.15)', 'rgba(99,102,241,0.05)']} style={styles.templateGradient}>
              <Ionicons name="albums" size={24} color={METALLIC.accent} />
              <View style={styles.templateInfo}>
                <Text style={styles.templateTitle}>Create from Template</Text>
                <Text style={styles.templateDesc}>Coder, Writer, Analyst & more</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={METALLIC.titanium} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Agents List */}
          <Text style={styles.sectionTitle}>Your Agents ({agents.length})</Text>
          {isLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : agents.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={METALLIC.titanium} />
              <Text style={styles.emptyText}>No agents yet</Text>
            </View>
          ) : (
            agents.map((agent) => (
              <TouchableOpacity key={agent.id} style={styles.agentCard} onPress={() => router.back()} data-testid={`agents-list-item-${agent.id}`} testID={`agents-list-item-${agent.id}`}>
                <View style={[styles.agentAvatar, { backgroundColor: agent.avatar_color + '20' }]}>
                  <Ionicons name={getAvatarIcon(agent.avatar)} size={24} color={agent.avatar_color} />
                </View>
                <View style={styles.agentInfo}>
                  <Text style={styles.agentName}>{agent.name}</Text>
                  <Text style={styles.agentModel}>{agent.has_tools ? 'Tool Agent' : 'Chat Agent'}</Text>
                </View>
                <TouchableOpacity style={styles.deleteButton} onPress={() => deleteAgent(agent.id)}>
                  <Ionicons name="trash-outline" size={18} color={METALLIC.titanium} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {/* Create Modal */}
        <Modal visible={showCreateModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>New Agent</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={newAgentName}
                  onChangeText={setNewAgentName}
                  placeholder="Agent name"
                  placeholderTextColor={METALLIC.titanium}
                />
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreateModal(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.createButton} onPress={createAgent}>
                  <LinearGradient colors={[METALLIC.accent, '#4F46E5']} style={styles.createGradient}>
                    <Text style={styles.createText}>Create</Text>
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
  scrollContent: { padding: 16 },
  templateLink: { marginBottom: 24, borderRadius: 14, overflow: 'hidden' },
  templateGradient: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
  },
  templateInfo: { flex: 1 },
  templateTitle: { fontSize: 15, fontWeight: '600', color: METALLIC.platinum },
  templateDesc: { fontSize: 12, color: METALLIC.titanium, marginTop: 2 },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: METALLIC.titanium, marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  loadingText: { color: METALLIC.titanium, textAlign: 'center', paddingVertical: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { marginTop: 12, fontSize: 14, color: METALLIC.titanium },
  agentCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  agentAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  agentInfo: { flex: 1, marginLeft: 12 },
  agentName: { fontSize: 16, fontWeight: '600', color: METALLIC.platinum },
  agentModel: { fontSize: 12, color: METALLIC.titanium, marginTop: 2, textTransform: 'capitalize' },
  deleteButton: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: METALLIC.darkSteel, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginBottom: 16 },
  inputContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  input: { padding: 14, fontSize: 16, color: METALLIC.platinum },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12 },
  cancelText: { fontSize: 15, fontWeight: '600', color: METALLIC.titanium },
  createButton: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  createGradient: { padding: 14, alignItems: 'center' },
  createText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
