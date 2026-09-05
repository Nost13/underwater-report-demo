import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportSection } from '../domain/types';
import type { VesselDiagramConfig } from '../vesselDiagram/types';
import { VesselDiagramPreview } from './VesselDiagramPreview';

const config: VesselDiagramConfig = {
  imageFile: new File(['vessel'], 'vessel.png', { type: 'image/png' }),
  imageName: 'vessel.png',
  calibration: { sternX: 0.08, bowX: 0.92, hullTopY: 0.15, bottomY: 0.86 },
  confirmed: true,
  hullMarkers: [],
  nicheMarkers: [],
};

const section = (component: string, unit?: number): ReportSection => ({
  id: component,
  targetId: component,
  area: 'NICHE',
  component,
  unit,
  service: 'INSPECTION',
  phases: ['CURRENT'],
  conditions: {},
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VesselDiagramPreview', () => {
  it('uses the exact Word image ratio and can preview an editor marker selection', async () => {
    const compose = vi.fn(async () => new Uint8Array([137, 80, 78, 71]));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:word'), revokeObjectURL: vi.fn() });
    render(<VesselDiagramPreview config={config} section={section('Transducer')} markerIds={['transducer-fwd']} compose={compose} />);
    const image = await screen.findByRole('img', { name: '선박 위치도 미리보기' });
    expect(image).toHaveAttribute('width', '1600');
    expect(image).toHaveAttribute('height', '381');
    expect(image.parentElement).toHaveStyle({ aspectRatio: '1600 / 381' });
    expect(compose).toHaveBeenCalledWith(config, ['transducer-fwd']);
  });

  it('composes the active section markers and revokes replaced PNG URLs', async () => {
    const compose = vi.fn(async () => new Uint8Array([137, 80, 78, 71]));
    const createObjectURL = vi.fn(() => 'blob:preview');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const transducerSection = section('Transducer');
    const propellerSection = section('Propeller Blade');

    const { rerender, unmount } = render(
      <VesselDiagramPreview config={config} section={transducerSection} compose={compose} />,
    );

    await waitFor(() => expect(compose).toHaveBeenCalledWith(config, ['transducer-aft', 'transducer-fwd']));
    expect(await screen.findByRole('img', { name: '선박 위치도 미리보기' })).toHaveAttribute('src', 'blob:preview');

    rerender(<VesselDiagramPreview config={config} section={propellerSection} compose={compose} />);
    await waitFor(() => expect(compose).toHaveBeenLastCalledWith(config, ['propeller-group']));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview'));

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('shows the composition error instead of a stale diagram image', async () => {
    const compose = vi.fn(async () => {
      throw new Error('VESSEL_PNG_ENCODE_FAILED');
    });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() });

    render(<VesselDiagramPreview config={config} section={section('Anode / ICCP')} compose={compose} />);

    expect(await screen.findByText('선박 위치도를 만들지 못했습니다.')).toBeVisible();
    expect(screen.queryByRole('img', { name: '선박 위치도 미리보기' })).not.toBeInTheDocument();
  });
});
