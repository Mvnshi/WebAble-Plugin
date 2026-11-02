/**
 * esbuild plugin: strip comments from the CSS template literals in packages/ui.
 *
 * The panel and launcher stylesheets are `/* css *\/` tagged template literals.
 * esbuild minifies the JavaScript around them and does not touch what is inside
 * a template literal, so every word of every CSS comment was being shipped to
 * every visitor. Measured: 2.1 KB gzipped of the widget's 65 KB budget, which
 * is more than the whole accessibility pass cost.
 *
 * The house rule is that comments explain why, and the panel's CSS carries some
 * of the most load-bearing reasoning in the product (why a rule is !important,
 * why a breakpoint is where it is, what broke last time). Deleting them to save
 * bytes would be the wrong trade. Stripping them at build time is not a trade
 * at all: they stay in the source and stop costing anything.
 *
 * Deliberately conservative. It removes /* *\/ comments and flattens leading
 * indentation and blank lines, and does nothing else: no selector collapsing,
 * no shorthand rewriting, no property reordering. A CSS minifier that
 * misunderstands one rule in an accessibility product's stylesheet is worth far
 * more than the extra kilobyte it would save. It also asserts the file has no
 * ${...} interpolation, since a stripper that ran over one could corrupt it.
 */
import { readFileSync } from 'node:fs';

const CSS_TEMPLATE = /\/\* css \*\/ `([\s\S]*?)`;/g;

export function stripCssComments(source, file = '<source>') {
  return source.replace(CSS_TEMPLATE, (match, css) => {
    if (css.includes('${')) {
      throw new Error(
        `${file}: css template contains \${...} interpolation; ` +
          'the comment stripper only handles static CSS. Remove the interpolation or exclude this file.',
      );
    }
    const out = css
      // Blank-line compaction must agree across Git checkout line endings.
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]+/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
    return '/* css */ `' + out + '`;';
  });
}

/** Applies the strip to any packages/ui source that holds a css template. */
export function cssCommentPlugin() {
  return {
    name: 'strip-css-comments',
    setup(build) {
      // esbuild uses native filesystem separators in onLoad paths.
      build.onLoad({ filter: /packages[\\/]ui[\\/]src[\\/][^\\/]+\.ts$/ }, (args) => {
        const source = readFileSync(args.path, 'utf8');
        if (!source.includes('/* css */ `')) return null;
        return { contents: stripCssComments(source, args.path), loader: 'ts' };
      });
    },
  };
}
