import 'package:flutter/material.dart';
import '../config/theme.dart';

class ThemeProvider extends ChangeNotifier {
  AppDepartment _currentDepartment = AppDepartment.nursing;

  AppDepartment get currentDepartment => _currentDepartment;
  DepartmentTheme get theme => AppThemes.of(_currentDepartment);

  ThemeData get themeData => theme.themeData;

  void setDepartment(AppDepartment department) {
    _currentDepartment = department;
    notifyListeners();
  }
}
