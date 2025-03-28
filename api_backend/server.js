const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Read API_TOKEN from environment variables
const REQUIRED_API_TOKEN = process.env.API_TOKEN || '';

// Middleware to check the API token for all REST requests
const checkApiToken = (req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;
  if (REQUIRED_API_TOKEN && token !== REQUIRED_API_TOKEN) {
    return res.status(403).json({ error: 'Invalid API Token' });
  }
  next();
};

// Apply token check middleware to all routes
app.use(checkApiToken);

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

// Mapping for event types
const eventMapping = {
  "Gathering": { name: "Sammel", duration: 12 * 60 },
  "Crafting": { name: "Herstellung", duration: 8 * 60 },
  "CombatBigExpDaily": { name: "Kampferfahrung", duration: 20 * 60 },
  "CombatBigLootDaily": { name: "Kampfbelohnung", duration: 20 * 60 },
  "SkillingParty": { name: "Skilling Gruppe", duration: 2 * 60 }
};

// Für das Handling von Event-Sequenzen und Race Conditions
let pendingStopTimeoutId = null;
let lastEventType = null;
let eventSequence = {}; // Tracking für event sequenzen und timestamps

/**
 * Helper function to start an event
 */
function startEvent(eventType, timestamp = Date.now()) {
  // Für Sequence Tracking: Neuen Start registrieren
  if (!eventSequence[eventType]) {
    eventSequence[eventType] = { 
      lastStart: timestamp,
      lastStop: 0,
      count: 0
    };
  } else {
    eventSequence[eventType].lastStart = timestamp;
    eventSequence[eventType].count++;
  }
  
  // Wenn gleicher Event-Typ bereits läuft, nichts tun
  if (activeEvent && activeEvent.id === eventType) {
    console.log(`Event bereits aktiv: ${eventType}, ignoriere weiteren Start`);
    return true;
  }
  
  // Wenn wir bereits einen Stop für diesen Typ erhalten haben, 
  // aber der Start zeitlich VOR dem Stop liegt (Race Condition),
  // ignorieren wir den veralteten Stop
  if (pendingStopTimeoutId && lastEventType === eventType) {
    if (eventSequence[eventType].lastStop > 0 && 
        timestamp < eventSequence[eventType].lastStop) {
      console.log(`Start-Ereignis (${timestamp}) liegt vor Stop-Ereignis (${eventSequence[eventType].lastStop}), ignoriere verzögerten Stop`);
      clearTimeout(pendingStopTimeoutId);
      pendingStopTimeoutId = null;
    }
  }
  
  const mapped = eventMapping[eventType];
  if (!mapped) {
    console.log(`Unbekannter Event-Typ: ${eventType}`);
    return false;
  }

  if (activeEvent) {
    console.log(`Stoppe laufendes Event ${activeEvent.id} um ${eventType} zu starten`);
    // Implizit das aktuelle Event stoppen bevor wir ein neues starten
  }

  // Alle laufenden Stop-Operationen abbrechen
  if (pendingStopTimeoutId) {
    clearTimeout(pendingStopTimeoutId);
    pendingStopTimeoutId = null;
  }

  activeEvent = {
    id: eventType,
    name: mapped.name,
    duration: mapped.duration,
    startTime: timestamp
  };
  
  io.emit('eventStarted', activeEvent);
  console.log(`Event gestartet: ${JSON.stringify(activeEvent)}`);
  lastEventType = eventType;
  return true;
}

/**
 * Helper function to stop an event with optional delay
 */
function stopEvent(eventType, immediate = false) {
  // If no event is running or the types don't match, nothing to do
  if (!activeEvent || activeEvent.id !== eventType) {
    console.log(`No matching active event to stop: ${eventType}`);
    return false;
  }

  // If we should stop immediately
  if (immediate) {
    console.log(`Immediately stopping event: ${eventType}`);
    activeEvent = null;
    io.emit('timerAborted', {});
    return true;
  }

  // Otherwise set up a delayed stop to handle possible start/stop sequences
  if (pendingStopTimeoutId) {
    clearTimeout(pendingStopTimeoutId);
  }

  console.log(`Scheduling delayed stop for event: ${eventType}`);
  pendingStopTimeoutId = setTimeout(() => {
    console.log(`Executing delayed stop for event: ${eventType}`);
    if (activeEvent && activeEvent.id === eventType) {
      activeEvent = null;
      io.emit('timerAborted', {});
    }
    pendingStopTimeoutId = null;
  }, 2000); // 2 second delay to wait for possible restart

  return true;
}

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

// New webhook endpoint for minigame events
app.post('/minigame/:action/:type', (req, res) => {
  const { action, type } = req.params;
  const metadata = req.body?.metadata || {};
  
  console.log(`Webhook received: ${action}/${type} from player: ${metadata.playerName || 'unknown'}`);
  
  if (!eventMapping[type]) {
    return res.status(400).json({ 
      error: 'Unknown event type',
      received: type,
      available: Object.keys(eventMapping)
    });
  }

  let result = false;
  
  if (action === 'start') {
    result = startEvent(type);
  } else if (action === 'stop') {
    result = stopEvent(type);
  } else {
    return res.status(400).json({ 
      error: 'Unknown action',
      received: action,
      available: ['start', 'stop']
    });
  }

  if (result) {
    return res.status(200).json({ 
      success: true, 
      message: `Event ${action} processed for ${type}`,
      activeEvent: activeEvent ? {
        id: activeEvent.id,
        name: activeEvent.name,
        duration: activeEvent.duration,
        elapsedSeconds: Math.floor((Date.now() - activeEvent.startTime) / 1000)
      } : null
    });
  } else {
    return res.status(400).json({ 
      success: false, 
      message: `Could not ${action} event of type ${type}`
    });
  }
});

// Endpoints für minigameserie wurden entfernt, da sie nur Tests waren

io.on('connection', (socket) => {
  connectionCount++;
  io.emit('connectionCount', connectionCount);
  console.log(`Client connected: ${socket.id}. Total: ${connectionCount}`);

  if (activeEvent) {
    socket.emit('eventStarted', activeEvent);
  }

  socket.on('startEvent', (data) => {
    const eventType = data.id;
    const timestamp = Date.now();
    
    // Nutze die gemeinsame startEvent-Funktion für konsistente Behandlung
    if (!startEvent(eventType, timestamp)) {
      socket.emit('error', { message: 'Event konnte nicht gestartet werden.' });
    }
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
    if (pendingStopTimeoutId) {
      clearTimeout(pendingStopTimeoutId);
      pendingStopTimeoutId = null;
    }
    
    if (activeEvent) {
      // Für Konsistenz setzen wir auch hier den Timer auf 0
      // statt ihn einfach zu löschen
      activeEvent.duration = 0;
      io.emit('timerExpired', activeEvent);
      console.log(`Timer expired (aborted): ${JSON.stringify(activeEvent)}`);
      activeEvent = null;
    } else {
      io.emit('timerAborted', {});
      console.log('Timer aborted for all clients.');
    }
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

// Existing periodic check for expired events
setInterval(() => {
  if (activeEvent) {
    const elapsedSeconds = (Date.now() - activeEvent.startTime) / 1000;
    if (elapsedSeconds >= activeEvent.duration) {
      io.emit('timerExpired', activeEvent);
      console.log(`Event expired naturally: ${JSON.stringify(activeEvent)} – activeEvent reset.`);
      activeEvent = null;
    }
  }
}, 1000);

const PORT = process.env.PORT || 3009;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});