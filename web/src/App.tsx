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
          <Nav>
            <NavItem $active={tab === 'gallery'} onClick={() => setTab('gallery')}>
              Gallery
            </NavItem>
            <NavItem $active={tab === 'upload'} onClick={() => setTab('upload')}>
              Upload
            </NavItem>
            <NavItem $active={tab === 'settings'} onClick={() => setTab('settings')}>
              Settings
            </NavItem>
          </Nav>
          <Content>
            {tab === 'gallery'  && <GalleryView />}
            {tab === 'upload'   && <UploadView />}
            {tab === 'settings' && <SettingsView onSignOut={handleSignOut} />}
          </Content>
        </Shell>
      )}
    </ThemeProvider>
  );
}

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`;

const Nav = styled.nav`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  position: sticky;
  top: 0;
  z-index: 10;
`;

const NavItem = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  border-bottom: 2px solid ${({ theme, $active }) => $active ? theme.colors.primary : 'transparent'};
  color: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.textSecondary};
  cursor: pointer;
  font-size: 0.9375rem;
  font-weight: 500;
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Content = styled.main`
  flex: 1;
`;
