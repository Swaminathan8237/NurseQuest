import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../providers/quiz_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../../utils/platform_utils.dart';
import 'quiz_results_screen.dart';

class PlayerColors {
  PlayerColors._();

  static const Color background = Color(0xFFE0E5EC);
  static const Color textPrimary = Color(0xFF2F3542);
  static const Color textMuted = Color(0xFF8395A7);
  static const Color iconColor = Color(0x8A000000);
  static const Color correct = Color(0xFF27AE60);
  static const Color incorrect = Color(0xFFE74C3C);
}

class PlayerTextStyles {
  PlayerTextStyles._();

  static TextStyle get progressLabel => GoogleFonts.nunito(
    fontSize: 12,
    fontWeight: FontWeight.w700,
    color: PlayerColors.textMuted,
    letterSpacing: 0.5,
  );

  static TextStyle get questionText => GoogleFonts.nunito(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: PlayerColors.textPrimary,
    letterSpacing: 0.2,
    height: 1.4,
  );

  static TextStyle get optionText => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w600,
    color: PlayerColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get navButton => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w700,
    color: Colors.white,
    letterSpacing: 0.5,
  );

  static TextStyle get appBarTitle => GoogleFonts.nunito(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: PlayerColors.textPrimary,
    letterSpacing: 0,
  );
}

