import 'package:flutter/services.dart';

Future<void> safeHaptic(HapticFeedbackType type) async {
  try {
    switch (type) {
      case HapticFeedbackType.lightImpact:
        await HapticFeedback.lightImpact();
      case HapticFeedbackType.mediumImpact:
        await HapticFeedback.mediumImpact();
      case HapticFeedbackType.heavyImpact:
        await HapticFeedback.heavyImpact();
      case HapticFeedbackType.selectionClick:
        await HapticFeedback.selectionClick();
    }
  } catch (_) {}
}

enum HapticFeedbackType { lightImpact, mediumImpact, heavyImpact, selectionClick }
