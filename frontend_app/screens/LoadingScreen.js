import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import styles from '../styles';

const LoadingScreen = () => {
  return (
    <View style={[styles.container, styles.loadingContainer]}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Cargando flujos...</Text>
    </View>
  );
};

export default LoadingScreen;
