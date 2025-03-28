import 'package:flutter/material.dart';
import '../services/socket_service.dart';

class EventList extends StatelessWidget {
  final SocketService socketService;

  EventList({required this.socketService});

  final List<Map<String, dynamic>> events = [
    {'id': 'Gathering', 'name': 'Sammel', 'duration': 12 * 60},
    {'id': 'Crafting', 'name': 'Herstellung', 'duration': 8 * 60},
    {'id': 'CombatBigExpDaily', 'name': 'Kampferfahrung', 'duration': 20 * 60},
    {'id': 'CombatBigLootDaily', 'name': 'Kampfbelohnung', 'duration': 20 * 60},
    {'id': 'SkillingParty', 'name': 'Skilling Gruppe', 'duration': 2 * 60},
  ];

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      shrinkWrap: true,
      itemCount: events.length,
      separatorBuilder: (context, index) => Divider(),
      itemBuilder: (context, index) {
        var event = events[index];
        return ListTile(
          leading: Icon(Icons.play_circle_fill),
          title: Text(
            '${event['name']}',
            textAlign: TextAlign.center,
          ),
          subtitle: Text(
            'Dauer: ${((event['duration'] as int) / 60).round()} min',
            textAlign: TextAlign.center,
          ),
          onTap: () {
            event['startTime'] = DateTime.now().millisecondsSinceEpoch;
            socketService.emit('startEvent', event);
          },
        );
      },
    );
  }
}
