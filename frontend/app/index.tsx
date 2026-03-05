import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';

const { width, height } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET || 'forge_master_2025';

const C = {
  bg: '#0A0A0F',
  card: '#14141C',
  border: '#1E1E2A',
  text: '#E5E5EA',
  muted: '#6B7280',
  accent: '#22C55E',
  purple: '#8B5CF6',
  danger: '#EF4444',
  success: '#10B981',
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
  quality_score?: number;
  quality_grade?: string;
  quality_feedback?: string[];
  retry_attempts?: number;
}

export default function DevinLabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  // Auth state - simple admin password
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Main state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<DevinTask[]>([]);
  const [runs, setRuns] = useState<DevinRun[]>([]);
  
  // Task creation
  const [title, setTitle] = useState('');
  const [taskText, setTaskText] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'create' | 'queue' | 'history'>('create');

  // Check if stored auth exists
  useEffect(() => {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem('devin_admin');
      if (stored === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, []);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      void loadData();
    }
  }, [isAuthenticated]);

  const handleAuth = () => {
    if (password === ADMIN_SECRET) {
      setIsAuthenticated(true);
      setAuthError('');
      if (Platform.OS === 'web') {
        localStorage.setItem('devin_admin', 'true');
      }
    } else {
      setAuthError('Invalid password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    if (Platform.OS === 'web') {
      localStorage.removeItem('devin_admin');
    }
  };

  const getHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_SECRET,
    };
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const headers = getHeaders();
      const [tasksRes, runsRes] = await Promise.all([
        axios.get(`${API_URL}/api/devin/tasks`, { headers }),
        axios.get(`${API_URL}/api/devin/runs`, { headers }),
      ]);
      setTasks(tasksRes.data || []);
      setRuns(runsRes.data || []);
    } catch (err) {
      console.log('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const createTask = async () => {
    if (!title.trim() || !taskText.trim() || saving) return;
    try {
      setSaving(true);
      const headers = getHeaders();
      await axios.post(
        `${API_URL}/api/devin/tasks`,
        { title: title.trim(), task: taskText.trim(), priority },
        { headers }
      );
      setTitle('');
      setTaskText('');
      setPriority('normal');
      await loadData();
      setActiveTab('queue');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const approveTask = async (taskId: string) => {
    try {
      const headers = getHeaders();
      await axios.post(`${API_URL}/api/devin/tasks/${taskId}/approve-risk`, {}, { headers });
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Approval failed');
    }
  };

  const runTask = async (taskId: string, dryRun: boolean) => {
    if (!dryRun) {
      const proceed = Platform.OS === 'web'
        ? window.confirm('This will use credits. Proceed?')
        : await new Promise((resolve) =>
            Alert.alert('Run Live?', 'This will use model credits.', [
              { text: 'Cancel', onPress: () => resolve(false) },
              { text: 'Run', onPress: () => resolve(true) },
            ])
          );
      if (!proceed) return;
    }

    try {
      const headers = getHeaders();
      await axios.post(`${API_URL}/api/devin/tasks/${taskId}/run`, { dry_run: dryRun }, { headers });
      await loadData();
      setActiveTab('history');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Run failed');
    }
  };

  const deleteTask = async (taskId: string) => {
    const confirm = Platform.OS === 'web'
      ? window.confirm('Delete this task?')
      : await new Promise((resolve) =>
          Alert.alert('Delete Task?', 'This cannot be undone.', [
            { text: 'Cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ])
        );
    if (!confirm) return;

    try {
      const headers = getHeaders();
      await axios.delete(`${API_URL}/api/devin/tasks/${taskId}`, { headers });
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Delete failed');
    }
  };

  const getRiskColor = (risk: string) => {
    if (risk === 'high') return C.danger;
    if (risk === 'medium') return '#F59E0B';
    return C.success;
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return '#22C55E';
      case 'B': return '#84CC16';
      case 'C': return '#F59E0B';
      case 'D': return '#F97316';
      case 'F': return '#EF4444';
      default: return C.muted;
    }
  };

  // ============ AUTH SCREEN ============
  if (!isAuthenticated) {
    return (
      <LinearGradient colors={[C.bg, '#12121A', C.bg]} style={styles.container}>
        <SafeAreaView style={styles.authContainer}>
          <View style={styles.authCard}>
            <View style={styles.authLogo}>
              <LinearGradient colors={[C.accent, '#16A34A']} style={styles.logoGradient}>
                <Ionicons name="flash" size={40} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.authTitle}>Devin Lab</Text>
            <Text style={styles.authSubtitle}>Admin Access Required</Text>

            <TextInput
              style={styles.authInput}
              placeholder="Enter admin password"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmitEditing={handleAuth}
              data-testid="admin-password-input"
            />

            {authError ? <Text style={styles.authError}>{authError}</Text> : null}

            <TouchableOpacity style={styles.authButton} onPress={handleAuth} data-testid="admin-login-button">
              <Text style={styles.authButtonText}>Enter Lab</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============ MAIN APP ============
  return (
    <LinearGradient colors={[C.bg, '#12121A', C.bg]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient colors={[C.accent, '#16A34A']} style={styles.headerLogo}>
              <Ionicons name="flash" size={20} color="#fff" />
            </LinearGradient>
            <Text style={styles.headerTitle}>Devin Lab</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => void loadData()} style={styles.headerBtn} data-testid="refresh-button">
              <Ionicons name="refresh" size={20} color={C.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} data-testid="logout-button">
              <Ionicons name="log-out-outline" size={18} color={C.danger} />
              <Text style={styles.logoutText}>Exit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(['create', 'queue', 'history'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
            >
              <Ionicons
                name={tab === 'create' ? 'add-circle' : tab === 'queue' ? 'list' : 'time'}
                size={18}
                color={activeTab === tab ? C.accent : C.muted}
              />
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'create' ? 'New Task' : tab === 'queue' ? `Queue (${tasks.length})` : 'History'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={C.accent} />
            </View>
          ) : activeTab === 'create' ? (
            // ============ CREATE TAB ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.card} data-testid="create-task-card">
                <Text style={styles.cardTitle}>What should Devin do?</Text>
                <Text style={styles.cardSubtitle}>
                  Devin can run shell commands, read/write files, and execute complex tasks.
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Task title (e.g., 'Fix login bug')"
                  placeholderTextColor={C.muted}
                  value={title}
                  onChangeText={setTitle}
                  data-testid="task-title-input"
                />

                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe the task in detail..."
                  placeholderTextColor={C.muted}
                  value={taskText}
                  onChangeText={setTaskText}
                  multiline
                  data-testid="task-body-input"
                />

                <Text style={styles.labelSmall}>Priority</Text>
                <View style={styles.priorityRow}>
                  {(['low', 'normal', 'high'] as const).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.priorityPill, priority === p && styles.priorityPillActive]}
                      onPress={() => setPriority(p)}
                      data-testid={`priority-${p}`}
                    >
                      <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>
                        {p.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.createBtn, (!title.trim() || !taskText.trim() || saving) && styles.btnDisabled]}
                  onPress={createTask}
                  disabled={!title.trim() || !taskText.trim() || saving}
                  data-testid="create-task-button"
                >
                  <LinearGradient colors={[C.accent, '#16A34A']} style={styles.createBtnGradient}>
                    <Ionicons name="rocket" size={18} color="#fff" />
                    <Text style={styles.createBtnText}>{saving ? 'Creating...' : 'Queue Task'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Quick examples */}
              <View style={styles.examplesCard}>
                <Text style={styles.examplesTitle}>Example Tasks</Text>
                {[
                  { title: 'List project files', task: 'List all files in /app and summarize the project structure' },
                  { title: 'Check server logs', task: 'Read the last 50 lines of /var/log/supervisor/backend.err.log' },
                  { title: 'Find TODOs', task: 'Search for all TODO comments in the codebase' },
                ].map((ex, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.exampleItem}
                    onPress={() => {
                      setTitle(ex.title);
                      setTaskText(ex.task);
                    }}
                    data-testid={`example-${i}`}
                  >
                    <Ionicons name="flash-outline" size={16} color={C.accent} />
                    <Text style={styles.exampleText}>{ex.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : activeTab === 'queue' ? (
            // ============ QUEUE TAB ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {tasks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="cube-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>No tasks in queue</Text>
                  <TouchableOpacity onPress={() => setActiveTab('create')}>
                    <Text style={styles.emptyLink}>Create your first task</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                tasks.map((task) => (
                  <View key={task.id} style={styles.taskCard} data-testid={`task-${task.id}`}>
                    <View style={styles.taskHeader}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <View style={[styles.riskBadge, { borderColor: getRiskColor(task.risk_level) }]}>
                        <Text style={[styles.riskText, { color: getRiskColor(task.risk_level) }]}>
                          {task.risk_level.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.taskBody} numberOfLines={3}>{task.task}</Text>

                    <View style={styles.taskMeta}>
                      <Text style={styles.metaText}>
                        {task.status.toUpperCase()} • {task.priority} priority • {task.run_count} runs
                      </Text>
                    </View>

                    {task.last_run_summary && (
                      <Text style={styles.summaryText} numberOfLines={2}>{task.last_run_summary}</Text>
                    )}
                    {task.last_error && <Text style={styles.errorText} numberOfLines={2}>{task.last_error}</Text>}

                    <View style={styles.taskActions}>
                      {task.requires_approval && !task.is_approved ? (
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.approveBtn]}
                          onPress={() => void approveTask(task.id)}
                          data-testid={`approve-${task.id}`}
                        >
                          <Ionicons name="shield-checkmark" size={14} color="#fff" />
                          <Text style={styles.actionText}>Approve</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.dryBtn]}
                            onPress={() => void runTask(task.id, true)}
                            data-testid={`dry-run-${task.id}`}
                          >
                            <Ionicons name="eye" size={14} color="#fff" />
                            <Text style={styles.actionText}>Dry Run</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.liveBtn]}
                            onPress={() => void runTask(task.id, false)}
                            data-testid={`live-run-${task.id}`}
                          >
                            <Ionicons name="play" size={14} color="#fff" />
                            <Text style={styles.actionText}>Run Live</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.deleteBtn]}
                        onPress={() => void deleteTask(task.id)}
                        data-testid={`delete-${task.id}`}
                      >
                        <Ionicons name="trash-outline" size={14} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          ) : (
            // ============ HISTORY TAB ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {runs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="time-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>No runs yet</Text>
                </View>
              ) : (
                runs.map((run) => (
                  <View key={run.id} style={styles.runCard} data-testid={`run-${run.id}`}>
                    <View style={styles.runHeader}>
                      <View style={[styles.runStatus, run.status === 'completed' ? styles.statusSuccess : styles.statusFailed]}>
                        <Text style={styles.runStatusText}>{run.status.toUpperCase()}</Text>
                      </View>
                      <View style={run.dry_run ? styles.dryBadge : styles.liveBadge}>
                        <Text style={styles.badgeText}>{run.dry_run ? 'DRY' : 'LIVE'}</Text>
                      </View>
                      {run.quality_grade && run.quality_grade !== 'N/A' && (
                        <View style={[styles.gradeBadge, { backgroundColor: getGradeColor(run.quality_grade) }]}>
                          <Text style={styles.gradeText}>{run.quality_grade}</Text>
                        </View>
                      )}
                      {run.retry_attempts && run.retry_attempts > 1 && (
                        <View style={styles.retryBadge}>
                          <Ionicons name="refresh" size={10} color={C.muted} />
                          <Text style={styles.retryText}>{run.retry_attempts} tries</Text>
                        </View>
                      )}
                      <Text style={styles.runIterations}>{run.iterations} iter</Text>
                    </View>
                    
                    {run.quality_score !== null && run.quality_score !== undefined && !run.dry_run && (
                      <View style={styles.qualityBar}>
                        <View style={[styles.qualityFill, { width: `${run.quality_score}%`, backgroundColor: getGradeColor(run.quality_grade || 'C') }]} />
                        <Text style={styles.qualityLabel}>Quality: {run.quality_score}%</Text>
                      </View>
                    )}
                    
                    <Text style={styles.runSummary}>{run.response_summary || 'No summary'}</Text>
                    
                    {run.quality_feedback && run.quality_feedback.length > 0 && !run.dry_run && (
                      <View style={styles.feedbackContainer}>
                        {run.quality_feedback.map((fb, idx) => (
                          <Text key={idx} style={styles.feedbackItem}>• {fb}</Text>
                        ))}
                      </View>
                    )}
                    
                    <Text style={styles.runDate}>
                      {new Date(run.created_at).toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Auth styles
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  authCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  authLogo: { marginBottom: 20 },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authTitle: { fontSize: 28, fontWeight: '700', color: C.text, marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: C.muted, marginBottom: 24 },
  authInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    color: C.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  authError: { color: C.danger, fontSize: 13, marginBottom: 12 },
  authButton: {
    width: '100%',
    backgroundColor: C.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  authButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { padding: 8 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  logoutText: { color: C.danger, fontSize: 13, fontWeight: '600' },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tabActive: { backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  tabText: { fontSize: 13, fontWeight: '600', color: C.muted },
  tabTextActive: { color: C.accent },

  // Content
  content: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Cards
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 6 },
  cardSubtitle: { fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 18 },

  // Inputs
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  labelSmall: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 8, textTransform: 'uppercase' },

  // Priority
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  priorityPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  priorityPillActive: { borderColor: C.accent, backgroundColor: 'rgba(34,197,94,0.1)' },
  priorityText: { fontSize: 12, fontWeight: '700', color: C.muted },
  priorityTextActive: { color: C.accent },

  // Buttons
  createBtn: { borderRadius: 12, overflow: 'hidden' },
  createBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  // Examples
  examplesCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  examplesTitle: { fontSize: 14, fontWeight: '600', color: C.muted, marginBottom: 12 },
  exampleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  exampleText: { fontSize: 14, color: C.text },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: C.muted, marginTop: 16 },
  emptyLink: { fontSize: 14, color: C.accent, marginTop: 8, fontWeight: '600' },

  // Task cards
  taskCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  taskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  taskTitle: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  riskBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  riskText: { fontSize: 10, fontWeight: '700' },
  taskBody: { fontSize: 13, color: C.muted, marginBottom: 10, lineHeight: 18 },
  taskMeta: { marginBottom: 8 },
  metaText: { fontSize: 11, color: C.muted },
  summaryText: { fontSize: 12, color: C.text, marginBottom: 6, lineHeight: 17 },
  errorText: { fontSize: 12, color: C.danger, marginBottom: 6 },
  taskActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  approveBtn: { backgroundColor: '#F59E0B' },
  dryBtn: { backgroundColor: C.success },
  liveBtn: { backgroundColor: C.purple },
  deleteBtn: { backgroundColor: 'rgba(239,68,68,0.15)', marginLeft: 'auto' },

  // Run cards
  runCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  runHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  runStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusSuccess: { backgroundColor: 'rgba(16,185,129,0.2)' },
  statusFailed: { backgroundColor: 'rgba(239,68,68,0.2)' },
  runStatusText: { fontSize: 10, fontWeight: '700', color: C.text },
  dryBadge: { backgroundColor: 'rgba(34,197,94,0.2)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  liveBadge: { backgroundColor: 'rgba(139,92,246,0.2)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 9, fontWeight: '700', color: C.text },
  runIterations: { fontSize: 11, color: C.muted },
  runSummary: { fontSize: 13, color: C.text, lineHeight: 18, marginBottom: 6 },
  runDate: { fontSize: 11, color: C.muted },
  
  // Quality & Retry badges
  gradeBadge: { 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 4,
  },
  gradeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  retryBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.1)', 
    paddingHorizontal: 6, 
    paddingVertical: 3, 
    borderRadius: 4 
  },
  retryText: { fontSize: 9, color: C.muted },
  qualityBar: {
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  qualityFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 10,
  },
  qualityLabel: {
    position: 'absolute',
    right: 8,
    top: 3,
    fontSize: 10,
    fontWeight: '700',
    color: C.text,
  },
  feedbackContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  feedbackItem: { fontSize: 11, color: C.muted, lineHeight: 16 },
});
