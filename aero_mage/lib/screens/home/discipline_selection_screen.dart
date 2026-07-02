import 'package:clay_containers/clay_containers.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../utils/platform_utils.dart';

class DisciplineColors {
  DisciplineColors._();

  static const Color background = Color(0xFFE0E5EC);
  static const Color medical = Color(0xFFFFD1DC);
  static const Color dental = Color(0xFFD4F0F0);
  static const Color engineering = Color(0xFFFFDFBA);
  static const Color nursing = Color(0xFFE6E6FA);
  static const Color textPrimary = Color(0xFF2F3542);
  static const Color textMuted = Color(0xFF8395A7);
  static const Color iconColor = Color(0x8A000000);
}

class DisciplineTextStyles {
  DisciplineTextStyles._();

  static TextStyle get badge => GoogleFonts.nunito(
    fontSize: 11,
    fontWeight: FontWeight.w800,
    color: DisciplineColors.textMuted,
    letterSpacing: 2.5,
  );

  static TextStyle get greeting => GoogleFonts.nunito(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: DisciplineColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get headerTitle => GoogleFonts.nunito(
    fontSize: 34,
    fontWeight: FontWeight.w800,
    color: DisciplineColors.textPrimary,
    letterSpacing: 0.5,
    shadows: [
      Shadow(
        color: Color(0x1F2F3542),
        blurRadius: 8,
        offset: Offset(0, 3),
      ),
    ],
  );

  static TextStyle get headerSubtitle => GoogleFonts.nunito(
    fontSize: 15,
    fontWeight: FontWeight.w500,
    color: DisciplineColors.textMuted,
    letterSpacing: 0,
  );

  static TextStyle get cardTitle => GoogleFonts.nunito(
    fontSize: 20,
    fontWeight: FontWeight.w700,
    color: DisciplineColors.textPrimary,
    letterSpacing: 0.3,
  );

  static TextStyle get cardSubtitle => GoogleFonts.nunito(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: DisciplineColors.textMuted,
    letterSpacing: 0,
  );
}

class DisciplineModel {
  const DisciplineModel({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String id;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
}

class _BackgroundTexturePainter extends CustomPainter {
  const _BackgroundTexturePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = const Color(0xFF2F3542).withValues(alpha: 0.038)
      ..style = PaintingStyle.fill;

    const double step = 18.0; // grid spacing between dots
    const double dotRadius = 0.8; // dot radius in logical pixels

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

class _AeroBadgeWidget extends StatelessWidget {
  const _AeroBadgeWidget({required this.animation});

  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: animation,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.0, 0.10),
          end: Offset.zero,
        ).animate(animation),
        child: ClayContainer(
          color: DisciplineColors.background,
          borderRadius: 22.0,
          depth: 20,
          spread: 4,
          curveType: CurveType.convex,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 11),
            child: Text(
              'AERO M.A.G.E.',
              style: DisciplineTextStyles.badge,
            ),
          ),
        ),
      ),
    );
  }
}

class _GreetingWidget extends StatelessWidget {
  const _GreetingWidget({
    required this.firstName,
    required this.animation,
  });

  final String firstName;
  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: animation,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.0, 0.10),
          end: Offset.zero,
        ).animate(animation),
        child: Text(
          'Good morning, $firstName \u{1F44B}',
          style: DisciplineTextStyles.greeting,
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class _HeaderWidget extends StatelessWidget {
  const _HeaderWidget({required this.animation});

  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: animation,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.0, 0.10),
          end: Offset.zero,
        ).animate(animation),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              'Select Your Discipline',
              style: DisciplineTextStyles.headerTitle,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              'Choose a category to begin your journey.',
              style: DisciplineTextStyles.headerSubtitle,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _DisciplineGrid extends StatelessWidget {
  const _DisciplineGrid({
    required this.disciplines,
    required this.cardAnimations,
  });

  final List<DisciplineModel> disciplines;
  final List<Animation<double>> cardAnimations;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final double maxWidth = constraints.maxWidth;
        final double childAspectRatio = () {
          if (MediaQuery.of(context).orientation == Orientation.landscape &&
              maxWidth < 768) {
            return 1.15;
          }
          if (maxWidth >= 600) {
            return 1.1;
          }
          return 1.0;
        }();

        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 20,
            mainAxisSpacing: 20,
            childAspectRatio: childAspectRatio,
          ),
          itemCount: disciplines.length,
          itemBuilder: (context, index) => ClayDisciplineCard(
            model: disciplines[index],
            entranceAnimation: cardAnimations[index],
          ),
        );
      },
    );
  }
}

