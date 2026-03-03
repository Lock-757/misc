import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { useAuth, getStoredToken } from '../context/AuthContext';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ADMIN_SECRET = 'forge_master_2025';

const C = {
  bg: '#0A0A0F',
  card: '#14141C',
  border: '#1E1E2A',
  accent: '#8B5CF6',
  accentDark: '#6D28D9',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  text: '#E5E5EA',
  muted: '#6B7280',
  silver: '#A8A8B0',
  chrome: '#C0C0C8',
  gunmetal: '#2A2A32',
};

const VIDEO_SIZES = [
  { id: '1280x720', label: 'HD', desc: '1280x720', icon: 'tv-outline' },
  { id: '1792x1024', label: 'Wide', desc: '1792x1024', icon: 'expand-outline' },
  { id: '1024x1792', label: 'Portrait', desc: '1024x1792', icon: 'phone-portrait-outline' },
  { id: '1024x1024', label: 'Square', desc: '1024x1024', icon: 'square-outline' },
];

const VIDEO_DURATIONS = [
  { id: 4, label: '4s', desc: 'Quick', icon: 'flash-outline' },
  { id: 8, label: '8s', desc: 'Standard', icon: 'time-outline' },
  { id: 12, label: '12s', desc: 'Extended', icon: 'hourglass-outline' },
];

const VIDEO_MODELS = [
  { id: 'sora-2', label: 'Sora 2', desc: 'Fast & quality' },
  { id: 'sora-2-pro', label: 'Sora 2 Pro', desc: 'Highest quality' },
];

interface GeneratedVideo {
  id: string;
  prompt: string;
  video_base64: string;
  size: string;
  duration: number;
  created_at: string;
}

