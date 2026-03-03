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
}

interface Specialization {
  domain: string;
  expertise_level: number;
}

interface JournalEntry {
  entry_type: string;
  content: string;
  timestamp: string;
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

  const loadAgentMessages = async (agentId: string) => {
    try {
      const res = await axios.get(`${API_URL}/api/agents/${agentId}/messages`);
      setMessages(res.data || []);
    } catch (error) {
      console.log('Error loading messages:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      loadAgentMessages(selectedAgent.id);
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
              <Text style={styles.sectionTitle}>{selectedAgent.name}'s Activity</Text>
              
              {/* Tools */}
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>Tools ({selectedAgent.tools?.length || 0})</Text>
                {selectedAgent.tools?.length > 0 ? (
                  selectedAgent.tools.map((tool, i) => (
                    <View key={i} style={styles.toolRow}>
                      <Ionicons name="construct" size={14} color={C.accent} />
                      <Text style={styles.toolName}>{tool.name}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No tools</Text>
                )}
              </View>

              {/* Recent Messages */}
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>Recent Messages</Text>
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
});
