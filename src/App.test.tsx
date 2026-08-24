import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

async function verifyVessel(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText('IMO number'));
  await user.type(screen.getByLabelText('IMO number'), '9876543');
  await user.click(screen.getByRole('button', { name: 'Vessel 확인' }));
}

async function buildCleaningGeneral(user: ReturnType<typeof userEvent.setup>) {
  await verifyVessel(user);
  await user.click(screen.getByRole('button', { name: '전체 적용' }));
  await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
}

describe('desktop report workflow', () => {
  it('keeps the photo workflow disabled until a Scope exists', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('button', { name: '사진 폴더 선택' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '샘플 사진 7장 불러오기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Report Input으로', exact: true })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Report Input$/ }));
    expect(screen.getByRole('heading', { name: 'Vessel / Scope' })).toBeVisible();
  });

  it('assigns GENERAL by Service brush without overwriting exceptions and supports undo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);

    expect(screen.getByRole('button', { name: 'Scope 만들기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cleaning 작업 선택' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: '전체 적용' }));
    expect(screen.getByText('CLEANING 15')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Inspection 작업 선택' }));
    await user.click(screen.getByRole('button', { name: 'AFT STBD 작업 배정' }));
    expect(screen.getByLabelText('AFT STBD 배정 상태')).toHaveTextContent('CLEANING');
    expect(screen.getByLabelText('AFT STBD 배정 상태')).toHaveTextContent('INSPECTION');

    await user.click(screen.getByRole('button', { name: '전체 적용' }));
    expect(screen.getByLabelText('FWD PORT 배정 상태')).toHaveTextContent('CLEANING');
    expect(screen.getByLabelText('AFT STBD 배정 상태')).toHaveTextContent('INSPECTION');

    await user.click(screen.getByRole('button', { name: '실행 취소' }));
    expect(screen.getByLabelText('AFT STBD 배정 상태')).toHaveTextContent('CLEANING');
    await user.click(screen.getByRole('button', { name: 'AFT STBD 작업 배정' }));
    await user.click(screen.getByRole('button', { name: 'AFT STBD CLEANING 제거' }));
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));

    expect(screen.getByText('15 SECTIONS')).toBeVisible();
    expect(screen.getByText('CLEANING 14')).toBeVisible();
    expect(screen.getByText('INSPECTION 1')).toBeVisible();
  });

  it('adds and removes the active Service by clicking the same GENERAL target', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);
    await user.click(screen.getByRole('button', { name: '전체 적용' }));
    await user.click(screen.getByRole('button', { name: 'Inspection 작업 선택' }));
    const inspectionToggle = screen.getByRole('button', { name: 'FWD PORT 작업 배정' });
    expect(inspectionToggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(inspectionToggle);
    expect(screen.getByLabelText('FWD PORT 배정 상태')).toHaveTextContent('CLEANING');
    expect(screen.getByLabelText('FWD PORT 배정 상태')).toHaveTextContent('INSPECTION');

    const inspectionRemoveToggle = screen.getByRole('button', { name: 'FWD PORT 작업 해제' });
    expect(inspectionRemoveToggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(inspectionRemoveToggle);
    expect(screen.getByLabelText('FWD PORT 배정 상태')).toHaveTextContent('CLEANING');
    expect(screen.getByLabelText('FWD PORT 배정 상태')).not.toHaveTextContent('INSPECTION');

    await user.click(screen.getByRole('button', { name: 'FWD PORT 작업 배정' }));
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    expect(screen.getByText('16 SECTIONS')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'FWD PORT 작업 추가' })).not.toBeInTheDocument();
  });

  it('shows a photo-folder next action as soon as Scope is built', async () => {
    const user = userEvent.setup();
    render(<App />);

    await buildCleaningGeneral(user);

    expect(screen.getByRole('button', { name: '사진 폴더로 이동' })).toBeVisible();
  });

  it('applies the active Service to NICHE units and allows a combined Unit Scope', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);
    await user.click(screen.getByRole('button', { name: 'Polishing 작업 선택' }));
    await user.selectOptions(screen.getByLabelText('Niche component'), 'Propeller Blade');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '3');
    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));

    expect(screen.getByLabelText('PROPELLER BLADE UNIT 03 배정 상태'))
      .toHaveTextContent('POLISHING');
    await user.click(screen.getByRole('button', { name: 'Inspection 작업 선택' }));
    await user.click(screen.getByRole('button', {
      name: 'PROPELLER BLADE UNIT 03 작업 배정',
    }));
    expect(screen.getByLabelText('PROPELLER BLADE UNIT 03 배정 상태'))
      .toHaveTextContent('POLISHING');
    expect(screen.getByLabelText('PROPELLER BLADE UNIT 03 배정 상태'))
      .toHaveTextContent('INSPECTION');

    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    expect(screen.getByText('6 SECTIONS')).toBeVisible();
    expect(screen.getByText('POLISHING 4')).toBeVisible();
    expect(screen.getByText('INSPECTION 2')).toBeVisible();
  });

  it('prepares a four-blade Propeller draft when Polishing is selected', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);

    await user.selectOptions(screen.getByLabelText('Niche component'), 'Boss Cap');
    await user.click(screen.getByRole('button', { name: 'Polishing 작업 선택' }));

    expect(screen.getByLabelText('Niche component')).toHaveValue('Propeller Blade');
    expect(screen.getByLabelText('Niche type')).toHaveValue('QUANTITY');
    expect(screen.getByLabelText('Quantity')).toHaveValue(4);
  });

  it('limits Polishing assignment to Propeller and Boss Cap while keeping Inspection available elsewhere', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);

    await user.click(screen.getByRole('button', { name: 'Polishing 작업 선택' }));

    expect([...screen.getByLabelText<HTMLSelectElement>('Niche component').options]
      .map((option) => option.value)).toEqual(['Propeller Blade', 'Boss Cap']);
    expect(screen.getByRole('button', { name: '전체 적용' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'FWD PORT 작업 배정' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Inspection 작업 선택' }));

    expect(screen.getByRole('button', { name: '전체 적용' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Sea Chest' })).toBeVisible();
  });

  it('adds the Propeller Polishing set with Boss Cap Polishing and Rope Guard Inspection', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);
    await user.click(screen.getByRole('button', { name: 'Polishing 작업 선택' }));

    expect(screen.getByText('자동 세트: Propeller Polishing + Boss Cap Polishing + Rope Guard Inspection'))
      .toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));

    expect(screen.getByLabelText('PROPELLER BLADE UNIT 04 배정 상태'))
      .toHaveTextContent('POLISHING');
    expect(screen.getByLabelText('BOSS CAP 배정 상태')).toHaveTextContent('POLISHING');
    expect(screen.getByLabelText('ROPE GUARD 배정 상태')).toHaveTextContent('INSPECTION');
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    expect(screen.getByText('6 SECTIONS')).toBeVisible();
    expect(screen.getByText('POLISHING 5')).toBeVisible();
    expect(screen.getByText('INSPECTION 1')).toBeVisible();
  });

  it('merges Inspection into the existing Propeller Polishing targets', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);
    await user.click(screen.getByRole('button', { name: 'Polishing 작업 선택' }));
    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));
    await user.click(screen.getByRole('button', { name: 'Inspection 작업 선택' }));
    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));

    expect(screen.getAllByRole('button', { name: 'Propeller Blade 삭제' })).toHaveLength(1);
    expect(screen.getByLabelText('PROPELLER BLADE UNIT 01 배정 상태'))
      .toHaveTextContent('POLISHING');
    expect(screen.getByLabelText('PROPELLER BLADE UNIT 01 배정 상태'))
      .toHaveTextContent('INSPECTION');
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    expect(screen.getByText('10 SECTIONS')).toBeVisible();
    expect(screen.getByText('POLISHING 5')).toBeVisible();
    expect(screen.getByText('INSPECTION 5')).toBeVisible();
  });

  it('shows and clears the paired Fin Blade option only for a Polishing Propeller', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);

    expect(screen.queryByRole('checkbox', { name: 'Fin Blade 포함' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Polishing 작업 선택' }));
    const finBlade = screen.getByRole('checkbox', { name: 'Fin Blade 포함' });
    expect(finBlade).toBeVisible();
    await user.click(finBlade);
    expect(finBlade).toBeChecked();

    await user.selectOptions(screen.getByLabelText('Niche component'), 'Boss Cap');
    expect(screen.queryByRole('checkbox', { name: 'Fin Blade 포함' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Niche component'), 'Propeller Blade');
    expect(screen.getByRole('checkbox', { name: 'Fin Blade 포함' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Cleaning 작업 선택' }));
    expect(screen.queryByRole('checkbox', { name: 'Fin Blade 포함' })).not.toBeInTheDocument();
  });

  it('adds Propeller and Fin Blade with one shared Polishing quantity', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);
    await user.click(screen.getByRole('button', { name: 'Polishing 작업 선택' }));
    await user.click(screen.getByRole('checkbox', { name: 'Fin Blade 포함' }));
    await user.click(screen.getByRole('button', { name: '수량 증가' }));
    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));

    expect(screen.getByLabelText('PROPELLER BLADE UNIT 05 배정 상태'))
      .toHaveTextContent('POLISHING');
    expect(screen.getByLabelText('FIN BLADE UNIT 05 배정 상태'))
      .toHaveTextContent('POLISHING');
    expect(screen.getByLabelText('BOSS CAP 배정 상태')).toHaveTextContent('POLISHING');
    expect(screen.getByLabelText('ROPE GUARD 배정 상태')).toHaveTextContent('INSPECTION');
    expect(screen.getAllByLabelText(/PROPELLER BLADE UNIT \d{2} 배정 상태/)).toHaveLength(5);
    expect(screen.getAllByLabelText(/FIN BLADE UNIT \d{2} 배정 상태/)).toHaveLength(5);
  });

  it('uses visible quantity controls for side-less Fin Blade units', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);
    await user.selectOptions(screen.getByLabelText('Niche component'), 'Fin Blade');

    expect(screen.getByLabelText('Quantity')).toHaveValue(4);
    await user.click(screen.getByRole('button', { name: '수량 증가' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue(5);
    await user.click(screen.getByRole('button', { name: '수량 감소' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue(4);

    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));
    expect(screen.getByLabelText('FIN BLADE UNIT 04 배정 상태')).toBeVisible();
    expect(screen.queryByLabelText('FIN BLADE PORT UNIT 01 배정 상태')).not.toBeInTheDocument();
  });

  it('keeps the quantity buttons within the 1 to 12 range', async () => {
    const user = userEvent.setup();
    render(<App />);
    const decrease = screen.getByRole('button', { name: '수량 감소' });
    const increase = screen.getByRole('button', { name: '수량 증가' });

    await user.click(decrease);
    expect(screen.getByLabelText('Quantity')).toHaveValue(1);
    expect(decrease).toBeDisabled();

    for (let count = 0; count < 11; count += 1) await user.click(increase);
    expect(screen.getByLabelText('Quantity')).toHaveValue(12);
    expect(increase).toBeDisabled();
  });

  it('merges a repeated NICHE addition into the existing physical target', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);
    await user.selectOptions(screen.getByLabelText('Niche component'), 'Boss Cap');
    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));
    await user.click(screen.getByRole('button', { name: 'Inspection 작업 선택' }));
    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));
    expect(screen.getAllByRole('button', { name: 'Boss Cap 삭제' })).toHaveLength(1);
    expect(screen.getByLabelText('BOSS CAP 배정 상태')).toHaveTextContent('CLEANING');
    expect(screen.getByLabelText('BOSS CAP 배정 상태')).toHaveTextContent('INSPECTION');
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    expect(screen.getByText('2 SECTIONS')).toBeVisible();
  });

  it('shows AFTER Clean condition and derives its fouling rating from entered coverage', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));
    expect(screen.getByRole('heading', { name: 'Report Input' })).toBeVisible();
    expect(screen.getByLabelText('AFTER fouling coverage')).toHaveValue(0);
    expect(screen.getByLabelText('AFTER fouling rating')).toHaveTextContent('R0');
    await user.clear(screen.getByLabelText('AFTER fouling coverage'));
    await user.type(screen.getByLabelText('AFTER fouling coverage'), '4');
    expect(screen.getByLabelText('AFTER fouling rating')).toHaveTextContent('R2');
  });

  it('uses a Slime Only toggle to derive Micro fouling from entered coverage', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    const coverage = screen.getByLabelText('BEFORE fouling coverage');
    await user.type(coverage, '37');
    await user.click(screen.getByLabelText('BEFORE Slime Only'));

    expect(coverage).toHaveValue(37);
    expect(screen.getByLabelText('BEFORE fouling rating')).toHaveTextContent('R1');
    expect(screen.getByLabelText('BEFORE fouling type')).toHaveTextContent('Micro fouling');
  });

  it('applies a group Condition, preserves a child override, and can revert it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    const groupCoverage = screen.getByLabelText('구역 기본 BEFORE fouling coverage');
    await user.clear(groupCoverage);
    await user.type(groupCoverage, '15');
    await user.click(screen.getByRole('button', { name: 'BEFORE 기본값 적용' }));
    expect(screen.getByLabelText('BEFORE fouling coverage')).toHaveValue(15);
    expect(within(screen.getByLabelText('BEFORE 사진 갤러리')).getByText('기본값 사용'))
      .toBeVisible();

    await user.click(screen.getByRole('button', { name: '다음 Section' }));
    const childCoverage = screen.getByLabelText('BEFORE fouling coverage');
    expect(childCoverage).toHaveValue(15);
    await user.clear(childCoverage);
    await user.type(childCoverage, '40');
    expect(within(screen.getByLabelText('BEFORE 사진 갤러리')).getByText('개별 수정'))
      .toBeVisible();

    await user.click(screen.getByRole('button', { name: '이전 Section' }));
    await user.clear(screen.getByLabelText('구역 기본 BEFORE fouling coverage'));
    await user.type(screen.getByLabelText('구역 기본 BEFORE fouling coverage'), '20');
    await user.click(screen.getByRole('button', { name: 'BEFORE 기본값 적용' }));
    await user.click(screen.getByRole('button', { name: '다음 Section' }));
    expect(screen.getByLabelText('BEFORE fouling coverage')).toHaveValue(40);

    await user.click(screen.getByRole('button', { name: 'BEFORE 기본값으로 되돌리기' }));
    expect(screen.getByLabelText('BEFORE fouling coverage')).toHaveValue(20);
    expect(within(screen.getByLabelText('BEFORE 사진 갤러리')).getByText('기본값 사용'))
      .toBeVisible();
  });

  it('offers separate photo-add actions for the selected Section BEFORE and AFTER phases', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    expect(screen.getByRole('button', { name: 'BEFORE에 사진 추가' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'AFTER에 사진 추가' })).toBeVisible();
  });

  it('uses a phase-colored header target and Condition edits do not change it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    const before = screen.getByRole('button', { name: 'BEFORE 현재 사진 배정 위치' });
    expect(before).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('BEFORE 사진 갤러리')).toHaveClass('selected');

    await user.clear(screen.getByLabelText('AFTER fouling coverage'));
    await user.type(screen.getByLabelText('AFTER fouling coverage'), '4');
    expect(before).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'AFTER 이곳에 사진 배정' }));
    expect(screen.getByRole('button', { name: 'AFTER 현재 사진 배정 위치' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('AFTER 사진 갤러리')).toHaveClass('selected');
  });

  it('selects a photo target from the Phase background without hijacking nested controls', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    const afterPanel = screen.getByLabelText('AFTER 사진 갤러리');
    await user.click(afterPanel);
    expect(afterPanel).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'AFTER 현재 사진 배정 위치' }))
      .toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByLabelText('BEFORE fouling coverage'));
    expect(afterPanel).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'BEFORE 이곳에 사진 배정' }))
      .toHaveAttribute('aria-pressed', 'false');

    const beforePanel = screen.getByLabelText('BEFORE 사진 갤러리');
    await user.type(within(beforePanel).getByLabelText('BEFORE fouling coverage'), '10');
    await user.click(within(beforePanel).getByText('Slime Only'));
    expect(afterPanel).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'BEFORE 이곳에 사진 배정' }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('shows only the active Section issues beside the group Condition and focuses their Phase', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    const sectionCheck = screen.getByLabelText('현재 Section 점검');
    expect(sectionCheck).not.toHaveAttribute('aria-live');
    expect(within(sectionCheck).getByLabelText('현재 Section 점검 요약'))
      .toHaveAttribute('aria-live', 'polite');
    expect(sectionCheck).toHaveTextContent('현재 Section 오류');
    expect(sectionCheck).toHaveTextContent('FWD · PORT');
    expect(sectionCheck).not.toHaveTextContent('FWD · STBD');

    await user.click(within(sectionCheck).getByRole('button', {
      name: /AFTER 사진 없음.*AFTER Phase 확인/,
    }));

    expect(screen.getByLabelText('현재 사진 배정 위치')).toHaveTextContent('AFTER');
    expect(screen.getByLabelText('AFTER 사진 갤러리')).toHaveClass('selected');
  });

  it('opens any Report Section with one click and keeps sequential arrows', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    const first = screen.getByRole('button', {
      name: 'CLEANING/GENERAL/FWD/PORT Section 열기',
    });
    expect(first).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '이전 Section' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '전체 Section 목록 열기' }));
    const picker = screen.getByRole('dialog', { name: '전체 Section' });
    await user.type(within(picker).getByRole('searchbox', { name: 'Section 검색' }), 'AFT BOTTOM');
    await user.click(within(picker).getByRole('button', {
      name: 'CLEANING AFT · BOTTOM Section 열기',
    }));
    expect(screen.getByText('CLEANING/GENERAL/AFT/BOTTOM')).toBeVisible();
    expect(screen.getByRole('button', { name: '다음 Section' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '이전 Section' }));
    expect(screen.getByRole('button', {
      name: 'CLEANING/GENERAL/AFT/STBD Section 열기',
    })).toHaveAttribute('aria-current', 'page');
  });

  it('assigns an UNMATCHED photo to the phase clicked in Report Input', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await buildCleaningGeneral(user);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['photo'], 'manual.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    expect(screen.queryByLabelText('UNMATCHED 사진 배정')).not.toBeInTheDocument();
    const unmatchedButton = screen.getByRole('button', { name: 'UNMATCHED 1' });
    expect(unmatchedButton).toBeEnabled();

    await user.click(unmatchedButton);
    expect(screen.getByLabelText('UNMATCHED 사진 배정')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'AFTER 이곳에 사진 배정' }));
    expect(screen.getByLabelText('현재 사진 배정 위치')).toHaveTextContent('AFTER');
    await user.click(screen.getByRole('button', { name: 'manual.jpg 사진 배정' }));
    expect(screen.queryByLabelText('UNMATCHED 사진 배정')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'UNMATCHED 0' })).toBeDisabled();
    expect(screen.getByLabelText('AFTER 사진 갤러리')).toHaveTextContent('manual.jpg');
  });

  it('advances folder, structure, and import progress only after each action succeeds', async () => {
    const user = userEvent.setup();
    class MemoryDirectory {
      kind = 'directory' as const;
      children = new Map<string, MemoryDirectory>();
      constructor(public name = '사진') {}
      async getDirectoryHandle(name: string) {
        const child = this.children.get(name) ?? new MemoryDirectory(name);
        this.children.set(name, child);
        return child;
      }
      async *entries(): AsyncGenerator<[string, MemoryDirectory]> {
        yield* this.children.entries();
      }
    }
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => new MemoryDirectory()));
    const { container } = render(<App />);
    await buildCleaningGeneral(user);

    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('사진 폴더를 선택하세요');
    await user.click(screen.getByRole('button', { name: '사진 폴더 선택' }));
    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('폴더 선택 완료 · 사진');
    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('폴더 구조를 아직 생성하지 않음');

    await user.click(screen.getByRole('button', { name: '표준 폴더 구조 생성' }));
    expect(screen.getByLabelText('사진 입력 진행 상태'))
      .toHaveTextContent('구조 생성 완료 · 15 Sections / 30 Phase folders');

    const fallback = container.querySelector('input[type="file"][webkitdirectory]') as HTMLInputElement;
    await user.upload(fallback, new File(['photo'], 'manual.jpg', { type: 'image/jpeg' }));
    expect(screen.getByLabelText('사진 입력 진행 상태'))
      .toHaveTextContent('사진 불러오기 완료 · 1장 · 표준 폴더 경로 없음 · 0장 자동 매칭 · UNMATCHED 1장');
    vi.unstubAllGlobals();
  });

  it('marks a completed fallback import clearly in the photo-folder step', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await buildCleaningGeneral(user);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, new File(['photo'], 'manual.jpg', { type: 'image/jpeg' }));

    expect(screen.getByLabelText('사진 입력 진행 상태'))
      .toHaveTextContent('사진 불러오기 완료 · 1장 · 표준 폴더 경로 없음');
  });

  it('shows a bounded Section rail and jumps through the searchable full list', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));

    const navigator = screen.getByRole('navigation', { name: 'Report Section 바로가기' });
    expect(within(navigator).getAllByRole('button', { name: /Section 열기$/ })).toHaveLength(5);
    expect(within(navigator).getByText('SECTION 1 / 15')).toBeVisible();

    await user.click(within(navigator).getByRole('button', { name: '전체 Section 목록 열기' }));
    const picker = screen.getByRole('dialog', { name: '전체 Section' });
    await user.type(within(picker).getByRole('searchbox', { name: 'Section 검색' }), 'AFT BOTTOM');
    await user.click(within(picker).getByRole('button', { name: /CLEANING AFT · BOTTOM Section 열기/ }));

    expect(screen.queryByRole('dialog', { name: '전체 Section' })).not.toBeInTheDocument();
    expect(within(navigator).getByText('SECTION 15 / 15')).toBeVisible();
    expect(screen.getByLabelText('현재 사진 배정 위치')).toHaveTextContent('AFT · BOTTOM');
  });

  it('edits one Word label set shared by every Propeller Blade Unit', async () => {
    const user = userEvent.setup();
    render(<App />);
    await verifyVessel(user);
    await user.click(screen.getByRole('button', { name: 'Polishing 작업 선택' }));
    await user.click(screen.getByRole('button', { name: 'Niche 추가' }));
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));
    await user.click(screen.getByRole('button', { name: '다음 Section' }));

    await user.click(screen.getByRole('button', { name: '보고서 표기 설정' }));
    const settings = screen.getByRole('dialog', { name: '보고서 표기 설정' });
    expect(within(settings).getByLabelText('상위 구역명')).toHaveValue('PROPELLER');
    expect(within(settings).getByLabelText('상세 제목')).toHaveValue('PROPELLER BLADE');
    expect(within(settings).getByLabelText('사진 캡션')).toHaveValue('Propeller Blade');
    await user.clear(within(settings).getByLabelText('상위 구역명'));
    await user.type(within(settings).getByLabelText('상위 구역명'), 'PROPULSION');
    expect(within(settings).getByLabelText('Word 표기 미리보기'))
      .toHaveTextContent('NICHE AREAS & COMPONENTS / PROPULSION');
    await user.click(within(settings).getByRole('button', { name: '표기 설정 닫기' }));

    await user.click(screen.getByRole('button', { name: '다음 Section' }));
    await user.click(screen.getByRole('button', { name: '보고서 표기 설정' }));
    expect(screen.getByLabelText('상위 구역명')).toHaveValue('PROPULSION');
  });

  it('auto-matches a pre-existing standard folder path without creating the tree first', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await buildCleaningGeneral(user);
    const input = container.querySelector('input[type="file"][webkitdirectory]') as HTMLInputElement;
    const photo = new File(['photo'], 'existing.jpg', { type: 'image/jpeg' });
    Object.defineProperty(photo, 'webkitRelativePath', {
      configurable: true,
      value: '기존사진/GENERAL/FWD/PORT/BEFORE/existing.jpg',
    });

    await user.upload(input, photo);

    expect(screen.getByLabelText('사진 입력 진행 상태'))
      .toHaveTextContent('표준 폴더 경로 감지 · 1장 자동 매칭 · UNMATCHED 0장');
  });

  it('styles photo action controls consistently', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));
    await user.click(screen.getByRole('button', { name: 'BEFORE에 사진 추가' }));
    const manualInput = container.querySelector('input[type="file"]:not([webkitdirectory])') as HTMLInputElement;
    await user.upload(manualInput, new File(['photo'], 'manual.jpg', { type: 'image/jpeg' }));

    expect(screen.getByRole('checkbox', { name: 'manual.jpg Report Use' }))
      .toHaveClass('switch-input');
    const move = screen.getAllByRole('button', { name: /이동$/ })[0];
    const remove = screen.getAllByRole('button', { name: /삭제$/ })[0];
    expect(move).toHaveClass('photo-action-button', 'move');
    expect(remove).toHaveClass('photo-action-button', 'danger');
    await user.click(move);
    expect(screen.getByRole('button', { name: '이동 완료' })).toHaveClass('move-confirm');
    expect(screen.getByRole('button', { name: '이동 취소' })).toHaveClass('move-cancel');
    expect(screen.getByText('삭제는 보고서 참조만 제거하며 원본 파일은 유지됩니다.'))
      .toBeVisible();
  });

  it('resets a cancelled photo move to the current Section and Phase', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));
    await user.click(screen.getByRole('button', { name: 'BEFORE에 사진 추가' }));
    const manualInput = container.querySelector('input[type="file"]:not([webkitdirectory])') as HTMLInputElement;
    await user.upload(manualInput, new File(['photo'], 'manual.jpg', { type: 'image/jpeg' }));

    await user.click(screen.getByRole('button', { name: 'manual.jpg 이동' }));
    await user.selectOptions(
      screen.getByLabelText('manual.jpg 이동 Section'),
      'CLEANING/GENERAL/FWD/STBD',
    );
    await user.selectOptions(screen.getByLabelText('manual.jpg 이동 Phase'), 'AFTER');
    await user.click(screen.getByRole('button', { name: '이동 취소' }));

    await user.click(screen.getByRole('button', { name: 'manual.jpg 이동' }));
    expect(screen.getByLabelText('manual.jpg 이동 Section'))
      .toHaveValue('CLEANING/GENERAL/FWD/PORT');
    expect(screen.getByLabelText('manual.jpg 이동 Phase')).toHaveValue('BEFORE');
  });

  it('uses one photo-folder flow with optional structure creation after selection', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);

    expect(screen.getByRole('heading', { name: '사진 폴더' })).toBeVisible();
    expect(screen.queryByText('OneDrive ‘사진’ 폴더')).not.toBeInTheDocument();
    expect(screen.queryByText('기존 사진 폴더')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 폴더 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '표준 폴더 구조 생성' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '사진 불러오기' })).toBeDisabled();
  });

  it('shows the photo-folder sequence and concrete scope before import', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);

    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('사진 폴더 선택');
    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('표준 폴더 구조 생성');
    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('선분류');
    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('사진 불러오기');
    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('후분류');
    expect(screen.getByLabelText('현재 작업 범위')).toHaveTextContent('CLEANING');
    expect(screen.getByLabelText('현재 작업 범위')).toHaveTextContent('GENERAL · 15개 구역 · BEFORE / AFTER');
    expect(screen.getByLabelText('현재 작업 범위')).toHaveTextContent('총 15개 Section · 30개 사진 폴더');
    expect(screen.getByLabelText('사진 입력 진행 상태')).toHaveTextContent('사진 폴더를 선택하세요');
  });

  it('keeps Scope and photo-folder classification on the same setup page', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);

    expect(screen.getByRole('heading', { name: 'Vessel / Scope' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '사진 폴더' })).toBeVisible();
    expect(screen.getByRole('button', { name: /01.*준비/ })).toBeVisible();
    expect(screen.getAllByText('선분류').length).toBeGreaterThan(0);
    expect(screen.getAllByText('후분류').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('현재 작업 범위')).toHaveTextContent('CLEANING');
    expect(screen.getByLabelText('현재 작업 범위')).toHaveTextContent('GENERAL · 15개 구역 · BEFORE / AFTER');
  });

  it('runs the local Word exporter from the final stage', async () => {
    const user = userEvent.setup();
    const exporter = vi.fn(async () => ({ skipped: [], pageCount: 0, blob: new Blob() }));
    render(<App exporter={exporter} />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));
    await user.click(screen.getByRole('button', { name: 'Check / Preview' }));
    await user.click(screen.getByRole('button', { name: 'Word 준비' }));
    await user.click(screen.getByRole('button', { name: 'Word 보고서 다운로드' }));
    expect(await screen.findByText('Word 보고서 다운로드가 완료되었습니다.')).toBeVisible();
    expect(exporter).toHaveBeenCalledWith(expect.objectContaining({
      vesselName: 'M.V. PACIFIC AURORA',
      templateUrl: 'templates/Detail_report_template.docx',
    }));
  });

  it('collapses Report Check by default and shows all preview pages in one view', async () => {
    const user = userEvent.setup();
    render(<App />);
    await buildCleaningGeneral(user);
    await user.click(screen.getByRole('button', { name: 'Report Input으로' }));
    await user.click(screen.getByRole('button', { name: 'Check / Preview' }));

    const reportCheck = screen.getByRole('button', { name: /Report Check.*issues/ });
    expect(reportCheck).toBeVisible();
    expect(screen.queryByText('MISSING PHASE PHOTO')).not.toBeInTheDocument();
    await user.click(reportCheck);
    expect(screen.getAllByText('MISSING PHASE PHOTO').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('전체 Report Preview')).toBeVisible();
  });

  it('keeps a directory-input fallback for browsers without the folder picker API', () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('webkitdirectory');
  });
});
