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
  Switch,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';

const { width } = Dimensions.get('window');
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
  warning: '#F59E0B',
  blue: '#3B82F6',
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
  next_task_id?: string;
  chain_on_success_only?: boolean;
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

interface Memory {
  id: string;
  content: string;
  category: string;
  created_at: string;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  requires_approval: boolean;
}

// Default permissions for Devin
const DEFAULT_PERMISSIONS: Permission[] = [
  { id: 'shell', name: 'Shell Commands', description: 'Execute terminal commands', enabled: true, requires_approval: false },
  { id: 'file_read', name: 'File Read', description: 'Read files in workspace', enabled: true, requires_approval: false },
  { id: 'file_write', name: 'File Write', description: 'Create/modify files', enabled: true, requires_approval: true },
  { id: 'browser', name: 'Browser Control', description: 'Navigate web, click, type', enabled: true, requires_approval: false },
  { id: 'self_task', name: 'Self-Tasking', description: 'Create tasks for itself', enabled: true, requires_approval: true },
  { id: 'self_modify', name: 'Self-Modification', description: 'Modify own system prompt', enabled: false, requires_approval: true },
  { id: 'camera', name: 'Camera Access', description: 'Take photos/videos', enabled: false, requires_approval: true },
  { id: 'notifications', name: 'Send Notifications', description: 'Push notifications to device', enabled: true, requires_approval: false },
  { id: 'app_launch', name: 'Launch Apps', description: 'Open other applications', enabled: false, requires_approval: true },
  { id: 'contacts', name: 'Contacts Access', description: 'Read device contacts', enabled: false, requires_approval: true },
  { id: 'calendar', name: 'Calendar Access', description: 'Read/write calendar events', enabled: false, requires_approval: true },
  { id: 'location', name: 'Location Access', description: 'Get device location', enabled: false, requires_approval: true },
];

