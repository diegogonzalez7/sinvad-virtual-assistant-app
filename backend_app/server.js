const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
require('dotenv').config();

const WS_PORT = process.env.WS_PORT || 8080;
const SINVAD_API_URL = process.env.SINVAD_API_URL || 'https://sinvad.pro.srec.solutions/v1';
const SINVAD_API_KEY = process.env.SINVAD_API_KEY || 'ff116e31fbb518615f0a5dc26d371b13';
const USER_PWD = process.env.USER_PWD || '-1432702675';
const PROFILE_ID = process.env.PROFILE_ID || '1617036284204867';

// Conectar a SQLite
const db = new sqlite3.Database('./app.db', (err) => {
  if (err) {
    console.error('Error conectando a SQLite:', err);
    return;
  }
  console.log('Conectado a SQLite (app.db)');
});

// Crear tablas
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      stepID TEXT,
      steps TEXT,
      nextSteps TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flowId TEXT,
      flowName TEXT,
      history TEXT,
      timestamp TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS partial_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flowId TEXT,
      stepId TEXT,
      responses TEXT,
      timestamp TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      pin TEXT
    )
  `);
  console.log('Tablas creadas exitosamente');

  // Crear usuario de prueba
  db.run('INSERT OR IGNORE INTO users (username, pin) VALUES (?, ?)', ['admin', '123456'], (err) => {
    if (err) {
      console.error('Error creando usuario de prueba:', err);
    } else {
      console.log('Usuario de prueba creado: admin (PIN: 123456)');
    }
  });
});

// Obtener flujos desde SINVAD
async function fetchFlows() {
  console.log('Obteniendo flujos desde SINVAD...');
  try {
    const flowsResponse = await axios.get(`${SINVAD_API_URL}/command/command?steps=true`, {
      headers: {
        'apiKey': SINVAD_API_KEY,
        'userPwd': USER_PWD,
        'profileId': PROFILE_ID
      }
    });

    // Manejar la respuesta: usar flowsResponse.data directamente si es un array, o flowsResponse.data.flows
    const flows = Array.isArray(flowsResponse.data) ? flowsResponse.data : flowsResponse.data.flows;
    if (!Array.isArray(flows)) {
      console.error('Error: La respuesta de SINVAD no contiene un array de flujos:', flowsResponse.data);
      return [];
    }

    for (const flow of flows) {
      await db.run(
        'INSERT OR REPLACE INTO flows (id, title, description, stepID, steps, nextSteps) VALUES (?, ?, ?, ?, ?, ?)',
        [
          flow.id,
          JSON.stringify(flow.title),
          JSON.stringify(flow.description || []),
          flow.stepID,
          JSON.stringify(flow.steps),
          JSON.stringify(flow.nextSteps)
        ]
      );
      console.log(`Flujo ${flow.id} guardado correctamente`);
    }
    console.log('Flujos cargados desde SINVAD');
    return flows;
  } catch (err) {
    console.error('Error obteniendo flujos:', err.message);
    console.log('No se pudieron cargar flujos desde SINVAD');
    return [];
  }
}

// Cargar flujos al iniciar el servidor
(async () => {
  const flows = await fetchFlows();
  if (flows.length === 0) {
    console.log('No hay flujos disponibles para enviar al frontend');
  }
})();

// Iniciar servidor WebSocket
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`Servidor WebSocket iniciado en ws://localhost:${WS_PORT}`);