class ClayDisciplineCard extends StatefulWidget {
  const ClayDisciplineCard({
    super.key,
    required this.model,
    required this.entranceAnimation,
  });

  final DisciplineModel model;
  final Animation<double> entranceAnimation;

  @override
  State<ClayDisciplineCard> createState() => _ClayDisciplineCardState();
}

class _ClayDisciplineCardState extends State<ClayDisciplineCard> {
  bool _isPressed = false;

  Future<void> _handleTapUp(TapUpDetails _) async {
    await safeHaptic(HapticFeedbackType.mediumImpact);
    await Future.delayed(const Duration(milliseconds: 200));
    if (!mounted) return;
    setState(() => _isPressed = false);
    await Future.delayed(const Duration(milliseconds: 80));
    if (!mounted) return;
    widget.model.onTap();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: widget.entranceAnimation,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.0, 0.12),
          end: Offset.zero,
        ).animate(widget.entranceAnimation),
        child: Semantics(
          label:
              '${widget.model.title} discipline. ${widget.model.subtitle}. Double tap to select.',
          button: true,
          excludeSemantics: true,
          child: GestureDetector(
            onTapDown: (_) => setState(() => _isPressed = true),
            onTapUp: _handleTapUp,
            onTapCancel: () => setState(() => _isPressed = false),
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(
                  begin: 0.0, end: _isPressed ? 1.0 : 0.0),
              duration: const Duration(milliseconds: 150),
              curve: Curves.easeInOut,
              builder: (context, pressProgress, child) {
                final double depth = 30.0 - (15.0 * pressProgress);
                final double spread = 6.0 - (3.0 * pressProgress);
                final CurveType curveType = pressProgress > 0.5
                    ? CurveType.concave
                    : CurveType.convex;

                return ClayContainer(
                  color: widget.model.color,
                  borderRadius: 32.0,
                  depth: depth.toInt(),
                  spread: spread,
                  curveType: curveType,
                  child: child,
                );
              },
              child: _ClayCardContent(model: widget.model),
            ),
          ),
        ),
      ),
    );
  }
}

class _ClayCardContent extends StatelessWidget {
  const _ClayCardContent({required this.model});

