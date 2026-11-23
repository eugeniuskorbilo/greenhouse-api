import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

@pragma('vm:entry-point')
Future<void> firebaseBackground(RemoteMessage message) async {
  await Firebase.initializeApp();
}
class Notifications {
  static final navigation = StreamController<String>.broadcast();
  static final foreground = StreamController<String>.broadcast();
  static String? pendingBed;
  static bool enabled = false;
  static Future<void> init(String apiBase) async {
    try {
      await Firebase.initializeApp();
      enabled = true;
      FirebaseMessaging.onBackgroundMessage(firebaseBackground);
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      Future<void> register(String? token) async {
        if(token == null) return;
        try {await http.post(Uri.parse('$apiBase/api/v1/push/register'),
          headers:{'content-type':'application/json'},body:jsonEncode({'token':token}));}catch(_){}
      }
      await register(await messaging.getToken());
      messaging.onTokenRefresh.listen(register);
      final initial = await messaging.getInitialMessage();
      if(initial != null) pendingBed = _bed(initial);
      FirebaseMessaging.onMessage.listen((message) {
        foreground.add(message.notification?.body ?? 'Вологість ґрунту нижче 30 %');
      });
      FirebaseMessaging.onMessageOpenedApp.listen((message){
        final bed = _bed(message);
        if(bed != null) navigation.add(bed);
      });
    } catch (e) {
      enabled = false;
      // Without generated Firebase configuration the REST/Socket.IO client still works.
    }
  }
  static String? _bed(RemoteMessage message) => message.data['bed_id']?.toString() ?? message.data['device_id']?.toString();
}
