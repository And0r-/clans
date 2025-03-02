import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:window_size/window_size.dart';
import 'screens/home_screen.dart';
import 'widgets/platform_wrapper.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Nur für native Plattformen (nicht Web) ausführen
  if (!kIsWeb && (Platform.isWindows || Platform.isLinux || Platform.isMacOS)) {
    setWindowTitle('Idle Clans App');
    setWindowMinSize(const Size(360, 640));
    setWindowMaxSize(const Size(360, 640));
    setWindowFrame(const Rect.fromLTWH(100, 100, 360, 640));
  }

  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Idle Clans App',
      home: PlatformWrapper(
        child: HomeScreen(),
      ),
    );
  }
}
