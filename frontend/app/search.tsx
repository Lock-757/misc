import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
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

interface SearchResult {
  type: string;
  id: string;
  content: string;
  context: string;
  timestamp: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchType, setSearchType] = useState('all');

  const performSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await axios.post(`${API_URL}/api/search`, {
        query: query.trim(),
        search_type: searchType,
      });
      setResults(res.data);
    } catch (error) {
      console.log('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) performSearch();
    }, 500);
    return () => clearTimeout(timer);
  }, [query, searchType]);

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={METALLIC.titanium} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search messages & conversations..."
              placeholderTextColor={METALLIC.titanium}
              autoFocus
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={20} color={METALLIC.titanium} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          {['all', 'messages', 'conversations'].map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.filterTab, searchType === type && styles.filterTabActive]}
              onPress={() => setSearchType(type)}
            >
              <Text style={[styles.filterText, searchType === type && styles.filterTextActive]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {isSearching ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={METALLIC.accent} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : query.length < 2 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search" size={48} color={METALLIC.titanium} />
              <Text style={styles.emptyTitle}>Search Everything</Text>
              <Text style={styles.emptyText}>Find messages, conversations, and more</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={48} color={METALLIC.titanium} />
              <Text style={styles.emptyTitle}>No Results</Text>
              <Text style={styles.emptyText}>Try a different search term</Text>
            </View>
          ) : (
            results.map((result, idx) => (
              <View key={idx} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: result.type === 'message' ? METALLIC.accent + '20' : METALLIC.gunmetal }]}>
                    <Ionicons
                      name={result.type === 'message' ? 'chatbubble' : 'folder'}
                      size={14}
                      color={result.type === 'message' ? METALLIC.accent : METALLIC.titanium}
                    />
                    <Text style={[styles.typeText, { color: result.type === 'message' ? METALLIC.accent : METALLIC.titanium }]}>
                      {result.type}
                    </Text>
                  </View>
                  <Text style={styles.contextText}>{result.context}</Text>
                </View>
                <Text style={styles.resultContent} numberOfLines={3}>{result.content}</Text>
              </View>
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
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 12,
  },
  backButton: { padding: 4 },
  searchContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 16, color: METALLIC.platinum },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  filterTabActive: { backgroundColor: METALLIC.accent + '20' },
  filterText: { fontSize: 13, fontWeight: '500', color: METALLIC.titanium },
  filterTextActive: { color: METALLIC.accent },
  scrollContent: { padding: 16 },
  loadingState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: METALLIC.titanium },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum },
  emptyText: { fontSize: 14, color: METALLIC.titanium },
  resultCard: {
    padding: 14, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  contextText: { fontSize: 12, color: METALLIC.titanium },
  resultContent: { fontSize: 14, color: METALLIC.platinum, lineHeight: 20 },
});
