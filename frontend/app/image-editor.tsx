import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Image,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  Modal,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');
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
  danger: '#EF4444',
  warning: '#F59E0B',
};

const STYLE_PRESETS = [
  { id: 'enhance', label: 'Enhance', icon: 'sparkles', prompt: 'enhance quality, improve details, sharper' },
  { id: 'artistic', label: 'Artistic', icon: 'brush', prompt: 'artistic style, painterly, creative' },
  { id: 'cinematic', label: 'Cinematic', icon: 'film', prompt: 'cinematic lighting, dramatic, movie poster' },
  { id: 'vintage', label: 'Vintage', icon: 'time', prompt: 'vintage style, retro, film grain' },
  { id: 'fantasy', label: 'Fantasy', icon: 'planet', prompt: 'fantasy style, magical, ethereal' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: 'flash', prompt: 'cyberpunk style, neon, futuristic' },
  { id: 'anime', label: 'Anime', icon: 'heart', prompt: 'anime style, japanese animation' },
  { id: 'realistic', label: 'Photo', icon: 'camera', prompt: 'photorealistic, hyperrealistic, detailed' },
];

export default function ImageEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isAdmin } = useAuth();
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [originalUri, setOriginalUri] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [bypassFilters, setBypassFilters] = useState(false);
  const [generationHistory, setGenerationHistory] = useState<string[]>([]);
  const [showContentInfo, setShowContentInfo] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (params.imageBase64) {
      const uri = `data:image/png;base64,${params.imageBase64}`;
      setImageUri(uri);
      setOriginalUri(uri);
    } else if (params.imageUrl) {
      setImageUri(params.imageUrl as string);
      setOriginalUri(params.imageUrl as string);
    }
  }, [params]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const generateWithPrompt = async () => {
    if (!editPrompt.trim()) {
      Alert.alert('Error', 'Please enter a prompt');
      return;
    }

    dismissKeyboard();
    setIsGenerating(true);
    
    try {
      let fullPrompt = editPrompt;
      if (selectedStyle) {
        const style = STYLE_PRESETS.find(s => s.id === selectedStyle);
        if (style) {
          fullPrompt = `${fullPrompt}, ${style.prompt}`;
        }
      }

      const response = await axios.post(`${API_URL}/api/generate-image`, {
        agent_id: 'editor',
        prompt: fullPrompt,
        size: '1024x1024',
        quality: 'hd',
        is_admin: isAdmin && bypassFilters,
      });

      if (response.data.image_base64) {
        const newUri = `data:image/png;base64,${response.data.image_base64}`;
        if (imageUri) {
          setGenerationHistory(prev => [...prev, imageUri]);
        }
        setImageUri(newUri);
        setEditPrompt('');
      } else if (response.data.image_url) {
        if (imageUri) {
          setGenerationHistory(prev => [...prev, imageUri]);
        }
        setImageUri(response.data.image_url);
        setEditPrompt('');
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  const applyStylePreset = (styleId: string) => {
    const style = STYLE_PRESETS.find(s => s.id === styleId);
    if (style) {
      if (selectedStyle === styleId) {
        setSelectedStyle(null);
      } else {
        setSelectedStyle(styleId);
        if (!editPrompt) {
          setEditPrompt(style.prompt);
        }
      }
    }
  };

  const undoGeneration = () => {
    if (generationHistory.length > 0) {
      const previousUri = generationHistory[generationHistory.length - 1];
      setImageUri(previousUri);
      setGenerationHistory(prev => prev.slice(0, -1));
    }
  };

  const resetToOriginal = () => {
    if (originalUri) {
      setImageUri(originalUri);
      setGenerationHistory([]);
    }
  };

  const shareImage = async () => {
    if (!imageUri) return;

    try {
      let fileUri: string;
      
      if (imageUri.startsWith('data:')) {
        const base64Data = imageUri.split(',')[1];
        fileUri = FileSystem.cacheDirectory + 'shared_image.png';
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        fileUri = imageUri;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing is not available');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to share image');
    }
  };

  const renderAdminPanel = () => {
    if (!isAdmin) return null;
    
    return (
      <Modal visible={showAdminPanel} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowAdminPanel(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.adminPanel}>
                <Text style={styles.adminTitle}>Admin Controls</Text>
                <Text style={styles.adminSubtitle}>Only visible to you</Text>
                
                <TouchableOpacity 
                  style={styles.adminOption}
                  onPress={() => setBypassFilters(!bypassFilters)}
                >
                  <View style={styles.adminOptionInfo}>
                    <Ionicons name="shield-off" size={22} color={bypassFilters ? METALLIC.danger : METALLIC.titanium} />
                    <View style={{flex: 1}}>
                      <Text style={styles.adminOptionTitle}>Bypass All Filters</Text>
                      <Text style={styles.adminOptionDesc}>
                        {bypassFilters ? 'UNRESTRICTED MODE' : 'Standard mode'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.toggle, bypassFilters && styles.toggleActive]}>
                    <View style={[styles.toggleKnob, bypassFilters && styles.toggleKnobActive]} />
                  </View>
                </TouchableOpacity>

                {bypassFilters && (
                  <View style={styles.adminWarning}>
                    <Ionicons name="warning" size={16} color={METALLIC.warning} />
                    <Text style={styles.adminWarningText}>
                      All content restrictions disabled. Full creative freedom enabled.
                    </Text>
                  </View>
                )}

                <TouchableOpacity style={styles.adminCloseButton} onPress={() => setShowAdminPanel(false)}>
                  <Text style={styles.adminCloseText}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  const renderContentInfo = () => (
    <Modal visible={showContentInfo} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={() => setShowContentInfo(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.contentModal}>
              <Text style={styles.contentTitle}>Content Guidelines</Text>
              
              <View style={styles.contentSection}>
                <Ionicons name="checkmark-circle" size={20} color={METALLIC.success} />
                <View style={{flex: 1, marginLeft: 10}}>
                  <Text style={styles.contentSectionTitle}>Available</Text>
                  <Text style={styles.contentText}>
                    Lingerie, bikinis, suggestive poses, sensual themes, mature content, 
                    action, violence, dark themes, artistic expressions
                  </Text>
                </View>
              </View>

              <View style={styles.contentSection}>
                <Ionicons name="close-circle" size={20} color={METALLIC.danger} />
                <View style={{flex: 1, marginLeft: 10}}>
                  <Text style={styles.contentSectionTitle}>Not Available</Text>
                  <Text style={styles.contentText}>
                    Explicit nudity and sexual content
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={styles.contentCloseButton} onPress={() => setShowContentInfo(false)}>
                <Text style={styles.contentCloseText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
            <View style={styles.innerContainer}>
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
                  <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Image Studio</Text>
                <View style={styles.headerRight}>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => setShowAdminPanel(true)} style={styles.headerButton}>
                      <Ionicons name="shield" size={22} color={bypassFilters ? METALLIC.danger : METALLIC.warning} />
                    </TouchableOpacity>
                  )}
                  {imageUri && (
                    <TouchableOpacity onPress={shareImage} style={styles.headerButton}>
                      <Ionicons name="share-outline" size={22} color={METALLIC.platinum} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Image Preview */}
              {imageUri ? (
                <View style={styles.previewContainer}>
                  {isGenerating && (
                    <View style={styles.loadingOverlay}>
                      <ActivityIndicator size="large" color={METALLIC.accent} />
                      <Text style={styles.loadingText}>Creating magic...</Text>
                    </View>
                  )}
                  <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
                  
                  {/* Undo/Reset buttons */}
                  <View style={styles.imageActions}>
                    <TouchableOpacity 
                      style={[styles.actionButton, generationHistory.length === 0 && styles.actionButtonDisabled]} 
                      onPress={undoGeneration}
                      disabled={generationHistory.length === 0}
                    >
                      <Ionicons name="arrow-undo" size={20} color={generationHistory.length > 0 ? METALLIC.platinum : METALLIC.gunmetal} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={resetToOriginal}>
                      <Ionicons name="refresh" size={20} color={METALLIC.platinum} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.emptyPreview}>
                  <Ionicons name="image-outline" size={60} color={METALLIC.gunmetal} />
                  <Text style={styles.emptyText}>Enter a prompt to create an image</Text>
                </View>
              )}

              {/* Style Presets */}
              <View style={styles.stylesSection}>
                <Text style={styles.sectionLabel}>STYLE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.stylesRow}>
                    {STYLE_PRESETS.map((style) => (
                      <TouchableOpacity
                        key={style.id}
                        style={[styles.styleButton, selectedStyle === style.id && styles.styleButtonSelected]}
                        onPress={() => applyStylePreset(style.id)}
                      >
                        <Ionicons 
                          name={style.icon as any} 
                          size={18} 
                          color={selectedStyle === style.id ? METALLIC.accent : METALLIC.titanium} 
                        />
                        <Text style={[styles.styleLabel, selectedStyle === style.id && styles.styleLabelSelected]}>
                          {style.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Content info for non-admin */}
              {!isAdmin && (
                <TouchableOpacity style={styles.infoButton} onPress={() => setShowContentInfo(true)}>
                  <Ionicons name="information-circle-outline" size={16} color={METALLIC.titanium} />
                  <Text style={styles.infoText}>Content guidelines</Text>
                </TouchableOpacity>
              )}

              {/* Prompt Input */}
              <View style={styles.promptSection}>
                <View style={styles.promptInputContainer}>
                  <TextInput
                    style={styles.promptInput}
                    value={editPrompt}
                    onChangeText={setEditPrompt}
                    placeholder="Describe your image..."
                    placeholderTextColor={METALLIC.titanium}
                    multiline
                    numberOfLines={3}
                    blurOnSubmit={false}
                    returnKeyType="default"
                  />
                </View>
                <TouchableOpacity 
                  style={[styles.generateButton, (!editPrompt.trim() || isGenerating) && styles.generateButtonDisabled]}
                  onPress={generateWithPrompt}
                  disabled={!editPrompt.trim() || isGenerating}
                >
                  <LinearGradient 
                    colors={editPrompt.trim() && !isGenerating ? [METALLIC.accent, '#8B5CF6'] : [METALLIC.gunmetal, METALLIC.gunmetal]}
                    style={styles.generateGradient}
                  >
                    {isGenerating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={20} color="#fff" />
                        <Text style={styles.generateText}>Generate</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
        </KeyboardAvoidingView>

        {renderAdminPanel()}
        {renderContentInfo()}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  innerContainer: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerButton: { padding: 4, minWidth: 32 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: METALLIC.platinum },
  headerRight: { flexDirection: 'row', gap: 8 },
  
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: height * 0.4,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: METALLIC.titanium },
  previewImage: { width: '100%', height: '100%' },
  imageActions: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: { opacity: 0.4 },
  
  emptyPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    maxHeight: height * 0.3,
  },
  emptyText: { marginTop: 12, fontSize: 14, color: METALLIC.titanium },

  stylesSection: { paddingHorizontal: 16, marginBottom: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: METALLIC.titanium,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  stylesRow: { flexDirection: 'row', gap: 10 },
  styleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  styleButtonSelected: {
    backgroundColor: METALLIC.accent + '20',
    borderColor: METALLIC.accent,
  },
  styleLabel: { fontSize: 13, fontWeight: '500', color: METALLIC.titanium },
  styleLabelSelected: { color: METALLIC.accent },

  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  infoText: { fontSize: 12, color: METALLIC.titanium },

  promptSection: { padding: 16, paddingTop: 8 },
  promptInputContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  promptInput: {
    padding: 16,
    fontSize: 15,
    color: METALLIC.platinum,
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  generateButton: { borderRadius: 14, overflow: 'hidden' },
  generateButtonDisabled: { opacity: 0.6 },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  generateText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  adminPanel: {
    backgroundColor: METALLIC.darkSteel,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  adminTitle: { fontSize: 20, fontWeight: '700', color: METALLIC.platinum },
  adminSubtitle: { fontSize: 13, color: METALLIC.titanium, marginBottom: 20 },
  adminOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
  },
  adminOptionInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  adminOptionTitle: { fontSize: 14, fontWeight: '600', color: METALLIC.platinum },
  adminOptionDesc: { fontSize: 12, color: METALLIC.titanium, marginTop: 2 },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: METALLIC.gunmetal,
    padding: 2,
  },
  toggleActive: { backgroundColor: METALLIC.danger },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: METALLIC.titanium,
  },
  toggleKnobActive: { transform: [{ translateX: 22 }], backgroundColor: '#fff' },
  adminWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: METALLIC.warning + '15',
    borderRadius: 10,
  },
  adminWarningText: { flex: 1, fontSize: 12, color: METALLIC.warning, lineHeight: 18 },
  adminCloseButton: {
    marginTop: 20,
    padding: 14,
    backgroundColor: METALLIC.gunmetal,
    borderRadius: 12,
    alignItems: 'center',
  },
  adminCloseText: { fontSize: 15, fontWeight: '600', color: METALLIC.platinum },

  contentModal: {
    backgroundColor: METALLIC.darkSteel,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  contentTitle: { fontSize: 20, fontWeight: '700', color: METALLIC.platinum, marginBottom: 20 },
  contentSection: { flexDirection: 'row', marginBottom: 16 },
  contentSectionTitle: { fontSize: 14, fontWeight: '600', color: METALLIC.platinum, marginBottom: 4 },
  contentText: { fontSize: 13, color: METALLIC.titanium, lineHeight: 20 },
  contentCloseButton: {
    marginTop: 8,
    padding: 14,
    backgroundColor: METALLIC.accent,
    borderRadius: 12,
    alignItems: 'center',
  },
  contentCloseText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
