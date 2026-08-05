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
