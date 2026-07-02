import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../../utils/platform_utils.dart';
import '../../config/theme.dart';
import '../home/discipline_selection_screen.dart';
import '../home/home_screen.dart';
import 'register_screen.dart';

class LoginColors {
  LoginColors._();

  static const Color background = Color(0xFFE0E5EC);
  static const Color textPrimary = Color(0xFF2F3542);
  static const Color textMuted = Color(0xFF8395A7);
  static const Color iconColor = Color(0x8A000000);
}

class LoginTextStyles {
  LoginTextStyles._();

  static TextStyle get appTitlePart1 => GoogleFonts.nunito(
    fontSize: 42,
    fontWeight: FontWeight.w900,
    letterSpacing: 6,
    color: LoginColors.textPrimary,
  );

  static TextStyle get appTitlePart2 => GoogleFonts.nunito(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    letterSpacing: 3,
    color: LoginColors.textMuted,
  );

  static TextStyle get subtitle => GoogleFonts.nunito(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: LoginColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get buttonText => GoogleFonts.nunito(
    fontSize: 16,
    fontWeight: FontWeight.w700,
    color: Colors.white,
    letterSpacing: 0.5,
  );

  static TextStyle get linkText => GoogleFonts.nunito(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: LoginColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get errorText => GoogleFonts.nunito(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: Color(0xFFE74C3C),
    letterSpacing: 0,
  );

  static TextStyle get fieldText => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w500,
    color: LoginColors.textPrimary,
    letterSpacing: 0,
  );

  static TextStyle get fieldLabel => GoogleFonts.nunito(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: LoginColors.textMuted,
    letterSpacing: 0.3,
  );
}

class _BackgroundTexturePainter extends CustomPainter {
  const _BackgroundTexturePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
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

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscurePassword = true;
  String? _errorMessage;

  late final AnimationController _entranceController;
  late final Animation<double> _formAnim;
  late final Animation<double> _badgeAnim;

  @override
  void initState() {
    super.initState();

    _entranceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );

    _badgeAnim = CurvedAnimation(
      parent: _entranceController,
      curve: const Interval(0.00, 0.35, curve: Curves.easeOutCubic),
    );

    _formAnim = CurvedAnimation(
      parent: _entranceController,
      curve: const Interval(0.30, 0.80, curve: Curves.easeOutCubic),
    );

    _entranceController.forward();
  }

  @override
  void dispose() {
    _entranceController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _errorMessage = null);

    final auth = context.read<AuthProvider>();
    final success = await auth.signIn(
      _emailController.text.trim(),
      _passwordController.text,
    );

    if (!mounted) return;

