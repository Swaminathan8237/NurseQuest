import 'package:flutter/material.dart';

class ClaymorphicContainer extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final Color? color;
  final Color? shadowColor;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double? width;
  final double? height;
  final bool pressed;
  final GestureTapCallback? onTap;
  final Gradient? gradient;

  const ClaymorphicContainer({
    super.key,
    required this.child,
    this.borderRadius = 20,
    this.color,
    this.shadowColor,
    this.padding,
    this.margin,
    this.width,
    this.height,
    this.pressed = false,
    this.onTap,
    this.gradient,
  });

  Color _resolveShadowColor(BuildContext context) {
    if (shadowColor != null) return shadowColor!;
    final bg = color ?? Theme.of(context).scaffoldBackgroundColor;
    return bg == Colors.white ? Colors.grey.shade400 : bg;
  }

  @override
  Widget build(BuildContext context) {
    final bgColor = color ?? Theme.of(context).cardTheme.color ?? Colors.white;
    final shadow = _resolveShadowColor(context);
    final double blur = pressed ? 8 : 16;
    final double offset = pressed ? 3 : 8;

    Widget container = Container(
      width: width,
      height: height,
      margin: margin,
      padding: padding ?? const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: gradient != null ? null : bgColor,
        gradient: gradient,
        borderRadius: BorderRadius.circular(borderRadius),
        boxShadow: pressed
            ? [
                BoxShadow(
                  color: shadow.withValues(alpha: 0.15),
                  offset: Offset(offset, offset),
                  blurRadius: blur,
                ),
                BoxShadow(
                  color: Colors.white.withValues(alpha: 0.8),
                  offset: Offset(-offset, -offset),
                  blurRadius: blur,
                ),
              ]
            : [
                BoxShadow(
                  color: Colors.white.withValues(alpha: 0.8),
                  offset: const Offset(-6, -6),
                  blurRadius: 12,
                  spreadRadius: 1,
                ),
                BoxShadow(
                  color: shadow.withValues(alpha: 0.2),
                  offset: Offset(offset, offset),
                  blurRadius: blur,
                  spreadRadius: 2,
                ),
              ],
      ),
      child: child,
    );

    if (onTap != null) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(borderRadius),
          child: container,
        ),
      );
    }

    return container;
  }
}

class ClaymorphicIconButton extends StatelessWidget {
  final IconData icon;
  final Color? color;
  final Color? backgroundColor;
  final double size;
  final GestureTapCallback? onTap;

  const ClaymorphicIconButton({
    super.key,
    required this.icon,
    this.color,
    this.backgroundColor,
    this.size = 48,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ClaymorphicContainer(
      borderRadius: (size) / 2,
      color: backgroundColor ?? Colors.white,
      padding: EdgeInsets.zero,
      width: size,
      height: size,
      onTap: onTap,
      child: Icon(icon, color: color ?? Colors.grey, size: size * 0.5),
    );
  }
}
