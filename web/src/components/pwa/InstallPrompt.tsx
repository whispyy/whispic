import { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!localStorage.getItem('install-prompt-dismissed')) {
        setShowPrompt(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowPrompt(false);
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('install-prompt-dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <Wrap>
      <Row>
        <DownloadIcon />
        <Body>
          <Title>Install Whispic</Title>
          <Desc>Add to your home screen for quick access</Desc>
          <Actions>
            <InstallBtn onClick={handleInstall}>Install</InstallBtn>
            <DismissBtn onClick={handleDismiss}>Not now</DismissBtn>
          </Actions>
        </Body>
        <CloseBtn onClick={handleDismiss} aria-label="Close">
          <XIcon />
        </CloseBtn>
      </Row>
    </Wrap>
  );
}

const slideUp = keyframes`
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
`;

const Wrap = styled.div`
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  right: 1rem;
  z-index: 200;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: 1rem;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  animation: ${slideUp} 0.3s ease;

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    left: auto;
    width: 22rem;
  }
`;

const Row = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
`;

const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.p`
  margin: 0 0 2px;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const Desc = styled.p`
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const InstallBtn = styled.button`
  flex: 1;
  padding: 7px 12px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
`;

const DismissBtn = styled.button`
  padding: 7px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  &:hover { background: rgba(255,255,255,0.05); }
`;

const CloseBtn = styled.button`
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textFaint};
  &:hover { color: ${({ theme }) => theme.colors.textMuted}; }
`;

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
