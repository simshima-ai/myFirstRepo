# Touch Mode Enter Audit

## Scope
- Source of truth: `cad/` (development files)
- Target: remove "Enter-only" confirmation paths when `touchMode` is ON

## A. Global Enter handlers (highest impact)

1. `cad/app_input.js:1290`
- Condition: polyline or line(continuous)
- Current Enter action: `helpers.finalizePolylineDraft()`
- Touch-mode replacement: show persistent `確定` button in top context for polyline/continuous line.

2. `cad/app_input.js:1297`
- Condition: line(freehand / B-spline)
- Current Enter action: `finalizeBsplineDraft()`
- Touch-mode replacement: show `Bスプライン確定` button near freehand controls.

3. `cad/app_input.js:1304`
- Condition: dim chain draft
- Current Enter action:
  - first Enter: switch to placement (`awaitingPlacement=true`)
  - second Enter: finalize
- Touch-mode replacement: split buttons:
  - `配置位置を指定` (step transition)
  - `寸法確定` (finalize)

4. `cad/app_input.js:1317`
- Condition: fillet tool
- Current Enter action: commit fillet from hover if 2 selections
- Touch-mode replacement: `フィレット実行` button (always visible in fillet context when conditions satisfied).

5. `cad/app_input.js:1331`
- Condition: doubleline tool
- Current Enter action: `helpers.executeDoubleLine?.()`
- Touch-mode replacement: keep/ensure `適用` button as primary action (already exists), remove Enter dependency in guidance text for touch mode.

## B. Input-field Enter handlers (medium impact)

1. Layer/Group text fields
- `cad/ui.js:1792` new layer name -> add layer
- `cad/ui.js:1803` rename layer
- `cad/ui.js:1832` rename group
- `cad/ui.js:1880` new group from selection
- Touch-mode replacement: rely on existing adjacent buttons only (no Enter requirement).

2. Selection/vertex move numeric fields
- `cad/ui.js:2314` select move dx/dy Enter -> apply move
- `cad/ui.js:2341` vertex move dx/dy Enter -> apply move
- Touch-mode replacement: ensure `移動` button is always visible and visually primary.

3. Shape parameter fields
- `cad/ui.js:2379` line len/angle Enter -> apply line inputs
- `cad/ui.js:2408` rect w/h Enter -> apply rect inputs
- `cad/ui.js:2452` circle radius Enter -> apply radius
- `cad/ui.js:2483` fillet radius Enter -> apply fillet
- `cad/ui.js:2562` selection circle radius Enter -> apply radius
- Touch-mode replacement: treat existing apply buttons as primary; add missing apply button where absent.

## C. Text/help/status strings mentioning Enter (low impact but required)

- `cad/ui.js:3346,3348,3353,3363,3365,3369,3379,3381,3453`
- `cad/app_input.js:543,592,753`
- `cad/app_tools.js:1412,1557`

Touch-mode replacement:
- if `touchMode` ON, show guidance without Enter wording and refer to button labels (`適用`, `確定`).

## Proposed rollout

1. Phase 1 (safe)
- Add touch-mode-only confirm buttons for A items.
- Keep Enter handlers for keyboard users.

2. Phase 2 (consistency)
- For B items, make buttons primary and remove Enter-centric helper text in touch mode.

3. Phase 3 (cleanup)
- Update all Enter-related help/status strings to dual-mode text (keyboard vs touch).
