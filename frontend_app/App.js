import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, FlatList, TextInput, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import styles from './styles';

// Configuración WebSocket
const WS_URL = 'ws://localhost:8080'; // Cambiar la IP por localhost si haces pruebas en el ordenador

// Función para procesar un flujo y calcular duración estimada
function processFlow(flow) {
  const stepNameToId = {};
  flow.steps.forEach(step => {
    stepNameToId[step.name[0].text] = step.id;
    stepNameToId[step.title[0].text] = step.id;
  });

  const graph = {};
  flow.nextSteps.forEach(transition => {
    const { prevStep, nextStep, conditions } = transition;
    if (!graph[prevStep]) graph[prevStep] = [];
    graph[prevStep].push({ nextStep, conditions });
  });

  // Duración estimada: 1 minuto por nodo
  const nodeCount = flow.steps.length;
  const duracionEstimada = nodeCount * 1; // En minutos

  return { stepNameToId, graph, duracionEstimada };
}

// Función para parsear opciones dentro de los chips
function parseOptions(questionText, stepNameToId, nextSteps) {
  const options = [];
  const regex = /::chip::([^:]+)::text::([^:]+)::chip::/g;
  let match;
  while ((match = regex.exec(questionText)) !== null) {
    const optionText = match[1].trim();
    const nextStepName = match[2].trim();
    const nextStepId = stepNameToId[nextStepName] || nextStepName;
    options.push({ text: optionText, nextStep: nextStepId });
  }
  if (!regex.test(questionText) && nextSteps.some(t => t.nextStep !== '0')) {
    const nextStep = nextSteps.find(t => t.conditions === '-');
    if (nextStep) {
      options.push({ text: 'Continuar', nextStep: nextStep.nextStep, isTextInput: true });
    }
  }
  return options;
}

// Función para limpiar el texto de las opciones de chip
function cleanAssistantMessage(questionText) {
  return questionText.replace(/::chip::[^:]+::text::[^:]+::chip::/g, '').trim();
}

// Función para encontrar un paso por ID
function findStep(stepId, flow) {
  return flow.steps.find(step => step.id === stepId);
}

// Función para encontrar el siguiente paso
function findNextStep(currentStepId, selectedOptionText, flow, graph, stepNameToId, isTextInput = false) {
  const step = findStep(currentStepId, flow);
  const options = step ? parseOptions(step.question[0].text, stepNameToId, graph[currentStepId] || []) : [];
  const transitions = graph[currentStepId] || [];

  if (!selectedOptionText && options.length === 0) {
    const transition = transitions.find(t => t.conditions === '-');
    return transition ? transition.nextStep : null;
  }

  if (isTextInput && options[0]?.isTextInput) {
    return options[0].nextStep;
  }

  const selectedOption = options.find(opt => opt.text.toLowerCase() === selectedOptionText?.toLowerCase());

  if (!selectedOption) {
    console.log(`Debug: No se encontró la opción "${selectedOptionText}"`);
    return null;
  }

  let transition = transitions.find(t => t.nextStep === selectedOption.nextStep);
  if (!transition) {
    transition = transitions.find(t => t.conditions === '-');
    if (!transition) {
      console.log(`Debug: No se encontró transición para prevStep=${currentStepId}, nextStep=${selectedOption.nextStep}`);
      return null;
    }
  }

  return transition.nextStep;
}

