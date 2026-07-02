import 'dart:convert';
import 'package:flutter/material.dart';
import '../models/quiz.dart';
import '../models/question.dart';
import '../services/api_service.dart';
import '../services/database_service.dart';

class QuizProvider extends ChangeNotifier {
  static const List<String> _mockQuizIds = [
    'mock-nursing-1',
    'mock-nursing-2',
    'mock-nursing-3',
    'mock-engineering-1',
    'mock-engineering-2',
    'mock-dental-1',
    'mock-dental-2',
    'mock-medical-1',
    'mock-medical-2',
    'mock-medical-3',
  ];
  static const Map<String, String> _mockCategoryMap = {
    'mock-nursing-1': 'nursing',
    'mock-nursing-2': 'nursing',
    'mock-nursing-3': 'nursing',
    'mock-engineering-1': 'engineering',
    'mock-engineering-2': 'engineering',
    'mock-dental-1': 'dental',
    'mock-dental-2': 'dental',
    'mock-medical-1': 'medical',
    'mock-medical-2': 'medical',
    'mock-medical-3': 'medical',
  };

  static Quiz _buildMockQuiz(String id, String category) {
    final titles = {
      'nursing': [
        'Fundamentals of Patient Care',
        'Pharmacology Basics',
        'Medical-Surgical Nursing',
      ],
      'engineering': [
        'Thermodynamics & Heat Transfer',
        'Structural Analysis',
      ],
      'dental': [
        'Oral Anatomy & Physiology',
        'Periodontology Fundamentals',
      ],
      'medical': [
        'Human Anatomy & Physiology',
        'Clinical Diagnosis',
        'Pathophysiology',
      ],
    };
    final list = titles[category] ?? ['General Quiz'];
    final idx = _mockQuizIds.indexOf(id);
    final title = idx < list.length ? list[idx] : '${category[0].toUpperCase()}${category.substring(1)} Quiz ${idx + 1}';
    final difficulties = ['easy', 'medium', 'hard'];
    final diff = difficulties[idx % difficulties.length];
    final count = 5 + (idx % 3) * 5;
    return Quiz(
      id: id,
      title: title,
      description: 'Test your knowledge in $category',
      category: category,
      difficulty: diff,
      questionCount: count,
      timePerQuestion: 30,
    );
  }

