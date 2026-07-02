import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../../providers/quiz_provider.dart';
import '../../utils/platform_utils.dart';
import '../../config/theme.dart';
import '../quiz/quiz_list_screen.dart';
import '../quiz/quiz_results_screen.dart';
import '../profile/profile_screen.dart';
import '../auth/login_screen.dart';

class HomeColors {
  HomeColors._();

  static const Color background = Color(0xFFE0E5EC);
  static const Color textPrimary = Color(0xFF2F3542);
  static const Color textMuted = Color(0xFF8395A7);
  static const Color iconColor = Color(0x8A000000);
}

class HomeTextStyles {
  HomeTextStyles._();

  static TextStyle get greeting => GoogleFonts.nunito(
    fontSize: 24,
    fontWeight: FontWeight.w800,
    color: HomeColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get greetingSub => GoogleFonts.nunito(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: HomeColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get sectionTitle => GoogleFonts.nunito(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: HomeColors.textPrimary,
    letterSpacing: 0.3,
  );

  static TextStyle get chipLabel => GoogleFonts.nunito(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    color: Colors.white,
    letterSpacing: 0,
  );

  static TextStyle get quizTitle => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w600,
    color: HomeColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get quizMeta => GoogleFonts.nunito(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: HomeColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get deptLabel => GoogleFonts.nunito(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: Colors.white,
    letterSpacing: 0.5,
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

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadQuizzes();
    });
  }

  void _loadQuizzes() {
    final auth = context.read<AuthProvider>();
    final quizProvider = context.read<QuizProvider>();
    quizProvider.setToken(auth.token);
    final dept = context.read<ThemeProvider>().currentDepartment;
    quizProvider.loadQuizzes(category: dept.apiCategory);
  }

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeProvider>().theme;
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      backgroundColor: HomeColors.background,
      body: Stack(
        children: [
          const CustomPaint(
            painter: _TexturePainter(),
            size: Size.infinite,
          ),
          IndexedStack(
            index: _currentIndex,
            children: [
              _buildDashboard(theme, user),
              QuizListScreen(
                department:
                    context.read<ThemeProvider>().currentDepartment,
              ),
              const ProfileScreen(),
            ],
          ),
        ],
      ),
      bottomNavigationBar: ClayContainer(
        color: HomeColors.background,
        borderRadius: 0,
        depth: 20,
        spread: 4,
        curveType: CurveType.convex,
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: (i) =>
              setState(() => _currentIndex = i),
          backgroundColor: Colors.transparent,
          elevation: 0,
          indicatorColor: theme.primaryColor.withValues(alpha: 0.15),
          labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
          destinations: [
            NavigationDestination(
              icon: Icon(Icons.home_outlined, color: HomeColors.iconColor),
              selectedIcon:
                  Icon(Icons.home, color: theme.primaryColor),
              label: 'Home',
            ),
            NavigationDestination(
              icon: Icon(Icons.quiz_outlined, color: HomeColors.iconColor),
              selectedIcon:
                  Icon(Icons.quiz, color: theme.primaryColor),
              label: 'Quizzes',
            ),
            NavigationDestination(
              icon:
                  Icon(Icons.person_outline, color: HomeColors.iconColor),
              selectedIcon:
                  Icon(Icons.person, color: theme.primaryColor),
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDashboard(DepartmentTheme theme, dynamic user) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Hello, ${user?.name ?? 'Student'}',
                      style: HomeTextStyles.greeting,
                    ),
                    Text(
                      'Ready to learn?',
                      style: HomeTextStyles.greetingSub,
                    ),
                  ],
                ),
                GestureDetector(
                  onTapDown: (_) => setState(() => _isLogoutPressed = true),
                  onTapUp: (_) => _handleLogoutTap(),
                  onTapCancel: () =>
                      setState(() => _isLogoutPressed = false),
                  child: TweenAnimationBuilder<double>(
                    tween: Tween<double>(
                      begin: 0.0,
                      end: _isLogoutPressed ? 1.0 : 0.0,
                    ),
                    duration: const Duration(milliseconds: 150),
                    curve: Curves.easeInOut,
                    builder: (context, progress, child) {
                      final double btnDepth = 16.0 - (8.0 * progress);
                      final double btnSpread = 4.0 - (2.0 * progress);
                      final CurveType btnCurve = progress > 0.5
                          ? CurveType.concave
                          : CurveType.convex;

                      return ClayContainer(
                        color: HomeColors.background,
                        borderRadius: 20.0,
                        depth: btnDepth.toInt(),
                        spread: btnSpread,
                        curveType: btnCurve,
                        child: const Padding(
                          padding: EdgeInsets.all(12),
                          child: Icon(
                            Icons.logout,
                            color: Color(0xFFE74C3C),
                            size: 22,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            ClayContainer(
              color: theme.primaryColor,
              borderRadius: 32.0,
              depth: 24,
              spread: 5,
              curveType: CurveType.convex,
              child: Stack(
                children: [
                  Positioned(
                    right: -10,
                    top: -10,
                    child: SizedBox(
                      width: 100,
                      height: 100,
                      child: Lottie.asset(
                        theme.lottiePath ?? 'assets/lottie/loading.json',
                        errorBuilder: (context, error, stackTrace) =>
                            const SizedBox.shrink(),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            ClipOval(
                              child: Image.asset(
                                theme.iconPath,
                                width: 36,
                                height: 36,
                                errorBuilder:
                                    (context, error, stackTrace) =>
                                        Text(
                                  theme.icon,
                                  style: const TextStyle(fontSize: 32),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Text(
                                  theme.name,
                                  style: GoogleFonts.nunito(
                                    color: Colors.white,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  'Department',
                                  style: HomeTextStyles.deptLabel,
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _StatChip(
                              icon: Icons.auto_awesome,
                              label:
                                  'Level ${user?.level ?? 1}',
                            ),
                            _StatChip(
                              icon: Icons.stars,
                              label: '${user?.xp ?? 0} XP',
                            ),
                            _StatChip(
                              icon: Icons.local_fire_department,
                              label: '\u{1F525} ${user?.streak ?? 0}',
                            ),
                            if (user?.stats != null) ...[
                              _StatChip(
                                icon: Icons.check_circle,
                                label:
                                    '${user!.stats!['quizzes_taken'] ?? 0} quizzes',
                              ),
                              _StatChip(
                                icon: Icons.trending_up,
                                label:
                                    '${(user.stats!['avg_score'] ?? 0).toStringAsFixed(0)}% avg',
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Recent Quizzes',
              style: HomeTextStyles.sectionTitle,
            ),
            const SizedBox(height: 12),
            Consumer<QuizProvider>(
              builder: (context, quizProvider, _) {
                if (quizProvider.isLoading) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: CircularProgressIndicator(),
                    ),
                  );
                }
                final quizzes = quizProvider.quizzes;
                if (quizzes.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Text(
                        'No quizzes available yet',
                        style: HomeTextStyles.quizMeta,
                      ),
                    ),
                  );
                }
                return ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: quizzes.length > 3 ? 3 : quizzes.length,
                  itemBuilder: (context, index) {
                    final quiz = quizzes[index];
                    return _QuizItem(
                      quiz: quiz,
                      theme: theme,
                      onTap: () {
                        context.read<QuizProvider>()
                            .loadQuizWithQuestions(quiz.id);
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => QuizResultsScreen(
                              quizId: quiz.id,
                            ),
                          ),
                        );
                      },
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  bool _isLogoutPressed = false;

  Future<void> _handleLogoutTap() async {
    await safeHaptic(HapticFeedbackType.mediumImpact);
    await Future.delayed(const Duration(milliseconds: 150));
    if (!mounted) return;
    setState(() => _isLogoutPressed = false);
    context.read<AuthProvider>().signOut();
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }
}

class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _StatChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      color: Colors.white.withValues(alpha: 0.2),
      borderRadius: 20.0,
      depth: 8,
      spread: 2,
      curveType: CurveType.concave,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 14),
            const SizedBox(width: 4),
            Text(
              label,
              style: HomeTextStyles.chipLabel,
            ),
          ],
        ),
      ),
    );
  }
}

class _QuizItem extends StatelessWidget {
  final dynamic quiz;
  final DepartmentTheme theme;
  final VoidCallback onTap;

  const _QuizItem({
    required this.quiz,
    required this.theme,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GestureDetector(
        onTap: onTap,
        child: ClayContainer(
          color: HomeColors.background,
          borderRadius: 24.0,
          depth: 20,
          spread: 4,
          curveType: CurveType.convex,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ),
            child: Row(
              children: [
                ClayContainer(
                  color: theme.primaryColor.withValues(alpha: 0.12),
                  borderRadius: 16.0,
                  depth: 8,
                  spread: 2,
                  curveType: CurveType.convex,
                  child: const SizedBox(
                    width: 44,
                    height: 44,
                    child: Icon(
                      Icons.quiz,
                      size: 22,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        quiz.title ?? '',
                        style: HomeTextStyles.quizTitle,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${quiz.questionCount ?? 0} questions \u00B7 ${quiz.difficultyLabel ?? ''}',
                        style: HomeTextStyles.quizMeta,
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right,
                  color: HomeColors.iconColor,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
