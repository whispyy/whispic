import styled from 'styled-components';
import { assetThumbURL, AssetSummary } from '../api/client';
import { isVideo, formatTime, formatDuration } from '../utils/asset';

/**
 * Tile contents shared by the gallery, album and trash grids. Videos get a real
 * poster image: the server extracts a frame and serves it from the same
 * `/thumb` URL as photo thumbnails, so `hasThumb` is all that has to be checked.
 * The caller's tile element must be `position: relative` for the badge.
 */
export function AssetThumbContent({ file }: { file: AssetSummary }) {
  return (
    <>
      {file.hasThumb ? (
        <img src={assetThumbURL(file.id)} alt={formatTime(file.takenAt)} loading="lazy" />
      ) : (
        <Placeholder />
      )}
      {isVideo(file) && (
        <VideoBadge>
          <span aria-hidden="true">▶</span>
          {file.durationS != null && <span>{formatDuration(file.durationS)}</span>}
        </VideoBadge>
      )}
    </>
  );
}

const Placeholder = styled.div`
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.colors.surface};
`;

const VideoBadge = styled.div`
  position: absolute;
  bottom: 4px;
  left: 4px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.4;
  pointer-events: none;
`;
