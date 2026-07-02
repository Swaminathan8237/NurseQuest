import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import '../models/user.dart';

class AuthService {
  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'aero_mage_token';
  static const _userKey = 'aero_mage_user';

  Future<void> saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<String?> getToken() async {
    return await _storage.read(key: _tokenKey);
  }

  Future<void> saveUser(UserProfile user) async {
    await _storage.write(key: _userKey, value: jsonEncode(user.toJson()));
  }

  Future<UserProfile?> getSavedUser() async {
    final data = await _storage.read(key: _userKey);
    if (data != null) {
      return UserProfile.fromJson(jsonDecode(data));
    }
    return null;
  }

  Future<void> clearSession() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }

  Future<Map<String, dynamic>> signIn({
    required String email,
    required String password,
  }) async {
    final response = await http.post(
      Uri.parse('${ApiConfig.supabaseUrl}/auth/v1/token?grant_type=password'),
      headers: {
        'apikey': ApiConfig.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      await saveToken(data['access_token']);
      final user = await _syncProfile(data['access_token'], data['user']);
      return {'token': data['access_token'], 'user': user};
    } else {
      final errBody = jsonDecode(response.body);
      throw Exception(errBody['msg'] ?? errBody['error_description'] ?? 'Login failed');
    }
  }

  Future<Map<String, dynamic>> signUp({
    required String email,
    required String password,
    required String name,
  }) async {
    final response = await http.post(
      Uri.parse('${ApiConfig.supabaseUrl}/auth/v1/signup'),
      headers: {
        'apikey': ApiConfig.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'email': email,
        'password': password,
        'data': {'name': name},
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data;
    } else {
      final errBody = jsonDecode(response.body);
      throw Exception(errBody['msg'] ?? errBody['error_description'] ?? 'Registration failed');
    }
  }

  Future<UserProfile> _syncProfile(String token, dynamic supabaseUser) async {
    final response = await http.post(
      Uri.parse('${ApiConfig.apiBase}/auth/sync-profile'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'name': supabaseUser['user_metadata']?['name'] ?? supabaseUser['email'],
        'role': 'student',
      }),
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = jsonDecode(response.body);
      final user = UserProfile.fromJson(data['user']);
      await saveUser(user);
      return user;
    }
    throw Exception('Failed to sync profile');
  }

  Future<UserProfile> getProfile(String token) async {
    final response = await http.get(
      Uri.parse('${ApiConfig.apiBase}/auth/me'),
      headers: {'Authorization': 'Bearer $token'},
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (data.containsKey('id')) {
        final user = UserProfile.fromJson(data);
        await saveUser(user);
        return user;
      }
      final user = UserProfile.fromJson(data['user'] as Map<String, dynamic>);
      await saveUser(user);
      return user;
    }
    throw Exception('Failed to get profile');
  }
}
