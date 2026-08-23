import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('desktop report workflow', () => {
  it('verifies a vessel, creates the fixed GENERAL scope, and opens photo input', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.clear(screen.getByLabelText('IMO number'));
    await user.type(screen.getByLabelText('IMO number'), '9876543');
    await user.click(screen.getByRole('button', { name: 'Vessel 확인' }));
    expect(screen.getAllByText('M.V. PACIFIC AURORA').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    expect(screen.getByText('15 SECTIONS')).toBeVisible();
    expect(screen.getByLabelText('Service')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Scope 초기화' }));
    expect(screen.getByLabelText('Service')).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    await user.click(screen.getByRole('button', { name: '사진 입력으로' }));
    expect(screen.getByRole('heading', { name: '사진 폴더' })).toBeVisible();
  });

  it('shows editable AFTER CLEAN/R0 separately in Report Input', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Vessel 확인' }));
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    await user.click(screen.getByRole('button', { name: 'Report Input 바로가기' }));
    expect(screen.getByRole('heading', { name: 'Report Input' })).toBeVisible();
    expect(screen.getByLabelText('AFTER condition')).toHaveValue('CLEAN');
    expect(screen.getByLabelText('AFTER rating')).toHaveValue('R0');
    await user.selectOptions(screen.getByLabelText('AFTER rating'), 'R1');
    expect(screen.getByLabelText('AFTER rating')).toHaveValue('R1');
  });

  it('uses one photo-folder flow with optional structure creation after selection', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Vessel 확인' }));
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    await user.click(screen.getByRole('button', { name: '사진 입력으로' }));

    expect(screen.getByRole('heading', { name: '사진 폴더' })).toBeVisible();
    expect(screen.queryByText('OneDrive ‘사진’ 폴더')).not.toBeInTheDocument();
    expect(screen.queryByText('기존 사진 폴더')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 폴더 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '표준 폴더 구조 생성' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '사진 불러오기' })).toBeDisabled();
  });

  it('runs the local PDF exporter from the final stage', async () => {
    const user = userEvent.setup();
    render(<App exporter={async () => ({ skipped: [] })} />);
    await user.click(screen.getByRole('button', { name: 'Vessel 확인' }));
    await user.click(screen.getByRole('button', { name: 'Scope 만들기' }));
    await user.click(screen.getByRole('button', { name: 'Report Input 바로가기' }));
    await user.click(screen.getByRole('button', { name: 'Check / Preview' }));
    await user.click(screen.getByRole('button', { name: 'PDF 준비' }));
    await user.click(screen.getByRole('button', { name: 'PDF 다운로드' }));
    expect(await screen.findByText('PDF 다운로드가 완료되었습니다.')).toBeVisible();
  });

  it('keeps a directory-input fallback for browsers without the folder picker API', () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toHaveAttribute('webkitdirectory');
  });
});
