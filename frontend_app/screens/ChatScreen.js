import React from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Alert } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { findStep, parseOptions, processFlow } from '../utils/functions';
import styles from '../styles';

const ChatScreen = ({
  currentStepId,
  selectedFlow,
  messages,
  setMessages,
  inputValue,
  setInputValue,
  handleOptionPress,
  handleContinue,
  setCurrentStepId,
  setHistory,
  flatListRef,
  isConnected,
  insets,
}) => {
  const step = findStep(currentStepId, selectedFlow);
  const options = step
    ? parseOptions(step.question[0].text, processFlow(selectedFlow).stepNameToId, processFlow(selectedFlow).graph[currentStepId] || [])
    : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top, flex: 1 }]}>
      <View style={[styles.connectionStatus, { marginBottom: 5 }]}>
        <Feather name={isConnected ? 'wifi' : 'wifi-off'} size={24} color={isConnected ? 'green' : 'red'} style={{ marginRight: 8 }} />
        <Text style={[styles.connectionText, isConnected ? styles.connected : styles.disconnected]}>
          {isConnected ? 'Conectado' : 'Sin conexión'}
        </Text>
      </View>

      <Text style={[styles.title, { fontSize: 18, marginBottom: 10 }]}>{selectedFlow?.title?.[0]?.text || 'Flujo sin título'}</Text>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item: message }) => (
          <View
            style={[
              styles.messageBubble,
              message.isUser ? styles.userBubble : styles.assistantBubble,
              { alignSelf: message.isUser ? 'flex-end' : 'flex-start' },
            ]}
          >
            <Text style={[styles.messageText, message.isUser ? styles.userText : styles.assistantText, { fontSize: 16, lineHeight: 24 }]}>
              {message.text}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 10, flexGrow: 1 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {step && currentStepId !== '0' && (
        <View style={styles.optionsContainer}>
          {options.length > 0 && options[0].isTextInput ? (
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.textInput, { fontSize: 16 }]}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder="Ingresa el identificador (ej. XYZ123)"
              />
              <TouchableOpacity
                style={[styles.optionButton, !inputValue ? styles.disabledButton : {}]}
                onPress={() => handleOptionPress(inputValue)}
                disabled={!inputValue}
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonText, { fontSize: 16 }]}>Continuar</Text>
              </TouchableOpacity>
            </View>
          ) : options.length > 0 ? (
            <FlatList
              data={options}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionButton, { backgroundColor: '#BBDEFB' }]}
                  onPress={() => handleOptionPress(item.text)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.buttonText, { color: '#0D47A1', fontSize: 16 }]}>{item.text}</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingVertical: 5 }}
            />
          ) : (
            <TouchableOpacity
              style={[styles.continueButton, { backgroundColor: '#4CAF50' }]} // Verde para "Continuar"
              onPress={handleContinue}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, { color: '#FFFFFF', fontSize: 16 }]}>Continuar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {currentStepId !== '0' && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Alert.alert('¿Desea volver?', 'El avance realizado en este paso se descartará.', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Sí',
                onPress: () => {
                  setCurrentStepId(null); // Regresar a FlowDescriptionScreen
                  setMessages([]); // Limpiar mensajes
                  setInputValue(''); // Limpiar entrada
                  setHistory([]); // Limpiar historial (opcional, ajusta según lógica)
                },
              },
            ]);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, { fontSize: 16 }]}>Volver</Text>
        </TouchableOpacity>
      )}

      {currentStepId === '0' && (
        <TouchableOpacity
          style={styles.continueButton} // Verde por defecto
          onPress={() => {
            setSelectedFlow(null);
            setCurrentStepId(null);
            setHistory([]);
            setMessages([]);
            setInputValue('');
            setShowReports(false);
            setSelectedReport(null);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, { color: '#FFFFFF', fontSize: 16 }]}>Continuar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default ChatScreen;