export default function DevinLabScreen() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Main state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<DevinTask[]>([]);
  const [runs, setRuns] = useState<DevinRun[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>(DEFAULT_PERMISSIONS);
  const [devinId, setDevinId] = useState<string>('');
  
  // Task creation
  const [title, setTitle] = useState('');
  const [taskText, setTaskText] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [chainToTask, setChainToTask] = useState<string>('');
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'create' | 'queue' | 'history' | 'memory' | 'permissions'>('create');
  
  // Modal state
  const [showChainModal, setShowChainModal] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem('devin_admin');
      if (stored === 'true') setIsAuthenticated(true);
      
      const savedPerms = localStorage.getItem('devin_permissions');
      if (savedPerms) setPermissions(JSON.parse(savedPerms));
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void loadData();
  }, [isAuthenticated]);

  const handleAuth = () => {
    if (password === ADMIN_SECRET) {
      setIsAuthenticated(true);
      setAuthError('');
      if (Platform.OS === 'web') localStorage.setItem('devin_admin', 'true');
    } else {
      setAuthError('Invalid password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    if (Platform.OS === 'web') localStorage.removeItem('devin_admin');
  };

  const getHeaders = () => ({ 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET });

  const loadData = async () => {
    try {
      setLoading(true);
      const headers = getHeaders();
      
      // Get Devin's ID first
      const agentsRes = await axios.get(`${API_URL}/api/agents`, { headers });
      const devin = agentsRes.data?.find((a: any) => a.name?.toLowerCase().includes('devin'));
      if (devin) setDevinId(devin.id);
      
      const [tasksRes, runsRes, memoriesRes, approvalsRes] = await Promise.all([
        axios.get(`${API_URL}/api/devin/tasks`, { headers }),
        axios.get(`${API_URL}/api/devin/runs`, { headers }),
        devin ? axios.get(`${API_URL}/api/agents/${devin.id}/memories`, { headers }) : Promise.resolve({ data: [] }),
        axios.get(`${API_URL}/api/pending-changes`, { headers }).catch(() => ({ data: [] })),
      ]);
      
      setTasks(tasksRes.data || []);
      setRuns(runsRes.data || []);
      setMemories(memoriesRes.data || []);
      setPendingApprovals(approvalsRes.data || []);
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
      await axios.post(`${API_URL}/api/devin/tasks`, {
        title: title.trim(),
        task: taskText.trim(),
        priority,
        next_task_id: chainToTask || null,
        chain_on_success_only: true,
      }, { headers });
      setTitle('');
      setTaskText('');
      setPriority('normal');
      setChainToTask('');
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
      await axios.post(`${API_URL}/api/devin/tasks/${taskId}/approve-risk`, {}, { headers: getHeaders() });
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
      await axios.post(`${API_URL}/api/devin/tasks/${taskId}/run`, { dry_run: dryRun }, { headers: getHeaders() });
      await loadData();
      setActiveTab('history');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Run failed');
    }
  };

  const deleteTask = async (taskId: string) => {
    const confirm = Platform.OS === 'web' ? window.confirm('Delete this task?') : await new Promise((resolve) =>
      Alert.alert('Delete?', 'This cannot be undone.', [
        { text: 'Cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ])
    );
    if (!confirm) return;
    try {
      await axios.delete(`${API_URL}/api/devin/tasks/${taskId}`, { headers: getHeaders() });
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Delete failed');
    }
  };

  const deleteMemory = async (memoryId: string) => {
    try {
      await axios.delete(`${API_URL}/api/agents/${devinId}/memories/${memoryId}`, { headers: getHeaders() });
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', 'Failed to delete memory');
    }
  };

  const togglePermission = (permId: string) => {
    const updated = permissions.map(p => p.id === permId ? { ...p, enabled: !p.enabled } : p);
    setPermissions(updated);
    if (Platform.OS === 'web') localStorage.setItem('devin_permissions', JSON.stringify(updated));
  };

  const getRiskColor = (risk: string) => {
    if (risk === 'high') return C.danger;
    if (risk === 'medium') return C.warning;
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

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'learning': return C.purple;
      case 'fact': return C.blue;
      case 'preference': return C.warning;
      case 'error': return C.danger;
      default: return C.muted;
    }
  };

  // AUTH SCREEN
  if (!isAuthenticated) {
    return (
      <LinearGradient colors={[C.bg, '#12121A', C.bg]} style={styles.container}>
        <SafeAreaView style={styles.authContainer}>
          <View style={styles.authCard}>
            <LinearGradient colors={[C.accent, '#16A34A']} style={styles.logoGradient}>
              <Ionicons name="flash" size={40} color="#fff" />
            </LinearGradient>
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
            />
            {authError ? <Text style={styles.authError}>{authError}</Text> : null}
            <TouchableOpacity style={styles.authButton} onPress={handleAuth}>
              <Text style={styles.authButtonText}>Enter Lab</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // MAIN APP
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
            {pendingApprovals.length > 0 && (
              <View style={styles.approvalBadge}>
                <Text style={styles.approvalBadgeText}>{pendingApprovals.length}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => void loadData()} style={styles.headerBtn}>
              <Ionicons name="refresh" size={20} color={C.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color={C.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          <View style={styles.tabBar}>
            {[
              { key: 'create', icon: 'add-circle', label: 'New' },
              { key: 'queue', icon: 'list', label: `Queue (${tasks.length})` },
              { key: 'history', icon: 'time', label: 'History' },
              { key: 'memory', icon: 'brain', label: `Memory (${memories.length})` },
              { key: 'permissions', icon: 'shield-checkmark', label: 'Permissions' },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key as any)}
              >
                <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? C.accent : C.muted} />
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Content */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
          {loading ? (
            <View style={styles.centered}><ActivityIndicator size="large" color={C.accent} /></View>
          ) : activeTab === 'create' ? (
            // CREATE TAB
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>What should Devin do?</Text>
                <Text style={styles.cardSubtitle}>
                  Devin can run commands, browse the web, interact with apps, and remember everything.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Task title"
                  placeholderTextColor={C.muted}
                  value={title}
                  onChangeText={setTitle}
                />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe the task in detail..."
                  placeholderTextColor={C.muted}
                  value={taskText}
                  onChangeText={setTaskText}
                  multiline
                />
                <Text style={styles.labelSmall}>Priority</Text>
                <View style={styles.priorityRow}>
                  {(['low', 'normal', 'high'] as const).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.priorityPill, priority === p && styles.priorityPillActive]}
                      onPress={() => setPriority(p)}
                    >
                      <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>
                        {p.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Chain to task */}
                <TouchableOpacity style={styles.chainSelector} onPress={() => setShowChainModal(true)}>
                  <Ionicons name="git-branch" size={16} color={C.purple} />
                  <Text style={styles.chainText}>
                    {chainToTask ? `Chain to: ${tasks.find(t => t.id === chainToTask)?.title || chainToTask.slice(0,8)}` : 'Add to chain (optional)'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.createBtn, (!title.trim() || !taskText.trim() || saving) && styles.btnDisabled]}
                  onPress={createTask}
                  disabled={!title.trim() || !taskText.trim() || saving}
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
                  { title: 'Screenshot a website', task: 'Go to https://news.ycombinator.com and take a screenshot' },
                  { title: 'Check server logs', task: 'Read the last 50 lines of /var/log/supervisor/backend.err.log' },
                  { title: 'Create yourself a task', task: 'Create a new task for yourself to organize the /app folder' },
                  { title: 'Browse and summarize', task: 'Go to https://reddit.com and summarize the top 3 posts' },
                ].map((ex, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.exampleItem}
                    onPress={() => { setTitle(ex.title); setTaskText(ex.task); }}
                  >
                    <Ionicons name="flash-outline" size={16} color={C.accent} />
                    <Text style={styles.exampleText}>{ex.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : activeTab === 'queue' ? (
            // QUEUE TAB
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {tasks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="cube-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>No tasks in queue</Text>
                </View>
              ) : (
                tasks.map((task) => (
                  <View key={task.id} style={styles.taskCard}>
                    <View style={styles.taskHeader}>
                      <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                      <View style={[styles.riskBadge, { borderColor: getRiskColor(task.risk_level) }]}>
                        <Text style={[styles.riskText, { color: getRiskColor(task.risk_level) }]}>
                          {task.risk_level.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.taskBody} numberOfLines={2}>{task.task}</Text>
                    <View style={styles.taskMeta}>
                      <Text style={styles.metaText}>
                        {task.status.toUpperCase()} • {task.priority} • {task.run_count} runs
                      </Text>
                      {task.next_task_id && (
                        <View style={styles.chainIndicator}>
                          <Ionicons name="git-branch" size={12} color={C.purple} />
                          <Text style={styles.chainIndicatorText}>Chained</Text>
                        </View>
                      )}
                    </View>
                    {task.last_run_summary && <Text style={styles.summaryText} numberOfLines={2}>{task.last_run_summary}</Text>}
                    {task.last_error && <Text style={styles.errorText} numberOfLines={1}>{task.last_error}</Text>}
                    <View style={styles.taskActions}>
                      {task.requires_approval && !task.is_approved ? (
                        <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => void approveTask(task.id)}>
                          <Ionicons name="shield-checkmark" size={14} color="#fff" />
                          <Text style={styles.actionText}>Approve</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity style={[styles.actionBtn, styles.dryBtn]} onPress={() => void runTask(task.id, true)}>
                            <Ionicons name="eye" size={14} color="#fff" />
                            <Text style={styles.actionText}>Dry</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.actionBtn, styles.liveBtn]} onPress={() => void runTask(task.id, false)}>
                            <Ionicons name="play" size={14} color="#fff" />
                            <Text style={styles.actionText}>Run</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => void deleteTask(task.id)}>
                        <Ionicons name="trash-outline" size={14} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          ) : activeTab === 'history' ? (
            // HISTORY TAB
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {runs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="time-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>No runs yet</Text>
                </View>
              ) : (
                runs.map((run) => (
                  <View key={run.id} style={styles.runCard}>
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
                          <Text style={styles.retryText}>{run.retry_attempts}x</Text>
                        </View>
                      )}
                    </View>
                    {run.quality_score !== null && run.quality_score !== undefined && !run.dry_run && (
                      <View style={styles.qualityBar}>
                        <View style={[styles.qualityFill, { width: `${run.quality_score}%`, backgroundColor: getGradeColor(run.quality_grade || 'C') }]} />
                        <Text style={styles.qualityLabel}>{run.quality_score}%</Text>
                      </View>
                    )}
                    <Text style={styles.runSummary} numberOfLines={3}>{run.response_summary || 'No summary'}</Text>
                    {run.quality_feedback && run.quality_feedback.length > 0 && !run.dry_run && (
                      <View style={styles.feedbackContainer}>
                        {run.quality_feedback.slice(0, 3).map((fb, idx) => (
                          <Text key={idx} style={styles.feedbackItem}>• {fb}</Text>
                        ))}
                      </View>
                    )}
                    <Text style={styles.runDate}>{new Date(run.created_at).toLocaleString()}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          ) : activeTab === 'memory' ? (
            // MEMORY TAB
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.memoryHeader}>
                <Text style={styles.memoryTitle}>Devin's Memory</Text>
                <Text style={styles.memorySubtitle}>
                  {memories.length} memories stored • Injected before each task
                </Text>
              </View>
              {memories.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="brain-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>No memories yet</Text>
                  <Text style={styles.emptySubtext}>Devin saves learnings as he works</Text>
                </View>
              ) : (
                memories.map((mem) => (
                  <View key={mem.id} style={styles.memoryCard}>
                    <View style={styles.memoryCardHeader}>
                      <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(mem.category) + '30', borderColor: getCategoryColor(mem.category) }]}>
                        <Text style={[styles.categoryText, { color: getCategoryColor(mem.category) }]}>
                          {mem.category.toUpperCase()}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => void deleteMemory(mem.id)} style={styles.memoryDelete}>
                        <Ionicons name="close-circle" size={18} color={C.muted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.memoryContent}>{mem.content}</Text>
                    <Text style={styles.memoryDate}>{new Date(mem.created_at).toLocaleString()}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          ) : (
            // PERMISSIONS TAB
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.permHeader}>
                <Text style={styles.permTitle}>Devin's Permissions</Text>
                <Text style={styles.permSubtitle}>
                  Control what Devin can do. Approval-required actions need your OK before executing.
                </Text>
              </View>
              {permissions.map((perm) => (
                <View key={perm.id} style={styles.permCard}>
                  <View style={styles.permInfo}>
                    <View style={styles.permNameRow}>
                      <Ionicons 
                        name={perm.enabled ? 'checkmark-circle' : 'close-circle'} 
                        size={20} 
                        color={perm.enabled ? C.accent : C.muted} 
                      />
                      <Text style={styles.permName}>{perm.name}</Text>
                      {perm.requires_approval && (
                        <View style={styles.approvalTag}>
                          <Ionicons name="shield" size={10} color={C.warning} />
                          <Text style={styles.approvalTagText}>Approval</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.permDesc}>{perm.description}</Text>
                  </View>
                  <Switch
                    value={perm.enabled}
                    onValueChange={() => togglePermission(perm.id)}
                    trackColor={{ false: C.border, true: C.accent + '50' }}
                    thumbColor={perm.enabled ? C.accent : C.muted}
                  />
                </View>
              ))}
              <View style={styles.permWarning}>
                <Ionicons name="warning" size={20} color={C.warning} />
                <Text style={styles.permWarningText}>
                  Self-modification is disabled by default. Enable with caution - Devin cannot grant himself new permissions without your approval.
                </Text>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>

        {/* Chain Task Modal */}
        <Modal visible={showChainModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Chain to Task</Text>
              <Text style={styles.modalSubtitle}>Run another task after this one completes</Text>
              <ScrollView style={styles.modalScroll}>
                <TouchableOpacity
                  style={[styles.chainOption, !chainToTask && styles.chainOptionActive]}
                  onPress={() => { setChainToTask(''); setShowChainModal(false); }}
                >
                  <Ionicons name="close-circle-outline" size={20} color={!chainToTask ? C.accent : C.muted} />
                  <Text style={[styles.chainOptionText, !chainToTask && styles.chainOptionTextActive]}>No chain</Text>
                </TouchableOpacity>
                {tasks.filter(t => t.status === 'queued').map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.chainOption, chainToTask === t.id && styles.chainOptionActive]}
                    onPress={() => { setChainToTask(t.id); setShowChainModal(false); }}
                  >
                    <Ionicons name="git-branch" size={20} color={chainToTask === t.id ? C.accent : C.muted} />
                    <Text style={[styles.chainOptionText, chainToTask === t.id && styles.chainOptionTextActive]} numberOfLines={1}>
                      {t.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowChainModal(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Auth
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  authCard: { width: '100%', maxWidth: 400, backgroundColor: C.card, borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  logoGradient: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  authTitle: { fontSize: 28, fontWeight: '700', color: C.text, marginBottom: 8 },
  authSubtitle: { fontSize: 14, color: C.muted, marginBottom: 24 },
  authInput: { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  authError: { color: C.danger, fontSize: 13, marginBottom: 12 },
  authButton: { width: '100%', backgroundColor: C.accent, borderRadius: 12, padding: 16, alignItems: 'center' },
  authButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { padding: 8 },
  logoutBtn: { padding: 8 },
  approvalBadge: { backgroundColor: C.danger, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  approvalBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Tabs
  tabScroll: { maxHeight: 50, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  tabActive: { backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  tabText: { fontSize: 12, fontWeight: '600', color: C.muted },
  tabTextActive: { color: C.accent },

  // Content
  content: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Cards
  card: { backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 6 },
  cardSubtitle: { fontSize: 13, color: C.muted, marginBottom: 20, lineHeight: 18 },

  // Inputs
  input: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  labelSmall: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 8, textTransform: 'uppercase' },

  // Priority
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  priorityPill: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  priorityPillActive: { borderColor: C.accent, backgroundColor: 'rgba(34,197,94,0.1)' },
  priorityText: { fontSize: 12, fontWeight: '700', color: C.muted },
  priorityTextActive: { color: C.accent },

  // Chain selector
  chainSelector: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  chainText: { flex: 1, fontSize: 13, color: C.text },

  // Buttons
  createBtn: { borderRadius: 12, overflow: 'hidden' },
  createBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  // Examples
  examplesCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  examplesTitle: { fontSize: 14, fontWeight: '600', color: C.muted, marginBottom: 12 },
  exampleItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  exampleText: { fontSize: 14, color: C.text },

  // Empty
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: C.muted, marginTop: 16 },
  emptySubtext: { fontSize: 13, color: C.muted, marginTop: 4 },

  // Task cards
  taskCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  taskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  taskTitle: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1, marginRight: 8 },
  riskBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  riskText: { fontSize: 10, fontWeight: '700' },
  taskBody: { fontSize: 13, color: C.muted, marginBottom: 8, lineHeight: 18 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  metaText: { fontSize: 11, color: C.muted },
  chainIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 10 },
  chainIndicatorText: { fontSize: 10, color: C.purple },
  summaryText: { fontSize: 12, color: C.text, marginBottom: 6, lineHeight: 17 },
  errorText: { fontSize: 12, color: C.danger, marginBottom: 6 },
  taskActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  approveBtn: { backgroundColor: C.warning },
  dryBtn: { backgroundColor: C.success },
  liveBtn: { backgroundColor: C.purple },
  deleteBtn: { backgroundColor: 'rgba(239,68,68,0.15)', marginLeft: 'auto' },

  // Run cards
  runCard: { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  runHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  runStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusSuccess: { backgroundColor: 'rgba(16,185,129,0.2)' },
  statusFailed: { backgroundColor: 'rgba(239,68,68,0.2)' },
  runStatusText: { fontSize: 10, fontWeight: '700', color: C.text },
  dryBadge: { backgroundColor: 'rgba(34,197,94,0.2)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  liveBadge: { backgroundColor: 'rgba(139,92,246,0.2)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 9, fontWeight: '700', color: C.text },
  gradeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  gradeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  retryBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  retryText: { fontSize: 9, color: C.muted },
  qualityBar: { height: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, marginBottom: 10, overflow: 'hidden', position: 'relative' },
  qualityFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 10 },
  qualityLabel: { position: 'absolute', right: 8, top: 3, fontSize: 10, fontWeight: '700', color: C.text },
  feedbackContainer: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, marginBottom: 8 },
  feedbackItem: { fontSize: 11, color: C.muted, lineHeight: 16 },
  runSummary: { fontSize: 13, color: C.text, lineHeight: 18, marginBottom: 6 },
  runDate: { fontSize: 11, color: C.muted },

  // Memory tab
  memoryHeader: { marginBottom: 16 },
  memoryTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  memorySubtitle: { fontSize: 13, color: C.muted, marginTop: 4 },
  memoryCard: { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  memoryCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  categoryText: { fontSize: 10, fontWeight: '700' },
  memoryDelete: { padding: 4 },
  memoryContent: { fontSize: 13, color: C.text, lineHeight: 19, marginBottom: 8 },
  memoryDate: { fontSize: 11, color: C.muted },

  // Permissions tab
  permHeader: { marginBottom: 16 },
  permTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  permSubtitle: { fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 18 },
  permCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  permInfo: { flex: 1, marginRight: 12 },
  permNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  permName: { fontSize: 14, fontWeight: '600', color: C.text },
  approvalTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  approvalTagText: { fontSize: 9, fontWeight: '600', color: C.warning },
  permDesc: { fontSize: 12, color: C.muted },
  permWarning: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, marginTop: 10, alignItems: 'flex-start' },
  permWarningText: { flex: 1, fontSize: 12, color: C.warning, lineHeight: 18 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 400, backgroundColor: C.card, borderRadius: 16, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: C.muted, marginBottom: 16 },
  modalScroll: { maxHeight: 300 },
  chainOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.03)' },
  chainOptionActive: { backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  chainOptionText: { fontSize: 14, color: C.muted, flex: 1 },
  chainOptionTextActive: { color: C.text },
  modalClose: { marginTop: 16, padding: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 14, color: C.muted },
});
