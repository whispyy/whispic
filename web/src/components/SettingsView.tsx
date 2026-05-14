import React, { useState } from 'react';
import styled from 'styled-components';
import { authenticate, setServerURL, getServerURL } from '../api/client';

interface Props {
  onSignOut: () => void;
}

export function SettingsView({ onSignOut }: Props) {
  const [url, setUrl] = useState(getServerURL());
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

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
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const Section = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h3`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 ${({ theme }) => theme.spacing.md};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
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
    color: ${({ theme }) => theme.colors.textSecondary};
    opacity: 0.6;
  }
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.875rem;
  margin: 0;
`;

const SuccessText = styled.p`
  color: ${({ theme }) => theme.colors.success};
  font-size: 0.875rem;
  margin: 0;
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

const DangerBtn = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  font-size: 0.9375rem;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => `${theme.colors.error}25`};
  }
`;
