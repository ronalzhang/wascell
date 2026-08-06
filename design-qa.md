# ARKSOMA Production Frontend Design QA

## Comparison target

- Source visual truth:
  - `.codex-tmp/arksoma-regression-audit/08-prototype-hero-1024x1536.png`
  - `.codex-tmp/arksoma-regression-audit/04-prototype-itinerary-cards.png`
  - `prototype/arksoma-v2.html`
- Rendered implementation: `http://localhost:3013/`
- Implementation evidence:
  - `.codex-tmp/arksoma-production-qa/04-hero-1024x1536.png`
  - `.codex-tmp/arksoma-production-qa/09-itinerary-postfix-1366x1024.png`
  - `.codex-tmp/arksoma-production-qa/01-mobile-390x844.png`
  - `.codex-tmp/arksoma-production-qa/02-mobile-period-sheet.png`
  - `.codex-tmp/arksoma-production-qa/07-advisor-form-390x844.png`
  - `.codex-tmp/arksoma-production-qa/08-advisor-success-390x844.png`
- Combined comparison evidence:
  - `.codex-tmp/arksoma-production-qa/compare-hero.png`
  - `.codex-tmp/arksoma-production-qa/compare-itinerary.png`
- Browser density: `deviceScaleFactor: 1`; source and implementation captures use equal CSS and pixel sizes for each comparison.
- States: hero resting state, period sheet open, origin story open, itinerary direct anchor, advisor form, advisor success, standard period and filial period.

## Responsive verification

| Viewport | Document width | Result |
| --- | ---: | --- |
| 390 × 844 | 390 | no horizontal overflow |
| 430 × 932 | 430 | no horizontal overflow |
| 768 × 1024 | 768 | no horizontal overflow |
| 1024 × 1366 | 1024 | no horizontal overflow |
| 1024 × 1536 | 1024 | no horizontal overflow |
| 1366 × 1024 | 1366 | no horizontal overflow |

## Required fidelity surfaces

- **Fonts and typography:** Bodoni/Didot-style ARKSOMA lockup, Songti display hierarchy and restrained sans-serif body copy preserve the approved contrast. Phone typography scales without clipping; the 390px hero title remains two intentional lines.
- **Spacing and layout rhythm:** hero controls retain the approved 430px maximum width while becoming fluid on phones. The itinerary matches the reference card widths, alternating order, borders and section rhythm. Dialogs use bounded viewport widths and internal scrolling.
- **Colors and tokens:** black, ivory, bronze and muted emerald tokens match the source direction. Membership content uses the same low-noise black/gold treatment instead of a promotional card style.
- **Image quality and asset fidelity:** the supplied stone/cellular hero and cellular field assets are used directly. All five itinerary images are real landscape raster assets with `object-fit: cover`; no full-screen stretching, placeholders, CSS drawings or custom SVG substitutes are present.
- **Copy and content:** hero shows coordinates only; the English origin title is inside the story panel. Appointment-only membership, first 12-month inclusion, professional preparation, limited-resource boundary, continuity rights and configurable renewal fee are present. Filial period copy avoids public six-person capacity disclosure.
- **Icons:** no non-standard icons are required by the approved target; text controls match the source.
- **Accessibility and motion:** semantic buttons/links, labels, alt text, visible focus, Escape close, focus return, body lock and reduced-motion fallback are present.

## Primary interaction verification

- Period trigger opens a fixed, scrollable modal; close restores focus.
- Coordinate trigger contains only the coordinate values; the origin panel contains `ORIGIN · THE STONE OF LONGEVITY` and the story.
- Five itinerary cards render with natural landscape imagery; the filial route renders gentler itinerary copy.
- Advisor form validates required contact data and attachment count/type/size limits.
- One submit creates a backend order and changes to the dedicated success view with order ID and selected period; no email or second customer action is used.
- `/api/public/catalog` hydrates the standard/filial price and annual-seat copy while retaining safe static fallbacks.
- Browser console after the interaction run: no errors or warnings.

## Comparison history

1. **Initial pass — blocked**
   - [P1] Direct navigation to `#itinerary` left the heading and cards at reveal opacity, making the approved card layout appear almost black.
   - Fix: removed reveal gating from the itinerary heading and cards while retaining motion on the hero and narrative sections.
2. **Post-fix pass — passed**
   - At 1366 × 1024, itinerary heading and card opacity are `1`; the first two alternating cards match the source composition, image crop and text hierarchy.
   - At all six viewports, `documentElement.scrollWidth === innerWidth`.
