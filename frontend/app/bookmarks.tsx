import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
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
  warning: '#F59E0B',
};

interface Bookmark {
  id: string;
  conversation_id: string;
  message_id: string;
  note: string;
  created_at: string;
}

export default function BookmarksScreen() {
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/bookmarks`);
      setBookmarks(res.data);
    } catch (error) {
      console.log('Error loading bookmarks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteBookmark = async (id: string) => {
    Alert.alert('Remove Bookmark', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/api/bookmarks/${id}`);
            loadBookmarks();
          } catch (error) {
            Alert.alert('Error', 'Failed to remove bookmark');
          }
        },
      },
    ]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bookmarks</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{bookmarks.length}</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {isLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : bookmarks.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="bookmark-outline" size={48} color={METALLIC.titanium} />
              <Text style={styles.emptyTitle}>No Bookmarks</Text>
              <Text style={styles.emptyText}>Long-press messages in chat to bookmark them</Text>
            </View>
          ) : (
            bookmarks.map(bookmark => (
              <View key={bookmark.id} style={styles.bookmarkCard}>
                <View style={styles.bookmarkIcon}>
                  <Ionicons name="bookmark" size={20} color={METALLIC.warning} />
                </View>
                <View style={styles.bookmarkContent}>
                  <Text style={styles.bookmarkNote}>{bookmark.note || 'Saved message'}</Text>
                  <Text style={styles.bookmarkDate}>{formatDate(bookmark.created_at)}</Text>
                </View>
                <TouchableOpacity style={styles.deleteButton} onPress={() => deleteBookmark(bookmark.id)}>
                  <Ionicons name="trash-outline" size={18} color={METALLIC.titanium} />
                </TouchableOpacity>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: METALLIC.platinum },
  countBadge: { backgroundColor: METALLIC.warning + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: '600', color: METALLIC.warning },
  scrollContent: { padding: 16 },
  loadingText: { color: METALLIC.titanium, textAlign: 'center', paddingVertical: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: METALLIC.platinum, marginTop: 12 },
  emptyText: { fontSize: 14, color: METALLIC.titanium, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
  bookmarkCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  bookmarkIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: METALLIC.warning + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  bookmarkContent: { flex: 1, marginLeft: 12 },
  bookmarkNote: { fontSize: 15, fontWeight: '500', color: METALLIC.platinum },
  bookmarkDate: { fontSize: 12, color: METALLIC.titanium, marginTop: 2 },
  deleteButton: { padding: 8 },
});
