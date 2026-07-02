import 'dart:convert';
import 'package:sembast/sembast_memory.dart';
import '../models/quiz.dart';
import '../models/question.dart';
import '../models/user.dart';

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  factory DatabaseService() => _instance;
  DatabaseService._internal();

  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _init();
    return _db!;
  }

  Future<Database> _init() async {
    return await databaseFactoryMemory.openDatabase('aero_mage.db');
  }

  StoreRef<String, Map<String, dynamic>> get _quizStore =>
      stringMapStoreFactory.store('quizzes');

  StoreRef<String, Map<String, dynamic>> get _questionStore =>
      stringMapStoreFactory.store('questions');

  StoreRef<String, Map<String, dynamic>> get _userStore =>
      stringMapStoreFactory.store('user_profile');

  StoreRef<int, Map<String, dynamic>> get _attemptStore =>
      intMapStoreFactory.store('quiz_attempts');

  // --- Quizzes ---

  Future<List<Quiz>> getCachedQuizzes({String? category}) async {
    final db = await database;
    final finder = category != null
        ? Finder(filter: Filter.equals('category', category))
        : Finder();
    final records = await _quizStore.find(db, finder: finder);
    return records.map((r) => _quizFromRow(r.value)).toList();
  }

  Future<void> cacheQuizzes(List<Quiz> quizzes) async {
    final db = await database;
    final now = DateTime.now().toIso8601String();
    for (final q in quizzes) {
      final row = _quizToRow(q, now);
      await _quizStore.record(q.id).put(db, row);
    }
  }

  Future<Quiz?> getCachedQuiz(String quizId) async {
    final db = await database;
    final record = await _quizStore.record(quizId).get(db);
    if (record == null) return null;
    return _quizFromRow(record);
  }

  // --- Questions ---

  Future<List<Question>> getCachedQuestions(String quizId) async {
    final db = await database;
    final finder = Finder(
      filter: Filter.equals('quiz_id', quizId),
      sortOrders: [SortOrder('order_index')],
    );
    final records = await _questionStore.find(db, finder: finder);
    return records.map((r) => _questionFromRow(r.value)).toList();
  }

  Future<void> cacheQuestions(String quizId, List<Question> questions) async {
    final db = await database;
    await _questionStore.delete(
      db,
      finder: Finder(filter: Filter.equals('quiz_id', quizId)),
    );
    for (final q in questions) {
      await _questionStore.record(q.id).put(db, _questionToRow(q));
    }
  }

  // --- User Profile ---

  Future<void> saveUserProfile(UserProfile user) async {
    final db = await database;
    await _userStore.record(user.id).put(db, _userToRow(user));
  }

  Future<UserProfile?> getUserProfile(String id) async {
    final db = await database;
    final record = await _userStore.record(id).get(db);
    if (record == null) return null;
    return _userFromRow(record);
  }

  // --- Quiz Attempts ---

  Future<int> saveAttempt({
    required String quizId,
    required List<Map<String, dynamic>> answers,
    Map<String, dynamic>? result,
    double? score,
    int? totalQuestions,
    int? correctCount,
    bool synced = false,
  }) async {
    final db = await database;
    final record = await _attemptStore.add(db, {
      'quiz_id': quizId,
      'answers': jsonEncode(answers),
      'result': result != null ? jsonEncode(result) : null,
      'score': score,
      'total_questions': totalQuestions,
      'correct_count': correctCount,
      'attempted_at': DateTime.now().toIso8601String(),
      'synced': synced ? 1 : 0,
    });
    return record;
  }

  Future<List<Map<String, dynamic>>> getPendingAttempts() async {
    final db = await database;
    final records = await _attemptStore.find(
      db,
      finder: Finder(
        filter: Filter.equals('synced', 0),
        sortOrders: [SortOrder('attempted_at')],
      ),
    );
    return records.map((r) {
      final m = Map<String, dynamic>.from(r.value);
      m['id'] = r.key;
      return m;
    }).toList();
  }

  Future<void> markAttemptSynced(int attemptId) async {
    final db = await database;
    await _attemptStore.record(attemptId).update(db, {'synced': 1});
  }

  Future<void> updateAttemptResult(
      int attemptId, Map<String, dynamic> result) async {
    final db = await database;
    await _attemptStore.record(attemptId).update(db, {
      'result': jsonEncode(result),
      'synced': 1,
    });
  }

  Future<List<Map<String, dynamic>>> getAttemptHistory() async {
    final db = await database;
    final records = await _attemptStore.find(
      db,
      finder: Finder(
        sortOrders: [SortOrder('attempted_at', false)],
        limit: 50,
      ),
    );
    return records.map((r) {
      final m = Map<String, dynamic>.from(r.value);
      m['id'] = r.key;
      return m;
    }).toList();
  }

  // --- Row converters ---

  Map<String, dynamic> _quizToRow(Quiz q, String cachedAt) => {
    'id': q.id,
    'title': q.title,
    'description': q.description,
    'category': q.category,
    'difficulty': q.difficulty,
    'unit': q.unit,
    'module': q.module,
    'time_per_question': q.timePerQuestion,
    'question_count': q.questionCount,
    'creator_name': q.creatorName,
    'module_title': q.moduleTitle,
    'module_icon': q.moduleIcon,
    'module_color': q.moduleColor,
    'best_score_percent': q.bestScorePercent,
    'last_attempt': q.lastAttempt != null ? jsonEncode(q.lastAttempt) : null,
    'cached_at': cachedAt,
  };

  Quiz _quizFromRow(Map<String, dynamic> row) => Quiz(
    id: row['id'] as String,
    title: row['title'] as String? ?? '',
    description: row['description'] as String? ?? '',
    category: row['category'] as String? ?? '',
    difficulty: row['difficulty'] as String? ?? 'medium',
    unit: row['unit'] as int? ?? 1,
    module: row['module'] as String? ?? '',
    timePerQuestion: row['time_per_question'] as int? ?? 30,
    questionCount: row['question_count'] as int? ?? 0,
    creatorName: row['creator_name'] as String?,
    moduleTitle: row['module_title'] as String?,
    moduleIcon: row['module_icon'] as String?,
    moduleColor: row['module_color'] as String?,
    bestScorePercent: (row['best_score_percent'] as num?)?.toDouble() ?? 0.0,
    lastAttempt: row['last_attempt'] != null
        ? jsonDecode(row['last_attempt'] as String)
        : null,
  );

  Map<String, dynamic> _questionToRow(Question q) => {
    'id': q.id,
    'quiz_id': q.quizId,
    'type': q.type,
    'question_text': q.questionText,
    'media_url': q.mediaUrl,
    'options': jsonEncode(q.options),
    'correct_answer': q.correctAnswer,
    'explanation': q.explanation,
    'points': q.points,
    'order_index': q.orderIndex,
  };

  Question _questionFromRow(Map<String, dynamic> row) => Question(
    id: row['id'] as String,
    quizId: row['quiz_id'] as String? ?? '',
    type: row['type'] as String? ?? 'mcq',
    questionText: row['question_text'] as String,
    mediaUrl: row['media_url'] as String?,
    options: row['options'] != null
        ? (jsonDecode(row['options'] as String) as List).cast<String>()
        : [],
    correctAnswer: row['correct_answer'] as String? ?? '',
    explanation: row['explanation'] as String? ?? '',
    points: row['points'] as int? ?? 1000,
    orderIndex: row['order_index'] as int? ?? 0,
  );

  Map<String, dynamic> _userToRow(UserProfile u) => {
    'id': u.id,
    'email': u.email,
    'name': u.name,
    'role': u.role,
    'xp': u.xp,
    'level': u.level,
    'streak': u.streak,
    'avatar_config':
        u.avatarConfig != null ? jsonEncode(u.avatarConfig) : null,
    'achievements':
        u.achievements != null ? jsonEncode(u.achievements) : null,
    'stats': u.stats != null ? jsonEncode(u.stats) : null,
  };

  UserProfile _userFromRow(Map<String, dynamic> row) => UserProfile(
    id: row['id'] as String,
    email: row['email'] as String,
    name: row['name'] as String,
    role: row['role'] as String? ?? 'student',
    xp: row['xp'] as int? ?? 0,
    level: row['level'] as int? ?? 1,
    streak: row['streak'] as int? ?? 0,
    avatarConfig: row['avatar_config'] != null
        ? jsonDecode(row['avatar_config'] as String)
        : null,
    achievements: row['achievements'] != null
        ? jsonDecode(row['achievements'] as String)
        : null,
    stats: row['stats'] != null
        ? jsonDecode(row['stats'] as String)
        : null,
  );
}
