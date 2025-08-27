import React from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { processFlow } from '../utils/functions';
import styles from '../styles';

const FlowDescriptionScreen = ({
  selectedFlow,
  handleStartFlow,
  handleShowReports,
  handleShowLatestReport,
  isConnected,
  insets,
  onBack,
}) => {
  const { duracionEstimada } = processFlow(selectedFlow);

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top, flex: 1 }]}>
      <View style={styles.content}>
        <View style={[styles.connectionStatus, { marginBottom: 5 }]}>
          <Feather name={isConnected ? 'wifi' : 'wifi-off'} size={24} color={isConnected ? 'green' : 'red'} style={{ marginRight: 8 }} />
          <Text style={[styles.connectionText, isConnected ? styles.connected : styles.disconnected]}>
            {isConnected ? 'Conectado' : 'Sin conexión'}
          </Text>
        </View>

        <Text style={[styles.flowTitle, { marginTop: 10 }]}>{selectedFlow.title[0].text}</Text>
        <View style={styles.descriptionCard}>
          <Text style={styles.flowDescription}>{selectedFlow.description?.[0]?.text || 'Descripción no disponible.'}</Text>
        </View>

        <View style={styles.estimatedTimeWrapper}>
          <View style={styles.estimatedTimeContainer}>
            <Text style={styles.estimatedTime}>⏱ Duración estimada: {duracionEstimada} minutos</Text>
          </View>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={handleStartFlow} activeOpacity={0.7}>
          <Text style={styles.buttonText}>Crear Informe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleShowReports(selectedFlow.id)} activeOpacity={0.7}>
          <Text style={styles.buttonText}>Ver Informes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleShowLatestReport} activeOpacity={0.7}>
          <Text style={styles.buttonText}>Ver Último Informe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.buttonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default FlowDescriptionScreen;
