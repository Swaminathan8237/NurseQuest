import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../auth/login_screen.dart';

class ProfileColors {
  ProfileColors._();

  static const Color background = Color(0xFFE0E5EC);
  static const Color textPrimary = Color(0xFF2F3542);
  static const Color textMuted = Color(0xFF8395A7);
  static const Color iconColor = Color(0x8A000000);
}

class ProfileTextStyles {
  ProfileTextStyles._();

  static TextStyle get name => GoogleFonts.nunito(
    fontSize: 22,
    fontWeight: FontWeight.w800,
    color: ProfileColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get email => GoogleFonts.nunito(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: ProfileColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get badge => GoogleFonts.nunito(
    fontSize: 13,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.5,
  );

  static TextStyle get rowLabel => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w500,
    color: ProfileColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get rowValue => GoogleFonts.nunito(
    fontSize: 16,
    fontWeight: FontWeight.w800,
    letterSpacing: 0,
  );

  static TextStyle get signOut => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w600,
    color: Color(0xFFE74C3C),
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

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeProvider>().theme;
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final isTeacher = auth.isTeacher;

    return Scaffold(
      backgroundColor: ProfileColors.background,
      body: Stack(
        children: [
          const CustomPaint(
            painter: _TexturePainter(),
            size: Size.infinite,
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  const SizedBox(height: 20),
                  ClayContainer(
                    color: theme.primaryColor.withValues(alpha: 0.08),
                    borderRadius: 50.0,
                    depth: 16,
                    spread: 4,
                    curveType: CurveType.convex,
                    child: Container(
                      width: 100,
                      height: 100,
                      alignment: Alignment.center,
                      child: Text(
                        (user?.name ?? 'S')[0].toUpperCase(),
                        style: GoogleFonts.nunito(
                          fontSize: 44,
                          fontWeight: FontWeight.w800,
                          color: theme.primaryColor,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    user?.name ?? 'Student',
                    style: ProfileTextStyles.name,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    user?.email ?? '',
                    style: ProfileTextStyles.email,
                  ),
                  const SizedBox(height: 8),
                  ClayContainer(
                    color: theme.primaryColor.withValues(alpha: 0.08),
                    borderRadius: 16.0,
                    depth: 8,
                    spread: 2,
                    curveType: CurveType.concave,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 6,
                      ),
                      child: Text(
                        isTeacher ? 'Teacher' : 'Student',
                        style: ProfileTextStyles.badge.copyWith(
                          color: theme.primaryColor,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                  ProfileCard(
                    children: [
                      _ProfileRow(
                        icon: Icons.auto_awesome,
                        label: 'Level',
                        value: '${user?.level ?? 1}',
                        color: Colors.amber,
                      ),
                      const Divider(height: 1),
                      _ProfileRow(
                        icon: Icons.stars,
                        label: 'XP',
                        value: '${user?.xp ?? 0}',
                        color: Colors.blue,
                      ),
                      const Divider(height: 1),
                      _ProfileRow(
                        icon: Icons.local_fire_department,
                        label: 'Best Streak',
                        value: '${user?.streak ?? 0}',
                        color: Colors.deepOrange,
                      ),
                      if (user?.stats != null) ...[
                        const Divider(height: 1),
                        _ProfileRow(
                          icon: Icons.quiz,
                          label: 'Quizzes Taken',
                          value:
                              '${user!.stats!['quizzes_taken'] ?? 0}',
                          color: Colors.purple,
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 16),
                  ProfileCard(
                    children: [
                      InkWell(
                        onTap: () {
                          auth.signOut();
                          Navigator.pushAndRemoveUntil(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const LoginScreen(),
                            ),
                            (_) => false,
                          );
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.logout,
                                color: const Color(0xFFE74C3C),
                                size: 22,
                              ),
                              const SizedBox(width: 16),
                              Text(
                                'Sign Out',
                                style: ProfileTextStyles.signOut,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ProfileCard extends StatelessWidget {
  final List<Widget> children;

  const ProfileCard({
    super.key,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      color: ProfileColors.background,
      borderRadius: 28.0,
      depth: 22,
      spread: 5,
      curveType: CurveType.convex,
      child: Column(children: children),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _ProfileRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              label,
              style: ProfileTextStyles.rowLabel,
            ),
          ),
          Text(
            value,
            style: ProfileTextStyles.rowValue.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}
