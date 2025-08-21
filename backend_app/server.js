const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const bcrypt = require('bcrypt');
require('dotenv').config();

const WS_PORT = process.env.WS_PORT || 8080;
const SINVAD_API_URL = process.env.SINVAD_API_URL || 'https://sinvad.pro.srec.solutions/v1';
const SINVAD_API_KEY = process.env.SINVAD_API_KEY || 'ff116e31fbb518615f0a5dc26d371b13';
const USER_PWD = process.env.USER_PWD || '-1432702675';
const PROFILE_ID = process.env.PROFILE_ID || '1617036284204867';

// Promises SQLite
function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Inicialización de la BD
const db = new sqlite3.Database('./app.db', err => {
  if (err) {
    console.error('Error conectando a SQLite:', err);
    return;
  }
  console.log('Conectado a SQLite (app.db)');
});

db.serialize(async () => {
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

  // Crear usuario admin:1234
  const adminPin = '1234';
  bcrypt.hash(adminPin, 10, (err, hash) => {
    if (err) console.error('Error hash PIN:', err);
    else {
      runAsync(db, 'INSERT OR IGNORE INTO users (username, pin) VALUES (?, ?)', ['admin', hash])
        .then(() => console.log('Usuario de prueba creado: admin / 1234'))
        .catch(e => console.error('Error creando usuario admin:', e));
    }
  });
});

// Obtención de flujos
async function fetchFlows() {
  try {
    const response = await axios.get(`${SINVAD_API_URL}/command/command?steps=true`, {
      headers: {
        apiKey: SINVAD_API_KEY,
        userPwd: USER_PWD,
        profileId: PROFILE_ID,
      },
    });

    const flows = Array.isArray(response.data) ? response.data : response.data.flows;
    if (!Array.isArray(flows)) return [];
    return flows;
  } catch (err) {
    console.error('Error obteniendo flujos SINVAD:', err.message);
    return [];
  }
}

// Actualización y envío de flujos
async function updateFlows(ws) {
  const newFlows = await fetchFlows();

  const currentFlows = (await allAsync(db, 'SELECT id FROM flows')).map(r => r.id);
  const newFlowIds = newFlows.map(f => f.id);

  const flowsToAdd = newFlows.filter(f => !currentFlows.includes(f.id));
  const flowsToDelete = currentFlows.filter(id => !newFlowIds.includes(id));

  // Añadir flujos nuevos
  for (const flow of flowsToAdd) {
    await runAsync(db, 'INSERT INTO flows (id, title, description, stepID, steps, nextSteps) VALUES (?, ?, ?, ?, ?, ?)', [
      flow.id,
      JSON.stringify(flow.title),
      JSON.stringify(flow.description || []),
      flow.stepID,
      JSON.stringify(flow.steps),
      JSON.stringify(flow.nextSteps),
    ]);
  }

  // Eliminar flujos que ya no existen
  for (const id of flowsToDelete) {
    await runAsync(db, 'DELETE FROM flows WHERE id = ?', [id]);
  }

  // Enviar cambios al frontend si ws está conectado
  if (ws && ws.readyState === WebSocket.OPEN) {
    // Enviar flujos nuevos/actualizados
    for (const flow of newFlows) {
      ws.send(JSON.stringify({ type: 'FLOW', data: flow }));
    }
    // Enviar flujos eliminados
    for (const id of flowsToDelete) {
      ws.send(JSON.stringify({ type: 'FLOW_REMOVED', data: id }));
    }
    ws.send(JSON.stringify({ type: 'ALL_FLOWS_SENT' }));
  }
}

// Actualización de flujos para todos los usuarios
async function updateFlowsForAllClients() {
  if (!wss || wss.clients.size === 0) return;

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
      await updateFlows(client);
    }
  }
}

// Actualización periódica de flujos (añadidos y eliminados)
async function startPeriodicUpdates() {
  await updateFlowsForAllClients(); // actualización inicial
  setInterval(updateFlowsForAllClients, 5 * 60 * 1000); // cada 5 minutos
}

// Servidor WebSocket
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`Servidor WebSocket en ws://0.0.0.0:${WS_PORT}`);

wss.on('connection', ws => {
  console.log('Cliente conectado');
  ws.isAuthenticated = false;

  ws.on('message', async msg => {
    try {
      const parsed = JSON.parse(msg);

      switch (parsed.type) {
        case 'LOGIN': {
          const { username, pin } = parsed.data;
          console.log('Intento de login recibido:', username, pin);

          const user = await getAsync(db, 'SELECT * FROM users WHERE username = ?', [username]);
          console.log('Usuario en BD:', user);

          if (user) {
            const match = await bcrypt.compare(pin, user.pin);
            console.log('Resultado comparación PIN:', match);

            if (match) {
              ws.isAuthenticated = true; // marcar como autenticado
              ws.send(JSON.stringify({ type: 'AUTH_OK' }));
              await updateFlows(ws); // enviar flujos inmediatamente
            } else {
              ws.send(JSON.stringify({ type: 'AUTH_ERROR', data: 'Usuario o PIN incorrectos' }));
            }
          } else {
            ws.send(JSON.stringify({ type: 'AUTH_ERROR', data: 'Usuario o PIN incorrectos' }));
          }
          break;
        }

        case 'GET_FLOWS':
          await updateFlows(ws);
          break;

        case 'REPORT': {
          const r = parsed.data;
          await runAsync(db, 'INSERT INTO reports (flowId, flowName, history, timestamp) VALUES (?, ?, ?, ?)', [
            r.flowId,
            r.flowName,
            JSON.stringify(r.history),
            r.timestamp,
          ]);
          ws.send(JSON.stringify({ type: 'REPORT_SAVED', data: r.timestamp }));
          break;
        }

        case 'PARTIALFLOW': {
          const pf = parsed.data;
          await runAsync(db, 'INSERT INTO partial_flows (flowId, stepId, responses, timestamp) VALUES (?, ?, ?, ?)', [
            pf.flowId,
            pf.stepId,
            JSON.stringify(pf.responses),
            new Date().toISOString(),
          ]);
          ws.send(JSON.stringify({ type: 'PARTIAL_FLOW_SAVED', data: pf.flowId }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'ERROR', data: 'Mensaje desconocido' }));
      }
    } catch (err) {
      console.error('Error procesando mensaje:', err);
      ws.send(JSON.stringify({ type: 'ERROR', data: 'Error procesando mensaje' }));
    }
  });

  ws.on('close', () => console.log('Cliente desconectado'));
});

// Arrancar actualización periódica
startPeriodicUpdates();
