import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import styled from 'styled-components';
import { useGallery, GalleryGroup } from '../hooks/useGallery';
import { photoURL, thumbURL, GalleryFile } from '../api/client';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

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

const HEADING_H = 48;  // date label row height estimate

function getColCount(width: number): number {
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768)  return 4;
  if (width >= 480)  return 3;
  return 2;
}

// ── GalleryView ────────────────────────────────────────────────────────────────

export function GalleryView() {
  const { groups, loading, error, refresh } = useGallery();
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // Container width drives column count
  const gridRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pull-to-refresh (mobile only — desktop keeps the Refresh button)
  const { containerRef: pullRef, pullDistance, refreshing: ptr } = usePullToRefresh(async () => { await refresh(); });

  const colCount = getColCount(containerWidth);
  const tileSize = containerWidth > 0 ? Math.floor(containerWidth / colCount) : 160;

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
    estimateSize: i => rows[i]?.kind === 'heading' ? HEADING_H : tileSize,
    overscan: 5,
    scrollMargin: gridRef.current?.offsetTop ?? 0,
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
    return (
      <SkeletonWrapper>
        <SkeletonGrid>
          {Array.from({ length: 24 }).map((_, i) => (
            <SkeletonTile key={i} style={{ animationDelay: `${(i % 8) * 50}ms` }} />
          ))}
        </SkeletonGrid>
      </SkeletonWrapper>
    );
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
    <Wrapper ref={pullRef as React.RefObject<HTMLDivElement>}>
      <PullIndicator $distance={pullDistance} $refreshing={ptr}>
        <PullSpinner $spin={ptr} $progress={Math.min(1, pullDistance / 80)} />
      </PullIndicator>

      <DesktopHeader>
        <PageTitle>Gallery</PageTitle>
        <ActionBtn onClick={refresh} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </ActionBtn>
      </DesktopHeader>

      <div ref={gridRef}>
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
                  <DateHeading>
                    <span>{row.group.displayDate}</span>
                    <PhotoCount>{row.group.files.length} {row.group.files.length === 1 ? 'photo' : 'photos'}</PhotoCount>
                  </DateHeading>
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
          ) : file.has_thumbnail ? (
            <img src={thumbURL(file)} alt={file.name} loading="lazy" />
          ) : (
            <ThumbPlaceholder />
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
  max-width: 1400px;
  margin: 0 auto;
  padding: 12px 8px 0;

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    padding: 12px 16px 0;
  }
`;

const DesktopHeader = styled.div`
  display: none;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.md};

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    display: flex;
  }
`;

const PullIndicator = styled.div<{ $distance: number; $refreshing: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  height: ${({ $distance, $refreshing }) => ($refreshing ? 48 : $distance * 0.6)}px;
  transition: ${({ $refreshing, $distance }) =>
    $refreshing && $distance > 0 ? 'height 300ms ease-out' : 'none'};

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    display: none;
  }
`;

const PullSpinner = styled.div<{ $spin: boolean; $progress: number }>`
  width: 20px;
  height: 20px;
  border: 2px solid ${({ theme }) => theme.colors.border};
  border-top-color: ${({ theme }) => theme.colors.primary};
  border-radius: 50%;
  opacity: ${({ $spin, $progress }) => ($spin ? 1 : 0.4 + $progress * 0.6)};
  transform: ${({ $spin, $progress }) => ($spin ? 'none' : `rotate(${$progress * 360}deg)`)};
  animation: ${({ $spin }) => ($spin ? 'ptr-spin 0.8s linear infinite' : 'none')};
  transition: ${({ $spin }) => ($spin ? 'opacity 200ms' : 'none')};

  @keyframes ptr-spin {
    to { transform: rotate(360deg); }
  }
`;

const PageTitle = styled.h2`
  font-size: 1.375rem;
  font-weight: 700;
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
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 0.9375rem;
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.9375rem;
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
  transition: background 0.15s, border-color 0.15s;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    border-color: ${({ theme }) => theme.colors.borderLight};
  }

  &:disabled {
    opacity: 0.35;
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

const DateHeading = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12px 0 4px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 4px;

  span {
    font-size: 0.875rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const PhotoCount = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textFaint};
  margin-left: ${({ theme }) => theme.spacing.sm};
`;

const Grid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, 1fr);
  gap: 4px;
  margin-bottom: 4px;

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    gap: 8px;
    margin-bottom: 8px;
  }
`;

const Thumb = styled.div`
  aspect-ratio: 1;
  overflow: hidden;
  cursor: pointer;
  background: ${({ theme }) => theme.colors.surface};
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  position: relative;
  transition: box-shadow 0.15s;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: transparent;
    transition: background 0.15s;
    border-radius: inherit;
  }

  &:hover {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary};
  }

  &:hover::after {
    background: rgba(0, 0, 0, 0.18);
  }
`;

const ThumbPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.colors.surface};
`;

const VideoIcon = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.75rem;
`;

const SkeletonWrapper = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 12px 8px 0;

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    padding: 12px 16px 0;
  }
`;

const SkeletonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 4px;

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    gap: 8px;
  }
`;

const SkeletonTile = styled.div`
  aspect-ratio: 1;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.surface};
  animation: pulse 1.4s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
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
