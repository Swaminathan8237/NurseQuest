import 'package:flutter_test/flutter_test.dart';
import 'package:aero_mage/main.dart';

void main() {
  testWidgets('App launches', (WidgetTester tester) async {
    await tester.pumpWidget(const AeroMAGEApp());
    expect(find.text('AERO'), findsOneWidget);
  });
}
