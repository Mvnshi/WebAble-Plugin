/**
 * Text-to-speech via the Web Speech API. No key, no network, works in every
 * surface. Reads the current selection, or extracts the main article text when
 * nothing is selected. Long text is chunked at sentence boundaries so Stop is
 * responsive and progress can be tracked.
 */
export interface TTSState {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  rate: number;
  pitch: number;
  voiceURI: string | null;
  /** Index of the sentence currently being spoken, or -1 when idle. */
  chunkIndex: number;
  /** Total sentences queued for the current utterance. */
  chunkCount: number;
}

/** Persistable subset of TTS state (rate/pitch/voice are user preferences). */
export interface TTSPrefs {
  rate?: number;
  pitch?: number;
  voiceURI?: string | null;
}

export interface TTSController {
  getState(): TTSState;
  subscribe(fn: (s: TTSState) => void): () => void;
  voices(): SpeechSynthesisVoice[];
  setRate(rate: number): void;
  setPitch(pitch: number): void;
  setVoice(uri: string | null): void;
  /** The sentence currently being read (for highlighting), or '' when idle. */
  currentSentence(): string;
  /** Speak the selection if any, otherwise the page's main content. */
  speakAuto(doc?: Document): void;
  speak(text: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

/**
 * What read-aloud will speak for a page: the selection if there is one, else
 * the reader column, else the main content. Exported because which of those it
 * picks is a product decision worth a test, and the controller around it needs
 * a real speechSynthesis to construct.
 */
export function extractMainText(doc: Document): string {
  const sel = doc.defaultView?.getSelection?.();
  const selected = sel && sel.toString().trim();
  if (selected) return selected;
  // Reader mode first. Someone reading the cleaned column and pressing Play
  // expects to hear the column, not the navigation, cookie banner and related
  // links that reader mode just took away: it read from the live page and gave
  // them back everything they had removed.
  const candidate =
    doc.querySelector('#wa-reader .wa-reader-col') ||
    doc.querySelector('main,[role="main"],article') ||
    doc.body;
  const text = (candidate as HTMLElement)?.innerText || doc.body?.innerText || '';
  return text.replace(/\s+\n/g, '\n').trim();
}

function chunk(text: string, max = 220): string[] {
  const out: string[] = [];
  const parts = text.split(/(?<=[.!?])\s+|\n+/);
  let buf = '';
  for (const p of parts) {
    if ((buf + ' ' + p).length > max) {
      if (buf) out.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? `${buf} ${p}` : p;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

export function createTTS(): TTSController {
  const synth: SpeechSynthesis | undefined =
    typeof window !== 'undefined' ? window.speechSynthesis : undefined;

  const state: TTSState = {
    supported: !!synth,
    speaking: false,
    paused: false,
    rate: 1,
    pitch: 1,
    voiceURI: null,
    chunkIndex: -1,
    chunkCount: 0,
  };
  const listeners = new Set<(s: TTSState) => void>();
  let queue: string[] = [];
  let idx = 0;

  const emit = () => {
    for (const fn of listeners) {
      try {
        fn({ ...state });
      } catch {
        /* ignore */
      }
    }
  };

  // Voices populate asynchronously in most browsers; re-emit when they arrive
  // so a saved voiceURI resolves and the UI's voice picker fills in.
  if (synth && typeof synth.addEventListener === 'function') {
    try {
      synth.addEventListener('voiceschanged', () => emit());
    } catch {
      /* ignore */
    }
  }

  const pickVoice = (): SpeechSynthesisVoice | undefined => {
    if (!synth) return undefined;
    const all = synth.getVoices();
    if (state.voiceURI) {
      const v = all.find((x) => x.voiceURI === state.voiceURI);
      if (v) return v;
    }
    return all.find((x) => x.default) || all[0];
  };

  const speakNext = () => {
    if (!synth || idx >= queue.length) {
      state.speaking = false;
      state.paused = false;
      state.chunkIndex = -1;
      state.chunkCount = 0;
      queue = [];
      idx = 0;
      emit();
      return;
    }
    state.chunkIndex = idx;
    emit();
    const u = new SpeechSynthesisUtterance(queue[idx]);
    u.rate = state.rate;
    u.pitch = state.pitch;
    const v = pickVoice();
    if (v) u.voice = v;
    u.onend = () => {
      idx += 1;
      speakNext();
    };
    u.onerror = () => {
      idx += 1;
      speakNext();
    };
    synth.speak(u);
  };

  const startQueue = (text: string) => {
    if (!synth || !text) return;
    try {
      synth.cancel();
    } catch {
      /* ignore */
    }
    queue = chunk(text);
    idx = 0;
    state.speaking = true;
    state.paused = false;
    state.chunkCount = queue.length;
    state.chunkIndex = -1;
    emit();
    speakNext();
  };

  return {
    getState: () => ({ ...state }),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    voices: () => (synth ? synth.getVoices() : []),
    setRate(rate) {
      state.rate = Math.max(0.5, Math.min(2, rate));
      emit();
    },
    setPitch(pitch) {
      state.pitch = Math.max(0.5, Math.min(2, pitch));
      emit();
    },
    setVoice(uri) {
      state.voiceURI = uri;
      emit();
    },
    currentSentence: () => (state.chunkIndex >= 0 ? queue[state.chunkIndex] || '' : ''),
    speakAuto(doc) {
      startQueue(extractMainText(doc || document));
    },
    speak(text) {
      startQueue(text);
    },
    pause() {
      if (!synth) return;
      try {
        synth.pause();
      } catch {
        /* ignore */
      }
      state.paused = true;
      emit();
    },
    resume() {
      if (!synth) return;
      try {
        synth.resume();
      } catch {
        /* ignore */
      }
      state.paused = false;
      emit();
    },
    stop() {
      if (!synth) return;
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
      queue = [];
      idx = 0;
      state.speaking = false;
      state.paused = false;
      state.chunkIndex = -1;
      state.chunkCount = 0;
      emit();
    },
  };
}
