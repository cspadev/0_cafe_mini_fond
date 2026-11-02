// The only place where hexadecimal colours are written (grafika.md chapter 2, 9). CSS uses var(--name), canvas reads `theme`.
export const theme = {
  navy: '#061a45',
  blue: '#0b3a96',
  gold: '#ffcc00',
  text: '#f4f7ff',
  muted: '#b8c3e0',
  sea: '#2c8fd0',
  seaLight: '#52aee3',
  foam: '#ffffff',
  sand: '#f3dfa2',
  wood: '#c8763a',
  woodDark: '#8a4a22',
  sail: '#fff6df',
  ok: '#3ecf6e',
  repaired: '#4aa8ff',
  lost: '#8b93a8',
  warn: '#f59e0b',
  danger: '#e5484d',
  storm: '#5b6aa8',
  stormDark: '#3a4680',
  kraken: '#8e4fc9',
  krakenDark: '#5d2a8e',
  mermaid: '#1fb5a6',
  pearl: '#f4f0ff',
  skin: '#ffd9b3',
  // detail tones of the sailing view (grafika.md chapter 2): rims, decks, shades, sea depth
  seaDeep: '#1f6c9e',
  seaDeeper: '#185b87',
  shallow: '#3fb0d8',
  shallowMid: '#5cc6e0',
  shallowLight: '#86dcec',
  sandDark: '#d4bb78',
  weed: '#6ea85a',
  rock: '#8a8272',
  rockDark: '#5f594c',
  palm: '#3d9a5a',
  palmDark: '#2a7040',
  woodRim: '#e8a266',
  woodDeck: '#dd9a5c',
  sailShade: '#e6d8b8',
  stormLight: '#8c9ad6',
  rain: '#c8e6ff',
  blush: '#ff9bb0',
  krakenLight: '#b684e6',
  krakenSucker: '#f6dcff',
  mermaidDark: '#12857a',
  hairDark: '#c27200',
  pirateHull: '#1a2352',
  pirateDeck: '#6b4a33',
  pirateWindow: '#3c4568',
  pirateFlag: '#14162e',
} as const;

export type ThemeToken = keyof typeof theme;

/** Sail stripe colours of the fleet (grafika.md chapter 5): red, blue, yellow. */
export const sailColors = [theme.danger, theme.repaired, theme.gold] as const;

/** Darker tone of a token for the flat "base" instead of a shadow (grafika.md chapter 3). */
export const darker: Partial<Record<ThemeToken, string>> = {
  gold: '#c79a00',
  blue: '#082a70',
  ok: '#2a9a50',
  repaired: '#2f7ccc',
  danger: '#a82f34',
  lost: '#626a80',
  warn: '#b77508',
  sea: '#1f6c9e',
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Writes the palette to CSS custom properties; called once at start. */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(theme)) root.style.setProperty(`--${kebab(k)}`, v);
  for (const [k, v] of Object.entries(darker)) root.style.setProperty(`--${kebab(k)}-dark`, v as string);
}
