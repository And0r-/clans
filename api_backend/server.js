const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// API_TOKEN aus den Umgebungsvariablen lesen
const REQUIRED_API_TOKEN = process.env.API_TOKEN || '';

// Discord Webhook Konfiguration
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Middleware zur Überprüfung des API-Tokens
const checkApiToken = (req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;
  if (REQUIRED_API_TOKEN && token !== REQUIRED_API_TOKEN) {
    return res.status(403).json({ error: 'Ungültiges API-Token' });
  }
  next();
};

// Token-Überprüfung auf alle Routen anwenden
app.use(checkApiToken);

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// Socket.IO Middleware zur Überprüfung des API-Tokens
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (REQUIRED_API_TOKEN && token !== REQUIRED_API_TOKEN) {
    return next(new Error('Authentifizierungsfehler'));
  }
  next();
});

// Globale Variablen für Einstellungen und aktives Event
let clanSettings = {
  eventStartTime: "20:00" // Standard
};

let activeEvent = null;
let connectionCount = 0;
let pendingSeriesTimeout = null;
let lastStopEventTime = {}; // Track last stop event time per event type to deduplicate
let lastEventDurations = {}; // Track last actual duration per event type
let seriesRoundCount = 0; // Track which round we're in for a series

// Mapping für Event-Typen
const eventMapping = {
  "Gathering": { name: "Sammel", duration: 12 * 60 },
  "Crafting": { name: "Herstellung", duration: 8 * 60 },
  "CombatBigExpDaily": { name: "Kampferfahrung", duration: 10 * 60 },
  "CombatBigLootDaily": { name: "Kampfbelohnung", duration: 10 * 60 },
  "SkillingParty": { name: "Skilling Gruppe", duration: 2 * 60 }
};

// Schwellwert für die Serienerkennung (in ms)
const SERIES_GAP_THRESHOLD = 500; // 0.5 Sekunden Lücke zwischen Stop und Start

/**
 * Discord Webhook Funktionen
 */
async function sendDiscordWebhook(message, retryCount = 0) {
  // Prüfen ob Discord Webhook URL konfiguriert ist
  if (!DISCORD_WEBHOOK_URL) {
    console.warn('Discord Webhook URL nicht konfiguriert - Nachricht wird nicht gesendet');
    return false;
  }
  
  // Zeitbasierte Filterung: Discord-Benachrichtigungen nur zwischen 19:55 und 21:30 Uhr
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  
  // 19:55 = 1195 Minuten, 21:30 = 1290 Minuten
  const startTimeInMinutes = 19 * 60 + 55; // 1195
  const endTimeInMinutes = 21 * 60 + 30;   // 1290
  
  if (currentTimeInMinutes < startTimeInMinutes || currentTimeInMinutes > endTimeInMinutes) {
    console.log(`Discord-Benachrichtigung außerhalb der erlaubten Zeit (19:55-21:30) - wird nicht gesendet. Aktuelle Zeit: ${currentHour}:${String(currentMinute).padStart(2, '0')}`);
    return false;
  }
  
  const maxRetries = 3;
  const retryDelay = 20000; // 20 Sekunden zwischen Retries
  
  try {
    console.log(`Sende Discord Webhook: ${message}`);
    
    await axios.post(DISCORD_WEBHOOK_URL, {
      content: `@here ${message}`,
      username: 'Idle Clans Bot'
    }, {
      timeout: 10000 // 10 Sekunden Timeout
    });
    
    console.log('Discord Webhook erfolgreich gesendet');
    return true;
  } catch (error) {
    console.error(`Discord Webhook Fehler (Versuch ${retryCount + 1}/${maxRetries + 1}):`, error.message);
    
    if (retryCount < maxRetries) {
      console.log(`Wiederhole Discord Webhook in ${retryDelay / 1000} Sekunden...`);
      setTimeout(() => {
        sendDiscordWebhook(message, retryCount + 1);
      }, retryDelay);
    } else {
      console.error('Discord Webhook endgültig fehlgeschlagen nach allen Versuchen');
    }
    return false;
  }
}

/**
 * Geplante Benachrichtigungen
 */
