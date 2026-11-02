/**
 * Audio (keyless TTS) and AI (BYO Gemini key) panels. Both degrade gracefully:
 * TTS hides if the Web Speech API is missing; AI shows a key prompt until a key
 * is entered and never calls out on its own, only on an explicit button press.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Engine } from '@webable/core';
import { Icon } from './icons';
import { Slider, whileBusy } from './controls';
import { t } from './i18n';

export function TTSCard({ engine }: { engine: Engine }): JSX.Element | null {
  const [tts, setTts] = useState(engine.tts.getState());
  const [voices, setVoices] = useState(engine.tts.voices());
  useEffect(() => engine.tts.subscribe(setTts), [engine]);
  useEffect(() => {
    const load = () => setVoices(engine.tts.voices());
    load();
    const t = setTimeout(load, 250);
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = load;
    return () => clearTimeout(t);
  }, [engine]);

  if (!tts.supported) return null;

  return (
    <div class="wa-panel-block" role="group" aria-label={t('tts.group')}>
      <div class="wa-card-main" style="padding:0">
        <div class="wa-card-ic" data-on={tts.speaking ? 'true' : 'false'}>
          <Icon name="volume" size={18} />
        </div>
        <div class="wa-card-tx">
          <div class="wa-card-name">{t('tts.title')}</div>
          <div class="wa-card-desc">{t('tts.desc')}</div>
        </div>
      </div>
      <div class="wa-tts-controls">
        {!tts.speaking ? (
          <button class="wa-btn wa-btn-primary" onClick={() => engine.tts.speakAuto(document)}>
            <Icon name="play" size={15} /> {t('tts.play')}
          </button>
        ) : tts.paused ? (
          <button class="wa-btn wa-btn-primary" onClick={() => engine.tts.resume()}>
            <Icon name="play" size={15} /> {t('tts.resume')}
          </button>
        ) : (
          <button class="wa-btn wa-btn-primary" onClick={() => engine.tts.pause()}>
            <Icon name="pause" size={15} /> {t('tts.pause')}
          </button>
        )}
        <button class="wa-btn wa-btn-ghost" disabled={!tts.speaking} onClick={() => engine.tts.stop()}>
          <Icon name="stop" size={14} /> {t('tts.stop')}
        </button>
      </div>
      <div style="margin-top:12px">
        <Slider
          control={{ key: 'rate', type: 'slider', label: t('tts.speed'), min: 0.6, max: 1.8, step: 0.1, format: (v) => `${v}×` }}
          value={tts.rate}
          onChange={(v) => engine.tts.setRate(v)}
          scope="tts"
        />
      </div>
      <div style="margin-top:10px">
        <Slider
          control={{ key: 'pitch', type: 'slider', label: t('tts.pitch'), min: 0.5, max: 2, step: 0.1, format: (v) => `${v}×` }}
          value={tts.pitch}
          onChange={(v) => engine.tts.setPitch(v)}
          scope="tts"
        />
      </div>
      {voices.length > 1 && (
        <div class="wa-ctl-row" style="margin-top:10px">
          <label class="wa-ctl-label" for="wa-voice">{t('tts.voice')}</label>
          <div class="wa-seg" style="padding:0;background:none;border:0">
            <select
              id="wa-voice"
              class="wa-input"
              value={tts.voiceURI || ''}
              onChange={(e) => engine.tts.setVoice((e.target as HTMLSelectElement).value || null)}
            >
              <option value="">{t('tts.voiceDefault')}</option>
              {voices.slice(0, 24).map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function mask(key: string): string {
  if (key.length < 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function AISection({ engine, announce }: { engine: Engine; announce?: (m: string) => void }): JSX.Element {
  const key = engine.getState().apiKey;
  // What unlocks the tools is whether the provider can answer, not whether a
  // key is present. A subscriber signed into the hosted relay has no key and
  // used to be shown the key prompt, which is why paying for the product did
  // not enable the half of it that was paid for.
  const ready = engine.provider.isConfigured();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [question, setQuestion] = useState('');
  const [lang, setLang] = useState('Spanish');

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setErr('');
    setOut('');
    try {
      setOut(await fn());
    } catch (e) {
      setErr((e as Error).message || t('ai.errGeneric'));
    } finally {
      setBusy(null);
    }
  };

  const summarize = () =>
    run('summary', async () => {
      const main = (document.querySelector('main,[role="main"],article') || document.body) as HTMLElement;
      const text = main.innerText || document.body.innerText || '';
      if (text.trim().length < 40) throw new Error(t('ai.errNoSummary'));
      return engine.provider.summarize(text, { title: document.title, url: location.href });
    });

  const simplify = () =>
    run('simplify', async () => {
      const sel = (getSelection?.()?.toString() || '').trim();
      if (!sel) throw new Error(t('ai.errSelectText'));
      return engine.provider.simplify(sel, { level: 'plain' });
    });

  const explain = () =>
    run('explain', async () => {
      const sel = (getSelection?.()?.toString() || '').trim();
      if (!sel) throw new Error(t('ai.errSelectPassage'));
      return engine.provider.explain(sel);
    });

  const translate = () =>
    run('translate', async () => {
      const sel = (getSelection?.()?.toString() || '').trim();
      if (!sel) throw new Error(t('ai.errSelectText'));
      return engine.provider.translate(sel, lang);
    });

  const ask = () =>
    run('ask', async () => {
      if (!question.trim()) throw new Error(t('ai.errTypeQuestion'));
      const main = (document.querySelector('main,[role="main"],article') || document.body) as HTMLElement;
      const text = main.innerText || document.body.innerText || '';
      if (text.trim().length < 40) throw new Error(t('ai.errNoAnswerText'));
      return engine.provider.ask(question.trim(), text);
    });

  const altText = () =>
    run('alt', async () => {
      const imgs = Array.from(document.images).filter((i) => !i.alt?.trim() && i.src).slice(0, 6);
      if (!imgs.length) return t('ai.altAllPresent');
      let done = 0;
      for (const img of imgs) {
        try {
          // The src that is actually described, kept because the two awaits
          // below are a fetch and a model round trip. A carousel, a lazy
          // loader or an SPA re-render can put a different picture in this
          // element while we wait, and writing the old picture's description
          // onto the new one is worse than writing nothing: a screen reader
          // announces alt text as fact, so the reader is told confidently
          // about something that is not on screen.
          const src = img.src;
          const dataUrl = await toDataUrl(src);
          const alt = await engine.provider.describeImage({ dataUrl, context: document.title });
          if (!img.isConnected || img.src !== src) continue;
          img.alt = alt;
          img.setAttribute('aria-label', alt);
          done += 1;
        } catch {
          /* skip images we cannot read (CORS) */
        }
      }
      return done
        ? t('ai.altDone', { n: done, s: done > 1 ? 's' : '', them: done > 1 ? 'them' : 'it' })
        : t('ai.altBlocked');
    });

  // The provider has had an `ocr` method since the AI layer was written, with
  // zero callers anywhere: fully implemented and unreachable, which is the
  // second time this repo has shipped that. The plumbing is the same as alt
  // text (fetch the image, hand over a data URL), so this is the call that was
  // missing rather than a new capability.
  const extractText = () =>
    run('ocr', async () => {
      const imgs = Array.from(document.images)
        .filter((i) => i.src && i.naturalWidth > 120 && i.naturalHeight > 60)
        .slice(0, 4);
      if (!imgs.length) return t('ai.ocrNoImages');
      const out: string[] = [];
      let blocked = 0;
      for (const img of imgs) {
        try {
          const text = (await engine.provider.ocr({ dataUrl: await toDataUrl(img.src) })).trim();
          if (text) out.push(text);
        } catch {
          blocked += 1;
        }
      }
      if (out.length) return out.join('\n\n');
      return blocked ? t('ai.altBlocked') : t('ai.ocrNoText');
    });

  if (!ready) {
    return (
      <div class="wa-panel-block">
        <div class="wa-card-main" style="padding:0">
          <div class="wa-card-ic"><Icon name="key" size={18} /></div>
          <div class="wa-card-tx">
            <div class="wa-card-name">{t('ai.titleOptional')}</div>
            <div class="wa-card-desc">{t('ai.descKeyPrompt')}</div>
          </div>
        </div>
        <div class="wa-ai-key">
          <input
            class="wa-input"
            type="password"
            placeholder={t('ai.keyPlaceholder')}
            value={draft}
            autocomplete="off"
            aria-label={t('ai.keyPlaceholder')}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          />
          {/* Saving said nothing and left focus on a node the re-render turned
              into the "Ask" button, so a screen reader user pasted a key and
              had no idea whether it took. */}
          <button
            class="wa-btn wa-btn-primary"
            {...whileBusy(!draft.trim(), () => {
              engine.setApiKey(draft.trim());
              announce?.(t('announce.keySaved'));
            })}
          >
            {t('ai.save')}
          </button>
        </div>
        <p class="wa-note">{t('ai.keyNote')}</p>
      </div>
    );
  }

  return (
    <div class="wa-panel-block">
      <div class="wa-card-main" style="padding:0">
        <div class="wa-card-ic" data-on="true"><Icon name="key" size={18} /></div>
        <div class="wa-card-tx">
          <div class="wa-card-name">{t('ai.title')}</div>
          {key ? <div class="wa-card-desc">{t('ai.connected', { key: mask(key) })}</div> : null}
        </div>
        {key ? (
          <button class="wa-card-gear" aria-label={t('ai.removeKey')} onClick={() => engine.setApiKey('')}>
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>
      <div class="wa-ai-key" style="margin-top:12px">
        <input
          class="wa-input"
          type="text"
          placeholder={t('ai.askPlaceholder')}
          value={question}
          aria-label={t('ai.askLabel')}
          onInput={(e) => setQuestion((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) ask(); }}
        />
        <button class="wa-btn wa-btn-primary" {...whileBusy(!!busy, ask)}>
          {busy === 'ask' ? '…' : t('ai.ask')}
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
        <button class="wa-btn wa-btn-ghost wa-btn-block" {...whileBusy(!!busy, summarize)}>
          {busy === 'summary' ? t('ai.summarizing') : t('ai.summarize')}
        </button>
        <div style="display:flex;gap:8px">
          <button class="wa-btn wa-btn-ghost" style="flex:1" {...whileBusy(!!busy, simplify)}>
            {busy === 'simplify' ? '…' : t('ai.simplify')}
          </button>
          <button class="wa-btn wa-btn-ghost" style="flex:1" {...whileBusy(!!busy, explain)}>
            {busy === 'explain' ? '…' : t('ai.explain')}
          </button>
        </div>
        <div style="display:flex;gap:8px">
          <select
            class="wa-input"
            style="flex:1"
            value={lang}
            aria-label={t('ai.translateLabel')}
            onChange={(e) => setLang((e.target as HTMLSelectElement).value)}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <button class="wa-btn wa-btn-ghost" {...whileBusy(!!busy, translate)}>
            {busy === 'translate' ? '…' : t('ai.translate')}
          </button>
        </div>
        <button class="wa-btn wa-btn-ghost wa-btn-block" {...whileBusy(!!busy, altText)}>
          {busy === 'alt' ? t('ai.describingImages') : t('ai.altText')}
        </button>
        <button class="wa-btn wa-btn-ghost wa-btn-block" {...whileBusy(!!busy, extractText)}>
          {busy === 'ocr' ? t('ai.extracting') : t('ai.extractText')}
        </button>
      </div>
      {/* Both regions exist before there is anything in them. An AI call takes
          seconds and its answer used to appear in a plain div: nothing was
          announced, and nothing moved focus, so a screen reader user pressed
          Summarize and then had no way to know the answer had arrived, or where
          it was. The output is also focusable and labelled so they can Tab
          straight to it and read it. */}
      <div class="wa-ai-out" role="alert" style={err ? 'color:var(--danger)' : 'display:none'}>{err}</div>
      <div
        class="wa-ai-out"
        role="status"
        aria-live="polite"
        aria-label={t('ai.resultLabel')}
        tabIndex={out ? 0 : -1}
        style={out ? undefined : 'display:none'}
      >
        {out}
      </div>
      <p class="wa-note">{t('ai.footNote')}</p>
    </div>
  );
}

const LANGS = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese', 'Japanese', 'Korean', 'Hindi', 'Arabic', 'Russian', 'English'];

async function toDataUrl(src: string): Promise<string> {
  const res = await fetch(src, { mode: 'cors' });
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(blob);
  });
}
