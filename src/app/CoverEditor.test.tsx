import { fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverEditor } from './CoverEditor';
import { createCoverInfo, type CoverInfo } from './coverInfo';
import { emptyReportInfo } from './reportInfo';
import type { ReportSection } from '../domain/types';

const section: ReportSection = { id: 'rope', targetId: 'rope', area: 'NICHE', component: 'Rope', service: 'REMOVAL', phases: ['BEFORE', 'AFTER'], conditions: {} };
const info = emptyReportInfo();
it('selects performers for automatic descriptions without overwriting manual wording',()=>{
 render(<Harness/>);
 fireEvent.change(screen.getByLabelText('Rope Removal 수행 주체'),{target:{value:'ROV'}});
 expect(screen.getByLabelText('Scope of Work description')).toHaveValue('Rope removal was carried out using an ROV.');
 fireEvent.change(screen.getByLabelText('Scope of Work description'),{target:{value:'Manual wording'}});
 fireEvent.change(screen.getByLabelText('Rope Removal 수행 주체'),{target:{value:'DIVER'}});
 expect(screen.getByLabelText('Scope of Work description')).toHaveValue('Manual wording');
 fireEvent.click(screen.getByRole('button',{name:'자동 내용 다시 적용'}));
 expect(screen.getByLabelText('Scope of Work description')).toHaveValue('Rope removal was carried out by divers.');
});
info.vessel.name = 'VESSEL TEST';
info.vessel.jobNo = 'Us-2609';
function Harness({ initial = createCoverInfo() }: { initial?: CoverInfo }) {
  const [value, onChange] = useState(initial);
  return <><CoverEditor value={value} onChange={onChange} reportInfo={info} sections={[section]} onBack={() => {}} onNext={() => {}} onEditReportInfo={() => {}} /><output data-testid="state">{JSON.stringify(value)}</output></>;
}
const state = () => JSON.parse(screen.getByTestId('state').textContent!);
let active: Set<string>;
beforeEach(() => {
  active = new Set();
  let id = 0;
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => { const url = 'blob:cover-' + ++id; active.add(url); return url; });
    static revokeObjectURL = vi.fn((url: string) => active.delete(url));
  });
  class PointerEventMock extends MouseEvent {
    pointerId: number;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  vi.stubGlobal('PointerEvent', PointerEventMock);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Cover editor', () => {
  it('uses the measured Word hero frame aspect ratio for the interactive crop preview', () => {
    render(<Harness />);
    expect(screen.getByLabelText('사진 초점 조정')).toHaveStyle({ aspectRatio: '3026 / 1551' });
  });
  it('identifies Cover as the exact third workflow step', () => {
    render(<Harness />);

    expect(screen.getByText('STEP 03', { selector: '.step-kicker' })).toBeVisible();
  });

  it('selects, replaces and clears its own photo with no leaked URLs under StrictMode', () => {
    const view = render(<StrictMode><Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'first.jpg'), crop: { focusX: .2, focusY: .8, zoom: 2 } }} /></StrictMode>);
    expect(active.size).toBe(1);
    const currentUrl = [...active][0];
    fireEvent.change(screen.getByLabelText('Date of Issue'), { target: { value: '2027-01-02' } });
    expect([...active]).toEqual([currentUrl]);
    expect(screen.getByAltText('표지 사진 미리보기')).toHaveAttribute('src', currentUrl);
    const picker = screen.getByLabelText('표지 사진');
    fireEvent.change(picker, { target: { files: [new File(['b'], 'second.jpg', { type: 'image/jpeg' })] } });
    expect(screen.getByAltText('표지 사진 미리보기')).toHaveAttribute('src', [...active][0]);
    expect(active.size).toBe(1);
    expect(state().crop).toEqual({ focusX: .5, focusY: .5, zoom: 1 });
    fireEvent.click(screen.getByRole('button', { name: '사진 비우기' }));
    expect(screen.queryByAltText('표지 사진 미리보기')).not.toBeInTheDocument();
    expect(active.size).toBe(0);
    fireEvent.change(picker, { target: { files: [new File(['c'], 'third.jpg', { type: 'image/jpeg' })] } });
    view.unmount();
    expect(active.size).toBe(0);
  });
  it('updates zoom and pans the visible photo with pointer deltas, clamped to crop bounds', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg') }} />);
    const zoom = screen.getByLabelText('사진 확대');
    expect(zoom).toHaveAttribute('min', '1');
    expect(zoom).toHaveAttribute('max', '3');
    fireEvent.change(zoom, { target: { value: '2' } });
    expect(state().crop.zoom).toBe(2);
    const banner = screen.getByLabelText('사진 초점 조정');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(banner, { clientX: 300, clientY: 200, button: 0 });
    fireEvent.pointerMove(banner, { clientX: 340, clientY: 220 });
    expect(state().crop).toEqual({ focusX: .4, focusY: .4, zoom: 2 });
    fireEvent.pointerMove(banner, { clientX: 900, clientY: 1_000 });
    expect(state().crop).toEqual({ focusX: 0, focusY: 0, zoom: 2 });
    fireEvent.pointerUp(banner);
    fireEvent.pointerMove(banner, { clientX: 100, clientY: 300 });
    expect(state().crop.focusX).toBe(0);
  });
  it('does not start a crop drag for a non-primary pointer', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg') }} />);
    const banner = screen.getByLabelText('사진 초점 조정');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(banner, { pointerId: 2, isPrimary: false, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(banner, { pointerId: 2, clientX: 240, clientY: 120 });
    expect(banner).toHaveStyle({ cursor: 'grab' });
    expect(state().crop).toEqual({ focusX: .5, focusY: .5, zoom: 1 });
  });
  it('keeps the original pointer drag active when a competing pointer goes down', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg') }} />);
    const banner = screen.getByLabelText('사진 초점 조정');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(banner, { pointerId: 1, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerDown(banner, { pointerId: 2, clientX: 300, clientY: 100, button: 0 });
    fireEvent.pointerMove(banner, { pointerId: 2, clientX: 340, clientY: 100 });
    expect(state().crop).toEqual({ focusX: .5, focusY: .5, zoom: 1 });
    expect(banner).toHaveStyle({ cursor: 'grabbing' });
    fireEvent.pointerMove(banner, { pointerId: 1, clientX: 240, clientY: 120 });
    expect(state().crop).toEqual({ focusX: .4, focusY: .4, zoom: 1 });
  });
  it('ignores non-active pointer termination while the captured pointer continues panning', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg') }} />);
    const banner = screen.getByLabelText('사진 초점 조정');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(banner, { pointerId: 1, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerUp(banner, { pointerId: 2 });
    fireEvent.pointerCancel(banner, { pointerId: 2 });
    fireEvent.lostPointerCapture(banner, { pointerId: 2 });
    expect(banner).toHaveStyle({ cursor: 'grabbing' });
    fireEvent.pointerMove(banner, { pointerId: 1, clientX: 240, clientY: 120 });
    expect(state().crop).toEqual({ focusX: .4, focusY: .4, zoom: 1 });
  });
  it('ends active cancel or lost capture and permits a new drag', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg') }} />);
    const banner = screen.getByLabelText('사진 초점 조정');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(banner, { pointerId: 1, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerCancel(banner, { pointerId: 1 });
    expect(banner).toHaveStyle({ cursor: 'grab' });
    fireEvent.pointerDown(banner, { pointerId: 2, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(banner, { pointerId: 2, clientX: 240, clientY: 120 });
    expect(state().crop).toEqual({ focusX: .4, focusY: .4, zoom: 1 });
    fireEvent.lostPointerCapture(banner, { pointerId: 2 });
    expect(banner).toHaveStyle({ cursor: 'grab' });
    fireEvent.pointerDown(banner, { pointerId: 3, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(banner, { pointerId: 3, clientX: 240, clientY: 120 });
    expect(state().crop).toMatchObject({ zoom: 1 });
    expect(state().crop.focusX).toBeCloseTo(.3);
    expect(state().crop.focusY).toBeCloseTo(.3);
  });
  it('uses the default cursor while no photo can be cropped', () => {
    render(<Harness />);
    const banner = screen.getByLabelText('사진 초점 조정');
    expect(banner).toHaveAttribute('tabindex', '-1');
    expect(banner).toHaveStyle({ cursor: 'auto' });
  });
  it('retains focus-visible arrow-key crop adjustments after pointer panning', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg') }} />);
    const banner = screen.getByLabelText('사진 초점 조정');
    expect(banner).toHaveAttribute('tabindex', '0');
    expect(banner).toHaveStyle({ cursor: 'grab' });
    fireEvent.pointerDown(banner, { clientX: 200, clientY: 100, button: 0 });
    expect(banner).toHaveStyle({ cursor: 'grabbing' });
    fireEvent.pointerUp(banner);
    fireEvent.keyDown(banner, { key: 'ArrowRight' });
    fireEvent.keyDown(banner, { key: 'ArrowDown' });
    expect(state().crop).toEqual({ focusX: .52, focusY: .52, zoom: 1 });
  });
  it('keeps manual scope until explicit regeneration and edits issue date', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Scope of Work title'), { target: { value: 'Custom title' } });
    fireEvent.change(screen.getByLabelText('Scope of Work description'), { target: { value: 'Custom text' } });
    expect(state().scopeMode).toBe('MANUAL');
    fireEvent.change(screen.getByLabelText('Date of Issue'), { target: { value: '2026-09-04' } });
    expect(state().issueDate).toBe('2026-09-04');
    fireEvent.click(screen.getByRole('button', { name: '자동 내용 다시 적용' }));
    expect(state()).toMatchObject({ scopeMode: 'AUTO', scopeTitle: 'Rope Removal', scopeDescription: '' });
  });
  it('positions the zoomed preview at the saved source rectangle after clamped panning', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg'), crop: { focusX: .5, focusY: .5, zoom: 2 } }} />);
    const image = screen.getByAltText('표지 사진 미리보기');
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    fireEvent.load(image);
    expect(image).toHaveStyle({ objectPosition: '50% 50%', transformOrigin: '50% 50%', transform: 'scale(2)' });
    const banner = screen.getByLabelText('사진 초점 조정');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(banner, { clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(banner, { clientX: 600, clientY: 300 });
    expect(image).toHaveStyle({ objectPosition: '0% 0%', transformOrigin: '0% 0%', transform: 'scale(2)' });
  });
  it('shows linked values and keeps a fixed A4 preview with blank missing metadata', () => {
    const edit = vi.fn();
    render(<CoverEditor value={createCoverInfo()} onChange={vi.fn()} reportInfo={info} sections={[]} onBack={vi.fn()} onNext={vi.fn()} onEditReportInfo={edit} />);
    const preview = screen.getByLabelText('A4 표지 미리보기');
    expect(within(preview).getByText('VESSEL TEST')).toBeVisible();
    expect(within(preview).getByText('Us-2609')).toBeVisible();
    expect(within(preview).getByText('IMO NUMBER').nextElementSibling).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: 'Report Information 수정' }));
    expect(edit).toHaveBeenCalledOnce();
  });
});
