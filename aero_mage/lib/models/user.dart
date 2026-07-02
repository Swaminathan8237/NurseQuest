class UserProfile {
  final String id;
  final String email;
  final String name;
  final String role;
  final int xp;
  final int level;
  final int streak;
  final Map<String, dynamic>? avatarConfig;
  final List<dynamic>? achievements;
  final Map<String, dynamic>? stats;

  UserProfile({
    required this.id,
    required this.email,
    required this.name,
    this.role = 'student',
    this.xp = 0,
    this.level = 1,
    this.streak = 0,
    this.avatarConfig,
    this.achievements,
    this.stats,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id'] ?? '',
      email: json['email'] ?? '',
      name: json['name'] ?? '',
      role: json['role'] ?? 'student',
      xp: json['xp'] ?? 0,
      level: json['level'] ?? 1,
      streak: json['streak'] ?? 0,
      avatarConfig: json['avatar_config'],
      achievements: json['achievements'],
      stats: json['stats'],
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'name': name,
    'role': role,
    'xp': xp,
    'level': level,
    'streak': streak,
    'avatar_config': avatarConfig,
  };
}
