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

// Tracking für Webhook Event-Serie
let lastEventType = null;
let lastEventTime = 0;
const EVENT_SERIES_THRESHOLD = 5000; // Schwellwert in ms (5 Sekunden)

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

// Webhook endpoint für Minigame Events
app.post('/minigame/:action/:type', (req, res) => {
  const { action, type } = req.params;
  const metadata = req.body?.metadata || {};
  const now = Date.now();
  
  console.log(`Webhook empfangen: ${action}/${type} von Spieler: ${metadata.playerName || 'unbekannt'}`);
  
  if (!eventMapping[type]) {
    return res.status(400).json({ 
      error: 'Unbekannter Event-Typ',
      received: type,
      available: Object.keys(eventMapping)
    });
  }

  // Aktionen verarbeiten
  if (action === 'start') {
    // Wenn kein Event aktiv ist, starten wir ein neues
    if (!activeEvent) {
      activeEvent = {
        id: type,
        name: eventMapping[type].name,
        duration: eventMapping[type].duration,
        startTime: now
      };
      
      io.emit('eventStarted', activeEvent);
      console.log(`Event gestartet: ${JSON.stringify(activeEvent)}`);
    } 
    // Event gleichen Typs bereits aktiv - nichts tun, nur bestätigen
    else if (activeEvent && activeEvent.id === type) {
      console.log(`Event bereits aktiv: ${type}, ignoriere weiteren Start`);
    }
    // Anderer Event-Typ aktiv - warnen, aber weiterlaufen lassen
    else {
      console.log(`Warnung: Startanfrage für ${type} erhalten, aber anderer Typ ${activeEvent.id} ist aktiv`);
    }
    
    // Event-Serie tracking aktualisieren
    lastEventType = type;
    lastEventTime = now;
    
    return res.status(200).json({ 
      success: true, 
      message: `Startevent für ${type} verarbeitet`,
      activeEvent: activeEvent ? {
        id: activeEvent.id,
        name: activeEvent.name,
        duration: activeEvent.duration,
        elapsedSeconds: Math.floor((now - activeEvent.startTime) / 1000)
      } : null
    });
  } 
  else if (action === 'stop') {
    // Prüfen ob stopEvent Teil einer laufenden Serie ist
    const isPartOfSeries = 
      type === lastEventType && 
      (now - lastEventTime) < EVENT_SERIES_THRESHOLD;
    
    // Event-Serie tracking aktualisieren
    lastEventType = type;
    lastEventTime = now;
    
    // Wenn Event Teil einer Serie ist und der passende Event-Typ ist aktiv
    if (isPartOfSeries && activeEvent && activeEvent.id === type) {
      console.log(`Stop-Event für ${type} erkannt, aber es scheint Teil einer Serie zu sein. Timer läuft weiter.`);
      
      return res.status(200).json({ 
        success: true, 
        message: `Stopevent für ${type} erkannt (Teil einer Serie - Timer läuft weiter)`,
        activeEvent: activeEvent ? {
          id: activeEvent.id,
          name: activeEvent.name,
          duration: activeEvent.duration,
          elapsedSeconds: Math.floor((now - activeEvent.startTime) / 1000)
        } : null,
        isSeries: true
      });
    }
    // Wenn Event nicht Teil einer Serie ist oder falscher Typ aktiv ist
    else {
      if (activeEvent && activeEvent.id === type) {
        console.log(`Stop-Event für ${type} erkannt, kein Teil einer Serie - Timer wird gestoppt`);
        // Bei Serie-Ende wird Timer auf 0 gesetzt um Notification auszulösen
        activeEvent.duration = 0;
        io.emit('timerExpired', activeEvent);
        activeEvent = null;
      } else {
        console.log(`Kein passendes aktives Event zum Stoppen: ${type}`);
      }
      
      return res.status(200).json({ 
        success: true, 
        message: `Stopevent für ${type} verarbeitet`,
        activeEvent: null,
        isSeries: false
      });
    }
  } 
  else {
    return res.status(400).json({ 
      error: 'Unbekannte Aktion',
      received: action,
      available: ['start', 'stop']
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
    
    // Bei direktem Start aus der App einen neuen Event starten
    if (activeEvent) {
      socket.emit('error', { message: 'Ein Event läuft bereits. Bitte abbrechen, bevor ein neuer gestartet wird.' });
      console.log(`Neuer Start abgelehnt, da bereits Event läuft: ${JSON.stringify(activeEvent)}`);
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

  socket.on('adjustTimer', (adjustment) => {
    if (activeEvent) {
      activeEvent.duration += adjustment.adjustmentInSeconds;
      if (activeEvent.duration < 0) activeEvent.duration = 0;
      io.emit('timerAdjusted', activeEvent);
      console.log(`Timer angepasst: ${JSON.stringify(activeEvent)}`);
    }
  });

  socket.on('abortTimer', () => {
    // Sofortiger Abbruch, IMMER, wenn es aus der App kommt
    if (activeEvent) {
      activeEvent.duration = 0;
      io.emit('timerExpired', activeEvent);
      console.log(`Timer abgelaufen (abgebrochen): ${JSON.stringify(activeEvent)}`);
      activeEvent = null;
    } else {
      io.emit('timerAborted', {});
      console.log('Timer aborted for all clients.');
    }
  });

  socket.on('triggerNotification', () => {
    io.emit('playNotification');
    console.log('Manuelle Benachrichtigung ausgelöst');
  });

  socket.on('disconnect', () => {
    connectionCount--;
    io.emit('connectionCount', connectionCount);
    console.log(`Client disconnected: ${socket.id}. Total: ${connectionCount}`);
  });
});

// Regelmäßige Prüfung für abgelaufene Events
setInterval(() => {
  if (activeEvent) {
    const elapsedSeconds = (Date.now() - activeEvent.startTime) / 1000;
    if (elapsedSeconds >= activeEvent.duration) {
      io.emit('timerExpired', activeEvent);
      console.log(`Event natürlich abgelaufen: ${JSON.stringify(activeEvent)} – activeEvent zurückgesetzt.`);
      activeEvent = null;
    }
  }
}, 1000);

const PORT = process.env.PORT || 3009;
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});