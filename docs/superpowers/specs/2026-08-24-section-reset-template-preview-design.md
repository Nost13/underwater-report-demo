# Section Phase Reset and Word Template Preview Design

## Goal

Report Input에서 다른 Section으로 이동할 때 사진 배정 Phase를 해당 Section의 첫 Phase로 초기화하고, Report Check의 간이 미리보기를 실제 Detail Report Word 템플릿 구조에 맞는 A4 세로 미리보기로 교체한다.

## Approved Behavior

- Cleaning, Polishing, Repair, Removal Section으로 이동하면 사진 배정 대상은 `BEFORE`로 시작한다.
- Inspection Section으로 이동하면 사진 배정 대상은 `CURRENT`로 시작한다.
- 같은 Section 안에서 사용자가 선택한 Phase는 Section을 떠나기 전까지 유지한다.
- 상단 Section 탭, 이전/다음 버튼, 전체 Section 목록, Report Check Section 선택 등 모든 Section 변경 경로에서 동일한 규칙을 사용한다.
- Report Preview는 `buildWordPhasePages()`의 결과를 사용하여 최종 Word와 같은 Phase 순서와 페이지 용량을 따른다.
- 첫 페이지는 상세 제목, 작업명, 위치도 영역, Condition 표와 2×2 사진 슬롯을 표시한다.
- 연속 페이지는 동일한 문서 머리글과 구역 제목 아래에 Word 양식의 2×3 사진 슬롯을 표시한다.
- 빈 사진 슬롯은 회색 영역과 `N/A` 캡션으로 표시한다.
- Fouling/Observed Rating 색상은 Word 출력과 동일한 0~5 색상표를 사용한다.
- Preview는 현재 선택한 Section의 모든 Word 페이지를 한 번에 보여준다.
- Job No.는 현재 입력 모델에 없으므로 `—`로 표시한다.

## Data and Layout Source

- Word 페이지 순서·분할·Condition 값: `src/docx/reportModel.ts`
- 최종 문서 템플릿: `public/templates/Detail_report_template.docx`
- 화면 미리보기는 최종 DOCX 생성 엔진을 대체하지 않으며, 브라우저에서 템플릿 구조와 배치를 확인하기 위한 표현이다.

## Verification

- Section 이동 후 일반 작업은 BEFORE, Inspection은 CURRENT가 선택되는 컴포넌트 테스트
- Word 페이지 모델을 사용하는 A4 Preview의 제목, Condition, 작업명, 슬롯 수 테스트
- 전체 Vitest, ESLint, portable/site build 실행
- 1440px 브라우저에서 Section 이동과 Preview 시각 검증
- GitHub Pages 배포 후 공개 URL에서 재확인
