import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

interface FloatingOrbProps {
  delay?: number;
  size?: number;
  color?: string;
  startX?: number;
  startY?: number;
}

const FloatingOrb: React.FC<FloatingOrbProps> = ({
  delay = 0,
  size = 100,
  color = '#6366F1',
  startX = width / 2,
  startY = height / 2,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateOrb = () => {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: Math.random() * 60 - 30,
              duration: 4000 + Math.random() * 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: Math.random() * 60 - 30,
              duration: 4000 + Math.random() * 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 0.8 + Math.random() * 0.4,
              duration: 3000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.2 + Math.random() * 0.3,
              duration: 3000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: Math.random() * 60 - 30,
              duration: 4000 + Math.random() * 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: Math.random() * 60 - 30,
              duration: 4000 + Math.random() * 2000,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 0.8 + Math.random() * 0.4,
              duration: 3000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.2 + Math.random() * 0.3,
              duration: 3000,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    };

    const timeout = setTimeout(animateOrb, delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          left: startX - size / 2,
          top: startY - size / 2,
          transform: [
            { translateX },
            { translateY },
            { scale },
          ],
          opacity,
        },
      ]}
    >
      <LinearGradient
        colors={[`${color}60`, `${color}20`, 'transparent']}
        style={styles.orbGradient}
        start={{ x: 0.3, y: 0.3 }}
        end={{ x: 0.7, y: 0.7 }}
      />
    </Animated.View>
  );
};

interface AnimatedBackgroundProps {
  intensity?: 'low' | 'medium' | 'high';
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  intensity = 'medium',
}) => {
  const orbCount = intensity === 'low' ? 3 : intensity === 'medium' ? 5 : 8;
  
  const orbs = [
    { size: 200, color: '#6366F1', x: width * 0.2, y: height * 0.15 },
    { size: 150, color: '#8B5CF6', x: width * 0.8, y: height * 0.25 },
    { size: 180, color: '#EC4899', x: width * 0.5, y: height * 0.6 },
    { size: 120, color: '#06B6D4', x: width * 0.15, y: height * 0.75 },
    { size: 160, color: '#10B981', x: width * 0.85, y: height * 0.8 },
    { size: 100, color: '#F59E0B', x: width * 0.3, y: height * 0.4 },
    { size: 140, color: '#EF4444', x: width * 0.7, y: height * 0.5 },
    { size: 110, color: '#3B82F6', x: width * 0.5, y: height * 0.85 },
  ].slice(0, orbCount);

  return (
    <View style={styles.backgroundContainer} pointerEvents="none">
      {orbs.map((orb, index) => (
        <FloatingOrb
          key={index}
          delay={index * 500}
          size={orb.size}
          color={orb.color}
          startX={orb.x}
          startY={orb.y}
        />
      ))}
      
      {/* Grid overlay for depth */}
      <View style={styles.gridOverlay}>
        <Svg width={width} height={height} style={styles.gridSvg}>
          <Defs>
            <RadialGradient id="centerGlow" cx="50%" cy="40%" r="60%">
              <Stop offset="0%" stopColor="#6366F1" stopOpacity="0.1" />
              <Stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={width / 2}
            cy={height * 0.4}
            rx={width * 0.8}
            ry={height * 0.3}
            fill="url(#centerGlow)"
          />
        </Svg>
      </View>
    </View>
  );
};

// Pulsing ring effect for hero area
export const PulsingRings: React.FC = () => {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 3000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    createPulse(ring1, 0);
    createPulse(ring2, 1000);
    createPulse(ring3, 2000);
  }, []);

  const createRingStyle = (anim: Animated.Value) => ({
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.5, 2],
        }),
      },
    ],
    opacity: anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.6, 0.3, 0],
    }),
  });

  return (
    <View style={styles.ringsContainer}>
      <Animated.View style={[styles.ring, createRingStyle(ring1)]} />
      <Animated.View style={[styles.ring, styles.ring2, createRingStyle(ring2)]} />
      <Animated.View style={[styles.ring, styles.ring3, createRingStyle(ring3)]} />
    </View>
  );
};

const styles = StyleSheet.create({
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 1000,
  },
  orbGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 1000,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridSvg: {
    position: 'absolute',
  },
  ringsContainer: {
    position: 'absolute',
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  ring2: {
    borderColor: '#8B5CF6',
  },
  ring3: {
    borderColor: '#EC4899',
  },
});

export default AnimatedBackground;
