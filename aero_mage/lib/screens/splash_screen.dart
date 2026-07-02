import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../config/theme.dart';
import 'home/discipline_selection_screen.dart';
import 'home/home_screen.dart';

class _SplashTexturePainter extends CustomPainter {
  const _SplashTexturePainter();

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

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fadeIn;
  late final Animation<double> _scaleIn;
  late final Animation<double> _lottieFade;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _fadeIn = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOut),
    );
    _scaleIn = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOutBack),
    );
    _lottieFade = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.4, 0.8, curve: Curves.easeIn),
    );
    _controller.forward();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _init();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    await Future.delayed(const Duration(milliseconds: 1600));
    if (!mounted) return;

    final authProvider = context.read<AuthProvider>();
    authProvider.setMockUser();
    if (!mounted) return;

    await Future.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;

    final String? userName = authProvider.user?.name;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (ctx) => DisciplineSelectionScreen(
          userName: userName,
          onMedicalTap: () => _navigateToDepartment(
            ctx,
            AppDepartment.medical,
          ),
          onDentalTap: () => _navigateToDepartment(
            ctx,
            AppDepartment.dental,
          ),
          onEngineeringTap: () => _navigateToDepartment(
            ctx,
            AppDepartment.engineering,
          ),
          onNursingTap: () => _navigateToDepartment(
            ctx,
            AppDepartment.nursing,
          ),
        ),
      ),
    );
  }

  void _navigateToDepartment(BuildContext context, AppDepartment department) {
    context.read<ThemeProvider>().setDepartment(department);
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const HomeScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    const Color bg = Color(0xFFE0E5EC);

    return Scaffold(
      backgroundColor: bg,
      body: Stack(
        children: [
          const CustomPaint(
            painter: _SplashTexturePainter(),
            size: Size.infinite,
          ),
          Center(
            child: FadeTransition(
              opacity: _fadeIn,
              child: ScaleTransition(
                scale: _scaleIn,
                child: ClayContainer(
                  color: bg,
                  borderRadius: 48.0,
                  depth: 40,
                  spread: 8,
                  curveType: CurveType.convex,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 48,
                      vertical: 48,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'AERO',
                          style: GoogleFonts.nunito(
                            fontSize: 48,
                            fontWeight: FontWeight.w900,
                            color: const Color(0xFF2F3542),
                            letterSpacing: 8,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'M.A.G.E',
                          style: GoogleFonts.nunito(
                            fontSize: 22,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF8395A7),
                            letterSpacing: 4,
                          ),
                        ),
                        const SizedBox(height: 36),
                        FadeTransition(
                          opacity: _lottieFade,
                          child: Lottie.asset(
                            'assets/lottie/loading.json',
                            width: 80,
                            height: 80,
                            errorBuilder: (_, __, ___) =>
                                const CircularProgressIndicator(),
                          ),
                        ),
                      ],
                    ),
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
