class Quiz {
  final String id;
  final String title;
  final String description;
  final String category;
  final String difficulty;
  final int unit;
  final String module;
  final int timePerQuestion;
  final int questionCount;
  final String? creatorName;
  final String? moduleTitle;
  final String? moduleIcon;
  final String? moduleColor;
  final Map<String, dynamic>? lastAttempt;
  final double bestScorePercent;

  Quiz({
    required this.id,
    required this.title,
    this.description = '',
    this.category = '',
    this.difficulty = 'medium',
    this.unit = 1,
    this.module = '',
    this.timePerQuestion = 30,
    this.questionCount = 0,
    this.creatorName,
    this.moduleTitle,
    this.moduleIcon,
    this.moduleColor,
    this.lastAttempt,
    this.bestScorePercent = 0,
  });

  factory Quiz.fromJson(Map<String, dynamic> json) {
    return Quiz(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      category: json['category'] ?? '',
      difficulty: json['difficulty'] ?? 'medium',
      unit: json['unit'] ?? 1,
      module: json['module'] ?? '',
      timePerQuestion: json['time_per_question'] ?? 30,
      questionCount: json['question_count'] ?? 0,
      creatorName: json['creator_name'],
      moduleTitle: json['module_title'],
      moduleIcon: json['module_icon'],
      moduleColor: json['module_color'],
      lastAttempt: json['lastAttempt'],
      bestScorePercent: (json['bestScorePercent'] ?? 0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'description': description,
    'category': category,
    'difficulty': difficulty,
    'unit': unit,
    'module': module,
    'time_per_question': timePerQuestion,
    'question_count': questionCount,
    'creator_name': creatorName,
    'module_title': moduleTitle,
    'module_icon': moduleIcon,
    'module_color': moduleColor,
    'bestScorePercent': bestScorePercent,
    'last_attempt': lastAttempt,
  };

  String get difficultyLabel {
    switch (difficulty) {
      case 'easy':
        return 'Easy';
      case 'medium':
        return 'Medium';
      case 'hard':
        return 'Hard';
      default:
        return difficulty;
    }
  }
}
