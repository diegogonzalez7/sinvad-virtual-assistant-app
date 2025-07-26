# Frontend App

## Descripción del Proyecto

El frontend es una aplicación móvil desarrollada en React Native que permite a los usuarios interactuar con flujos (flows) obtenidos desde el backend a través de un servidor WebSocket. Soporta modo online y offline, mostrando flujos almacenados localmente en `AsyncStorage` cuando no hay conexión. Los usuarios pueden seleccionar flujos, responder preguntas, generar informes, y visualizar el historial de respuestas. La aplicación también sincroniza informes pendientes al reconectarse y actualiza la lista de flujos en tiempo real cuando se añaden o eliminan en el backend.

### Funcionalidades Clave

- **Conexión WebSocket**: Comunica con el backend (`ws://localhost:8080`) para recibir flujos y enviar flujos parciales e informes.
- **Modo Offline**: Usa `AsyncStorage` para almacenar flujos e informes, permitiendo operar sin conexión.
- **Sincronización Automática**: Añade o elimina flujos en tiempo real mediante mensajes `FLOW` y `FLOW_REMOVED`.
- **Gestión de Flujos**: Permite seleccionar flujos, navegar por pasos (`steps`), y responder opciones o entradas de texto.
- **Informes**: Guarda informes localmente (`Pendiente`) y los sincroniza con el backend (`Sincronizado`) al reconectar.
- **Interfaz Intuitiva**: Muestra indicadores de conexión, lista de flujos, chat interactivo, e historial de informes.

## Detalles de Implementación

### Estructura de Archivos

- **`App.js`**: Componente principal que maneja la lógica de la aplicación, incluyendo conexión WebSocket, estado, y navegación.
- **`styles.js`**: Estilos de la interfaz de usuario.
- **`node_modules`**: Dependencias de React Native y bibliotecas adicionales.

### Lógica Principal

1. **Inicialización**:

   - Carga flujos desde `AsyncStorage` usando `loadFlowsFromStorage`.
   - Verifica la conexión con `NetInfo` y establece el WebSocket si hay conexión.
   - Configura un listener para cambios en el estado de conexión, reconectando automáticamente si es necesario.

2. **Manejo de WebSocket**:

   - Conecta a `WS_URL` (por defecto `ws://localhost:8080`) y autentica con un PIN (`123456`). Autenticación simulada provisionalmente.
   - Maneja mensajes:
     - **AUTH_OK**: Confirma autenticación y solicita flujos (`GET_FLOWS`).
     - **FLOW**: Añade o actualiza un flujo en `flows` y `AsyncStorage`, actualizando la lista en tiempo real.
     - **FLOW_REMOVED**: Elimina un flujo de `flows` y `AsyncStorage`.
     - **ALL_FLOWS_SENT**: Finaliza la carga inicial de flujos y desactiva el estado de carga.
     - **REPORT_SAVED**: Marca informes como `Sincronizado` en `AsyncStorage`.
     - **PARTIAL_FLOW_SAVED**: Confirma almacenamiento de flujos parciales.
   - Reintenta conexiones hasta 5 veces con retrasos crecientes.

3. **Navegación de Flujos**:

   - **Selección de Flujo**: Muestra una lista de flujos ordenada alfabéticamente.
   - **Navegación por Pasos**: Usa `processFlow`, `parseOptions`, y `findNextStep` para manejar transiciones basadas en `nextSteps` y respuestas del usuario.
   - **Chat Interactivo**: Muestra preguntas y opciones en un `FlatList`, con soporte para entradas de texto (`TextInput`) y botones.

4. **Gestión de Informes**:

   - Guarda informes en `AsyncStorage` con estado `Pendiente` (`saveReport`).
   - Sincroniza informes pendientes al reconectar (`syncData`).
   - Permite ver todos los informes o el último informe por flujo (`getReports`, `getLatestReport`).
   - Opción para limpiar informes (`clearReports`).

5. **Modo Offline**:
   - Carga flujos e informes desde `AsyncStorage` si no hay conexión.
   - Guarda flujos parciales e informes localmente hasta que se restablezca la conexión.

### Tecnologías Utilizadas

- **React Native**: Framework para la interfaz móvil.
- **WebSocket**: Comunicación en tiempo real con el backend.
- **AsyncStorage**: Almacenamiento local para flujos e informes.
- **NetInfo**: Detección del estado de conexión.
- **Expo**: Herramienta para desarrollo y prueba de la aplicación.

### Notas

- La `WS_URL` debe actualizarse a la IP local del ordenador (ej. `ws://192.168.1.100:8080`) si se usa un dispositivo físico.
- La autenticación usa un PIN estático. En el futuro, se integrará con `email`/`password` si SINVAD lo soporta.
