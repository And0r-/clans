# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Idle Clans Tools is a Flutter-based multi-platform application for managing game events with a Node.js backend. The app provides real-time event tracking, countdown timers, and notification management for the game "Idle Clans."

### Architecture

- **Flutter Frontend**: Cross-platform mobile/desktop app with Socket.IO real-time communication
- **Node.js Backend**: Express server with Socket.IO for WebSocket connections and REST API endpoints
- **Docker Deployment**: Multi-container setup with web and backend services

## Common Development Commands

### Flutter (Frontend)
```bash
# Install dependencies
flutter pub get

# Run the app in development mode
flutter run

# Build for web
flutter build web --release

# Run tests
flutter test

# Analyze code
flutter analyze

# Clean build cache
flutter clean
```

### Backend (Node.js)
```bash
# Navigate to backend directory
cd api_backend

# Install dependencies
npm install

# Start development server
npm start

# The backend runs on port 3009 by default
```

### Docker Development
```bash
# Build and run both services
docker-compose up --build

# Run in detached mode
docker-compose up -d

# Stop services
docker-compose down

# Production build
docker-compose -f docker-compose-prod.yml up --build
```

## Key Components

### Flutter App Structure
- `lib/main.dart`: App entry point with platform-specific window sizing
- `lib/screens/home_screen.dart`: Main interface with event management and countdown
- `lib/services/socket_service.dart`: Singleton WebSocket service for backend communication
- `lib/models/event.dart`: Event data model with serialization
- `lib/widgets/`: Reusable UI components (countdown_view, event_list, platform_wrapper)

### Backend API Structure
- `api_backend/server.js`: Express server with Socket.IO integration
- REST endpoints:
  - `GET /api/settings`: Retrieve clan settings
  - `POST /api/settings`: Update clan settings
  - `POST /minigame/:action/:type`: Webhook for game events (start/stop)
  - `GET /debug/status`: Debug endpoint for current state
- Socket.IO events: `eventStarted`, `timerAdjusted`, `timerAborted`, `playNotification`

### Event Management System
The backend handles game events with sophisticated series detection:
- **Event Mapping**: Maps game event types to display names and durations
- **Series Detection**: Prevents timer resets during rapid event sequences using a 500ms gap threshold
- **Webhook Integration**: Receives start/stop events from external game integrations

## Configuration

### Environment Variables
Create `.env` file based on `.env.example`:
- `BACKEND_URL`: Backend server URL (default: http://localhost:3009)
- `API_TOKEN`: Authentication token for API access

### Authentication
Both REST API and WebSocket connections require API token authentication via:
- HTTP Header: `Authorization: your_token`
- Query Parameter: `?token=your_token`
- WebSocket Query: `handshake.query.token`

## Platform-Specific Notes

### Flutter Platform Support
- **Desktop**: Fixed window size (360x640) with title bar
- **Web**: Responsive design with nginx serving
- **Mobile**: Standard Flutter mobile app behavior

### Dependencies
- **Socket.IO**: Real-time communication (`socket_io_client: ^3.0.2`)
- **Audio**: Notification sounds (`audioplayers: ^6.1.2`)
- **Storage**: Settings persistence (`shared_preferences: ^2.0.15`)
- **Environment**: Configuration management (`flutter_dotenv: ^5.0.2`)

## Testing

Run Flutter tests:
```bash
flutter test
```

Test files are located in the `test/` directory following Flutter conventions.

## Deployment

### Development
1. Start backend: `cd api_backend && npm start`
2. Start Flutter app: `flutter run`

### Production (Docker)
1. Configure environment variables in `docker-compose-prod.yml`
2. Run: `docker-compose -f docker-compose-prod.yml up --build`
3. Web app available on port 8080, backend on port 3009

## Code Style

The project follows Flutter/Dart conventions:
- Uses `analysis_options.yaml` with `flutter_lints` package
- German language comments and UI text
- Singleton pattern for services (SocketService)
- Stateful widgets for real-time data management