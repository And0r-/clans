class Event {
  final String id;
  final String name;
  final int duration; // Dauer in Sekunden
  final int startTime; // Zeitstempel in Millisekunden

  Event({
    required this.id,
    required this.name,
    required this.duration,
    required this.startTime,
  });

  factory Event.fromMap(Map<String, dynamic> map) {
    return Event(
      id: map['id'] as String,
      name: map['name'] as String,
      duration: map['duration'] as int,
      startTime: map['startTime'] as int,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'duration': duration,
      'startTime': startTime,
    };
  }
}