// Täglich um 19:58 Uhr (Zeitzone Europa/Zürich)
cron.schedule('58 19 * * *', () => {
  console.log('Sende tägliche 19:58 Benachrichtigung');
  sendDiscordWebhook('🎮 Events starten gleich! Bereit machen für Idle Clans Events!');
}, {
  scheduled: true,
  timezone: "Europe/Zurich"
});

/**
 * REST-Endpoints
 */

// Debug-Endpunkt zum Überprüfen des aktuellen Status
app.get('/debug/status', (req, res) => {
  res.json({
    activeEvent,
    connectionCount,
    pendingSeriesTimeout: pendingSeriesTimeout !== null,
    mappedEvents: eventMapping,
    lastEventDurations,
    seriesRoundCount
  });
});

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

/**
 * Webhook-Endpunkt für Minigame-Events
 */
app.post('/minigame/:action/:type', (req, res) => {
  const { action, type } = req.params;
  const metadata = req.body?.metadata || {};
  
  console.log(`Webhook empfangen: ${action}/${type} von ${metadata.playerName || 'unbekannt'} (Clan: ${metadata.clanName || 'unbekannt'})`);
  
  // Clan-Validierung: Nur Requests von "RosaEinhorn" Clan-Mitgliedern verarbeiten
  if (metadata.clanName !== 'RosaEinhorn') {
    console.log(`Request von fremdem Clan ignoriert: ${metadata.clanName || 'unbekannt'}`);
    return res.status(403).json({ 
      error: 'Nicht autorisierter Clan',
      message: 'Nur Mitglieder des Clans RosaEinhorn können Events auslösen'
    });
  }
  
  if (!eventMapping[type]) {
    return res.status(400).json({ 
      error: 'Unbekannter Event-Typ',
      received: type,
      available: Object.keys(eventMapping)
    });
  }

  if (action === 'start') {
    handleEventStart(type);
    
    return res.status(200).json({ 
      success: true, 
      message: `Start-Event für ${type} verarbeitet`,
      player: metadata.playerName || 'unbekannt',
      activeEvent: activeEvent ? {
        id: activeEvent.id,
        name: activeEvent.name,
        duration: activeEvent.duration,
        elapsedSeconds: Math.floor((Date.now() - activeEvent.startTime) / 1000)
      } : null
    });
  } 
  else if (action === 'stop') {
    handleEventStop(type);
    
    return res.status(200).json({ 
      success: true, 
      message: `Stop-Event für ${type} verarbeitet`,
      player: metadata.playerName || 'unbekannt',
      activeEvent: activeEvent ? {
        id: activeEvent.id,
        name: activeEvent.name,
        duration: activeEvent.duration,
        elapsedSeconds: Math.floor((Date.now() - activeEvent.startTime) / 1000)
      } : null
    });
  } 
  else {
    return res.status(400).json({ 
      error: 'Unbekannte Aktion',
      received: action,
      available: ['start', 'stop']
    });
  }
});

/**
 * Behandelt den Start eines Events
 */
