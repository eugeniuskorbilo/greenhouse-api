import 'package:shared_preferences/shared_preferences.dart';
Future<void> saveThreshold(String deviceId, int value) async {
  final p=await SharedPreferences.getInstance();
  await p.setInt('irrigation.threshold.$deviceId',value);
}
Future<int> loadThreshold(String deviceId) async {
  final p=await SharedPreferences.getInstance();
  return p.getInt('irrigation.threshold.$deviceId') ?? 30;
}
