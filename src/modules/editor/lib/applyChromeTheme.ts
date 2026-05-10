import { PALETTES, type ThemeId, type ThemePalette } from "./themes";

/**
 * Override Tailwind/shadcn CSS variables on `<html>` so the app chrome
 * (sidebar, headers, borders, accents, etc.) takes its colors from the
 * active editor palette instead of the generic dark/light defaults.
 *
 * Without this, the editor renders Catppuccin while the rest of the UI
 * is a generic shadcn slate — the "mushy colors" complaint. Setting these
 * vars inline beats class-based selectors (.dark, :root) in cascade.
 */
export function applyChromeTheme(themeId: string): void {
  const palette = PALETTES[themeId as ThemeId];
  if (!palette) return;

  const root = document.documentElement;
  const isLight = palette.base === "vs";
  // next-themes flips this class; we want our overrides to apply regardless,
  // so we don't fight it — just sync it.
  root.classList.toggle("dark", !isLight);
  root.style.colorScheme = isLight ? "light" : "dark";

  const set = (k: string, v: string) => root.style.setProperty(k, v);
  const hex = (h: string) => `#${h}`;
  // Subtle border: foreground at low alpha (looks the same on every palette).
  const borderAlpha = isLight ? "1A" : "26";
  const ringAlpha = "55";

  set("--background", hex(palette.bg));
  set("--foreground", hex(palette.fg));
  set("--card", hex(palette.bgElev));
  set("--card-foreground", hex(palette.fg));
  set("--popover", hex(palette.bgElev));
  set("--popover-foreground", hex(palette.fg));
  set("--primary", hex(palette.function));
  set("--primary-foreground", hex(palette.bg));
  set("--secondary", hex(palette.bgElev));
  set("--secondary-foreground", hex(palette.fg));
  set("--muted", hex(palette.bgElev));
  set("--muted-foreground", hex(palette.fgMuted));
  set("--accent", hex(elevate(palette, isLight ? -0.04 : 0.06)));
  set("--accent-foreground", hex(palette.fg));
  set("--destructive", hex(palette.keywordControl));
  set("--border", `${hex(palette.fg)}${borderAlpha}`);
  set("--input", `${hex(palette.fg)}${borderAlpha}`);
  set("--ring", `${hex(palette.function)}${ringAlpha}`);

  set("--sidebar", hex(palette.bgElev));
  set("--sidebar-foreground", hex(palette.fg));
  set("--sidebar-primary", hex(palette.function));
  set("--sidebar-primary-foreground", hex(palette.bg));
  set("--sidebar-accent", hex(elevate(palette, isLight ? -0.04 : 0.06)));
  set("--sidebar-accent-foreground", hex(palette.fg));
  set("--sidebar-border", `${hex(palette.fg)}${borderAlpha}`);
  set("--sidebar-ring", `${hex(palette.function)}${ringAlpha}`);

  // Convenience: surface a few palette colors for components that want them.
  set("--terax-cursor", hex(palette.cursor));
  set("--terax-comment", hex(palette.comment));
  set("--terax-keyword", hex(palette.keyword));
  set("--terax-function", hex(palette.function));
  set("--terax-string", hex(palette.string));
}

/**
 * Lighten or darken a palette's elevation color by `delta` (where positive
 * means lighter for dark themes, darker for light themes — i.e. "more
 * elevated"). Returns a hex string without `#`.
 */
function elevate(palette: ThemePalette, delta: number): string {
  const [r, g, b] = hexToRgb(palette.bg);
  const factor = palette.base === "vs" ? 1 - delta : 1 + delta;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const nr = clamp(r * factor);
  const ng = clamp(g * factor);
  const nb = clamp(b * factor);
  return rgbToHex(nr, ng, nb);
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `${h(r)}${h(g)}${h(b)}`.toUpperCase();
}