    if (success) {
      final String? userName = auth.user?.name;

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (ctx) => DisciplineSelectionScreen(
            userName: userName,
            onMedicalTap: () => _navigateToDepartment(
              ctx,
              AppDepartment.medical,
            ),
            onDentalTap: () =>
                _navigateToDepartment(ctx, AppDepartment.dental),
            onEngineeringTap: () =>
                _navigateToDepartment(ctx, AppDepartment.engineering),
            onNursingTap: () =>
                _navigateToDepartment(ctx, AppDepartment.nursing),
          ),
        ),
      );
    } else {
      setState(() => _errorMessage = auth.error ?? 'Login failed');
    }
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
    return Scaffold(
      backgroundColor: LoginColors.background,
      body: Stack(
        children: [
          const CustomPaint(
            painter: _BackgroundTexturePainter(),
            size: Size.infinite,
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      FadeTransition(
                        opacity: _badgeAnim,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(0.0, 0.10),
                            end: Offset.zero,
                          ).animate(_badgeAnim),
                          child: Column(
                            children: [
                              Text(
                                'AERO',
                                style: LoginTextStyles.appTitlePart1,
                              ),
                              Text(
                                'M.A.G.E',
                                style: LoginTextStyles.appTitlePart2,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Multi-discipline Adaptive\nGamified Education',
                                textAlign: TextAlign.center,
                                style: LoginTextStyles.subtitle,
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 40),
                      FadeTransition(
                        opacity: _formAnim,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(0.0, 0.12),
                            end: Offset.zero,
                          ).animate(_formAnim),
                          child: ClayContainer(
                            color: LoginColors.background,
                            borderRadius: 32.0,
                            depth: 30,
                            spread: 6,
                            curveType: CurveType.convex,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 24,
                                vertical: 32,
                              ),
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.stretch,
                                children: [
                                  if (_errorMessage != null)
                                    Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 16,
                                      ),
                                      child: Text(
                                        _errorMessage!,
                                        style: LoginTextStyles.errorText,
                                        textAlign: TextAlign.center,
                                      ),
                                    ),
                                  Text(
                                    'Email',
                                    style: LoginTextStyles.fieldLabel,
                                  ),
                                  const SizedBox(height: 6),
                                  ClayContainer(
                                    color: LoginColors.background,
                                    borderRadius: 16.0,
                                    depth: 10,
                                    spread: 3,
                                    curveType: CurveType.concave,
                                    child: TextFormField(
                                      controller: _emailController,
                                      decoration: const InputDecoration(
                                        hintText: 'you@example.com',
                                        prefixIcon:
                                            Icon(Icons.email_outlined),
                                        border: InputBorder.none,
                                        filled: false,
                                        contentPadding:
                                            EdgeInsets.symmetric(
                                          horizontal: 16,
                                          vertical: 14,
                                        ),
                                      ),
                                      style: LoginTextStyles.fieldText,
                                      keyboardType:
                                          TextInputType.emailAddress,
                                      validator: (v) {
                                        if (v == null || v.isEmpty) {
                                          return 'Enter your email';
                                        }
                                        return null;
                                      },
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                  Text(
                                    'Password',
                                    style: LoginTextStyles.fieldLabel,
                                  ),
                                  const SizedBox(height: 6),
                                  ClayContainer(
                                    color: LoginColors.background,
                                    borderRadius: 16.0,
                                    depth: 10,
                                    spread: 3,
                                    curveType: CurveType.concave,
                                    child: TextFormField(
                                      controller: _passwordController,
                                      obscureText: _obscurePassword,
                                      decoration: InputDecoration(
                                        hintText: 'Enter password',
                                        prefixIcon:
                                            const Icon(Icons.lock_outlined),
                                        border: InputBorder.none,
                                        filled: false,
                                        contentPadding:
                                            const EdgeInsets.symmetric(
                                          horizontal: 16,
                                          vertical: 14,
                                        ),
                                        suffixIcon: IconButton(
                                          icon: Icon(
                                            _obscurePassword
                                                ? Icons.visibility_off
                                                : Icons.visibility,
                                            color:
                                                LoginColors.iconColor,
                                          ),
                                          onPressed: () => setState(
                                            () => _obscurePassword =
                                                !_obscurePassword,
                                          ),
                                        ),
                                      ),
                                      style: LoginTextStyles.fieldText,
                                      validator: (v) {
                                        if (v == null || v.isEmpty) {
                                          return 'Enter your password';
                                        }
                                        return null;
                                      },
                                      onFieldSubmitted: (_) => _login(),
                                    ),
                                  ),
                                  const SizedBox(height: 28),
                                  GestureDetector(
                                    onTapDown: (_) => setState(
                                      () => _isButtonPressed = true,
                                    ),
                                    onTapUp: (_) => _handleButtonUp(),
                                    onTapCancel: () => setState(
                                      () => _isButtonPressed = false,
                                    ),
                                    child: TweenAnimationBuilder<double>(
                                      tween: Tween<double>(
                                        begin: 0.0,
                                        end: _isButtonPressed ? 1.0 : 0.0,
                                      ),
                                      duration: const Duration(
                                        milliseconds: 150,
                                      ),
                                      curve: Curves.easeInOut,
                                      builder: (context, progress, child) {
                                        final double btnDepth =
                                            20.0 - (10.0 * progress);
                                        final double btnSpread =
                                            4.0 - (2.0 * progress);
                                        final CurveType btnCurve =
                                            progress > 0.5
                                                ? CurveType.concave
                                                : CurveType.convex;

                                        return ClayContainer(
                                          color: const Color(0xFF6C5CE7),
                                          borderRadius: 20.0,
                                          depth: btnDepth.toInt(),
                                          spread: btnSpread,
                                          curveType: btnCurve,
                                          child: Container(
                                            height: 56,
                                            alignment: Alignment.center,
                                            child: Text(
                                              'Sign In',
                                              style:
                                                  LoginTextStyles.buttonText,
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      TextButton(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const RegisterScreen(),
                            ),
                          );
                        },
                        child: Text(
                          "Don't have an account? Register",
                          style: LoginTextStyles.linkText,
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

  bool _isButtonPressed = false;

  Future<void> _handleButtonUp() async {
    await safeHaptic(HapticFeedbackType.mediumImpact);
    await Future.delayed(const Duration(milliseconds: 150));
    if (!mounted) return;
    setState(() => _isButtonPressed = false);
    _login();
  }
}