export default function VideoGenScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [selectedSize, setSelectedSize] = useState('1280x720');
  const [selectedDuration, setSelectedDuration] = useState(4);
  const [selectedModel, setSelectedModel] = useState('sora-2');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);
  const [previewVideo, setPreviewVideo] = useState<GeneratedVideo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Load videos for both regular auth and admin users
    const checkAndLoadVideos = async () => {
      const token = await getStoredToken();
      const isAdminLoggedIn = Platform.OS === 'web' 
        ? localStorage.getItem('forge_admin') === 'true'
        : false;
      
      if (token || isAdminLoggedIn) {
        loadVideos();
      }
    };
    checkAndLoadVideos();
  }, [isAuthenticated]);

  // Progress simulation during generation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev;
          return prev + Math.random() * 2;
        });
      }, 2000);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const loadVideos = async () => {
    try {
      let token = await getStoredToken();
      const headers: any = {};
      
      // Check for admin login
      const isAdminLoggedIn = Platform.OS === 'web' 
        ? localStorage.getItem('forge_admin') === 'true'
        : false;
      
      console.log('loadVideos - token:', token ? 'exists' : 'null', 'isAdmin:', isAdminLoggedIn);
      
      if (!token && !isAdminLoggedIn) {
        console.log('loadVideos - not authenticated, skipping');
        return;
      }
      
      if (isAdminLoggedIn) {
        headers['X-Admin-Key'] = ADMIN_SECRET;
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      console.log('loadVideos - calling API with headers:', Object.keys(headers));
      const res = await axios.get(`${API_URL}/api/generated-videos`, { headers });
      console.log('loadVideos - response:', res.data?.length, 'videos');
      setGeneratedVideos(res.data || []);
    } catch (error) {
      console.log('Error loading videos:', error);
    }
  };

  const generateVideo = async () => {
    setErrorMessage(null);
    
    if (!prompt.trim()) {
      setErrorMessage('Please enter a prompt');
      return;
    }

    setIsGenerating(true);

    try {
      // Check for regular token first
      let token = await getStoredToken();
      
      // If no token, check if admin is logged in
      if (!token) {
        const isAdminLoggedIn = Platform.OS === 'web' 
          ? localStorage.getItem('forge_admin') === 'true'
          : false;
        
        if (isAdminLoggedIn) {
          // Use admin secret as auth header for admin users
          token = ADMIN_SECRET;
        }
      }
      
      if (!token) {
        setErrorMessage('Please log in to generate videos');
        setIsGenerating(false);
        return;
      }

      console.log('Starting video generation...');
      const response = await axios.post(
        `${API_URL}/api/generate-video`,
        {
          prompt: prompt.trim(),
          size: selectedSize,
          duration: selectedDuration,
          model: selectedModel,
        },
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'X-Admin-Key': token === ADMIN_SECRET ? ADMIN_SECRET : ''
          },
          timeout: 700000, // 11+ minutes for video generation
        }
      );

      setGeneratedVideos(prev => [response.data, ...prev]);
      setPrompt('');
      Keyboard.dismiss();
    } catch (error: any) {
      console.error('Video generation error:', error);
      const message = error.response?.data?.detail || 'Failed to generate video';
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadVideo = async (video: GeneratedVideo) => {
    try {
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = `data:video/mp4;base64,${video.video_base64}`;
        link.download = `aurora-video-${video.id.slice(0, 8)}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('Success', 'Video download started');
      } else {
        try {
          const FileSystem = require('expo-file-system');
          const fileUri = `${FileSystem.cacheDirectory}aurora-video-${video.id.slice(0, 8)}.mp4`;
          await FileSystem.writeAsStringAsync(fileUri, video.video_base64, {
            encoding: 'base64',
          });
          Alert.alert('Saved', 'Video saved to cache. Open Files app to view.');
        } catch (nativeErr) {
          Alert.alert('Info', 'Video download completed.');
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to download video.');
    }
  };

  const deleteVideo = async (videoId: string) => {
    Alert.alert('Delete Video', 'Are you sure you want to delete this video?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await getStoredToken();
            await axios.delete(`${API_URL}/api/generated-videos/${videoId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            setGeneratedVideos(prev => prev.filter(v => v.id !== videoId));
            setPreviewVideo(null);
          } catch (error) {
            Alert.alert('Error', 'Failed to delete video');
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} data-testid="video-back-btn">
            <Ionicons name="chevron-back" size={26} color={C.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Video Generation</Text>
            <Text style={styles.headerSub}>Powered by Sora 2</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => Keyboard.dismiss()}
        >
            {/* Prompt Input */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Describe Your Video</Text>
              <View style={styles.promptContainer}>
                <TextInput
                  style={[styles.promptInput, { flex: 1 }]}
                  placeholder="A cat playing piano in a jazz club..."
                  placeholderTextColor={C.muted}
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  maxLength={500}
                  editable={true}
                  selectTextOnFocus={true}
                  data-testid="video-prompt-input"
                />
                <Text style={styles.charCount}>{prompt.length}/500</Text>
              </View>
            </View>

            {/* Video Size */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resolution</Text>
              <View style={styles.optionsGrid}>
                {VIDEO_SIZES.map(size => (
                  <TouchableOpacity
                    key={size.id}
                    style={[styles.optionCard, selectedSize === size.id && styles.optionCardActive]}
                    onPress={() => setSelectedSize(size.id)}
                    data-testid={`video-size-${size.id}`}
                  >
                    <Ionicons
                      name={size.icon as any}
                      size={20}
                      color={selectedSize === size.id ? C.accent : C.muted}
                    />
                    <Text style={[styles.optionLabel, selectedSize === size.id && styles.optionLabelActive]}>
                      {size.label}
                    </Text>
                    <Text style={styles.optionDesc}>{size.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Duration */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Duration</Text>
              <View style={styles.optionsRow}>
                {VIDEO_DURATIONS.map(dur => (
                  <TouchableOpacity
                    key={dur.id}
                    style={[styles.durationCard, selectedDuration === dur.id && styles.durationCardActive]}
                    onPress={() => setSelectedDuration(dur.id)}
                    data-testid={`video-duration-${dur.id}`}
                  >
                    <Ionicons
                      name={dur.icon as any}
                      size={18}
                      color={selectedDuration === dur.id ? '#fff' : C.muted}
                    />
                    <Text style={[styles.durationLabel, selectedDuration === dur.id && styles.durationLabelActive]}>
                      {dur.label}
                    </Text>
                    <Text style={[styles.durationDesc, selectedDuration === dur.id && { color: C.text }]}>
                      {dur.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Model Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Model</Text>
              <View style={styles.modelRow}>
                {VIDEO_MODELS.map(model => (
                  <TouchableOpacity
                    key={model.id}
                    style={[styles.modelCard, selectedModel === model.id && styles.modelCardActive]}
                    onPress={() => setSelectedModel(model.id)}
                    data-testid={`video-model-${model.id}`}
                  >
                    <Text style={[styles.modelLabel, selectedModel === model.id && styles.modelLabelActive]}>
                      {model.label}
                    </Text>
                    <Text style={styles.modelDesc}>{model.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Error Message */}
            {errorMessage && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#EF4444" />
                <Text style={styles.errorText}>{errorMessage}</Text>
                <TouchableOpacity onPress={() => setErrorMessage(null)}>
                  <Ionicons name="close" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            )}

            {/* Generate Button */}
            <TouchableOpacity
              style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
              onPress={generateVideo}
              disabled={isGenerating}
              data-testid="video-generate-btn"
            >
              <LinearGradient
                colors={isGenerating ? [C.gunmetal, C.card] : [C.accent, C.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.generateGradient}
              >
                {isGenerating ? (
                  <View style={styles.generatingContainer}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.generatingText}>Generating... {Math.round(progress)}%</Text>
                    <Text style={styles.generatingHint}>This may take 2-5 minutes</Text>
                  </View>
                ) : (
                  <>
                    <Ionicons name="videocam" size={22} color="#fff" />
                    <Text style={styles.generateText}>Generate Video</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Progress Bar */}
            {isGenerating && (
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${progress}%` }]} />
              </View>
            )}

            {/* Generated Videos */}
            {generatedVideos.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your Videos ({generatedVideos.length})</Text>
                {generatedVideos.map(video => (
                  <TouchableOpacity
                    key={video.id}
                    style={styles.videoCard}
                    onPress={() => setPreviewVideo(video)}
                    data-testid={`video-card-${video.id}`}
                  >
                    <View style={styles.videoIcon}>
                      <Ionicons name="play-circle" size={32} color={C.accent} />
                    </View>
                    <View style={styles.videoInfo}>
                      <Text style={styles.videoPrompt} numberOfLines={2}>
                        {video.prompt}
                      </Text>
                      <Text style={styles.videoMeta}>
                        {video.size} · {video.duration}s · {formatDate(video.created_at)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.videoAction}
                      onPress={() => downloadVideo(video)}
                      data-testid={`video-download-${video.id}`}
                    >
                      <Ionicons name="download-outline" size={20} color={C.success} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.videoAction}
                      onPress={() => deleteVideo(video.id)}
                      data-testid={`video-delete-${video.id}`}
                    >
                      <Ionicons name="trash-outline" size={20} color={C.danger} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Empty State */}
            {!isGenerating && generatedVideos.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="film-outline" size={48} color={C.muted} />
                <Text style={styles.emptyTitle}>No Videos Yet</Text>
                <Text style={styles.emptyText}>
                  Enter a prompt and generate your first AI video
                </Text>
              </View>
            )}
        </ScrollView>

        {/* Full Screen Loading Overlay */}
        {isGenerating && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={styles.loadingTitle}>Generating Your Video</Text>
              <Text style={styles.loadingPercent}>{Math.round(progress)}%</Text>
              <View style={styles.loadingProgressContainer}>
                <View style={[styles.loadingProgressBar, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.loadingHint}>This typically takes 2-5 minutes</Text>
              <Text style={styles.loadingSubHint}>Please don't close this page</Text>
            </View>
          </View>
        )}

        {/* Video Preview Modal */}
        <Modal visible={!!previewVideo} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {previewVideo?.prompt}
                </Text>
                <TouchableOpacity onPress={() => setPreviewVideo(null)} data-testid="video-preview-close">
                  <Ionicons name="close" size={24} color={C.text} />
                </TouchableOpacity>
              </View>
              {previewVideo && (
                <View style={styles.videoPreview}>
                  {Platform.OS === 'web' ? (
                    <video
                      src={`data:video/mp4;base64,${previewVideo.video_base64}`}
                      controls
                      autoPlay
                      style={{ width: '100%', maxHeight: 400, borderRadius: 12 }}
                    />
                  ) : (
                    <View style={styles.nativeVideoPlaceholder}>
                      <Ionicons name="play-circle" size={64} color={C.accent} />
                      <Text style={styles.nativeVideoText}>
                        Download to view on device
                      </Text>
                    </View>
                  )}
                </View>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalActionBtn}
                  onPress={() => previewVideo && downloadVideo(previewVideo)}
                >
                  <Ionicons name="download" size={20} color={C.success} />
                  <Text style={[styles.modalActionText, { color: C.success }]}>Download</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalActionBtn}
                  onPress={() => previewVideo && deleteVideo(previewVideo.id)}
                >
                  <Ionicons name="trash" size={20} color={C.danger} />
                  <Text style={[styles.modalActionText, { color: C.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    borderBottomColor: C.border,
  },
  backButton: { padding: 8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  headerSub: { color: C.accent, fontSize: 11, fontWeight: '600', marginTop: 2 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  promptContainer: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  promptInput: {
    color: C.text,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 8,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  optionCard: {
    width: '48%',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    marginBottom: 10,
  },
  optionCardActive: {
    borderColor: C.accent,
    backgroundColor: C.accent + '15',
  },
  optionLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  optionLabelActive: { color: C.accent },
  optionDesc: { color: C.muted, fontSize: 11 },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  durationCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  durationCardActive: {
    borderColor: C.accent,
    backgroundColor: C.accent,
  },
  durationLabel: { color: C.text, fontSize: 16, fontWeight: '700' },
  durationLabelActive: { color: '#fff' },
  durationDesc: { color: C.muted, fontSize: 10 },
  modelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modelCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modelCardActive: {
    borderColor: C.accent,
    backgroundColor: C.accent + '20',
  },
  modelLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  modelLabelActive: { color: C.accent },
  modelDesc: { color: C.muted, fontSize: 11 },
  generateButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 16,
  },
  generateButtonDisabled: { opacity: 0.8 },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  generateText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  generatingContainer: { alignItems: 'center', gap: 4 },
  generatingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  generatingHint: { color: C.silver, fontSize: 11 },
  progressContainer: {
    height: 4,
    backgroundColor: C.card,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressBar: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 2,
  },
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  videoIcon: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: C.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  videoInfo: { flex: 1 },
  videoPrompt: { color: C.text, fontSize: 13, fontWeight: '500' },
  videoMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  videoAction: { padding: 8 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '600' },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: C.card,
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: { color: C.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
  videoPreview: {
    padding: 16,
    alignItems: 'center',
  },
  nativeVideoPlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: C.bg,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  nativeVideoText: { color: C.muted, fontSize: 14 },
  modalActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalActionText: { fontSize: 14, fontWeight: '600' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.accent,
    width: '85%',
    maxWidth: 320,
  },
  loadingTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  loadingPercent: {
    color: C.accent,
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 16,
  },
  loadingProgressContainer: {
    width: '100%',
    height: 8,
    backgroundColor: C.gunmetal,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  loadingProgressBar: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 4,
  },
  loadingHint: {
    color: C.silver,
    fontSize: 14,
    marginBottom: 4,
  },
  loadingSubHint: {
    color: C.muted,
    fontSize: 12,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: '#DC2626',
    fontSize: 14,
    marginLeft: 8,
    marginRight: 8,
  },
});
