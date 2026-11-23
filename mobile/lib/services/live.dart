import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api.dart';
class Live {
  final String base;
  io.Socket? _socket;
  final _controller = StreamController<Reading>.broadcast();
  Stream<Reading> get readings => _controller.stream;
  Live(this.base);
  void connect(String bed, {void Function()? onReconnect, void Function()? onDisconnect}) {
    _socket?.dispose();
    final socket = io.io(base, io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().enableReconnection().build());
    _socket = socket;
    void subscribe([dynamic _]) {socket.emit('bed:subscribe',bed);onReconnect?.call();}
    socket.onConnect(subscribe);
    socket.on('reconnect', subscribe);
    socket.onDisconnect((_)=>onDisconnect?.call());
    socket.on('telemetry:update',(data){
      try {
        if(data is Map && data['device_id']==bed && data['metric']=='soil_moisture') {
          _controller.add(Reading.fromJson(Map<String,dynamic>.from(data),bed));
        }
      } catch (_) {}
    });
    socket.connect();
  }
  void dispose(){_socket?.dispose();_controller.close();}
}
