import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchMapClusters, assetThumbURL, assetPreviewURL, type MapCluster } from '../api/client';

// Plain raster OSM basemap — no API key / vector tile service required.
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const refreshClusters = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    try {
      const clusters = await fetchMapClusters(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        map.getZoom(),
      );
      markersRef.current.forEach(m => m.remove());
      markersRef.current = clusters.map(c => renderMarker(map, c, setSelectedAssetId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load map data');
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [0, 20],
      zoom: 1.5,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    map.on('load', refreshClusters);
    map.on('moveend', refreshClusters);

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [refreshClusters]);

  return (
    <Wrapper>
      <MapContainer ref={containerRef} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {selectedAssetId && (
        <PhotoOverlay onClick={() => setSelectedAssetId(null)}>
          <PhotoImg src={assetPreviewURL(selectedAssetId)} onClick={e => e.stopPropagation()} />
          <CloseBtn onClick={() => setSelectedAssetId(null)} aria-label="Close">✕</CloseBtn>
        </PhotoOverlay>
      )}
    </Wrapper>
  );
}

function renderMarker(
  map: maplibregl.Map,
  cluster: MapCluster,
  onSelect: (assetId: string) => void,
): maplibregl.Marker {
  const el = document.createElement('div');
  el.style.cursor = 'pointer';

  if (cluster.count === 1 && cluster.assetId) {
    const assetId = cluster.assetId;
    el.style.width = '44px';
    el.style.height = '44px';
    el.style.borderRadius = '8px';
    el.style.border = '2px solid #f9fafb';
    el.style.backgroundImage = `url(${assetThumbURL(assetId)})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
    el.addEventListener('click', () => onSelect(assetId));
  } else {
    el.style.width = '36px';
    el.style.height = '36px';
    el.style.borderRadius = '50%';
    el.style.background = '#60a5fa';
    el.style.color = '#111827';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontWeight = '700';
    el.style.fontSize = '13px';
    el.style.border = '2px solid #f9fafb';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
    el.textContent = String(cluster.count);
    el.addEventListener('click', () => {
      map.easeTo({ center: [cluster.lon, cluster.lat], zoom: Math.min(20, map.getZoom() + 2) });
    });
  }

  return new maplibregl.Marker({ element: el }).setLngLat([cluster.lon, cluster.lat]).addTo(map);
}

const Wrapper = styled.div`
  position: relative;
  height: calc(100dvh - 5.5rem);

  @media (min-width: ${({ theme }) => theme.breakpoints.md}) {
    height: calc(100dvh - 64px);
  }
`;

const MapContainer = styled.div`
  width: 100%;
  height: 100%;
`;

const ErrorBanner = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.spacing.md};
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.colors.error};
  color: ${({ theme }) => theme.colors.bg};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: 0.8125rem;
  z-index: 10;
`;

const PhotoOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`;

const PhotoImg = styled.img`
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: ${({ theme }) => theme.radius.sm};
`;

const CloseBtn = styled.button`
  position: fixed;
  top: ${({ theme }) => theme.spacing.lg};
  right: ${({ theme }) => theme.spacing.lg};
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: ${({ theme }) => theme.radius.full};
  color: ${({ theme }) => theme.colors.text};
  width: 40px;
  height: 40px;
  font-size: 1rem;
  cursor: pointer;
`;
