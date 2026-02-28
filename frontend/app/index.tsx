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
  Clipboard,
  Alert,
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

const defaultAgent: Agent = {
  id: 'default-agent',
  name: 'Nova',
  avatar: 'planet',
  avatar_color: '#7C7C8A',
  system_prompt: 'You are Nova, a highly intelligent AI assistant.',
  personality: 'Friendly and professional',
  model: 'grok-3-latest',
  temperature: 0.7,
};

// Metallic color palette
const METALLIC = {
  chrome: '#C0C0C8',
  silver: '#A8A8B0',
  gunmetal: '#2A2A32',
  darkSteel: '#18181D',
  titanium: '#878792',
  platinum: '#E5E5EA',
  accent: '#6366F1',
  accentGlow: 'rgba(99, 102, 241, 0.3)',
};

export default function ChatScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agent, setAgent] = useState<Agent>(defaultAgent);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

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
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Shimmer effect
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  };

  const loadData = async () => {
    try {
      const agentsRes = await axios.get(`${API_URL}/api/agents`);
      if (agentsRes.data.length > 0) {
        setAgent(agentsRes.data[0]);
      } else {
        const newAgent = await axios.post(`${API_URL}/api/agents`, {
          name: 'Nova',
          avatar: 'planet',
          avatar_color: '#7C7C8A',
        });
        setAgent(newAgent.data);
      }
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
        content: 'Connection interrupted. Please try again.',
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

  const copyMessage = (content: string) => {
    Clipboard.setString(content);
    Alert.alert('Copied', 'Message copied to clipboard');
  };

  const regenerateMessage = async (messageIndex: number) => {
    if (isLoading) return;
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return;
    
    const lastUserMessage = userMessages[userMessages.length - 1];
    setMessages(prev => prev.slice(0, -1));
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/chat`, {
        agent_id: agent.id,
        conversation_id: conversationId,
        message: lastUserMessage.content,
      });

      const assistantMessage: Message = {
        id: response.data.message.id,
        role: 'assistant',
        content: response.data.message.content,
        tool_calls: response.data.message.tool_calls,
        timestamp: response.data.message.timestamp,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Regenerate error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAvatarIcon = (avatar: string) => {
    const icons: { [key: string]: keyof typeof Ionicons.glyphMap } = {
      robot: 'hardware-chip',
      planet: 'planet',
      sparkles: 'sparkles',
      flash: 'flash',
      diamond: 'diamond',
      flame: 'flame',
      cube: 'cube',
      prism: 'prism',
    };
    return icons[avatar] || 'planet';
  };

  const renderMessage = (message: Message, index: number) => {
    const isUser = message.role === 'user';
    const isSelected = selectedMessage === message.id;

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
          <LinearGradient
            colors={[METALLIC.gunmetal, METALLIC.darkSteel]}
            style={styles.avatarSmall}
          >
            <Ionicons name={getAvatarIcon(agent.avatar)} size={16} color={METALLIC.chrome} />
          </LinearGradient>
        )}
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => setSelectedMessage(isSelected ? null : message.id)}
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <LinearGradient
            colors={isUser ? [METALLIC.accent, '#4F46E5'] : [METALLIC.gunmetal, '#1F1F28']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bubbleGradient}
          >
            <Text style={[styles.messageText, isUser && styles.userMessageText]}>
              {message.content}
            </Text>
            {message.tool_calls && message.tool_calls.length > 0 && (
              <View style={styles.toolContainer}>
                {message.tool_calls.map((tool: any, idx: number) => (
                  <View key={idx} style={styles.toolBadge}>
                    <Ionicons name="construct" size={12} color={METALLIC.accent} />
                    <Text style={styles.toolText}>{tool.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
        
        {/* Message Actions */}
        {isSelected && (
          <View style={styles.messageActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => copyMessage(message.content)}
            >
              <Ionicons name="copy-outline" size={18} color={METALLIC.chrome} />
            </TouchableOpacity>
            {!isUser && index === messages.length - 1 && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => regenerateMessage(index)}
              >
                <Ionicons name="refresh-outline" size={18} color={METALLIC.chrome} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>
    );
  };

  return (
    <LinearGradient
      colors={['#0A0A0F', '#12121A', '#0A0A0F']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <LinearGradient
            colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
            style={styles.headerGradient}
          >
            <TouchableOpacity onPress={() => router.push('/history')} style={styles.headerButton}>
              <Ionicons name="time-outline" size={24} color={METALLIC.silver} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/settings')} style={styles.agentInfo}>
              <Animated.View
                style={[styles.avatarContainer, { transform: [{ scale: pulseAnim }] }]}
              >
                <LinearGradient
                  colors={[METALLIC.gunmetal, METALLIC.darkSteel]}
                  style={styles.avatarGradient}
                >
                  <View style={styles.avatarInner}>
                    <Ionicons name={getAvatarIcon(agent.avatar)} size={26} color={METALLIC.chrome} />
                  </View>
                  <View style={styles.avatarRing} />
                </LinearGradient>
              </Animated.View>
              <View style={styles.agentTextContainer}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <View style={styles.statusContainer}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>{agent.model.split('-')[0]}</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.headerRight}>
              <TouchableOpacity onPress={() => router.push('/imagegen')} style={styles.headerButton}>
                <Ionicons name="image-outline" size={24} color={METALLIC.silver} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/tools')} style={styles.headerButton}>
                <Ionicons name="construct-outline" size={24} color={METALLIC.silver} />
              </TouchableOpacity>
              <TouchableOpacity onPress={clearChat} style={styles.headerButton}>
                <Ionicons name="add-circle-outline" size={24} color={METALLIC.silver} />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={METALLIC.silver} />
            }
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Animated.View style={[styles.emptyAvatar, { transform: [{ scale: pulseAnim }] }]}>
                  <LinearGradient
                    colors={[METALLIC.gunmetal, METALLIC.darkSteel]}
                    style={styles.emptyAvatarGradient}
                  >
                    <View style={styles.emptyAvatarInner}>
                      <Ionicons name={getAvatarIcon(agent.avatar)} size={50} color={METALLIC.chrome} />
                    </View>
                    <View style={styles.emptyAvatarRing} />
                  </LinearGradient>
                </Animated.View>
                <Text style={styles.emptyTitle}>Meet {agent.name}</Text>
                <Text style={styles.emptySubtitle}>
                  Advanced AI with dynamic tool generation.
                  Ready to assist.
                </Text>
                <View style={styles.suggestionContainer}>
                  {['Capabilities', 'Generate a tool', 'Analyze data'].map((suggestion, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.suggestionChip}
                      onPress={() => setInputText(suggestion === 'Capabilities' ? 'What can you do?' : suggestion)}
                    >
                      <LinearGradient
                        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']}
                        style={styles.suggestionGradient}
                      >
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                </View>
                
                {/* Quick Stats */}
                <View style={styles.statsContainer}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{agent.model.split('-')[0]}</Text>
                    <Text style={styles.statLabel}>Model</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{agent.temperature}</Text>
                    <Text style={styles.statLabel}>Temp</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>∞</Text>
                    <Text style={styles.statLabel}>Tools</Text>
                  </View>
                </View>
              </View>
            ) : (
              messages.map((msg, idx) => renderMessage(msg, idx))
            )}
            {isLoading && (
              <View style={styles.loadingContainer}>
                <LinearGradient
                  colors={[METALLIC.gunmetal, METALLIC.darkSteel]}
                  style={styles.avatarSmall}
                >
                  <Ionicons name={getAvatarIcon(agent.avatar)} size={16} color={METALLIC.chrome} />
                </LinearGradient>
                <View style={styles.typingIndicator}>
                  <LinearGradient
                    colors={[METALLIC.gunmetal, '#1F1F28']}
                    style={styles.typingGradient}
                  >
                    <View style={styles.typingDots}>
                      <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
                      <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
                      <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
                    </View>
                    <Text style={styles.typingText}>Processing</Text>
                  </LinearGradient>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputWrapper}>
            <LinearGradient
              colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
              style={styles.inputGradient}
            >
              <View style={styles.inputContainer}>
                <TouchableOpacity style={styles.inputIcon} onPress={() => router.push('/ui-editor')}>
                  <Ionicons name="color-palette-outline" size={22} color={METALLIC.titanium} />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder="Message..."
                  placeholderTextColor={METALLIC.titanium}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={2000}
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    !inputText.trim() && styles.sendButtonDisabled,
                  ]}
                  onPress={sendMessage}
                  disabled={!inputText.trim() || isLoading}
                >
                  <LinearGradient
                    colors={inputText.trim() ? [METALLIC.accent, '#4F46E5'] : [METALLIC.gunmetal, METALLIC.darkSteel]}
                    style={styles.sendGradient}
                  >
                    <Ionicons name="arrow-up" size={20} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    padding: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
    position: 'relative',
  },
  avatarInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: METALLIC.darkSteel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  agentTextContainer: {
    alignItems: 'flex-start',
  },
  agentName: {
    fontSize: 17,
    fontWeight: '600',
    color: METALLIC.platinum,
    letterSpacing: 0.5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    color: METALLIC.titanium,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: width * 0.75,
    borderRadius: 18,
    overflow: 'hidden',
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  bubbleGradient: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageText: {
    fontSize: 15,
    color: METALLIC.platinum,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  toolContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 6,
  },
  toolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  toolText: {
    fontSize: 11,
    fontWeight: '600',
    color: METALLIC.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageActions: {
    flexDirection: 'row',
    marginLeft: 8,
    gap: 4,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: METALLIC.gunmetal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: height * 0.08,
  },
  emptyAvatar: {
    marginBottom: 24,
  },
  emptyAvatarGradient: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  emptyAvatarInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: METALLIC.darkSteel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAvatarRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: '600',
    color: METALLIC.platinum,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  emptySubtitle: {
    fontSize: 15,
    color: METALLIC.titanium,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  suggestionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 28,
    gap: 10,
  },
  suggestionChip: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  suggestionGradient: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
    color: METALLIC.silver,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: METALLIC.platinum,
    textTransform: 'capitalize',
  },
  statLabel: {
    fontSize: 11,
    color: METALLIC.titanium,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  typingIndicator: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    overflow: 'hidden',
  },
  typingGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: METALLIC.silver,
  },
  typingText: {
    fontSize: 13,
    color: METALLIC.titanium,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    paddingTop: 8,
  },
  inputGradient: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
  },
  inputIcon: {
    padding: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: METALLIC.platinum,
    maxHeight: 100,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
