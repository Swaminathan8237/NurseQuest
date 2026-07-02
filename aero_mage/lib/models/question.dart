class Question {
  final String id;
  final String quizId;
  final String type;
  final String questionText;
  final String? mediaUrl;
  final List<String> options;
  final String correctAnswer;
  final String explanation;
  final int points;
  final int orderIndex;

  Question({
    required this.id,
    this.quizId = '',
    required this.type,
    required this.questionText,
    this.mediaUrl,
    this.options = const [],
    this.correctAnswer = '',
    this.explanation = '',
    this.points = 1000,
    this.orderIndex = 0,
  });

  factory Question.fromJson(Map<String, dynamic> json) {
    return Question(
      id: json['id'] ?? '',
      quizId: json['quiz_id'] ?? '',
      type: json['type'] ?? 'mcq',
      questionText: json['question_text'] ?? '',
      mediaUrl: json['media_url'],
      options: (json['options'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      correctAnswer: json['correct_answer'] ?? '',
      explanation: json['explanation'] ?? '',
      points: json['points'] ?? 1000,
      orderIndex: json['order_index'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'quiz_id': quizId,
    'type': type,
    'question_text': questionText,
    'media_url': mediaUrl,
    'options': options,
    'correct_answer': correctAnswer,
    'explanation': explanation,
    'points': points,
    'order_index': orderIndex,
  };
}
