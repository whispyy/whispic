import { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';

export function UpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setShowPrompt(true);
          }
        });
      });
    });
  }, []);

  const handleUpdate = () => {
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    });
    window.location.reload();
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <Wrap>
      <Row>
        <RefreshIcon />
        <Body>
          <Title>Update available</Title>
          <Desc>A new version is ready. Reload to apply.</Desc>
          <ReloadBtn onClick={handleUpdate}>Reload now</ReloadBtn>
        </Body>
      </Row>
    </Wrap>
  );
}

const slideDown = keyframes`
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0);     opacity: 1; }
`;

const Wrap = styled.div`
  position: fixed;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  z-index: 200;
  background: ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: 1rem;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  animation: ${slideDown} 0.3s ease;

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
`;

const Title = styled.p`
  margin: 0 0 2px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
`;

const Desc = styled.p`
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.75);
`;

const ReloadBtn = styled.button`
  width: 100%;
  padding: 7px 12px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  &:hover { background: rgba(255, 255, 255, 0.25); }
`;

function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  );
}
