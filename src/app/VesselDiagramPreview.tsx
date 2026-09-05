import { useMemo, useSyncExternalStore } from 'react';
import type { ReportSection } from '../domain/types';
import { composeVesselDiagram, WORD_DIAGRAM_HEIGHT, WORD_DIAGRAM_WIDTH } from '../vesselDiagram/composer';
import { resolveMarkerIds } from '../vesselDiagram/markers';
import type { VesselDiagramConfig } from '../vesselDiagram/types';

type ComposeVesselDiagram = (
  config: VesselDiagramConfig,
  markerIds: string[],
) => Promise<Uint8Array>;

interface VesselDiagramPreviewProps {
  config: VesselDiagramConfig;
  section?: ReportSection;
  markerIds?: string[];
  compose?: ComposeVesselDiagram;
}

function createDiagramPreviewStore(config: VesselDiagramConfig, markerIds: string[], compose: ComposeVesselDiagram) {
  const initial = { imageUrl: null as string | null, error: false };
  let snapshot = initial;
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (notify: () => void) => {
      let active = true;
      let ownedUrl: string | null = null;
      compose(config, markerIds).then((bytes) => {
        if (!active) return;
        ownedUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
        snapshot = { imageUrl: ownedUrl, error: false };
        notify();
      }).catch(() => {
        if (!active) return;
        snapshot = { imageUrl: null, error: true };
        notify();
      });
      return () => {
        active = false;
        // React has removed this snapshot's image before unsubscribing.
        if (ownedUrl) URL.revokeObjectURL(ownedUrl);
        snapshot = initial;
      };
    },
  };
}

export function VesselDiagramPreview({
  config,
  section,
  markerIds,
  compose = composeVesselDiagram,
}: VesselDiagramPreviewProps) {
  const markerKey = JSON.stringify(markerIds ?? (section ? resolveMarkerIds(section) : []));
  const store = useMemo(() => createDiagramPreviewStore(config, JSON.parse(markerKey), compose), [config, markerKey, compose]);
  const { imageUrl, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  return <div className="template-location-diagram" aria-label="선박 위치도 미리보기" style={{ aspectRatio: `${WORD_DIAGRAM_WIDTH} / ${WORD_DIAGRAM_HEIGHT}` }}>
    {error ? <span className="template-location-diagram-error">선박 위치도를 만들지 못했습니다.</span>
      : imageUrl
        // Object URLs reference local generated PNGs and cannot use Next's remote image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={imageUrl} width={WORD_DIAGRAM_WIDTH} height={WORD_DIAGRAM_HEIGHT} alt="선박 위치도 미리보기" />
        : <span className="template-location-diagram-loading">선박 위치도를 만드는 중입니다.</span>}
  </div>;
}