3. **Responsive and motion polish — passed (2026-08-01)**
   - Initial anonymous visits to `/admin` and `/admin-pro` now show a quiet login state; the expiry message is reserved for a session that was previously authenticated.
   - The closing promise stays on one line from 375px phone width through 1440px desktop width; 390, 768, 1024 and 1440px all report zero public-page overflow.
   - Major sections use proximity scroll snapping, while long itinerary content remains freely scrollable. Journey images receive a restrained view-entry focus animation where supported.
   - Coordinate light trace runs once on touch/coarse-pointer devices (and narrow QA viewports), returns to its resting bronze state, and is disabled by reduced-motion preferences.
   - Advisor form shows selected period, configured price and included annual seat before submission; the success view intentionally contains no price because it confirms receipt, not purchase or medical acceptance.
   - Evidence: `.codex-tmp/arksoma-polish-audit/closing-390-after.png`, `.codex-tmp/arksoma-polish-audit/closing-ipad-after.png`, `.codex-tmp/arksoma-polish-audit/closing-desktop-after.png`, `.codex-tmp/arksoma-polish-audit/advisor-price-mobile.png`.
4. **Coordinate glyph glow and continuity framing — passed (2026-08-01)**
   - The old coordinate underline, external trace and `ENTER` hint are absent. On a fresh 390px entry, the warm highlight is clipped to the coordinate glyphs, runs once for `0.9s` after the entry delay and returns to bronze. The story panel still opens, closes and restores focus to the coordinate trigger.
   - The advisor context now reads `单次细胞服务 · 九月首期 / RMB 580,000` followed by `三次起可制定连续方案 · 首年方舟席位已含`. The success state remains price-free.
   - At 390, 768, 1024 and 1440px, the document has zero horizontal overflow. The closing price and continuity copy also have `scrollWidth === clientWidth` at 390 and 1024px.
   - The 390px before/after coordinate and advisor captures were inspected together. The accepted result removes the visual line and adds the continuity message inside the existing information hierarchy rather than adding a promotional module.
   - Console log after the local interaction and responsive run: empty.
   - Accepted evidence: `.codex-tmp/arksoma-continuity-qa/06-coordinate-final-mid-390.png`, `.codex-tmp/arksoma-continuity-qa/07-advisor-final-390.png`, `.codex-tmp/arksoma-continuity-qa/08-advisor-final-768.png`, `.codex-tmp/arksoma-continuity-qa/09-advisor-final-1440.png`.
   - Commercial verification distinguishes the existing filial-period configured price from a continuity discount: public copy does not expose `RMB 560,000/次`, a discount percentage, savings amount, multi-service total or six-service tier.
5. **Native scrolling and restrained entry motion — passed (2026-08-01)**
   - Root cause reproduced before the change: `scroll-snap-type: y proximity` pulled a gesture ending near the first boundary to `775px`, while gestures farther from a boundary did not snap. This explained the reported intermittent behavior. The continuous `animation-timeline: view()` transform also kept large itinerary images coupled to scrolling.
   - Accepted implementation uses native scrolling with computed `scrollSnapType: none`. A 390px `720px` gesture settled at `720px` without a later section pull; journey image computed `animationTimeline` is `auto`.
   - Main content retains a one-shot `12px` reveal. Journey cards remain readable at all times; each pending image settles once from `scale(1.018)` and `brightness(.88)` to `scale(1)` and `brightness(1)`, then stops being observed.
   - The advisor dialog no longer shows the internal order-generation sentence. Mobile focus uses `preventScroll`, keeping `申请私人顾问` visible at dialog open while still focusing the name field.
   - Coordinate glyph sweep is `1.02s` with the existing `1.1s` delay and one iteration. Origin story open/close and focus return remain intact.
   - At 390, 768, 1024 and 1440px, computed page overflow is zero and scroll snapping is `none`; local console errors and warnings are empty.
   - The previous production mobile advisor capture and accepted local result were inspected together. Accepted evidence: `.codex-tmp/arksoma-native-scroll-qa/01-journey-mobile-390.png`, `.codex-tmp/arksoma-native-scroll-qa/03-advisor-768.png`, `.codex-tmp/arksoma-native-scroll-qa/04-advisor-1440.png`, `.codex-tmp/arksoma-native-scroll-qa/06-advisor-mobile-title-check.png`. The earlier `02-advisor-mobile-390.png` capture was rejected because focus scrolling hid the title.
