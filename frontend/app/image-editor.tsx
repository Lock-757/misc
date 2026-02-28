import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const { width } = Dimensions.get('window');

const METALLIC = {
  chrome: '#C0C0C8',
  silver: '#A8A8B0',
  gunmetal: '#2A2A32',
  darkSteel: '#18181D',
  titanium: '#878792',
  platinum: '#E5E5EA',
  accent: '#6366F1',
};

const FILTERS = [
  { id: 'none', label: 'Original', adjustment: null },
  { id: 'grayscale', label: 'B&W', adjustment: { saturation: 0 } },
  { id: 'sepia', label: 'Sepia', adjustment: { saturation: 0.3 } },
  { id: 'bright', label: 'Bright', adjustment: { brightness: 1.3 } },
  { id: 'dark', label: 'Dark', adjustment: { brightness: 0.7 } },
  { id: 'contrast', label: 'Contrast', adjustment: { contrast: 1.4 } },
];

const CROPS = [
  { id: 'original', label: 'Original', ratio: null },
  { id: 'square', label: '1:1', ratio: 1 },
  { id: 'portrait', label: '4:5', ratio: 0.8 },
  { id: 'landscape', label: '16:9', ratio: 16/9 },
];

export default function ImageEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [originalUri, setOriginalUri] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [selectedCrop, setSelectedCrop] = useState('original');
  const [rotation, setRotation] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editHistory, setEditHistory] = useState<string[]>([]);

  useEffect(() => {
    if (params.imageBase64) {
      const uri = `data:image/png;base64,${params.imageBase64}`;
      setImageUri(uri);
      setOriginalUri(uri);
    }
  }, [params.imageBase64]);

  const applyFilter = async (filterId: string) => {
    if (!originalUri) return;
    setIsProcessing(true);
    setSelectedFilter(filterId);

    try {
      const filter = FILTERS.find(f => f.id === filterId);
      if (!filter || !filter.adjustment) {
        setImageUri(originalUri);
        setIsProcessing(false);
        return;
      }

      // Save base64 to temp file for manipulation
      const base64Data = originalUri.split(',')[1];
      const tempUri = FileSystem.cacheDirectory + 'temp_edit.png';
      await FileSystem.writeAsStringAsync(tempUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const result = await ImageManipulator.manipulateAsync(
        tempUri,
        [],
        { base64: true, format: ImageManipulator.SaveFormat.PNG }
      );

      if (result.base64) {
        setImageUri(`data:image/png;base64,${result.base64}`);
        setEditHistory(prev => [...prev, imageUri || '']);
      }
    } catch (error) {
      console.error('Filter error:', error);
      Alert.alert('Error', 'Failed to apply filter');
    } finally {
      setIsProcessing(false);
    }
  };

  const rotateImage = async () => {
    if (!imageUri) return;
    setIsProcessing(true);

    try {
      const newRotation = (rotation + 90) % 360;
      setRotation(newRotation);

      const base64Data = imageUri.split(',')[1];
      const tempUri = FileSystem.cacheDirectory + 'temp_rotate.png';
      await FileSystem.writeAsStringAsync(tempUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const result = await ImageManipulator.manipulateAsync(
        tempUri,
        [{ rotate: 90 }],
        { base64: true, format: ImageManipulator.SaveFormat.PNG }
      );

      if (result.base64) {
        const newUri = `data:image/png;base64,${result.base64}`;
        setImageUri(newUri);
        setEditHistory(prev => [...prev, imageUri]);
      }
    } catch (error) {
      console.error('Rotate error:', error);
      Alert.alert('Error', 'Failed to rotate image');
    } finally {
      setIsProcessing(false);
    }
  };

  const flipImage = async (horizontal: boolean) => {
    if (!imageUri) return;
    setIsProcessing(true);

    try {
      const base64Data = imageUri.split(',')[1];
      const tempUri = FileSystem.cacheDirectory + 'temp_flip.png';
      await FileSystem.writeAsStringAsync(tempUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const result = await ImageManipulator.manipulateAsync(
        tempUri,
        [{ flip: horizontal ? ImageManipulator.FlipType.Horizontal : ImageManipulator.FlipType.Vertical }],
        { base64: true, format: ImageManipulator.SaveFormat.PNG }
      );

      if (result.base64) {
        const newUri = `data:image/png;base64,${result.base64}`;
        setImageUri(newUri);
        setEditHistory(prev => [...prev, imageUri]);
      }
    } catch (error) {
      console.error('Flip error:', error);
      Alert.alert('Error', 'Failed to flip image');
    } finally {
      setIsProcessing(false);
    }
  };

  const resizeImage = async (scale: number) => {
    if (!imageUri) return;
    setIsProcessing(true);

    try {
      const base64Data = imageUri.split(',')[1];
      const tempUri = FileSystem.cacheDirectory + 'temp_resize.png';
      await FileSystem.writeAsStringAsync(tempUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const result = await ImageManipulator.manipulateAsync(
        tempUri,
        [{ resize: { width: Math.round(1024 * scale) } }],
        { base64: true, format: ImageManipulator.SaveFormat.PNG }
      );

      if (result.base64) {
        const newUri = `data:image/png;base64,${result.base64}`;
        setImageUri(newUri);
        setEditHistory(prev => [...prev, imageUri]);
      }
    } catch (error) {
      console.error('Resize error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const undoEdit = () => {
    if (editHistory.length > 0) {
      const previousState = editHistory[editHistory.length - 1];
      setImageUri(previousState);
      setEditHistory(prev => prev.slice(0, -1));
    }
  };

  const resetImage = () => {
    if (originalUri) {
      setImageUri(originalUri);
      setSelectedFilter('none');
      setRotation(0);
      setEditHistory([]);
    }
  };

  const shareImage = async () => {
    if (!imageUri) return;

    try {
      const base64Data = imageUri.split(',')[1];
      const fileUri = FileSystem.cacheDirectory + 'shared_image.png';
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share image');
    }
  };

  const saveImage = () => {
    Alert.alert('Saved', 'Image saved to your edits');
    router.back();
  };

  if (!imageUri) {
    return (
      <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
        <SafeAreaView style={styles.emptyContainer}>
          <Ionicons name="image-outline" size={64} color={METALLIC.titanium} />
          <Text style={styles.emptyText}>No image to edit</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0A0A0F', '#12121A', '#0A0A0F']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="close" size={26} color={METALLIC.platinum} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Image</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={undoEdit} style={styles.headerButton} disabled={editHistory.length === 0}>
              <Ionicons name="arrow-undo" size={22} color={editHistory.length > 0 ? METALLIC.platinum : METALLIC.gunmetal} />
            </TouchableOpacity>
            <TouchableOpacity onPress={shareImage} style={styles.headerButton}>
              <Ionicons name="share-outline" size={22} color={METALLIC.platinum} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Image Preview */}
        <View style={styles.previewContainer}>
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={METALLIC.accent} />
            </View>
          )}
          <Image
            source={{ uri: imageUri }}
            style={styles.previewImage}
            resizeMode="contain"
          />
        </View>

        {/* Edit Tools */}
        <ScrollView style={styles.toolsContainer} showsVerticalScrollIndicator={false}>
          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transform</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={rotateImage}>
                <View style={styles.actionIcon}>
                  <Ionicons name="refresh" size={22} color={METALLIC.platinum} />
                </View>
                <Text style={styles.actionLabel}>Rotate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={() => flipImage(true)}>
                <View style={styles.actionIcon}>
                  <Ionicons name="swap-horizontal" size={22} color={METALLIC.platinum} />
                </View>
                <Text style={styles.actionLabel}>Flip H</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={() => flipImage(false)}>
                <View style={styles.actionIcon}>
                  <Ionicons name="swap-vertical" size={22} color={METALLIC.platinum} />
                </View>
                <Text style={styles.actionLabel}>Flip V</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={resetImage}>
                <View style={styles.actionIcon}>
                  <Ionicons name="refresh-circle" size={22} color={METALLIC.platinum} />
                </View>
                <Text style={styles.actionLabel}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Resize */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resize</Text>
            <View style={styles.resizeRow}>
              {[0.5, 0.75, 1.0, 1.5].map((scale) => (
                <TouchableOpacity
                  key={scale}
                  style={styles.resizeButton}
                  onPress={() => resizeImage(scale)}
                >
                  <Text style={styles.resizeText}>{scale === 1 ? '100%' : `${scale * 100}%`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Filters */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Filters</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterRow}>
                {FILTERS.map((filter) => (
                  <TouchableOpacity
                    key={filter.id}
                    style={[
                      styles.filterButton,
                      selectedFilter === filter.id && styles.filterButtonSelected,
                    ]}
                    onPress={() => applyFilter(filter.id)}
                  >
                    <View style={[
                      styles.filterPreview,
                      filter.id === 'grayscale' && { backgroundColor: '#666' },
                      filter.id === 'sepia' && { backgroundColor: '#8B7355' },
                      filter.id === 'bright' && { backgroundColor: '#DDD' },
                      filter.id === 'dark' && { backgroundColor: '#333' },
                      filter.id === 'contrast' && { backgroundColor: '#555' },
                    ]} />
                    <Text style={[
                      styles.filterLabel,
                      selectedFilter === filter.id && styles.filterLabelSelected,
                    ]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={saveImage}>
            <LinearGradient
              colors={[METALLIC.accent, '#4F46E5']}
              style={styles.saveGradient}
            >
              <Ionicons name="checkmark" size={22} color="#fff" />
              <Text style={styles.saveText}>Save Changes</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.bottomSpacing} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 16, color: METALLIC.titanium },
  backLink: { marginTop: 8 },
  backLinkText: { fontSize: 14, color: METALLIC.accent },
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
  previewContainer: {
    height: width,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  toolsContainer: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: METALLIC.titanium,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionButton: { alignItems: 'center', gap: 6 },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionLabel: { fontSize: 11, color: METALLIC.titanium },
  resizeRow: { flexDirection: 'row', gap: 10 },
  resizeButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  resizeText: { fontSize: 13, fontWeight: '500', color: METALLIC.platinum },
  filterRow: { flexDirection: 'row', gap: 12 },
  filterButton: { alignItems: 'center', gap: 8 },
  filterButtonSelected: {},
  filterPreview: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: METALLIC.gunmetal,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterLabel: { fontSize: 11, color: METALLIC.titanium },
  filterLabelSelected: { color: METALLIC.accent },
  saveButton: { marginTop: 8, borderRadius: 14, overflow: 'hidden' },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  saveText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  bottomSpacing: { height: 40 },
});
