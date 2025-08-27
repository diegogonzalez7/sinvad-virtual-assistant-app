import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Función para guardar informe en AsyncStorage
export async function saveReport(flowId, flowName, history) {
  try {
    const report = {
      flowId,
      flowName,
      history,
      timestamp: new Date().toISOString(),
      estado: 'Pendiente',
      user: 'admin', // Variable para usuario, predeterminada a "admin" por ahora
    };
    const existingReports = JSON.parse((await AsyncStorage.getItem('reports')) || '[]');
    await AsyncStorage.setItem('reports', JSON.stringify([...existingReports, report]));
    return report;
  } catch (error) {
    console.log('Error saving report:', error);
    throw error;
  }
}

// Función para marcar informe como sincronizado
export async function markReportAsSynchronized(timestamp) {
  try {
    const reports = JSON.parse((await AsyncStorage.getItem('reports')) || '[]');
    const updatedReports = reports.map(report => {
      // Comparar timestamps con tolerancia a diferencias menores (por ejemplo, milisegundos)
      const isSameTimestamp = Math.abs(new Date(report.timestamp).getTime() - new Date(timestamp).getTime()) < 1000;
      return isSameTimestamp ? { ...report, estado: 'Sincronizado' } : report;
    });
    await AsyncStorage.setItem('reports', JSON.stringify(updatedReports));
    console.log(`Informe con timestamp ${timestamp} marcado como Sincronizado`);
  } catch (error) {
    console.log('Error marking report as synchronized:', error);
  }
}

// Función para obtener informes
export async function getReports(setReports, flowId = null) {
  try {
    const reports = JSON.parse((await AsyncStorage.getItem('reports')) || '[]');
    const now = new Date();
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos

    // Filtrar informes vencidos (más de 7 días desde timestamp), pero no limpiar si no hay conexión
    const updatedReports = reports
      .filter(report => {
        const reportTime = new Date(report.timestamp);
        const timeElapsedMs = now - reportTime;
        return timeElapsedMs <= oneWeekInMs || !isConnected; // Mantener informes si no hay conexión
      })
      .map(report => {
        const reportTime = new Date(report.timestamp);
        const timeElapsedMs = now - reportTime;
        const timeRemainingMs = oneWeekInMs - timeElapsedMs;
        const timeRemaining = timeRemainingMs > 0 ? Math.ceil(timeRemainingMs / (1000 * 60)) : 0; // Minutos restantes
        return { ...report, timeRemaining };
      });

    await AsyncStorage.setItem('reports', JSON.stringify(updatedReports));

    if (flowId) {
      const filteredReports = updatedReports.filter(report => report.flowId === flowId);
      setReports(filteredReports);
    } else {
      setReports(updatedReports);
    }
  } catch (error) {
    console.log('Error fetching reports:', error);
    setReports([]);
  }
}

// Función para obtener el último informe
export async function getLatestReport(flowId, setSelectedReport) {
  try {
    const reports = JSON.parse((await AsyncStorage.getItem('reports')) || '[]');
    const filteredReports = reports.filter(report => report.flowId === flowId);
    const latestReport = filteredReports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    setSelectedReport(latestReport || null);
  } catch (error) {
    console.log('Error fetching latest report:', error);
  }
}

// Función para limpiar todos los informes (con alerta)
export async function clearReportsWithAlert(setReports) {
  try {
    const reports = JSON.parse((await AsyncStorage.getItem('reports')) || '[]');
    if (reports.length > 0) {
      await AsyncStorage.removeItem('reports'); // Elimina todos los informes
      setReports([]); // Actualiza el estado a vacío
      await AsyncStorage.setItem('lastCleanup', new Date().toISOString()); // Actualizar la última limpieza
      console.log('Todos los informes sincronizados borrados y última limpieza registrada.');
      Alert.alert('Éxito', 'Todos los informes han sido eliminados.');
    } else {
      console.log('No hay informes para borrar.');
      Alert.alert('Información', 'No hay informes para eliminar.');
    }
  } catch (error) {
    console.log('Error limpiando informes:', error);
    Alert.alert('Error', 'No se pudieron limpiar los informes.');
  }
}

// Función para guardar flujos en AsyncStorage
export async function saveFlowsToStorage(flows) {
  try {
    const data = {
      flows,
      timestamp: new Date().toISOString(),
    };
    await AsyncStorage.setItem('flows', JSON.stringify(data));
  } catch (error) {
    console.log('Error guardando flujos:', error);
  }
}

// Función para cargar flujos desde AsyncStorage
export async function loadFlowsFromStorage() {
  try {
    const data = await AsyncStorage.getItem('flows');
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.flows.sort((a, b) => a.title[0].text.localeCompare(b.title[0].text));
    }
    return null;
  } catch (error) {
    console.log('Error cargando flujos:', error);
    return null;
  }
}

// Función para guardar credenciales en SecureStore
export const storeCredentials = async (username, pin) => {
  try {
    const key = 'credentials_' + btoa(username); // Clave única por usuario
    await SecureStore.setItemAsync(key, JSON.stringify({ username, pin }), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
    console.log('Credenciales almacenadas de forma segura para:', username);
  } catch (error) {
    console.log('Error guardando credenciales:', error);
  }
};

// Función para cargar credenciales desde SecureStore
export const loadCredentials = async () => {
  try {
    const keys = await SecureStore.getAllKeysAsync();
    const credentialKeys = keys.filter(key => key.startsWith('credentials_'));
    if (credentialKeys.length > 0) {
      const credentialData = await SecureStore.getItemAsync(credentialKeys[0]);
      if (credentialData) {
        const { username, pin } = JSON.parse(credentialData);
        return { username, pin };
      }
    }
    return null;
  } catch (error) {
    console.log('Error cargando credenciales:', error);
    return null;
  }
};

// Función para eliminar credenciales
export const clearCredentials = async () => {
  try {
    const keys = await SecureStore.getAllKeysAsync();
    const credentialKeys = keys.filter(key => key.startsWith('credentials_'));
    await Promise.all(credentialKeys.map(key => SecureStore.deleteItemAsync(key)));
    console.log('Credenciales eliminadas');
  } catch (error) {
    console.log('Error eliminando credenciales:', error);
  }
};
