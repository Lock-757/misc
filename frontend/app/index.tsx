import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';

const { width, height } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Message {
  id: string;
  role: string;
  content: string;
  tool_calls?: any[];
  timestamp: string;
}

interface Agent {
  id: string;
  name: string;
  avatar: string;
  avatar_color: string;
  system_prompt: string;
  personality: string;
  model: string;
  temperature: number;
}

interface UIConfig {
  primary_color: string;
  accent_color: string;
  background_gradient: string[];
  chat_bubble_user: string;
  chat_bubble_assistant: string;
}

const defaultAgent: Agent = {
  id: 'default-agent',
  name: 'Nova',
  avatar: 'planet',
  avatar_color: '#8B5CF6',
  system_prompt: 'You are Nova, a highly intelligent AI assistant.',
  personality: 'Friendly and professional',
  model: 'grok-3-latest',
  temperature: 0.7,
};

const defaultUIConfig: UIConfig = {
  primary_color: '#8B5CF6',
  accent_color: '#06B6D4',
  background_gradient: ['#0F0F1A', '#1A1A2E', '#16213E'],
  chat_bubble_user: '#8B5CF6',
  chat_bubble_assistant: '#1E1E2E',
};

export default function ChatScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agent, setAgent] = useState<Agent>(defaultAgent);
  const [uiConfig, setUIConfig] = useState<UIConfig>(defaultUIConfig);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
    startAnimations();
  }, []);

  const startAnimations = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const loadData = async () => {
    try {
      // Load agent config
      const agentsRes = await axios.get(`${API_URL}/api/agents`);
      if (agentsRes.data.length > 0) {
        setAgent(agentsRes.data[0]);
      } else {
        // Create default agent
        const newAgent = await axios.post(`${API_URL}/api/agents`, {
          name: 'Nova',
          avatar: 'planet',
          avatar_color: '#8B5CF6',
        });
        setAgent(newAgent.data);
      }

      // Load UI config
      const uiRes = await axios.get(`${API_URL}/api/ui-config`);
      setUIConfig(uiRes.data);
    } catch (error) {
      console.log('Error loading data:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const response = await axios.post(`${API_URL}/api/chat`, {
        agent_id: agent.id,
        conversation_id: conversationId,
        message: userMessage.content,
      });

      setConversationId(response.data.conversation_id);
      
      const assistantMessage: Message = {
        id: response.data.message.id,
        role: 'assistant',
        content: response.data.message.content,
        tool_calls: response.data.message.tool_calls,
        timestamp: response.data.message.timestamp,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  const getAvatarIcon = (avatar: string) => {
    const icons: { [key: string]: keyof typeof Ionicons.glyphMap } = {
      robot: 'hardware-chip',
      planet: 'planet',
      sparkles: 'sparkles',
      flash: 'flash',
      diamond: 'diamond',
      flame: 'flame',
    };
    return icons[avatar] || 'planet';
  };

  const renderMessage = (message: Message, index: number) => {
    const isUser = message.role === 'user';
    const bubbleColor = isUser ? uiConfig.chat_bubble_user : uiConfig.chat_bubble_assistant;

    return (
      <Animated.View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
          { opacity: fadeAnim },
        ]}
      >
        {!isUser && (
          <View style={[styles.avatarSmall, { backgroundColor: agent.avatar_color + '30' }]}>
            <Ionicons name={getAvatarIcon(agent.avatar)} size={18} color={agent.avatar_color} />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
            { backgroundColor: bubbleColor },
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {message.content}
          </Text>
          {message.tool_calls && message.tool_calls.length > 0 && (
            <View style={styles.toolContainer}>
              {message.tool_calls.map((tool: any, idx: number) => (
                <View key={idx} style={styles.toolBadge}>
                  <Ionicons name="construct" size={12} color={uiConfig.accent_color} />
                  <Text style={[styles.toolText, { color: uiConfig.accent_color }]}>
                    {tool.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  return (
    <LinearGradient colors={uiConfig.background_gradient as any} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <TouchableOpacity onPress={clearChat} style={styles.headerButton}>
            <Ionicons name="add-circle-outline" size={26} color={uiConfig.accent_color} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.agentInfo}>
            <Animated.View
              style={[
                styles.avatarContainer,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <LinearGradient
                colors={[agent.avatar_color, agent.avatar_color + '80']}
                style={styles.avatarGradient}
              >
                <Ionicons name={getAvatarIcon(agent.avatar)} size={28} color="#fff" />
              </LinearGradient>
            </Animated.View>
            <View style={styles.agentTextContainer}>
              <Text style={styles.agentName}>{agent.name}</Text>
              <View style={styles.statusContainer}>
                <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.statusText}>Online</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/ui-editor')} style={styles.headerButton}>
            <Ionicons name="color-palette-outline" size={26} color={uiConfig.accent_color} />
          </TouchableOpacity>
        </Animated.View>

        {/* Messages */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={uiConfig.accent_color} />
            }
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Animated.View style={[styles.emptyAvatar, { transform: [{ scale: pulseAnim }] }]}>
                  <LinearGradient
                    colors={[agent.avatar_color, uiConfig.accent_color]}
                    style={styles.emptyAvatarGradient}
                  >
                    <Ionicons name={getAvatarIcon(agent.avatar)} size={60} color="#fff" />
                  </LinearGradient>
                </Animated.View>
                <Text style={styles.emptyTitle}>Hi, I'm {agent.name}</Text>
                <Text style={styles.emptySubtitle}>
                  Your intelligent assistant with tool generation capabilities.
                  Ask me anything!
                </Text>
                <View style={styles.suggestionContainer}>
                  {['What can you do?', 'Generate a tool', 'Tell me a joke'].map((suggestion, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.suggestionChip, { borderColor: uiConfig.primary_color + '50' }]}
                      onPress={() => setInputText(suggestion)}
                    >
                      <Text style={[styles.suggestionText, { color: uiConfig.primary_color }]}>
                        {suggestion}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              messages.map((msg, idx) => renderMessage(msg, idx))
            )}
            {isLoading && (
              <View style={styles.loadingContainer}>
                <View style={[styles.avatarSmall, { backgroundColor: agent.avatar_color + '30' }]}>
                  <Ionicons name={getAvatarIcon(agent.avatar)} size={18} color={agent.avatar_color} />
                </View>
                <View style={[styles.typingIndicator, { backgroundColor: uiConfig.chat_bubble_assistant }]}>
                  <ActivityIndicator size="small" color={uiConfig.accent_color} />
                  <Text style={styles.typingText}>Thinking...</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputWrapper}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Message..."
                placeholderTextColor="#6B7280"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: inputText.trim() ? uiConfig.primary_color : '#374151' },
                ]}
                onPress={sendMessage}
                disabled={!inputText.trim() || isLoading}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerButton: {
    padding: 8,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentTextContainer: {
    alignItems: 'flex-start',
  },
  agentName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: width * 0.75,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#E5E7EB',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  toolContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  toolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  toolText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: height * 0.1,
  },
  emptyAvatar: {
    marginBottom: 24,
  },
  emptyAvatarGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 24,
  },
  suggestionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 24,
    gap: 10,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    gap: 8,
  },
  typingText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  inputWrapper: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    paddingTop: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1F2937',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    maxHeight: 100,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
