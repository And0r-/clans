import 'package:flutter/material.dart';
import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import '../services/socket_service.dart';
import '../widgets/event_list.dart';
import '../widgets/countdown_view.dart';

class HomeScreen extends StatefulWidget {
  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final SocketService _socketService = SocketService();
  Map<String, dynamic>? activeEvent;
  int remainingSeconds = 0;
  Timer? countdownTimer;
  // AudioPlayer-Instanz
  final AudioPlayer audioPlayer = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _initializeSocketListeners();
  }

  void _initializeSocketListeners() {
    _socketService.on('eventStarted', (data) {
      setState(() {
        activeEvent = Map<String, dynamic>.from(data);
      });
      _startCountdown();
    });
    _socketService.on('timerAdjusted', (data) {
      setState(() {
        activeEvent = Map<String, dynamic>.from(data);
      });
    });
    _socketService.on('timerAborted', (_) {
      setState(() {
        activeEvent = null;
        remainingSeconds = 0;
      });
      countdownTimer?.cancel();
    });
    _socketService.on('playNotification', (_) {
      playNotificationSound();
    });
  }

  void _startCountdown() {
    countdownTimer?.cancel();
    countdownTimer = Timer.periodic(Duration(seconds: 1), (timer) {
      if (activeEvent != null) {
        int startTime = activeEvent!['startTime'] ?? 0;
        int duration = activeEvent!['duration'] ?? 0;
        int elapsed =
            ((DateTime.now().millisecondsSinceEpoch - startTime) ~/ 1000);
        int updatedRemaining = duration - elapsed;
        if (updatedRemaining < 0) updatedRemaining = 0;
        setState(() {
          remainingSeconds = updatedRemaining;
        });
        // Wenn der Timer abgelaufen ist:
        if (updatedRemaining == 0) {
          timer.cancel();
          // Akustisches Signal abspielen
          playNotificationSound();
          // Wechsel zurück zur Event-Liste (Home Screen)
          setState(() {
            activeEvent = null;
          });
        }
      }
    });
  }

  Future<void> playNotificationSound() async {
    // Spielt den Sound aus dem Asset ab.
    // Stelle sicher, dass die Datei assets/sounds/notification.mp3 existiert und in pubspec.yaml referenziert wird.
    await audioPlayer.play(AssetSource('sounds/notification.mp3'));
  }

  @override
  void dispose() {
    countdownTimer?.cancel();
    _socketService.dispose();
    audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Idle Clans Helper'),
        actions: [
          IconButton(
            icon: Icon(Icons.notifications),
            onPressed: () {
              _socketService.emit('triggerNotification', {});
            },
          )
        ],
      ),
      body: activeEvent == null
          ? EventList(socketService: _socketService)
          : CountdownView(
              activeEvent: activeEvent!,
              remainingSeconds: remainingSeconds,
              socketService: _socketService,
            ),
    );
  }
}
