import { useState } from 'react';
import { ThemeProvider, createGlobalStyle } from 'styled-components';
import styled from 'styled-components';
import { theme } from './styles/theme';
import { getToken, clearToken } from './api/client';
import { LoginScreen } from './components/LoginScreen';
import { GalleryView } from './components/GalleryView';
import { UploadView } from './components/UploadView';
import { SettingsView } from './components/SettingsView';

type Tab = 'gallery' | 'upload' | 'settings';

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  html {
    touch-action: manipulation;
    overscroll-behavior: none;
    background: ${({ theme }) => theme.colors.bg};
  }

  body {
    margin: 0;
    background: ${({ theme }) => theme.colors.bg};
    color: ${({ theme }) => theme.colors.text};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  input, button, select, textarea {
    font-family: inherit;
  }
`;

const TABS: { id: Tab; label: string; Icon: typeof ImagesIcon }[] = [
  { id: 'gallery',  label: 'Gallery',  Icon: ImagesIcon  },
  { id: 'upload',   label: 'Upload',   Icon: UploadIcon  },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState<Tab>('gallery');

  function handleSignOut() {
    clearToken();
    setAuthed(false);
  }

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      {!authed ? (
        <LoginScreen onLogin={() => setAuthed(true)} />
      ) : (
        <Shell>
          {/* ── Desktop top header (hidden on mobile) ── */}
          <TopHeader>
            <HeaderInner>
              <LogoGroup>
                <CameraIcon width={22} height={22} />
                <LogoText>Whispic</LogoText>
              </LogoGroup>

              <DesktopNav>
                {TABS.map(({ id, label }) => (
                  <DesktopNavItem
                    key={id}
                    $active={tab === id}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </DesktopNavItem>
                ))}
              </DesktopNav>

              <HeaderRight>
                <SignOutBtn onClick={handleSignOut}>
                  <LogOutIcon width={15} height={15} />
                  <span>Sign out</span>
                </SignOutBtn>
              </HeaderRight>
            </HeaderInner>
          </TopHeader>

          {/* ── Page content ── */}
          <Content>
            {tab === 'gallery'  && <GalleryView />}
            {tab === 'upload'   && <UploadView />}
            {tab === 'settings' && <SettingsView onSignOut={handleSignOut} />}
          </Content>

          {/* ── Mobile bottom pill nav (hidden on desktop) ── */}
          <BottomNavWrap>
            <BottomPill>
              {TABS.map(({ id, label, Icon }) => (
                <PillItem
                  key={id}
                  $active={tab === id}
                  onClick={() => setTab(id)}
                >
                  <Icon width={18} height={18} strokeWidth={tab === id ? 2.5 : 1.8} />
                  <PillLabel $active={tab === id}>{label}</PillLabel>
                </PillItem>
              ))}
            </BottomPill>
          </BottomNavWrap>
        </Shell>
      )}
    </ThemeProvider>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`;

const TopHeader = styled.header`
  display: none;
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(17, 24, 39, 0.72);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    display: block;
  }
`;

const HeaderInner = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 ${({ theme }) => theme.spacing.lg};
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const LogoGroup = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.primary};
  flex-shrink: 0;
`;

const LogoText = styled.span`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const DesktopNav = styled.nav`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const DesktopNavItem = styled.button<{ $active: boolean }>`
  background: ${({ theme, $active }) => $active ? theme.colors.primaryBg : 'transparent'};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.textMuted};
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: ${({ $active }) => $active ? 600 : 500};
  padding: 6px 12px;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${({ theme, $active }) => $active ? theme.colors.primaryBg : 'rgba(255,255,255,0.05)'};
    color: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.textSecondary};
  }
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-shrink: 0;
`;

const SignOutBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  cursor: pointer;
  font-size: 0.875rem;
  padding: 6px 10px;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background: rgba(255, 255, 255, 0.06);
  }
`;

const Content = styled.main`
  flex: 1;

  /* Room for the bottom pill nav on mobile */
  @media (max-width: calc(${({ theme }) => theme.breakpoints.md} - 1px)) {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
  }
`;

const BottomNavWrap = styled.nav`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  pointer-events: none;
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    display: none;
  }
`;

const BottomPill = styled.div`
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-radius: ${({ theme }) => theme.radius.full};
  background: ${({ theme }) => theme.colors.navBg};
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
`;

const PillItem = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 20px;
  border-radius: ${({ theme }) => theme.radius.full};
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  background: ${({ $active }) => $active ? '#ffffff' : 'transparent'};
  color: ${({ theme, $active }) => $active ? theme.colors.bg : theme.colors.textFaint};

  &:active {
    opacity: 0.85;
  }
`;

const PillLabel = styled.span<{ $active: boolean }>`
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
  color: inherit;
`;

// ── SVG Icons ─────────────────────────────────────────────────────────────────

interface IconProps extends React.SVGProps<SVGSVGElement> {
  strokeWidth?: number;
}

function ImagesIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function UploadIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  );
}

function SettingsIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function CameraIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function LogOutIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
