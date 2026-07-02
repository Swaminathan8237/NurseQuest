import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/department.dart';
export '../models/department.dart';

class DepartmentTheme {
  final String name;
  final String icon;
  final String iconPath;
  final String? lottiePath;
  final Color primaryColor;
  final Color secondaryColor;
  final Color surfaceColor;
  final Color backgroundColor;
  final Color cardColor;
  final String heroImage;

  const DepartmentTheme({
    required this.name,
    required this.icon,
    required this.iconPath,
    this.lottiePath,
    required this.primaryColor,
    required this.secondaryColor,
    required this.surfaceColor,
    required this.backgroundColor,
    required this.cardColor,
    required this.heroImage,
  });

  ThemeData get themeData => ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorSchemeSeed: primaryColor,
    scaffoldBackgroundColor: backgroundColor,
    cardTheme: CardTheme(
      color: cardColor,
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: primaryColor,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: true,
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: primaryColor,
      foregroundColor: Colors.white,
    ),
    textTheme: GoogleFonts.poppinsTextTheme().copyWith(
      headlineLarge: GoogleFonts.poppins(
        fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white,
      ),
      headlineMedium: GoogleFonts.poppins(
        fontSize: 22, fontWeight: FontWeight.w600, color: Colors.black87,
      ),
      bodyLarge: GoogleFonts.inter(fontSize: 16, color: Colors.black87),
      bodyMedium: GoogleFonts.inter(fontSize: 14, color: Colors.black54),
      labelLarge: GoogleFonts.poppins(
        fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: GoogleFonts.poppins(
          fontSize: 16, fontWeight: FontWeight.w600,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: primaryColor.withValues(alpha: 0.3)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: primaryColor, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
  );

  LinearGradient get gradient => LinearGradient(
    colors: [primaryColor, secondaryColor],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}

class AppThemes {
  static const nursing = DepartmentTheme(
    name: 'Nursing',
    icon: '🏥',
    iconPath: 'assets/icons/nursing_icon.png',
    lottiePath: 'assets/lottie/nursing.json',
    primaryColor: Color(0xFF2563EB),
    secondaryColor: Color(0xFF06B6D4),
    surfaceColor: Color(0xFFEFF6FF),
    backgroundColor: Color(0xFFF8FAFC),
    cardColor: Colors.white,
    heroImage: 'assets/images/nursing_hero.png',
  );

  static const engineering = DepartmentTheme(
    name: 'Engineering',
    icon: '⚙️',
    iconPath: 'assets/icons/engineering_icon.png',
    lottiePath: 'assets/lottie/engineering.json',
    primaryColor: Color(0xFFEA580C),
    secondaryColor: Color(0xFFF59E0B),
    surfaceColor: Color(0xFFFFF7ED),
    backgroundColor: Color(0xFFF8FAFC),
    cardColor: Colors.white,
    heroImage: 'assets/images/engineering_hero.jpg',
  );

  static const dental = DepartmentTheme(
    name: 'Dental',
    icon: '🦷',
    iconPath: 'assets/icons/dental_icon.png',
    lottiePath: 'assets/lottie/dental.json',
    primaryColor: Color(0xFF059669),
    secondaryColor: Color(0xFF10B981),
    surfaceColor: Color(0xFFECFDF5),
    backgroundColor: Color(0xFFF8FAFC),
    cardColor: Colors.white,
    heroImage: 'assets/images/dental_hero.png',
  );

  static const medical = DepartmentTheme(
    name: 'Medical',
    icon: '🩺',
    iconPath: 'assets/icons/medical_icon.png',
    lottiePath: 'assets/lottie/medical.json',
    primaryColor: Color(0xFF7C3AED),
    secondaryColor: Color(0xFFA855F7),
    surfaceColor: Color(0xFFF5F3FF),
    backgroundColor: Color(0xFFF8FAFC),
    cardColor: Colors.white,
    heroImage: 'assets/images/medical_hero.png',
  );

  static const Map<AppDepartment, DepartmentTheme> themes = {
    AppDepartment.nursing: nursing,
    AppDepartment.engineering: engineering,
    AppDepartment.dental: dental,
    AppDepartment.medical: medical,
  };

  static DepartmentTheme of(AppDepartment department) => themes[department]!;
}
