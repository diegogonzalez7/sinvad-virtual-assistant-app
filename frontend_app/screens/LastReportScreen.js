import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { formatRemainingTime, formatTimestamp, getTimeColor, getItemStyle } from '../utils/functions';
import styles from '../styles';

const LastReportScreen = ({ selectedReport, selectedFlow, setSelectedReport, isConnected, insets }) => {
  const formattedDate = selectedReport?.timestamp ? formatTimestamp(selectedReport.timestamp) : 'Fecha no disponible';
  const timeColor = selectedReport?.timeRemaining !== undefined ? getTimeColor(selectedReport.timeRemaining) : styles.historySubText;
  const itemStyle = selectedReport?.history ? getItemStyle(selectedReport.history) : styles.historyItem;

  return (
    <View style={[styles.container, { paddingTop: insets.top, flex: 1 }]}>
      <View style={[styles.connectionStatus, { marginBottom: 5 }]}>
        <Feather name={isConnected ? 'wifi' : 'wifi-off'} size={24} color={isConnected ? 'green' : 'red'} style={{ marginRight: 8 }} />
        <Text style={[styles.connectionText, isConnected ? styles.connected : styles.disconnected]}>
          {isConnected ? 'Conectado' : 'Sin conexión'}
        </Text>
      </View>

      <Text style={styles.title}>Último Informe de {selectedFlow?.title?.[0]?.text || 'Flujo no especificado'}</Text>
      <View style={{ flex: 1 }}>
        {selectedReport ? (
          <View style={[styles.historyItem, itemStyle]}>
            <Text style={styles.historyText}>Flujo: {selectedReport.flowName || 'Flujo no especificado'}</Text>
            <Text style={styles.historySubText}>Informe realizado el {formattedDate}.</Text>
            <Text style={styles.historySubText}>Estado: {selectedReport.estado || 'Desconocido'}.</Text>
            <Text style={styles.historySubText}>Usuario: {selectedReport.user || 'Usuario no especificado'}.</Text>
            <View style={{ height: 10 }} />
            <Text style={styles.historySubText}>Detalles del informe:</Text>
            <FlatList
              data={selectedReport.history || []}
              keyExtractor={(step, index) => index.toString()}
              renderItem={({ item: step }) => (
                <Text style={styles.historySubText}>
                  - Paso: {step.stepTitle || 'Sin título'}, Respuesta: {step.option || 'Sin respuesta'}
                </Text>
              )}
              ListEmptyComponent={<Text style={styles.historySubText}>Sin detalles disponibles.</Text>}
            />
            <View style={{ height: 10 }} />
            {selectedReport.timeRemaining !== undefined && selectedReport.estado === 'Sincronizado' && (
              <Text style={[styles.historySubText, timeColor]}>
                Tiempo restante para borrado: {formatRemainingTime(selectedReport.timeRemaining)}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.noReportText}>No hay informes disponibles para este flujo.</Text>
        )}
      </View>
      <TouchableOpacity style={styles.backButton} onPress={() => setSelectedReport(null)} activeOpacity={0.7}>
        <Text style={styles.buttonText}>Volver</Text>
      </TouchableOpacity>
    </View>
  );
};

export default LastReportScreen;
