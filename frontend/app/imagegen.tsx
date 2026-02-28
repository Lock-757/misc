import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
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
  danger: '#EF4444',
};

const IMAGE_SIZES = [
  { id: '1024x1024', label: 'Square', desc: '1024x1024' },
  { id: '1024x1792', label: 'Portrait', desc: '1024x1792' },
  { id: '1792x1024', label: 'Landscape', desc: '1792x1024' },
];

const STYLE_PRESETS = [
  { id: 'photorealistic', label: 'Photorealistic', prompt: 'photorealistic, highly detailed, 8K' },
  { id: 'anime', label: 'Anime', prompt: 'anime style, vibrant colors, detailed' },
  { id: 'digital_art', label: 'Digital Art', prompt: 'digital art, concept art, trending on artstation' },
  { id: 'oil_painting', label: 'Oil Painting', prompt: 'oil painting, classical style, detailed brushwork' },
  { id: 'cyberpunk', label: 'Cyberpunk', prompt: 'cyberpunk style, neon lights, futuristic' },
  { id: 'fantasy', label: 'Fantasy', prompt: 'fantasy art, magical, ethereal lighting' },
];

interface GeneratedImage {
  id: string;
  prompt: string;
  image_base64: string;
  size: string;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
  adult_mode: boolean;
}

