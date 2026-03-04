import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput, Modal, FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ADMIN_KEY = process.env.EXPO_PUBLIC_ADMIN_SECRET;
const ADMIN_HEADERS = ADMIN_KEY ? { 'X-Admin-Key': ADMIN_KEY } : {};

const C = {
  bg: '#0A0A0F',
  card: '#14141C',
  border: '#1E1E2A',
  accent: '#6366F1',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  text: '#E5E5EA',
  muted: '#6B7280',
  silver: '#A8A8B0',
};

interface UserRecord {
  user_id: string;
  email: string;
  name: string;
  auth_provider: string;
  created_at: string;
  conversation_count: number;
  image_count: number;
  download_count: number;
}

interface ConversationRecord {
  id: string;
  title: string;
  messages: { role: string; content: string }[];
  created_at: string;
  updated_at: string;
}

interface DownloadLog {
  id: string;
  image_id: string;
  image_prompt: string;
  user_id: string;
  user_email: string;
  downloaded_at: string;
  ip: string;
}

interface Stats {
  total_users: number;
  total_conversations: number;
  total_images: number;
  total_downloads: number;
}

type Tab = 'users' | 'downloads' | 'stats';

export default function AdminScreen() {
  const router = useRouter();
  const { isAdmin, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [downloadLogs, setDownloadLogs] = useState<DownloadLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [userConvos, setUserConvos] = useState<ConversationRecord[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<ConversationRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userDetailModal, setUserDetailModal] = useState(false);
  const [convoModal, setConvoModal] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Delay navigation check until after Root Layout is mounted
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (!isAdmin) {
      router.replace('/');
      return;
    }
    if (!ADMIN_KEY) {
      Alert.alert('Configuration Error', 'Admin secret is missing in app environment.');
      setLoading(false);
      return;
    }
    loadData();
  }, [isAdmin, isReady]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/users`, { headers: ADMIN_HEADERS }),
        axios.get(`${API_URL}/api/admin/stats`, { headers: ADMIN_HEADERS }),
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
    } catch (e) {
      Alert.alert('Error', 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const loadDownloadLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/download-logs`, { headers: ADMIN_HEADERS });
      setDownloadLogs(res.data);
    } catch (e) {
      Alert.alert('Error', 'Failed to load download logs');
    }
  };

  const openUserDetail = async (user: UserRecord) => {
    setSelectedUser(user);
    setUserDetailModal(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/users/${user.user_id}/conversations`, { headers: ADMIN_HEADERS });
      setUserConvos(res.data);
    } catch (e) {
      setUserConvos([]);
    }
  };

  const filteredUsers = users.filter(u =>
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLogs = downloadLogs.filter(l =>
    l.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.image_prompt?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (d: string) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString(); } catch { return d; }
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#10101A']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} data-testid="admin-back-btn">
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Admin Console</Text>
            <Text style={styles.headerSub}>Restricted Access</Text>
          </View>
          <TouchableOpacity onPress={() => { logout(); router.replace('/login'); }} style={styles.logoutBtn} data-testid="admin-logout-btn">
            <Ionicons name="log-out-outline" size={20} color={C.danger} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(['users', 'downloads', 'stats'] as Tab[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => {
                setTab(t);
                setSearchQuery('');
                if (t === 'downloads' && downloadLogs.length === 0) loadDownloadLogs();
              }}
              data-testid={`admin-tab-${t}`}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {/* Search bar */}
            {tab !== 'stats' && (
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={C.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={tab === 'users' ? 'Search users...' : 'Search logs...'}
                  placeholderTextColor={C.muted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  data-testid="admin-search-input"
                />
              </View>
            )}

            {/* USERS TAB */}
            {tab === 'users' && (
              <FlatList
                data={filteredUsers}
                keyExtractor={u => u.user_id}
                contentContainerStyle={styles.list}
                ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
                renderItem={({ item: u }) => (
                  <TouchableOpacity style={styles.card} onPress={() => openUserDetail(u)} data-testid={`user-card-${u.user_id}`}>
                    <View style={styles.cardRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(u.name || u.email || '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardName}>{u.name || 'Unnamed'}</Text>
                        <Text style={styles.cardEmail}>{u.email}</Text>
                        <Text style={styles.cardMeta}>Joined {formatDate(u.created_at)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.muted} />
                    </View>
                    <View style={styles.statsRow}>
                      <View style={styles.statBadge}>
                        <Ionicons name="chatbubbles-outline" size={12} color={C.accent} />
                        <Text style={styles.statBadgeText}>{u.conversation_count} chats</Text>
                      </View>
                      <View style={styles.statBadge}>
                        <Ionicons name="image-outline" size={12} color={C.warning} />
                        <Text style={styles.statBadgeText}>{u.image_count} images</Text>
                      </View>
                      <View style={styles.statBadge}>
                        <Ionicons name="download-outline" size={12} color={C.success} />
                        <Text style={styles.statBadgeText}>{u.download_count} downloads</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}

            {/* DOWNLOADS TAB */}
            {tab === 'downloads' && (
              <FlatList
                data={filteredLogs}
                keyExtractor={l => l.id}
                contentContainerStyle={styles.list}
                ListEmptyComponent={<Text style={styles.emptyText}>No downloads recorded</Text>}
                renderItem={({ item: l }) => (
                  <View style={styles.card} data-testid={`download-log-${l.id}`}>
                    <View style={styles.cardRow}>
                      <Ionicons name="download" size={20} color={C.success} />
                      <View style={[styles.cardInfo, { marginLeft: 12 }]}>
                        <Text style={styles.cardEmail}>{l.user_email}</Text>
                        <Text style={styles.cardMeta} numberOfLines={2}>"{l.image_prompt || 'No prompt'}"</Text>
                        <Text style={styles.cardMeta}>{formatDate(l.downloaded_at)} · IP: {l.ip}</Text>
                      </View>
                    </View>
                  </View>
                )}
              />
            )}

            {/* STATS TAB */}
            {tab === 'stats' && stats && (
              <ScrollView contentContainerStyle={styles.list}>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Total Users', value: stats.total_users, icon: 'people', color: C.accent },
                    { label: 'Conversations', value: stats.total_conversations, icon: 'chatbubbles', color: C.warning },
                    { label: 'Images Generated', value: stats.total_images, icon: 'image', color: C.success },
                    { label: 'Downloads', value: stats.total_downloads, icon: 'download', color: '#EC4899' },
                  ].map(s => (
                    <View key={s.label} style={[styles.statCard, { borderColor: s.color + '40' }]}>
                      <Ionicons name={s.icon as any} size={28} color={s.color} />
                      <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.refreshBtn} onPress={loadData} data-testid="admin-refresh-btn">
                  <Ionicons name="refresh" size={16} color={C.text} />
                  <Text style={styles.refreshText}>Refresh Stats</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </>
        )}

        {/* USER DETAIL MODAL */}
        <Modal visible={userDetailModal} animationType="slide" presentationStyle="pageSheet">
          <LinearGradient colors={['#0A0A0F', '#10101A']} style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => { setUserDetailModal(false); setUserConvos([]); }} data-testid="user-detail-close">
                  <Ionicons name="close" size={24} color={C.text} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{selectedUser?.name || selectedUser?.email}</Text>
                <View style={{ width: 24 }} />
              </View>
              <ScrollView contentContainerStyle={styles.list}>
                <Text style={styles.sectionTitle}>Account</Text>
                <View style={styles.infoCard}>
                  {[
                    ['Email', selectedUser?.email],
                    ['User ID', selectedUser?.user_id],
                    ['Provider', selectedUser?.auth_provider],
                    ['Joined', formatDate(selectedUser?.created_at || '')],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.infoRow}>
                      <Text style={styles.infoKey}>{k}</Text>
                      <Text style={styles.infoVal}>{v}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Conversations ({userConvos.length})</Text>
                {userConvos.length === 0 ? (
                  <Text style={styles.emptyText}>No conversations</Text>
                ) : userConvos.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.convoCard}
                    onPress={() => { setSelectedConvo(c); setConvoModal(true); }}
                    data-testid={`convo-card-${c.id}`}
                  >
                    <Text style={styles.convoTitle} numberOfLines={1}>{c.title || 'Untitled'}</Text>
                    <Text style={styles.convoMeta}>{c.messages?.length || 0} messages · {formatDate(c.updated_at)}</Text>
                    <Ionicons name="chevron-forward" size={14} color={C.muted} style={{ position: 'absolute', right: 12, top: 14 }} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </SafeAreaView>
          </LinearGradient>
        </Modal>

        {/* CONVERSATION VIEWER MODAL */}
        <Modal visible={convoModal} animationType="slide" presentationStyle="pageSheet">
          <LinearGradient colors={['#0A0A0F', '#10101A']} style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setConvoModal(false)} data-testid="convo-close">
                  <Ionicons name="close" size={24} color={C.text} />
                </TouchableOpacity>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedConvo?.title || 'Conversation'}</Text>
                <View style={{ width: 24 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {(selectedConvo?.messages || []).map((m, i) => (
                  <View key={i} style={[styles.msgBubble, m.role === 'user' ? styles.msgUser : styles.msgAssistant]}>
                    <Text style={styles.msgRole}>{m.role === 'user' ? 'User' : 'Aurora'}</Text>
                    <Text style={styles.msgContent}>{m.content}</Text>
                  </View>
                ))}
              </ScrollView>
            </SafeAreaView>
          </LinearGradient>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: C.muted, marginTop: 12, fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  headerSub: { color: C.danger, fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  logoutBtn: { marginLeft: 'auto', padding: 8 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: C.accent },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, margin: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border, gap: 8 },
  searchInput: { flex: 1, color: C.text, fontSize: 14 },
  list: { paddingHorizontal: 12, paddingBottom: 40 },
  emptyText: { color: C.muted, textAlign: 'center', marginTop: 40, fontSize: 14 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent + '30', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: C.accent, fontSize: 16, fontWeight: '700' },
  cardInfo: { flex: 1 },
  cardName: { color: C.text, fontSize: 15, fontWeight: '600' },
  cardEmail: { color: C.silver, fontSize: 13 },
  cardMeta: { color: C.muted, fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  statBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statBadgeText: { color: C.silver, fontSize: 11 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  statCard: { width: '46%', backgroundColor: C.card, borderRadius: 14, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1 },
  statValue: { fontSize: 32, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 12, textAlign: 'center' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.card, borderRadius: 10, padding: 14, marginTop: 20, borderWidth: 1, borderColor: C.border },
  refreshText: { color: C.text, fontSize: 14, fontWeight: '600' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { color: C.text, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  sectionTitle: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 20, marginBottom: 8 },
  infoCard: { backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoKey: { color: C.muted, fontSize: 13 },
  infoVal: { color: C.text, fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right' },
  convoCard: { backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border, paddingRight: 36 },
  convoTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  convoMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  msgBubble: { borderRadius: 12, padding: 12, marginBottom: 10, maxWidth: '85%' },
  msgUser: { backgroundColor: C.accent + '30', alignSelf: 'flex-end' },
  msgAssistant: { backgroundColor: C.card, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border },
  msgRole: { color: C.muted, fontSize: 10, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 },
  msgContent: { color: C.text, fontSize: 14, lineHeight: 20 },
});
