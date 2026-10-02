/**
 * Gulp's two bundled fonts, declared in gulp.css: chunky rounded words and
 * pixel arcade digits. The scene paints name tags, speech bubbles and points
 * on canvases, which draw with a font only once it has loaded, so the stage
 * waits for both before it builds the city.
 */
export const WORDS = "'Gulp Rounded', ui-rounded, system-ui, -apple-system, sans-serif";
export const DIGITS = "'Gulp Pixel', 'Gulp Rounded', ui-rounded, system-ui, sans-serif";

/** Never holds up a round for long: the fonts are local, and a slow load just paints with the fallback. */
const PATIENCE_MS = 1500;

export function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const both = Promise.all([document.fonts.load(`900 30px ${WORDS}`), document.fonts.load(`34px ${DIGITS}`, '+0123456789')]);
  const late = new Promise<void>((done) => window.setTimeout(done, PATIENCE_MS));
  return Promise.race([both.then(() => undefined), late]).catch(() => undefined);
}
