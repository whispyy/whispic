import React, { useState } from 'react';
import styled from 'styled-components';
import { authenticate, setServerURL, getServerURL } from '../api/client';
import { TrashView } from './TrashView';

interface Props {
  onSignOut: () => void;
}

export function SettingsView({ onSignOut }: Props) {
  const [url, setUrl] = useState(getServerURL());
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  if (showTrash) {
    return <TrashView onBack={() => setShowTrash(false)} />;
  }

  function handleUrlBlur() {
    setServerURL(url);
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    setServerURL(url);
    try {
      await authenticate(password);
      setSuccess(true);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Wrapper>
      <PageTitle>Settings</PageTitle>

      <Section>
        <SectionTitle>Server</SectionTitle>
        <Form onSubmit={handleConnect}>
          <Field>
            <Label htmlFor="url">Server URL</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="https://dl.home.whispyy.xyz"
              autoComplete="url"
            />
          </Field>
          <Field>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          {success && <SuccessText>Connected successfully</SuccessText>}
          <ConnectBtn type="submit" disabled={loading || !url || !password}>
            {loading ? 'Connecting…' : 'Reconnect'}
          </ConnectBtn>
        </Form>
      </Section>

      <Section>
        <SectionTitle>Library</SectionTitle>
        <DangerBtn onClick={() => setShowTrash(true)} $muted>Trash</DangerBtn>
      </Section>

      <Section>
        <SectionTitle>Account</SectionTitle>
        <DangerBtn onClick={onSignOut}>Sign Out</DangerBtn>
      </Section>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 480px;
  margin: 0 auto;
`;

const PageTitle = styled.h2`
  font-size: 1.375rem;
  font-weight: 700;
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const Section = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow: hidden;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
`;

const SectionTitle = styled.h3`
  color: ${({ theme }) => theme.colors.textFaint};
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin: 0;
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.label`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.8125rem;
`;

const Input = styled.input`
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  outline: none;
  width: 100%;
  transition: border-color 0.15s;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textFaint};
  }
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error};
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 0.875rem;
  margin: 0;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
`;

const SuccessText = styled.p`
  color: ${({ theme }) => theme.colors.success};
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.2);
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 0.875rem;
  margin: 0;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
`;

const ConnectBtn = styled.button`
  background: ${({ theme }) => theme.colors.primary};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: #fff;
  cursor: pointer;
  font-size: 0.9375rem;
  font-weight: 600;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  align-self: flex-start;
  transition: background 0.15s, opacity 0.15s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryHover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const DangerBtn = styled.button<{ $muted?: boolean }>`
  background: none;
  border: none;
  border-radius: 0;
  color: ${({ theme, $muted }) => $muted ? theme.colors.text : theme.colors.error};
  cursor: pointer;
  font-size: 0.9375rem;
  font-weight: 500;
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  text-align: left;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};

  &:hover {
    background: ${({ $muted }) => $muted ? 'rgba(255, 255, 255, 0.06)' : 'rgba(248, 113, 113, 0.08)'};
  }
`;
