import type { CSSProperties } from "react";

/**
 * A handful of shared inline-style objects, module-scope constants (not
 * recreated per render) — mirrors `app/page.tsx`'s own existing inline-
 * style convention (this project has no CSS-class stylesheet the way the
 * sibling projects do; `app/globals.css` is a bare reset). Kept minimal on
 * purpose: this milestone's job is the demo mechanic, not a design system.
 *
 * `minmax(260px, 1fr)` in `DemoAssistant`'s own grid (not here — see that
 * file) is what makes the side-by-side layout collapse to one column
 * under ~375px without a media query: two 260px columns plus a gap do not
 * fit a 375px viewport, so `auto-fit` drops to one column on its own.
 */
export const card: CSSProperties = {
  border: "1px solid #8884",
  borderRadius: 8,
  padding: "1rem",
  marginBottom: "1rem",
  maxWidth: "100%",
};

export const mono: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "0.9em",
};

export const muted: CSSProperties = {
  opacity: 0.75,
  fontSize: "0.92em",
};

export const label: CSSProperties = {
  display: "block",
  fontSize: "0.85em",
  opacity: 0.8,
  marginBottom: "0.25rem",
};

export const textInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.5rem",
  marginBottom: "0.5rem",
  fontSize: "1em",
};

export const smallInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.4rem",
  fontSize: "0.95em",
};

export const button: CSSProperties = {
  padding: "0.55rem 1rem",
  fontSize: "1em",
  cursor: "pointer",
};

export const errorText: CSSProperties = {
  color: "#b00020",
  fontSize: "0.9em",
};
