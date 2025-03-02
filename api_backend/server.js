// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*" }
});

// Globale Variablen zur Speicherung der Einstellungen und des aktiven Events
let clanSettings = {
    eventStartTime: "20:00" // Standard: 20:00 Uhr
    // Weitere globale Einstellungen können hier ergänzt werden
};

let activeEvent = null;

/**
 * REST-Endpoints
 */

// GET /api/settings
// Liefert die aktuellen globalen Clan-Einstellungen
app.get('/api/settings', (req, res) => {
    res.json(clanSettings);
});

// POST /api/settings
// Aktualisiert die globalen Clan-Einstellungen und benachrichtigt alle Clients
app.post('/api/settings', (req, res) => {
    clanSettings = { ...clanSettings, ...req.body };
    // Alle verbundenen Clients über die Änderung informieren
    io.emit('settingsUpdate', clanSettings);
    res.json(clanSettings);
});

/**
 * Socket.io Events
 */
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Sende, falls ein Event bereits läuft, den aktuellen Status an den neuen Client
    if (activeEvent) {
        socket.emit('eventStarted', activeEvent);
    }

    // Event: Start eines Clan-Events
    // Erwartete Daten: { eventId, name, duration }
    socket.on('startEvent', (data) => {
        if (activeEvent) {
            // Optional: Sende eine Fehlermeldung an den anfragenden Client
            socket.emit('error', { message: 'Ein Event läuft bereits. Bitte abbrechen, bevor ein neues gestartet wird.' });
            console.log(`Neuer Startversuch abgelehnt, da bereits ein Event läuft: ${JSON.stringify(activeEvent)}`);
            return;
        }
        // Erstelle ein aktives Event-Objekt inklusive Startzeit (Timestamp) und Dauer (in Sekunden)
        activeEvent = {
            ...data,
            startTime: Date.now(),
            duration: data.duration
        };
        io.emit('eventStarted', activeEvent);
        console.log(`Event gestartet: ${JSON.stringify(activeEvent)}`);
    });

    // Event: Anpassung des Countdowns
    // Erwartete Daten: { adjustmentInSeconds } (z. B. +60 oder -60)
    socket.on('adjustTimer', (adjustment) => {
        if (activeEvent) {
            activeEvent.duration += adjustment.adjustmentInSeconds;
            // Verhindere negative Zeiten
            if (activeEvent.duration < 0) activeEvent.duration = 0;
            io.emit('timerAdjusted', activeEvent);
            console.log(`Timer angepasst: ${JSON.stringify(activeEvent)}`);
        }
    });

    socket.on('abortTimer', () => {
        // Setze den aktiven Event zurück
        activeEvent = null;
        // Sende an alle Clients, dass der Timer abgebrochen wurde
        io.emit('timerAborted', {});
        console.log('Timer aborted for all clients.');
    });

    // Event: Manuelles Auslösen des akustischen Signals (Notification)
    socket.on('triggerNotification', () => {
        io.emit('playNotification');
        console.log('Manuelle Notification ausgelöst');
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});


setInterval(() => {
    if (activeEvent) {
        const elapsedSeconds = (Date.now() - activeEvent.startTime) / 1000;
        if (elapsedSeconds >= activeEvent.duration) {
            // Optional: Benachrichtige die Clients, dass der Timer abgelaufen ist
            io.emit('timerExpired');
            console.log(`Event abgelaufen: ${JSON.stringify(activeEvent)} – activeEvent wird zurückgesetzt.`);
            activeEvent = null;
        }
    }
}, 1000);

// Verwende Port 3009 (bzw. den Wert aus der Umgebungsvariable PORT)
const PORT = process.env.PORT || 3009;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
