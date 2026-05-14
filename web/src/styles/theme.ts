import 'styled-components';

export const theme = {
  colors: {
    bg: '#0f0f0f',
    surface: '#1a1a1a',
    surfaceHover: '#242424',
    border: '#2a2a2a',
    primary: '#4f8ef7',
    primaryHover: '#6aa3ff',
    text: '#e8e8e8',
    textSecondary: '#888',
    error: '#e05252',
    success: '#52c078',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '40px',
  },
  radius: {
    sm: '6px',
    md: '10px',
    lg: '16px',
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
