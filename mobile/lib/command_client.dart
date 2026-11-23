import 'dart:convert';
import 'package:http/http.dart' as http;

enum SendResult { accepted, replayed, rejected, networkError }
class CommandResponse {
  const CommandResponse(this.result, {this.commandId, this.statusCode});
  final SendResult result;
  final String? commandId;
  final int? statusCode;
  bool get retryable => result == SendResult.networkError || statusCode == 429 || (statusCode ?? 0) >= 500;
}
class CommandClient {
  CommandClient(this.baseUrl);
  final String baseUrl;
  Future<bool> putThreshold(String deviceId, int value) async {
    try {
      final r = await http.put(Uri.parse('$baseUrl/devices/$deviceId/threshold'),
        headers: {'Content-Type':'application/json'}, body: jsonEncode({'soilMoistureMin':value})).timeout(const Duration(seconds:5));
      return r.statusCode == 200;
    } catch (_) { return false; }
  }
  Future<CommandResponse> sendCommand(String deviceId, Map<String,dynamic> body, String key) async {
    try {
      final r = await http.post(Uri.parse('$baseUrl/devices/$deviceId/commands'),
        headers: {'Content-Type':'application/json','Idempotency-Key':key},body:jsonEncode(body)).timeout(const Duration(seconds:5));
      if (r.statusCode == 200 || r.statusCode == 202) {
        final j = jsonDecode(r.body) as Map<String,dynamic>;
        return CommandResponse(r.statusCode == 200 ? SendResult.replayed : SendResult.accepted,
          commandId:j['commandId'] as String?,statusCode:r.statusCode);
      }
      return CommandResponse(SendResult.rejected,statusCode:r.statusCode);
    } catch (_) { return const CommandResponse(SendResult.networkError); }
  }
  Future<String?> commandStatus(String id) async {
    try {
      final r=await http.get(Uri.parse('$baseUrl/commands/$id')).timeout(const Duration(seconds:3));
      if(r.statusCode!=200)return null;
      return (jsonDecode(r.body) as Map<String,dynamic>)['status'] as String?;
    } catch (_) { return null; }
  }
}