// Función para guardar informe en AsyncStorage
async function saveReport(flowId, flowName, history) {
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
async function markReportAsSynchronized(timestamp) {
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
async function getReports(setReports, flowId = null) {
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
async function getLatestReport(flowId, setSelectedReport) {
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
async function clearReportsWithAlert(setReports) {
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
async function saveFlowsToStorage(flows) {
  try {
    const data = {
      flows,
      timestamp: new Date().toISOString(),
    };
    await AsyncStorage.setItem('flows', JSON.stringify(data));
    console.log('Flujos guardados en AsyncStorage.');
  } catch (error) {
    console.log('Error guardando flujos:', error);
  }
}

// Función para cargar flujos desde AsyncStorage
async function loadFlowsFromStorage() {
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

// Función para sincronizar informes pendientes al recuperar la conexión
async function syncPendingReports(ws) {
  try {
    const reports = JSON.parse((await AsyncStorage.getItem('reports')) || '[]');
    const pendingReports = reports.filter(report => report.estado === 'Pendiente');
    console.log('Informes pendientes a sincronizar:', pendingReports); // Depuración
    if (pendingReports.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
      for (const report of pendingReports) {
        console.log('Enviando informe:', report); // Depuración
        ws.send(JSON.stringify({ type: 'REPORT', data: report }));
        // Opcional: Esperar confirmación (necesitaría un callback o timeout)
      }
    } else {
      console.log('No hay informes pendientes o WebSocket no está abierto');
    }
  } catch (error) {
    console.log('Error synchronizing pending reports:', error);
  }
}

// Función auxiliar para calcular el tiempo restante para el borrado automático
const formatRemainingTime = minutes => {
  const totalMinutes = minutes;
  const remainingMinutes = Math.floor(totalMinutes % 60);
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const days = Math.floor(totalMinutes / (24 * 60));

  let result = [];
  if (days > 0) {
    result.push(days > 1 ? `${days} días` : `${days} día`);
  }
  if (hours > 0) {
    result.push(`${hours} horas`);
  }
  if (remainingMinutes > 0) {
    result.push(`${remainingMinutes} minutos`);
  }

  return result.length > 0 ? result.join(' y ') : '0 minutos';
};

// Función auxiliar para formatear el timestamp
const formatTimestamp = timestamp => {
  const date = new Date(timestamp);
  return `${date.getDate()} de ${date.toLocaleString('es-ES', { month: 'long' })} de ${date.getFullYear()}, ${date.getHours()}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
};

// Función auxiliar para determinar el color del tiempo restante
const getTimeColor = timeRemaining => {
  const maxMinutes = 7 * 24 * 60; // 10,080 minutos
  const percentage = (timeRemaining / maxMinutes) * 100;
  return percentage >= 50 ? styles.remainingTimeGreen : percentage >= 15 ? styles.remainingTimeOrange : styles.remainingTimeRed;
};

// Función auxiliar para determinar el estilo del informe
const getItemStyle = history => {
  const lastStep = history[history.length - 1]?.stepTitle || '';
  return lastStep === 'InfPos' ? styles.greenItem : styles.redItem;
};

function MainApp() {
  const insets = useSafeAreaInsets();

  const [flows, setFlows] = useState([]);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [currentStepId, setCurrentStepId] = useState(null);
  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [reports, setReports] = useState([]);
  const [showReports, setShowReports] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const ws = useRef(null);
  const flatListRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 12;

  // 🔹 Función para conectar WebSocket con credenciales
  const connectWebSocket = (user, userPin) => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log('WebSocket conectado');
      setIsConnected(true);

      // Enviar credenciales al abrir la conexión
      ws.current.send(JSON.stringify({ type: 'LOGIN', data: { username: user, pin: userPin } }));
      syncPendingReports(ws.current);
    };

    ws.current.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        console.log('Mensaje recibido del backend:', message);

        switch (message.type) {
          case 'AUTH_OK':
            console.log('Autenticación exitosa');
            setIsAuthenticated(true);
            setIsLoading(true); // mostrar "Cargando..." tras login
            ws.current.send(JSON.stringify({ type: 'GET_FLOWS' }));
            break;

          case 'AUTH_ERROR':
            console.log('Error de autenticación: Credenciales incorrectas');
            Alert.alert('Error', 'Usuario o PIN incorrectos.');
            setIsAuthenticated(false);
            setIsLoading(false);
            ws.current.close();
            break;

          case 'FLOW':
            setFlows(prev => {
              const updated = [...prev.filter(f => f.id !== message.data.id), message.data];
              saveFlowsToStorage(updated); // actualizar almacenamiento local
              return updated.sort((a, b) => a.title[0].text.localeCompare(b.title[0].text));
            });
            break;

          case 'FLOW_REMOVED':
            setFlows(prev => {
              const updated = prev.filter(f => f.id !== message.data);
              saveFlowsToStorage(updated); // actualizar almacenamiento local
              return updated;
            });
            break;

          case 'ALL_FLOWS_SENT':
            setIsLoading(false);
            break;

          case 'UPDATE_FLOWS':
            console.log('Actualización de flujos detectada...');
            break;

          case 'REPORT_SAVED':
            console.log(`Informe guardado en backend: ${message.data}`);
            markReportAsSynchronized(message.data).catch(console.log);
            break;

          case 'PARTIAL_FLOW_SAVED':
            console.log(`Flujo parcial guardado: ${message.data}`);
            break;

          case 'ERROR':
            console.log(`Error del servidor: ${message.data}`);
            break;

          default:
            console.log(`Mensaje desconocido: ${message.type}`);
        }
      } catch (err) {
        console.log('Error parsing WebSocket message:', err);
      }
    };

    ws.current.onerror = error => {
      console.error('Error WebSocket:', error.message);
      setIsConnected(false);
    };

    ws.current.onclose = event => {
      console.log('WebSocket desconectado', event);
      setIsConnected(false);

      if (isAuthenticated) {
        console.log('Reconexión automática porque ya está autenticado...');
        setTimeout(() => connectWebSocket(username, pin), 5000);
      }
    };
  };

  // 🔹 Cargar flujos almacenados en el dispositivo al iniciar
  useEffect(() => {
    const initializeApp = async () => {
      const storedFlows = await loadFlowsFromStorage();
      if (storedFlows) {
        setFlows(storedFlows);
      }

      const netInfo = await NetInfo.fetch();
      setIsConnected(netInfo.isConnected);

      const unsubscribe = NetInfo.addEventListener(state => {
        setIsConnected(state.isConnected);
      });

      return () => {
        unsubscribe();
        if (ws.current) {
          ws.current.close();
          ws.current = null;
        }
      };
    };

    initializeApp();
  }, []);

  // Sincronizar informes al reconectar
  useEffect(() => {
    const syncData = async () => {
      if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
        await syncPendingReports(ws.current); // Esperar a que se complete
      } else if (isConnected && (!ws.current || ws.current.readyState === WebSocket.CLOSED)) {
        connectWebSocket(); // Reconectar si es necesario
      }
    };
    syncData();
  }, [isConnected]);

  // 🔹 Manejo del login
  const handleLogin = () => {
    if (!username || !pin) {
      Alert.alert('Error', 'Por favor, ingresa usuario y PIN.');
      return;
    }

    // Cerrar socket previo si existe
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    // Abrir conexión con credenciales
    connectWebSocket(username, pin);
  };

  // Seleccionar un flujo
  const handleSelectFlow = flow => {
    setSelectedFlow(flow);
    setCurrentStepId(null);
    setHistory([]);
    setMessages([]);
    setInputValue('');
    setShowReports(false);
    setSelectedReport(null);
  };

  // Iniciar el flujo
  const handleStartFlow = () => {
    const initialStep = findStep(selectedFlow.stepID, selectedFlow);
    setCurrentStepId(selectedFlow.stepID);
    if (initialStep) {
      setMessages([
        {
          id: Date.now(),
          text: `${initialStep.description[0].text}\n${cleanAssistantMessage(initialStep.question[0].text)}`,
          isUser: false,
        },
      ]);
    }
  };

  // Manejar selección de opción o entrada de texto
  const handleOptionPress = optionText => {
    const { stepNameToId, graph } = processFlow(selectedFlow);
    const step = findStep(currentStepId, selectedFlow);
    const options = step ? parseOptions(step.question[0].text, stepNameToId, graph[currentStepId] || []) : [];
    const isTextInput = options.length > 0 && options[0].isTextInput;
    const nextStepId = findNextStep(currentStepId, isTextInput ? 'Continuar' : optionText, selectedFlow, graph, stepNameToId, isTextInput);

    if (nextStepId) {
      setMessages(prev => [...prev, { id: Date.now(), text: isTextInput ? optionText : optionText, isUser: true }]);
      const newHistory = [
        ...history,
        { stepId: currentStepId, stepTitle: step.title[0].text, option: isTextInput ? optionText : optionText },
      ];
      setHistory(newHistory);
      setCurrentStepId(nextStepId);
      setInputValue('');

      if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            type: 'PARTIALFLOW',
            data: { flowId: selectedFlow.id, stepId: currentStepId, responses: newHistory },
          })
        );
      }

      const nextStep = findStep(nextStepId, selectedFlow);
      if (nextStepId !== '0' && nextStep) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            text: `${nextStep.description[0].text}\n${cleanAssistantMessage(nextStep.question[0].text)}`,
            isUser: false,
          },
        ]);
      } else if (nextStepId === '0') {
        saveReport(selectedFlow.id, selectedFlow.title[0].text, newHistory).then(report => {
          if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'REPORT', data: report }));
          }
        });
      }
    } else {
      Alert.alert('Error', 'No se encontró el siguiente paso. Verifica la configuración del flujo.');
      console.log(
        `Debug: No se encontró nextStepId para currentStepId=${currentStepId}, optionText=${optionText}, isTextInput=${isTextInput}`
      );
    }
  };

  // Manejar botón "Continuar" para estados finales
  const handleContinue = () => {
    const { stepNameToId, graph } = processFlow(selectedFlow);
    const step = findStep(currentStepId, selectedFlow);
    const nextStepId = findNextStep(currentStepId, null, selectedFlow, graph, stepNameToId);

    if (nextStepId) {
      const newHistory = [...history, { stepId: currentStepId, stepTitle: step.title[0].text, option: 'Continuar' }];
      setHistory(newHistory);
      setCurrentStepId(nextStepId);

      if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            type: 'PARTIALFLOW',
            data: { flowId: selectedFlow.id, stepId: currentStepId, responses: newHistory },
          })
        );
      }

      const nextStep = findStep(nextStepId, selectedFlow);
      if (nextStepId !== '0' && nextStep) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now(),
            text: `${nextStep.description[0].text}\n${cleanAssistantMessage(nextStep.question[0].text)}`,
            isUser: false,
          },
        ]);
      } else if (nextStepId === '0') {
        saveReport(selectedFlow.id, selectedFlow.title[0].text, newHistory).then(report => {
          if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'REPORT', data: report }));
          }
        });
      }
    } else {
      Alert.alert('Error', 'No se encontró el siguiente paso.');
    }
  };

  // Mostrar pantalla de informes filtrados por flujo o todos
  const handleShowReports = (flowId = null) => {
    getReports(setReports, flowId);
    setShowReports(true);
  };

  // Mostrar el último informe
  const handleShowLatestReport = () => {
    getLatestReport(selectedFlow.id, setSelectedReport);
  };

  // Pantalla de login
  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center' }]}>
        <View style={styles.loginCard}>
          <Feather name="user" size={60} color="#007AFF" style={styles.loginIcon} />

          <Text style={styles.loginTitle}>Inicio de Sesión</Text>

          <TextInput style={styles.loginInput} value={username} onChangeText={setUsername} placeholder="Usuario" autoCapitalize="none" />
          <TextInput style={styles.loginInput} value={pin} onChangeText={setPin} placeholder="PIN" secureTextEntry keyboardType="numeric" />

          <TouchableOpacity
            style={[styles.loginButton, (!username || !pin) && styles.loginButtonDisabled]}
            onPress={handleLogin}
            activeOpacity={0.7}
            disabled={!username || !pin} // Desactivar si los campos están vacíos
          >
            <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Pantalla de carga tras login válido
  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Cargando flujos...</Text>
      </View>
    );
  }

  // Pantalla de selección de flujo
  if (!selectedFlow && !showReports && !selectedReport) {
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

        <TouchableOpacity style={styles.clearReportsButton} onPress={() => clearReportsWithAlert(setReports)} activeOpacity={0.7}>
          <Text style={styles.buttonText}>Limpiar Informes</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Pantalla intermedia: descripción del flujo y opciones
  if (selectedFlow && !currentStepId && !showReports && !selectedReport) {
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
          <TouchableOpacity style={styles.backButton} onPress={() => setSelectedFlow(null)} activeOpacity={0.7}>
            <Text style={styles.buttonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Pantalla de informes (filtrados por flujo o todos)
  if (showReports) {
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
  }

  // Pantalla de último informe
  if (selectedReport) {
    const formattedDate = formatTimestamp(selectedReport.timestamp);
    const timeColor = getTimeColor(selectedReport.timeRemaining);
    const itemStyle = getItemStyle(selectedReport.history);

    return (
      <View style={[styles.container, { paddingTop: insets.top, flex: 1 }]}>
        <View style={[styles.connectionStatus, { marginBottom: 5 }]}>
          <Feather name={isConnected ? 'wifi' : 'wifi-off'} size={24} color={isConnected ? 'green' : 'red'} style={{ marginRight: 8 }} />
          <Text style={[styles.connectionText, isConnected ? styles.connected : styles.disconnected]}>
            {isConnected ? 'Conectado' : 'Sin conexión'}
          </Text>
        </View>

        <Text style={styles.title}>Último Informe de {selectedFlow.title[0].text}</Text>
        <View style={{ flex: 1 }}>
          {selectedReport ? (
            <View style={[styles.historyItem, itemStyle]}>
              <Text style={styles.historyText}>Flujo: {selectedReport.flowName}</Text>
              <Text style={styles.historySubText}>Informe realizado el {formattedDate}.</Text>
              <Text style={styles.historySubText}>Estado: {selectedReport.estado}.</Text>
              <Text style={styles.historySubText}>Usuario: {selectedReport.user}.</Text>
              <View style={{ height: 10 }} />
              <Text style={styles.historySubText}>Detalles del informe:</Text>
              <FlatList
                data={selectedReport.history}
                keyExtractor={(step, index) => index.toString()}
                renderItem={({ item: step }) => (
                  <Text style={styles.historySubText}>
                    - Paso: {step.stepTitle}, Respuesta: {step.option}
                  </Text>
                )}
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
  }

  // Pantalla final con historial
  if (currentStepId === '0') {
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
                Paso: {item.stepTitle} - Respuesta: {item.option}
              </Text>
              <Text style={styles.historySubText}>Realizado: {item.timestamp}</Text>
            </View>
          )}
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
  }

  // Pantalla de chat
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

      <Text style={[styles.title, { fontSize: 18, marginBottom: 10 }]}>{selectedFlow?.title[0].text || 'Flujo sin título'}</Text>

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
            Alert.alert('¿Desea volver?', 'El avance realizado en el flujo se descartará.', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Sí',
                onPress: () => {
                  setCurrentStepId(null);
                  setMessages([]);
                  setInputValue('');
                  setHistory([]);
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
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <MainApp />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
