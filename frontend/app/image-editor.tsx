import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

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
  danger: '#EF4444',
  warning: '#F59E0B',
};

// Content filter system
const BLOCKED_TERMS_USER = [
  'nude', 'naked', 'explicit', 'pornographic', 'genitals', 'sexual intercourse',
  'xxx', 'nsfw', 'erotic pose', 'fully nude'
];

const ALLOWED_ADULT_THEMES = [
  'provocative', 'sensual', 'lingerie', 'underwear', 'bikini', 'swimsuit',
  'seductive', 'alluring', 'suggestive', 'mature themes', 'adult themes',
  'smoking', 'alcohol', 'tattoos', 'gothic', 'dark themes', 'violence', 'blood',
  'horror', 'scary', 'weapons', 'combat', 'fighting'
];

const STYLE_PRESETS = [
  { id: 'enhance', label: 'Enhance', prompt: 'enhance quality, improve details, sharper' },
  { id: 'artistic', label: 'Artistic', prompt: 'artistic style, painterly, creative' },
  { id: 'cinematic', label: 'Cinematic', prompt: 'cinematic lighting, dramatic, movie poster' },
  { id: 'vintage', label: 'Vintage', prompt: 'vintage style, retro, film grain' },
  { id: 'fantasy', label: 'Fantasy', prompt: 'fantasy style, magical, ethereal' },
  { id: 'cyberpunk', label: 'Cyberpunk', prompt: 'cyberpunk style, neon, futuristic' },
  { id: 'anime', label: 'Anime', prompt: 'anime style, japanese animation' },
  { id: 'realistic', label: 'Realistic', prompt: 'photorealistic, hyperrealistic, detailed' },
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

  // Content filtering function
  const filterPrompt = (prompt: string): { allowed: boolean; filtered: string; reason?: string } => {
    // Admin with bypass enabled = no filtering
    if (isAdmin && bypassFilters) {
      return { allowed: true, filtered: prompt };
    }

    const lowerPrompt = prompt.toLowerCase();
    
    // Check for hard-blocked terms (unless admin)
    if (!isAdmin) {
      for (const term of BLOCKED_TERMS_USER) {
        if (lowerPrompt.includes(term)) {
          return { 
            allowed: false, 
            filtered: prompt, 
            reason: `Content contains restricted terms. Explicit nudity is not available. Try using: lingerie, bikini, or suggestive poses instead.` 
          };
        }
      }
    }

    return { allowed: true, filtered: prompt };
  };

  const generateWithPrompt = async () => {
    if (!editPrompt.trim()) {
      Alert.alert('Error', 'Please enter an edit prompt');
      return;
    }

    // Apply content filter
    const filterResult = filterPrompt(editPrompt);
    if (!filterResult.allowed) {
      Alert.alert('Content Restricted', filterResult.reason);
      return;
    }

    setIsGenerating(true);
    
    try {
      // Combine style preset with user prompt
      let fullPrompt = filterResult.filtered;
      if (selectedStyle) {
        const style = STYLE_PRESETS.find(s => s.id === selectedStyle);
        if (style) {
          fullPrompt = `${fullPrompt}, ${style.prompt}`;
        }
      }

      // If we have an existing image, describe editing it
      if (imageUri) {
        fullPrompt = `Create a variation: ${fullPrompt}`;
      }

      const response = await axios.post(`${API_URL}/api/generate-image`, {
        agent_id: 'editor',
        prompt: fullPrompt,
        size: '1024x1024',
        quality: 'hd',
        is_admin: isAdmin && bypassFilters,
      });

      if (response.data.image_data) {
        const newUri = `data:image/png;base64,${response.data.image_data}`;
        if (imageUri) {
          setGenerationHistory(prev => [...prev, imageUri]);
        }
        setImageUri(newUri);
      } else if (response.data.image_url) {
        if (imageUri) {
          setGenerationHistory(prev => [...prev, imageUri]);
        }
        setImageUri(response.data.image_url);
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
      setSelectedStyle(styleId);
      if (editPrompt) {
        setEditPrompt(`${editPrompt}, ${style.prompt}`);
      } else {
        setEditPrompt(style.prompt);
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

  // Empty state - no image
  if (!imageUri && !params.imageBase64 && !params.imageUrl) {
    return (
      <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>AI Image Editor</Text>
            <View style={styles.headerRight}>
              {isAdmin && (
                <TouchableOpacity onPress={() => setShowAdminPanel(true)} style={styles.headerButton}>
                  <Ionicons name="shield" size={22} color={METALLIC.warning} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Create from scratch */}
          <ScrollView style={styles.createContainer}>
            <Text style={styles.createTitle}>Create New Image</Text>
            <Text style={styles.createSubtitle}>Describe what you want to generate</Text>

            <View style={styles.promptContainer}>
              <TextInput
                style={styles.promptInput}
                value={editPrompt}
                onChangeText={setEditPrompt}
                placeholder="Describe your image..."
                placeholderTextColor={METALLIC.titanium}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Content info for users */}
            {!isAdmin && (
              <TouchableOpacity style={styles.contentInfoButton} onPress={() => setShowContentInfo(true)}>
                <Ionicons name="information-circle-outline" size={18} color={METALLIC.titanium} />
                <Text style={styles.contentInfoText}>Content guidelines</Text>
              </TouchableOpacity>
            )}

            {/* Style presets */}
            <Text style={styles.sectionTitle}>Style Presets</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.styleRow}>
                {STYLE_PRESETS.map((style) => (
                  <TouchableOpacity
                    key={style.id}
                    style={[styles.styleChip, selectedStyle === style.id && styles.styleChipSelected]}
                    onPress={() => applyStylePreset(style.id)}
                  >
                    <Text style={[styles.styleChipText, selectedStyle === style.id && styles.styleChipTextSelected]}>
                      {style.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Generate button */}
            <TouchableOpacity 
              style={styles.generateButton} 
              onPress={generateWithPrompt}
              disabled={isGenerating}
            >
              <LinearGradient colors={[METALLIC.accent, '#8B5CF6']} style={styles.generateGradient}>
                {isGenerating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={22} color="#fff" />
                    <Text style={styles.generateText}>Generate Image</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>

          {/* Admin Panel Modal */}
          {renderAdminPanel()}
          
          {/* Content Info Modal */}
          {renderContentInfoModal()}
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // With image - editing mode
  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit with AI</Text>
          <View style={styles.headerRight}>
            {isAdmin && (
              <TouchableOpacity onPress={() => setShowAdminPanel(true)} style={styles.headerButton}>
                <Ionicons name="shield" size={22} color={METALLIC.warning} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={shareImage} style={styles.headerButton}>
              <Ionicons name="share-outline" size={22} color={METALLIC.platinum} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Image Preview */}
        <View style={styles.previewContainer}>
          {isGenerating && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={METALLIC.accent} />
              <Text style={styles.processingText}>Generating...</Text>
            </View>
          )}
          <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
        </View>

        {/* Edit Controls */}
        <View style={styles.editControls}>
          {/* Undo/Reset */}
          <View style={styles.undoRow}>
            <TouchableOpacity 
              style={[styles.undoButton, generationHistory.length === 0 && styles.undoButtonDisabled]} 
              onPress={undoGeneration}
              disabled={generationHistory.length === 0}
            >
              <Ionicons name="arrow-undo" size={18} color={generationHistory.length > 0 ? METALLIC.platinum : METALLIC.gunmetal} />
              <Text style={[styles.undoText, generationHistory.length === 0 && styles.undoTextDisabled]}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.undoButton} onPress={resetToOriginal}>
              <Ionicons name="refresh" size={18} color={METALLIC.platinum} />
              <Text style={styles.undoText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Edit Prompt Input */}
          <View style={styles.editInputContainer}>
            <TextInput
              style={styles.editInput}
              value={editPrompt}
              onChangeText={setEditPrompt}
              placeholder="Describe how to modify this image..."
              placeholderTextColor={METALLIC.titanium}
              multiline
            />
            <TouchableOpacity 
              style={styles.editSendButton} 
              onPress={generateWithPrompt}
              disabled={isGenerating || !editPrompt.trim()}
            >
              <LinearGradient 
                colors={editPrompt.trim() ? [METALLIC.accent, '#8B5CF6'] : [METALLIC.gunmetal, METALLIC.gunmetal]} 
                style={styles.editSendGradient}
              >
                <Ionicons name="sparkles" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Quick style buttons */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickStyleScroll}>
            {STYLE_PRESETS.slice(0, 5).map((style) => (
              <TouchableOpacity
                key={style.id}
                style={styles.quickStyleChip}
                onPress={() => {
                  setEditPrompt(style.prompt);
                  setSelectedStyle(style.id);
                }}
              >
                <Text style={styles.quickStyleText}>{style.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Admin Panel Modal */}
        {renderAdminPanel()}
        
        {/* Content Info Modal */}
        {renderContentInfoModal()}
      </SafeAreaView>
    </LinearGradient>
  );

  function renderAdminPanel() {
    if (!isAdmin) return null;
    
    return (
      <Modal visible={showAdminPanel} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAdminPanel(false)}>
          <View style={styles.adminPanel}>
            <Text style={styles.adminTitle}>Admin Controls</Text>
            <Text style={styles.adminSubtitle}>These controls are only visible to you</Text>
            
            <TouchableOpacity 
              style={styles.adminOption}
              onPress={() => setBypassFilters(!bypassFilters)}
            >
              <View style={styles.adminOptionInfo}>
                <Ionicons name="shield-off" size={22} color={bypassFilters ? METALLIC.danger : METALLIC.titanium} />
                <View>
                  <Text style={styles.adminOptionTitle}>Bypass Content Filters</Text>
                  <Text style={styles.adminOptionDesc}>
                    {bypassFilters ? 'All restrictions disabled' : 'Standard restrictions active'}
                  </Text>
                </View>
              </View>
              <View style={[styles.toggle, bypassFilters && styles.toggleActive]}>
                <View style={[styles.toggleKnob, bypassFilters && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>

            <View style={styles.adminDivider} />
            
            <Text style={styles.adminNote}>
              When bypass is enabled, you can generate any content including explicit adult material.
              This setting does not affect other users.
            </Text>

            <TouchableOpacity style={styles.adminCloseButton} onPress={() => setShowAdminPanel(false)}>
              <Text style={styles.adminCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }

  function renderContentInfoModal() {
    return (
      <Modal visible={showContentInfo} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowContentInfo(false)}>
          <View style={styles.contentInfoModal}>
            <Text style={styles.contentInfoTitle}>Content Guidelines</Text>
            
            <View style={styles.contentSection}>
              <View style={styles.contentSectionHeader}>
                <Ionicons name="checkmark-circle" size={20} color={METALLIC.success} />
                <Text style={styles.contentSectionTitle}>Allowed Content</Text>
              </View>
              <Text style={styles.contentSectionText}>
                • Lingerie, bikinis, swimwear{'\n'}
                • Suggestive or sensual poses{'\n'}
                • Mature/adult themes{'\n'}
                • Artistic nudity implications{'\n'}
                • Dark themes, horror, action{'\n'}
                • Alcohol, smoking references
              </Text>
            </View>

            <View style={styles.contentSection}>
              <View style={styles.contentSectionHeader}>
                <Ionicons name="close-circle" size={20} color={METALLIC.danger} />
                <Text style={styles.contentSectionTitle}>Not Available</Text>
              </View>
              <Text style={styles.contentSectionText}>
                • Explicit nudity{'\n'}
                • Sexual content{'\n'}
                • Pornographic material
              </Text>
            </View>

            <Text style={styles.contentNote}>
              For creative artistic expression, try descriptive terms like 
              "artistic", "sensual", "alluring", or "provocative".
            </Text>

            <TouchableOpacity style={styles.contentCloseButton} onPress={() => setShowContentInfo(false)}>
              <Text style={styles.contentCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }
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
  headerButton: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: METALLIC.platinum },
  headerRight: { flexDirection: 'row', gap: 12 },
  
  // Create mode styles
  createContainer: { flex: 1, padding: 20 },
  createTitle: { fontSize: 24, fontWeight: '700', color: METALLIC.platinum, marginBottom: 8 },
  createSubtitle: { fontSize: 14, color: METALLIC.titanium, marginBottom: 24 },
  promptContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  promptInput: {
    padding: 16,
    fontSize: 15,
    color: METALLIC.platinum,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  contentInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  contentInfoText: { fontSize: 13, color: METALLIC.titanium },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  styleRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  styleChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  styleChipSelected: { backgroundColor: METALLIC.accent + '30', borderColor: METALLIC.accent },
  styleChipText: { fontSize: 13, fontWeight: '500', color: METALLIC.titanium },
  styleChipTextSelected: { color: METALLIC.accent },
  generateButton: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  generateText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  // Edit mode styles
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    maxHeight: width,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  processingText: { marginTop: 12, fontSize: 14, color: METALLIC.titanium },
  previewImage: { width: '100%', height: '100%' },
  editControls: { padding: 16 },
  undoRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
  },
  undoButtonDisabled: { opacity: 0.5 },
  undoText: { fontSize: 13, color: METALLIC.platinum },
  undoTextDisabled: { color: METALLIC.gunmetal },
  editInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  editInput: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: METALLIC.platinum,
    maxHeight: 100,
  },
  editSendButton: { padding: 8 },
  editSendGradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStyleScroll: { marginTop: 4 },
  quickStyleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
  },
  quickStyleText: { fontSize: 12, color: METALLIC.silver },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  adminPanel: {
    backgroundColor: METALLIC.darkSteel,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  adminTitle: { fontSize: 20, fontWeight: '700', color: METALLIC.platinum, marginBottom: 4 },
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
  adminDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 16 },
  adminNote: { fontSize: 12, color: METALLIC.titanium, lineHeight: 18 },
  adminCloseButton: {
    marginTop: 20,
    padding: 14,
    backgroundColor: METALLIC.gunmetal,
    borderRadius: 12,
    alignItems: 'center',
  },
  adminCloseText: { fontSize: 15, fontWeight: '600', color: METALLIC.platinum },

  // Content info modal
  contentInfoModal: {
    backgroundColor: METALLIC.darkSteel,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  contentInfoTitle: { fontSize: 20, fontWeight: '700', color: METALLIC.platinum, marginBottom: 20 },
  contentSection: { marginBottom: 16 },
  contentSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  contentSectionTitle: { fontSize: 14, fontWeight: '600', color: METALLIC.platinum },
  contentSectionText: { fontSize: 13, color: METALLIC.titanium, lineHeight: 20, paddingLeft: 28 },
  contentNote: {
    fontSize: 12,
    color: METALLIC.titanium,
    fontStyle: 'italic',
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  contentCloseButton: {
    marginTop: 20,
    padding: 14,
    backgroundColor: METALLIC.accent,
    borderRadius: 12,
    alignItems: 'center',
  },
  contentCloseText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
