import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { useAuth, getStoredToken } from '../context/AuthContext';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ADMIN_SECRET = process.env.EXPO_PUBLIC_ADMIN_SECRET;

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

interface Agent {
  id: string;
  name: string;
  avatar: string;
  avatar_color: string;
  personality: string;
  has_tools?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  agent_name?: string;
  agent_color?: string;
  timestamp: string;
}

interface AgentMessage {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  message_type: string;
  content: string;
  timestamp: string;
}

export default function AgentChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { user, isAdmin } = useAuth();
  
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [viewMode, setViewMode] = useState<'chat' | 'observe'>('chat');

  useEffect(() => {
    loadAgents();
    loadAllAgentMessages();
  }, []);

  useEffect(() => {
    if (selectedAgent && viewMode === 'chat') {
      loadAgentConversation(selectedAgent.id);
    }
  }, [selectedAgent, viewMode]);

  const loadAgents = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/agents`);
      const agentList = res.data.filter((a: Agent) => !a.name?.includes('Template'));
      setAgents(agentList);
      if (agentList.length > 0) {
        setSelectedAgent(agentList[0]);
      }
    } catch (err) {
      console.log('Error loading agents:', err);
    } finally {
      setLoadingAgents(false);
    }
  };

  const loadAgentConversation = async (agentId: string) => {
    try {
      const token = await getStoredToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const res = await axios.get(`${API_URL}/api/agents/${agentId}/messages`, { headers });
      const agentMsgs = res.data || [];
      
      // Convert to chat format
      const chatMsgs: ChatMessage[] = agentMsgs.map((m: AgentMessage) => ({
        id: m.id,
        role: 'agent' as const,
        content: m.content,
        agent_name: getAgentName(m.from_agent_id),
        agent_color: getAgentColor(m.from_agent_id),
        timestamp: m.timestamp,
      }));
      
      setMessages(chatMsgs.reverse());
    } catch (err) {
      console.log('Error loading conversation:', err);
    }
  };

  const loadAllAgentMessages = async () => {
    try {
      // Load messages from all agents for observe mode
      const res = await axios.get(`${API_URL}/api/agents`);
      const allAgents = res.data || [];
      
      let allMessages: AgentMessage[] = [];
      for (const agent of allAgents.slice(0, 5)) { // Limit to first 5 agents
        try {
          const msgRes = await axios.get(`${API_URL}/api/agents/${agent.id}/messages`);
          allMessages = [...allMessages, ...(msgRes.data || [])];
        } catch (e) {}
      }
      
      // Sort by timestamp and dedupe
      const uniqueMessages = allMessages.reduce((acc: AgentMessage[], msg) => {
        if (!acc.find(m => m.id === msg.id)) acc.push(msg);
        return acc;
      }, []);
      
      uniqueMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAgentMessages(uniqueMessages.slice(0, 50));
    } catch (err) {
      console.log('Error loading all messages:', err);
    }
  };

  const getAgentName = (id: string) => {
    const agent = agents.find(a => a.id === id);
    return agent?.name || id.slice(0, 8);
  };

  const getAgentColor = (id: string) => {
    const agent = agents.find(a => a.id === id);
    return agent?.avatar_color || C.accent;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !selectedAgent || isLoading) return;
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMsg]);
    const msgToSend = inputText.trim();
    setInputText('');
    setIsLoading(true);
    
    try {
      const token = await getStoredToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (isAdmin && ADMIN_SECRET) headers['X-Admin-Key'] = ADMIN_SECRET;
      
      // Check if agent has tools enabled - use agentic endpoint
      const hasTools = selectedAgent.has_tools || selectedAgent.name === 'Devin';
      const endpoint = hasTools ? '/api/agentic-chat' : '/api/chat';
      
      const res = await axios.post(`${API_URL}${endpoint}`, {
        agent_id: selectedAgent.id,
        message: msgToSend,
        user_id: user?.user_id || 'guest',
      }, { headers });
      
      let responseContent = res.data.message.content;
      
      // If tool results exist, append them
      if (res.data.tool_results && res.data.tool_results.length > 0) {
        responseContent += '\n\n---\n**Tool Executions:** ' + res.data.iterations + ' iterations';
      }
      
      const assistantMsg: ChatMessage = {
        id: res.data.message.id,
        role: 'assistant',
        content: responseContent,
        agent_name: selectedAgent.name,
        agent_color: selectedAgent.avatar_color,
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      let errorContent = err.response?.data?.detail || err.message;
      
      // Improve error messages
      if (err.response?.status === 429 || errorContent.includes('credit') || errorContent.includes('rate')) {
        errorContent = '⚠️ API credits exhausted. Please add more credits to your Grok account.';
      } else if (err.response?.status === 500) {
        errorContent = '⚠️ Server error. The AI service may be temporarily unavailable.';
      }
      
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorContent,
        agent_name: selectedAgent.name,
        agent_color: C.danger,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const triggerAgentChat = async (fromAgent: Agent, toAgent: Agent) => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      const res = await axios.post(`${API_URL}/api/agents/${fromAgent.id}/message`, null, {
        params: {
          to_agent_id: toAgent.id,
          message: `Hello ${toAgent.name}, I'm ${fromAgent.name}. What are you working on?`,
          message_type: 'chat'
        }
      });
      
      // Refresh messages
      await loadAllAgentMessages();
      if (selectedAgent) {
        await loadAgentConversation(selectedAgent.id);
      }
    } catch (err) {
      console.log('Error triggering agent chat:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (loadingAgents) {
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} data-testid="agent-chat-back-button">
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Agent Chat</Text>
          <TouchableOpacity onPress={loadAllAgentMessages} style={styles.refreshBtn} data-testid="agent-chat-refresh-button">
            <Ionicons name="refresh" size={22} color={C.accent} />
          </TouchableOpacity>
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === 'chat' && styles.modeBtnActive]}
            onPress={() => setViewMode('chat')}
            data-testid="agent-chat-mode-chat-button"
          >
            <Ionicons name="chatbubble" size={16} color={viewMode === 'chat' ? '#fff' : C.muted} />
            <Text style={[styles.modeBtnText, viewMode === 'chat' && styles.modeBtnTextActive]}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === 'observe' && styles.modeBtnActive]}
            onPress={() => setViewMode('observe')}
            data-testid="agent-chat-mode-observe-button"
          >
            <Ionicons name="eye" size={16} color={viewMode === 'observe' ? '#fff' : C.muted} />
            <Text style={[styles.modeBtnText, viewMode === 'observe' && styles.modeBtnTextActive]}>Observe</Text>
          </TouchableOpacity>
        </View>

        {/* Agent Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.agentScroll}>
          {agents.map(agent => (
            <TouchableOpacity
              key={agent.id}
              style={[styles.agentTab, selectedAgent?.id === agent.id && styles.agentTabActive]}
              onPress={() => setSelectedAgent(agent)}
              data-testid={`agent-chat-agent-tab-${agent.id}`}
            >
              <View style={[styles.agentDot, { backgroundColor: agent.avatar_color || C.accent }]} />
              <Text style={[styles.agentTabText, selectedAgent?.id === agent.id && styles.agentTabTextActive]}>
                {agent.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <KeyboardAvoidingView
          style={styles.contentWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : Math.max(insets.bottom, 12)}
        >
          {/* Chat View */}
          {viewMode === 'chat' ? (
            <>
            <ScrollView
              ref={scrollRef}
              style={styles.chatArea}
              contentContainerStyle={styles.chatContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubbles-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>Start chatting with {selectedAgent?.name}</Text>
                </View>
              ) : (
                messages.map(msg => (
                  <View
                    key={msg.id}
                    style={[styles.msgRow, msg.role === 'user' ? styles.msgRowUser : styles.msgRowAgent]}
                  >
                    {msg.role !== 'user' && (
                      <View style={[styles.msgAvatar, { backgroundColor: msg.agent_color || C.accent }]}>
                        <Text style={styles.msgAvatarText}>{msg.agent_name?.charAt(0) || '?'}</Text>
                      </View>
                    )}
                    <View style={[styles.msgBubble, msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAgent]}>
                      {msg.role !== 'user' && <Text style={styles.msgAgentName}>{msg.agent_name}</Text>}
                      <Text style={styles.msgText}>{msg.content}</Text>
                      <Text style={styles.msgTime}>{formatTime(msg.timestamp)}</Text>
                    </View>
                  </View>
                ))
              )}
              {isLoading && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={C.accent} />
                  <Text style={styles.loadingMsg}>Thinking...</Text>
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <View
              style={[
                styles.inputRow,
                {
                  paddingBottom:
                    Platform.OS === 'ios'
                      ? Math.max(insets.bottom, 8)
                      : Math.max(insets.bottom, 14),
                },
              ]}
              data-testid="agent-chat-input-row"
            >
              <TextInput
                style={styles.input}
                placeholder={`Message ${selectedAgent?.name}...`}
                placeholderTextColor={C.muted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
                data-testid="agent-chat-message-input"
              />
              <TouchableOpacity
                style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
                onPress={sendMessage}
                disabled={!inputText.trim() || isLoading}
                data-testid="agent-chat-send-button"
              >
                <Ionicons name="send" size={20} color={inputText.trim() ? '#fff' : C.muted} />
              </TouchableOpacity>
            </View>
            </>
          ) : (
            /* Observe Mode - Agent to Agent Messages */
            <ScrollView style={styles.chatArea} contentContainerStyle={styles.chatContent}>
              <Text style={styles.sectionLabel}>Agent-to-Agent Communications</Text>
              
              {/* Trigger Agent Chat */}
              {agents.length >= 2 && (
                <TouchableOpacity
                  style={styles.triggerBtn}
                  onPress={() => triggerAgentChat(agents[0], agents[1])}
                  disabled={isLoading}
                  data-testid="agent-chat-trigger-conversation-button"
                >
                  <Ionicons name="chatbubbles" size={18} color="#fff" />
                  <Text style={styles.triggerBtnText}>
                    {isLoading ? 'Sending...' : `Make ${agents[0]?.name} talk to ${agents[1]?.name}`}
                  </Text>
                </TouchableOpacity>
              )}

              {agentMessages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="radio-outline" size={48} color={C.muted} />
                  <Text style={styles.emptyText}>No agent communications yet</Text>
                  <Text style={styles.emptySubtext}>Trigger a conversation above</Text>
                </View>
              ) : (
                agentMessages.map(msg => (
                  <View key={msg.id} style={styles.observeMsg}>
                    <View style={styles.observeHeader}>
                      <View style={[styles.observeDot, { backgroundColor: getAgentColor(msg.from_agent_id) }]} />
                      <Text style={styles.observeFrom}>{getAgentName(msg.from_agent_id)}</Text>
                      <Ionicons name="arrow-forward" size={14} color={C.muted} />
                      <Text style={styles.observeTo}>{getAgentName(msg.to_agent_id)}</Text>
                      <Text style={styles.observeType}>{msg.message_type}</Text>
                    </View>
                    <Text style={styles.observeContent}>{msg.content}</Text>
                    <Text style={styles.observeTime}>{formatTime(msg.timestamp)}</Text>
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
  contentWrapper: { flex: 1 },
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
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  modeBtnActive: { backgroundColor: C.accent },
  modeBtnText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  modeBtnTextActive: { color: '#fff' },
  agentScroll: {
    maxHeight: 50,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  agentTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  agentTabActive: { borderColor: C.accent, backgroundColor: C.accent + '20' },
  agentDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  agentTabText: { color: C.muted, fontSize: 13, fontWeight: '500' },
  agentTabTextActive: { color: C.text },
  chatArea: { flex: 1, marginTop: 8 },
  chatContent: { padding: 16, paddingBottom: 20 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: C.muted, marginTop: 12, fontSize: 14 },
  emptySubtext: { color: C.muted, marginTop: 4, fontSize: 12 },
  msgRow: { flexDirection: 'row', marginBottom: 12 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAgent: { justifyContent: 'flex-start' },
  msgAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  msgAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  msgBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  msgBubbleUser: {
    backgroundColor: C.accent,
    borderBottomRightRadius: 4,
  },
  msgBubbleAgent: {
    backgroundColor: C.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  msgAgentName: { color: C.accent, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  msgText: { color: C.text, fontSize: 14, lineHeight: 20 },
  msgTime: { color: C.muted, fontSize: 10, marginTop: 4, textAlign: 'right' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  loadingMsg: { color: C.muted, marginLeft: 8, fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  input: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: C.text,
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: C.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: C.card },
  sectionLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  triggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.success,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  triggerBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  observeMsg: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  observeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  observeDot: { width: 8, height: 8, borderRadius: 4 },
  observeFrom: { color: C.text, fontSize: 13, fontWeight: '600' },
  observeTo: { color: C.text, fontSize: 13 },
  observeType: {
    color: C.warning,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginLeft: 'auto',
  },
  observeContent: { color: C.text, fontSize: 13, lineHeight: 18 },
  observeTime: { color: C.muted, fontSize: 10, marginTop: 6 },
});
