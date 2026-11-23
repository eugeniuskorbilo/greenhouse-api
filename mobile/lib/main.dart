import 'dart:async';
import 'package:flutter/material.dart';
import 'services/api.dart';
import 'services/notifications.dart';
import 'screens/device_list_screen.dart';
import 'screens/device_detail_screen.dart';

const apiBase=String.fromEnvironment('API_BASE',defaultValue:'http://127.0.0.1:4000');
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Notifications.init(apiBase);
  runApp(const GreenhouseApp());
}
class GreenhouseApp extends StatefulWidget {
  const GreenhouseApp({super.key});
  @override State<GreenhouseApp> createState()=>_State();
}
class _State extends State<GreenhouseApp> {
  final navigatorKey=GlobalKey<NavigatorState>();
  StreamSubscription<String>? linkSub,foregroundSub;
  String? queued;
  @override void initState(){super.initState();
    queued=Notifications.pendingBed;
    linkSub=Notifications.navigation.stream.listen(_openBed);
    foregroundSub=Notifications.foreground.stream.listen((message){
      final context=navigatorKey.currentContext;
      if(context!=null)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(message)));
    });
    WidgetsBinding.instance.addPostFrameCallback((_){if(queued!=null){_openBed(queued!);queued=null;}});
  }
  void _openBed(String bed){
    if(!RegExp(r'^[a-zA-Z0-9_-]+$').hasMatch(bed))return;
    final nav=navigatorKey.currentState;
    if(nav==null){queued=bed;return;}
    nav.push(MaterialPageRoute(builder:(_)=>DeviceDetailScreen(bed:bed,api:const Api(apiBase))));
  }
  @override void dispose(){linkSub?.cancel();foregroundSub?.cancel();super.dispose();}
  @override Widget build(BuildContext context)=>MaterialApp(
    navigatorKey:navigatorKey,title:'Теплиця №1',debugShowCheckedModeBanner:false,
    theme:ThemeData(colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xff087f63)),useMaterial3:true),
    home:DeviceListScreen(api:const Api(apiBase),open:_openBed));
}
