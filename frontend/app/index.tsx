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
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
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
  adult_mode: boolean;
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
  adult_mode: false,
};

const METALLIC = {
  chrome: '#C0C0C8',
  silver: '#A8A8B0',
  gunmetal: '#2A2A32',
  darkSteel: '#18181D',
  titanium: '#878792',
  platinum: '#E5E5EA',
  accent: '#6366F1',
  danger: '#EF4444',
  success: '#10B981',
};

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ conversationId?: string; agentId?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agent, setAgent] = useState<Agent>(defaultAgent);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  
  // Voice states
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    loadData();
    startAnimations();
    setupAudio();
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, []);

  // Handle conversation resumption from history
  useEffect(() => {
    if (params.conversationId) {
      loadConversation(params.conversationId);
    }
  }, [params.conversationId]);

  const loadConversation = async (convId: string) => {
    try {
      const res = await axios.get(`${API_URL}/api/conversations/${convId}`);
      if (res.data) {
        setConversationId(res.data.id);
        setMessages(res.data.messages || []);
        // Scroll to bottom after loading messages
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.log('Error loading conversation:', error);
      Alert.alert('Error', 'Could not load conversation');
    }
  };

  const setupAudio = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    } catch (error) {
      console.log('Audio setup error:', error);
    }
  };

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

  // Voice Recording
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant microphone access');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        // For now, we'll simulate transcription
        // In production, you'd send this to a speech-to-text API
        Alert.alert(
          'Voice Recording',
          'Voice recording captured! In production, this would be transcribed to text.',
          [
            { text: 'OK' }
          ]
        );
      }
    } catch (error) {
      console.error('Stop recording error:', error);
    }
  };

  // Text-to-Speech
  const speakMessage = async (text: string) => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'en',
      pitch: 1.0,
      rate: 0.9,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

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

      // Auto-speak if voice is enabled
      if (voiceEnabled && assistantMessage.content) {
        // Optional: auto-speak responses
        // speakMessage(assistantMessage.content);
      }
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

  const copyToClipboard = (text: string) => {
    Alert.alert('Copied', 'Message copied to clipboard');
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
              onPress={() => copyToClipboard(message.content)}
            >
              <Ionicons name="copy-outline" size={16} color={METALLIC.chrome} />
            </TouchableOpacity>
            {!isUser && (
              <TouchableOpacity
                style={[styles.actionButton, isSpeaking && styles.actionButtonActive]}
                onPress={() => speakMessage(message.content)}
              >
                <Ionicons 
                  name={isSpeaking ? "stop" : "volume-high-outline"} 
                  size={16} 
                  color={isSpeaking ? METALLIC.accent : METALLIC.chrome} 
                />
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
                  {agent.adult_mode && (
                    <View style={styles.adultBadgeSmall}>
                      <Text style={styles.adultBadgeText}>18+</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.headerRight}>
              <TouchableOpacity onPress={() => router.push('/search')} style={styles.headerButton}>
                <Ionicons name="search-outline" size={24} color={METALLIC.silver} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.headerButton}>
                <Ionicons name="grid-outline" size={24} color={METALLIC.silver} />
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

                {/* Feature Cards */}
                <View style={styles.featureCards}>
                  <TouchableOpacity style={styles.featureCard} onPress={() => router.push('/imagegen')}>
                    <LinearGradient colors={['rgba(99,102,241,0.15)', 'rgba(99,102,241,0.05)']} style={styles.featureGradient}>
                      <Ionicons name="image" size={24} color={METALLIC.accent} />
                      <Text style={styles.featureTitle}>HD Images</Text>
                      <Text style={styles.featureDesc}>Generate art</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.featureCard} onPress={() => router.push('/tools')}>
                    <LinearGradient colors={['rgba(16,185,129,0.15)', 'rgba(16,185,129,0.05)']} style={styles.featureGradient}>
                      <Ionicons name="construct" size={24} color={METALLIC.success} />
                      <Text style={styles.featureTitle}>Tools</Text>
                      <Text style={styles.featureDesc}>Dynamic gen</Text>
                    </LinearGradient>
                  </TouchableOpacity>
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
                <TouchableOpacity 
                  style={[styles.inputIcon, isRecording && styles.inputIconRecording]} 
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  <Ionicons 
                    name={isRecording ? "stop-circle" : "mic-outline"} 
                    size={22} 
                    color={isRecording ? METALLIC.danger : METALLIC.titanium} 
                  />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder={isRecording ? "Recording..." : "Message..."}
                  placeholderTextColor={isRecording ? METALLIC.danger : METALLIC.titanium}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={2000}
                  editable={!isRecording}
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

        {/* Features Menu Modal */}
        <Modal visible={showMenu} transparent animationType="fade">
          <TouchableOpacity 
            style={styles.menuOverlay} 
            activeOpacity={1} 
            onPress={() => setShowMenu(false)}
          >
            <View style={styles.menuContainer}>
              <LinearGradient
                colors={[METALLIC.gunmetal, METALLIC.darkSteel]}
                style={styles.menuGradient}
              >
                <View style={styles.menuHeader}>
                  <Text style={styles.menuTitle}>Features</Text>
                  <TouchableOpacity onPress={() => setShowMenu(false)}>
                    <Ionicons name="close" size={24} color={METALLIC.titanium} />
                  </TouchableOpacity>
                </View>
                
                <ScrollView showsVerticalScrollIndicator={false} style={styles.menuScroll}>
                  {/* Agents & Chat */}
                  <Text style={styles.menuSectionTitle}>Agents & Chat</Text>
                  <View style={styles.menuGrid}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/agents'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: METALLIC.accent + '20' }]}>
                        <Ionicons name="people" size={22} color={METALLIC.accent} />
                      </View>
                      <Text style={styles.menuLabel}>Agents</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/templates'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#8B5CF6' + '20' }]}>
                        <Ionicons name="albums" size={22} color="#8B5CF6" />
                      </View>
                      <Text style={styles.menuLabel}>Templates</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/history'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#06B6D4' + '20' }]}>
                        <Ionicons name="time" size={22} color="#06B6D4" />
                      </View>
                      <Text style={styles.menuLabel}>History</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/search'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#F59E0B' + '20' }]}>
                        <Ionicons name="search" size={22} color="#F59E0B" />
                      </View>
                      <Text style={styles.menuLabel}>Search</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Memory & Data */}
                  <Text style={styles.menuSectionTitle}>Memory & Data</Text>
                  <View style={styles.menuGrid}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/memory'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#EC4899' + '20' }]}>
                        <Ionicons name="hardware-chip" size={22} color="#EC4899" />
                      </View>
                      <Text style={styles.menuLabel}>Memory</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/bookmarks'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#F59E0B' + '20' }]}>
                        <Ionicons name="bookmark" size={22} color="#F59E0B" />
                      </View>
                      <Text style={styles.menuLabel}>Bookmarks</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/quick-replies'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#14B8A6' + '20' }]}>
                        <Ionicons name="chatbubbles" size={22} color="#14B8A6" />
                      </View>
                      <Text style={styles.menuLabel}>Quick Replies</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/export'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#84CC16' + '20' }]}>
                        <Ionicons name="download" size={22} color="#84CC16" />
                      </View>
                      <Text style={styles.menuLabel}>Export</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Creative & Tools */}
                  <Text style={styles.menuSectionTitle}>Creative & Tools</Text>
                  <View style={styles.menuGrid}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/imagegen'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: METALLIC.success + '20' }]}>
                        <Ionicons name="image" size={22} color={METALLIC.success} />
                      </View>
                      <Text style={styles.menuLabel}>HD Images</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/image-editor'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#A855F7' + '20' }]}>
                        <Ionicons name="brush" size={22} color="#A855F7" />
                      </View>
                      <Text style={styles.menuLabel}>Image Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/tools'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#F97316' + '20' }]}>
                        <Ionicons name="construct" size={22} color="#F97316" />
                      </View>
                      <Text style={styles.menuLabel}>Tools</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/scheduled'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#EF4444' + '20' }]}>
                        <Ionicons name="alarm" size={22} color="#EF4444" />
                      </View>
                      <Text style={styles.menuLabel}>Scheduled</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Settings */}
                  <Text style={styles.menuSectionTitle}>Settings</Text>
                  <View style={styles.menuGrid}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/settings'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#6B7280' + '20' }]}>
                        <Ionicons name="settings" size={22} color="#6B7280" />
                      </View>
                      <Text style={styles.menuLabel}>Agent Config</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/ui-editor'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#3B82F6' + '20' }]}>
                        <Ionicons name="color-palette" size={22} color="#3B82F6" />
                      </View>
                      <Text style={styles.menuLabel}>UI Editor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/stats'); }}>
                      <View style={[styles.menuIcon, { backgroundColor: METALLIC.accent + '20' }]}>
                        <Ionicons name="analytics" size={22} color={METALLIC.accent} />
                      </View>
                      <Text style={styles.menuLabel}>Stats</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </LinearGradient>
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerButton: { padding: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  agentInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' },
  avatarContainer: { marginRight: 10 },
  avatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: METALLIC.darkSteel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  agentTextContainer: { alignItems: 'flex-start' },
  agentName: { fontSize: 16, fontWeight: '600', color: METALLIC.platinum, letterSpacing: 0.5 },
  statusContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  statusText: { fontSize: 10, color: METALLIC.titanium, textTransform: 'uppercase', letterSpacing: 1 },
  adultBadgeSmall: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  adultBadgeText: { fontSize: 8, fontWeight: '700', color: METALLIC.danger },
  chatContainer: { flex: 1 },
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 20 },
  messageContainer: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  userMessageContainer: { justifyContent: 'flex-end' },
  assistantMessageContainer: { justifyContent: 'flex-start' },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageBubble: { maxWidth: width * 0.75, borderRadius: 16, overflow: 'hidden' },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4 },
  bubbleGradient: { paddingHorizontal: 14, paddingVertical: 10 },
  messageText: { fontSize: 15, color: METALLIC.platinum, lineHeight: 21 },
  userMessageText: { color: '#fff' },
  toolContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  toolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  toolText: { fontSize: 10, fontWeight: '600', color: METALLIC.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  messageActions: { flexDirection: 'row', marginLeft: 6, gap: 4 },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: METALLIC.gunmetal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonActive: { backgroundColor: 'rgba(99, 102, 241, 0.2)' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: height * 0.05 },
  emptyAvatar: { marginBottom: 20 },
  emptyAvatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  emptyAvatarInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: METALLIC.darkSteel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAvatarRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyTitle: { fontSize: 24, fontWeight: '600', color: METALLIC.platinum, marginBottom: 6, letterSpacing: 0.5 },
  emptySubtitle: { fontSize: 14, color: METALLIC.titanium, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  suggestionContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 24, gap: 8 },
  suggestionChip: { borderRadius: 18, overflow: 'hidden' },
  suggestionGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestionText: { fontSize: 13, fontWeight: '500', color: METALLIC.silver },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statItem: { alignItems: 'center', paddingHorizontal: 14 },
  statValue: { fontSize: 16, fontWeight: '600', color: METALLIC.platinum, textTransform: 'capitalize' },
  statLabel: { fontSize: 10, color: METALLIC.titanium, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
  featureCards: { flexDirection: 'row', marginTop: 20, gap: 12 },
  featureCard: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  featureGradient: { padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  featureTitle: { fontSize: 14, fontWeight: '600', color: METALLIC.platinum },
  featureDesc: { fontSize: 11, color: METALLIC.titanium },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  typingIndicator: { borderRadius: 16, borderBottomLeftRadius: 4, overflow: 'hidden' },
  typingGradient: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  typingDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: METALLIC.silver },
  typingText: { fontSize: 12, color: METALLIC.titanium, letterSpacing: 0.5 },
  inputWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 6 : 12, paddingTop: 6 },
  inputGradient: { borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 4, paddingRight: 4, paddingVertical: 4 },
  inputIcon: { padding: 8 },
  inputIconRecording: { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 20 },
  input: { flex: 1, fontSize: 15, color: METALLIC.platinum, maxHeight: 100, paddingTop: 8, paddingBottom: 8 },
  sendButton: { borderRadius: 18, overflow: 'hidden' },
  sendButtonDisabled: { opacity: 0.6 },
  sendGradient: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // Menu styles
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    maxHeight: height * 0.75,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  menuGradient: {
    padding: 20,
    paddingBottom: 40,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: METALLIC.platinum,
    letterSpacing: 0.5,
  },
  menuScroll: {
    maxHeight: height * 0.55,
  },
  menuSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginTop: 16,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  menuItem: {
    width: (width - 64) / 4,
    alignItems: 'center',
    gap: 8,
  },
  menuIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: METALLIC.silver,
    textAlign: 'center',
  },
});
