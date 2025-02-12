import 'package:flutter/material.dart';
import '../services/socket_service.dart';

class EventList extends StatelessWidget {
  final SocketService socketService;

  EventList({required this.socketService});

  final List<Map<String, dynamic>> events = [
    {'id': 'sammel', 'name': 'Sammel', 'duration': 12 * 60},
    {'id': 'herstellung', 'name': 'Herstellung', 'duration': 8 * 60},
    {'id': 'kampferfahrung', 'name': 'Kampferfahrung', 'duration': 17 * 60},
    {'id': 'kampfbelohnung', 'name': 'Kampfbelohnung', 'duration': 17 * 60},
  ];

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      itemCount: events.length,
      itemBuilder: (context, index) {
        var event = events[index];
        return ListTile(
          leading: Icon(Icons.play_circle_fill),
          title: Text('${event['name']}'),
          subtitle:
              Text('Dauer: ${((event['duration'] as int) / 60).round()} min'),
          onTap: () {
            // Setze den Startzeitstempel und sende das Event an das Backend.
            event['startTime'] = DateTime.now().millisecondsSinceEpoch;
            socketService.emit('startEvent', event);
          },
        );
      },
    );
  }
}
