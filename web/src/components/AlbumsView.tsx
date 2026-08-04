import React, { useEffect, useState, useCallback } from 'react';
import styled from 'styled-components';
import {
  fetchAlbums,
  createAlbum,
  renameAlbum,
  deleteAlbum,
  fetchAlbum,
  removeAssetFromAlbum,
  assetThumbURL,
  Album,
  AssetSummary,
} from '../api/client';
import { Lightbox } from './Lightbox';
import { AssetThumbContent } from './AssetThumb';

export function AlbumsView() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAlbums(await fetchAlbums());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load albums');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlbums(); }, [loadAlbums]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const album = await createAlbum(name);
      setAlbums(prev => [album, ...prev]);
      setNewName('');
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  if (selectedId) {
    return <AlbumDetail albumId={selectedId} onBack={() => { setSelectedId(null); loadAlbums(); }} />;
  }

  return (
    <Wrapper>
      <PageTitle>Albums</PageTitle>

      <CreateForm onSubmit={handleCreate}>
        <CreateInput
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New album name"
        />
        <CreateBtn type="submit" disabled={!newName.trim() || creating}>+ New Album</CreateBtn>
      </CreateForm>

      {loading && albums.length === 0 && <Muted>Loading…</Muted>}
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {!loading && albums.length === 0 && !error && <Muted>No albums yet.</Muted>}

      <Grid>
        {albums.map(a => (
          <AlbumCard key={a.id} onClick={() => setSelectedId(a.id)}>
            <Cover>
              {a.coverAssetId ? <img src={assetThumbURL(a.coverAssetId)} alt="" /> : <CoverPlaceholder />}
            </Cover>
            <AlbumName>{a.name}</AlbumName>
            <AlbumCount>{a.assetCount} {a.assetCount === 1 ? 'item' : 'items'}</AlbumCount>
          </AlbumCard>
        ))}
      </Grid>
    </Wrapper>
  );
}

function AlbumDetail({ albumId, onBack }: { albumId: string; onBack: () => void }) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [items, setItems] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAlbum(albumId);
      setAlbum(res.album);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load album');
    } finally {
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => { load(); }, [load]);

  async function handleRename() {
    if (!album) return;
    const name = window.prompt('Rename album', album.name);
    if (!name || !name.trim() || name.trim() === album.name) return;
    try {
      const updated = await renameAlbum(album.id, name.trim());
      setAlbum(updated);
    } catch {
      // ignore
    }
  }

  async function handleDelete() {
    if (!album) return;
    if (!window.confirm(`Delete album "${album.name}"? Photos stay in your library.`)) return;
    try {
      await deleteAlbum(album.id);
      onBack();
    } catch {
      // ignore
    }
  }

  async function handleRemove(assetId: string) {
    try {
      await removeAssetFromAlbum(albumId, assetId);
      setItems(prev => prev.filter(it => it.id !== assetId));
    } catch {
      // ignore
    }
  }

  return (
    <Wrapper>
      <DetailHeader>
        <BackBtn onClick={onBack}>‹ Albums</BackBtn>
        {album && (
          <DetailActions>
            <ActionBtn onClick={handleRename}>Rename</ActionBtn>
            <ActionBtn onClick={handleDelete}>Delete</ActionBtn>
          </DetailActions>
        )}
      </DetailHeader>

      <PageTitle>{album?.name ?? '…'}</PageTitle>

      {loading && <Muted>Loading…</Muted>}
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {!loading && items.length === 0 && !error && <Muted>No photos in this album yet.</Muted>}

      <Grid>
        {items.map((file, i) => (
          <Thumb key={file.id}>
            <ThumbImg onClick={() => setLightboxIndex(i)}>
              <AssetThumbContent file={file} />
            </ThumbImg>
            <RemoveBtn onClick={() => handleRemove(file.id)} aria-label="Remove from album">✕</RemoveBtn>
          </Thumb>
        ))}
      </Grid>

      {lightboxIndex !== null && (
        <Lightbox
          files={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() => setLightboxIndex(i => (i !== null && i < items.length - 1 ? i + 1 : i))}
          onTrashed={id => setItems(prev => prev.filter(it => it.id !== id))}
          onFavoriteChange={(id, favorite) => setItems(prev => prev.map(it => (it.id === id ? { ...it, favorite } : it)))}
        />
      )}
    </Wrapper>
  );
}

// ── Styled Components ──────────────────────────────────────────────────────────

const Wrapper = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 12px 8px;

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    padding: 12px 16px;
  }
`;

const PageTitle = styled.h2`
  font-size: 1.375rem;
  font-weight: 700;
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text};
`;

const Muted = styled.p`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 0.9375rem;
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.9375rem;
`;

const CreateForm = styled.form`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const CreateInput = styled.input`
  flex: 1;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const CreateBtn = styled.button`
  background: ${({ theme }) => theme.colors.primary};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: #fff;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  white-space: nowrap;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
`;

const AlbumCard = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Cover = styled.div`
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const CoverPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.colors.surface};
`;

const AlbumName = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const AlbumCount = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textFaint};
`;

const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const BackBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 0.875rem;
  padding: 4px 0;
`;

const DetailActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ActionBtn = styled.button`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 5px 12px;
`;

const Thumb = styled.div`
  position: relative;
  aspect-ratio: 1;
`;

const ThumbImg = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.surface};
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const RemoveBtn = styled.button`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  cursor: pointer;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;
