// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/socket_service.dart';
import '../widgets/event_list.dart';
import '../widgets/countdown_view.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final SocketService _socketService = SocketService();
  Map<String, dynamic>? activeEvent;
  int remainingSeconds = 0;
  int connectionCount = 0;
  Timer? countdownTimer;
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
    _socketService.on('connectionCount', (data) {
      setState(() {
        connectionCount = data;
      });
      print("Aktuelle Verbindunganzahl: $connectionCount");
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
        if (updatedRemaining == 0) {
          timer.cancel();
          playNotificationSound();
          setState(() {
            activeEvent = null;
          });
        }
      }
    });
  }

  Future<void> playNotificationSound() async {
    SharedPreferences prefs = await SharedPreferences.getInstance();
    double volume = prefs.getDouble('notificationVolume') ?? 0.5;
    await audioPlayer.setVolume(volume);
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
        title: Text('Idle Clans'),
        centerTitle: true,
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: Text(
                '$connectionCount User',
                style: TextStyle(fontSize: 16),
              ),
            ),
          ),
          IconButton(
            icon: Icon(Icons.settings),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => SettingsScreen()),
              );
            },
          )
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: activeEvent == null
                ? EventList(socketService: _socketService)
                : CountdownView(
                    activeEvent: activeEvent!,
                    remainingSeconds: remainingSeconds,
                    socketService: _socketService,
                  ),
          ),
          if (activeEvent == null)
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: ElevatedButton.icon(
                onPressed: () {
                  _socketService.emit('triggerNotification', {});
                },
                icon: Icon(Icons.notifications),
                label: Text("Audio an alle senden"),
              ),
            ),
        ],
      ),
    );
  }
}
