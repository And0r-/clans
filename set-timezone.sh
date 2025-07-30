#!/bin/bash

# Script zum Setzen der korrekten Zeitzone auf dem Host-System
# Funktioniert für Alpine Linux und andere Linux-Distributionen

echo "🕐 Zeitzone Setup Script"
echo "========================"

# Prüfe ob als root ausgeführt
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Bitte als root ausführen: sudo $0"
    exit 1
fi

# Erkenne das Betriebssystem
if [ -f /etc/alpine-release ]; then
    echo "📍 Alpine Linux erkannt"
    
    # Installiere tzdata falls nicht vorhanden
    if ! apk info tzdata &> /dev/null; then
        echo "📦 Installiere tzdata..."
        apk add tzdata
    fi
    
    # Setze Zeitzone
    echo "🌍 Setze Zeitzone auf Europe/Zurich..."
    cp /usr/share/zoneinfo/Europe/Zurich /etc/localtime
    echo "Europe/Zurich" > /etc/timezone
    
    # Optional: tzdata wieder entfernen um Platz zu sparen (Alpine-typisch)
    # apk del tzdata
    
elif [ -f /etc/debian_version ]; then
    echo "📍 Debian/Ubuntu erkannt"
    
    # Setze Zeitzone interaktiv
    echo "🌍 Setze Zeitzone auf Europe/Zurich..."
    timedatectl set-timezone Europe/Zurich 2>/dev/null || {
        # Fallback für Systeme ohne systemd
        ln -sf /usr/share/zoneinfo/Europe/Zurich /etc/localtime
        echo "Europe/Zurich" > /etc/timezone
    }
    
else
    echo "📍 Generisches Linux System"
    
    # Versuche generischen Ansatz
    if [ -d /usr/share/zoneinfo ]; then
        echo "🌍 Setze Zeitzone auf Europe/Zurich..."
        ln -sf /usr/share/zoneinfo/Europe/Zurich /etc/localtime
        echo "Europe/Zurich" > /etc/timezone
    else
        echo "❌ Zeitzone-Daten nicht gefunden!"
        exit 1
    fi
fi

# Zeige aktuelle Zeit
echo ""
echo "✅ Zeitzone erfolgreich gesetzt!"
echo "📅 Aktuelle Zeit: $(date)"
echo "⏰ Zeitzone: $(date +%Z)"
echo ""
echo "🔄 Bitte Docker Container neu starten:"
echo "   docker-compose -f docker-compose-prod.yml restart"