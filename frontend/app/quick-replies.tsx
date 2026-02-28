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
};

interface QuickReply {
  id: string;
  label: string;
  message: string;
  icon: string;
  order: number;
}

const ICONS = ['chatbubble', 'bulb', 'code', 'arrow-forward', 'list', 'help-circle', 'sparkles', 'rocket'];

export default function QuickRepliesScreen() {
  const router = useRouter();
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newIcon, setNewIcon] = useState('chatbubble');
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
        const repliesRes = await axios.get(`${API_URL}/api/quick-replies?agent_id=${id}`);
        setReplies(repliesRes.data);
      }
    } catch (error) {
      console.log('Error loading quick replies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addReply = async () => {
    if (!newLabel.trim() || !newMessage.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/quick-replies`, {
        agent_id: agentId,
        label: newLabel.trim(),
        message: newMessage.trim(),
        icon: newIcon,
        order: replies.length,
      });
      setShowAddModal(false);
      setNewLabel('');
      setNewMessage('');
      setNewIcon('chatbubble');
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to add quick reply');
    }
  };

  const deleteReply = async (id: string) => {
    Alert.alert('Delete Quick Reply', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/api/quick-replies/${id}`);
            loadData();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quick Replies</Text>
          <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
            <Ionicons name="add" size={26} color={METALLIC.accent} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {isLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : replies.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="flash-outline" size={48} color={METALLIC.titanium} />
              <Text style={styles.emptyTitle}>No Quick Replies</Text>
              <Text style={styles.emptyText}>Add shortcuts for common messages</Text>
            </View>
          ) : (
            replies.map(reply => (
              <View key={reply.id} style={styles.replyCard}>
                <View style={styles.replyIcon}>
                  <Ionicons name={reply.icon as any} size={22} color={METALLIC.accent} />
                </View>
                <View style={styles.replyContent}>
                  <Text style={styles.replyLabel}>{reply.label}</Text>
                  <Text style={styles.replyMessage} numberOfLines={2}>{reply.message}</Text>
                </View>
                <TouchableOpacity style={styles.deleteButton} onPress={() => deleteReply(reply.id)}>
                  <Ionicons name="trash-outline" size={18} color={METALLIC.titanium} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>

        {/* Add Modal */}
        <Modal visible={showAddModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>New Quick Reply</Text>
              
              <Text style={styles.label}>Label</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={newLabel}
                  onChangeText={setNewLabel}
                  placeholder="e.g., Explain"
                  placeholderTextColor={METALLIC.titanium}
                />
              </View>

              <Text style={styles.label}>Message</Text>
              <View style={styles.textAreaContainer}>
                <TextInput
                  style={styles.textArea}
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="The message to send..."
                  placeholderTextColor={METALLIC.titanium}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <Text style={styles.label}>Icon</Text>
              <View style={styles.iconGrid}>
                {ICONS.map(icon => (
                  <TouchableOpacity
                    key={icon}
                    style={[styles.iconOption, newIcon === icon && styles.iconOptionSelected]}
                    onPress={() => setNewIcon(icon)}
                  >
                    <Ionicons name={icon as any} size={22} color={newIcon === icon ? METALLIC.accent : METALLIC.titanium} />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={addReply}>
                  <LinearGradient colors={[METALLIC.accent, '#4F46E5']} style={styles.saveGradient}>
                    <Text style={styles.saveText}>Add</Text>
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
  loadingText: { color: METALLIC.titanium, textAlign: 'center', paddingVertical: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginTop: 12 },
  emptyText: { fontSize: 14, color: METALLIC.titanium, marginTop: 4 },
  replyCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  replyIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: METALLIC.accent + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  replyContent: { flex: 1, marginLeft: 12 },
  replyLabel: { fontSize: 15, fontWeight: '600', color: METALLIC.platinum },
  replyMessage: { fontSize: 13, color: METALLIC.titanium, marginTop: 2 },
  deleteButton: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: METALLIC.darkSteel, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: METALLIC.titanium, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  inputContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  input: { padding: 14, fontSize: 16, color: METALLIC.platinum },
  textAreaContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  textArea: { padding: 12, fontSize: 15, color: METALLIC.platinum, minHeight: 70, textAlignVertical: 'top' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  iconOption: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  iconOptionSelected: { borderColor: METALLIC.accent, backgroundColor: METALLIC.accent + '15' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12 },
  cancelText: { fontSize: 15, fontWeight: '600', color: METALLIC.titanium },
  saveButton: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  saveGradient: { padding: 14, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