wss.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado');

  ws.on('message', async (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      switch (parsedMessage.type) {
        case 'PIN':
          const pin = parsedMessage.data;
          db.get('SELECT * FROM users WHERE pin = ?', [pin], (err, user) => {
            if (err) {
              console.error('Error verificando PIN:', err);
              ws.send(JSON.stringify({ type: 'ERROR', data: 'Error verificando PIN' }));
              return;
            }
            if (user) {
              console.log(`Usuario ${user.username} autenticado con PIN: ${pin}`);
              ws.send(JSON.stringify({ type: 'AUTH_OK' }));
            } else {
              console.log('PIN incorrecto:', pin);
              ws.send(JSON.stringify({ type: 'AUTH_ERROR', data: 'PIN incorrecto' }));
            }
          });
          break;

        case 'GET_FLOWS':
          const flows = await new Promise((resolve) => {
            db.all('SELECT * FROM flows', [], (err, rows) => {
              if (err) {
                console.error('Error obteniendo flujos de la base de datos:', err);
                ws.send(JSON.stringify({ type: 'ERROR', data: 'Error obteniendo flujos' }));
                resolve([]);
                return;
              }
              const flows = rows.map(row => ({
                id: row.id,
                title: JSON.parse(row.title),
                description: JSON.parse(row.description),
                stepID: row.stepID,
                steps: JSON.parse(row.steps),
                nextSteps: JSON.parse(row.nextSteps)
              }));
              resolve(flows);
            });
          });

          if (flows.length === 0) {
            console.log('No hay flujos en la base de datos, intentando cargar desde SINVAD...');
            const fetchedFlows = await fetchFlows();
            if (fetchedFlows.length === 0) {
              ws.send(JSON.stringify({ type: 'ERROR', data: 'No se pudieron cargar flujos desde SINVAD' }));
            } else {
              for (const flow of fetchedFlows) {
                ws.send(JSON.stringify({ type: 'FLOW', data: flow }));
              }
            }
          } else {
            for (const flow of flows) {
              ws.send(JSON.stringify({ type: 'FLOW', data: flow }));
            }
          }
          ws.send(JSON.stringify({ type: 'ALL_FLOWS_SENT' }));
          console.log('Todos los flujos enviados');
          break;

        case 'REPORT':
          try {
            const report = parsedMessage.data;
            await db.run(
              'INSERT INTO reports (flowId, flowName, history, timestamp) VALUES (?, ?, ?, ?)',
              [report.flowId, report.flowName, JSON.stringify(report.history), report.timestamp]
            );
            console.log(`Informe guardado: ${JSON.stringify(report)}`);
            ws.send(JSON.stringify({ type: 'REPORT_SAVED', data: report.timestamp }));
          } catch (err) {
            console.error('Error saving report:', err);
            ws.send(JSON.stringify({ type: 'ERROR', data: 'Error saving report' }));
          }
          break;

        case 'PARTIALFLOW':
          try {
            const partialFlow = parsedMessage.data;
            await db.run(
              'INSERT INTO partial_flows (flowId, stepId, responses, timestamp) VALUES (?, ?, ?, ?)',
              [partialFlow.flowId, partialFlow.stepId, JSON.stringify(partialFlow.responses), new Date().toISOString()]
            );
            console.log(`Flujo parcial guardado: ${JSON.stringify(partialFlow)}`);
            ws.send(JSON.stringify({ type: 'PARTIAL_FLOW_SAVED', data: partialFlow.flowId }));
          } catch (err) {
            console.error('Error saving partial flow:', err);
            ws.send(JSON.stringify({ type: 'ERROR', data: 'Error saving partial flow' }));
          }
          break;

        default:
          console.log('Mensaje desconocido:', parsedMessage);
          ws.send(JSON.stringify({ type: 'ERROR', data: 'Mensaje desconocido' }));
      }
    } catch (err) {
      console.error('Error procesando mensaje:', err);
      ws.send(JSON.stringify({ type: 'ERROR', data: 'Error procesando mensaje' }));
    }
  });

  ws.on('close', () => {
    console.log('Cliente WebSocket desconectado');
  });
});

// Manejar cierre del servidor
process.on('SIGINT', () => {
  console.log('Cerrando servidor WebSocket y base de datos...');
  db.close((err) => {
    if (err) {
      console.error('Error cerrando base de datos:', err);
    } else {
      console.log('Base de datos cerrada');
    }
    process.exit(0);
  });
});