/**
 * WebAble brand mark for the widget surfaces (launcher + panel head).
 * The official white-on-transparent export (public/brand/webable-mark-light.png)
 * downscaled and inlined as a data URI, so it renders identically on any host
 * site and inside the extension with no network fetch or CSP concerns.
 *
 * 64px at a 64-colour palette. It was 96px at full depth, which was 5.7 KB of
 * base64 in the eager bundle: base64 of already-compressed data barely gzips,
 * so it was one of the largest single things the widget shipped, for a mark
 * drawn at 32px on the launcher and 22px in the panel head. The mark only has
 * a handful of colours, so 64 of them is lossless in practice (32 and 16
 * encode to the same size), and 64px still covers a 2x display at the larger
 * of the two sizes.
 * Regenerate: sharp(src).resize(64).png({ palette: true, colors: 64, effort: 10 })
 */
import type { JSX } from 'preact';

const MARK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAMFBMVEV4jaM11N0EJJDr5+IMJmbZ1tQmkeAEGGfj4uQqh/ksttv58Ob37ub/+/AHPd6GtPe3ImHuAAAAC3RSTlMB/e+uPmBwkez9tsAC0kQAAAAJcEhZcwAACxMAAAsTAQCanBgAAAIxSURBVHjahZU9aNtAFMdfqJWEbgeh0FV0Vrx0S8ABgZcOgiyBRpBA8dShaNGYQCgYSva4paRdPHTvdCcolEwnTcJQkLV0KxR7LQST3On0YUvvrm+9x+/9730CbNjx+OolGOwgz6LM4HGSxcLyvu7dKt7jONU5+Ew5JH0zQIuoADpEA9AgGgCOWAegCAngBhUSwBuHLuI1izesjbDyKIso1as4GUvjGTN8xA3sxW1iUAG90HaW3JSL3tB2bkwI6bG4N+a7FzrLefnO7yzMI3AqBPVOsaIO7WWpYgbXKY5YlZ/YnScmRAqHGp1CBZOAJ3O8L0S6lpxGKfiS8x2LETi3/x5eWE0uRmetbAXO4vfgVaGEewDnhAw2PdwwfLdzXRVkmxCy1w10oRKaXMJT4UBGpdWo3l+VLv4DtoiySWEfRyPXdQF2PseVw5F6fz6pPd5Ih09VxRRhOm3FWAshNTzrityvRcJXQr60unMYDob1N2H72xRJFLwtYiQe0naBM3kQqS5i/OoGF93/5wONfqpizbB+cFaCHunKLQCqbXUNIwFKv4e2XA2I+cziKTo5q7Ltmef3sS/Wg5NcWliAEsDQ0SsWwFw7m4JvL5rx5+0vuKFtWiBqBcU50wGsPM9pZlhixRps1k9XgVikfH0LshRZxZTWm5YjVSgQzLSffCbMdFEEogqguUm+SUF5EdTIs1R7FuVHGdOdRYmg8upoDyuc/uc0y+NOo/y96fwfj8et4/8IJd1bu954OuYAAAAASUVORK5CYII=';

export function BrandGlyph({ size }: { size: number }): JSX.Element {
  return <img src={MARK} width={size} height={size} alt="" style={{ display: 'block' }} />;
}
