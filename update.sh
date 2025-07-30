#!/bin/bash

# Idle Clans Tools - Smooth Update Script
# Führt ein Zero-Downtime Update durch

echo "🚀 Starte Idle Clans Tools Update..."

# Prüfe ob docker-compose verfügbar ist
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose nicht gefunden!"
    exit 1
fi

# Hole aktuelle Git Updates
echo "📥 Hole aktuelle Updates vom Repository..."
git pull

# Baue neue Images (ohne Cache für sauberen Build)
echo "🔨 Baue neue Docker Images..."
docker-compose -f docker-compose-prod.yml build --no-cache

# Starte Container mit Zero-Downtime
echo "🔄 Starte neue Container..."
docker-compose -f docker-compose-prod.yml up -d --remove-orphans

# Zeige Status
echo "📊 Container Status:"
docker-compose -f docker-compose-prod.yml ps

echo "✅ Update erfolgreich abgeschlossen!"
echo ""
echo "📝 Logs anzeigen mit: docker-compose -f docker-compose-prod.yml logs -f"