export default function ImageGenScreen() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [selectedSize, setSelectedSize] = useState('1024x1024');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load agent
      const agentRes = await axios.get(`${API_URL}/api/agents`);
      if (agentRes.data.length > 0) {
        setAgent(agentRes.data[0]);
      }
      
      // Load generated images
      const imagesRes = await axios.get(`${API_URL}/api/generated-images`);
      setGeneratedImages(imagesRes.data || []);
    } catch (error) {
      console.log('Error loading data:', error);
    }
  };

  const generateImage = async () => {
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a prompt');
      return;
    }

    if (!agent) {
      Alert.alert('Error', 'No agent configured');
      return;
    }

    setIsGenerating(true);

    try {
      // Build enhanced prompt with style
      let enhancedPrompt = prompt.trim();
      if (selectedStyle) {
        const style = STYLE_PRESETS.find(s => s.id === selectedStyle);
        if (style) {
          enhancedPrompt = `${enhancedPrompt}, ${style.prompt}`;
        }
      }

      const response = await axios.post(`${API_URL}/api/generate-image`, {
        agent_id: agent.id,
        prompt: enhancedPrompt,
        size: selectedSize,
        quality: 'hd',
      });

      // Add new image to the top of the list
      setGeneratedImages(prev => [response.data, ...prev]);
      setPrompt('');
      
      Alert.alert('Success', 'Image generated successfully!');
    } catch (error: any) {
      console.error('Image generation error:', error);
      const message = error.response?.data?.detail || 'Failed to generate image';
      Alert.alert('Error', message);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteImage = async (imageId: string) => {
    Alert.alert(
      'Delete Image',
      'Are you sure you want to delete this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/generated-images/${imageId}`);
              setGeneratedImages(prev => prev.filter(img => img.id !== imageId));
              setPreviewImage(null);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete image');
            }
          },
        },
      ]
    );
  };

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Image Generation</Text>
          <View style={styles.headerRight}>
            {agent?.adult_mode && (
              <View style={styles.adultBadge}>
                <Ionicons name="warning" size={12} color={METALLIC.danger} />
                <Text style={styles.adultText}>18+</Text>
              </View>
            )}
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Prompt Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prompt</Text>
            <View style={styles.promptContainer}>
              <TextInput
                style={styles.promptInput}
                value={prompt}
                onChangeText={setPrompt}
                placeholder="Describe the image you want to generate..."
                placeholderTextColor={METALLIC.titanium}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Style Presets */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Style</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.styleRow}>
                <TouchableOpacity
                  style={[
                    styles.styleChip,
                    !selectedStyle && styles.styleChipSelected,
                  ]}
                  onPress={() => setSelectedStyle('')}
                >
                  <Text style={[styles.styleText, !selectedStyle && styles.styleTextSelected]}>
                    None
                  </Text>
                </TouchableOpacity>
                {STYLE_PRESETS.map((style) => (
                  <TouchableOpacity
                    key={style.id}
                    style={[
                      styles.styleChip,
                      selectedStyle === style.id && styles.styleChipSelected,
                    ]}
                    onPress={() => setSelectedStyle(style.id)}
                  >
                    <Text style={[
                      styles.styleText,
                      selectedStyle === style.id && styles.styleTextSelected,
                    ]}>
                      {style.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Size Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Size</Text>
            <View style={styles.sizeRow}>
              {IMAGE_SIZES.map((size) => (
                <TouchableOpacity
                  key={size.id}
                  style={[
                    styles.sizeOption,
                    selectedSize === size.id && styles.sizeOptionSelected,
                  ]}
                  onPress={() => setSelectedSize(size.id)}
                >
                  <Text style={[
                    styles.sizeLabel,
                    selectedSize === size.id && styles.sizeLabelSelected,
                  ]}>
                    {size.label}
                  </Text>
                  <Text style={styles.sizeDesc}>{size.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Generate Button */}
          <TouchableOpacity
            style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
            onPress={generateImage}
            disabled={isGenerating}
          >
            <LinearGradient
              colors={isGenerating ? [METALLIC.gunmetal, METALLIC.darkSteel] : [METALLIC.accent, '#4F46E5']}
              style={styles.generateGradient}
            >
              {isGenerating ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.generateText}>Generating...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#fff" />
                  <Text style={styles.generateText}>Generate HD Image</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Generated Images Gallery */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gallery ({generatedImages.length})</Text>
            {generatedImages.length === 0 ? (
              <View style={styles.emptyGallery}>
                <Ionicons name="image-outline" size={48} color={METALLIC.titanium} />
                <Text style={styles.emptyText}>No images generated yet</Text>
              </View>
            ) : (
              <View style={styles.gallery}>
                {generatedImages.map((img) => (
                  <TouchableOpacity
                    key={img.id}
                    style={styles.galleryItem}
                    onPress={() => setPreviewImage(img)}
                  >
                    <Image
                      source={{ uri: `data:image/png;base64,${img.image_base64}` }}
                      style={styles.galleryImage}
                      resizeMode="cover"
                    />
                    <View style={styles.galleryOverlay}>
                      <TouchableOpacity
                        style={styles.deleteIcon}
                        onPress={(e) => {
                          e.stopPropagation();
                          deleteImage(img.id);
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Image Preview Modal */}
        <Modal
          visible={previewImage !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewImage(null)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setPreviewImage(null)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {previewImage && (
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: `data:image/png;base64,${previewImage.image_base64}` }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
                <View style={styles.previewInfo}>
                  <Text style={styles.previewPrompt} numberOfLines={3}>
                    {previewImage.prompt}
                  </Text>
                  <Text style={styles.previewMeta}>{previewImage.size}</Text>
                </View>
                <View style={styles.previewActions}>
                  <TouchableOpacity
                    style={styles.previewAction}
                    onPress={() => {
                      setPreviewImage(null);
                      router.push({
                        pathname: '/image-editor',
                        params: { imageBase64: previewImage.image_base64 }
                      });
                    }}
                  >
                    <Ionicons name="create-outline" size={22} color="#fff" />
                    <Text style={styles.previewActionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.previewAction, styles.previewActionDanger]}
                    onPress={() => deleteImage(previewImage.id)}
                  >
                    <Ionicons name="trash-outline" size={22} color={METALLIC.danger} />
                    <Text style={[styles.previewActionText, { color: METALLIC.danger }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const imageSize = (width - 48 - 12) / 2;

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
  adultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  adultText: { fontSize: 11, fontWeight: '600', color: METALLIC.danger },
  scrollContent: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  promptContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  promptInput: {
    padding: 14,
    fontSize: 16,
    color: METALLIC.platinum,
    minHeight: 100,
  },
  styleRow: { flexDirection: 'row', gap: 8 },
  styleChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  styleChipSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: METALLIC.accent,
  },
  styleText: { fontSize: 13, fontWeight: '500', color: METALLIC.titanium },
  styleTextSelected: { color: METALLIC.accent },
  sizeRow: { flexDirection: 'row', gap: 10 },
  sizeOption: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  sizeOptionSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: METALLIC.accent,
  },
  sizeLabel: { fontSize: 14, fontWeight: '600', color: METALLIC.platinum, marginBottom: 4 },
  sizeLabelSelected: { color: METALLIC.accent },
  sizeDesc: { fontSize: 10, color: METALLIC.titanium },
  generateButton: { marginBottom: 24, borderRadius: 16, overflow: 'hidden' },
  generateButtonDisabled: { opacity: 0.7 },
  generateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  generateText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptyGallery: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
  },
  emptyText: { marginTop: 12, fontSize: 14, color: METALLIC.titanium },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  galleryItem: {
    width: imageSize,
    height: imageSize,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: METALLIC.gunmetal,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  galleryOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  deleteIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 10,
    zIndex: 10,
  },
  previewContainer: {
    width: '100%',
    alignItems: 'center',
    padding: 20,
  },
  previewImage: {
    width: width - 40,
    height: width - 40,
    borderRadius: 16,
  },
  previewInfo: {
    marginTop: 16,
    alignItems: 'center',
  },
  previewPrompt: {
    fontSize: 14,
    color: METALLIC.platinum,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  previewMeta: {
    fontSize: 12,
    color: METALLIC.titanium,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  previewAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  previewActionDanger: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  previewActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