  static const Map<String, List<List<String>>> _questionBanks = {
    'nursing': [
      ['What is the normal adult resting heart rate?', '60-100 bpm', '40-60 bpm', '100-120 bpm', '120-140 bpm', '60-100 bpm'],
      ['Which position is best for administering an enema?', 'Sims position', 'Trendelenburg', 'Supine', 'Fowler\'s', 'Sims position'],
      ['What does "PRN" stand for in medical terms?', 'Pro re nata', 'Per rectum null', 'Post radial nerve', 'Primary resource nurse', 'Pro re nata'],
      ['What is the first step in wound care?', 'Hand hygiene', 'Apply dressing', 'Irrigate wound', 'Assess pain', 'Hand hygiene'],
      ['Which vital sign is measured with a sphygmomanometer?', 'Blood pressure', 'Temperature', 'Pulse', 'Respiration', 'Blood pressure'],
      ['Normal blood oxygen saturation is:', '95-100%', '85-90%', '90-94%', '80-85%', '95-100%'],
      ['What does "NPO" mean?', 'Nothing by mouth', 'No pain observed', 'Normal post-op', 'Non-prescription order', 'Nothing by mouth'],
      ['Where should an IM injection be administered in adults?', 'Deltoid muscle', 'Abdomen', 'Upper arm subcutaneous', 'Gluteal muscle', 'Gluteal muscle'],
      ['What is the purpose of a Foley catheter?', 'Urinary drainage', 'IV access', 'Oxygen delivery', 'Wound drainage', 'Urinary drainage'],
      ['Which type of shock is caused by severe allergic reaction?', 'Anaphylactic', 'Cardiogenic', 'Hypovolemic', 'Septic', 'Anaphylactic'],
    ],
    'engineering': [
      ['What is the first law of thermodynamics?', 'Energy cannot be created or destroyed', 'Force equals mass times acceleration', 'Entropy always increases', 'Pressure is inversely proportional to volume', 'Energy cannot be created or destroyed'],
      ['What is the SI unit of force?', 'Newton', 'Joule', 'Watt', 'Pascal', 'Newton'],
      ['What material property describes resistance to deformation?', 'Stiffness', 'Ductility', 'Hardness', 'Toughness', 'Stiffness'],
      ['Which law relates voltage, current, and resistance?', 'Ohm\'s law', 'Faraday\'s law', 'Coulomb\'s law', 'Ampere\'s law', 'Ohm\'s law'],
      ['What is the main load-bearing element in a truss bridge?', 'Triangle members', 'Cables', 'Beams', 'Columns', 'Triangle members'],
      ['What is the unit of electrical power?', 'Watt', 'Volt', 'Ampere', 'Ohm', 'Watt'],
      ['What does CAD stand for?', 'Computer-Aided Design', 'Computer Analysis Division', 'Circuit Array Device', 'Central Application Design', 'Computer-Aided Design'],
      ['Which type of stress causes a material to stretch?', 'Tensile stress', 'Compressive stress', 'Shear stress', 'Bending stress', 'Tensile stress'],
      ['What is the function of a transformer?', 'Change voltage levels', 'Store electrical energy', 'Convert AC to DC', 'Amplify current', 'Change voltage levels'],
      ['What is the most common engineering material?', 'Steel', 'Concrete', 'Aluminum', 'Copper', 'Steel'],
    ],
    'dental': [
      ['What is the hardest substance in the human body?', 'Enamel', 'Dentin', 'Cementum', 'Bone', 'Enamel'],
      ['How many permanent teeth does an adult human have?', '32', '28', '24', '36', '32'],
      ['What is the most common dental disease?', 'Dental caries', 'Gingivitis', 'Periodontitis', 'Halitosis', 'Dental caries'],
      ['What is the innermost layer of the tooth?', 'Dental pulp', 'Enamel', 'Dentin', 'Cementum', 'Dental pulp'],
      ['Which instrument is used for tooth extraction?', 'Forceps', 'Scaler', 'Curette', 'Explorer', 'Forceps'],
      ['What does "BOP" mean in periodontal assessment?', 'Bleeding on probing', 'Bone overgrowth procedure', 'Buccal occlusal plane', 'Bifurcation open probing', 'Bleeding on probing'],
      ['How often should a dental check-up ideally be done?', 'Every 6 months', 'Every year', 'Every 3 months', 'Every 2 years', 'Every 6 months'],
      ['What is the primary cause of gingivitis?', 'Plaque buildup', 'Genetics', 'Vitamin deficiency', 'Hormonal changes', 'Plaque buildup'],
      ['Which tooth is most commonly impacted?', 'Wisdom tooth', 'Canine', 'Premolar', 'Incisor', 'Wisdom tooth'],
      ['What type of radiograph shows all teeth in one image?', 'Panoramic', 'Bitewing', 'Periapical', 'Cephalometric', 'Panoramic'],
    ],
    'medical': [
      ['What is the largest organ in the human body?', 'Skin', 'Liver', 'Brain', 'Heart', 'Skin'],
      ['How many bones are in the adult human body?', '206', '186', '226', '256', '206'],
      ['What is the normal fasting blood glucose range?', '70-100 mg/dL', '100-130 mg/dL', '130-160 mg/dL', '50-70 mg/dL', '70-100 mg/dL'],
      ['Which chamber of the heart pumps blood to the body?', 'Left ventricle', 'Right ventricle', 'Left atrium', 'Right atrium', 'Left ventricle'],
      ['What is the function of insulin?', 'Lower blood glucose', 'Raise blood glucose', 'Digest proteins', 'Regulate blood pressure', 'Lower blood glucose'],
      ['What system includes the brain and spinal cord?', 'Central nervous system', 'Peripheral nervous system', 'Endocrine system', 'Cardiovascular system', 'Central nervous system'],
      ['Which vitamin is produced by sunlight exposure?', 'Vitamin D', 'Vitamin C', 'Vitamin B12', 'Vitamin A', 'Vitamin D'],
      ['What does "STAT" mean in medical terminology?', 'Immediately', 'Stable', 'Standard', 'Static', 'Immediately'],
      ['What is the most common blood type?', 'O+', 'A+', 'B+', 'AB+', 'O+'],
      ['Which organ produces bile?', 'Liver', 'Gallbladder', 'Pancreas', 'Stomach', 'Liver'],
    ],
  };

  static List<Question> _buildMockQuestions(String quizId) {
    final category = _mockCategoryMap[quizId] ?? 'nursing';
    final count = _buildMockQuiz(quizId, category).questionCount;
    final bank = _questionBanks[category] ?? _questionBanks['nursing']!;
    final qs = <Question>[];
    final clampedCount = count > bank.length ? bank.length : count;
    for (int i = 0; i < clampedCount; i++) {
      final row = bank[i];
      qs.add(Question(
        id: '${quizId}_q$i',
        quizId: quizId,
        type: 'mcq',
        questionText: row[0],
        options: [row[1], row[2], row[3], row[4]],
        correctAnswer: row[5],
        explanation: 'The correct answer is ${row[5]}.',
        points: 1000,
        orderIndex: i,
      ));
    }
    return qs;
  }
  final ApiService _apiService = ApiService();
  final DatabaseService _db = DatabaseService();

