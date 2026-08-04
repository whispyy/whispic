import { useEffect, useState, useCallback } from 'react';
import styled from 'styled-components';
import { fetchTrash, restoreAsset, assetThumbURL, AssetSummary } from '../api/client';
import { isVideo, formatTime } from '../utils/asset';

export function TrashView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTrash();
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRestore(id: string) {
    try {
      await restoreAsset(id);
      setItems(prev => prev.filter(it => it.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <Wrapper>
      <Header>
        <BackBtn onClick={onBack}>‹ Settings</BackBtn>
        <PageTitle>Trash</PageTitle>
      </Header>
      <Muted>Items are permanently deleted 30 days after being trashed.</Muted>

      {loading && <Muted>Loading…</Muted>}
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {!loading && items.length === 0 && !error && <Muted>Trash is empty.</Muted>}

      <Grid>
        {items.map(file => (
          <Thumb key={file.id}>
            {isVideo(file) ? (
              <VideoIcon>▶</VideoIcon>
            ) : (
              <img src={assetThumbURL(file.id)} alt={formatTime(file.takenAt)} loading="lazy" />
            )}
            <RestoreBtn onClick={() => handleRestore(file.id)}>Restore</RestoreBtn>
          </Thumb>
        ))}
      </Grid>
    </Wrapper>
  );
}

// ── Styled Components ──────────────────────────────────────────────────────────

const Wrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 480px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const BackBtn = styled.button`
  align-self: flex-start;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 0.875rem;
  padding: 4px 0;
`;

const PageTitle = styled.h2`
  font-size: 1.375rem;
  font-weight: 700;
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.text};
`;

const Muted = styled.p`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 0.8125rem;
  margin: 0 0 ${({ theme }) => theme.spacing.md};
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.9375rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
`;

const Thumb = styled.div`
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const VideoIcon = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.75rem;
`;

const RestoreBtn = styled.button`
  position: absolute;
  bottom: 4px;
  left: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: #fff;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 0;
`;
