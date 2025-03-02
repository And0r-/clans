// lib/screens/settings_screen.dart
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:audioplayers/audioplayers.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({Key? key}) : super(key: key);
  @override
  _SettingsScreenState createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  double _volume = 0.5; // Standardlautstärke
  final AudioPlayer _audioPlayer = AudioPlayer();

  @override
  void initState() {
    super.initState();
    _loadVolume();
  }

  Future<void> _loadVolume() async {
    SharedPreferences prefs = await SharedPreferences.getInstance();
    setState(() {
      _volume = prefs.getDouble('notificationVolume') ?? 0.5;
    });
    _audioPlayer.setVolume(_volume);
  }

  Future<void> _saveVolume(double value) async {
    SharedPreferences prefs = await SharedPreferences.getInstance();
    await prefs.setDouble('notificationVolume', value);
  }

  @override
  void dispose() {
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Einstellungen'),
        centerTitle: true,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            Text(
              'Audio Lautstärke: ${(_volume * 100).round()}%',
              style: TextStyle(fontSize: 18),
            ),
            Slider(
              value: _volume,
              min: 0.0,
              max: 1.0,
              divisions: 10,
              label: '${(_volume * 100).round()}%',
              onChanged: (double value) {
                setState(() {
                  _volume = value;
                });
                _audioPlayer.setVolume(_volume);
                _saveVolume(value);
              },
            ),
            SizedBox(height: 20),
            ElevatedButton(
              onPressed: () async {
                await _audioPlayer.play(AssetSource('sounds/notification.mp3'));
              },
              child: Text('Audio testen'),
            ),
          ],
        ),
      ),
    );
  }
}
