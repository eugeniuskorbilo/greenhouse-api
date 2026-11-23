import 'dart:convert';
import 'package:http/http.dart' as http;

class Reading {
  final String deviceId;
  final double value;
  final DateTime time;
  const Reading(this.deviceId, this.value, this.time);
  factory Reading.fromJson(Map<String, dynamic> j, String device) {
    final raw = j['ts'];
    final date = raw is num
        ? DateTime.fromMillisecondsSinceEpoch(raw.toInt())
        : DateTime.parse(raw.toString());
    return Reading((j['device_id'] ?? j['device'] ?? device).toString(),
        (j['value'] as num).toDouble(), date);
  }
  Map<String, dynamic> toJson() => {'device_id':deviceId,'value':value,'ts':time.millisecondsSinceEpoch};
}
class Api {
  final String base;
  const Api(this.base);
  Future<List<String>> devices() async {
    final response = await http.get(Uri.parse('$base/api/v1/devices')).timeout(const Duration(seconds: 6));
    if (response.statusCode != 200) throw Exception('HTTP ${response.statusCode}');
    final data = jsonDecode(response.body);
    final list = data is List ? data : (data['data'] as List);
    return list.map((e) => e is String ? e : e['id'].toString()).toList();
  }
  Future<List<Reading>> history(String device) async {
    final from = DateTime.now().subtract(const Duration(hours: 24)).millisecondsSinceEpoch;
    final to = DateTime.now().millisecondsSinceEpoch;
    final result = <Reading>[];
    String? cursor;
    do {
      final params = <String,String>{'device':device,'metric':'soil_moisture','from':'$from','to':'$to','limit':'500'};
      if(cursor != null) params['cursor'] = cursor;
      final uri = Uri.parse('$base/api/v1/telemetry').replace(queryParameters:params);
      final response = await http.get(uri).timeout(const Duration(seconds: 8));
      if(response.statusCode != 200) throw Exception('HTTP ${response.statusCode}: ${response.body}');
      final json = jsonDecode(response.body) as Map<String,dynamic>;
      result.addAll((json['points'] as List).map((p)=>Reading.fromJson(p as Map<String,dynamic>,device)));
      cursor = json['next_cursor'] as String?;
    } while(cursor != null && result.length < 20000);
    return result;
  }
}
