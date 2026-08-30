# Task 6 report — page-specific vessel Preview

## Implementation

- Added `VesselDiagramPreview`, which resolves canonical marker IDs from the page section, composes a PNG through the shared compositor, renders it in the existing Word-template diagram frame, and revokes every generated object URL on replacement and unmount.
- Displays the existing frame while composing and renders `선박 위치도를 만들지 못했습니다.` without retaining an old image if composition fails.
- Replaced `TemplateShipDiagram` only for `first` Word-template preview pages. Continuation pages remain unchanged. `CheckPreview` and `WordTemplatePreviewPage` now receive the confirmed vessel-diagram configuration.
- Added App-level Preview assertions for Propeller, Transducer, Anode / ICCP, and Bilge Keel units 1 and 2. The test changes a Word label before asserting canonical marker IDs.
- Repaired and formatted the compositor’s narrow canvas typing boundary. Browser canvas drawing, marker style/order, and PNG encoding behavior are unchanged; the fake canvas context now declares its style members.
- Mocked the compositor and thumbnail boundary only in the App rendering test: marker calls remain asserted, while `VesselDiagramPreview` itself is tested with an injected compositor for both image and error behavior. This avoids jsdom attempting unavailable real-canvas work without suppressing console output.

## TDD evidence

### RED

Command:

```powershell
& '..\..\node_modules\.bin\vitest.CMD' run src/app/VesselDiagramPreview.test.tsx
```

Relevant output before implementation:

```text
FAIL src/app/VesselDiagramPreview.test.tsx
Error: Failed to resolve import "./VesselDiagramPreview" ... Does the file exist?
Test Files 1 failed (1)
Tests no tests
```

The failure was expected because the new preview component had not yet been created.

### GREEN

Command:

```powershell
& '..\..\node_modules\.bin\vitest.CMD' run src/app/VesselDiagramPreview.test.tsx src/vesselDiagram/composer.test.ts src/vesselDiagram/markers.test.ts --reporter=verbose
```

Output:

```text
Test Files 3 passed (3)
Tests 27 passed (27)
```

The App page-isolation case was also run directly after its UI selector corrections:

```powershell
& '..\..\node_modules\.bin\vitest.CMD' run src/App.test.tsx -t "composes Preview pages" --reporter=verbose
```

```text
Test Files 1 passed (1)
Tests 1 passed | 43 skipped (44)
```

## Focused verification

Command:

```powershell
& '..\..\node_modules\.bin\vitest.CMD' run src/app/VesselDiagramPreview.test.tsx src/App.test.tsx src/vesselDiagram/composer.test.ts src/vesselDiagram/markers.test.ts --reporter=verbose
```

Observed coverage: 71 tests across 4 files (27 compositor/marker/preview tests plus 44 App workflow tests), with no test failures or jsdom canvas warnings from the new preview boundary.

## Typecheck and lint

```powershell
& '..\..\node_modules\.bin\eslint.CMD' src/App.tsx src/App.test.tsx src/app/VesselDiagramPreview.tsx src/app/VesselDiagramPreview.test.tsx src/vesselDiagram/composer.ts src/vesselDiagram/composer.test.ts
& '..\..\node_modules\.bin\tsc.CMD' --noEmit
```

Both commands exited successfully with no output.

## Self-review

- Confirmed `TemplateShipDiagram` is removed and only first pages instantiate `VesselDiagramPreview`.
- Confirmed the component uses the same `resolveMarkerIds` and `composeVesselDiagram` path as the export integration.
- Confirmed success, failure, URL-replacement, and unmount cleanup behavior are covered.
- Confirmed compositor marker fill/stroke/order and PNG-byte assertions remain exact.
- Ran `git diff --check`; no whitespace errors.

## Concerns

None. The page-isolation workflow test is intentionally end-to-end and takes about six seconds; it has a local 15-second timeout to accommodate its five explicit photo additions.
