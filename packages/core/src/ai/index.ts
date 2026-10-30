import type { AIProvider } from '../types';

export { createGeminiProvider, createProxyProvider } from './gemini';

/** Used when no AI is configured. Every call rejects with a clear, friendly message. */
export const nullProvider: AIProvider = {
  id: 'none',
  isConfigured: () => false,
  describeImage: () => Promise.reject(new Error('Add a Gemini key to enable AI features.')),
  simplify: () => Promise.reject(new Error('Add a Gemini key to enable AI features.')),
  summarize: () => Promise.reject(new Error('Add a Gemini key to enable AI features.')),
  ask: () => Promise.reject(new Error('Add a Gemini key to enable AI features.')),
  translate: () => Promise.reject(new Error('Add a Gemini key to enable AI features.')),
  explain: () => Promise.reject(new Error('Add a Gemini key to enable AI features.')),
  ocr: () => Promise.reject(new Error('Add a Gemini key to enable AI features.')),
  guide: () => Promise.reject(new Error('Add a Gemini key to enable AI features.')),
};
