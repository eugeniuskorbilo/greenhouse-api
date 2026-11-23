import 'dart:async';
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:uuid/uuid.dart';
import 'command_client.dart';
import 'command_queue.dart';
import 'prefs.dart';

enum CmdState { idle,sending,accepted,acknowledged,failed,expired,queued }
class IrrigationScreen extends StatefulWidget {
  const IrrigationScreen({super.key,required this.deviceId,required this.baseUrl});
  final String deviceId,baseUrl;
  @override State<IrrigationScreen> createState()=>_IrrigationScreenState();
}
class _IrrigationScreenState extends State<IrrigationScreen> {
  late final CommandClient _client;
  final _queue=CommandQueue();
  StreamSubscription<List<ConnectivityResult>>? _sub;
  Timer? _retryTimer;
  bool _retrying=false;
  double _threshold=30,_minutes=5;
  bool _saving=false;
  CmdState _cmd=CmdState.idle;
  bool get _busy=>_saving||_cmd==CmdState.sending||_cmd==CmdState.accepted;
  @override void initState(){
    super.initState();
    _client=CommandClient(widget.baseUrl);
    loadThreshold(widget.deviceId).then((v){if(mounted)setState(()=>_threshold=v.toDouble());});
    // USB adb reverse also works without an internet connection.
    // Retry periodically because server recovery does not change connectivity.
    _sub=Connectivity().onConnectivityChanged.listen((_) => _retryQueued());
    _retryTimer=Timer.periodic(const Duration(seconds:5),(_) => _retryQueued());
    unawaited(_retryQueued());
  }
  Future<void> _retryQueued() async {
    if(_retrying || !mounted)return;
    _retrying=true;
    try {
      final result=await _queue.flush(_client);
      if(!mounted)return;
      if(result.dropped>0){
        setState(()=>_cmd=CmdState.expired);
      }
      if(result.sent>0){
        if(_cmd==CmdState.queued){
          setState(()=>_cmd=CmdState.idle);
        }
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content:Text('Повторно надіслано з черги: ${result.sent}'),
        ));
      }
    } catch (_) {
      // Keep the saved queue for a later attempt.
    } finally {
      _retrying=false;
    }
  }

  Future<void> _saveThreshold() async {
    final value=_threshold.round();
    if(value<10||value>60)return;
    setState(()=>_saving=true);
    final ok=await _client.putThreshold(widget.deviceId,value);
    if(ok)await saveThreshold(widget.deviceId,value);
    if(!mounted)return;
    setState(()=>_saving=false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(ok?'Поріг збережено: $value %':'Не вдалося зберегти поріг')));
  }
  Future<void> _irrigate() async {
    if(_busy)return;
    final minutes=_minutes.round();
    final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Запустити полив?'),content:Text('Клапан відкриється на $minutes хв.'),actions:[
        TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Скасувати')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Так'))]));
    if(confirmed!=true||!mounted)return;
    final key=const Uuid().v4();
    final body=<String,dynamic>{'type':'irrigate','durationMin':minutes};
    setState(()=>_cmd=CmdState.sending);
    final r=await _client.sendCommand(widget.deviceId,body,key);
    if(!mounted)return;
    if(r.result==SendResult.accepted||r.result==SendResult.replayed){
      setState(()=>_cmd=CmdState.accepted);
      if(r.commandId!=null)await _waitAck(r.commandId!);
      else if(mounted)setState(()=>_cmd=CmdState.failed);
    } else if(r.retryable){
      final ok=await _queue.enqueue(QueuedCommand(widget.deviceId,key,body,DateTime.now()));
      if(mounted)setState(()=>_cmd=ok?CmdState.queued:CmdState.failed);
    } else {setState(()=>_cmd=CmdState.failed);}
  }
  Future<void> _waitAck(String id) async {
    final deadline=DateTime.now().add(const Duration(seconds:10));
    while(DateTime.now().isBefore(deadline)){
      await Future.delayed(const Duration(seconds:1));
      final status=await _client.commandStatus(id);
      if(!mounted)return;
      if(status=='acknowledged'){setState(()=>_cmd=CmdState.acknowledged);return;}
      if(status=='failed'){setState(()=>_cmd=CmdState.failed);return;}
    }
    if(mounted)setState(()=>_cmd=CmdState.expired);
  }
  Widget _banner(){
    final (icon,message)=switch(_cmd){
      CmdState.idle=>(Icons.info_outline,'Готово до запуску'),
      CmdState.sending=>(Icons.sync,'Відправлення…'),
      CmdState.accepted=>(Icons.hourglass_top,'Прийнято, очікуємо підтвердження'),
      CmdState.acknowledged=>(Icons.check_circle,'Пристрій підтвердив виконання'),
      CmdState.failed=>(Icons.error,'Команду відхилено або черга заповнена'),
      CmdState.expired=>(Icons.timer_off,'Термін дії команди минув'),
      CmdState.queued=>(Icons.cloud_off,'Немає зв’язку: команду поставлено в чергу')};
    return Card(child:ListTile(leading:Icon(icon),title:Text(message)));
  }
  @override void dispose(){_retryTimer?.cancel();_sub?.cancel();super.dispose();}
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Полив: налаштування')),
    body:ListView(padding:const EdgeInsets.all(16),children:[
      Text('Поріг вологості ґрунту: ${_threshold.round()} %'),
      Slider(value:_threshold,min:10,max:60,divisions:10,label:'${_threshold.round()} %',onChanged:_busy?null:(v)=>setState(()=>_threshold=v)),
      FilledButton(onPressed:_busy?null:_saveThreshold,child:Text(_saving?'Збереження…':'Зберегти поріг')),
      const Divider(height:32),
      Text('Тривалість поливу: ${_minutes.round()} хв'),
      Slider(value:_minutes,min:1,max:15,divisions:14,onChanged:_busy?null:(v)=>setState(()=>_minutes=v)),
      FilledButton.tonal(onPressed:_busy?null:_irrigate,child:Text('Полив ${_minutes.round()} хв')),
      const SizedBox(height:16),_banner(),
    ]));
}