  List<Quiz> _quizzes = [];
  Quiz? _currentQuiz;
  List<Question> _currentQuestions = [];
  Map<String, dynamic>? _lastResult;
  bool _isLoading = false;
  String? _error;

  List<Quiz> get quizzes => _quizzes;
  Quiz? get currentQuiz => _currentQuiz;
  List<Question> get currentQuestions => _currentQuestions;
  Map<String, dynamic>? get lastResult => _lastResult;
  bool get isLoading => _isLoading;
  String? get error => _error;

  void setToken(String? token) {
    _apiService.setToken(token);
  }

  Future<void> loadQuizzes({String? category}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    _quizzes = await _db.getCachedQuizzes(category: category);
    notifyListeners();

    try {
      final fresh = await _apiService.getQuizzes(category: category);
      _quizzes = fresh;
      await _db.cacheQuizzes(fresh);
    } catch (e) {
      if (_quizzes.isEmpty) {
        final mockIds = category == null
            ? _mockQuizIds
            : _mockQuizIds.where((id) => _mockCategoryMap[id] == category).toList();
        _quizzes = mockIds.map((id) => _buildMockQuiz(id, _mockCategoryMap[id]!)).toList();
      }
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<bool> loadQuizWithQuestions(String quizId) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final cachedQuiz = await _db.getCachedQuiz(quizId);
    final cachedQuestions = await _db.getCachedQuestions(quizId);
    if (cachedQuiz != null && cachedQuestions.isNotEmpty) {
      _currentQuiz = cachedQuiz;
      _currentQuestions = cachedQuestions;
      _isLoading = false;
      notifyListeners();
    }

    try {
      final data = await _apiService.getQuizWithQuestions(quizId);
      _currentQuiz = data['quiz'] as Quiz;
      _currentQuestions = data['questions'] as List<Question>;
      await _db.cacheQuizzes([_currentQuiz!]);
      await _db.cacheQuestions(quizId, _currentQuestions);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      if (_currentQuiz == null) {
        final mockQuiz = _mockQuizIds.contains(quizId)
            ? _buildMockQuiz(quizId, _mockCategoryMap[quizId]!)
            : null;
        if (mockQuiz != null) {
          _currentQuiz = mockQuiz;
          _currentQuestions = _buildMockQuestions(quizId);
        } else {
          _error = 'Quiz not found';
        }
      }
      _isLoading = false;
      notifyListeners();
      return _currentQuiz != null;
    }
  }

  Future<bool> submitQuiz({
    required String quizId,
    required List<Map<String, dynamic>> answers,
  }) async {
    _isLoading = true;
    notifyListeners();

    final attemptId = await _db.saveAttempt(
      quizId: quizId,
      answers: answers,
    );

    try {
      _lastResult = await _apiService.submitQuiz(
        quizId: quizId,
        answers: answers,
      );
      await _db.updateAttemptResult(attemptId, _lastResult!);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      final correct = answers.where((a) => a['answer'] == 'Option A').length;
      final total = _currentQuestions.length;
      _lastResult = {
        'attempt_id': attemptId,
        'correctCount': correct,
        'totalQuestions': total,
        'percentage': total > 0 ? (correct / total * 100) : 0,
        'xpEarned': correct * 100,
        'status': 'completed',
      };
      _isLoading = false;
      notifyListeners();
      return true;
    }
  }

  Future<void> syncPendingAttempts() async {
    final pending = await _db.getPendingAttempts();
    if (pending.isEmpty) return;

    for (final attempt in pending) {
      try {
        final result = await _apiService.submitQuiz(
          quizId: attempt['quiz_id'] as String,
          answers: (jsonDecode(attempt['answers'] as String) as List)
              .cast<Map<String, dynamic>>(),
        );
        await _db.updateAttemptResult(attempt['id'] as int, result);
      } catch (_) {}
    }
  }

  Future<List<Map<String, dynamic>>> getAttemptHistory() async {
    return _db.getAttemptHistory();
  }

  void reset() {
    _currentQuiz = null;
    _currentQuestions = [];
    _lastResult = null;
    _error = null;
    notifyListeners();
  }
}
