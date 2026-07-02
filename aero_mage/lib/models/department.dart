enum AppDepartment { nursing, engineering, dental, medical }

extension DepartmentExtension on AppDepartment {
  String get displayName {
    switch (this) {
      case AppDepartment.nursing:
        return 'Nursing';
      case AppDepartment.engineering:
        return 'Engineering';
      case AppDepartment.dental:
        return 'Dental';
      case AppDepartment.medical:
        return 'Medical';
    }
  }

  String get apiCategory {
    switch (this) {
      case AppDepartment.nursing:
        return 'Nursing';
      case AppDepartment.engineering:
        return 'Engineering';
      case AppDepartment.dental:
        return 'Dental';
      case AppDepartment.medical:
        return 'Medical';
    }
  }

  static AppDepartment fromName(String name) {
    switch (name.toLowerCase()) {
      case 'nursing':
        return AppDepartment.nursing;
      case 'engineering':
        return AppDepartment.engineering;
      case 'dental':
        return AppDepartment.dental;
      case 'medical':
        return AppDepartment.medical;
      default:
        return AppDepartment.nursing;
    }
  }
}
