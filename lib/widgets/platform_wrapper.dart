import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

class PlatformWrapper extends StatefulWidget {
  final Widget child;

  const PlatformWrapper({Key? key, required this.child}) : super(key: key);

  @override
  _PlatformWrapperState createState() => _PlatformWrapperState();
}

class _PlatformWrapperState extends State<PlatformWrapper> {
  bool _isStarted = false;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb && !_isStarted) {
      // Auf Web: Zeige einen Vollbild-Landing-Screen mit einem Play-Button.
      return Scaffold(
        body: Center(
          child: ElevatedButton.icon(
            icon: Icon(Icons.play_arrow, size: 64),
            label: Text('App starten'),
            onPressed: () {
              setState(() {
                _isStarted = true;
              });
            },
          ),
        ),
      );
    } else if (kIsWeb) {
      return widget.child;
      // Auf Web, nachdem der Benutzer interagiert hat:
      // return Scaffold(
      //   body: Center(
      //     child: ConstrainedBox(
      //       constraints: BoxConstraints(maxWidth: 400, maxHeight: 700),
      //       child: Card(
      //         elevation: 4,
      //         margin: EdgeInsets.all(16),
      //         shape: RoundedRectangleBorder(
      //           borderRadius: BorderRadius.circular(12),
      //           side: BorderSide(color: Colors.grey),
      //         ),
      //         child: widget.child,
      //       ),
      //     ),
      //   ),
      // );
    } else {
      // Auf nativen Plattformen: Zeige den Child direkt.
      return widget.child;
    }
  }
}
