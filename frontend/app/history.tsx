import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const METALLIC = {
  chrome: '#C0C0C8',
  silver: '#A8A8B0',
  gunmetal: '#2A2A32',
  darkSteel: '#18181D',
  titanium: '#878792',
  platinum: '#E5E5EA',
  accent: '#6366F1',
};

interface Conversation {
  id: string;
  agent_id: string;
  title: string;
  messages: any[];
  created_at: string;
  updated_at: string;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [])
  );

  const loadConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/conversations`);
      // Sort by updated_at descending (most recent first)
      const sorted = res.data.sort((a: Conversation, b: Conversation) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setConversations(sorted);
    } catch (error) {
      console.log('Error loading conversations:', error);
      Alert.alert('Error', 'Failed to load conversations');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadConversations();
  }, []);

  const resumeConversation = (convo: Conversation) => {
    // Navigate back to chat with this conversation
    router.push({
      pathname: '/',
      params: { 
        conversationId: convo.id,
        agentId: convo.agent_id 
      }
    });
  };

  const deleteConversation = async (id: string) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/conversations/${id}`);
              setConversations(prev => prev.filter(c => c.id !== id));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete conversation');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const getPreview = (messages: any[]) => {
    if (messages.length === 0) return 'No messages';
    const lastMessage = messages[messages.length - 1];
    return lastMessage.content?.substring(0, 60) + (lastMessage.content?.length > 60 ? '...' : '');
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>History</Text>
          <View style={styles.headerRight}>
            <Text style={styles.countBadge}>{conversations.length}</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={METALLIC.accent}
              colors={[METALLIC.accent]}
            />
          }
        >
          {isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={48} color={METALLIC.titanium} />
              </View>
              <Text style={styles.emptyTitle}>No Conversations</Text>
              <Text style={styles.emptyText}>Start chatting to see your history here</Text>
            </View>
          ) : (
            conversations.map((convo, index) => (
              <TouchableOpacity
                key={convo.id}
                style={styles.conversationCard}
                activeOpacity={0.7}
                onPress={() => resumeConversation(convo)}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIcon}>
                      <Ionicons name="chatbubble" size={18} color={METALLIC.accent} />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {convo.title}
                      </Text>
                      <Text style={styles.cardDate}>{formatDate(convo.updated_at)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        deleteConversation(convo.id);
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={METALLIC.titanium} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardPreview} numberOfLines={2}>
                    {getPreview(convo.messages)}
                  </Text>
                  <View style={styles.cardFooter}>
                    <View style={styles.messageBadge}>
                      <Ionicons name="chatbubbles-outline" size={12} color={METALLIC.titanium} />
                      <Text style={styles.messageCount}>{convo.messages.length} messages</Text>
                    </View>
                    <View style={styles.resumeBadge}>
                      <Text style={styles.resumeText}>Tap to continue</Text>
                      <Ionicons name="arrow-forward" size={12} color={METALLIC.accent} />
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: METALLIC.platinum, letterSpacing: 0.5 },
  headerRight: { minWidth: 40, alignItems: 'flex-end' },
  countBadge: {
    backgroundColor: METALLIC.accent + '30',
    color: METALLIC.accent,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  scrollContent: { padding: 16 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginBottom: 8 },
  emptyText: { fontSize: 14, color: METALLIC.titanium },
  conversationCard: {
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardGradient: { padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: METALLIC.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: METALLIC.platinum },
  cardDate: { fontSize: 11, color: METALLIC.titanium, marginTop: 2 },
  deleteButton: { padding: 8 },
  cardPreview: { fontSize: 13, color: METALLIC.silver, lineHeight: 20, marginBottom: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  messageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  messageCount: { fontSize: 11, color: METALLIC.titanium },
  resumeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resumeText: { fontSize: 11, color: METALLIC.accent, fontWeight: '500' },
});
