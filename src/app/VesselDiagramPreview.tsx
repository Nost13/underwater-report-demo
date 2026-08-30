import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportSection } from '../domain/types';
import { composeVesselDiagram } from '../vesselDiagram/composer';
import { resolveMarkerIds } from '../vesselDiagram/markers';
import type { VesselDiagramConfig } from '../vesselDiagram/types';

type ComposeVesselDiagram = (
  config: VesselDiagramConfig,
  markerIds: string[],
) => Promise<Uint8Array>;

interface VesselDiagramPreviewProps {
  config: VesselDiagramConfig;
  section: ReportSection;
  compose?: ComposeVesselDiagram;
}

export function VesselDiagramPreview({
  config,
  section,
  compose = composeVesselDiagram,
}: VesselDiagramPreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failedRequest, setFailedRequest] = useState<{
    config: VesselDiagramConfig;
    section: ReportSection;
  } | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const error = failedRequest?.config === config && failedRequest.section === section;

  const revokeImageUrl = useCallback(() => {
    if (!imageUrlRef.current) return;
    URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = null;
    setImageUrl(null);
  }, []);

  useEffect(() => {
    let active = true;
    revokeImageUrl();

    compose(config, resolveMarkerIds(section)).then((bytes) => {
      if (!active) return;
      const nextUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
      imageUrlRef.current = nextUrl;
      setImageUrl(nextUrl);
      setFailedRequest(null);
    }).catch(() => {
      if (!active) return;
      revokeImageUrl();
      setFailedRequest({ config, section });
    });

    return () => {
      active = false;
      revokeImageUrl();
    };
  }, [compose, config, revokeImageUrl, section]);

  return <div className="template-location-diagram" aria-label="선박 위치도 미리보기">
    {error ? <span className="template-location-diagram-error">선박 위치도를 만들지 못했습니다.</span>
      : imageUrl
        // Object URLs reference local generated PNGs and cannot use Next's remote image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={imageUrl} alt="선박 위치도 미리보기" />
        : <span className="template-location-diagram-loading">선박 위치도를 만드는 중입니다.</span>}
  </div>;
}
