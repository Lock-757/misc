import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
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
};

interface Agent {
  id: string;
  name: string;
  avatar: string;
  avatar_color: string;
  personality: string;
  currency_balance: number;
  tools: any[];
  tool_prices: Record<string, number>;
}

interface Trade {
  id: string;
  seller_agent_id: string;
  buyer_agent_id: string;
  tool_name: string;
  price: number;
  timestamp: string;
}

interface Message {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  message_type: string;
  content: string;
  timestamp: string;
}

interface Reputation {
  reputation_score: number;
  tools_created: number;
  successful_trades: number;
  collaborations: number;
  helpful_responses: number;
  tools_shared: number;
}

interface Specialization {
  domain: string;
  expertise_level: number;
  interactions_count: number;
}

interface JournalEntry {
  id: string;
  entry_type: string;
  content: string;
  timestamp: string;
  metadata?: any;
}

interface Goal {
  id: string;
  goal: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  status: string;
}

export default function AgentsDashboard() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [economy, setEconomy] = useState<any>(null);
  const [agentJournal, setAgentJournal] = useState<JournalEntry[]>([]);
  const [agentGoals, setAgentGoals] = useState<Goal[]>([]);
  const [agentReputation, setAgentReputation] = useState<Reputation | null>(null);
  const [agentSpecializations, setAgentSpecializations] = useState<Specialization[]>([]);
  const [activeTab, setActiveTab] = useState<'activity' | 'goals' | 'reputation'>('activity');

  const loadData = async () => {
    try {
      const [agentsRes, economyRes] = await Promise.all([
        axios.get(`${API_URL}/api/agents`),
        axios.get(`${API_URL}/api/agent-economy`),
      ]);
      
      setAgents(agentsRes.data || []);
      setEconomy(economyRes.data);
      setTrades(economyRes.data?.recent_trades || []);
    } catch (error) {
      console.log('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAgentDetails = async (agentId: string) => {
    try {
      const [messagesRes, journalRes, goalsRes, repRes, specsRes] = await Promise.all([
        axios.get(`${API_URL}/api/agents/${agentId}/messages`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/agents/${agentId}/journal`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/agents/${agentId}/goals`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/agents/${agentId}/reputation`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/agents/${agentId}/specializations`).catch(() => ({ data: [] })),
      ]);
      setMessages(messagesRes.data || []);
      setAgentJournal(journalRes.data || []);
      setAgentGoals(goalsRes.data || []);
      setAgentReputation(repRes.data);
      setAgentSpecializations(specsRes.data || []);
    } catch (error) {
      console.log('Error loading agent details:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      loadAgentDetails(selectedAgent.id);
      setActiveTab('activity');
    }
  }, [selectedAgent]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getAgentName = (id: string) => {
    const agent = agents.find(a => a.id === id);
    return agent?.name || id.slice(0, 8);
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={[C.bg, '#12121A', C.bg]} style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>Loading Agents...</Text>
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
          <Text style={styles.headerTitle}>Agent Network</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={22} color={C.accent} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        >
          {/* Economy Stats */}
          {economy && (
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{economy.total_agents}</Text>
                <Text style={styles.statLabel}>Agents</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{economy.total_currency_in_circulation}</Text>
                <Text style={styles.statLabel}>Total Credits</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{economy.total_tools}</Text>
                <Text style={styles.statLabel}>Tools</Text>
              </View>
            </View>
          )}

          {/* Agents List */}
          <Text style={styles.sectionTitle}>Agents</Text>
          {agents.map(agent => (
            <TouchableOpacity
              key={agent.id}
              style={[styles.agentCard, selectedAgent?.id === agent.id && styles.agentCardSelected]}
              onPress={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
            >
              <View style={[styles.avatar, { backgroundColor: agent.avatar_color || C.accent }]}>
                <Text style={styles.avatarText}>{agent.name?.charAt(0) || '?'}</Text>
              </View>
              <View style={styles.agentInfo}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.agentMeta}>
                  {agent.currency_balance || 100} credits · {agent.tools?.length || 0} tools
                </Text>
              </View>
              <View style={styles.agentStatus}>
                <View style={[styles.statusDot, { backgroundColor: C.success }]} />
              </View>
            </TouchableOpacity>
          ))}

          {/* Selected Agent Details */}
          {selectedAgent && (
            <View style={styles.detailsSection}>
              <Text style={styles.sectionTitle}>{selectedAgent.name}'s Profile</Text>
              
              {/* Tab Selector */}
              <View style={styles.tabRow}>
                <TouchableOpacity 
                  style={[styles.tab, activeTab === 'activity' && styles.tabActive]}
                  onPress={() => setActiveTab('activity')}
                >
                  <Text style={[styles.tabText, activeTab === 'activity' && styles.tabTextActive]}>Activity</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tab, activeTab === 'goals' && styles.tabActive]}
                  onPress={() => setActiveTab('goals')}
                >
                  <Text style={[styles.tabText, activeTab === 'goals' && styles.tabTextActive]}>Goals</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tab, activeTab === 'reputation' && styles.tabActive]}
                  onPress={() => setActiveTab('reputation')}
                >
                  <Text style={[styles.tabText, activeTab === 'reputation' && styles.tabTextActive]}>Reputation</Text>
                </TouchableOpacity>
              </View>

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <>
                  {/* Journal Entries */}
                  <View style={styles.detailCard}>
                    <Text style={styles.detailLabel}>
                      <Ionicons name="journal" size={12} color={C.accent} /> Journal ({agentJournal.length})
                    </Text>
                    {agentJournal.length > 0 ? (
                      agentJournal.slice(0, 5).map((entry, i) => (
                        <View key={i} style={styles.journalRow}>
                          <View style={styles.journalHeader}>
                            <Text style={styles.journalType}>{entry.entry_type}</Text>
                            <Text style={styles.journalTime}>{formatTime(entry.timestamp)}</Text>
                          </View>
                          <Text style={styles.journalContent} numberOfLines={2}>{entry.content}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>No journal entries yet</Text>
                    )}
                  </View>

                  {/* Tools */}
                  <View style={styles.detailCard}>
                    <Text style={styles.detailLabel}>
                      <Ionicons name="construct" size={12} color={C.accent} /> Tools ({selectedAgent.tools?.length || 0})
                    </Text>
                    {selectedAgent.tools?.length > 0 ? (
                      selectedAgent.tools.map((tool, i) => (
                        <View key={i} style={styles.toolRow}>
                          <Ionicons name="cube" size={14} color={C.accent} />
                          <Text style={styles.toolName}>{tool.name}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>No tools</Text>
                    )}
                  </View>

                  {/* Recent Messages */}
                  <View style={styles.detailCard}>
                    <Text style={styles.detailLabel}>
                      <Ionicons name="chatbubbles" size={12} color={C.accent} /> Recent Messages
                    </Text>
                    {messages.length > 0 ? (
                      messages.slice(0, 5).map((msg, i) => (
                        <View key={i} style={styles.messageRow}>
                          <Text style={styles.messageType}>{msg.message_type}</Text>
                          <Text style={styles.messageContent} numberOfLines={2}>
                            {msg.from_agent_id === selectedAgent.id ? '→ ' : '← '}
                            {msg.content.slice(0, 80)}...
                          </Text>
                          <Text style={styles.messageTime}>{formatTime(msg.timestamp)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>No messages</Text>
                    )}
                  </View>
                </>
              )}

              {/* Goals Tab */}
              {activeTab === 'goals' && (
                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>
                    <Ionicons name="flag" size={12} color={C.accent} /> Active Goals
                  </Text>
                  {agentGoals.length > 0 ? (
                    agentGoals.map((goal, i) => (
                      <View key={i} style={styles.goalRow}>
                        <View style={styles.goalHeader}>
                          <Text style={styles.goalType}>{goal.goal_type}</Text>
                          <View style={[styles.statusBadge, goal.status === 'completed' ? styles.statusCompleted : styles.statusActive]}>
                            <Text style={styles.statusText}>{goal.status}</Text>
                          </View>
                        </View>
                        <Text style={styles.goalText}>{goal.goal}</Text>
                        <View style={styles.progressContainer}>
                          <View style={[styles.progressBar, { width: `${Math.min(100, (goal.current_value / goal.target_value) * 100)}%` }]} />
                        </View>
                        <Text style={styles.progressText}>{goal.current_value} / {goal.target_value}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>No goals set</Text>
                  )}
                </View>
              )}

              {/* Reputation Tab */}
              {activeTab === 'reputation' && (
                <>
                  {/* Reputation Score */}
                  <View style={styles.detailCard}>
                    <Text style={styles.detailLabel}>
                      <Ionicons name="star" size={12} color={C.warning} /> Reputation Score
                    </Text>
                    {agentReputation ? (
                      <View style={styles.reputationContainer}>
                        <Text style={styles.reputationScore}>{agentReputation.reputation_score.toFixed(1)}</Text>
                        <Text style={styles.reputationMax}>/100</Text>
                        <View style={styles.repStatsGrid}>
                          <View style={styles.repStatItem}>
                            <Text style={styles.repStatValue}>{agentReputation.successful_trades}</Text>
                            <Text style={styles.repStatLabel}>Trades</Text>
                          </View>
                          <View style={styles.repStatItem}>
                            <Text style={styles.repStatValue}>{agentReputation.tools_created}</Text>
                            <Text style={styles.repStatLabel}>Tools Made</Text>
                          </View>
                          <View style={styles.repStatItem}>
                            <Text style={styles.repStatValue}>{agentReputation.collaborations}</Text>
                            <Text style={styles.repStatLabel}>Collabs</Text>
                          </View>
                          <View style={styles.repStatItem}>
                            <Text style={styles.repStatValue}>{agentReputation.helpful_responses || 0}</Text>
                            <Text style={styles.repStatLabel}>Helpful</Text>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.emptyText}>No reputation data</Text>
                    )}
                  </View>

                  {/* Specializations */}
                  <View style={styles.detailCard}>
                    <Text style={styles.detailLabel}>
                      <Ionicons name="school" size={12} color={C.success} /> Specializations
                    </Text>
                    {agentSpecializations.length > 0 ? (
                      agentSpecializations.map((spec, i) => (
                        <View key={i} style={styles.specRow}>
                          <Text style={styles.specDomain}>{spec.domain}</Text>
                          <View style={styles.specBarContainer}>
                            <View style={[styles.specBar, { width: `${spec.expertise_level}%` }]} />
                          </View>
                          <Text style={styles.specLevel}>{spec.expertise_level.toFixed(0)}%</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyText}>No specializations yet</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          )}

          {/* Recent Trades */}
          <Text style={styles.sectionTitle}>Recent Trades</Text>
          {trades.length > 0 ? (
            trades.slice(0, 10).map((trade, i) => (
              <View key={i} style={styles.tradeCard}>
                <Ionicons name="swap-horizontal" size={18} color={C.warning} />
                <View style={styles.tradeInfo}>
                  <Text style={styles.tradeText}>
                    {getAgentName(trade.seller_agent_id)} → {getAgentName(trade.buyer_agent_id)}
                  </Text>
                  <Text style={styles.tradeMeta}>
                    "{trade.tool_name}" for {trade.price} credits
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No trades yet</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
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
  scroll: { flex: 1, padding: 16 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  statValue: { color: C.accent, fontSize: 22, fontWeight: '700' },
  statLabel: { color: C.muted, fontSize: 11, marginTop: 4 },
  sectionTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  agentCardSelected: {
    borderColor: C.accent,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  agentInfo: { flex: 1, marginLeft: 12 },
  agentName: { color: C.text, fontSize: 15, fontWeight: '600' },
  agentMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  agentStatus: { padding: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  detailsSection: { marginTop: 16 },
  detailCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  detailLabel: { color: C.accent, fontSize: 12, fontWeight: '600', marginBottom: 10 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  toolName: { color: C.text, fontSize: 13, marginLeft: 8 },
  messageRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  messageType: {
    color: C.accent,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  messageContent: { color: C.text, fontSize: 12, marginTop: 2 },
  messageTime: { color: C.muted, fontSize: 10, marginTop: 4 },
  emptyText: { color: C.muted, fontSize: 12, fontStyle: 'italic' },
  tradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  tradeInfo: { marginLeft: 10, flex: 1 },
  tradeText: { color: C.text, fontSize: 13, fontWeight: '500' },
  tradeMeta: { color: C.muted, fontSize: 11, marginTop: 2 },
  emptyCard: {
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  // Tab styles
  tabRow: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: C.accent,
  },
  tabText: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  // Journal styles
  journalRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  journalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  journalType: {
    color: C.warning,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  journalTime: {
    color: C.muted,
    fontSize: 10,
  },
  journalContent: {
    color: C.text,
    fontSize: 12,
    marginTop: 4,
  },
  // Goal styles
  goalRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  goalType: {
    color: C.accent,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  goalText: {
    color: C.text,
    fontSize: 13,
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusActive: {
    backgroundColor: C.accent + '30',
  },
  statusCompleted: {
    backgroundColor: C.success + '30',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '600',
    color: C.text,
    textTransform: 'uppercase',
  },
  progressContainer: {
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 3,
  },
  progressText: {
    color: C.muted,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  // Reputation styles
  reputationContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  reputationScore: {
    color: C.warning,
    fontSize: 42,
    fontWeight: '700',
  },
  reputationMax: {
    color: C.muted,
    fontSize: 14,
    marginTop: -8,
  },
  repStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    width: '100%',
  },
  repStatItem: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  repStatValue: {
    color: C.text,
    fontSize: 18,
    fontWeight: '600',
  },
  repStatLabel: {
    color: C.muted,
    fontSize: 10,
    marginTop: 2,
  },
  // Specialization styles
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  specDomain: {
    color: C.text,
    fontSize: 12,
    width: 80,
  },
  specBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: C.border,
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  specBar: {
    height: '100%',
    backgroundColor: C.success,
    borderRadius: 4,
  },
  specLevel: {
    color: C.muted,
    fontSize: 11,
    width: 35,
    textAlign: 'right',
  },
});
