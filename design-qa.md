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

## Residual P3 notes

- The added `PRIVATE ACCESS · BY APPOINTMENT` line intentionally moves the hero title slightly lower than the original preview; this is required membership context and does not alter the approved composition.
- Different platform Songti/Didot fallbacks may produce minor optical differences across iOS and macOS.

final result: passed
