import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0A0F' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ui-editor" options={{ presentation: 'modal' }} />
        <Stack.Screen name="history" options={{ presentation: 'modal' }} />
        <Stack.Screen name="tools" options={{ presentation: 'modal' }} />
        <Stack.Screen name="imagegen" options={{ presentation: 'modal' }} />
        <Stack.Screen name="image-editor" options={{ presentation: 'modal' }} />
        <Stack.Screen name="stats" options={{ presentation: 'modal' }} />
        <Stack.Screen name="agents" options={{ presentation: 'modal' }} />
        <Stack.Screen name="templates" options={{ presentation: 'modal' }} />
        <Stack.Screen name="search" options={{ presentation: 'modal' }} />
        <Stack.Screen name="memory" options={{ presentation: 'modal' }} />
        <Stack.Screen name="quick-replies" options={{ presentation: 'modal' }} />
        <Stack.Screen name="bookmarks" options={{ presentation: 'modal' }} />
        <Stack.Screen name="scheduled" options={{ presentation: 'modal' }} />
        <Stack.Screen name="export" options={{ presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
});