  final DisciplineModel model;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _ClayIconBubble(model: model),
          const SizedBox(height: 16),
          Text(
            model.title,
            style: DisciplineTextStyles.cardTitle,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              model.subtitle,
              style: DisciplineTextStyles.cardSubtitle,
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

class _ClayIconBubble extends StatelessWidget {
  const _ClayIconBubble({required this.model});

  final DisciplineModel model;

  @override
  Widget build(BuildContext context) {
    final Color bubbleColor = Color.lerp(
      model.color,
      DisciplineColors.textPrimary,
      0.08,
    )!;

    return SizedBox(
      width: 80,
      height: 80,
      child: ClayContainer(
        color: bubbleColor,
        borderRadius: 40.0,
        depth: 16,
        spread: 4,
        curveType: CurveType.convex,
        child: Center(
          child: Icon(
            model.icon,
            size: 34,
            color: DisciplineColors.iconColor,
          ),
        ),
      ),
    );
  }
}

class _DisciplineSelectionScreenState
    extends State<DisciplineSelectionScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _entranceController;

  late final Animation<double> _backgroundFade;
  late final Animation<double> _badgeAnim;
  late final Animation<double> _greetingAnim;
  late final Animation<double> _headerAnim;
  late final List<Animation<double>> _cardAnims;

  @override
  void initState() {
    super.initState();

    _entranceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );

    _backgroundFade = CurvedAnimation(
      parent: _entranceController,
      curve: const Interval(0.00, 0.30, curve: Curves.easeOut),
    );

    _badgeAnim = CurvedAnimation(
      parent: _entranceController,
      curve: const Interval(0.10, 0.42, curve: Curves.easeOutCubic),
    );

    _greetingAnim = CurvedAnimation(
      parent: _entranceController,
      curve: const Interval(0.18, 0.50, curve: Curves.easeOutCubic),
    );

    _headerAnim = CurvedAnimation(
      parent: _entranceController,
      curve: const Interval(0.22, 0.55, curve: Curves.easeOutCubic),
    );

    _cardAnims = [
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.32, 0.68, curve: Curves.easeOutCubic),
      ),
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.40, 0.76, curve: Curves.easeOutCubic),
      ),
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.46, 0.82, curve: Curves.easeOutCubic),
      ),
      CurvedAnimation(
        parent: _entranceController,
        curve: const Interval(0.52, 0.88, curve: Curves.easeOutCubic),
      ),
    ];

    _entranceController.forward();
  }

  @override
  void dispose() {
    _entranceController.dispose();
    super.dispose();
  }

  List<DisciplineModel> _buildDisciplines() {
    return [
      DisciplineModel(
        id: 'medical',
        title: 'Medical',
        subtitle: 'Pathology \u00B7 Pharmacology',
        icon: Icons.favorite_rounded,
        color: DisciplineColors.medical,
        onTap: widget.onMedicalTap,
      ),
      DisciplineModel(
        id: 'dental',
        title: 'Dental',
        subtitle: 'Oral Health \u00B7 Radiology',
        icon: Icons.medical_services_rounded,
        color: DisciplineColors.dental,
        onTap: widget.onDentalTap,
      ),
      DisciplineModel(
        id: 'engineering',
        title: 'Engineering',
        subtitle: 'Circuits \u00B7 Thermodynamics',
        icon: Icons.architecture,
        color: DisciplineColors.engineering,
        onTap: widget.onEngineeringTap,
      ),
      DisciplineModel(
        id: 'nursing',
        title: 'Nursing',
        subtitle: 'Patient Care \u00B7 Theory',
        icon: Icons.local_hospital_rounded,
        color: DisciplineColors.nursing,
        onTap: widget.onNursingTap,
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final String? firstName;
    if (widget.userName != null && widget.userName!.trim().isNotEmpty) {
      firstName = widget.userName!.trim().split(' ').first;
    } else {
      firstName = null;
    }

    final List<DisciplineModel> disciplines = _buildDisciplines();

    return Scaffold(
      backgroundColor: DisciplineColors.background,
      body: Stack(
        children: [
          FadeTransition(
            opacity: _backgroundFade,
            child: const CustomPaint(
              painter: _BackgroundTexturePainter(),
              size: Size.infinite,
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 32, 24, 48),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  _AeroBadgeWidget(animation: _badgeAnim),
                  const SizedBox(height: 16),
                  if (firstName != null)
                    _GreetingWidget(
                      firstName: firstName,
                      animation: _greetingAnim,
                    ),
                  if (firstName != null) const SizedBox(height: 8),
                  _HeaderWidget(animation: _headerAnim),
                  const SizedBox(height: 40),
                  _DisciplineGrid(
                    disciplines: disciplines,
                    cardAnimations: _cardAnims,
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

class DisciplineSelectionScreen extends StatefulWidget {
  const DisciplineSelectionScreen({
    super.key,
    this.userName,
    required this.onMedicalTap,
    required this.onDentalTap,
    required this.onEngineeringTap,
    required this.onNursingTap,
  });

  /// Optional authenticated user's full name.
  /// If provided and non-empty, a personalized greeting is shown.
  final String? userName;

  final VoidCallback onMedicalTap;
  final VoidCallback onDentalTap;
  final VoidCallback onEngineeringTap;
  final VoidCallback onNursingTap;

  @override
  State<DisciplineSelectionScreen> createState() =>
      _DisciplineSelectionScreenState();
}
