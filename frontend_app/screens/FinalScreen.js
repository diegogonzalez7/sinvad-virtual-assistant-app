import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { formatTimestamp, getItemStyle } from '../utils/functions';
import styles from '../styles';

const FinalScreen = ({
  history,
  selectedFlow,
  setSelectedFlow,
  setHistory,
  setMessages,
  setInputValue,
  setShowReports,
  setSelectedReport,
  isConnected,
  insets,
}) => {
  const formattedHistory = history.map(item => ({
    ...item,
    timestamp: formatTimestamp(item.timestamp || history[0]?.timestamp || new Date().toISOString()),
  }));
  const itemStyle = getItemStyle(history);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.connectionStatus, { marginBottom: 5 }]}>
        <Feather name={isConnected ? 'wifi' : 'wifi-off'} size={24} color={isConnected ? 'green' : 'red'} style={{ marginRight: 8 }} />
        <Text style={[styles.connectionText, isConnected ? styles.connected : styles.disconnected]}>
          {isConnected ? 'Conectado' : 'Sin conexión'}
        </Text>
      </View>

      <Text style={styles.title}>Flujo finalizado</Text>

      <Text style={styles.subtitle}>Historial de respuestas:</Text>
      <FlatList
        data={formattedHistory}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <View style={[styles.historyItem, itemStyle]}>
            <Text style={styles.historyText}>
              Paso: {item.stepTitle || 'Sin título'} - Respuesta: {item.option || 'Sin respuesta'}
            </Text>
            <Text style={styles.historySubText}>Realizado: {item.timestamp}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.historySubText}>No hay historial disponible.</Text>}
      />
      <TouchableOpacity
        style={styles.restartButton}
        onPress={() => {
          setSelectedFlow(null);
          setHistory([]);
          setMessages([]);
          setInputValue('');
          setShowReports(false);
          setSelectedReport(null);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>Volver a seleccionar flujo</Text>
      </TouchableOpacity>
    </View>
  );
};

export default FinalScreen;
