import 'styled-components';

export const theme = {
  colors: {
    bg: '#111827',                     // gray-900
    surface: '#1f2937',                // gray-800
    surfaceHover: '#263348',
    border: '#374151',                 // gray-700
    borderLight: '#4b5563',            // gray-600
    primary: '#60a5fa',                // blue-400
    primaryHover: '#93c5fd',           // blue-300
    primaryBg: 'rgba(96,165,250,0.15)',
    text: '#f9fafb',                   // gray-50
    textSecondary: '#d1d5db',          // gray-300
    textMuted: '#9ca3af',              // gray-400
    textFaint: '#6b7280',              // gray-500
    error: '#f87171',                  // red-400
    success: '#4ade80',                // green-400
    navBg: 'rgba(3,7,18,0.88)',        // near-black for pill
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '40px',
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },
  breakpoints: {
    sm: '480px',
    md: '768px',
    lg: '1024px',
  },
} as const;

export type AppTheme = typeof theme;

declare module 'styled-components' {
  export interface DefaultTheme extends AppTheme {}
}
