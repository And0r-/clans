import 'package:flutter/material.dart';
import '../services/socket_service.dart';

class CountdownView extends StatelessWidget {
  final Map<String, dynamic> activeEvent;
  final int remainingSeconds;
  final SocketService socketService;

  CountdownView({
    required this.activeEvent,
    required this.remainingSeconds,
    required this.socketService,
  });

  String formatDuration(int seconds) {
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '$minutes:${secs.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          'Event: ${activeEvent['name']}',
          style: TextStyle(fontSize: 24),
          textAlign: TextAlign.center,
        ),
        SizedBox(height: 20),
        Text(
          formatDuration(remainingSeconds),
          style: TextStyle(fontSize: 48),
          textAlign: TextAlign.center,
        ),
        SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ElevatedButton(
              onPressed: () {
                socketService.emit('adjustTimer', {'adjustmentInSeconds': 60});
              },
              child: Text('+1 min'),
            ),
            SizedBox(width: 20),
            ElevatedButton(
              onPressed: () {
                socketService.emit('adjustTimer', {'adjustmentInSeconds': -60});
              },
              child: Text('-1 min'),
            ),
          ],
        ),
        SizedBox(height: 20),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.red,
          ),
          onPressed: () {
            socketService.emit('abortTimer', {});
          },
          child: Text('Für alle abbrechen'),
        ),
      ],
    );
  }
}
