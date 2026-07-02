import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/quiz_provider.dart';
import '../../providers/auth_provider.dart';
import 'quiz_player_screen.dart';

class QuizListColors {
  QuizListColors._();

  static const Color background = Color(0xFFE0E5EC);
  static const Color textPrimary = Color(0xFF2F3542);
  static const Color textMuted = Color(0xFF8395A7);
  static const Color iconColor = Color(0x8A000000);
}

class QuizListTextStyles {
  QuizListTextStyles._();

  static TextStyle get header => GoogleFonts.nunito(
    fontSize: 22,
    fontWeight: FontWeight.w800,
    color: QuizListColors.textPrimary,
    letterSpacing: 0.3,
  );

  static TextStyle get subtitle => GoogleFonts.nunito(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: QuizListColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get cardTitle => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w600,
    color: QuizListColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get cardMeta => GoogleFonts.nunito(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: QuizListColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get emptyIcon => GoogleFonts.nunito(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    color: QuizListColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get difficultyBadge => GoogleFonts.nunito(
    fontSize: 10,
    fontWeight: FontWeight.w800,
    color: Colors.white,
    letterSpacing: 0.8,
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

Color _difficultyColor(String? label) {
  switch (label?.toLowerCase()) {
    case 'easy':
      return const Color(0xFF27AE60);
    case 'medium':
      return const Color(0xFFF39C12);
    case 'hard':
      return const Color(0xFFE74C3C);
    default:
      return QuizListColors.textMuted;
  }
}

class QuizListScreen extends StatefulWidget {
  final AppDepartment department;

  const QuizListScreen({super.key, required this.department});

  @override
  State<QuizListScreen> createState() => _QuizListScreenState();
}

class _QuizListScreenState extends State<QuizListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _load();
    });
  }

  @override
  void didUpdateWidget(QuizListScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.department != widget.department) {
      _load();
    }
  }

  void _load() {
    final auth = context.read<AuthProvider>();
    final quizProvider = context.read<QuizProvider>();
    quizProvider.setToken(auth.token);
    quizProvider.loadQuizzes(category: widget.department.apiCategory);
  }

  @override
  Widget build(BuildContext context) {
    final theme = AppThemes.of(widget.department);

    return Scaffold(
      backgroundColor: QuizListColors.background,
      body: Stack(
        children: [
          const CustomPaint(
            painter: _TexturePainter(),
            size: Size.infinite,
          ),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                  child: Row(
                    children: [
                      ClipOval(
                        child: Image.asset(
                          theme.iconPath,
                          width: 28,
                          height: 28,
                          errorBuilder:
                              (context, error, stackTrace) =>
                                  Text(
                            theme.icon,
                            style: const TextStyle(fontSize: 24),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        '${widget.department.displayName} Quizzes',
                        style: QuizListTextStyles.header,
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    'Test your knowledge with adaptive quizzes',
                    style: QuizListTextStyles.subtitle,
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: Consumer<QuizProvider>(
                    builder: (context, quizProvider, _) {
                      if (quizProvider.isLoading) {
                        return const Center(
                          child: CircularProgressIndicator(),
                        );
                      }
                      if (quizProvider.quizzes.isEmpty) {
                        return Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.quiz_outlined,
                                size: 64,
                                color: QuizListColors.iconColor,
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'No quizzes available',
                                style: QuizListTextStyles.emptyIcon,
                              ),
                            ],
                          ),
                        );
                      }
                      return ListView.builder(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 8,
                        ),
                        itemCount: quizProvider.quizzes.length,
                        itemBuilder: (context, index) {
                          final quiz = quizProvider.quizzes[index];
                          final diffColor =
                              _difficultyColor(quiz.difficultyLabel);

                          return Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: GestureDetector(
                              onTap: () {
                                quizProvider.loadQuizWithQuestions(
                                  quiz.id,
                                );
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => QuizPlayerScreen(
                                      quizId: quiz.id,
                                    ),
                                  ),
                                );
                              },
                              child: ClayContainer(
                                color: QuizListColors.background,
                                borderRadius: 28.0,
                                depth: 24,
                                spread: 5,
                                curveType: CurveType.convex,
                                child: Padding(
                                  padding: const EdgeInsets.all(20),
                                  child: Row(
                                    children: [
                                      ClayContainer(
                                        color: theme.primaryColor
                                            .withValues(alpha: 0.12),
                                        borderRadius: 18.0,
                                        depth: 10,
                                        spread: 3,
                                        curveType: CurveType.convex,
                                        child: const SizedBox(
                                          width: 50,
                                          height: 50,
                                          child: Icon(
                                            Icons.quiz,
                                            size: 24,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              quiz.title,
                                              style: QuizListTextStyles
                                                  .cardTitle,
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              '${quiz.questionCount} questions',
                                              style: QuizListTextStyles
                                                  .cardMeta,
                                            ),
                                          ],
                                        ),
                                      ),
                                      ClayContainer(
                                        color: diffColor,
                                        borderRadius: 14.0,
                                        depth: 8,
                                        spread: 2,
                                        curveType: CurveType.convex,
                                        child: Padding(
                                          padding:
                                              const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 6,
                                          ),
                                          child: Text(
                                            quiz.difficultyLabel,
                                            style: QuizListTextStyles
                                                .difficultyBadge,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
