import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../models/quiz.dart';
import '../models/question.dart';

class ApiService {
  String? _token;

  void setToken(String? token) {
    _token = token;
  }

  Map<String, String> get _headers => {
    'Authorization': 'Bearer $_token',
    'Content-Type': 'application/json',
  };

  Future<List<Quiz>> getQuizzes({String? category}) async {
    final uri = Uri.parse('${ApiConfig.apiBase}/quizzes').replace(
      queryParameters: category != null ? {'category': category} : null,
    );
    final response = await http.get(uri, headers: _headers);
    if (response.statusCode == 200) {
      final List<dynamic> data = jsonDecode(response.body);
      return data.map((e) => Quiz.fromJson(e)).toList();
    }
    throw Exception('Failed to load quizzes');
  }

  Future<Map<String, dynamic>> getQuizWithQuestions(String quizId) async {
    final response = await http.get(
      Uri.parse('${ApiConfig.apiBase}/quizzes/$quizId'),
      headers: _headers,
    );
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      final questions = (data['questions'] as List)
          .map((e) => Question.fromJson(e))
          .toList();
      return {'quiz': Quiz.fromJson(data), 'questions': questions};
    }
    throw Exception('Failed to load quiz');
  }

  Future<Map<String, dynamic>> submitQuiz({
    required String quizId,
    required List<Map<String, dynamic>> answers,
  }) async {
    final response = await http.post(
      Uri.parse('${ApiConfig.apiBase}/scores/submit'),
      headers: _headers,
      body: jsonEncode({
        'quizId': quizId,
        'answers': answers,
      }),
    );
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to submit quiz');
  }

  Future<List<dynamic>> getLeaderboard({String? quizId}) async {
    final uri = Uri.parse('${ApiConfig.apiBase}/scores/leaderboard').replace(
      queryParameters: quizId != null ? {'quizId': quizId} : null,
    );
    final response = await http.get(uri, headers: _headers);
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['leaderboard'];
    }
    throw Exception('Failed to load leaderboard');
  }

  Future<List<dynamic>> getQuizHistory() async {
    final response = await http.get(
      Uri.parse('${ApiConfig.apiBase}/scores/history'),
      headers: _headers,
    );
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Failed to load history');
  }
}
