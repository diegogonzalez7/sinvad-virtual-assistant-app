import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import styles from '../styles';

const FlowSelectionScreen = ({ flows, handleSelectFlow, handleShowReports, clearReportsWithAlert, isConnected, insets }) => {
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.connectionStatus}>
        <Feather name={isConnected ? 'wifi' : 'wifi-off'} size={24} color={isConnected ? 'green' : 'red'} style={{ marginRight: 8 }} />
        <Text style={[styles.connectionText, isConnected ? styles.connected : styles.disconnected]}>
          {isConnected ? 'Conectado' : 'Sin conexión'}
        </Text>
      </View>

      <Text style={styles.title}>Selecciona un flujo</Text>

      <FlatList
        data={flows}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.flowButton} onPress={() => handleSelectFlow(item)} activeOpacity={0.7}>
            <Text style={styles.buttonText}>{item.title[0].text}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.allReportsButton} onPress={() => handleShowReports()} activeOpacity={0.7}>
        <Text style={styles.buttonText}>Ver Todos los Informes</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.clearReportsButton} onPress={() => clearReportsWithAlert()} activeOpacity={0.7}>
        <Text style={styles.buttonText}>Limpiar Informes</Text>
      </TouchableOpacity>
    </View>
  );
};

export default FlowSelectionScreen;
