# Underwater Report Builder 데모

Windows Chrome/Edge, 1440px 화면에 맞춘 로컬 전용 데모입니다.

## 실행

1. ZIP을 원하는 폴더에 풉니다.
2. `start-demo.cmd`를 더블클릭합니다.
3. Chrome 또는 Edge에서 `http://localhost:4173`이 열립니다.
4. 검은 PowerShell 창을 닫으면 데모가 종료됩니다.

ZIP에 실행 런타임이 포함되어 있어 별도 Node.js 설치나 서버 계정은 필요하지 않습니다. Windows가 실행 경고를 표시하면 파일 속성에서 차단 해제를 확인해 주세요.

## 빠른 확인 순서

1. IMO `9876543`으로 Vessel 확인
2. Service 선택 후 Scope 만들기
3. `사진 입력으로` 이동 후 `사진 폴더 선택`
4. 새 작업이면 `표준 폴더 구조 생성`, 기존 폴더면 `사진 불러오기` 선택
5. Report Input에서 BEFORE/AFTER Condition과 Report Use 확인
   - 잘못 배정한 사진은 `재배정`을 눌러 UNMATCHED로 되돌릴 수 있습니다.
6. Check / Preview에서 누락 패널과 자동 페이지 확인
7. PDF 준비 → PDF 다운로드

## 사진 폴더

하나의 사진 폴더 흐름을 사용합니다. 새 작업이면 선택한 폴더에 Section/Side/Unit/Phase 구조를 생성한 뒤 사진을 넣으세요. 기존 폴더라면 바로 사진을 불러오면 됩니다.

정확한 경로의 사진은 자동 매칭하고, 일치하지 않는 사진은 추측하지 않고 UNMATCHED로 남겨 Report Input에서 Section과 Phase를 직접 배정합니다.

Scope를 만든 뒤에는 선박과 Service가 고정됩니다. 바꾸려면 `Scope 초기화`를 눌러 사진과 입력 내용을 비운 뒤 다시 만드세요.

## 데이터와 성능

- Vessel DB는 데모 선박 확인에만 사용합니다.
- 보고서와 사진은 서버로 전송하거나 저장하지 않습니다.
- 새로고침하면 현재 작성 내용이 초기화됩니다.
- 원본 사진은 File 참조로 유지하며, 썸네일은 제한된 작업 큐에서 생성하고 사용 후 object URL을 정리합니다.
- Preview는 현재 페이지와 인접 페이지만 렌더링합니다.
- PDF 이미지는 한 장씩 순차 리사이즈합니다.

## Source 폴더

ZIP의 `source` 폴더에는 React/TypeScript 원본, 단위 테스트, 1440px Edge 자동 검증 스크립트, 설계 명세와 구현 계획이 들어 있습니다.
