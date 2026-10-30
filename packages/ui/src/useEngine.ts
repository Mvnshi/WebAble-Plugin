import { useState, useEffect } from 'preact/hooks';
import type { Engine, EngineState } from '@webable/core';

/**
 * Subscribe a component to the engine's settings store.
 *
 * The re-read inside the effect is not redundant. The snapshot above is taken
 * during render, the effect runs after the commit, and `store.subscribe` only
 * adds a listener: it does not replay. So anything the engine emitted in that
 * window was delivered to nobody, and without this the component would keep
 * rendering the pre-change snapshot until the NEXT change happened along.
 *
 * On a settings panel that means showing the user something other than what is
 * applied to their page, which is the one thing a settings panel must not do.
 * It is intermittent by nature, because it depends on whether a change lands
 * inside that window, and it is what made two of this package's own tests fail
 * about one run in three.
 */
export function useEngineState(engine: Engine): EngineState {
  const [state, setState] = useState<EngineState>(engine.getState());
  useEffect(() => {
    setState(engine.getState());
    return engine.subscribe(setState);
  }, [engine]);
  return state;
}

export type ResolvedTheme = 'light' | 'dark' | 'glass';

/** Resolve the panel chrome theme, following the OS when set to 'auto'. */
export function useResolvedTheme(pref: 'auto' | 'light' | 'dark' | 'glass'): ResolvedTheme {
  const getOS = (): 'light' | 'dark' =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  const [os, setOS] = useState<'light' | 'dark'>(getOS);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setOS(mq.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);
  return pref === 'auto' ? os : pref;
}
