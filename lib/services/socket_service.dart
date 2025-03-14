import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:flutter_dotenv/flutter_dotenv.dart';

class SocketService {
  IO.Socket socket;

  SocketService._internal()
      : socket = IO.io(
            dotenv.env['BACKEND_URL'] ?? 'http://localhost:3009',
            <String, dynamic>{
              'transports': ['websocket'],
              'autoConnect': true,
              'query': {
                'token': dotenv.env['API_TOKEN'] ?? '',
              },
            }) {
    socket.onConnect((_) {
      print('Connected to backend');
    });
    socket.onDisconnect((_) {
      print('Disconnected from backend');
    });
  }

  static final SocketService _instance = SocketService._internal();

  factory SocketService() {
    return _instance;
  }

  void emit(String event, dynamic data) {
    socket.emit(event, data);
  }

  void on(String event, Function(dynamic) callback) {
    socket.on(event, callback);
  }

  void dispose() {
    socket.dispose();
  }
}
