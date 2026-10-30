/**
 * The widget's stand-in for extensionBlocks.tsx.
 *
 * apps/widget/build.mjs resolves the real module here, so the extension-only
 * panel blocks (Site Patches, cross-site defaults, the friction log, TrapLens
 * and the feed guard) and everything they import are never bundled into the
 * widget at all. These return null and are dropped by the same DCE that folds
 * `config.surface === 'extension'`.
 *
 * This file mirrors what Panel.tsx IMPORTS, which is a shorter list than what
 * extensionBlocks.tsx exports. ScopeBlock, SiteOffBlock and AccountBlock are
 * reached only through ExtensionHeader, inside the real module, so nothing
 * shared ever names them and they need no stand-in. Measured: dropping them
 * changed the widget total by zero bytes, because an exported function nothing
 * imports is tree-shaken anyway. They are gone for clarity, not for size.
 *
 * The rule this file actually has to keep: every name Panel.tsx imports from
 * './extensionBlocks' must exist here. Adding an import there and not a stub
 * here is a widget BUILD error, loud and immediate, which is the failure mode
 * this arrangement is chosen for.
 */
export function ExtensionHeader(): null {
  return null;
}

/**
 * The whole extension-only Power tools group in one component, so Panel.tsx
 * carries one folded branch rather than one per tool.
 */
export function ExtensionTools(): null {
  return null;
}

