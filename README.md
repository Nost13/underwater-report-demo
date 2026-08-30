# Underwater Report Builder 데모

Windows Chrome/Edge, 1440px 화면에 맞춘 로컬 전용 데모입니다.

## 실행

1. ZIP을 원하는 폴더에 풉니다.
2. `start-demo.cmd`를 더블클릭합니다.
3. Chrome 또는 Edge에서 `http://localhost:4173`이 열립니다.
4. 검은 PowerShell 창을 닫으면 데모가 종료됩니다.

ZIP에 실행 런타임이 포함되어 있어 별도 Node.js 설치나 서버 계정은 필요하지 않습니다. Windows가 실행 경고를 표시하면 파일 속성에서 차단 해제를 확인해 주세요.

## 빠른 확인 순서

1. **Vessel / Scope** — IMO `9876543`으로 Vessel 확인 후 작업 브러시로 GENERAL/NICHE 작업을 배정하고 Scope를 만듭니다.
   - `전체/PORT/STBD/BOTTOM 적용`으로 빠르게 채우고, 예외 위치만 클릭해 변경합니다.
   - 한 위치에 여러 작업이 있으면 작은 `+` 버튼으로 작업을 추가합니다.
2. **Vessel Diagram** — 로컬 선박 사이드뷰 PNG/JPG를 넣고 **Hull 맞추기**에서 선미·선수·상단·Bottom 기준선을 먼저 맞춘 뒤 **Niche 맞추기**로 이동합니다. Hull을 확정하기 전에는 Niche 위치를 확정할 수 없습니다.
3. **사진 폴더** — 새 작업이면 `표준 폴더 구조 생성`, 기존 폴더면 `사진 불러오기`를 선택합니다.
4. **Report Input** — BEFORE/AFTER 또는 CURRENT Condition과 Report Use를 확인합니다. 사진을 넣을 Phase의 `이곳에 배정` 버튼을 먼저 누른 뒤 UNMATCHED 사진을 배정하고, 잘못 배정한 사진은 `이동`하거나 완전히 `삭제`할 수 있습니다.
5. **Check / Preview** — 누락 패널과 자동 페이지를 확인합니다.
6. **Word** — Word 준비 → Word 보고서 다운로드를 선택합니다.

## 선박 위치도

- 선박 사이드뷰 이미지는 이 브라우저 탭에서만 사용됩니다. 보고서 생성에도 이미지는 서버로 전송하거나 저장하지 않습니다.
- Transducer와 Anode / ICCP는 선미·선수의 연결된 두 표식을 함께 사용합니다. Propeller 계열은 하나의 공유 표식을 사용합니다.
- Bilge Keel은 Scope 수량에 맞춰 Unit 표식이 자동으로 만들어지며, 각 Unit의 상세 페이지에는 해당 Unit 표식만 표시됩니다.
- Preview와 Word에는 편집 가능한 떠 있는 표식이 아니라, 각 상세 페이지의 Section에 맞춰 합성한 평면 PNG 선박 위치도가 들어갑니다.

## 사진 폴더

하나의 사진 폴더 흐름을 사용합니다. 새 작업이면 선택한 폴더에 Section/Side/Unit/Phase 구조를 생성한 뒤 사진을 넣으세요. 기존 폴더라면 바로 사진을 불러오면 됩니다.

정확한 경로의 사진은 자동 매칭하고, 일치하지 않는 사진은 추측하지 않고 UNMATCHED로 남겨 Report Input에서 Section과 Phase를 직접 배정합니다.

각 Section은 자체 Service를 가집니다. Inspection은 CURRENT, Cleaning/Polishing/Repair/Removal은 BEFORE/AFTER로 자동 구성되며 AFTER는 CLEAN/R0에서 시작해 수정할 수 있습니다. 같은 위치에 phase가 겹치는 여러 Service가 있으면 생성 폴더 앞에 Service가 자동으로 추가되어 모호함을 막습니다.

Scope를 만든 뒤에는 선박과 작업 배정이 고정됩니다. 바꾸려면 `Scope 초기화`를 눌러 사진과 입력 내용을 비운 뒤 다시 만드세요.

## 데이터와 성능

- Vessel DB는 데모 선박 확인에만 사용합니다.
- 보고서와 사진은 서버로 전송하거나 저장하지 않습니다.
- 새로고침하면 현재 작성 내용이 초기화됩니다.
- 원본 사진은 File 참조로 유지하며, 썸네일은 제한된 작업 큐에서 생성하고 사용 후 object URL을 정리합니다.
- Preview는 현재 페이지와 인접 페이지만 렌더링합니다.
- Word 이미지는 한 장씩 순차 리사이즈합니다.

## Word 보고서

- 앱에 포함된 `section1_4_template.docx`에 선박·작업 정보를 먼저 기입하고, 이어서 `Detail_report_template.docx`의 상세 사진 페이지를 붙여 하나의 `.docx` 파일을 브라우저 안에서 생성합니다.
- 템플릿의 머리글과 바닥글은 변경하지 않습니다.
- Cleaning/Polishing/Repair/Removal은 각 Section에서 BEFORE 페이지를 먼저, AFTER 페이지를 뒤에 만듭니다. Inspection은 CURRENT 페이지만 만듭니다.
- 첫 Phase 페이지에는 사진 4장, 이어지는 페이지에는 6장씩 순서대로 배치합니다.
- Fouling Coverage는 실제 백분율을 입력하고, `Slime Only` 여부에 따라 Type과 Rating이 자동 결정됩니다. Observed는 `Normal / Trace (R1)`에서 시작합니다.
- 원본 사진과 작성 내용은 Word 생성 과정에서도 서버로 전송되지 않습니다.

## Source 폴더

ZIP의 `source` 폴더에는 React/TypeScript 원본, 단위 테스트, 1440px Edge 자동 검증 스크립트, 설계 명세와 구현 계획이 들어 있습니다.
