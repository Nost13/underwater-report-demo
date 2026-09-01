# Vessel Diagram Callout and Alignment Design

**Date:** 2026-09-02  
**Status:** Approved design

## Goal

Make the Niche positioning editor easier to use without changing the generated Word report. Marker labels must remain readable on a dense vessel side-view, and users must be able to select and align several markers precisely.

## Scope

- Increase the vessel diagram editing area to the full content width.
- Move supporting controls below the diagram so they do not reduce the canvas width.
- Replace marker-internal text with editor-only callout labels connected by leader lines.
- Add individual multi-selection with Ctrl+click and alignment/distribution tools.
- Preserve the existing vessel marker data format and Word output.

The callout labels and leader lines are editing aids only. They are not rendered in the preview image or exported Word document.

## Editor Layout

The Niche step uses one large, full-width diagram canvas. The vessel image and draggable markers remain in the center. Dedicated callout bands sit above and below the image so text does not cover the vessel drawing.

The current right-hand panel moves below the canvas as a compact control area. It keeps group selection, reset, auto-placement, navigation, and completion actions. When multiple markers are selected, an alignment toolbar appears immediately below the diagram and above the general controls.

The layout must fit the application's established 1440px content width without horizontal page overflow. Narrower screens may wrap the controls, but the diagram remains the primary full-width element.

## Callout Labels

Each marker keeps a compact icon/shape over the vessel image. A leader line runs from the marker to a separate text label in the upper or lower callout band. The line uses a short vertical segment and an elbow so labels can be shifted horizontally without obscuring their marker association.

Callout positions are derived from the current marker rectangles on every render:

1. Sort markers by horizontal center.
2. Assign them deterministically to upper and lower lanes.
3. Place labels in horizontal order with a minimum gap.
4. Shift labels within the canvas bounds to remove overlap.
5. Draw leader lines from marker centers to the final label positions.

Labels must be unambiguous. Paired markers use direction suffixes such as `Transducer FWD` and `Transducer AFT`; repeated Bilge Keel markers use numbered labels such as `Bilge Keel 01`.

Callout geometry is never stored in `VesselDiagramConfig`. Moving or aligning markers immediately recomputes it. Empty or invalid marker input produces no callout instead of breaking the editor.

## Selection and Movement

- Plain click selects one marker and clears the previous individual selection.
- Ctrl+click toggles that marker in the current selection. Meta+click may act as the equivalent shortcut on macOS.
- Existing group buttons continue to select the complete group.
- Escape clears all selected markers.
- Selection is visually clear on both the marker and its callout.
- The interactive hit area remains larger than the visible marker.

Dragging an unselected marker moves only that marker. Dragging any member of a multi-selection moves every selected marker by the same delta. Group movement is constrained using the combined selection bounds so no selected marker can leave the normalized diagram area.

## Alignment and Distribution

The toolbar appears when two or more markers are selected and provides:

- Align left, horizontal center, and right.
- Align top, vertical middle, and bottom.
- Distribute horizontally and vertically when three or more markers are selected.

Edge alignment uses the relevant outermost selected edge. Center/middle alignment uses the center of the selected bounding box. Distribution keeps the two outermost markers as anchors and gives the intermediate marker centers equal spacing. Marker sizes do not change. All resulting rectangles are clamped inside the diagram bounds.

After every alignment, distribution, or drag action, callout labels and leader lines reflow automatically.

## Architecture

Add a pure callout layout module under `src/vesselDiagram/` that accepts marker rectangles and display labels and returns label rectangles plus leader-line points. The editor renders leader lines in an absolute SVG layer with pointer events disabled and renders readable HTML labels above it. Interactive marker buttons remain in their existing layer.

Add a pure marker alignment module under `src/vesselDiagram/` for the six alignment modes, two distribution modes, and bounded group translation. `VesselDiagramEditor` owns only the temporary selected-marker IDs and delegates coordinate calculations to these helpers.

No callout fields are added to `ZoneMarker` or `VesselDiagramConfig`. The existing composer and preview pipeline continue receiving only marker geometry, ensuring the Word output remains unchanged.

## Validation and Testing

Unit tests cover:

- Deterministic callout ordering and lane assignment.
- Minimum label separation and in-bounds placement.
- Leader-line endpoints associated with the correct marker.
- All six alignment modes and both distribution modes.
- Marker-size preservation and boundary clamping.
- Bounded movement of a multi-selection.

Editor tests cover:

- Plain click, Ctrl+click toggle, group selection, and Escape clear.
- Alignment toolbar visibility and distribution enablement at three selected markers.
- Multi-marker dragging and immediate callout reflow.
- Unique paired/repeated marker labels.

Browser verification covers the 1440px layout, absence of horizontal overflow, readable non-overlapping callouts, and the unchanged marker-only preview/export behavior.

## Acceptance Criteria

- Dense Niche markers can be identified without overlapping text on the vessel image.
- Users can select arbitrary markers with Ctrl+click and align or distribute them.
- Selected markers can be moved together and remain inside the image bounds.
- Callouts update automatically and are never saved or exported.
- Existing saved diagrams remain compatible.
- Existing Word report appearance and marker output are unchanged.
