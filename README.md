# SINVAD Mobile App

## Descripción General

Esta aplicación móvil, desarrollada como parte de un Trabajo de Fin de Grado (TFG), permite a los usuarios interactuar con flujos (flows) obtenidos desde la API de SINVAD. Consta de dos componentes principales:

- **Backend (`backend_app`)**: Un servidor Node.js con WebSocket que sincroniza flujos desde SINVAD, los almacena en SQLite, y los envía al frontend.
- **Frontend (`frontend_app`)**: Una aplicación React Native que muestra flujos, permite responder preguntas, generar informes, y operar en modo offline.

La aplicación soporta sincronización en tiempo real de flujos (añadir/eliminar), almacenamiento de flujos parciales e informes, y sincronización automática de datos pendientes al reconectarse. La comunicación entre el frontend y el backend se realiza mediante WebSocket, con autenticación basada en PIN.

## Guía para Ejecutar la Aplicación

### Requisitos Previos

- **Node.js** (v16 o superior): [Descargar](https://nodejs.org/).
- **npm**: Incluido con Node.js.
- **Expo CLI**: Para el frontend.
  ```bash
  npm install -g expo-cli
  ```
- **Expo Go**: App móvil para pruebas (iOS/Android).
- **SQLite**: No requiere instalación adicional (usado por `sqlite3` en el backend).
- **Git**: Para clonar y gestionar el repositorio.
- Un ordenador con acceso a la misma red Wi-Fi que el dispositivo móvil (si usas un dispositivo físico).

### Clonar el Repositorio

1. Clona el repositorio desde GitHub:
   ```bash
   git clone https://github.com/<tu-usuario>/react_apps.git
   cd react_apps
   ```

### Configurar el Backend (`backend_app`)

1. Navega al directorio:
   ```bash
   cd backend_app
   ```
2. Instala las dependencias:
   ```bash
   npm install ws sqlite3 axios dotenv
   ```
3. Crea o verifica el archivo `.env` en `backend_app` con el siguiente contenido:
   ```env
   WS_PORT=8080
   SINVAD_API_URL=https://sinvad.pro.srec.solutions/v1
   SINVAD_API_KEY=ff116e31fbb518615f0a5dc26d371b13
   USER_PWD=-1432702675
   PROFILE_ID=1617036284204867
   ```
4. Inicia el servidor:
   ```bash
   node server.js
   ```
   - **Salida esperada**:
     ```
     Conectado a SQLite (app.db)
     Tablas creadas exitosamente
     Usuario de prueba creado: admin (PIN: 123456)
     Obteniendo flujos desde SINVAD...
     Flujo nuevo <id> guardado correctamente
     ...
     Servidor WebSocket iniciado en ws://localhost:8080
     ```

### Configurar el Frontend (`frontend_app`)

1. Navega al directorio:
   ```bash
   cd ../frontend_app
   ```
2. Instala las dependencias:
   ```bash
   npm install @react-native-async-storage/async-storage @react-native-community/netinfo
   ```
3. Si usas un dispositivo físico, actualiza `WS_URL` en `frontend_app/App.js` con la IP local de tu ordenador:
   ```javascript
   const WS_URL = "ws://<tu-ip-local>:8080"; // Ejemplo: ws://192.168.1.100:8080
   ```
   Encuentra tu IP:
   - Windows: `ipconfig` (busca `IPv4 Address`).
   - Mac/Linux: `ifconfig` o `ip addr`.
4. Inicia la aplicación:
   ```bash
   npx expo start --clear
   ```
   - Escanea el código QR con la app Expo Go en tu dispositivo móvil.
   - Alternativamente, usa un emulador (Android Studio o Xcode).

### Pruebas

1. **Modo Online**:

   - Asegúrate de que el backend esté ejecutándose.
   - Abre la app en Expo Go.
   - Verifica que el indicador muestre "Conectado" (verde).
   - Selecciona un flujo, complétalo, y confirma que el informe se guarda como `Sincronizado`.
   - Añade un flujo en SINVAD y verifica que aparece automáticamente.
   - Elimina un flujo en SINVAD y verifica que desaparece automáticamente.

2. **Modo Offline**:

   - Detén el servidor backend o desactiva Wi-Fi.
   - Verifica que el indicador muestre "Sin conexión" (rojo).
   - Confirma que los flujos almacenados en `AsyncStorage` se muestran.
   - Completa un flujo y verifica que el informe se guarda como `Pendiente`.

3. **Reconexión**:
   - Inicia el backend o reconecta Wi-Fi.
   - Confirma que los informes `Pendiente` se sincronizan (`Sincronizado`).

### Depuración

- **Consola del Backend**:
  - Busca mensajes como `Flujo nuevo <id> guardado correctamente`, `Flujo <id> eliminado`, `Mensaje recibido del cliente`.
  - Verifica errores en solicitudes a SINVAD o SQLite.
- **Consola del Frontend**:
  - Abre DevTools en el navegador o Expo.
  - Busca mensajes como `WebSocket conectado`, `Flujo recibido: <id>`, `Flujo eliminado: <id>`.
- **Base de Datos**:
  ```bash
  sqlite3 backend_app/app.db
  SELECT * FROM flows;
  SELECT * FROM reports;
  SELECT * FROM partial_flows;
  ```
- **AsyncStorage**:
  ```javascript
  await AsyncStorage.getItem("flows");
  await AsyncStorage.getItem("reports");
  ```

### Notas

- Si usas un dispositivo físico, asegúrate de que el frontend y el backend estén en la misma red Wi-Fi.
- Para limpiar datos:
  - Backend: `del backend_app/app.db` (Windows) o `rm backend_app/app.db` (Mac/Linux).
  - Frontend: `await AsyncStorage.clear()` en la consola de DevTools.
