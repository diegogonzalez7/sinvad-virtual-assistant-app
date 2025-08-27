import React, { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Importación de funciones
import {
  saveReport,
  markReportAsSynchronized,
  getReports,
  getLatestReport,
  clearReportsWithAlert,
  saveFlowsToStorage,
  loadFlowsFromStorage,
  storeCredentials,
  loadCredentials,
  clearCredentials,
} from './services/storage';
import { processFlow, parseOptions, cleanAssistantMessage, findStep, findNextStep } from './utils/functions';

// Importación de pantallas
import LoginScreen from './screens/LoginScreen';
import LoadingScreen from './screens/LoadingScreen';
import FlowSelectionScreen from './screens/FlowSelectionScreen';
import FlowDescriptionScreen from './screens/FlowDescriptionScreen';
import ReportsScreen from './screens/ReportsScreen';
import LastReportScreen from './screens/LastReportScreen';
import FinalScreen from './screens/FinalScreen';
import ChatScreen from './screens/ChatScreen';

// Configuración WebSocket
const WS_URL = 'ws://localhost:8080'; // Cambiar la IP por localhost si haces pruebas en el ordenador

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
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log('WebSocket conectado');
      setIsConnected(true);
      if (user && userPin) {
        ws.current.send(JSON.stringify({ type: 'LOGIN', data: { username: user, pin: userPin } }));
      }
      syncPendingReports(ws.current);
    };

    ws.current.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'AUTH_OK':
            console.log('Autenticación exitosa con backend');
            setIsAuthenticated(true);
            if (!username || !pin) {
              setUsername(user);
              setPin(userPin);
              storeCredentials(user, userPin);
            }
            ws.current.send(JSON.stringify({ type: 'GET_FLOWS' }));
            break;

          case 'AUTH_ERROR':
            console.log('Error de autenticación con backend: Credenciales incorrectas');
            if (user && userPin) {
              clearCredentials();
            }
            Alert.alert('Error', 'Usuario o PIN incorrectos en el backend. Usando modo offline.');
            break;

          case 'FLOW':
            setFlows(prev => {
              const updated = [...prev.filter(f => f.id !== message.data.id), message.data];
              saveFlowsToStorage(updated);
              return updated.sort((a, b) => a.title[0].text.localeCompare(b.title[0].text));
            });
            break;

          case 'FLOW_REMOVED':
            setFlows(prev => {
              const updated = prev.filter(f => f.id !== message.data);
              saveFlowsToStorage(updated);
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
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        console.log(`Reconexión intento ${reconnectAttempts.current}/${maxReconnectAttempts}`);
        const reconnectDelay = 5000 * Math.min(reconnectAttempts.current, 3);
        setTimeout(async () => {
          const storedCredentials = await loadCredentials();
          if (storedCredentials) {
            connectWebSocket(storedCredentials.username, storedCredentials.pin);
          }
        }, reconnectDelay);
      }
    };
  };

  // 🔹 Cargar credenciales y flujos almacenados al iniciar
  useEffect(() => {
    const initializeApp = async () => {
      const storedCredentials = await loadCredentials();
      if (storedCredentials) {
        setUsername(storedCredentials.username);
        setPin(storedCredentials.pin);
        setCredentialExpiration(storedCredentials.expiration); // Guardar la fecha de expiración
        setIsAuthenticated(true); // Autenticación local basada en credenciales almacenadas
      } else if (isConnected) {
        // Si no hay credenciales y hay conexión, forzar login
        setIsAuthenticated(false);
      }

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

  // Sincronizar informes y reconectar al cambiar la conexión
  useEffect(() => {
    const syncData = async () => {
      if (isConnected && (!ws.current || ws.current.readyState === WebSocket.CLOSED)) {
        const storedCredentials = await loadCredentials();
        if (storedCredentials) {
          connectWebSocket(storedCredentials.username, storedCredentials.pin);
        }
      } else if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
        await syncPendingReports(ws.current);
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
    setIsAuthenticated(true); // Autenticación local inmediata
    storeCredentials(username, pin); // Guardar credenciales de forma segura con caducidad de 1 minuto
    if (isConnected) {
      connectWebSocket(username, pin); // Intentar autenticación con backend si hay conexión
    }
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
      <LoginScreen username={username} setUsername={setUsername} pin={pin} setPin={setPin} handleLogin={handleLogin} insets={insets} />
    );
  }

  // Pantalla de carga tras login válido
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Pantalla de selección de flujo
  if (!selectedFlow && !showReports && !selectedReport) {
    return (
      <FlowSelectionScreen
        flows={flows}
        handleSelectFlow={handleSelectFlow}
        handleShowReports={handleShowReports}
        clearReportsWithAlert={() => clearReportsWithAlert(setReports)}
        isConnected={isConnected}
        insets={insets}
      />
    );
  }

  // Pantalla intermedia: descripción del flujo y opciones
  if (selectedFlow && !currentStepId && !showReports && !selectedReport) {
    return (
      <FlowDescriptionScreen
        selectedFlow={selectedFlow}
        handleStartFlow={handleStartFlow}
        handleShowReports={handleShowReports}
        handleShowLatestReport={handleShowLatestReport}
        isConnected={isConnected}
        insets={insets}
        onBack={() => setSelectedFlow(null)} // Pasar la función como prop
      />
    );
  }

  // Pantalla de informes (filtrados por flujo o todos)
  if (showReports) {
    return (
      <ReportsScreen
        reports={reports}
        showReports={showReports}
        selectedFlow={selectedFlow}
        setShowReports={setShowReports}
        isConnected={isConnected}
        insets={insets}
      />
    );
  }

  // Pantalla de último informe
  if (selectedReport) {
    return (
      <LastReportScreen
        selectedReport={selectedReport}
        selectedFlow={selectedFlow} // Añadido para mostrar el nombre del flujo en el título
        setSelectedReport={setSelectedReport}
        isConnected={isConnected}
        insets={insets}
      />
    );
  }

  // Pantalla final con historial
  if (currentStepId === '0') {
    return (
      <FinalScreen
        history={history}
        selectedFlow={selectedFlow}
        setSelectedFlow={setSelectedFlow}
        setHistory={setHistory}
        setMessages={setMessages}
        setInputValue={setInputValue}
        setShowReports={setShowReports}
        setSelectedReport={setSelectedReport}
        isConnected={isConnected}
        insets={insets}
      />
    );
  }

  // Pantalla de chat
  if (currentStepId) {
    return (
      <ChatScreen
        currentStepId={currentStepId}
        selectedFlow={selectedFlow}
        messages={messages}
        setMessages={setMessages}
        inputValue={inputValue}
        setInputValue={setInputValue}
        handleOptionPress={handleOptionPress}
        handleContinue={handleContinue}
        setCurrentStepId={setCurrentStepId}
        setHistory={setHistory}
        flatListRef={flatListRef}
        isConnected={isConnected}
        insets={insets}
      />
    );
  }
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
