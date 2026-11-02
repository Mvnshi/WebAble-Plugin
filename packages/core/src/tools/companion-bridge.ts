/**
 * Bridge from the shared companion protocol to the web Guide's render shape.
 *
 * Why this exists: the Guide provider currently asks the model for a whole
 * JSON object, which cannot be rendered until the last brace arrives. Partial
 * JSON is not reliably parseable, so the cursor can only move after the model
 * has finished talking. The companion protocol embeds its commands inline as
 * tags instead, which parse incrementally, so the cursor can fly while the
 * narration is still streaming.
 *
 * This adapter lets the existing on-page overlay render companion output with
 * no changes to the overlay itself: element anchors map straight onto the
 * element indices the overlay already uses.
 *
 * Screen-coordinate anchors are a desktop concept and are dropped here rather
 * than guessed at, because a raw pixel on the web would not survive scroll or
 * reflow, which is exactly the failure mode DOM anchoring avoids.
 */
import type { CompanionDraw, CompanionStep } from '@webable/companion';
import type { GuideDraw, GuideReply, GuideStep } from '../types';

/** Element index for web rendering, or null when the anchor is not renderable here. */
function elementIndex(anchor: CompanionStep['point']): number | null {
  return anchor && anchor.kind === 'element' ? anchor.index : null;
}

function toGuideDraw(draw: CompanionDraw): GuideDraw | null {
  // A freehand path is desktop only. It is given as raw screen coordinates
  // with nothing to anchor to, and the Guide draws relative to numbered DOM
  // elements, so there is nothing here to attach it to. Dropped rather than
  // approximated: a stroke placed at a guessed spot on a page that has since
  // scrolled is worse than no stroke.
  if (draw.kind === 'path') return null;
  const el = draw.from.kind === 'element' ? draw.from.index : null;
  if (el == null) return null;
  if (draw.kind === 'arrow') {
    const to = draw.to && draw.to.kind === 'element' ? draw.to.index : null;
    if (to == null) return null;
    return { kind: 'arrow', el, to };
  }
  const out: GuideDraw = { kind: draw.kind, el };
  if (draw.kind === 'label') {
    if (!draw.text) return null;
    out.text = draw.text;
  }
  return out;
}

/** Map one companion step onto the Guide's step shape. */
export function toGuideStep(step: CompanionStep): GuideStep {
  const draw = (step.draw || [])
    .map(toGuideDraw)
    .filter((d): d is GuideDraw => d !== null);
  return {
    say: step.say,
    point: elementIndex(step.point),
    ...(step.label ? { label: step.label } : {}),
    ...(draw.length ? { draw } : {}),
  };
}

/**
 * Map a parsed companion walkthrough onto the GuideReply the Guide controller
 * already consumes. The first step doubles as the single-answer fields so
 * older call sites keep working.
 */
export function toGuideReply(steps: CompanionStep[]): GuideReply {
  const mapped = steps.map(toGuideStep);
  const first = mapped[0];
  if (!first) return { say: '', point: null };
  return {
    say: first.say,
    point: first.point ?? null,
    ...(first.label ? { label: first.label } : {}),
    steps: mapped,
  };
}
