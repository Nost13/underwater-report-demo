# Vessel Diagram and Zone Editor Design

Date: 2026-08-30
Status: Approved design

## Purpose

Add a vessel-side-view setup page to the underwater report generator. The operator uploads the side-view image for the current job, calibrates the vessel once, adjusts grouped zone markers, and reuses that configuration across every detailed report page. The generated Word report must preserve the supplied template layout while showing only the marker or markers that apply to each page.

## Goals

- Accept a different vessel side-view image for each report job.
- Minimize manual repositioning when images have different margins or scale.
- Calibrate length and height before adjusting individual markers.
- Group components that share a physical location so the operator moves one marker instead of several.
- Generate Bilge Keel markers from the configured quantity.
- Produce deterministic Word output without floating-shape drift.
- Keep all report data, uploaded images, and settings local to the current browser session.

## Non-goals

- Automatic computer-vision detection of vessel outlines.
- Persisting vessel drawings or marker layouts on a server.
- Editing markers independently after the Word file has been downloaded.
- Changing template typography, tables, photo slots, captions, headers, or footers.
- Supporting reversed side-view orientation. All images use stern-left and bow-right orientation.

## Workflow

The preparation flow becomes:

1. Vessel lookup and report particulars.
2. Service and Scope selection.
3. Vessel side-view setup.
4. Photo folder setup and import.
5. Report Input.
6. Check / Preview.
7. Word export.

The side-view setup page has three internal steps.

### 1. Hull calibration

The operator uploads a PNG or JPEG side view. The image is fitted without distortion into the report diagram canvas. Four draggable guide lines define:

- stern boundary;
- bow boundary;
- hull upper boundary;
- bottom line.

The system projects the default template geometry into this calibrated rectangle. It then generates the five Hull markers in stern-to-bow order:

1. AFT;
2. MID-AFT;
3. MID;
4. FWD-MID;
5. FWD.

The operator can move and resize each marker, reset a marker, or reapply the automatic layout. Once confirmed, the Hull calibration is locked before Niche editing begins. Returning to Hull calibration is allowed, but changing it reapplies the projection and warns that Niche positions will be recalculated.

### 2. Niche calibration

Niche markers are generated from the calibrated Hull rectangle. Only location groups used by the selected Scope are expanded by default; other groups remain available in a collapsed list.

Each marker can be dragged, resized, reset, and moved by keyboard in one-pixel increments. A group can contain one marker or a linked set of markers. Linked markers share one component mapping but keep independent coordinates.

### 3. Save configuration

The operator confirms the image and marker layout. The saved configuration is reused by Preview and Word export. The configuration remains local to the active browser report and is cleared when the report is reset.

## Niche location groups

| Group | Components | Marker behavior |
| --- | --- | --- |
| Propeller group | Propeller Blade, Fin Blade, Stern Frame, Rope Guard, Boss Cap | One shared stern marker |
| AFT services | Sea Chest, Discharge Pipe | One shared stern-area marker |
| Rudder group | Rudder & Pintle | One marker |
| FWD services | Bow Thruster | One bow-area marker |
| Bulbous Bow | Bulbous Bow | One bow marker |
| Transducer | Transducer | Two linked markers: one stern and one bow; both always render |
| Anode / ICCP | Anode / ICCP | Two linked markers: one stern and one bow; both always render |
| Bilge Keel | Bilge Keel | Quantity-driven centered marker set |

The mapping is based on the template's existing `Descr` zone metadata where present. Transducer deliberately retains both of its existing template locations. Anode / ICCP adds the user-approved stern-and-bow pair because the current template has no Anode / ICCP zone metadata. Legacy template tags for Stern Thruster and Emergency Sea Chest are not surfaced because those components are not part of the approved 12-item Niche Scope.

## Bilge Keel generation

Bilge Keel uses the quantity selected in Scope. If its Scope type does not include quantity, the effective quantity is `1`. PORT and STBD sections with the same unit number share the same side-view marker because the diagram represents a single vessel side profile.

The default Bilge Keel group is horizontally centered on the calibrated vessel midpoint:

`centerX = (sternX + bowX) / 2`

The default total marker span is 60 percent of calibrated vessel length, matching the approximate proportion in the supplied template. The operator can resize or move the complete group after automatic placement.

For quantity `N`:

- generate `N` equal-width markers within the group span;
- preserve a small equal gap between adjacent markers;
- number markers from stern to bow as `1..N`;
- for odd `N`, the middle marker is centered on `centerX`;
- for even `N`, the boundary between the two middle markers is centered on `centerX`;
- allow each generated marker to be adjusted independently after initial generation.

Changing the Scope quantity regenerates the default set and requires confirmation if previously adjusted Bilge Keel positions would be replaced.

## Coordinate model

All geometry is stored as normalized values rather than screen pixels.

```ts
interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HullCalibration {
  sternX: number;
  bowX: number;
  hullTopY: number;
  bottomY: number;
}

interface ZoneMarker {
  id: string;
  groupId: string;
  unit?: number;
  rect: NormalizedRect;
  shape: 'RECTANGLE' | 'ELLIPSE';
}

interface VesselDiagramConfig {
  imageFile: File;
  imageName: string;
  calibration: HullCalibration;
  hullMarkers: ZoneMarker[];
  nicheMarkers: ZoneMarker[];
  confirmed: boolean;
}
```

Normalized values are relative to the fixed report-diagram canvas, constrained to the range `0..1`. This keeps the editor, Preview, and Word output consistent at different display sizes.

