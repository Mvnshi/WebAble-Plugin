/**
 * The rule: a person can ask for what they need in their own words, and the
 * command bar does the thing a specialist would have reached for.
 *
 * Every case here is a sentence somebody would actually type, paired with the
 * one change it should make. The phrasebook is the product for anyone who does
 * not know what "high contrast" or "reader mode" are called, so a regression in
 * it is a regression for exactly the people who need the bar most.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent, clean, type Intent } from '../src/intents';
import { FEATURE_IDS, PROFILES } from '@webable/core';

const first = (q: string): Intent | undefined => parseIntent(q)[0];

test('a need described in plain words maps to the tool for it', () => {
  assert.deepEqual(first('this page is way too bright'), { kind: 'toggle', feature: 'darkMode', on: true });
  assert.deepEqual(first('it hurts my eyes'), { kind: 'toggle', feature: 'darkMode', on: true });
  assert.deepEqual(first("I can't read this, the text is tiny"), { kind: 'adjust', feature: 'fontSize', key: 'value', delta: 20 });
  assert.deepEqual(first('make everything stop moving'), { kind: 'toggle', feature: 'stopAnimations', on: true });
  assert.deepEqual(first('I have dyslexia'), { kind: 'profile', id: 'dyslexia' });
  assert.deepEqual(first('there is too much going on'), { kind: 'profile', id: 'adhd' });
  assert.deepEqual(first('setting this up for my grandma'), { kind: 'profile', id: 'senior' });
  assert.deepEqual(first('I am colorblind'), { kind: 'toggle', feature: 'colorFilter', on: true });
});

test('the words around a request do not change it', () => {
  assert.equal(clean('Hey, could you please make the text bigger'), 'make the text bigger');
  assert.deepEqual(first('could you please make the text bigger'), { kind: 'adjust', feature: 'fontSize', key: 'value', delta: 20 });
  assert.deepEqual(first('text bigger'), { kind: 'adjust', feature: 'fontSize', key: 'value', delta: 20 });
});

test('on and off are read from either end of the sentence', () => {
  assert.deepEqual(first('turn off dark mode'), { kind: 'toggle', feature: 'darkMode', on: false });
  assert.deepEqual(first('dark mode off'), { kind: 'toggle', feature: 'darkMode', on: false });
  assert.deepEqual(first('enable dark mode'), { kind: 'toggle', feature: 'darkMode', on: true });
  assert.deepEqual(first('dark mode'), { kind: 'toggle', feature: 'darkMode' });
  // "Stop animations" names a tool by what it does, so it asks for it ON. A
  // flip would turn it off for somebody who already had it running.
  assert.deepEqual(first('stop animations'), { kind: 'toggle', feature: 'stopAnimations', on: true });
  assert.deepEqual(first('hide the images'), { kind: 'toggle', feature: 'hideImages', on: true });
  // A trailing "on" that is part of the sentence is not a switch.
  assert.deepEqual(first('there is too much going on'), { kind: 'profile', id: 'adhd' });
});

test('turning something off never smuggles in a need phrase that turns something on', () => {
  for (const i of parseIntent('turn off dark mode, too bright')) {
    assert.ok(!('on' in i && i.on === true), `"off" request produced ${JSON.stringify(i)}`);
  }
});

test('numbers people say land inside the tool limits', () => {
  assert.deepEqual(first('text 150%'), { kind: 'set', feature: 'fontSize', patch: { value: 150 } });
  assert.deepEqual(first('font size to 999'), { kind: 'set', feature: 'fontSize', patch: { value: 300 } });
  assert.deepEqual(first('2x'), { kind: 'set', feature: 'mediaSpeed', patch: { rate: 2 } });
  assert.deepEqual(first('play at 1.25'), { kind: 'set', feature: 'mediaSpeed', patch: { rate: 1.25 } });
  assert.deepEqual(first('speed 9'), { kind: 'set', feature: 'mediaSpeed', patch: { rate: 3 } });
  assert.deepEqual(first('volume 200%'), { kind: 'set', feature: 'volumeBoost', patch: { gain: 2 } });
});

test('actions are recognised however they are phrased', () => {
  const action = (q: string) => {
    const i = first(q);
    return i && i.kind === 'action' ? i.id : i;
  };
  assert.equal(action('read this to me'), 'readAloud');
  assert.equal(action('read it out loud'), 'readAloud');
  assert.equal(action('stop reading'), 'stopReading');
  assert.equal(action('summarize'), 'summarize');
  assert.equal(action("what's the gist"), 'summarize');
  assert.equal(action('click with the keyboard'), 'hints');
  assert.equal(action('back to top'), 'scrollTop');
  assert.equal(action('go to the bottom'), 'scrollBottom');
  assert.equal(action('copy a clean link'), 'copyCleanLink');
  assert.equal(action('check this site'), 'siteCheck');
  assert.equal(action('seo audit'), 'siteCheck');
  assert.equal(action('undo'), 'undo');
  assert.equal(action('help'), 'help');
});

test('search and find keep the free text after the verb intact', () => {
  assert.deepEqual(first('search for dark mode jackets'), { kind: 'action', id: 'siteSearch', arg: 'dark mode jackets' });
  assert.deepEqual(first('go to pricing'), { kind: 'action', id: 'find', arg: 'pricing' });
  assert.deepEqual(first('#Installation'), { kind: 'action', id: 'find', arg: 'Installation' });
});

test('an unrecognised question becomes a question about the page', () => {
  assert.deepEqual(first('how do I change my shipping address'), {
    kind: 'action',
    id: 'ask',
    arg: 'how do I change my shipping address',
  });
  assert.deepEqual(first('? who wrote this'), { kind: 'action', id: 'ask', arg: 'who wrote this' });
});

test('gibberish is an honest "no idea", so the bar falls back to search', () => {
  assert.deepEqual(parseIntent('qwzx'), []);
  assert.deepEqual(parseIntent('   '), []);
});

test('every tool and profile the phrasebook names exists', () => {
  // A renamed feature would leave a phrase pointing at nothing, and the bar
  // would toggle an id the engine ignores. That fails silently, so pin it.
  const ids = new Set(FEATURE_IDS);
  const profiles = new Set(PROFILES.map((p) => p.id));
  const probes = [
    'too bright', 'tiny', 'dyslexia', 'adhd', 'seizure', 'low vision', 'tremor', 'senior', 'screen reader',
    'privacy', 'stop moving', 'too loud', 'louder', 'dark mode', 'invert', 'contrast', 'grayscale', 'colorblind',
    'reader mode', 'lexend', 'readable font', 'bionic', 'line spacing', 'animations', 'hide images',
    'hide ads', 'ruler', 'spotlight', 'focus mode', 'magnifier', 'cursor', 'bigger buttons', 'focus ring',
    'highlight links', 'highlight headings', 'cookies', 'popups', 'sticky', 'signup wall', 'notification prompts',
    'expand all', 'unlock copy', 'pinch zoom', 'pip', 'auto scroll', 'mute', 'feed off', 'dictionary',
    'explain selection', 'pin tooltips', 'justify', 'custom colors',
  ];
  for (const p of probes) {
    const got = parseIntent(p);
    assert.ok(got.length, `"${p}" matched nothing`);
    for (const i of got) {
      if (i.kind === 'toggle' || i.kind === 'set' || i.kind === 'adjust') assert.ok(ids.has(i.feature), `"${p}" -> unknown tool ${i.feature}`);
      if (i.kind === 'profile') assert.ok(profiles.has(i.id), `"${p}" -> unknown profile ${i.id}`);
    }
  }
});
