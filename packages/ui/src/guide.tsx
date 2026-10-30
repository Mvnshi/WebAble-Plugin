/**
 * Guide UI. Ask (type or speak) what you want to do on the page; the answer is
 * shown here while the on-page pointer (drawn by engine.guide) marks the exact
 * element to use. Read-aloud uses the keyless Web Speech TTS. Needs AI, which
 * means either a subscription or the user's own key; shows the same prompt as
 * the AI tab until there is one.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Engine } from '@webable/core';
import { Icon } from './icons';
import { BlockHead } from './powerTools';
import { whileBusy } from './controls';
import type { OpenController } from './controller';
import { t } from './i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRec: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function GuideBlock({ engine, controller }: { engine: Engine; controller?: OpenController }): JSX.Element {
  const blockRef = useRef<HTMLDivElement>(null);
  // See AISection: the Guide unlocks on whether the provider can answer, not on
  // whether a key is set, so a signed-in subscriber is not shown a key prompt.
  const ready = engine.provider.isConfigured();
  const [gs, setGs] = useState(engine.guide.getState());
  useEffect(() => engine.guide.subscribe(setGs), [engine]);
  const [q, setQ] = useState('');
  const [readAloud, setReadAloud] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const spokenKey = useRef('');
  const chatRef = useRef<HTMLDivElement>(null);

  // Read the CURRENT step aloud when read-aloud is on: the first step on a new
  // answer, and each step as the user advances (so a walkthrough is spoken one
  // step at a time, not the whole transcript at once).
  useEffect(() => {
    if (!readAloud || gs.status !== 'active') return;
    const step = gs.steps[gs.stepIndex];
    if (!step || !step.say) return;
    const k = `${gs.messages.length}:${gs.stepIndex}`;
    if (k === spokenKey.current) return;
    spokenKey.current = k;
    try {
      engine.tts.speak(step.say);
    } catch {
      /* ignore */
    }
  }, [gs.steps, gs.stepIndex, gs.messages.length, gs.status, readAloud, engine]);

  // Keep the latest turn in view as the conversation grows.
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [gs.messages, gs.status]);

  const stopSpeech = () => {
    try {
      engine.tts.stop();
    } catch {
      /* ignore */
    }
  };

  const send = (text?: string) => {
    const v = (text ?? q).trim();
    if (!v || gs.status === 'thinking') return;
    setQ('');
    stopSpeech(); // a new question cancels the previous answer being read aloud
    engine.guide.ask(v);
  };

  const clear = () => {
    stopSpeech();
    engine.guide.clear();
  };

  const toggleMic = () => {
    if (!SpeechRec) return;
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SpeechRec();
    recRef.current = rec;
    rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const txt = e.results?.[0]?.[0]?.transcript || '';
      if (txt.trim()) send(txt);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  if (!ready) {
    return (
      <div class="wa-panel-block">
        <BlockHead icon="guide" name={t('guide.title')} desc={t('guide.descKey')} />
        <div class="wa-ai-key" style="margin-top:11px">
          <input
            class="wa-input"
            type="password"
            placeholder={t('ai.keyPlaceholder')}
            value={keyDraft}
            autocomplete="off"
            aria-label={t('ai.keyPlaceholder')}
            onInput={(e) => setKeyDraft((e.target as HTMLInputElement).value)}
          />
          <button class="wa-btn wa-btn-primary" disabled={!keyDraft.trim()} onClick={() => engine.setApiKey(keyDraft.trim())}>
            {t('ai.save')}
          </button>
        </div>
        <p class="wa-note">{t('ai.keyNote')}</p>
      </div>
    );
  }

  const busy = gs.status === 'thinking';
  return (
    <div class="wa-panel-block" ref={blockRef} tabIndex={-1}>
      <BlockHead icon="guide" name={t('guide.title')} desc={t('guide.desc')} on={gs.status === 'active' || busy} />
      <div class="wa-ai-key" style="margin-top:11px">
        <input
          class="wa-input"
          type="text"
          placeholder={t('guide.placeholder')}
          value={q}
          aria-label={t('guide.placeholder')}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) send(); }}
        />
        <button
          class={`wa-iconbtn wa-guide-mic${listening ? ' wa-on' : ''}`}
          aria-label={SpeechRec ? t('guide.mic') : t('guide.micUnsupported')}
          aria-pressed={listening ? 'true' : 'false'}
          aria-disabled={SpeechRec ? undefined : 'true'}
          disabled={!SpeechRec}
          title={SpeechRec ? t('guide.mic') : t('guide.micUnsupported')}
          onClick={toggleMic}
        >
          <Icon name="mic" size={16} />
        </button>
        <button class="wa-btn wa-btn-primary" {...whileBusy(busy, () => send())}>
          {busy ? '…' : t('guide.ask')}
        </button>
      </div>
      <label class="wa-pt-check">
        <input
          type="checkbox"
          checked={readAloud}
          onChange={(e) => {
            const on = (e.target as HTMLInputElement).checked;
            setReadAloud(on);
            if (!on) stopSpeech();
          }}
        />
        {t('guide.readAloud')}
      </label>
      {gs.error && <div class="wa-ai-out" role="alert" style="color:var(--danger)">{gs.error}</div>}
      {gs.messages.length > 0 || busy ? (
        <div class="wa-guide-chat" ref={chatRef} aria-live="polite" aria-busy={busy ? 'true' : 'false'}>
          {/* Keyed by position in the whole conversation, not in the slice. With a
            sliced index every node's text changed as the window moved, so past
            six turns the live region re-announced the entire visible
            transcript on every reply. */}
        {gs.messages.slice(-6).map((m, i) => (
            <div key={gs.messages.length - Math.min(6, gs.messages.length) + i} class={`wa-guide-msg wa-guide-${m.role}`}>
            {m.text}
          </div>
          ))}
          {busy && (
            <div class="wa-guide-msg wa-guide-assistant wa-guide-typing" aria-label={t('guide.thinking')}>
              <span class="wa-guide-dot" /><span class="wa-guide-dot" /><span class="wa-guide-dot" />
            </div>
          )}
        </div>
      ) : (
        !gs.error && <p class="wa-guide-empty">{t('guide.empty')}</p>
      )}
      {gs.pointing && gs.steps.length > 1 && (
        <div class="wa-guide-stepnav">
          {/* aria-disabled, not disabled: a walkthrough's Back and Next sit
              under the user's focus by definition, and stepping to either end
              would otherwise throw that focus out of the dialog mid-guide.
              See whileBusy in controls.tsx. */}
          <button
            class="wa-btn wa-btn-ghost"
            aria-label={t('guide.back')}
            {...whileBusy(gs.stepIndex === 0, () => engine.guide.prev())}
          >
            {t('guide.back')}
          </button>
          <span class="wa-guide-stepc" aria-live="polite">{t('guide.step', { n: gs.stepIndex + 1, m: gs.steps.length })}</span>
          <button
            class="wa-btn wa-btn-primary"
            aria-label={t('guide.next')}
            {...whileBusy(gs.stepIndex >= gs.steps.length - 1, () => engine.guide.next())}
          >
            {t('guide.next')}
          </button>
        </div>
      )}
      {/* The way out of the dialog. The Guide rings a control on the page, but
          the panel is a Tab-trapped modal and the bubble's own buttons live
          outside that trap, so a keyboard user could see the answer and never
          reach it: the only exit was Escape, which dismisses the spotlight
          first and destroys the guidance on the way out. This hands focus to
          the thing being pointed at, with the spotlight left up. */}
      {gs.pointing && (
        <button
          class="wa-btn wa-btn-primary wa-btn-block"
          style="margin-top:8px"
          onClick={() => {
            // Close first, focus after, and both halves of that matter.
            //
            // While the panel is open every top-level page element carries
            // `inert` (inert.ts), and focus() on an inert node is a silent
            // no-op that does not throw, so focusTarget() returned true having
            // moved nothing. And close() schedules its own focus restore a
            // frame out, so even when the focus did land, restoring the
            // pre-panel target overwrote it a moment later.
            //
            // Closing first lifts the inert, and this frame is queued after the
            // restore that close() just scheduled, so the target wins.
            controller?.close();
            requestAnimationFrame(() => engine.guide.focusTarget());
          }}
        >
          {t('guide.takeMeThere')}
        </button>
      )}
      {/* Focus moves out before this button removes itself; see the same
          pattern in powerTools.tsx. */}
      {(gs.messages.length > 0 || gs.pointing) && (
        <button
          class="wa-note wa-pt-clear"
          onClick={() => {
            blockRef.current?.focus();
            clear();
          }}
        >
          {t('guide.clear')}
        </button>
      )}
      <p class="wa-note">{t('guide.hint')}</p>
    </div>
  );
}
