import React, { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Importación de funciones
import { processFlow, parseOptions, cleanAssistantMessage, findStep, findNextStep } from './utils/functions';
import {
  saveReport,
  markReportAsSynchronized,
  getReports,
  getLatestReport,
  clearReportsWithAlert,
  saveFlowsToStorage,
  loadFlowsFromStorage,
} from './services/storage';

// Importación de pantallas
import LoadingScreen from './screens/LoadingScreen';
import FlowSelectionScreen from './screens/FlowSelectionScreen';
import FlowDescriptionScreen from './screens/FlowDescriptionScreen';
import ReportsScreen from './screens/ReportsScreen';
import LastReportScreen from './screens/LastReportScreen';
import FinalScreen from './screens/FinalScreen';
import ChatScreen from './screens/ChatScreen';

// Configuración WebSocket
const WS_URL = 'ws://192.168.1.20:8080'; //Cambiar la IP por localhost si hacemos pruebas en el ordenador
const PIN = '1234';

// Función para sincronizar informes pendientes al recuperar la conexión
async function syncPendingReports(ws) {
  try {
    const reports = JSON.parse((await AsyncStorage.getItem('reports')) || '[]');
    const pendingReports = reports.filter(report => report.estado === 'Pendiente');
    console.log('Informes pendientes a sincronizar:', pendingReports.length); // Depuración concisa
    if (pendingReports.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
      for (const report of pendingReports) {
        console.log('Enviando informe: flowId=', report.flowId, 'timestamp=', report.timestamp); // Depuración concisa
        ws.send(JSON.stringify({ type: 'REPORT', data: report }));
        // Opcional: Esperar confirmación (necesitaría un callback o timeout)
      }
    } else {
      console.log('No hay informes pendientes o WebSocket no está abierto');
    }
  } catch (error) {
    console.log('Error synchronizing pending reports:', error.message);
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
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const ws = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 12;
  const flatListRef = useRef(null);

  const connectWebSocket = () => {
    if (isAuthenticating || (ws.current && ws.current.readyState === WebSocket.OPEN)) return;

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    setIsAuthenticating(true);
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log('WebSocket conectado');
      reconnectAttempts.current = 0;
      setIsConnected(true);
      ws.current.send(JSON.stringify({ type: 'LOGIN', data: { username: 'admin', pin: '1234' } }));
      syncPendingReports(ws.current);
    };

    ws.current.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        console.log('Mensaje recibido del servidor:', message.type); // Log general conciso
        switch (message.type) {
          case 'AUTH_OK':
            console.log('Autenticación exitosa');
            setIsAuthenticating(false); // Resetear bandera tras autenticación
            ws.current.send(JSON.stringify({ type: 'GET_FLOWS' }));
            break;
          case 'FLOW':
            console.log('Recibido FLOW: id=', message.data.id, 'title=', message.data.title[0]?.text, 'stepID=', message.data.stepID); // Log conciso
            setFlows(prevFlows => {
              const updatedFlows = [...prevFlows.filter(f => f.id !== message.data.id), message.data];
              return updatedFlows.sort((a, b) => a.title[0].text.localeCompare(b.title[0].text));
            });
            break;
          case 'FLOW_REMOVED':
            console.log('Recibido FLOW_REMOVED: id=', message.data); // Log añadido
            setFlows(prevFlows => {
              const updatedFlows = prevFlows.filter(f => f.id !== message.data);
              saveFlowsToStorage(updatedFlows);
              return updatedFlows.sort((a, b) => a.title[0].text.localeCompare(b.title[0].text));
            });
            break;
          case 'ALL_FLOWS_SENT':
            console.log('Recibido ALL_FLOWS_SENT, guardando flujos'); // Log conciso
            saveFlowsToStorage(flows);
            setIsLoading(false);
            break;
          case 'UPDATE_FLOWS':
            console.log('Actualización de flujos detectada, procesando cambios en tiempo real...');
            break;
          case 'REPORT_SAVED':
            console.log('Confirmación recibida: REPORT_SAVED para timestamp=', message.data);
            markReportAsSynchronized(message.data).catch(error => console.log('Error marking report as synchronized:', error.message));
            break;
          case 'PARTIAL_FLOW_SAVED':
            console.log('Confirmación recibida: PARTIAL_FLOW_SAVED para flowId=', message.data);
            break;
          case 'AUTH_ERROR':
            console.log('Error de autenticación: PIN incorrecto');
            setIsConnected(false);
            ws.current.close();
            break;
          case 'ERROR':
            console.log(`Error del servidor: ${message.data}`);
            break;
          default:
            console.log(`Mensaje desconocido: ${message.type}`);
        }
      } catch (err) {
        console.log('Error parsing WebSocket message:', err.message);
      }
    };

    ws.current.onerror = error => {
      console.error('Error WebSocket:', error.message);
      setIsConnected(false);
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(Math.pow(2, reconnectAttempts.current) * 1000, 300000);
        console.log(`Reintentando conexión en ${delay / 1000} segundos...`);
        reconnectAttempts.current += 1;
        setTimeout(connectWebSocket, delay);
      }
    };

    ws.current.onclose = event => {
      console.log('WebSocket desconectado', event.code);
      setIsConnected(false);
      setIsAuthenticating(false); // Resetear bandera en caso de cierre
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(Math.pow(2, reconnectAttempts.current) * 1000, 300000);
        console.log(`Reintentando conexión en ${delay / 1000} segundos...`);
        reconnectAttempts.current += 1;
        setTimeout(connectWebSocket, delay);
      }
    };
  };

  // Inicializar aplicación y manejar conexión
  useEffect(() => {
    const initializeApp = async () => {
      setIsLoading(true);

      const storedFlows = await loadFlowsFromStorage();
      if (storedFlows) {
        console.log('Flujos cargados desde AsyncStorage:', storedFlows.length); // Log conciso
        setFlows(storedFlows);
        setIsLoading(false);
      }

      const netInfo = await NetInfo.fetch();
      setIsConnected(netInfo.isConnected);

      if (netInfo.isConnected) {
        connectWebSocket();
      } else if (!storedFlows) {
        setIsLoading(false);
      }

      const unsubscribe = NetInfo.addEventListener(state => {
        setIsConnected(state.isConnected);
        if (state.isConnected && (!ws.current || ws.current.readyState === WebSocket.CLOSED)) {
          connectWebSocket();
        }
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
        await syncPendingReports(ws.current);
      } else if (isConnected && (!ws.current || ws.current.readyState === WebSocket.CLOSED)) {
        connectWebSocket();
      }
    };
    syncData();
  }, [isConnected]);

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
        const partialFlowMessage = {
          type: 'PARTIALFLOW',
          data: { flowId: selectedFlow.id, stepId: currentStepId, responses: newHistory },
        };
        console.log('Enviando PARTIALFLOW: flowId=', selectedFlow.id, 'stepId=', currentStepId); // Log conciso
        ws.current.send(JSON.stringify(partialFlowMessage));
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
            const reportMessage = { type: 'REPORT', data: report };
            console.log('Enviando REPORT: flowId=', report.flowId, 'timestamp=', report.timestamp); // Log conciso
            ws.current.send(JSON.stringify(reportMessage));
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
        const partialFlowMessage = {
          type: 'PARTIALFLOW',
          data: { flowId: selectedFlow.id, stepId: currentStepId, responses: newHistory },
        };
        console.log('Enviando PARTIALFLOW: flowId=', selectedFlow.id, 'stepId=', currentStepId); // Log conciso
        ws.current.send(JSON.stringify(partialFlowMessage));
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
            const reportMessage = { type: 'REPORT', data: report };
            console.log('Enviando REPORT: flowId=', report.flowId, 'timestamp=', report.timestamp); // Log conciso
            ws.current.send(JSON.stringify(reportMessage));
          }
        });
      }
    } else {
      Alert.alert('Error', 'No se encontró el siguiente paso.');
    }
  };

  // Mostrar pantalla de informes filtrados por flujo o todos
  const handleShowReports = (flowId = null) => {
    getReports(setReports, flowId, isConnected);
    setShowReports(true);
  };

  // Mostrar el último informe
  const handleShowLatestReport = () => {
    getLatestReport(selectedFlow.id, setSelectedReport);
  };

  // Pantalla de carga
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
        onBack={() => setSelectedFlow(null)}
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
        selectedFlow={selectedFlow}
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
  const step = findStep(currentStepId, selectedFlow);
  const options = step
    ? parseOptions(step.question[0].text, processFlow(selectedFlow).stepNameToId, processFlow(selectedFlow).graph[currentStepId] || [])
    : [];
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
      step={step}
      options={options}
      isConnected={isConnected}
      insets={insets}
    />
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
