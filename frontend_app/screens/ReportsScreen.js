import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { formatRemainingTime, formatTimestamp, getTimeColor, getItemStyle } from '../utils/functions';
import styles from '../styles';

const ReportsScreen = ({ reports, showReports, selectedFlow, setShowReports, isConnected, insets }) => {
  const title = selectedFlow ? `Informes de ${selectedFlow.title[0].text}` : 'Todos los Informes';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.connectionStatus, { marginBottom: 5 }]}>
        <Feather name={isConnected ? 'wifi' : 'wifi-off'} size={24} color={isConnected ? 'green' : 'red'} style={{ marginRight: 8 }} />
        <Text style={[styles.connectionText, isConnected ? styles.connected : styles.disconnected]}>
          {isConnected ? 'Conectado' : 'Sin conexión'}
        </Text>
      </View>

      <Text style={styles.title}>{title}</Text>
      <View style={{ flex: 1 }}>
        {reports.length === 0 ? (
          <Text style={styles.noReportText}>No hay informes disponibles.</Text>
        ) : (
          <FlatList
            data={reports}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item }) => {
              const formattedDate = formatTimestamp(item.timestamp);
              const timeColor = getTimeColor(item.timeRemaining);
              const itemStyle = getItemStyle(item.history);

              return (
                <View style={[styles.historyItem, itemStyle]}>
                  <Text style={styles.historyText}>Flujo: {item.flowName}</Text>
                  <Text style={styles.historySubText}>Informe realizado el {formattedDate}.</Text>
                  <Text style={styles.historySubText}>Estado: {item.estado}.</Text>
                  <Text style={styles.historySubText}>Usuario: {item.user}.</Text>
                  <View style={{ height: 10 }} />
                  <Text style={styles.historySubText}>Detalles del informe:</Text>
                  <FlatList
                    data={item.history}
                    keyExtractor={(step, index) => index.toString()}
                    renderItem={({ item: step }) => (
                      <Text style={styles.historySubText}>
                        - Paso: {step.stepTitle}, Respuesta: {step.option}
                      </Text>
                    )}
                  />
                  <View style={{ height: 10 }} />
                  {item.timeRemaining !== undefined && item.estado === 'Sincronizado' && (
                    <Text style={[styles.historySubText, timeColor]}>
                      Tiempo restante para borrado: {formatRemainingTime(item.timeRemaining)}
                    </Text>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
      <TouchableOpacity style={styles.backButton} onPress={() => setShowReports(false)} activeOpacity={0.7}>
        <Text style={styles.buttonText}>Volver</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ReportsScreen;
