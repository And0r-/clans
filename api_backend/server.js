const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Read API_TOKEN from environment variables
const REQUIRED_API_TOKEN = process.env.API_TOKEN || '';

// Middleware to check the API token for REST requests
app.use((req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;
  if (REQUIRED_API_TOKEN && token !== REQUIRED_API_TOKEN) {
    return res.status(403).json({ error: 'Invalid API Token' });
  }
  next();
});

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// Socket.IO middleware for checking the API token
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (REQUIRED_API_TOKEN && token !== REQUIRED_API_TOKEN) {
    return next(new Error('Authentication error'));
  }
  next();
});

// Global variables for settings and active event
let clanSettings = {
  eventStartTime: "20:00" // default
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

  if (activeEvent) {
    socket.emit('eventStarted', activeEvent);
  }

  socket.on('startEvent', (data) => {
    if (activeEvent) {
      socket.emit('error', { message: 'An event is already running. Please abort before starting a new one.' });
      console.log(`New start rejected because an event is already running: ${JSON.stringify(activeEvent)}`);
      return;
    }
    activeEvent = {
      ...data,
      startTime: Date.now(),
      duration: data.duration
    };
    io.emit('eventStarted', activeEvent);
    console.log(`Event started: ${JSON.stringify(activeEvent)}`);
  });

  socket.on('adjustTimer', (adjustment) => {
    if (activeEvent) {
      activeEvent.duration += adjustment.adjustmentInSeconds;
      if (activeEvent.duration < 0) activeEvent.duration = 0;
      io.emit('timerAdjusted', activeEvent);
      console.log(`Timer adjusted: ${JSON.stringify(activeEvent)}`);
    }
  });

  socket.on('abortTimer', () => {
    activeEvent = null;
    io.emit('timerAborted', {});
    console.log('Timer aborted for all clients.');
  });

  socket.on('triggerNotification', () => {
    io.emit('playNotification');
    console.log('Manual notification triggered');
  });

  socket.on('disconnect', () => {
    connectionCount--;
    io.emit('connectionCount', connectionCount);
    console.log(`Client disconnected: ${socket.id}. Total: ${connectionCount}`);
  });
});

// New endpoints for minigame series

// Internal mapping for event types (for series endpoints)
const eventMapping = {
  "Gathering": { name: "Sammel", duration: 12 * 60 },
  "Crafting": { name: "Herstellung", duration: 8 * 60 },
  "CombatBigExpDaily": { name: "Kampferfahrung", duration: 20 * 60 },
  "CombatBigLootDaily": { name: "Kampfbelohnung", duration: 20 * 60 }
};

app.get('/minigameserie/start/:eventType', (req, res) => {
  const eventType = req.params.eventType;
  const mapped = eventMapping[eventType];
  if (!mapped) {
    res.status(400).json({ error: 'Unknown event type' });
    return;
  }
  // For series start, we only use the event type; the name and duration are mapped by the backend.
  if (!activeEvent) {
    activeEvent = {
      id: eventType,
      name: mapped.name,
      duration: mapped.duration,
      startTime: Date.now()
    };
    io.emit('eventStarted', activeEvent);
    console.log(`Series event started: ${JSON.stringify(activeEvent)}`);
    res.json({ message: "Series event started", event: activeEvent });
  } else {
    res.json({ message: "Series event already active" });
  }
});

app.get('/minigameserie/stop/:eventType', (req, res) => {
  const eventType = req.params.eventType;
  if (activeEvent && activeEvent.id === eventType) {
    // Instead of aborting the event, set its duration to 0 so that all clients receive the stop signal.
    activeEvent.duration = 0;
    io.emit('timerExpired', activeEvent);
    console.log(`Series event stopped (timer set to 0): ${JSON.stringify(activeEvent)}`);
    activeEvent = null;
    res.json({ message: "Series event stopped" });
  } else {
    res.status(400).json({ error: "No active event with that type" });
  }
});

// Existing periodic check for expired events (unchanged)
setInterval(() => {
  if (activeEvent) {
    const elapsedSeconds = (Date.now() - activeEvent.startTime) / 1000;
    if (elapsedSeconds >= activeEvent.duration) {
      io.emit('timerExpired');
      console.log(`Event expired: ${JSON.stringify(activeEvent)} – activeEvent reset.`);
      activeEvent = null;
    }
  }
}, 1000);

const PORT = process.env.PORT || 3009;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