6. **Two-visit protocol and Private Journal — passed (2026-08-06)**
   - The public narrative order is `private access → two-visit protocol → five-day itinerary → Private Journal → advisory`.
   - At 1440px, the protocol is a three-column rail and the journal gallery is a two-column composition. All three optimized WebP journal assets load at their expected natural dimensions.
   - At 390px, the protocol cards and journal gallery resolve to a single 358px column; `documentElement.scrollWidth === documentElement.clientWidth`.
   - The journal sequence contains exactly 15 chapter characters in the approved order. There are no volume numbers or Roman numerals, and the production copy states that client images are merged before unified printing, thread sewing and casing-in.
   - Advisor dialog open/close remains functional. Browser console errors and warnings are empty.
7. **Journey loading and controlled Journal release — passed (2026-08-06)**
   - The owner commercial configuration now contains a dedicated `公开展示方舟生命纪行` checkbox. It is off by default, saves through the owner-only configuration API and records a required reason; the public page remains fail-closed when the catalog cannot enable it.
   - The enabled Journal state was inspected at 1440px and 390px. Its section background, typography, captions and gallery framing now use the same black, muted emerald, ivory and bronze language as the rest of ARKSOMA; both viewports report `documentElement.scrollWidth === clientWidth`.
   - Protocol desktop cards share the same bottom edge and all three tag rows resolve to the exact same top and bottom coordinates. At 834px and 390px they return to a natural single-column sequence with no overflow.
   - Every itinerary image now has intrinsic dimensions, asynchronous decoding and a stable landscape slot. With all five JPEG requests intentionally blocked, the card retained its dark branded surface with image opacity `0`; no broken-image icon, alt-text flash or layout shift appeared. With networking restored, all five images reached their expected natural dimensions and `is-image-ready` state.
   - The hero remains the only high-priority preloaded image. After window load, itinerary images are prepared sequentially only when data-saver is not enabled.
   - Before/after comparisons were inspected together at the same 1440 × 1000 viewport. Accepted evidence: `.codex-tmp/arksoma-aug6-final/compare-protocol-1440.png`, `.codex-tmp/arksoma-aug6-final/compare-journal-1440.png`, `.codex-tmp/arksoma-aug6-final/journey-390.png`, `.codex-tmp/arksoma-aug6-final/journey-failure-placeholder.png`, `.codex-tmp/arksoma-aug6-final/protocol-834.png`, `.codex-tmp/arksoma-aug6-final/protocol-390.png`.

## Residual P3 notes

- The added `PRIVATE ACCESS · BY APPOINTMENT` line intentionally moves the hero title slightly lower than the original preview; this is required membership context and does not alter the approved composition.
- Different platform Songti/Didot fallbacks may produce minor optical differences across iOS and macOS.

final result: passed

# ARKSOMA CELL JOURNEY Preview QA

## Comparison target and evidence

- Source visual truth: `/Users/godfather/.codex/generated_images/019f5e8c-6e48-7892-bb71-e52c309dbf5d/exec-0b8eee39-08f8-42be-9d81-7cf2eaee1a05.png` (`1487 × 1058` px).
- Browser-rendered implementation: `http://127.0.0.1:3015/prototype/arksoma-cell-journey-preview.html`.
- Full browser screenshots:
  - desktop: `.codex-tmp/arksoma-cell-journey-preview-qa/01-desktop.png` (`1472 × 1100` px; target canvas `1440 × 939` CSS px)
  - iPad: `.codex-tmp/arksoma-cell-journey-preview-qa/02-tablet.png` (`1056 × 1050` px; target canvas `1024 × 869` CSS px)
  - mobile: `.codex-tmp/arksoma-cell-journey-preview-qa/03-mobile.png` (`422 × 1150` px; target canvas `390 × 965` CSS px)
- Full-view normalized comparison: `.codex-tmp/arksoma-cell-journey-preview-qa/09-final-comparison.png` (source left, accepted desktop canvas right, each normalized to `800 × 570` inside one `1600 × 570` comparison image).
- Focused responsive evidence: `.codex-tmp/arksoma-cell-journey-preview-qa/05-tablet-canvas.png` and `.codex-tmp/arksoma-cell-journey-preview-qa/06-mobile-canvas.png`.
- Density normalization: all accepted browser captures use `deviceScaleFactor: 1`; the source is resized proportionally only inside the combined comparison, with no density-based finding filed.
- States: desktop, iPad and mobile selected states reached by real button clicks; the final delivery tab is left on desktop mode.

## Responsive and interaction verification

