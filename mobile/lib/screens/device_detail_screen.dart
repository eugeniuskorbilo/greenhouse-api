import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/intl.dart';
import '../services/api.dart';
import '../services/live.dart';
import '../irrigation_screen.dart';

class DeviceDetailScreen extends StatefulWidget {
  final String bed;
  final Api api;
  const DeviceDetailScreen({super.key,required this.bed,required this.api});
  @override State<DeviceDetailScreen> createState()=>_State();
}
class _State extends State<DeviceDetailScreen> with WidgetsBindingObserver {
  late Live live;
  StreamSubscription<Reading>? sub;
  Timer? poll;
  final points=<Reading>[];
  bool loading=true,offline=false;
  String? error;
  DateTime? cachedAt;
  @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);live=Live(widget.api.base);_start();}
  Future<void> _start() async {
    await _loadCache();
    live.connect(widget.bed,onReconnect:()=>_loadNetwork(),onDisconnect:()=>_markOffline());
    sub=live.readings.listen((point){
      if(!mounted)return;
      _merge([point]);_save();
    });
    await _loadNetwork();
    poll=Timer.periodic(const Duration(seconds: 8),(_)=>_loadNetwork());
  }
  void _markOffline(){if(mounted)setState(()=>offline=true);}
  void _merge(List<Reading> incoming){
    final unique=<int,Reading>{for(final p in points)p.time.millisecondsSinceEpoch:p};
    for(final p in incoming)unique[p.time.millisecondsSinceEpoch]=p;
    final sorted=unique.values.toList()..sort((a,b)=>a.time.compareTo(b.time));
    if(mounted)setState((){points..clear()..addAll(sorted.length>120?sorted.sublist(sorted.length-120):sorted);loading=false;error=null;offline=false;cachedAt=DateTime.now();});
  }
  Future<void> _save() async {
    final prefs=await SharedPreferences.getInstance();
    await prefs.setString('cache_${widget.bed}',jsonEncode(points.map((p)=>p.toJson()).toList()));
    await prefs.setInt('cache_time_${widget.bed}',DateTime.now().millisecondsSinceEpoch);
  }
  Future<void> _loadCache() async {
    final prefs=await SharedPreferences.getInstance();
    final raw=prefs.getString('cache_${widget.bed}');
    if(raw==null)return;
    try {
      final list=(jsonDecode(raw) as List).map((e)=>Reading.fromJson(Map<String,dynamic>.from(e),widget.bed)).toList();
      if(mounted)setState((){points..clear()..addAll(list);cachedAt=DateTime.fromMillisecondsSinceEpoch(prefs.getInt('cache_time_${widget.bed}')??0);loading=false;});
    }catch(_){}
  }
  Future<void> _loadNetwork() async {
    try {final rows=await widget.api.history(widget.bed);if(!mounted)return;_merge(rows);await _save();}
    catch(e){if(mounted)setState((){offline=true;loading=false;error=points.isEmpty?'${e.toString()}':null;});}
  }
  @override void didChangeAppLifecycleState(AppLifecycleState state){if(state==AppLifecycleState.resumed)_loadNetwork();}
  @override void dispose(){WidgetsBinding.instance.removeObserver(this);poll?.cancel();sub?.cancel();live.dispose();super.dispose();}
  @override Widget build(BuildContext context){
    final latest=points.isEmpty?null:points.last;
    final low=latest!=null&&latest.value<30;
    final time=cachedAt==null?'—':DateFormat('HH:mm').format(cachedAt!);
    return Scaffold(appBar:AppBar(title:Text(widget.bed=='bed-a'?'Грядка А':'Грядка Б'),actions:[IconButton(icon:const Icon(Icons.refresh),onPressed:_loadNetwork)]),
      body:loading?const Center(child:CircularProgressIndicator()):error!=null?Center(child:Column(mainAxisSize:MainAxisSize.min,children:[Text(error!),ElevatedButton(onPressed:_loadNetwork,child:const Text('Повторити'))])):
      ListView(padding:const EdgeInsets.all(16),children:[
        if(offline)Container(padding:const EdgeInsets.all(12),color:Colors.amber.shade100,child:Text('Офлайн · оновлено $time')),
        const SizedBox(height:12),
        Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Вологість ґрунту',style:TextStyle(fontSize:17)),
          Text(latest==null?'—': '${latest.value.toStringAsFixed(1)} %',style:const TextStyle(fontSize:38,fontWeight:FontWeight.bold)),
          Row(children:[Icon(low?Icons.warning_amber:Icons.check_circle,color:low?Colors.deepOrange:Colors.green),const SizedBox(width:8),Text(latest==null?'Немає даних':low?'Нижче порогу 30 %':'Норма')]),
          if(latest!=null)Text('Вимір: ${DateFormat('dd.MM HH:mm').format(latest.time)}')
        ]))),
        const SizedBox(height:12),
        FilledButton.icon(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => IrrigationScreen(
                deviceId: widget.bed,
                baseUrl: widget.api.base.replaceFirst(RegExp(r':4000/?$'), ':3000') + '/api/v1',
              ),
            ),
          ),
          icon: const Icon(Icons.water_drop),
          label: const Text('Керування поливом'),
        ),
        const SizedBox(height:20),const Text('Історія · останні 120 точок',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),
        const SizedBox(height:12),SizedBox(height:260,child:points.length<2?const Center(child:Text('Недостатньо даних для графіка')):
          LineChart(LineChartData(minY:0,maxY:100,gridData:const FlGridData(show:true),
            titlesData:const FlTitlesData(topTitles:AxisTitles(sideTitles:SideTitles(showTitles:false)),rightTitles:AxisTitles(sideTitles:SideTitles(showTitles:false))),
            lineBarsData:[LineChartBarData(spots:[for(var i=0;i<points.length;i++)FlSpot(i.toDouble(),points[i].value)],isCurved:false,color:Colors.teal,dotData:const FlDotData(show:false)),
              LineChartBarData(spots:[FlSpot(0,30),FlSpot((points.length-1).toDouble(),30)],color:Colors.deepOrange,barWidth:1,dashArray:[6,5],dotData:const FlDotData(show:false))]))),
        const SizedBox(height:12),Text('REST + Socket.IO · ${points.length} точок',style:TextStyle(color:Colors.grey.shade700)),
      ]));
  }
}
