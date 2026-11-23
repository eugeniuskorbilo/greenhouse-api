import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'command_client.dart';
class QueuedCommand {
  const QueuedCommand(this.deviceId,this.key,this.body,this.createdAt);
  final String deviceId,key;
  final Map<String,dynamic> body;
  final DateTime createdAt;
  bool get expired => DateTime.now().difference(createdAt)>CommandQueue.ttl;
  Map<String,dynamic> toJson()=>{'deviceId':deviceId,'key':key,'body':body,'ts':createdAt.toIso8601String()};
  factory QueuedCommand.fromJson(Map<String,dynamic> j)=>QueuedCommand(j['deviceId'] as String,j['key'] as String,Map<String,dynamic>.from(j['body'] as Map),DateTime.parse(j['ts'] as String));
}
class CommandQueue {
  static const ttl=Duration(minutes:5), maxLen=10;
  static const storageKey='cmd_queue.s5.v1';
  static bool _flushing=false;
  Future<List<QueuedCommand>> _load() async {
    final p=await SharedPreferences.getInstance();
    return (p.getStringList(storageKey)??[]).map((s)=>QueuedCommand.fromJson(jsonDecode(s) as Map<String,dynamic>)).toList();
  }
  Future<void> _save(List<QueuedCommand> items) async {
    final p=await SharedPreferences.getInstance();
    await p.setStringList(storageKey,items.map((e)=>jsonEncode(e.toJson())).toList());
  }
  Future<bool> enqueue(QueuedCommand c) async {
    final items=await _load();
    if(items.length>=maxLen)return false;
    await _save([...items,c]);return true;
  }
  Future<({int sent,int dropped})> flush(CommandClient client) async {
    if(_flushing)return(sent:0,dropped:0);
    _flushing=true;var sent=0,dropped=0;
    try {
      for(final c in await _load()) {
        if(c.expired){dropped++;}
        else {
          final r=await client.sendCommand(c.deviceId,c.body,c.key);
          if(r.retryable)break;
          sent++;
        }
        final current=await _load();
        await _save(current.where((x)=>x.key!=c.key).toList());
      }
    } finally {_flushing=false;}
    return(sent:sent,dropped:dropped);
  }
}
