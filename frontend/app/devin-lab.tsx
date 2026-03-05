import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { useAuth, getStoredToken } from '../context/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET;

const C = {
  bg: '#0A0A0F',
  card: '#14141C',
  border: '#1E1E2A',
  text: '#E5E5EA',
  muted: '#6B7280',
  accent: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

interface DevinTask {
  id: string;
  title: string;
  task: string;
  priority: string;
  risk_level: 'low' | 'medium' | 'high';
  requires_approval: boolean;
  is_approved: boolean;
  status: 'queued' | 'running' | 'completed' | 'failed';
  run_count: number;
  last_run_summary: string;
  last_error: string;
  updated_at: string;
}

interface DevinRun {
  id: string;
  task_id: string;
  status: string;
  dry_run: boolean;
  iterations: number;
  response_summary: string;
  created_at: string;
}

export default function DevinLabScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<DevinTask[]>([]);
  const [runs, setRuns] = useState<DevinRun[]>([]);
  const [title, setTitle] = useState('');
  const [taskText, setTaskText] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');

  const canCreate = useMemo(() => title.trim().length > 2 && taskText.trim().length > 6, [title, taskText]);

  useEffect(() => {
    void loadData();
  }, []);

  const getHeaders = async () => {
    const token = await getStoredToken();
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (isAdmin && ADMIN_SECRET) headers['X-Admin-Key'] = ADMIN_SECRET;
    return headers;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const headers = await getHeaders();
      const [tasksRes, runsRes] = await Promise.all([
        axios.get(`${API_URL}/api/devin/tasks`, { headers }),
        axios.get(`${API_URL}/api/devin/runs`, { headers }),
      ]);
      setTasks(tasksRes.data || []);
      setRuns(runsRes.data || []);
    } catch (err) {
      console.log('deving-lab load error', err);
      Alert.alert('Error', 'Failed to load Devin data');
    } finally {
      setLoading(false);
    }
  };

  const createTask = async () => {
    if (!canCreate || saving) return;
    try {
      setSaving(true);
      const headers = await getHeaders();
      await axios.post(
        `${API_URL}/api/devin/tasks`,
        {
          title: title.trim(),
          task: taskText.trim(),
          priority,
        },
        { headers }
      );
      setTitle('');
      setTaskText('');
      setPriority('normal');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const approveRiskTask = async (taskId: string) => {
    try {
      const headers = await getHeaders();
      await axios.post(`${API_URL}/api/devin/tasks/${taskId}/approve-risk`, {}, { headers });
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Approval failed');
    }
  };

  const runTask = async (taskId: string, dryRun: boolean) => {
    try {
      const headers = await getHeaders();
      await axios.post(`${API_URL}/api/devin/tasks/${taskId}/run`, { dry_run: dryRun }, { headers });
      await loadData();
      if (!dryRun) {
        Alert.alert('Run started', 'Live execution used model credits.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Run failed');
    }
  };

  const getRiskColor = (risk: string) => {
    if (risk === 'high') return C.danger;
    if (risk === 'medium') return C.warning;
    return C.success;
  };

  if (loading) {
    return (
      <LinearGradient colors={[C.bg, '#12121A', C.bg]} style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText} data-testid="devin-lab-loading-text">Loading Devin Lab...</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[C.bg, '#12121A', C.bg]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} data-testid="devin-lab-back-button">
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title} data-testid="devin-lab-page-title">Devin Lab</Text>
          <TouchableOpacity onPress={() => void loadData()} style={styles.headerBtn} data-testid="devin-lab-refresh-button">
            <Ionicons name="refresh" size={20} color={C.accent} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card} data-testid="devin-create-task-card">
            <Text style={styles.cardTitle}>Create Devin Task</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Task title"
              placeholderTextColor={C.muted}
              data-testid="devin-task-title-input"
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              value={taskText}
              onChangeText={setTaskText}
              placeholder="What should Devin do?"
              placeholderTextColor={C.muted}
              multiline
              data-testid="devin-task-body-input"
            />

            <View style={styles.priorityRow}>
              {(['low', 'normal', 'high'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityPill, priority === p && styles.priorityPillActive]}
                  onPress={() => setPriority(p)}
                  data-testid={`devin-priority-${p}-button`}
                >
                  <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>{p.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.createBtn, (!canCreate || saving) && styles.createBtnDisabled]}
              onPress={() => void createTask()}
              disabled={!canCreate || saving}
              data-testid="devin-create-task-button"
            >
              <Text style={styles.createBtnText}>{saving ? 'Creating...' : 'Queue Task'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card} data-testid="devin-task-queue-card">
            <Text style={styles.cardTitle}>Task Queue ({tasks.length})</Text>
            {tasks.length === 0 ? (
              <Text style={styles.emptyText} data-testid="devin-empty-task-text">No tasks queued yet.</Text>
            ) : (
              tasks.map((task) => (
                <View key={task.id} style={styles.taskItem} data-testid={`devin-task-item-${task.id}`}>
                  <View style={styles.taskTopRow}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <View style={[styles.riskBadge, { borderColor: getRiskColor(task.risk_level) }]}>
                      <Text style={[styles.riskText, { color: getRiskColor(task.risk_level) }]} data-testid={`devin-task-risk-${task.id}`}>
                        {task.risk_level.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.taskMeta} data-testid={`devin-task-status-${task.id}`}>
                    {task.status.toUpperCase()} • priority {task.priority} • runs {task.run_count}
                  </Text>
                  {!!task.last_run_summary && <Text style={styles.summaryText}>{task.last_run_summary}</Text>}
                  {!!task.last_error && <Text style={styles.errorText}>{task.last_error}</Text>}

                  <View style={styles.taskActions}>
                    {task.requires_approval && !task.is_approved && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() => void approveRiskTask(task.id)}
                        data-testid={`devin-approve-risk-${task.id}`}
                      >
                        <Text style={styles.actionText}>Approve Risk</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.dryRunBtn, task.requires_approval && !task.is_approved && styles.actionDisabled]}
                      onPress={() => void runTask(task.id, true)}
                      disabled={task.requires_approval && !task.is_approved}
                      data-testid={`devin-run-dry-${task.id}`}
                    >
                      <Text style={styles.actionText}>Dry Run</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.liveRunBtn, task.requires_approval && !task.is_approved && styles.actionDisabled]}
                      onPress={() => {
                        Alert.alert('Run Live?', 'This will use model credits.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Run', onPress: () => void runTask(task.id, false) },
                        ]);
                      }}
                      disabled={task.requires_approval && !task.is_approved}
                      data-testid={`devin-run-live-${task.id}`}
                    >
                      <Text style={styles.actionText}>Run Live</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.card} data-testid="devin-run-history-card">
            <Text style={styles.cardTitle}>Recent Runs ({runs.length})</Text>
            {runs.length === 0 ? (
              <Text style={styles.emptyText}>No runs yet.</Text>
            ) : (
              runs.slice(0, 12).map((run) => (
                <View key={run.id} style={styles.runItem} data-testid={`devin-run-item-${run.id}`}>
                  <Text style={styles.runMeta}>
                    {run.status.toUpperCase()} • {run.dry_run ? 'DRY' : 'LIVE'} • iter {run.iterations}
                  </Text>
                  <Text style={styles.runSummary}>{run.response_summary || 'No summary'}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: C.muted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerBtn: { padding: 6 },
  title: { color: C.text, fontSize: 20, fontWeight: '700' },
  content: { padding: 14, gap: 14, paddingBottom: 40 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 10,
  },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: C.text,
    fontSize: 14,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
  },
  priorityPillActive: { borderColor: C.accent, backgroundColor: 'rgba(139,92,246,0.15)' },
  priorityText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  priorityTextActive: { color: C.accent },
  createBtn: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyText: { color: C.muted, fontSize: 13 },
  taskItem: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  taskTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  taskTitle: { color: C.text, fontSize: 14, fontWeight: '700', flex: 1 },
  riskBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  riskText: { fontSize: 10, fontWeight: '700' },
  taskMeta: { color: C.muted, fontSize: 11 },
  summaryText: { color: C.text, fontSize: 12, lineHeight: 18 },
  errorText: { color: C.danger, fontSize: 12, lineHeight: 18 },
  taskActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  approveBtn: { backgroundColor: C.warning },
  dryRunBtn: { backgroundColor: C.success },
  liveRunBtn: { backgroundColor: C.accent },
  actionDisabled: { opacity: 0.4 },
  runItem: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 9,
    gap: 6,
  },
  runMeta: { color: C.muted, fontSize: 11, fontWeight: '700' },
  runSummary: { color: C.text, fontSize: 12, lineHeight: 17 },
});