function handleEventStart(eventType) {
  // Wenn es einen ausstehenden Timeout für Serienende gibt, löschen wir ihn
  if (pendingSeriesTimeout) {
    console.log(`Start von ${eventType} erkannt während eines ausstehenden Series-Timeouts - Serie wird fortgesetzt`);
    clearTimeout(pendingSeriesTimeout);
    pendingSeriesTimeout = null;
    seriesRoundCount++; // Erhöhe Rundenzähler bei Serie
  } else {
    seriesRoundCount = 1; // Erste Runde einer neuen Serie oder einzelnes Event
  }

  // Wenn kein Event aktiv ist, starten wir ein neues
  if (!activeEvent) {
    console.log(`Starte neues Event: ${eventType} (Runde ${seriesRoundCount})`);
    
    // Bestimme die Dauer basierend auf gespeicherten Werten
    let duration = eventMapping[eventType].duration; // Standard-Dauer
    
    // Nur bei Kampf-Events verwenden wir dynamische Zeiten
    if (eventType === 'CombatBigExpDaily' || eventType === 'CombatBigLootDaily') {
      // Wenn wir eine gespeicherte Dauer für diesen Event-Typ haben, nutze sie
      if (lastEventDurations[eventType]) {
        const lastDuration = lastEventDurations[eventType];
        console.log(`Kampf-Event: Verwende letzte bekannte Dauer für ${eventType}: ${lastDuration} Sekunden`);
        duration = lastDuration;
      }
      
      // Bei Kampf-Events in Runde 2: Verwende die Dauer der ersten Runde
      if (seriesRoundCount === 2) {
        console.log(`Kampf-Serie Runde 2: Verwende Dauer der ersten Runde`);
        // Die Dauer der ersten Runde wurde bereits in lastEventDurations gespeichert
      }
    } else {
      // Für alle anderen Events: Verwende immer die Standard-Dauer
      console.log(`Nicht-Kampf-Event ${eventType}: Verwende feste Standard-Dauer von ${duration} Sekunden`);
    }
    
    activeEvent = {
      id: eventType,
      name: eventMapping[eventType].name,
      duration: duration,
      startTime: Date.now(),
      round: seriesRoundCount
    };
    
    io.emit('eventStarted', activeEvent);
    console.log(`Event gestartet: ${JSON.stringify(activeEvent)}`);
  }
  // Wenn ein Event des gleichen Typs bereits läuft, nichts tun
  else if (activeEvent.id === eventType) {
    console.log(`Event vom Typ ${eventType} läuft bereits, ignoriere Start`);
  }
  // Wenn ein Event eines anderen Typs läuft
  else {
    console.log(`Warnung: Event vom Typ ${eventType} soll gestartet werden, aber ${activeEvent.id} läuft bereits`);
  }
}

/**
 * Behandelt das Stoppen eines Events
 */
function handleEventStop(eventType) {
  // Wenn kein Event läuft oder falscher Typ, nichts tun
  if (!activeEvent || activeEvent.id !== eventType) {
    console.log(`Kein passendes aktives Event zum Stoppen: ${eventType}`);
    return;
  }

  // Duplicate Stop Event Detection
  const now = Date.now();
  const lastStop = lastStopEventTime[eventType] || 0;
  const timeSinceLastStop = now - lastStop;
  
  // Wenn innerhalb von 2 Sekunden bereits ein Stop-Event für diesen Typ kam, ignorieren
  if (timeSinceLastStop < 2000) {
    console.log(`Dupliziertes Stop-Event für ${eventType} ignoriert (${timeSinceLastStop}ms seit letztem Stop)`);
    return;
  }
  
  lastStopEventTime[eventType] = now;

  // Timeout für mögliches Serienende setzen
  console.log(`Stop für ${eventType} erkannt - warte auf möglichen Serienfolge-Start`);
  
  // Wenn bereits ein Timeout existiert, löschen
  if (pendingSeriesTimeout) {
    clearTimeout(pendingSeriesTimeout);
  }
  
  // Speichere die tatsächliche Dauer nur bei Kampf-Events
  if (eventType === 'CombatBigExpDaily' || eventType === 'CombatBigLootDaily') {
    const actualDuration = Math.floor((Date.now() - activeEvent.startTime) / 1000);
    lastEventDurations[eventType] = actualDuration;
    console.log(`Kampf-Event: Tatsächliche Dauer von ${eventType}: ${actualDuration} Sekunden gespeichert`);
  }
  
  // Neuen Timeout setzen
  pendingSeriesTimeout = setTimeout(() => {
    console.log(`Keine Folge-Events erkannt für ${eventType} innerhalb des Schwellwerts - Serie scheint beendet`);
    
    if (activeEvent && activeEvent.id === eventType) {
      console.log(`Timer wird auf 0 gesetzt, da Serie beendet wurde`);
      
      // Bei Serienende Timer auf 0 setzen durch timerAdjusted statt timerExpired
      const eventName = activeEvent.name;
      activeEvent.duration = 0;
      io.emit('timerAdjusted', activeEvent);
      console.log(`Timer auf 0 gesetzt via timerAdjusted: ${JSON.stringify(activeEvent)}`);
      
      // Discord Webhook für Event-Ende senden
      sendDiscordWebhook(`🏁 Event "${eventName}" ist beendet!`);
      
      // Danach activeEvent zurücksetzen
      activeEvent = null;
      seriesRoundCount = 0; // Reset Rundenzähler
    }
    
    pendingSeriesTimeout = null;
  }, SERIES_GAP_THRESHOLD);
}

