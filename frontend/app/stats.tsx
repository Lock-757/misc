import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const METALLIC = {
  chrome: '#C0C0C8',
  silver: '#A8A8B0',
  gunmetal: '#2A2A32',
  darkSteel: '#18181D',
  titanium: '#878792',
  platinum: '#E5E5EA',
  accent: '#6366F1',
  success: '#10B981',
  warning: '#F59E0B',
};

interface Stats {
  totalConversations: number;
  totalMessages: number;
  totalImages: number;
  totalTools: number;
  avgMessagesPerConvo: number;
  mostUsedModel: string;
}

export default function StatsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalConversations: 0,
    totalMessages: 0,
    totalImages: 0,
    totalTools: 0,
    avgMessagesPerConvo: 0,
    mostUsedModel: 'grok-3',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Load conversations
      const convosRes = await axios.get(`${API_URL}/api/conversations`);
      const conversations = convosRes.data || [];
      
      // Load images
      const imagesRes = await axios.get(`${API_URL}/api/generated-images`);
      const images = imagesRes.data || [];
      
      // Load agent
      const agentRes = await axios.get(`${API_URL}/api/agents`);
      const agent = agentRes.data[0] || {};
      
      // Calculate stats
      const totalMessages = conversations.reduce((sum: number, c: any) => sum + (c.messages?.length || 0), 0);
      const avgMessages = conversations.length > 0 ? (totalMessages / conversations.length).toFixed(1) : 0;
      
      setStats({
        totalConversations: conversations.length,
        totalMessages,
        totalImages: images.length,
        totalTools: agent.tools?.length || 0,
        avgMessagesPerConvo: parseFloat(avgMessages as string),
        mostUsedModel: agent.model || 'grok-3',
      });
    } catch (error) {
      console.log('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const StatCard = ({ icon, label, value, color, subtitle }: { icon: string; label: string; value: string | number; color: string; subtitle?: string }) => (
    <View style={styles.statCard}>
      <LinearGradient
        colors={[`${color}15`, `${color}08`]}
        style={styles.statGradient}
      >
        <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon as any} size={24} color={color} />
        </View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
      </LinearGradient>
    </View>
  );

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Statistics</Text>
          <TouchableOpacity onPress={loadStats} style={styles.refreshButton}>
            <Ionicons name="refresh" size={22} color={METALLIC.silver} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Usage Stats */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Usage</Text>
            <View style={styles.statsGrid}>
              <StatCard
                icon="chatbubbles"
                label="Conversations"
                value={stats.totalConversations}
                color={METALLIC.accent}
              />
              <StatCard
                icon="chatbox"
                label="Messages"
                value={stats.totalMessages}
                color={METALLIC.success}
              />
              <StatCard
                icon="image"
                label="Images"
                value={stats.totalImages}
                color={METALLIC.warning}
              />
              <StatCard
                icon="construct"
                label="Tools"
                value={stats.totalTools}
                color="#EC4899"
              />
            </View>
          </View>

          {/* Performance */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance</Text>
            <View style={styles.perfCard}>
              <LinearGradient
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                style={styles.perfGradient}
              >
                <View style={styles.perfRow}>
                  <View style={styles.perfItem}>
                    <Text style={styles.perfValue}>{stats.avgMessagesPerConvo}</Text>
                    <Text style={styles.perfLabel}>Avg msgs/convo</Text>
                  </View>
                  <View style={styles.perfDivider} />
                  <View style={styles.perfItem}>
                    <Text style={styles.perfValue}>{stats.mostUsedModel.split('-')[0]}</Text>
                    <Text style={styles.perfLabel}>Active model</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/history')}>
                <Ionicons name="time" size={28} color={METALLIC.accent} />
                <Text style={styles.actionLabel}>History</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/imagegen')}>
                <Ionicons name="image" size={28} color={METALLIC.success} />
                <Text style={styles.actionLabel}>Generate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/tools')}>
                <Ionicons name="construct" size={28} color={METALLIC.warning} />
                <Text style={styles.actionLabel}>Tools</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/settings')}>
                <Ionicons name="settings" size={28} color="#EC4899" />
                <Text style={styles.actionLabel}>Settings</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* System Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>System</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Version</Text>
                <Text style={styles.infoValue}>1.0.0</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>API Status</Text>
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Connected</Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Features</Text>
                <Text style={styles.infoValue}>Chat, Images, Voice, Tools</Text>
              </View>
            </View>
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const cardWidth = (width - 48 - 12) / 2;

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
  refreshButton: { padding: 4 },
  scrollContent: { padding: 16 },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { width: cardWidth, borderRadius: 14, overflow: 'hidden' },
  statGradient: {
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: { fontSize: 28, fontWeight: '700', color: METALLIC.platinum },
  statLabel: { fontSize: 12, color: METALLIC.titanium, marginTop: 4 },
  statSubtitle: { fontSize: 10, color: METALLIC.titanium, marginTop: 2 },
  perfCard: { borderRadius: 14, overflow: 'hidden' },
  perfGradient: {
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
  },
  perfRow: { flexDirection: 'row', alignItems: 'center' },
  perfItem: { flex: 1, alignItems: 'center' },
  perfValue: { fontSize: 24, fontWeight: '700', color: METALLIC.platinum, textTransform: 'capitalize' },
  perfLabel: { fontSize: 12, color: METALLIC.titanium, marginTop: 4 },
  perfDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.1)' },
  actionsGrid: { flexDirection: 'row', gap: 12 },
  actionCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionLabel: { fontSize: 12, color: METALLIC.titanium },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: { fontSize: 14, color: METALLIC.titanium },
  infoValue: { fontSize: 14, color: METALLIC.platinum },
  infoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: METALLIC.success },
  statusText: { fontSize: 14, color: METALLIC.success },
  bottomSpacing: { height: 40 },
});
