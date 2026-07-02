import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/theme.dart';
import '../../providers/theme_provider.dart';
import '../../widgets/claymorphic_container.dart';
import '../home/home_screen.dart';

class DepartmentSelectionScreen extends StatelessWidget {
  const DepartmentSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 32),
              Text(
                'Welcome to',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Colors.grey[600],
                ),
              ),
              Text(
                'Aero M.A.G.E',
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 2,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Choose your department to begin learning',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey[500],
                ),
              ),
              const SizedBox(height: 32),
              Expanded(
                child: GridView.count(
                  crossAxisCount: 2,
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  childAspectRatio: 0.85,
                  children: AppDepartment.values.map((dept) {
                    final theme = AppThemes.of(dept);
                    return _DepartmentCard(
                      theme: theme,
                      onTap: () {
                        context.read<ThemeProvider>().setDepartment(dept);
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const HomeScreen(),
                          ),
                        );
                      },
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DepartmentCard extends StatelessWidget {
  final DepartmentTheme theme;
  final VoidCallback onTap;

  const _DepartmentCard({required this.theme, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ClaymorphicContainer(
      borderRadius: 20,
      padding: const EdgeInsets.all(20),
      color: Colors.white,
      shadowColor: theme.primaryColor.withValues(alpha: 0.3),
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: theme.primaryColor.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: ClipOval(
              child: Image.asset(
                theme.iconPath,
                width: 32,
                height: 32,
                errorBuilder: (context, error, stackTrace) => Text(
                  theme.icon,
                  style: const TextStyle(fontSize: 28),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Flexible(
            child: Text(
              theme.name,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: theme.primaryColor,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Flexible(
            child: Text(
              _getSubtitle(theme.name),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey[600],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _getSubtitle(String name) {
    switch (name) {
      case 'Nursing':
        return 'Patient care &\nclinical skills';
      case 'Engineering':
        return 'Design, build &\nproblem solving';
      case 'Dental':
        return 'Oral health &\ndentistry';
      case 'Medical':
        return 'Diagnosis &\ntreatment';
      default:
        return 'Adaptive learning';
    }
  }
}