/**
 * Socket.IO Event-Handler
 */
io.on('connection', (socket) => {
  connectionCount++;
  io.emit('connectionCount', connectionCount);
  console.log(`Client verbunden: ${socket.id}. Gesamt: ${connectionCount}`);

  // Sende aktuellen Event-Status an neuen Client
  if (activeEvent) {
    socket.emit('eventStarted', activeEvent);
  }

  // Event starten (von Flutter-App)
  socket.on('startEvent', (data) => {
    const eventType = data.id;
    
    // App kann nur starten, wenn kein Event läuft
    if (activeEvent) {
      socket.emit('error', { message: 'Ein Event läuft bereits. Bitte zuerst abbrechen.' });
      return;
    }
    
    activeEvent = {
      ...data,
      startTime: Date.now()
    };
    io.emit('eventStarted', activeEvent);
    console.log(`Event von App gestartet: ${JSON.stringify(activeEvent)}`);
  });

  // Timer anpassen
  socket.on('adjustTimer', (adjustment) => {
    if (activeEvent) {
      activeEvent.duration += adjustment.adjustmentInSeconds;
      if (activeEvent.duration < 0) activeEvent.duration = 0;
      io.emit('timerAdjusted', activeEvent);
      console.log(`Timer angepasst: ${JSON.stringify(activeEvent)}`);
    }
  });

  // Timer abbrechen (von Flutter-App)
  socket.on('abortTimer', () => {
    console.log('Abbruch-Befehl von App erhalten');
    
    // Serientimeout abbrechen falls vorhanden
    if (pendingSeriesTimeout) {
      clearTimeout(pendingSeriesTimeout);
      pendingSeriesTimeout = null;
    }
    
    // Wenn Event aktiv, abbrechen und timerAborted senden (nicht timerExpired!)
    if (activeEvent) {
      console.log(`Timer abgebrochen: ${JSON.stringify(activeEvent)}`);
      activeEvent = null;
      seriesRoundCount = 0; // Reset Rundenzähler bei Abbruch
      io.emit('timerAborted', {});
    } else {
      io.emit('timerAborted', {});
      console.log('Kein aktiver Timer zum Abbrechen');
    }
  });

  // Benachrichtigung manuell auslösen
  socket.on('triggerNotification', () => {
    io.emit('playNotification');
    console.log('Manuelle Benachrichtigung ausgelöst');
  });

  // Client-Verbindung getrennt
  socket.on('disconnect', () => {
    connectionCount--;
    io.emit('connectionCount', connectionCount);
    console.log(`Client getrennt: ${socket.id}. Gesamt: ${connectionCount}`);
  });
});

/**
 * Periodische Überprüfung für abgelaufene Events
 */
setInterval(() => {
  if (activeEvent) {
    const elapsedSeconds = (Date.now() - activeEvent.startTime) / 1000;
    if (elapsedSeconds >= activeEvent.duration) {
      console.log(`Event natürlich abgelaufen: ${JSON.stringify(activeEvent)}`);
      
      // Speichere die tatsächliche Dauer nur bei Kampf-Events
      if (activeEvent.id === 'CombatBigExpDaily' || activeEvent.id === 'CombatBigLootDaily') {
        lastEventDurations[activeEvent.id] = Math.floor(elapsedSeconds);
        console.log(`Kampf-Event: Tatsächliche Dauer von ${activeEvent.id}: ${Math.floor(elapsedSeconds)} Sekunden gespeichert (natürlicher Ablauf)`);
      }
      
      // Da der Client timerExpired nicht implementiert hat, setzen wir den Timer
      // auf 0 und senden ein timerAdjusted Event
      const eventName = activeEvent.name;
      activeEvent.duration = 0;
      io.emit('timerAdjusted', activeEvent);
      console.log(`Timer auf 0 gesetzt via timerAdjusted: ${JSON.stringify(activeEvent)}`);
      
      // Discord Webhook für Event-Ende senden
      sendDiscordWebhook(`🏁 Event "${eventName}" ist beendet!`);
      
      // Danach activeEvent zurücksetzen
      activeEvent = null;
      seriesRoundCount = 0; // Reset Rundenzähler
    }
  }
}, 1000);

const PORT = process.env.PORT || 3009;
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});