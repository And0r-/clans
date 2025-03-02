const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Lese den API_TOKEN aus den Umgebungsvariablen
const REQUIRED_API_TOKEN = process.env.API_TOKEN || '';

// Middleware zum Überprüfen des API-Tokens für REST-Anfragen
app.use((req, res, next) => {
  // Option: Falls du bestimmte Endpunkte ohne Token erlauben möchtest,
  // könntest du hier einen Check einbauen.
  // Beispiel: if (req.path === '/api/settings' && req.method === 'GET') next();
  const token = req.headers['authorization'] || req.query.token;
  if (REQUIRED_API_TOKEN && token !== REQUIRED_API_TOKEN) {
    return res.status(403).json({ error: 'Invalid API Token' });
  }
  next();
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

// Socket.io-Middleware zum Überprüfen des API-Tokens
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (REQUIRED_API_TOKEN && token !== REQUIRED_API_TOKEN) {
    return next(new Error('Authentication error'));
  }
  next();
});

// Globale Variablen zur Speicherung der Einstellungen und des aktiven Events
let clanSettings = {
  eventStartTime: "20:00" // Standard: 20:00 Uhr
};

let activeEvent = null;
let connectionCount = 0;

/**
 * REST-Endpoints
 */

// GET /api/settings
app.get('/api/settings', (req, res) => {
  res.json(clanSettings);
});

// POST /api/settings
app.post('/api/settings', (req, res) => {
  clanSettings = { ...clanSettings, ...req.body };
  io.emit('settingsUpdate', clanSettings);
  res.json(clanSettings);
});

io.on('connection', (socket) => {
    connectionCount++;
    io.emit('connectionCount', connectionCount);
    console.log(`Client connected: ${socket.id}. Total: ${connectionCount}`);

    // Sende, falls ein Event bereits läuft, den aktuellen Status an den neuen Client
    if (activeEvent) {
        socket.emit('eventStarted', activeEvent);
    }

    // Event: Start eines Clan-Events
    socket.on('startEvent', (data) => {
        if (activeEvent) {
            socket.emit('error', { message: 'Ein Event läuft bereits. Bitte abbrechen, bevor ein neues gestartet wird.' });
            console.log(`Neuer Startversuch abgelehnt, da bereits ein Event läuft: ${JSON.stringify(activeEvent)}`);
            return;
        }
        activeEvent = {
            ...data,
            startTime: Date.now(),
            duration: data.duration
        };
        io.emit('eventStarted', activeEvent);
        console.log(`Event gestartet: ${JSON.stringify(activeEvent)}`);
    });

    // Event: Anpassung des Countdowns
    socket.on('adjustTimer', (adjustment) => {
        if (activeEvent) {
            activeEvent.duration += adjustment.adjustmentInSeconds;
            if (activeEvent.duration < 0) activeEvent.duration = 0;
            io.emit('timerAdjusted', activeEvent);
            console.log(`Timer angepasst: ${JSON.stringify(activeEvent)}`);
        }
    });

    socket.on('abortTimer', () => {
        activeEvent = null;
        io.emit('timerAborted', {});
        console.log('Timer aborted for all clients.');
    });

    socket.on('triggerNotification', () => {
        io.emit('playNotification');
        console.log('Manuelle Notification ausgelöst');
    });

    socket.on('disconnect', () => {
        connectionCount--;
        io.emit('connectionCount', connectionCount);
        console.log(`Client disconnected: ${socket.id}. Total: ${connectionCount}`);
    });
});

// Optional: Periodischer Check für abgelaufene Events (wie gehabt)
setInterval(() => {
    if (activeEvent) {
        const elapsedSeconds = (Date.now() - activeEvent.startTime) / 1000;
        if (elapsedSeconds >= activeEvent.duration) {
            io.emit('timerExpired');
            console.log(`Event abgelaufen: ${JSON.stringify(activeEvent)} – activeEvent wird zurückgesetzt.`);
            activeEvent = null;
        }
    }
}, 1000);

const PORT = process.env.PORT || 3009;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

