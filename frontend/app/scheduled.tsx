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
  warning: '#F59E0B',
};

interface ScheduledTask {
  id: string;
  agent_id: string;
  prompt: string;
  schedule_time: string;
  repeat: string;
  is_active: boolean;
  created_at: string;
}

export default function ScheduledScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newRepeat, setNewRepeat] = useState('none');

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/scheduled-tasks`);
      setTasks(res.data);
    } catch (error) {
      console.log('Error loading tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createTask = async () => {
    if (!newPrompt.trim()) {
      Alert.alert('Error', 'Please enter a prompt');
      return;
    }
    try {
      const agentsRes = await axios.get(`${API_URL}/api/agents`);
      const agentId = agentsRes.data[0]?.id || 'default';
      
      await axios.post(`${API_URL}/api/scheduled-tasks`, {
        agent_id: agentId,
        prompt: newPrompt.trim(),
        schedule_time: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        repeat: newRepeat,
      });
      setShowCreateModal(false);
      setNewPrompt('');
      setNewRepeat('none');
      loadTasks();
      Alert.alert('Success', 'Task scheduled');
    } catch (error) {
      Alert.alert('Error', 'Failed to create task');
    }
  };

  const toggleTask = async (id: string) => {
    try {
      await axios.put(`${API_URL}/api/scheduled-tasks/${id}/toggle`);
      loadTasks();
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle task');
    }
  };

  const deleteTask = async (id: string) => {
    Alert.alert('Delete Task', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/api/scheduled-tasks/${id}`);
            loadTasks();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete task');
          }
        },
      },
    ]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getRepeatLabel = (repeat: string) => {
    const labels: { [key: string]: string } = {
      none: 'Once',
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
    };
    return labels[repeat] || repeat;
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scheduled Tasks</Text>
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.addButton}>
            <Ionicons name="add" size={26} color={METALLIC.accent} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {isLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : tasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color={METALLIC.titanium} />
              <Text style={styles.emptyTitle}>No Scheduled Tasks</Text>
              <Text style={styles.emptyText}>Schedule prompts to run automatically</Text>
            </View>
          ) : (
            tasks.map(task => (
              <View key={task.id} style={[styles.taskCard, !task.is_active && styles.taskCardInactive]}>
                <View style={styles.taskHeader}>
                  <View style={[styles.statusBadge, task.is_active && styles.statusBadgeActive]}>
                    <Ionicons 
                      name={task.is_active ? "play" : "pause"} 
                      size={12} 
                      color={task.is_active ? METALLIC.success : METALLIC.titanium} 
                    />
                    <Text style={[styles.statusText, task.is_active && styles.statusTextActive]}>
                      {task.is_active ? 'Active' : 'Paused'}
                    </Text>
                  </View>
                  <View style={styles.repeatBadge}>
                    <Ionicons name="repeat" size={12} color={METALLIC.warning} />
                    <Text style={styles.repeatText}>{getRepeatLabel(task.repeat)}</Text>
                  </View>
                </View>
                <Text style={styles.taskPrompt} numberOfLines={2}>{task.prompt}</Text>
                <Text style={styles.taskTime}>Next run: {formatDate(task.schedule_time)}</Text>
                <View style={styles.taskActions}>
                  <TouchableOpacity style={styles.actionButton} onPress={() => toggleTask(task.id)}>
                    <Ionicons 
                      name={task.is_active ? "pause" : "play"} 
                      size={18} 
                      color={METALLIC.accent} 
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={() => deleteTask(task.id)}>
                    <Ionicons name="trash-outline" size={18} color={METALLIC.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Create Modal */}
        <Modal visible={showCreateModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>New Scheduled Task</Text>
              
              <Text style={styles.inputLabel}>Prompt</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={newPrompt}
                  onChangeText={setNewPrompt}
                  placeholder="What should the agent do?"
                  placeholderTextColor={METALLIC.titanium}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <Text style={styles.inputLabel}>Repeat</Text>
              <View style={styles.repeatOptions}>
                {['none', 'daily', 'weekly', 'monthly'].map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.repeatOption, newRepeat === opt && styles.repeatOptionActive]}
                    onPress={() => setNewRepeat(opt)}
                  >
                    <Text style={[styles.repeatOptionText, newRepeat === opt && styles.repeatOptionTextActive]}>
                      {getRepeatLabel(opt)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreateModal(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.createButton} onPress={createTask}>
                  <LinearGradient colors={[METALLIC.accent, '#4F46E5']} style={styles.createGradient}>
                    <Text style={styles.createText}>Schedule</Text>
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
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginTop: 12 },
  emptyText: { fontSize: 14, color: METALLIC.titanium, marginTop: 4, textAlign: 'center' },
  taskCard: {
    padding: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  taskCardInactive: { opacity: 0.6 },
  taskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  statusBadgeActive: { backgroundColor: METALLIC.success + '20' },
  statusText: { fontSize: 11, fontWeight: '600', color: METALLIC.titanium, textTransform: 'uppercase' },
  statusTextActive: { color: METALLIC.success },
  repeatBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: METALLIC.warning + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  repeatText: { fontSize: 11, fontWeight: '600', color: METALLIC.warning },
  taskPrompt: { fontSize: 15, fontWeight: '500', color: METALLIC.platinum, lineHeight: 21 },
  taskTime: { fontSize: 12, color: METALLIC.titanium, marginTop: 8 },
  taskActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  actionButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: METALLIC.darkSteel, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginBottom: 16 },
  inputLabel: {
    fontSize: 12, fontWeight: '600', color: METALLIC.titanium, marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  inputContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  input: { padding: 14, fontSize: 15, color: METALLIC.platinum },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  repeatOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  repeatOption: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  repeatOptionActive: { backgroundColor: METALLIC.accent + '20', borderColor: METALLIC.accent },
  repeatOptionText: { fontSize: 13, fontWeight: '500', color: METALLIC.titanium },
  repeatOptionTextActive: { color: METALLIC.accent },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12 },
  cancelText: { fontSize: 15, fontWeight: '600', color: METALLIC.titanium },
  createButton: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  createGradient: { padding: 14, alignItems: 'center' },
  createText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
