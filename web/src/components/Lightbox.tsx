import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  assetOriginalURL,
  assetPreviewURL,
  fetchAssetDetail,
  toggleFavorite,
  trashAsset,
  fetchAlbums,
  createAlbum,
  addAssetToAlbum,
  AssetSummary,
  Album,
} from '../api/client';
import { isVideo, formatTime } from '../utils/asset';

interface LightboxProps {
  files: AssetSummary[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFavoriteChange?: (id: string, favorite: boolean) => void;
  onTrashed?: (id: string) => void;
}

export function Lightbox({ files, index, onClose, onPrev, onNext, onFavoriteChange, onTrashed }: LightboxProps) {
  const file = files[index];
  const [place, setPlace] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(file.favorite);
  const [favBusy, setFavBusy] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const [showAlbums, setShowAlbums] = useState(false);

  useEffect(() => {
    setPlace(null);
    setFavorite(file.favorite);
    setShowAlbums(false);
    let cancelled = false;
    fetchAssetDetail(file.id).then(detail => {
      if (cancelled) return;
      if (detail.placeCity) {
        setPlace(detail.placeCountry ? `${detail.placeCity}, ${detail.placeCountry}` : detail.placeCity);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [file.id, file.favorite]);

  async function handleFavorite() {
    if (favBusy) return;
    setFavBusy(true);
    try {
      const next = await toggleFavorite(file.id);
      setFavorite(next);
      onFavoriteChange?.(file.id, next);
    } catch {
      // leave state as-is
    } finally {
      setFavBusy(false);
    }
  }

  async function handleTrash() {
    if (trashBusy) return;
    if (!window.confirm('Move this to trash?')) return;
    setTrashBusy(true);
    try {
      await trashAsset(file.id);
      onTrashed?.(file.id);
      onClose();
    } catch {
      setTrashBusy(false);
    }
  }

  return (
    <Overlay onClick={onClose}>
      <LightboxInner onClick={e => e.stopPropagation()}>
        {isVideo(file) ? (
          <Video src={assetOriginalURL(file.id)} controls />
        ) : (
          <FullImg src={assetPreviewURL(file.id)} alt={formatTime(file.takenAt)} />
        )}
        <Caption>{formatTime(file.takenAt)}{place ? ` · ${place}` : ''}</Caption>

        <ActionBar>
          <IconBtn onClick={handleFavorite} disabled={favBusy} $active={favorite} aria-label="Favorite">
            {favorite ? '★' : '☆'}
          </IconBtn>
          <IconBtn onClick={() => setShowAlbums(v => !v)} aria-label="Add to album">＋</IconBtn>
          <IconBtn onClick={handleTrash} disabled={trashBusy} aria-label="Move to trash">🗑</IconBtn>
        </ActionBar>

        {showAlbums && <AlbumPicker assetId={file.id} onClose={() => setShowAlbums(false)} />}

        {index > 0 && (
          <NavBtn $side="left" onClick={onPrev} aria-label="Previous">‹</NavBtn>
        )}
        {index < files.length - 1 && (
          <NavBtn $side="right" onClick={onNext} aria-label="Next">›</NavBtn>
        )}
        <CloseBtn onClick={onClose} aria-label="Close">✕</CloseBtn>
      </LightboxInner>
    </Overlay>
  );
}

function AlbumPicker({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [addedId, setAddedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAlbums().then(setAlbums).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleAdd(albumId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await addAssetToAlbum(albumId, assetId);
      setAddedId(albumId);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const album = await createAlbum(name);
      await addAssetToAlbum(album.id, assetId);
      setAlbums(prev => [album, ...prev]);
      setAddedId(album.id);
      setNewName('');
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  return (
    <PickerOverlay onClick={onClose}>
      <PickerPanel onClick={e => e.stopPropagation()}>
        <PickerTitle>Add to album</PickerTitle>
        {loading ? (
          <PickerMuted>Loading…</PickerMuted>
        ) : albums.length === 0 ? (
          <PickerMuted>No albums yet</PickerMuted>
        ) : (
          <PickerList>
            {albums.map(a => (
              <PickerItem key={a.id} onClick={() => handleAdd(a.id)} disabled={busy}>
                <span>{a.name}</span>
                {addedId === a.id ? <span>Added ✓</span> : null}
              </PickerItem>
            ))}
          </PickerList>
        )}
        <PickerForm onSubmit={handleCreate}>
          <PickerInput
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New album name"
          />
          <PickerAddBtn type="submit" disabled={!newName.trim() || busy}>Create</PickerAddBtn>
        </PickerForm>
      </PickerPanel>
    </PickerOverlay>
  );
}

// ── Styled Components ──────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`;

const LightboxInner = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 90vw;
  max-height: 90vh;
`;

const FullImg = styled.img`
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: ${({ theme }) => theme.radius.sm};
`;

const Video = styled.video`
  max-width: 90vw;
  max-height: 85vh;
  border-radius: ${({ theme }) => theme.radius.sm};
`;

const Caption = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.8125rem;
  margin: ${({ theme }) => theme.spacing.sm} 0 0;
`;

const ActionBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const IconBtn = styled.button<{ $active?: boolean }>`
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: ${({ theme }) => theme.radius.full};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : '#fff')};
  cursor: pointer;
  font-size: 1.125rem;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const NavBtn = styled.button<{ $side: 'left' | 'right' }>`
  position: fixed;
  top: 50%;
  ${({ $side }) => $side}: ${({ theme }) => theme.spacing.lg};
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  font-size: 2rem;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const CloseBtn = styled.button`
  position: fixed;
  top: ${({ theme }) => theme.spacing.lg};
  right: ${({ theme }) => theme.spacing.lg};
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  font-size: 1rem;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const PickerOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const PickerPanel = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  width: min(320px, 90vw);
  max-height: 70vh;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
`;

const PickerTitle = styled.h3`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const PickerMuted = styled.p`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 0.875rem;
  margin: 0 0 ${({ theme }) => theme.spacing.md};
`;

const PickerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  max-height: 40vh;
  overflow-y: auto;
`;

const PickerItem = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  font-size: 0.875rem;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.sm}`};
  text-align: left;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
  }

  &:disabled {
    cursor: default;
  }
`;

const PickerForm = styled.form`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PickerInput = styled.input`
  flex: 1;
  background: ${({ theme }) => theme.colors.bg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const PickerAddBtn = styled.button`
  background: ${({ theme }) => theme.colors.primary};
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  color: #fff;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;
