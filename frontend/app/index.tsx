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
const createChatSessionId = () => `devin-chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolResults?: any[];
  iterations?: number;
  timestamp: string;
}

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

interface Pack {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  is_free: boolean;
  price_usd: number;
  is_unlocked: boolean;
  is_active: boolean;
  allowed_tools: string[];
  age_gate?: boolean;
  coming_soon?: boolean;
}

interface TrialInfo {
  is_trial: boolean;
  actions_used: number;
  max_actions: number;
  actions_remaining: number;
  trial_expired?: boolean;
}

interface UserSettings {
  user_id?: string;
  age_verified: boolean;
}

interface UserCustomization {
  agent_name: string;
  personality: string;
  tone: string;
  response_length: string;
}

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
  const chatScrollRef = useRef<ScrollView>(null);
  const chatSessionIdRef = useRef('');
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [guestId, setGuestId] = useState('');
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
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatSessionId, setChatSessionId] = useState('');
  
  // Task creation
  const [title, setTitle] = useState('');
  const [taskText, setTaskText] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [chainToTask, setChainToTask] = useState<string>('');
  
  // Tab state - Chat is now first/default
  const [activeTab, setActiveTab] = useState<'chat' | 'create' | 'queue' | 'history' | 'packs' | 'memory' | 'permissions' | 'customize' | 'settings'>('chat');
  
  // Pack state
  const [packs, setPacks] = useState<Pack[]>([]);
  const [activePack, setActivePack] = useState<Pack | null>(null);
  const [packSwitching, setPackSwitching] = useState(false);
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);

  // Age-gate modal
  const [showAgeGateModal, setShowAgeGateModal] = useState(false);
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);

  // Settings state
  const [userSettings, setUserSettings] = useState<UserSettings>({ age_verified: false });
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showSettingsAgeModal, setShowSettingsAgeModal] = useState(false);

  // Customize state
  const [userCustomization, setUserCustomization] = useState<UserCustomization>({
    agent_name: 'PAUL·E', personality: 'balanced', tone: 'warm', response_length: 'normal',
  });
  const [customizationSaving, setCustomizationSaving] = useState(false);
  
  // Modal state
  const [showChainModal, setShowChainModal] = useState(false);
  const [showToolResults, setShowToolResults] = useState<any[] | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Check admin auth
      const stored = localStorage.getItem('devin_admin');
      if (stored === 'true') {
        setIsAuthenticated(true);
        setIsGuest(false);
      }

      // Check guest session — auto-login if UUID exists
      const storedGuest = localStorage.getItem('paule_guest_id');
      if (storedGuest && stored !== 'true') {
        setGuestId(storedGuest);
        setIsGuest(true);
        setIsAuthenticated(true);
      }

      const savedPerms = localStorage.getItem('devin_permissions');
      if (savedPerms) setPermissions(JSON.parse(savedPerms));
      
      const savedChat = localStorage.getItem('devin_chat');
      if (savedChat) setChatMessages(JSON.parse(savedChat));

      const savedChatSessionId = localStorage.getItem('devin_chat_session_id');
      const nextChatSessionId = savedChatSessionId || createChatSessionId();
      setChatSessionId(nextChatSessionId);
      if (!savedChatSessionId) localStorage.setItem('devin_chat_session_id', nextChatSessionId);
    } else {
      setChatSessionId(createChatSessionId());
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    chatSessionIdRef.current = chatSessionId;
  }, [chatSessionId]);

  // Save chat to localStorage
  useEffect(() => {
    if (Platform.OS === 'web' && chatMessages.length > 0) {
      localStorage.setItem('devin_chat', JSON.stringify(chatMessages.slice(-50))); // Keep last 50 messages
    }
  }, [chatMessages]);

  const handleAuth = () => {
    if (password === ADMIN_SECRET) {
      setIsAuthenticated(true);
      setIsGuest(false);
      setAuthError('');
      if (Platform.OS === 'web') localStorage.setItem('devin_admin', 'true');
    } else {
      setAuthError('Invalid password');
    }
  };

  const handleGuestLogin = () => {
    let id = Platform.OS === 'web' ? localStorage.getItem('paule_guest_id') : null;
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      if (Platform.OS === 'web') localStorage.setItem('paule_guest_id', id);
    }
    setGuestId(id);
    setIsGuest(true);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsGuest(false);
    setGuestId('');
    setPassword('');
    if (Platform.OS === 'web') {
      localStorage.removeItem('devin_admin');
      localStorage.removeItem('paule_guest_id');
      localStorage.removeItem('devin_chat');
      localStorage.removeItem('devin_chat_session_id');
    }
  };

  const getHeaders = () => {
    if (isGuest && guestId) {
      return { 'Content-Type': 'application/json', 'X-Guest-Id': guestId };
    }
    return { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET };
  };

  const persistChatSessionId = (nextSessionId: string) => {
    chatSessionIdRef.current = nextSessionId;
    setChatSessionId(nextSessionId);
    if (Platform.OS === 'web') localStorage.setItem('devin_chat_session_id', nextSessionId);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const headers = getHeaders();
      
      const agentsRes = await axios.get(`${API_URL}/api/agents`, { headers });
      const paule = agentsRes.data?.find((a: any) => a.name?.toLowerCase().includes('paul') || a.name?.toLowerCase().includes('devin'));
      if (paule) setDevinId(paule.id);
      
      const [tasksRes, runsRes, memoriesRes, packsRes, activePackRes, trialRes, settingsRes, customizationRes] = await Promise.all([
        axios.get(`${API_URL}/api/devin/tasks`, { headers }),
        axios.get(`${API_URL}/api/devin/runs`, { headers }),
        paule ? axios.get(`${API_URL}/api/agents/${paule.id}/memories`, { headers }) : Promise.resolve({ data: [] }),
        axios.get(`${API_URL}/api/user/packs`, { headers }),
        axios.get(`${API_URL}/api/user/active-pack`, { headers }),
        axios.get(`${API_URL}/api/user/trial-status`, { headers }),
        axios.get(`${API_URL}/api/user/settings`, { headers }),
        axios.get(`${API_URL}/api/user/customization`, { headers }),
      ]);
      
      setTasks(tasksRes.data || []);
      setRuns(runsRes.data || []);
      setMemories(memoriesRes.data || []);
      setPacks(packsRes.data || []);
      if (activePackRes.data?.id) {
        setActivePack(activePackRes.data);
      }
      if (trialRes.data?.is_trial !== undefined) {
        setTrialInfo(trialRes.data);
      }
      if (settingsRes.data) {
        setUserSettings(settingsRes.data);
      }
      if (customizationRes.data) {
        setUserCustomization(customizationRes.data);
      }
    } catch (err) {
      console.log('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const switchPack = async (packId: string) => {
    if (packSwitching) return;
    
    const pack = packs.find(p => p.id === packId);
    if (!pack) return;

    // Block coming soon packs
    if (pack.coming_soon) return;
    
    // Auto-unlock if not owned (payment integration later)
    if (!pack.is_unlocked && !pack.is_free) {
      try {
        setPackSwitching(true);
        await axios.post(`${API_URL}/api/user/packs/${packId}/unlock`, {}, { headers: getHeaders() });
      } catch (err) {
        console.log('Unlock error:', err);
        setPackSwitching(false);
        return;
      }
    }
    
    try {
      setPackSwitching(true);
      await axios.post(`${API_URL}/api/user/packs/${packId}/activate`, {}, { headers: getHeaders() });
      
      // Clear chat when switching packs
      setChatMessages([]);
      const nextChatSessionId = createChatSessionId();
      persistChatSessionId(nextChatSessionId);
      if (Platform.OS === 'web') localStorage.removeItem('devin_chat');
      
      await loadData();
    } catch (err: any) {
      if (err.response?.data?.detail === 'age_gate_required') {
        setPendingPackId(packId);
        setShowAgeGateModal(true);
      } else {
        console.log('Switch pack error:', err);
      }
    } finally {
      setPackSwitching(false);
    }
  };

  const confirmAgeGate = async () => {
    if (!pendingPackId) return;
    try {
      setPackSwitching(true);
      await axios.post(`${API_URL}/api/user/packs/${pendingPackId}/age-verify`, {}, { headers: getHeaders() });
      await axios.post(`${API_URL}/api/user/packs/${pendingPackId}/activate`, {}, { headers: getHeaders() });
      setShowAgeGateModal(false);
      setPendingPackId(null);
      setChatMessages([]);
      const nextChatSessionId = createChatSessionId();
      persistChatSessionId(nextChatSessionId);
      if (Platform.OS === 'web') localStorage.removeItem('devin_chat');
      await loadData();
    } catch (err) {
      console.log('Age verify error:', err);
      setShowAgeGateModal(false);
    } finally {
      setPackSwitching(false);
    }
  };

  const handleSettingsAgeVerify = async () => {
    try {
      await axios.post(`${API_URL}/api/user/settings/age-verify`, {}, { headers: getHeaders() });
      setUserSettings({ ...userSettings, age_verified: true });
      setShowSettingsAgeModal(false);
      await loadData(); // Refresh to include Companion in packs
    } catch (err) {
      console.log('Settings age verify error:', err);
      setShowSettingsAgeModal(false);
    }
  };

  const saveCustomization = async () => {
    if (customizationSaving) return;
    setCustomizationSaving(true);
    try {
      const res = await axios.put(`${API_URL}/api/user/customization`, userCustomization, { headers: getHeaders() });
      setUserCustomization(res.data);
    } catch (err) {
      console.log('Save customization error:', err);
    } finally {
      setCustomizationSaving(false);
    }
  };

  // CHAT FUNCTIONS
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatSending || !devinId) return;

    const activeSessionId = chatSessionId || createChatSessionId();
    if (!chatSessionId) persistChatSessionId(activeSessionId);
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatSending(true);
    
    // Scroll to bottom
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    
    try {
      const res = await axios.post(`${API_URL}/api/agentic-chat`, {
        agent_id: devinId,
        message: userMessage.content,
        user_id: 'admin',
        session_id: activeSessionId,
      }, { headers: getHeaders() });

      if (res.data.session_id && res.data.session_id !== activeSessionId) {
        persistChatSessionId(res.data.session_id);
      }

      // Update trial info from response
      if (res.data.trial_info) {
        setTrialInfo(res.data.trial_info);
        if (res.data.trial_info.trial_expired) {
          void loadData(); // Refresh packs to reflect downgrade
        }
      }

      if (chatSessionIdRef.current !== activeSessionId) return;
      
      const assistantMessage: ChatMessage = {
        id: res.data.message?.id || Date.now().toString(),
        role: 'assistant',
        content: res.data.message?.content || 'No response',
        toolResults: res.data.tool_results,
        iterations: res.data.iterations,
        timestamp: new Date().toISOString(),
      };
      
      setChatMessages(prev => [...prev, assistantMessage]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
      
      // Refresh data in case Devin modified something
      void loadData();
    } catch (err: any) {
      if (chatSessionIdRef.current !== activeSessionId) return;

      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${err.response?.data?.detail || err.message || 'Failed to send message'}`,
        timestamp: new Date().toISOString(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      if (chatSessionIdRef.current === activeSessionId) setChatSending(false);
    }
  };

  const clearChat = () => {
    const confirm = Platform.OS === 'web' ? window.confirm('Clear chat history?') : true;
    if (confirm) {
      setChatSending(false);
      setChatMessages([]);
      const nextChatSessionId = createChatSessionId();
      persistChatSessionId(nextChatSessionId);
      if (Platform.OS === 'web') localStorage.removeItem('devin_chat');
    }
  };

  // TASK FUNCTIONS
  const createTask = async () => {
    if (!title.trim() || !taskText.trim() || saving) return;
    try {
      setSaving(true);
      await axios.post(`${API_URL}/api/devin/tasks`, {
        title: title.trim(),
        task: taskText.trim(),
        priority,
        next_task_id: chainToTask || null,
        chain_on_success_only: true,
      }, { headers: getHeaders() });
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
            Alert.alert('Run Live?', 'This uses credits.', [
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
    const confirm = Platform.OS === 'web' ? window.confirm('Delete?') : true;
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
    } catch (err) {
      Alert.alert('Error', 'Failed to delete');
    }
  };

  const togglePermission = async (permId: string) => {
    const updated = permissions.map(p => p.id === permId ? { ...p, enabled: !p.enabled } : p);
    setPermissions(updated);
    if (Platform.OS === 'web') localStorage.setItem('devin_permissions', JSON.stringify(updated));
    
    // Sync to backend
    try {
      const permMap: Record<string, boolean> = {};
      updated.forEach(p => permMap[p.id] = p.enabled);
      await axios.post(`${API_URL}/api/devin/permissions`, { permissions: permMap }, { headers: getHeaders() });
    } catch (err) {
      console.log('Failed to sync permissions:', err);
    }
  };

  const getRiskColor = (risk: string) => risk === 'high' ? C.danger : risk === 'medium' ? C.warning : C.success;
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return '#22C55E';
      case 'B': return '#84CC16';
      case 'C': return '#F59E0B';
      case 'D': return '#F97316';
      default: return '#EF4444';
    }
  };
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'learning': return C.purple;
      case 'fact': return C.blue;
      case 'preference': return C.warning;
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
            <Text style={styles.authTitle}>PAUL·E</Text>
            <Text style={styles.authSubtitle}>Your intelligent agent platform</Text>

            {/* Beta / no-login entry */}
            <TouchableOpacity
              testID="beta-login-button"
              style={styles.betaButton}
              onPress={handleGuestLogin}
            >
              <Ionicons name="flash-outline" size={18} color={C.accent} />
              <Text style={styles.betaButtonText}>Try Beta — no account needed</Text>
            </TouchableOpacity>

            <View style={styles.authDivider}>
              <View style={styles.authDividerLine} />
              <Text style={styles.authDividerText}>or sign in</Text>
              <View style={styles.authDividerLine} />
            </View>

            <TextInput
              testID="admin-password-input"
              style={styles.authInput}
              placeholder="Admin password"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmitEditing={handleAuth}
            />
            {authError ? <Text testID="auth-error-message" style={styles.authError}>{authError}</Text> : null}
            <TouchableOpacity testID="admin-login-button" style={styles.authButton} onPress={handleAuth}>
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
        <View testID="devin-app-header" style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient colors={[activePack?.color || C.accent, activePack?.color ? `${activePack.color}99` : '#16A34A']} style={styles.headerLogo}>
              <Ionicons name={(activePack?.icon || 'flash') as any} size={20} color="#fff" />
            </LinearGradient>
            <View>
              <Text style={styles.headerTitle}>{activePack?.name || 'PAUL·E'}</Text>
              {activePack && <Text style={styles.headerPackLabel}>Active Pack</Text>}
            </View>
          </View>
          <View style={styles.headerRight}>
            {isGuest && (
              <View testID="beta-badge" style={styles.betaBadge}>
                <Text style={styles.betaBadgeText}>BETA</Text>
              </View>
            )}
            <TouchableOpacity testID="refresh-data-button" onPress={() => void loadData()} style={styles.headerBtn}>
              <Ionicons name="refresh" size={20} color={activePack?.color || C.accent} />
            </TouchableOpacity>
            <TouchableOpacity testID="logout-button" onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color={C.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          <View style={styles.tabBar}>
            {[
              { key: 'chat', icon: 'chatbubbles', label: 'Chat' },
              { key: 'packs', icon: 'apps', label: 'Packs' },
              { key: 'customize', icon: 'color-wand', label: 'Customize' },
              { key: 'create', icon: 'add-circle', label: 'Task' },
              { key: 'queue', icon: 'list', label: `Queue (${tasks.length})` },
              { key: 'history', icon: 'time', label: 'History' },
              { key: 'memory', icon: 'albums', label: `Memory` },
              { key: 'settings', icon: 'settings-sharp', label: 'Settings' },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                testID={`tab-button-${tab.key}`}
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
          {loading && activeTab !== 'chat' ? (
            <View style={styles.centered}><ActivityIndicator size="large" color={C.accent} /></View>
          ) : activeTab === 'chat' ? (
            // ============ CHAT TAB ============
            <View testID="chat-tab-panel" style={styles.chatContainer}>
              {/* Trial Banner */}
              {trialInfo?.is_trial && (
                <View testID="trial-banner" style={styles.trialBanner}>
                  <Ionicons name="flash" size={14} color={C.warning} />
                  <Text style={styles.trialBannerText}>
                    Coder Pro Trial — {trialInfo.actions_remaining}/{trialInfo.max_actions} builds remaining
                  </Text>
                  <TouchableOpacity testID="upgrade-coder-pro-btn" onPress={() => setActiveTab('packs')}>
                    <Text style={styles.trialUpgradeText}>Upgrade</Text>
                  </TouchableOpacity>
                </View>
              )}
              {trialInfo?.trial_expired && !trialInfo.is_trial && (
                <View testID="trial-expired-banner" style={[styles.trialBanner, styles.trialExpiredBanner]}>
                  <Ionicons name="lock-closed" size={14} color={C.danger} />
                  <Text style={[styles.trialBannerText, { color: C.danger }]}>
                    Trial ended. Switched to Coder (read-only).
                  </Text>
                  <TouchableOpacity testID="get-coder-pro-btn" onPress={() => setActiveTab('packs')}>
                    <Text style={[styles.trialUpgradeText, { color: C.accent }]}>Get Coder Pro</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Chat Messages */}
              <ScrollView 
                ref={chatScrollRef}
                testID="chat-messages-scroll"
                style={styles.chatMessages}
                contentContainerStyle={styles.chatMessagesContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {chatMessages.length === 0 ? (
                  <View testID="chat-empty-state" style={styles.chatEmpty}>
                    <LinearGradient colors={[C.accent, '#16A34A']} style={styles.chatEmptyIcon}>
                      <Ionicons name="chatbubbles" size={32} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.chatEmptyTitle}>Chat with PAUL·E</Text>
                    <Text style={styles.chatEmptyText}>
                      Ask anything. PAUL·E can browse the web, run commands, modify files, and remember everything.
                    </Text>
                    <View style={styles.chatSuggestions}>
                      {['What can you do?', 'Check disk space', 'Screenshot google.com'].map((s, i) => (
                        <TouchableOpacity key={i} testID={`chat-suggestion-${i}`} style={styles.chatSuggestion} onPress={() => setChatInput(s)}>
                          <Text style={styles.chatSuggestionText}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  chatMessages.map((msg) => (
                    <View testID={`chat-message-${msg.role}-${msg.id}`} key={msg.id} style={[styles.chatBubble, msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant]}>
                      {msg.role === 'assistant' && (
                        <View style={styles.chatBubbleHeader}>
                          <LinearGradient colors={[C.accent, '#16A34A']} style={styles.chatAvatar}>
                            <Ionicons name="flash" size={12} color="#fff" />
                          </LinearGradient>
                          <Text style={styles.chatBubbleName}>PAUL·E</Text>
                          {msg.toolResults && msg.toolResults.length > 0 && (
                            <TouchableOpacity 
                              testID={`chat-tool-results-button-${msg.id}`}
                              style={styles.toolBadge} 
                              onPress={() => setShowToolResults(msg.toolResults || null)}
                            >
                              <Ionicons name="construct" size={10} color={C.purple} />
                              <Text style={styles.toolBadgeText}>{msg.toolResults.length} tools</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      <Text style={[styles.chatBubbleText, msg.role === 'user' && styles.chatBubbleTextUser]}>
                        {msg.content}
                      </Text>
                      <Text style={styles.chatBubbleTime}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  ))
                )}
                {chatSending && (
                  <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                    <View style={styles.chatBubbleHeader}>
                      <LinearGradient colors={[C.accent, '#16A34A']} style={styles.chatAvatar}>
                        <Ionicons name="flash" size={12} color="#fff" />
                      </LinearGradient>
                      <Text style={styles.chatBubbleName}>PAUL·E</Text>
                    </View>
                    <View style={styles.typingIndicator}>
                      <View style={[styles.typingDot, { animationDelay: '0ms' }]} />
                      <View style={[styles.typingDot, { animationDelay: '150ms' }]} />
                      <View style={[styles.typingDot, { animationDelay: '300ms' }]} />
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Chat Input */}
              <View testID="chat-input-container" style={styles.chatInputContainer}>
                {chatMessages.length > 0 && (
                  <TouchableOpacity testID="clear-chat-button" onPress={clearChat} style={styles.clearChatBtn}>
                    <Ionicons name="trash-outline" size={18} color={C.muted} />
                  </TouchableOpacity>
                )}
                <TextInput
                  testID="chat-message-input"
                  style={styles.chatInput}
                  placeholder="Message PAUL·E..."
                  placeholderTextColor={C.muted}
                  value={chatInput}
                  onChangeText={setChatInput}
                  onSubmitEditing={sendChatMessage}
                  multiline
                  maxLength={2000}
                />
                <TouchableOpacity 
                  testID="chat-send-button"
                  style={[styles.chatSendBtn, (!chatInput.trim() || chatSending) && styles.chatSendBtnDisabled]} 
                  onPress={sendChatMessage}
                  disabled={!chatInput.trim() || chatSending}
                >
                  <Ionicons name="send" size={18} color={chatInput.trim() && !chatSending ? '#fff' : C.muted} />
                </TouchableOpacity>
              </View>
            </View>
          ) : activeTab === 'create' ? (
            // ============ CREATE TAB ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Create a Task</Text>
                <Text style={styles.cardSubtitle}>For when you want discrete, trackable work.</Text>
                <TextInput style={styles.input} placeholder="Task title" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} />
                <TextInput style={[styles.input, styles.textArea]} placeholder="Describe the task..." placeholderTextColor={C.muted} value={taskText} onChangeText={setTaskText} multiline />
                <Text style={styles.labelSmall}>Priority</Text>
                <View style={styles.priorityRow}>
                  {(['low', 'normal', 'high'] as const).map((p) => (
                    <TouchableOpacity key={p} style={[styles.priorityPill, priority === p && styles.priorityPillActive]} onPress={() => setPriority(p)}>
                      <Text style={[styles.priorityText, priority === p && styles.priorityTextActive]}>{p.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.chainSelector} onPress={() => setShowChainModal(true)}>
                  <Ionicons name="git-branch" size={16} color={C.purple} />
                  <Text style={styles.chainText}>{chainToTask ? `Chain to: ${tasks.find(t => t.id === chainToTask)?.title?.slice(0,20) || '...'}` : 'Add to chain (optional)'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.createBtn, (!title.trim() || !taskText.trim() || saving) && styles.btnDisabled]} onPress={createTask} disabled={!title.trim() || !taskText.trim() || saving}>
                  <LinearGradient colors={[C.accent, '#16A34A']} style={styles.createBtnGradient}>
                    <Ionicons name="rocket" size={18} color="#fff" />
                    <Text style={styles.createBtnText}>{saving ? 'Creating...' : 'Queue Task'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : activeTab === 'queue' ? (
            // ============ QUEUE TAB ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {tasks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="cube-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>No tasks</Text>
                </View>
              ) : (
                tasks.map((task) => (
                  <View key={task.id} style={styles.taskCard}>
                    <View style={styles.taskHeader}>
                      <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                      <View style={[styles.riskBadge, { borderColor: getRiskColor(task.risk_level) }]}>
                        <Text style={[styles.riskText, { color: getRiskColor(task.risk_level) }]}>{task.risk_level.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.taskBody} numberOfLines={2}>{task.task}</Text>
                    <Text style={styles.metaText}>{task.status.toUpperCase()} • {task.run_count} runs</Text>
                    {task.last_error && <Text style={styles.errorText}>{task.last_error}</Text>}
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
            // ============ HISTORY TAB ============
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
                    </View>
                    {run.quality_score != null && !run.dry_run && (
                      <View style={styles.qualityBar}>
                        <View style={[styles.qualityFill, { width: `${run.quality_score}%`, backgroundColor: getGradeColor(run.quality_grade || 'C') }]} />
                        <Text style={styles.qualityLabel}>{run.quality_score}%</Text>
                      </View>
                    )}
                    <Text style={styles.runSummary} numberOfLines={3}>{run.response_summary || 'No summary'}</Text>
                    <Text style={styles.runDate}>{new Date(run.created_at).toLocaleString()}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          ) : activeTab === 'memory' ? (
            // ============ MEMORY TAB ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>PAUL·E Memory ({memories.length})</Text>
              {memories.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="albums-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>No memories yet</Text>
                </View>
              ) : (
                memories.map((mem) => (
                  <View key={mem.id} style={styles.memoryCard}>
                    <View style={styles.memoryCardHeader}>
                      <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(mem.category) + '30', borderColor: getCategoryColor(mem.category) }]}>
                        <Text style={[styles.categoryText, { color: getCategoryColor(mem.category) }]}>{mem.category.toUpperCase()}</Text>
                      </View>
                      <TouchableOpacity onPress={() => void deleteMemory(mem.id)} style={styles.memoryDelete}>
                        <Ionicons name="close-circle" size={18} color={C.muted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.memoryContent}>{mem.content}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          ) : activeTab === 'packs' ? (
            // ============ PACKS TAB ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>Agent Packs</Text>
              <Text style={styles.sectionSubtitle}>Switch between specialized agent modes</Text>
              
              {packSwitching && (
                <View style={styles.packSwitchingBanner}>
                  <ActivityIndicator size="small" color={C.accent} />
                  <Text style={styles.packSwitchingText}>Switching pack...</Text>
                </View>
              )}
              
              <View style={styles.packsGrid}>
                {packs
                  .filter(pack => !pack.age_gate || userSettings.age_verified)
                  .map((pack) => (
                  <TouchableOpacity 
                    key={pack.id}
                    testID={`pack-card-${pack.slug}`}
                    style={[
                      styles.packCard, 
                      pack.is_active && styles.packCardActive,
                      pack.coming_soon && styles.packCardComingSoon,
                      { borderColor: pack.is_active ? pack.color : pack.coming_soon ? C.border : C.border }
                    ]}
                    onPress={() => !pack.is_active && !pack.coming_soon && switchPack(pack.id)}
                    disabled={pack.is_active || packSwitching || !!pack.coming_soon}
                  >
                    <View style={[styles.packIconContainer, { backgroundColor: pack.color + (pack.coming_soon ? '10' : '20') }]}>
                      <Ionicons name={pack.icon as any} size={28} color={pack.coming_soon ? pack.color + '60' : pack.color} />
                    </View>
                    <Text style={[styles.packName, pack.coming_soon && styles.packNameMuted]}>{pack.name}</Text>
                    <Text style={styles.packTagline} numberOfLines={1}>{pack.tagline}</Text>
                    
                    {pack.age_gate && !pack.coming_soon && (
                      <View style={styles.ageGateTag}>
                        <Ionicons name="shield-checkmark" size={10} color="transparent" />
                      </View>
                    )}
                    
                    <View style={styles.packFooter}>
                      {pack.coming_soon ? (
                        <View style={[styles.packBadge, styles.comingSoonBadge]}>
                          <Text style={[styles.packBadgeText, { color: pack.color }]}>SOON</Text>
                        </View>
                      ) : pack.is_active ? (
                        <View style={[styles.packBadge, { backgroundColor: pack.color + '30', borderColor: pack.color }]}>
                          <Text style={[styles.packBadgeText, { color: pack.color }]}>ACTIVE</Text>
                        </View>
                      ) : pack.is_unlocked || pack.is_free ? (
                        <View style={[styles.packBadge, { backgroundColor: C.success + '20', borderColor: C.success }]}>
                          <Text style={[styles.packBadgeText, { color: C.success }]}>READY</Text>
                        </View>
                      ) : (
                        <View style={[styles.packBadge, { backgroundColor: C.warning + '20', borderColor: C.warning }]}>
                          <Text style={[styles.packBadgeText, { color: C.warning }]}>${pack.price_usd}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              
              {activePack && (
                <View style={styles.activePackInfo}>
                  <Text style={styles.activePackInfoTitle}>Current Pack: {activePack.name}</Text>
                  <Text style={styles.activePackInfoDesc}>{activePack.description}</Text>
                  <Text style={styles.activePackInfoTools}>
                    Tools: {activePack.allowed_tools?.slice(0, 5).join(', ')}{activePack.allowed_tools?.length > 5 ? '...' : ''}
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : activeTab === 'customize' ? (
            // ============ CUSTOMIZE TAB ============
            (() => {
              const isPaidOrTrial = activePack && (!activePack.is_free || trialInfo?.is_trial);
              return (
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                  <Text style={styles.sectionTitle}>Personalize PAUL·E</Text>
                  {!isPaidOrTrial ? (
                    <View style={styles.customizeLock}>
                      <View style={styles.customizeLockIcon}>
                        <Ionicons name="lock-closed" size={28} color={C.muted} />
                      </View>
                      <Text style={styles.customizeLockTitle}>Personalization is a paid feature</Text>
                      <Text style={styles.customizeLockText}>
                        Upgrade to any paid pack to customize PAUL·E's name, personality, and response style.
                      </Text>
                      <TouchableOpacity testID="customize-view-packs-btn" style={styles.customizeLockBtn} onPress={() => setActiveTab('packs')}>
                        <Text style={styles.customizeLockBtnText}>View Packs</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <View style={styles.settingsCard}>
                        <Text style={styles.customizeLabel}>Agent Name</Text>
                        <TextInput
                          testID="customize-agent-name-input"
                          style={styles.customizeInput}
                          value={userCustomization.agent_name}
                          onChangeText={(v) => setUserCustomization({ ...userCustomization, agent_name: v })}
                          placeholder="PAUL·E"
                          placeholderTextColor={C.muted}
                          maxLength={24}
                        />
                      </View>

                      <Text style={styles.sectionTitle}>Personality</Text>
                      <View style={styles.presetGrid}>
                        {(['balanced', 'professional', 'casual', 'witty'] as const).map(p => (
                          <TouchableOpacity
                            key={p} testID={`personality-${p}`}
                            style={[styles.presetBtn, userCustomization.personality === p && styles.presetBtnActive]}
                            onPress={() => setUserCustomization({ ...userCustomization, personality: p })}
                          >
                            <Text style={[styles.presetBtnText, userCustomization.personality === p && styles.presetBtnTextActive]}>
                              {p.charAt(0).toUpperCase() + p.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.sectionTitle}>Tone</Text>
                      <View style={styles.presetGrid}>
                        {(['warm', 'neutral', 'direct', 'playful'] as const).map(t => (
                          <TouchableOpacity
                            key={t} testID={`tone-${t}`}
                            style={[styles.presetBtn, userCustomization.tone === t && styles.presetBtnActive]}
                            onPress={() => setUserCustomization({ ...userCustomization, tone: t })}
                          >
                            <Text style={[styles.presetBtnText, userCustomization.tone === t && styles.presetBtnTextActive]}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.sectionTitle}>Response Length</Text>
                      <View style={styles.presetGrid}>
                        {(['concise', 'normal', 'detailed'] as const).map(l => (
                          <TouchableOpacity
                            key={l} testID={`length-${l}`}
                            style={[styles.presetBtn, userCustomization.response_length === l && styles.presetBtnActive]}
                            onPress={() => setUserCustomization({ ...userCustomization, response_length: l })}
                          >
                            <Text style={[styles.presetBtnText, userCustomization.response_length === l && styles.presetBtnTextActive]}>
                              {l.charAt(0).toUpperCase() + l.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <TouchableOpacity
                        testID="save-customization-btn"
                        style={[styles.saveCustomizationBtn, customizationSaving && { opacity: 0.7 }]}
                        onPress={saveCustomization}
                        disabled={customizationSaving}
                      >
                        <Text style={styles.saveCustomizationBtnText}>
                          {customizationSaving ? 'Saving...' : 'Save Changes'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              );
            })()
          ) : activeTab === 'settings' ? (
            // ============ SETTINGS TAB ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>Settings</Text>

              {/* Profile */}
              <View style={styles.settingsCard}>
                <View style={styles.settingsRow}>
                  <Ionicons name="person-circle" size={20} color={C.accent} />
                  <View style={styles.settingsRowInfo}>
                    <Text style={styles.settingsRowLabel}>Instance</Text>
                    <Text style={styles.settingsRowValue}>Admin</Text>
                  </View>
                </View>
                <View style={styles.settingsDivider} />
                <View style={styles.settingsRow}>
                  <Ionicons name="flash" size={20} color={activePack?.color || C.accent} />
                  <View style={styles.settingsRowInfo}>
                    <Text style={styles.settingsRowLabel}>Active Pack</Text>
                    <Text style={styles.settingsRowValue}>{activePack?.name || 'None'}</Text>
                  </View>
                </View>
              </View>

              {/* Advanced Settings */}
              <TouchableOpacity
                testID="advanced-settings-toggle"
                style={styles.advancedToggle}
                onPress={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <Text style={styles.advancedToggleText}>Advanced Settings</Text>
                <Ionicons name={showAdvancedSettings ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
              </TouchableOpacity>

              {showAdvancedSettings && (
                <View style={styles.settingsCard}>
                  {isGuest ? null : userSettings.age_verified ? (
                    <View style={styles.settingsRow}>
                      <Ionicons name="checkmark-circle" size={20} color={C.success} />
                      <View style={styles.settingsRowInfo}>
                        <Text style={styles.settingsRowLabel}>Mature content</Text>
                        <Text style={[styles.settingsRowValue, { color: C.success }]}>Enabled</Text>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      testID="age-verify-settings-btn"
                      style={styles.settingsRow}
                      onPress={() => setShowSettingsAgeModal(true)}
                    >
                      <Ionicons name="lock-closed" size={20} color={C.muted} />
                      <View style={styles.settingsRowInfo}>
                        <Text style={styles.settingsRowLabel}>Enable mature content</Text>
                        <Text style={styles.settingsRowSubtext}>(unlocks a new pack)</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          ) : (
            // ============ PERMISSIONS TAB (fallback) ============
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionTitle}>Permissions</Text>
              <Text style={styles.sectionSubtitle}>Control what PAUL·E can do</Text>
              {permissions.map((perm) => (
                <View key={perm.id} style={styles.permCard}>
                  <View style={styles.permInfo}>
                    <View style={styles.permNameRow}>
                      <Ionicons name={perm.enabled ? 'checkmark-circle' : 'close-circle'} size={18} color={perm.enabled ? C.accent : C.muted} />
                      <Text style={styles.permName}>{perm.name}</Text>
                      {perm.requires_approval && <View style={styles.approvalTag}><Text style={styles.approvalTagText}>Approval</Text></View>}
                    </View>
                    <Text style={styles.permDesc}>{perm.description}</Text>
                  </View>
                  <Switch value={perm.enabled} onValueChange={() => togglePermission(perm.id)} trackColor={{ false: C.border, true: C.accent + '50' }} thumbColor={perm.enabled ? C.accent : C.muted} />
                </View>
              ))}
            </ScrollView>
          )}
        </KeyboardAvoidingView>

        {/* Chain Modal */}
        <Modal visible={showChainModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Chain to Task</Text>
              <ScrollView style={styles.modalScroll}>
                <TouchableOpacity style={[styles.chainOption, !chainToTask && styles.chainOptionActive]} onPress={() => { setChainToTask(''); setShowChainModal(false); }}>
                  <Text style={styles.chainOptionText}>No chain</Text>
                </TouchableOpacity>
                {tasks.filter(t => t.status === 'queued').map((t) => (
                  <TouchableOpacity key={t.id} style={[styles.chainOption, chainToTask === t.id && styles.chainOptionActive]} onPress={() => { setChainToTask(t.id); setShowChainModal(false); }}>
                    <Text style={styles.chainOptionText} numberOfLines={1}>{t.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowChainModal(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Tool Results Modal */}
        <Modal visible={showToolResults !== null} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Tool Executions</Text>
              <ScrollView style={styles.modalScroll}>
                {showToolResults?.map((t, i) => (
                  <View key={i} style={styles.toolResultItem}>
                    <View style={styles.toolResultHeader}>
                      <Ionicons name="construct" size={14} color={C.purple} />
                      <Text style={styles.toolResultName}>{t.tool}</Text>
                    </View>
                    <Text style={styles.toolResultText} numberOfLines={8}>{t.result}</Text>
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowToolResults(null)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Settings Age Verification Modal */}
        <Modal visible={showSettingsAgeModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.ageGateModal}>
              <View style={styles.ageGateModalIcon}>
                <Ionicons name="shield-checkmark" size={32} color={C.muted} />
              </View>
              <Text style={styles.ageGateTitle}>Age Verification</Text>
              <Text style={styles.ageGateBody}>
                Some features are restricted to users 18 and older.{'\n\n'}
                By continuing, you confirm you are at least 18 years of age.
              </Text>
              <TouchableOpacity
                testID="settings-age-verify-confirm-btn"
                style={styles.ageGateConfirmBtn}
                onPress={handleSettingsAgeVerify}
              >
                <Text style={styles.ageGateConfirmText}>I confirm I am 18+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="settings-age-verify-cancel-btn"
                style={styles.ageGateCancelBtn}
                onPress={() => setShowSettingsAgeModal(false)}
              >
                <Text style={styles.ageGateCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Age Gate Modal (from Packs tab) */}
        <Modal visible={showAgeGateModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.ageGateModal}>
              <View style={styles.ageGateModalIcon}>
                <Ionicons name="shield-checkmark" size={32} color={C.warning} />
              </View>
              <Text style={styles.ageGateTitle}>Age Verification</Text>
              <Text style={styles.ageGateBody}>
                The Companion pack contains mature content intended for adults.{'\n\n'}
                By continuing, you confirm that you are 18 years of age or older.
              </Text>
              <TouchableOpacity
                testID="age-gate-confirm-btn"
                style={styles.ageGateConfirmBtn}
                onPress={confirmAgeGate}
              >
                <Text style={styles.ageGateConfirmText}>I am 18+ — Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="age-gate-cancel-btn"
                style={styles.ageGateCancelBtn}
                onPress={() => { setShowAgeGateModal(false); setPendingPackId(null); }}
              >
                <Text style={styles.ageGateCancelText}>Cancel</Text>
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
  betaButton: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: `${C.accent}15`, borderWidth: 1, borderColor: `${C.accent}50`, borderRadius: 12, padding: 16, marginBottom: 20 },
  betaButtonText: { color: C.accent, fontSize: 16, fontWeight: '600' },
  authDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, width: '100%' },
  authDividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  authDividerText: { fontSize: 12, color: C.muted },
  betaBadge: { backgroundColor: `${C.accent}15`, borderWidth: 1, borderColor: `${C.accent}40`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  betaBadgeText: { fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 1 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  headerPackLabel: { fontSize: 10, color: C.muted, marginTop: -2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { padding: 8 },
  logoutBtn: { padding: 8 },

  // Tabs
  tabScroll: { maxHeight: 50, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  tabActive: { backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  tabText: { fontSize: 12, fontWeight: '600', color: C.muted },
  tabTextActive: { color: C.accent },

  content: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Chat
  chatContainer: { flex: 1 },
  chatMessages: { flex: 1 },
  chatMessagesContent: { padding: 16, paddingBottom: 20 },
  chatEmpty: { alignItems: 'center', paddingTop: 60 },
  chatEmptyIcon: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  chatEmptyTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 8 },
  chatEmptyText: { fontSize: 14, color: C.muted, textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  chatSuggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 24 },
  chatSuggestion: { backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  chatSuggestionText: { fontSize: 13, color: C.text },
  chatBubble: { maxWidth: '85%', marginBottom: 12, padding: 12, borderRadius: 16 },
  chatBubbleUser: { alignSelf: 'flex-end', backgroundColor: C.accent, borderBottomRightRadius: 4 },
  chatBubbleAssistant: { alignSelf: 'flex-start', backgroundColor: C.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border },
  chatBubbleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chatAvatar: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  chatBubbleName: { fontSize: 12, fontWeight: '700', color: C.accent },
  toolBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(139,92,246,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  toolBadgeText: { fontSize: 10, color: C.purple, fontWeight: '600' },
  chatBubbleText: { fontSize: 14, color: C.text, lineHeight: 20 },
  chatBubbleTextUser: { color: '#fff' },
  chatBubbleTime: { fontSize: 10, color: C.muted, marginTop: 6, alignSelf: 'flex-end' },
  typingIndicator: { flexDirection: 'row', gap: 4, paddingVertical: 8 },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.muted },
  chatInputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  clearChatBtn: { padding: 10 },
  chatInput: { flex: 1, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: C.text, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: C.border },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  chatSendBtnDisabled: { backgroundColor: C.card },

  // Cards
  card: { backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: C.muted, marginBottom: 16 },
  input: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  labelSmall: { fontSize: 11, fontWeight: '600', color: C.muted, marginBottom: 6, textTransform: 'uppercase' },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  priorityPill: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  priorityPillActive: { borderColor: C.accent, backgroundColor: 'rgba(34,197,94,0.1)' },
  priorityText: { fontSize: 11, fontWeight: '700', color: C.muted },
  priorityTextActive: { color: C.accent },
  chainSelector: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  chainText: { flex: 1, fontSize: 13, color: C.text },
  createBtn: { borderRadius: 12, overflow: 'hidden' },
  createBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  // Empty & Section
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: C.muted, marginTop: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: C.muted, marginBottom: 16 },

  // Task cards
  taskCard: { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  taskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  taskTitle: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1, marginRight: 8 },
  riskBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  riskText: { fontSize: 9, fontWeight: '700' },
  taskBody: { fontSize: 12, color: C.muted, marginBottom: 6, lineHeight: 17 },
  metaText: { fontSize: 10, color: C.muted, marginBottom: 4 },
  errorText: { fontSize: 11, color: C.danger, marginBottom: 4 },
  taskActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  approveBtn: { backgroundColor: C.warning },
  dryBtn: { backgroundColor: C.success },
  liveBtn: { backgroundColor: C.purple },
  deleteBtn: { backgroundColor: 'rgba(239,68,68,0.15)', marginLeft: 'auto' },

  // Run cards
  runCard: { backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  runHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  runStatus: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  statusSuccess: { backgroundColor: 'rgba(16,185,129,0.2)' },
  statusFailed: { backgroundColor: 'rgba(239,68,68,0.2)' },
  runStatusText: { fontSize: 9, fontWeight: '700', color: C.text },
  dryBadge: { backgroundColor: 'rgba(34,197,94,0.2)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  liveBadge: { backgroundColor: 'rgba(139,92,246,0.2)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 8, fontWeight: '700', color: C.text },
  gradeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  gradeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  qualityBar: { height: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, marginBottom: 8, overflow: 'hidden', position: 'relative' },
  qualityFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8 },
  qualityLabel: { position: 'absolute', right: 6, top: 2, fontSize: 9, fontWeight: '700', color: C.text },
  runSummary: { fontSize: 12, color: C.text, lineHeight: 17, marginBottom: 4 },
  runDate: { fontSize: 10, color: C.muted },

  // Memory
  memoryCard: { backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  memoryCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  categoryBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  categoryText: { fontSize: 9, fontWeight: '700' },
  memoryDelete: { padding: 2 },
  memoryContent: { fontSize: 13, color: C.text, lineHeight: 18 },

  // Permissions
  permCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  permInfo: { flex: 1, marginRight: 12 },
  permNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  permName: { fontSize: 13, fontWeight: '600', color: C.text },
  approvalTag: { backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  approvalTagText: { fontSize: 8, fontWeight: '600', color: C.warning },
  permDesc: { fontSize: 11, color: C.muted },

  // Packs
  packSwitchingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.card, padding: 12, borderRadius: 10, marginBottom: 16 },
  packSwitchingText: { color: C.text, fontSize: 14 },
  packsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  packCard: { width: '47%', backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: C.border },
  packCardActive: { backgroundColor: 'rgba(255,255,255,0.02)' },
  packCardComingSoon: { opacity: 0.6 },
  packIconContainer: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  packName: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  packNameMuted: { color: C.muted },
  packTagline: { fontSize: 12, color: C.muted, marginBottom: 12 },
  packFooter: { flexDirection: 'row', alignItems: 'center' },
  packBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  packBadgeText: { fontSize: 10, fontWeight: '700' },
  comingSoonBadge: { backgroundColor: 'rgba(249,115,22,0.15)', borderColor: 'rgba(249,115,22,0.4)' },
  ageGateTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 8 },
  ageGateTagText: { fontSize: 10, color: C.warning, fontWeight: '600' },
  activePackInfo: { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  activePackInfoTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  activePackInfoDesc: { fontSize: 13, color: C.muted, lineHeight: 18, marginBottom: 8 },
  activePackInfoTools: { fontSize: 11, color: C.muted, fontStyle: 'italic' },

  // Settings & Advanced
  settingsCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  settingsRowInfo: { flex: 1 },
  settingsRowLabel: { fontSize: 15, color: C.text, fontWeight: '500' },
  settingsRowValue: { fontSize: 13, color: C.muted, marginTop: 2 },
  settingsRowSubtext: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 1 },
  settingsDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },
  advancedToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginBottom: 8 },
  advancedToggleText: { fontSize: 14, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 1 },

  // Customize
  customizeLock: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 12 },
  customizeLockIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  customizeLockTitle: { fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center' },
  customizeLockText: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  customizeLockBtn: { marginTop: 8, backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  customizeLockBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  customizeLabel: { fontSize: 13, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  customizeInput: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.text },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  presetBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  presetBtnActive: { borderColor: C.accent, backgroundColor: C.accent + '20' },
  presetBtnText: { fontSize: 14, color: C.muted },
  presetBtnTextActive: { color: C.accent, fontWeight: '600' },
  saveCustomizationBtn: { backgroundColor: C.accent, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  saveCustomizationBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  trialBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.25)', paddingHorizontal: 16, paddingVertical: 10 },
  trialExpiredBanner: { backgroundColor: 'rgba(239,68,68,0.08)', borderBottomColor: 'rgba(239,68,68,0.2)' },
  trialBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: C.warning },
  trialUpgradeText: { fontSize: 12, fontWeight: '700', color: C.warning },

  // Age Gate Modal
  ageGateModal: { width: '100%', maxWidth: 380, backgroundColor: C.card, borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  ageGateModalIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(245,158,11,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  ageGateTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 12 },
  ageGateBody: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  ageGateConfirmBtn: { width: '100%', backgroundColor: C.warning, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  ageGateConfirmText: { color: '#000', fontSize: 14, fontWeight: '700' },
  ageGateCancelBtn: { padding: 10 },
  ageGateCancelText: { fontSize: 14, color: C.muted },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 400, backgroundColor: C.card, borderRadius: 16, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 12 },
  modalScroll: { maxHeight: 300 },
  chainOption: { padding: 12, borderRadius: 10, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.03)' },
  chainOptionActive: { backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  chainOptionText: { fontSize: 14, color: C.text },
  modalClose: { marginTop: 12, padding: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 14, color: C.muted },
  toolResultItem: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginBottom: 8 },
  toolResultHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  toolResultName: { fontSize: 12, fontWeight: '700', color: C.purple },
  toolResultText: { fontSize: 11, color: C.muted, lineHeight: 16 },
});
