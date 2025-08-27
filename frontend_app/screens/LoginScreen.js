import React from 'react';
import { KeyboardAvoidingView, Platform, View, TextInput, TouchableOpacity, Text } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import styles from '../styles';

const LoginScreen = ({ username, setUsername, pin, setPin, handleLogin, insets }) => {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', flex: 1 }]}>
        <View style={styles.loginCard}>
          <Feather name="user" size={60} color="#007AFF" style={styles.loginIcon} />
          <Text style={styles.loginTitle}>Inicio de Sesión</Text>
          <TextInput
            style={styles.loginInput}
            value={username}
            onChangeText={setUsername}
            placeholder="Usuario"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.loginInput}
            value={pin}
            onChangeText={setPin}
            placeholder="PIN"
            secureTextEntry
            keyboardType="numeric"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.loginButton, (!username || !pin) && styles.loginButtonDisabled]}
            onPress={handleLogin}
            activeOpacity={0.7}
            disabled={!username || !pin}
          >
            <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