class _TexturePainter extends CustomPainter {
  const _TexturePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF2F3542).withValues(alpha: 0.038)
      ..style = PaintingStyle.fill;
    const double step = 18.0;
    const double dotRadius = 0.8;
    for (int row = 0; row < size.height / step; row++) {
      final double offsetX = (row % 2 == 0) ? 0.0 : step * 0.5;
      for (int col = 0; col < (size.width / step) + 1; col++) {
        final double x = col * step + offsetX;
        final double y = row * step;
        if (x > size.width || y > size.height) continue;
        canvas.drawCircle(Offset(x, y), dotRadius, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class QuizPlayerScreen extends StatefulWidget {
  final String quizId;

  const QuizPlayerScreen({super.key, required this.quizId});

  @override
  State<QuizPlayerScreen> createState() => _QuizPlayerScreenState();
}

class _QuizPlayerScreenState extends State<QuizPlayerScreen> {
  int _currentIndex = 0;
  final Map<String, dynamic> _answers = {};
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _loadQuiz();
  }

  void _loadQuiz() {
    final auth = context.read<AuthProvider>();
    final quizProvider = context.read<QuizProvider>();
    quizProvider.setToken(auth.token);
    quizProvider.loadQuizWithQuestions(widget.quizId);
  }

  Future<void> _submitQuiz() async {
    setState(() => _isSubmitting = true);

    final quizProvider = context.read<QuizProvider>();
    final questions = quizProvider.currentQuestions;

    final answers = questions.map((q) {
      return {
        'questionId': q.id,
        'answer': _answers[q.id],
        'timeTaken': 0,
        'timeRemaining': 0,
      };
    }).toList();

    final success = await quizProvider.submitQuiz(
      quizId: widget.quizId,
      answers: answers,
    );

    if (!mounted) return;
    setState(() => _isSubmitting = false);

    if (success) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => QuizResultsScreen(quizId: widget.quizId),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(quizProvider.error ?? 'Failed to submit')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeProvider>().theme;

    return Scaffold(
      backgroundColor: PlayerColors.background,
      appBar: AppBar(
        backgroundColor: PlayerColors.background,
        elevation: 0,
        centerTitle: true,
        title: Consumer<QuizProvider>(
          builder: (context, qp, _) => Text(
            qp.currentQuiz?.title ?? 'Quiz',
            style: PlayerTextStyles.appBarTitle,
          ),
        ),
        leading: IconButton(
          icon: Icon(Icons.close, color: PlayerColors.textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Stack(
        children: [
          const CustomPaint(
            painter: _TexturePainter(),
            size: Size.infinite,
          ),
          Consumer<QuizProvider>(
            builder: (context, quizProvider, _) {
              if (quizProvider.isLoading) {
                return const Center(
                  child: CircularProgressIndicator(),
                );
              }

              final questions = quizProvider.currentQuestions;
              if (questions.isEmpty) {
                return Center(
                  child: Text(
                    'No questions',
                    style: PlayerTextStyles.questionText,
                  ),
                );
              }

              final question = questions[_currentIndex];
              final isLast =
                  _currentIndex == questions.length - 1;
              final hasAnswer = _answers.containsKey(question.id);
              final progress =
                  (_currentIndex + 1) / questions.length;

              return Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                    child: Row(
                      children: [
                        Text(
                          'Question ${_currentIndex + 1} of ${questions.length}',
                          style: PlayerTextStyles.progressLabel,
                        ),
                        const Spacer(),
                        if (hasAnswer)
                          Icon(
                            Icons.check_circle,
                            size: 16,
                            color: PlayerColors.correct,
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: LinearProgressIndicator(
                        value: progress,
                        backgroundColor: PlayerColors.background,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          theme.primaryColor,
                        ),
                        minHeight: 6,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                      ),
                      child: Column(
                        children: [
                          ClayContainer(
                            color: PlayerColors.background,
                            borderRadius: 32.0,
                            depth: 28,
                            spread: 6,
                            curveType: CurveType.convex,
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Text(
                                question.questionText,
                                style: PlayerTextStyles.questionText,
                              ),
                            ),
                          ),
                          const SizedBox(height: 24),
                          ...question.options.map((option) {
                            final isSelected =
                                _answers[question.id] == option;
                            final optionIndex =
                                question.options.indexOf(option);

                            return Padding(
                              padding:
                                  const EdgeInsets.only(bottom: 12),
                              child: GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _answers[question.id] = option;
                                  });
                                  safeHaptic(HapticFeedbackType.lightImpact);
                                },
                                child: TweenAnimationBuilder<double>(
                                  tween: Tween<double>(
                                    begin: 0.0,
                                    end: isSelected ? 1.0 : 0.0,
                                  ),
                                  duration: const Duration(
                                    milliseconds: 150,
                                  ),
                                  curve: Curves.easeInOut,
                                  builder: (context, progress, _) {
                                    final double optDepth = isSelected
                                        ? 12.0 - (6.0 * progress)
                                        : 22.0;
                                    final double optSpread = isSelected
                                        ? 3.0 - (1.5 * progress)
                                        : 5.0;
                                    final CurveType optCurve =
                                        isSelected && progress > 0.5
                                            ? CurveType.concave
                                            : CurveType.convex;
                                    final Color optColor =
                                        isSelected
                                            ? theme.primaryColor
                                                .withValues(
                                                  alpha: 0.12,
                                                )
                                            : PlayerColors.background;

                                    return ClayContainer(
                                      color: optColor,
                                      borderRadius: 20.0,
                                      depth: optDepth.toInt(),
                                      spread: optSpread,
                                      curveType: optCurve,
                                      child: Padding(
                                        padding:
                                            const EdgeInsets.symmetric(
                                          horizontal: 20,
                                          vertical: 16,
                                        ),
                                        child: Row(
                                          children: [
                                            ClayContainer(
                                              color: isSelected
                                                  ? theme.primaryColor
                                                  : PlayerColors
                                                      .background,
                                              borderRadius: 14.0,
                                              depth: 8,
                                              spread: 2,
                                              curveType:
                                                  CurveType.convex,
                                              child: Container(
                                                width: 32,
                                                height: 32,
                                                alignment:
                                                    Alignment.center,
                                                child: Text(
                                                  String
                                                      .fromCharCode(
                                                        65 +
                                                            optionIndex,
                                                      ),
                                                  style:
                                                      GoogleFonts
                                                          .nunito(
                                                    fontSize: 14,
                                                    fontWeight:
                                                        FontWeight
                                                            .w700,
                                                    color: isSelected
                                                        ? Colors
                                                            .white
                                                        : PlayerColors
                                                            .textMuted,
                                                  ),
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 16),
                                            Expanded(
                                              child: Text(
                                                option,
                                                style: PlayerTextStyles
                                                    .optionText,
                                              ),
                                            ),
                                            if (isSelected)
                                              Icon(
                                                Icons
                                                    .check_circle_rounded,
                                                color:
                                                    theme.primaryColor,
                                                size: 22,
                                              ),
                                          ],
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      24,
                      8,
                      24,
                      24,
                    ),
                    child: Row(
                      children: [
                        if (_currentIndex > 0)
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(
                                () => _currentIndex--,
                              ),
                              child: ClayContainer(
                                color: PlayerColors.background,
                                borderRadius: 20.0,
                                depth: 18,
                                spread: 4,
                                curveType: CurveType.convex,
                                child: Container(
                                  height: 52,
                                  alignment: Alignment.center,
                                  child: Text(
                                    'Previous',
                                    style:
                                        PlayerTextStyles.navButton
                                            .copyWith(
                                      color:
                                          PlayerColors.textPrimary,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        if (_currentIndex > 0)
                          const SizedBox(width: 12),
                        Expanded(
                          child: GestureDetector(
                            onTapDown: (_) =>
                                setState(() => _isNavPressed = true),
                            onTapUp: (_) => _handleNavTap(
                              isLast,
                              hasAnswer,
                            ),
                            onTapCancel: () =>
                                setState(() => _isNavPressed = false),
                            child: TweenAnimationBuilder<double>(
                              tween: Tween<double>(
                                begin: 0.0,
                                end: _isNavPressed ? 1.0 : 0.0,
                              ),
                              duration: const Duration(
                                milliseconds: 150,
                              ),
                              curve: Curves.easeInOut,
                              builder: (context, progress, _) {
                                final double btnDepth =
                                    20.0 - (10.0 * progress);
                                final double btnSpread =
                                    4.0 - (2.0 * progress);
                                final CurveType btnCurve =
                                    progress > 0.5
                                        ? CurveType.concave
                                        : CurveType.convex;

                                return ClayContainer(
                                  color: theme.primaryColor,
                                  borderRadius: 20.0,
                                  depth: btnDepth.toInt(),
                                  spread: btnSpread,
                                  curveType: btnCurve,
                                  child: Container(
                                    height: 52,
                                    alignment: Alignment.center,
                                    child: _isSubmitting
                                        ? const SizedBox(
                                            width: 22,
                                            height: 22,
                                            child:
                                                CircularProgressIndicator(
                                              color: Colors.white,
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : Text(
                                            isLast
                                                ? 'Submit'
                                                : 'Next',
                                            style: PlayerTextStyles
                                                .navButton,
                                          ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  bool _isNavPressed = false;

  Future<void> _handleNavTap(
    bool isLast,
    bool hasAnswer,
  ) async {
    await safeHaptic(HapticFeedbackType.mediumImpact);
    await Future.delayed(const Duration(milliseconds: 150));
    if (!mounted) return;
    setState(() => _isNavPressed = false);

    if (isLast) {
      await _submitQuiz();
    } else {
      setState(() => _currentIndex++);
    }
  }
}
