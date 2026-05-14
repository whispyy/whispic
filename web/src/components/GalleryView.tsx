import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import styled from 'styled-components';
import { useGallery, GalleryGroup } from '../hooks/useGallery';
import { photoURL, GalleryFile } from '../api/client';

const VIDEO_EXTS = new Set(['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'ts']);

function isVideo(file: GalleryFile): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTS.has(ext);
}

interface LightboxState {
  files: GalleryFile[];
  index: number;
}

// ── Virtual row types ──────────────────────────────────────────────────────────

type VirtualRow =
  | { kind: 'heading'; group: GalleryGroup }
  | { kind: 'tiles'; files: GalleryFile[]; groupFiles: GalleryFile[]; startIndex: number };

const MIN_THUMB = 153; // 150px tile + 3px gap
const HEADING_H = 44;  // date label row height estimate

// ── GalleryView ────────────────────────────────────────────────────────────────

export function GalleryView() {
  const { groups, loading, error, refresh } = useGallery();
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // Container width drives column count
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colCount = Math.max(2, Math.floor(containerWidth / MIN_THUMB));

  // Flatten groups → heading rows + tile rows
  const rows = useMemo<VirtualRow[]>(() => {
    const result: VirtualRow[] = [];
    for (const group of groups) {
      result.push({ kind: 'heading', group });
      for (let i = 0; i < group.files.length; i += colCount) {
        result.push({
          kind: 'tiles',
          files: group.files.slice(i, i + colCount),
          groupFiles: group.files,
          startIndex: i,
        });
      }
    }
    return result;
  }, [groups, colCount]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: i => rows[i]?.kind === 'heading' ? HEADING_H : MIN_THUMB,
    overscan: 5,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openLightbox = useCallback((files: GalleryFile[], index: number) => {
    setLightbox({ files, index });
  }, []);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  const prev = useCallback(() => {
    setLightbox(l => l && l.index > 0 ? { ...l, index: l.index - 1 } : l);
  }, []);

  const next = useCallback(() => {
    setLightbox(l => l && l.index < l.files.length - 1 ? { ...l, index: l.index + 1 } : l);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, prev, next, closeLightbox]);

  if (loading && groups.length === 0) {
    return <Center><Spinner /></Center>;
  }

  if (error && groups.length === 0) {
    return (
      <Center>
        <ErrorMsg>{error}</ErrorMsg>
        <ActionBtn onClick={refresh}>Retry</ActionBtn>
      </Center>
    );
  }

  if (!loading && groups.length === 0) {
    return <Center><Muted>No photos yet. Back up some from the iOS app.</Muted></Center>;
  }

  return (
    <Wrapper>
      <Header>
        <PageTitle>Gallery</PageTitle>
        <ActionBtn onClick={refresh} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </ActionBtn>
      </Header>

      <div ref={containerRef}>
        <VirtualOuter style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(vItem => {
            const row = rows[vItem.index];
            return (
              <VirtualInner
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{ transform: `translateY(${vItem.start - virtualizer.options.scrollMargin}px)` }}
              >
                {row.kind === 'heading' ? (
                  <DateHeading>{row.group.displayDate}</DateHeading>
                ) : (
                  <TileRow
                    files={row.files}
                    colCount={colCount}
                    onOpen={i => openLightbox(row.groupFiles, row.startIndex + i)}
                  />
                )}
              </VirtualInner>
            );
          })}
        </VirtualOuter>
      </div>

      {lightbox && (
        <Lightbox
          files={lightbox.files}
          index={lightbox.index}
          onClose={closeLightbox}
          onPrev={prev}
          onNext={next}
        />
      )}
    </Wrapper>
  );
}

function TileRow({
  files,
  colCount,
  onOpen,
}: {
  files: GalleryFile[];
  colCount: number;
  onOpen: (index: number) => void;
}) {
  return (
    <Grid $cols={colCount}>
      {files.map((file, i) => (
        <Thumb key={file.path} onClick={() => onOpen(i)}>
          {isVideo(file) ? (
            <VideoIcon>▶</VideoIcon>
          ) : (
            <img src={photoURL(file)} alt={file.name} loading="lazy" />
          )}
        </Thumb>
      ))}
    </Grid>
  );
}

function Lightbox({
  files,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  files: GalleryFile[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const file = files[index];
  return (
    <Overlay onClick={onClose}>
      <LightboxInner onClick={e => e.stopPropagation()}>
        {isVideo(file) ? (
          <Video src={photoURL(file)} controls />
        ) : (
          <FullImg src={photoURL(file)} alt={file.name} />
        )}
        <Caption>{file.name}</Caption>
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

// ── Styled Components ──────────────────────────────────────────────────────────

const Wrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 1400px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const PageTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
`;

const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Muted = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.9375rem;
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.9375rem;
`;

const ActionBtn = styled.button`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  font-size: 0.875rem;
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.md}`};
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const VirtualOuter = styled.div`
  position: relative;
  width: 100%;
`;

const VirtualInner = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
`;

const DateHeading = styled.h3`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.8125rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
  padding: ${({ theme }) => `${theme.spacing.md} 0 ${theme.spacing.sm}`};
`;

const Grid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, 1fr);
  gap: 3px;
`;

const Thumb = styled.div`
  aspect-ratio: 1;
  overflow: hidden;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.surface};
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.2s;
  }

  &:hover img {
    transform: scale(1.05);
  }
`;

const VideoIcon = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.75rem;
`;

const Spinner = styled.div`
  width: 32px;
  height: 32px;
  border: 3px solid ${({ theme }) => theme.colors.border};
  border-top-color: ${({ theme }) => theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

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
