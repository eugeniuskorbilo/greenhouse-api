import 'package:flutter/material.dart';
import '../services/api.dart';
class DeviceListScreen extends StatefulWidget {
  final Api api;
  final void Function(String) open;
  const DeviceListScreen({super.key,required this.api,required this.open});
  @override State<DeviceListScreen> createState()=>_State();
}
class _State extends State<DeviceListScreen> {
  late Future<List<String>> future;
  @override void initState(){super.initState();refresh();}
  void refresh(){future=widget.api.devices();}
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Теплиця №1 · Датчики')),
    body:FutureBuilder<List<String>>(future:future,builder:(context,snapshot){
      if(snapshot.connectionState!=ConnectionState.done)return const Center(child:CircularProgressIndicator());
      if(snapshot.hasError)return Center(child:Column(mainAxisSize:MainAxisSize.min,children:[Text('Помилка: ${snapshot.error}'),ElevatedButton(onPressed:()=>setState(refresh),child:const Text('Повторити'))]));
      final beds=snapshot.data??[];
      if(beds.isEmpty)return const Center(child:Text('Пристроїв поки немає. Опублікуйте телеметрію.'));
      return ListView(children:beds.map((bed)=>Card(child:ListTile(
        leading:const Icon(Icons.grass,color:Colors.green),title:Text(bed=='bed-a'?'Грядка А':bed=='bed-b'?'Грядка Б':bed),
        subtitle:const Text('Вологість ґрунту'),trailing:const Icon(Icons.chevron_right),onTap:()=>widget.open(bed)))).toList());
    }),
  );
}
