import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('skillquest_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return 'light'; // Playful & Vibrant defaults to light
  });

  useEffect(() => {
    localStorage.setItem('skillquest_theme', theme);
    const root = document.documentElement;
    // Single source of truth: data-theme drives design tokens.
    root.setAttribute('data-theme', theme);
    // Keep .dark class + body.light-theme for back-compat (Tailwind dark: variants, legacy selectors).
    root.classList.toggle('dark', theme === 'dark');
    document.body.classList.toggle('light-theme', theme === 'light');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
