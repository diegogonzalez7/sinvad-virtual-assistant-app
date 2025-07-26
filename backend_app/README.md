# Backend App

## Descripción del Proyecto

El backend de esta aplicación es un servidor WebSocket desarrollado en Node.js que actúa como intermediario entre la API de SINVAD y la aplicación frontend en React Native. Su propósito principal es gestionar la sincronización de flujos (flows) desde SINVAD, almacenarlos localmente en una base de datos SQLite (`app.db`), y enviarlos al frontend a través de WebSocket. También maneja la autenticación de usuarios mediante PIN, el almacenamiento de flujos parciales e informes, y la sincronización automática de datos cada 5 minutos.

### Funcionalidades Clave

- **Integración con SINVAD**: Obtiene flujos desde la API de SINVAD usando credenciales (`apiKey`, `userPwd`, `profileId`).
- **Sincronización de Flujos**: Actualiza la base de datos local con flujos nuevos o eliminados desde SINVAD cada 5 minutos, enviando actualizaciones al frontend (`FLOW`, `FLOW_REMOVED`).
- **Autenticación**: Verifica usuarios mediante un PIN almacenado en la tabla `users` de SQLite.
- **Almacenamiento Local**: Guarda flujos, flujos parciales e informes en `app.db` con tablas `flows`, `partial_flows`, y `reports`.
- **Comunicación WebSocket**: Gestiona conexiones con el frontend, enviando flujos y recibiendo flujos parciales e informes.
- **Depuración**: Registra mensajes detallados en la consola para facilitar la resolución de problemas.

## Detalles de Implementación

### Estructura de Archivos

- **`server.js`**: Script principal que inicializa el servidor WebSocket, conecta con SQLite, y maneja la lógica de sincronización y comunicación.
- **`.env`**: Archivo de configuración con variables de entorno (`WS_PORT`, `SINVAD_API_URL`, `SINVAD_API_KEY`, `USER_PWD`, `PROFILE_ID`).
- **`app.db`**: Base de datos SQLite que almacena:
  - **flows**: Flujos completos (`id`, `title`, `description`, `stepID`, `steps`, `nextSteps`).
  - **reports**: Informes completados (`flowId`, `flowName`, `history`, `timestamp`).
  - **partial_flows**: Flujos parciales (`flowId`, `stepId`, `responses`, `timestamp`).
  - **users**: Usuarios para autenticación (`username`, `pin`).

### Lógica Principal

1. **Inicialización**:

   - Conecta a SQLite y crea las tablas necesarias (`flows`, `reports`, `partial_flows`, `users`).
   - Inserta un usuario de prueba (`admin`, PIN: `123456`). De momento, en esta versión, la autenticación está simulada, así como la identificación mediante PIN.
   - Inicia el servidor WebSocket en el puerto configurado (`8080`).

2. **Sincronización con SINVAD**:

   - La función `fetchFlows` realiza una solicitud GET a `SINVAD_API_URL/command/command?steps=true` para obtener flujos.
   - La función `updateFlows` compara los flujos de SINVAD con los almacenados localmente:
     - Inserta o actualiza flujos nuevos en la tabla `flows` y envía un mensaje `FLOW` a los clientes.
     - Elimina flujos no presentes en SINVAD y envía un mensaje `FLOW_REMOVED`.
     - Se ejecuta al iniciar el servidor y cada 5 minutos mediante `setInterval`.

3. **Manejo de Mensajes WebSocket**:

   - **PIN**: Autentica al cliente verificando el PIN contra la tabla `users`. Responde con `AUTH_OK` o `AUTH_ERROR`.
   - **GET_FLOWS**: Envía todos los flujos almacenados en `flows` como mensajes `FLOW`, seguidos de `ALL_FLOWS_SENT`.
   - **PARTIALFLOW**: Guarda un flujo parcial en la tabla `partial_flows` y responde con `PARTIAL_FLOW_SAVED`.
   - **REPORT**: Guarda un informe en la tabla `reports` y responde con `REPORT_SAVED`.
   - **Errores**: Responde con mensajes `ERROR` para cualquier problema detectado.

4. **Depuración**:
   - Usa `JSON.stringify(parsedMessage, null, 2)` para mostrar mensajes completos en la consola, evitando salidas como `[Object]`.
   - Registra eventos clave: conexiones/desconexiones de clientes, flujos obtenidos/enviados, y errores.

### Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución para el servidor.
- **WebSocket (`ws`)**: Comunicación en tiempo real con el frontend.
- **SQLite (`sqlite3`)**: Base de datos ligera para almacenamiento local.
- **Axios**: Cliente HTTP para solicitudes a la API de SINVAD.
- **Dotenv**: Gestión de variables de entorno.

### Notas

- La eliminación de flujos no presentes en SINVAD es automática. Si se desea mantener flujos históricos, se puede añadir un campo `active` a la tabla `flows` y marcarlos como inactivos en lugar de eliminarlos.
- La autenticación actual usa un PIN estático. En el futuro, se puede implementar autenticación con `email`/`password` mediante un endpoint `/login` de SINVAD.
