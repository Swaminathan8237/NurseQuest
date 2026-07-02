import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/database_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();
  final DatabaseService _db = DatabaseService();

  UserProfile? _user;
  String? _token;
  bool _isLoading = false;
  String? _error;

  UserProfile? get user => _user;
  String? get token => _token;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isAuthenticated => _token != null && _user != null;
  bool get isTeacher => _user?.role == 'teacher';
  bool get isStudent => _user?.role == 'student';

  Future<void> init() async {
    _token = await _authService.getToken();
    _user = await _authService.getSavedUser();
    if (_token != null) {
      try {
        _user = await _authService.getProfile(_token!);
        if (_user != null) await _db.saveUserProfile(_user!);
      } catch (e) {
        final cached = _user?.id != null
            ? await _db.getUserProfile(_user!.id)
            : null;
        if (cached != null) {
          _user = cached;
        } else {
          await _authService.clearSession();
          _token = null;
          _user = null;
        }
      }
    }
    notifyListeners();
  }

  Future<bool> signIn(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await _authService.signIn(
        email: email,
        password: password,
      );
      _token = result['token'];
      _user = result['user'];
      if (_user != null) await _db.saveUserProfile(_user!);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> signUp(String email, String password, String name) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      await _authService.signUp(
        email: email,
        password: password,
        name: name,
      );
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> signOut() async {
    await _authService.clearSession();
    _token = null;
    _user = null;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void setMockUser() {
    _token = 'mock_token';
    _user = UserProfile(
      id: 'mock-id',
      email: 'student@aeromage.com',
      name: 'Demo Student',
      role: 'student',
      xp: 1250,
      level: 5,
      streak: 3,
      stats: {
        'quizzes_taken': 12,
        'avg_score': 78.5,
        'best_streak': 7,
        'total_score': 980,
      },
    );
    _db.saveUserProfile(_user!);
    notifyListeners();
  }
}
