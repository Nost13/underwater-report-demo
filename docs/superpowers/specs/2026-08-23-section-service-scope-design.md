# Section-level Service Scope Design

## Goal

Allow one underwater report to contain different services on individual GENERAL and NICHE targets while keeping the number of clicks low. GENERAL keeps its fixed 5 × 3 physical layout, but unassigned cells do not become report sections.

## Core model

`ScopeTarget` represents a physical target and stores zero or more service assignments. `ReportSection` represents one service performed on one physical target. Scope creation expands every assigned target/service pair into a unique report section.

```ts
interface ScopeTarget {
  id: string;
  area: 'GENERAL' | 'NICHE';
  component: string;
  side?: Side;
  unit?: number;
  services: ServiceKind[];
}

interface ReportSection {
  id: string;       // POLISHING/GENERAL/MID/PORT
  targetId: string; // GENERAL/MID/PORT
  service: ServiceKind;
  // existing phase and condition fields
}
```

GENERAL has 15 available `ScopeTarget` records at all times. Only targets with at least one service are expanded into `ReportSection` records. A NICHE component creates targets according to SINGLE, SIDE, QUANTITY, or SIDE_QUANTITY and initially assigns the currently active service to all created targets.

## Interaction model

The active service is a persistent, color-coded brush. Clicking a target's main surface replaces its current single-service assignment with the active service. A small add action appends the active service without replacing existing services, supporting multiple jobs on the same physical target. Individual service chips can be removed.

GENERAL exposes `전체`, `PORT`, `STBD`, and `BOTTOM` presets. Presets apply the active service only to unassigned targets; they never overwrite existing assignments. `모두 해제` clears GENERAL assignments. `실행 취소` restores the immediately previous GENERAL assignment state.

NICHE uses the same target interaction. Adding a component applies the active service to every generated side/unit target, after which exceptions can be replaced or appended one target at a time.

The scope summary shows counts by service and the number of unassigned GENERAL targets. `Scope 만들기` is enabled only when the vessel is verified and at least one target has a service.

## Service and phase rules

- INSPECTION creates CURRENT only.
- CLEANING, POLISHING, REPAIR, and REMOVAL create BEFORE and AFTER.
- AFTER starts as editable CLEAN/R0.
- Conditions remain independent per phase and report section.

## Identifiers and folder matching

Report section IDs include service so the same physical target can safely appear more than once. The existing `PhotoData` model remains unchanged; `sectionId` points to the service-aware report section ID.

The standard folder hierarchy remains `AREA / COMPONENT / SIDE / UNIT / PHASE` when path plus phase identifies exactly one section. If two services on the same target share a phase, those ambiguous assignments use `SERVICE / AREA / COMPONENT / SIDE / UNIT / PHASE`. Import matching accepts both forms and returns UNMATCHED whenever the path does not identify exactly one section.

## Downstream behavior

Report Input, QA, pagination, captions, preview, and PDF continue to operate per report section. The section service is displayed alongside its physical label. PDF headers and file names derive their service summary from the included sections rather than a single report-wide service.

## Error prevention

- The active service remains visible above all target selectors.
- Bulk presets do not overwrite assigned targets.
- Replacing and appending are separate controls.
- Exact path ambiguity always becomes UNMATCHED.
- Scope editing is locked after creation until Scope is reset, preserving existing report-state behavior.

## Acceptance criteria

1. GENERAL starts with 15 available but zero assigned targets.
2. A report can contain Polishing on selected cells and Inspection on other cells.
3. A physical target can contain both Inspection and Polishing as separate report sections.
4. GENERAL presets fill only unassigned targets and undo restores the last state.
5. NICHE defaults all generated targets to the active service and permits per-target exceptions.
6. Service rules generate CURRENT or BEFORE/AFTER correctly, with AFTER CLEAN/R0.
7. Exact photo folders auto-match; ambiguous folders remain UNMATCHED.
8. QA, pagination, preview, and PDF treat each service-aware section independently.
9. The PC layout remains optimized for Windows Chrome/Edge at 1440px.