| Mode | Target canvas | Stage layout | Title | Annual baseline | Horizontal overflow |
| --- | ---: | --- | --- | --- | --- |
| desktop | 1440 px | three equal `406.664px` columns | one line | one line | none (`1472 === 1472`) |
| iPad | 1024 px | three equal `300px` columns | one line | one line | none (`1056 === 1056`) |
| mobile | 390 px | one `313px` content column on a vertical timeline | one line | one line | none (`422 === 422`) |

- Desktop stage metadata is one flex row for `01/02/03` and timing; all three tag lists share the exact `812.796875px` bottom baseline.
- iPad timing and all three stage headings remain whole lines after the post-fix padding adjustment; no isolated punctuation or clipped text remains.
- Mobile stage heads stay compact, body copy wraps naturally, all seven bordered tags remain inside the `390px` canvas, and the annual baseline stays on one line.
- The target canvas is a semantic `main` containing a `section` named by `aria-labelledby="journeyPreviewTitle"`; the accessible region name is `一次方案 · 两次赴日`.
- Real clicks produced exactly one `aria-pressed="true"` control for each mode. Final state: desktop `true`, iPad/mobile `false`.
- Browser console errors and warnings after the complete click sequence: empty.

## Required fidelity surfaces

- **Fonts and typography:** restrained sans-serif eyebrow and timing copy, Songti display/body hierarchy and Didot/Bodoni-style stage numerals preserve the reference's editorial contrast. Desktop/iPad/mobile titles stay on one line; no truncation or overflow was observed.
- **Spacing and layout rhythm:** the accepted build restores the centered ceremonial header, continuous rail, equal desktop/tablet tracks, vertical separators, common tag baseline and framed annual baseline. Mobile intentionally switches to a single vertical timeline with consistent stage rhythm.
- **Colors and visual tokens:** the implementation now uses the reference's near-black surface, warm ivory text, muted bronze rules/tags and low-noise emerald-black glow. Active preview controls reuse the same bronze token while retaining visible focus.
- **Image quality and asset fidelity:** the approved target contains no photographic, logo, illustration or non-standard icon asset. The implementation remains asset-free and does not substitute imagery with custom SVG, emoji or placeholder art; the radial surface treatment is a background token, not a replacement asset.
- **Copy and content:** title, three service stages, timings, medical coordination copy, seven tags and the single annual-baseline sentence match the approved preview contract. The reference's smaller secondary footer sentence is intentionally omitted because this task requires exactly one annual baseline line.
- **Accessibility and controls:** semantic buttons, visible focus, named navigation, named section, heading hierarchy and list semantics are present. Tap controls remain usable at the mobile host width.

## Findings and comparison history

1. **Initial pass — blocked**
   - [P1] The implementation used a light ivory canvas, left-aligned header, small numerals and unframed text tags, while the confirmed source uses a near-black ceremonial composition with ivory/bronze contrast, centered hierarchy, large stage numerals, rail markers, vertical dividers and framed tags.
   - Fix: restored the source palette and hierarchy in `prototype/arksoma-cell-journey-preview.css`, including the centered header, continuous rail, stage markers/dividers, optical numerals, boxed tags and framed annual baseline. Added a regression test for the approved dark visual contract.
2. **Responsive follow-up — blocked**
   - [P2] Narrower target canvases were not centered in the preview host; the initial iPad column padding also forced stage timing onto awkward lines.
   - Fix: centered each fixed canvas, introduced mode-specific stage inline padding and reduced the iPad metadata gap. Regression tests cover canvas centering and per-mode spacing variables.
3. **Post-fix pass — passed**
   - Re-captured the implementation at `1440 / 1024 / 390` target canvas widths and inspected all three saved screenshots with the image viewer.
   - The combined source/desktop comparison confirms the accepted black/ivory/bronze art direction, hierarchy, rail, three-column composition, framed tags and annual-baseline treatment.
   - No actionable P0/P1/P2 finding remains.

## Follow-up polish

- [P3] Songti and Didot/Bodoni fallback metrics can vary slightly by platform; the verified macOS rendering keeps all required lines and alignments intact.
- [P3] The implementation keeps the authoritative one-line annual baseline, while the visual source includes a smaller secondary explanatory line; this is an intentional content-boundary difference rather than missing copy.

## Implementation checklist

- [x] Compare the source and implementation in one normalized image.
- [x] Verify desktop, iPad and mobile visual states through real clicks.
- [x] Verify typography, spacing, colors, imagery/asset fidelity and copy.
- [x] Verify ARIA state, target-canvas semantics, horizontal overflow and browser logs.
- [x] Run the focused regression file and the complete test suite after each accepted fix.
- [x] Keep the local preview service and deliverable browser tab open; do not deploy.

final result: passed
