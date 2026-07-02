import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';
import '../../providers/quiz_provider.dart';
import '../../providers/theme_provider.dart';
import 'quiz_player_screen.dart';

class ResultsColors {
  ResultsColors._();

  static const Color background = Color(0xFFE0E5EC);
  static const Color textPrimary = Color(0xFF2F3542);
  static const Color textMuted = Color(0xFF8395A7);
  static const Color iconColor = Color(0x8A000000);
  static const Color correct = Color(0xFF27AE60);
  static const Color incorrect = Color(0xFFE74C3C);
}

class ResultsTextStyles {
  ResultsTextStyles._();

  static TextStyle get title => GoogleFonts.nunito(
    fontSize: 28,
    fontWeight: FontWeight.w800,
    color: ResultsColors.textPrimary,
    letterSpacing: 0.3,
  );

  static TextStyle get subtitle => GoogleFonts.nunito(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: ResultsColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get scoreLarge => GoogleFonts.nunito(
    fontSize: 48,
    fontWeight: FontWeight.w900,
    color: ResultsColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get scoreLabel => GoogleFonts.nunito(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: ResultsColors.textMuted,
    letterSpacing: 0.5,
  );

  static TextStyle get statValue => GoogleFonts.nunito(
    fontSize: 20,
    fontWeight: FontWeight.w800,
    color: ResultsColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get statLabel => GoogleFonts.nunito(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: ResultsColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get buttonText => GoogleFonts.nunito(
    fontSize: 16,
    fontWeight: FontWeight.w700,
    color: Colors.white,
    letterSpacing: 0.5,
  );

  static TextStyle get emptyTitle => GoogleFonts.nunito(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: ResultsColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get emptySub => GoogleFonts.nunito(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: ResultsColors.textMuted,
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

class QuizResultsScreen extends StatelessWidget {
  final String quizId;

  const QuizResultsScreen({super.key, required this.quizId});

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeProvider>().theme;
    final quizProvider = context.watch<QuizProvider>();
    final result = quizProvider.lastResult;

    if (result == null) {
      return Scaffold(
        backgroundColor: ResultsColors.background,
        appBar: AppBar(
          backgroundColor: ResultsColors.background,
          elevation: 0,
          title: Text(
            'Quiz Results',
            style: ResultsTextStyles.title.copyWith(fontSize: 20),
          ),
        ),
        body: Stack(
          children: [
            const CustomPaint(
              painter: _TexturePainter(),
              size: Size.infinite,
            ),
            Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.emoji_events,
                      size: 80,
                      color: Colors.amber,
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Complete a quiz to see results',
                      style: ResultsTextStyles.emptyTitle,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Take a quiz and come back here',
                      style: ResultsTextStyles.emptySub,
                    ),
                    const SizedBox(height: 32),
                    GestureDetector(
                      onTap: () {
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                QuizPlayerScreen(quizId: quizId),
                          ),
                        );
                      },
                      child: ClayContainer(
                        color: theme.primaryColor,
                        borderRadius: 20.0,
                        depth: 18,
                        spread: 4,
                        curveType: CurveType.convex,
                        child: Container(
                          height: 52,
                          width: 180,
                          alignment: Alignment.center,
                          child: Text(
                            'Take Quiz',
                            style: ResultsTextStyles.buttonText,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    final correct = result['correctCount'] ?? 0;
    final totalQs = result['totalQuestions'] ?? 1;
    final xpEarned = result['xpEarned'] ?? 0;
    final percentage = result['percentage'] ?? 0;
    final isPerfect = correct == totalQs;

    return Scaffold(
      backgroundColor: ResultsColors.background,
      appBar: AppBar(
        backgroundColor: ResultsColors.background,
        elevation: 0,
        title: Text(
          'Results',
          style: ResultsTextStyles.title.copyWith(fontSize: 20),
        ),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: Icon(
              Icons.close,
              color: ResultsColors.textPrimary,
            ),
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
      body: Stack(
        children: [
          const CustomPaint(
            painter: _TexturePainter(),
            size: Size.infinite,
          ),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ClayContainer(
                color: ResultsColors.background,
                borderRadius: 40.0,
                depth: 30,
                spread: 6,
                curveType: CurveType.convex,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 28,
                    vertical: 36,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 140,
                        height: 140,
                        child: isPerfect
                            ? Lottie.asset(
                                'assets/lottie/celebration.json',
                                errorBuilder:
                                    (context, error, stackTrace) =>
                                        const Text(
                                  '\u{1F3C6}',
                                  style: TextStyle(fontSize: 64),
                                ),
                              )
                            : ClayContainer(
                                color: theme.primaryColor
                                    .withValues(alpha: 0.08),
                                borderRadius: 70.0,
                                depth: 16,
                                spread: 4,
                                curveType: CurveType.convex,
                                child: Center(
                                  child: Text(
                                    '${percentage.toStringAsFixed(0)}%',
                                    style: ResultsTextStyles.scoreLarge
                                        .copyWith(
                                      color: theme.primaryColor,
                                    ),
                                  ),
                                ),
                              ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        isPerfect
                            ? 'Perfect Score!'
                            : 'Great Effort!',
                        style: ResultsTextStyles.title,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        isPerfect
                            ? 'You nailed every question'
                            : 'Keep practicing to improve',
                        style: ResultsTextStyles.subtitle,
                      ),
                      const SizedBox(height: 28),
                      Row(
                        children: [
                          _StatItem(
                            icon: Icons.check_circle,
                            value: '$correct/$totalQs',
                            label: 'Correct',
                            color: ResultsColors.correct,
                          ),
                          const SizedBox(width: 16),
                          _StatItem(
                            icon: Icons.stars,
                            value: '+$xpEarned',
                            label: 'XP Earned',
                            color: Colors.amber,
                          ),
                          const SizedBox(width: 16),
                          _StatItem(
                            icon: Icons.emoji_events,
                            value: '${percentage.toStringAsFixed(0)}%',
                            label: 'Score',
                            color: theme.primaryColor,
                          ),
                        ],
                      ),
                      const SizedBox(height: 32),
                      GestureDetector(
                        onTap: () {
                          Navigator.pushReplacement(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  QuizPlayerScreen(quizId: quizId),
                            ),
                          );
                        },
                        child: ClayContainer(
                          color: theme.primaryColor,
                          borderRadius: 20.0,
                          depth: 18,
                          spread: 4,
                          curveType: CurveType.convex,
                          child: Container(
                            width: double.infinity,
                            height: 52,
                            alignment: Alignment.center,
                            child: Text(
                              'Try Again',
                              style: ResultsTextStyles.buttonText,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color color;

  const _StatItem({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: ClayContainer(
        color: ResultsColors.background,
        borderRadius: 20.0,
        depth: 14,
        spread: 3,
        curveType: CurveType.convex,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            vertical: 16,
            horizontal: 8,
          ),
          child: Column(
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(height: 8),
              Text(
                value,
                style: ResultsTextStyles.statValue,
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: ResultsTextStyles.statLabel,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
