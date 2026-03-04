import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const C = {
  bg: '#0A0A0F',
  card: '#14141C',
  border: '#1E1E2A',
  accent: '#8B5CF6',
  text: '#E5E5EA',
  muted: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

interface PendingChange {
  id: string;
  proposer_id: string;
  target_agent_id: string | null;
  target_agent_name: string;
  change_type: string;
  old_value: string;
  new_value: string;
  status: string;
  created_at: string;
}

interface AuditLog {
  id: string;
  action: string;
  change_id?: string;
  agent_id?: string;
  timestamp: string;
}

export default function ApprovalsScreen() {
  const router = useRouter();
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [changesRes, logsRes] = await Promise.all([
        axios.get(`${API_URL}/api/pending-changes`),
        axios.get(`${API_URL}/api/agent-audit-log`),
      ]);
      setPendingChanges(changesRes.data || []);
      setAuditLogs(logsRes.data || []);
    } catch (err) {
      console.log('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (changeId: string) => {
    setProcessing(changeId);
    try {
      await axios.post(`${API_URL}/api/pending-changes/${changeId}/approve`);
      await loadData();
      Alert.alert('Approved', 'Change has been applied successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to approve change');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (changeId: string) => {
    setProcessing(changeId);
    try {
      await axios.post(`${API_URL}/api/pending-changes/${changeId}/reject`);
      await loadData();
      Alert.alert('Rejected', 'Change has been rejected.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to reject change');
    } finally {
      setProcessing(null);
    }
  };

  const formatTime = (ts: string) => {
    try {
      const date = new Date(ts);
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return ts;
    }
  };

  const getChangeTypeIcon = (type: string) => {
    switch (type) {
      case 'create_agent': return 'person-add';
      case 'self_improvement': return 'sparkles';
      case 'prompt': return 'create';
      default: return 'code-working';
    }
  };

  const getChangeTypeColor = (type: string) => {
    switch (type) {
      case 'create_agent': return C.success;
      case 'self_improvement': return C.warning;
      case 'prompt': return C.accent;
      default: return C.muted;
    }
  };

  const parseNewValue = (change: PendingChange) => {
    if (change.change_type === 'create_agent') {
      try {
        return JSON.parse(change.new_value);
      } catch {
        return { name: change.target_agent_name, system_prompt: change.new_value };
      }
    }
    return { system_prompt: change.new_value };
  };

  if (loading) {
    return (
      <LinearGradient colors={[C.bg, '#12121A', C.bg]} style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>Loading...</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[C.bg, '#12121A', C.bg]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Agent Approvals</Text>
          <TouchableOpacity onPress={loadData} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={22} color={C.accent} />
          </TouchableOpacity>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
            onPress={() => setActiveTab('pending')}
          >
            <Ionicons name="time" size={16} color={activeTab === 'pending' ? '#fff' : C.muted} />
            <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
              Pending ({pendingChanges.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'history' && styles.tabActive]}
            onPress={() => setActiveTab('history')}
          >
            <Ionicons name="list" size={16} color={activeTab === 'history' ? '#fff' : C.muted} />
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
              Audit Log
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {activeTab === 'pending' ? (
            pendingChanges.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle" size={48} color={C.success} />
                <Text style={styles.emptyText}>No pending approvals</Text>
                <Text style={styles.emptySubtext}>All caught up!</Text>
              </View>
            ) : (
              pendingChanges.map(change => {
                const parsed = parseNewValue(change);
                const isExpanded = expandedId === change.id;
                
                return (
                  <View key={change.id} style={styles.changeCard}>
                    <TouchableOpacity 
                      style={styles.changeHeader}
                      onPress={() => setExpandedId(isExpanded ? null : change.id)}
                    >
                      <View style={[styles.changeIcon, { backgroundColor: getChangeTypeColor(change.change_type) + '20' }]}>
                        <Ionicons 
                          name={getChangeTypeIcon(change.change_type)} 
                          size={20} 
                          color={getChangeTypeColor(change.change_type)} 
                        />
                      </View>
                      <View style={styles.changeInfo}>
                        <Text style={styles.changeType}>
                          {change.change_type === 'create_agent' ? 'Create Agent' : 
                           change.change_type === 'self_improvement' ? 'Self Improvement' : 
                           'Edit Prompt'}
                        </Text>
                        <Text style={styles.changeTarget}>{change.target_agent_name}</Text>
                        <Text style={styles.changeTime}>{formatTime(change.created_at)}</Text>
                      </View>
                      <Ionicons 
                        name={isExpanded ? "chevron-up" : "chevron-down"} 
                        size={20} 
                        color={C.muted} 
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.changeDetails}>
                        <Text style={styles.detailLabel}>Proposed Changes:</Text>
                        <View style={styles.promptPreview}>
                          <Text style={styles.promptText} numberOfLines={10}>
                            {parsed.system_prompt || change.new_value}
                          </Text>
                        </View>
                        
                        {parsed.has_tools !== undefined && (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Has Tools:</Text>
                            <Text style={[styles.metaValue, { color: parsed.has_tools ? C.success : C.muted }]}>
                              {parsed.has_tools ? 'Yes' : 'No'}
                            </Text>
                          </View>
                        )}

                        <View style={styles.actionRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.rejectBtn]}
                            onPress={() => handleReject(change.id)}
                            disabled={processing === change.id}
                          >
                            {processing === change.id ? (
                              <ActivityIndicator size="small" color={C.danger} />
                            ) : (
                              <>
                                <Ionicons name="close" size={18} color={C.danger} />
                                <Text style={[styles.actionBtnText, { color: C.danger }]}>Reject</Text>
                              </>
                            )}
                          </TouchableOpacity>
                          
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.approveBtn]}
                            onPress={() => handleApprove(change.id)}
                            disabled={processing === change.id}
                          >
                            {processing === change.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="checkmark" size={18} color="#fff" />
                                <Text style={[styles.actionBtnText, { color: '#fff' }]}>Approve</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )
          ) : (
            auditLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={C.muted} />
                <Text style={styles.emptyText}>No audit logs yet</Text>
              </View>
            ) : (
              auditLogs.map(log => (
                <View key={log.id} style={styles.logRow}>
                  <View style={[styles.logDot, { 
                    backgroundColor: log.action === 'approve_change' ? C.success : 
                                    log.action === 'reject_change' ? C.danger : C.accent 
                  }]} />
                  <View style={styles.logInfo}>
                    <Text style={styles.logAction}>
                      {log.action === 'approve_change' ? 'Approved' :
                       log.action === 'reject_change' ? 'Rejected' :
                       log.action === 'propose_edit' ? 'Proposed Edit' : log.action}
                    </Text>
                    <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
                  </View>
                </View>
              ))
            )
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.muted, marginTop: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: { padding: 4 },
  refreshBtn: { padding: 4 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  content: { flex: 1 },
  contentInner: { padding: 16 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: C.text, marginTop: 12, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: C.muted, marginTop: 4, fontSize: 13 },
  changeCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  changeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeInfo: { flex: 1, marginLeft: 12 },
  changeType: { color: C.text, fontSize: 14, fontWeight: '600' },
  changeTarget: { color: C.accent, fontSize: 13, marginTop: 2 },
  changeTime: { color: C.muted, fontSize: 11, marginTop: 2 },
  changeDetails: {
    padding: 14,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  detailLabel: { color: C.muted, fontSize: 11, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  promptPreview: {
    backgroundColor: C.bg,
    borderRadius: 8,
    padding: 12,
    maxHeight: 200,
  },
  promptText: { color: C.text, fontSize: 12, lineHeight: 18 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  metaLabel: { color: C.muted, fontSize: 12 },
  metaValue: { color: C.text, fontSize: 12, fontWeight: '600', marginLeft: 8 },
  actionRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  rejectBtn: {
    backgroundColor: C.danger + '15',
    borderWidth: 1,
    borderColor: C.danger + '30',
  },
  approveBtn: {
    backgroundColor: C.success,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logInfo: { marginLeft: 12 },
  logAction: { color: C.text, fontSize: 13, fontWeight: '500' },
  logTime: { color: C.muted, fontSize: 11, marginTop: 2 },
});
