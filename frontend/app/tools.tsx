import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
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
};

interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: any;
  code: string;
}

interface Agent {
  id: string;
  name: string;
  tools: Tool[];
}

export default function ToolsScreen() {
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDescription, setNewToolDescription] = useState('');

  useEffect(() => {
    loadAgent();
  }, []);

  const loadAgent = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/agents`);
      if (res.data.length > 0) {
        setAgent(res.data[0]);
      }
    } catch (error) {
      console.log('Error loading agent:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addTool = async () => {
    if (!newToolName.trim() || !newToolDescription.trim() || !agent) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/agents/${agent.id}/tools`, {
        name: newToolName.trim(),
        description: newToolDescription.trim(),
        parameters: {},
        code: '',
      });
      setShowModal(false);
      setNewToolName('');
      setNewToolDescription('');
      loadAgent();
    } catch (error) {
      Alert.alert('Error', 'Failed to add tool');
    }
  };

  const deleteTool = async (toolId: string) => {
    if (!agent) return;
    
    Alert.alert(
      'Delete Tool',
      'Are you sure you want to remove this tool?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/agents/${agent.id}/tools/${toolId}`);
              loadAgent();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete tool');
            }
          },
        },
      ]
    );
  };

  const tools = agent?.tools || [];

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tools</Text>
          <TouchableOpacity onPress={() => setShowModal(true)} style={styles.addButton}>
            <LinearGradient
              colors={[METALLIC.accent, '#4F46E5']}
              style={styles.addGradient}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Info Card */}
          <View style={styles.infoCard}>
            <LinearGradient
              colors={['rgba(99, 102, 241, 0.1)', 'rgba(99, 102, 241, 0.05)']}
              style={styles.infoGradient}
            >
              <View style={styles.infoIcon}>
                <Ionicons name="information-circle" size={20} color={METALLIC.accent} />
              </View>
              <Text style={styles.infoText}>
                Tools extend your agent's capabilities. The AI can also generate tools dynamically during conversations.
              </Text>
            </LinearGradient>
          </View>

          {/* Tools List */}
          {isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          ) : tools.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="construct-outline" size={48} color={METALLIC.titanium} />
              </View>
              <Text style={styles.emptyTitle}>No Custom Tools</Text>
              <Text style={styles.emptyText}>
                Add tools manually or let the AI generate them
              </Text>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Custom Tools ({tools.length})</Text>
              {tools.map((tool) => (
                <View key={tool.id} style={styles.toolCard}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                    style={styles.toolGradient}
                  >
                    <View style={styles.toolHeader}>
                      <View style={styles.toolIcon}>
                        <Ionicons name="cube" size={20} color={METALLIC.accent} />
                      </View>
                      <View style={styles.toolInfo}>
                        <Text style={styles.toolName}>{tool.name}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => deleteTool(tool.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color={METALLIC.titanium} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.toolDescription}>{tool.description}</Text>
                    {Object.keys(tool.parameters).length > 0 && (
                      <View style={styles.paramBadge}>
                        <Ionicons name="code-slash" size={12} color={METALLIC.titanium} />
                        <Text style={styles.paramText}>
                          {Object.keys(tool.parameters).length} parameters
                        </Text>
                      </View>
                    )}
                  </LinearGradient>
                </View>
              ))}
            </View>
          )}

          {/* Built-in Capabilities */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Built-in Capabilities</Text>
            {[
              { name: 'Dynamic Tool Generation', icon: 'construct', desc: 'Create tools on-the-fly' },
              { name: 'Code Execution', icon: 'code-slash', desc: 'Run generated code' },
              { name: 'Data Analysis', icon: 'analytics', desc: 'Process and analyze data' },
              { name: 'Web Search', icon: 'search', desc: 'Search for information' },
            ].map((cap, idx) => (
              <View key={idx} style={styles.capCard}>
                <View style={styles.capIcon}>
                  <Ionicons name={cap.icon as any} size={18} color={METALLIC.silver} />
                </View>
                <View style={styles.capInfo}>
                  <Text style={styles.capName}>{cap.name}</Text>
                  <Text style={styles.capDesc}>{cap.desc}</Text>
                </View>
                <View style={styles.capBadge}>
                  <Text style={styles.capBadgeText}>Built-in</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Add Tool Modal */}
        <Modal
          visible={showModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <LinearGradient
                colors={['#18181D', '#12121A']}
                style={styles.modalGradient}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add Tool</Text>
                  <TouchableOpacity onPress={() => setShowModal(false)}>
                    <Ionicons name="close" size={24} color={METALLIC.platinum} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.inputLabel}>Name</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      value={newToolName}
                      onChangeText={setNewToolName}
                      placeholder="Tool name"
                      placeholderTextColor={METALLIC.titanium}
                    />
                  </View>

                  <Text style={styles.inputLabel}>Description</Text>
                  <View style={[styles.inputContainer, styles.textAreaContainer]}>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={newToolDescription}
                      onChangeText={setNewToolDescription}
                      placeholder="What does this tool do?"
                      placeholderTextColor={METALLIC.titanium}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowModal(false)}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.createButton} onPress={addTool}>
                    <LinearGradient
                      colors={[METALLIC.accent, '#4F46E5']}
                      style={styles.createGradient}
                    >
                      <Text style={styles.createText}>Create Tool</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
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
  addButton: { borderRadius: 16, overflow: 'hidden' },
  addGradient: { padding: 8 },
  scrollContent: { padding: 16 },
  infoCard: {
    marginBottom: 20,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  infoGradient: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  infoIcon: {},
  infoText: { flex: 1, fontSize: 13, color: METALLIC.silver, lineHeight: 18 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginBottom: 8 },
  emptyText: { fontSize: 14, color: METALLIC.titanium, textAlign: 'center' },
  toolCard: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toolGradient: { padding: 14 },
  toolHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: METALLIC.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toolInfo: { flex: 1 },
  toolName: { fontSize: 15, fontWeight: '600', color: METALLIC.platinum },
  deleteButton: { padding: 8 },
  toolDescription: { fontSize: 13, color: METALLIC.silver, lineHeight: 18, marginBottom: 10 },
  paramBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  paramText: { fontSize: 11, color: METALLIC.titanium },
  capCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  capIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  capInfo: { flex: 1 },
  capName: { fontSize: 14, fontWeight: '600', color: METALLIC.platinum },
  capDesc: { fontSize: 12, color: METALLIC.titanium, marginTop: 2 },
  capBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  capBadgeText: { fontSize: 10, color: METALLIC.titanium, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalGradient: { padding: 20 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum },
  modalBody: { marginBottom: 20 },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  input: { padding: 14, fontSize: 16, color: METALLIC.platinum },
  textAreaContainer: { minHeight: 80 },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  modalFooter: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: METALLIC.titanium },
  createButton: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  createGradient: { padding: 14, alignItems: 'center' },
  createText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