The canonical composition canvas is `2048 x 488`, matching the aspect ratio and pixel dimensions of the supplied template's current vessel image. Uploaded images use `contain` fitting with a white background and are never stretched.

## Interaction rules

- Pointer and touch dragging move guides and markers.
- Visible resize handles change marker width and height.
- Arrow keys move a selected marker by one canvas pixel; Shift plus arrow moves by ten pixels.
- Coordinates and sizes are clamped to the diagram canvas.
- The active marker is visually distinct and its group/components appear in the side panel.
- Scope-relevant groups appear first.
- `Reset selected`, `Reset group`, and `Reapply automatic layout` are separate actions.
- Reapplying Hull calibration requires confirmation when manual Niche adjustments exist.
- The page shows a clear completion state only after an image, valid calibration, and all required Scope groups are present.

## Preview behavior

Check / Preview uses the same composition function as Word export. The preview for each report page includes:

- the uploaded side-view image;
- only the Hull or Niche marker set mapped to that page's section;
- both markers for Transducer pages;
- both markers for Anode / ICCP pages;
- the matching Bilge Keel unit marker for Bilge Keel pages;
- no marker from unrelated sections.

PORT and STBD pages use the same spatial marker while retaining their existing text labels and conditions.

## Word output

The browser composes a separate PNG for each Word phase page. Composition occurs on the canonical `2048 x 488` canvas.

For every generated page:

1. Draw the uploaded side-view image with `contain` fitting.
2. Resolve the page's component and unit to one or more markers.
3. Draw only the resolved markers using the template's red translucent visual treatment.
4. Encode the result as PNG.
5. Replace the page's existing vessel image relationship with the page-specific composite image.
6. Remove the template's floating zone shapes from that page fragment to prevent duplicate overlays.

The replacement image retains the template's existing inline drawing extent of approximately `5.89 x 1.40` inches. No surrounding paragraph, table, font, header, footer, caption, or photo-slot formatting is recreated or altered.

The final Word image and markers are intentionally flattened. Operators edit marker positions in the web application, not in Word.

## Component-to-marker resolution

Resolution is deterministic and isolated from display labels:

- General components resolve directly to one of the five Hull marker IDs.
- Propeller-related components resolve to `propeller-group`.
- Sea Chest and Discharge Pipe resolve to `aft-services`.
- Bow Thruster resolves to `fwd-services`.
- Transducer resolves to both `transducer-aft` and `transducer-fwd`.
- Anode / ICCP resolves to both `anode-aft` and `anode-fwd`.
- Rudder & Pintle resolves to `rudder-group`.
- Bulbous Bow resolves to `bulbous-bow`.
- Bilge Keel resolves by unit number to `bilge-keel-{unit}`.

Report label customization does not affect marker lookup. Lookup uses canonical component values from `ReportSection`.

## Validation and error handling

- Unsupported or unreadable image: reject the file and preserve the previous valid configuration.
- Missing image: block configuration confirmation and Word export with a direct message.
- Invalid calibration order: require `sternX < bowX` and `hullTopY < bottomY`.
- Marker outside canvas: clamp during interaction and reject invalid imported state.
- Missing required marker: show the affected Scope component and block export.
- Bilge Keel quantity mismatch: regenerate after explicit confirmation.
- Composition failure: stop Word export and identify the failed page instead of silently using the wrong diagram.
- Report reset: release object URLs and clear the image/configuration from memory.

## Testing strategy

### Unit tests

- Project default marker coordinates through arbitrary Hull calibration bounds.
- Clamp normalized coordinates and sizes.
- Generate odd and even Bilge Keel quantities around the vessel midpoint.
- Preserve stern-to-bow Bilge Keel numbering.
- Share Bilge Keel markers between PORT and STBD pages by unit.
- Resolve every canonical component to the correct marker group.
- Resolve Transducer and Anode / ICCP to two markers.
- Keep report-label overrides independent from marker lookup.

### Component tests

- Upload and replace a vessel image.
- Complete Hull calibration before Niche editing.
- Drag and resize a marker using pointer events.
- Move a selected marker with the keyboard.
- Reapply automatic layout with confirmation when adjustments exist.
- Regenerate Bilge Keel markers after a Scope quantity change.
- Clear the configuration on report reset.

### Word integration tests

- Replace the original template vessel image with a page-specific PNG.
- Preserve the original inline image extent.
- Remove all template floating zone shapes from rendered page fragments.
- Generate different composites for consecutive sections.
- Render two Transducer and two Anode / ICCP markers.
- Render only the matching Bilge Keel unit marker.
- Preserve existing fonts, text tokens, tables, captions, headers, footers, and photo slots.
- Preserve the current section 1-4 prepend behavior.

### Build and browser verification

- Run the focused test suites and portable production build.
- Verify the complete flow in the browser at the established maximum content width.
- Confirm pointer dragging, resizing, responsive controls, Preview parity, and downloaded Word output.

## Acceptance criteria

- A user can upload one side-view image and complete Hull then Niche calibration.
- A new side-view image requires only four guide adjustments before useful automatic placement.
- Same-location Niche components share marker geometry.
- Transducer and Anode / ICCP always display both stern and bow markers.
- Bilge Keel creates the Scope quantity, centered and evenly split.
- Preview and Word use identical page-marker resolution.
- The generated Word report uses the uploaded vessel image at the template's original size and location.
- No unrelated marker appears on a page.
- Existing report formatting and section 1-4 output remain unchanged.
