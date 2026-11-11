# Carbon brand

Carbon's identity is one yellow mark on graphite. It's a carbon ring that opens into a C. The colour is loud and the shapes are quiet.

## The mark

A pointy-top hexagon (the six-atom carbon ring) with its right edge removed, so the ring reads as a **C**.

- **Construction.** The mark is drawn on a grid of eighths of its height *H*. Its width is 0.866 *H*.
  - Outer hexagon: *H* tall.
  - Counter (inner hexagon): *H*/2 tall.
  - Aperture: *H*/4 tall, cut with horizontal edges.
  - Right-edge stubs: *H*/8 each.
  - The wall has the same thickness all the way round.
- **Forms.** It is always flat and one colour. There are no gradients, glows or outlines, except the tray icon's keyline (see Tray).
- **Why this one.** We explored six directions, all in `explorations/`; `explorations-sheet.png` compares them at 16 to 200 px. This was the only one that read as a C in yellow, ink and black at 16 px.
  - `b-cell-flat`, the flat-top hexagon, looked aggressive, like a gaming brand.
  - `c-notch` lost the C at small sizes.
  - `d-groove` was a generic ring C (Coinbase territory).
  - `e-lattice` broke up below 32 px and drifted toward Bumble's honeycomb.
  - `f-orbit` was the old idea flattened. Its dot disappeared at 16 px and read as ©.
  - `v1-liquid-ring` is the retired mark: a thin glass stroke with a pearl core in a cyan, violet and pink gradient.

| File | Use |
| --- | --- |
| `carbon-mark.svg` | Yellow mark, for dark surfaces |
| `carbon-mark-black.svg` / `carbon-mark-white.svg` | One-colour versions |
| `carbon-wordmark-{black,white,paper}.svg` | Wordmark alone |
| `carbon-lockup.svg` | Yellow mark with a paper wordmark, for dark surfaces |
| `carbon-lockup-on-yellow.svg` | All ink, for yellow surfaces |
| `carbon-lockup-{black,white}.svg` | One-colour lockups |
| `carbon-icon.svg` (+ `carbon-icon-512.png`) | App icon master: graphite tile, fed to `npx tauri icon` |
| `carbon-icon-mark.svg` | App-icon mark on transparent, for dark surfaces only |
| `tray/carbon-tray-{16,20,24,32}.svg` | Tray icons, pixel-fitted with an ink keyline |
| `favicon.svg` | Browser tab icon: a compact tile |

## Wordmark

The wordmark is **carbon**, always lowercase. It is custom-drawn, so it needs no font file.

- It is a geometric monoline. The bowls are true circles, the stroke is 25 % of the x-height, and the ascender is 1.4 × the x-height.
- The c borrows the mark's horizontal cuts, which ties the two together.
- The round letters contrast with the angular mark.
- Don't retype it in a font, and don't track it out.

**Horizontal lockup**

- The mark is 1.12 × the ascender height.
- It is centred on the ascender-to-baseline block.
- The gap between mark and wordmark is half the mark's width.
- There is no vertical lockup. When the space is square, use the mark alone.

## Colour

| Role | Name | sRGB | oklch |
| --- | --- | --- | --- |
| Primary | **Carbon Yellow** | `#FAE91D` | `oklch(92% 0.19 104)` |
| Pressed or hover on yellow | Yellow Deep | `#E4D530` | `oklch(86% 0.17 104)` |
| Text on yellow, darkest surface | **Ink** | `#10100D` | `oklch(17% 0.006 107)` |
| Page background | Graphite 950 | `#090907` | `oklch(14% 0.005 107)` |
| Surface | Graphite 900 | `#181714` | `oklch(20.5% 0.006 92)` |
| Raised surface | Graphite 800 | `#22221E` | `oklch(25% 0.007 107)` |
| Lines, plates | Graphite 700 | `#33332E` | `oklch(32% 0.009 107)` |
| Secondary text on light | Graphite 500 | `#5E5E58` | `oklch(48% 0.009 107)` |
| Muted text on dark | Graphite 300 | `#9F9F96` | `oklch(70% 0.013 107)` |
| Light text on dark, light surface | **Paper** | `#EFEFE6` | `oklch(95% 0.012 107)` |

The neutrals carry a trace of the yellow's hue (about 104°), so graphite and yellow read as one family.

There is no secondary brand colour. Status colours (success, warning, error) are functional only. Warning is orange (`#F99549`), so it never looks like the brand yellow.

**Contrast (WCAG 2.x)**

| Pair | Ratio | Verdict |
| --- | --- | --- |
| Ink on Carbon Yellow | 15.2 : 1 | AAA, the only text colour on yellow |
| Ink on Yellow Deep | 12.6 : 1 | AAA |
| Carbon Yellow on Graphite 950 | 15.9 : 1 | AAA |
| Carbon Yellow on Graphite 700 | 10.1 : 1 | AAA |
| Paper on Graphite 950 | 17.2 : 1 | AAA |
| Graphite 300 on Graphite 950 | 7.5 : 1 | AAA |
| Graphite 300 on Graphite 800 | 6.0 : 1 | AA |
| Graphite 500 on Paper | 5.6 : 1 | AA |
| Ink on Paper | 16.5 : 1 | AAA |
| Carbon Yellow on Paper | 1.1 : 1 | **Never** |
| Carbon Yellow on white | 1.25 : 1 | **Never** |
| White on Carbon Yellow | 1.25 : 1 | **Never** |

**Rules**

1. Text on yellow is always Ink. Never use white or grey on yellow.
2. Yellow is never text, an icon or a focus ring on light backgrounds. On Paper or white, use Ink.
3. Use yellow as a fill (buttons, the mark, active states) or as text on Graphite 700 and darker.
4. Keep yellow scarce. One yellow call to action per view. Everything else is graphite and paper.

## Clear space and minimum size

**Clear space**

- Keep **X = *H*/4** clear on every side of the mark and the lockup. *H* is the mark's height, so X equals the height of the C's aperture.
- No text, edges or other logos may enter that space.

**Minimum sizes**

| Asset | Screen | Print |
| --- | --- | --- |
| Mark | 16 px tall | 5 mm |
| Lockup | 96 px wide | 25 mm |
| Wordmark alone | 64 px wide | 18 mm |

Below 32 px on screen, use the pixel-fitted tray files rather than scaling the master.

## App icon, tray, favicon

**App icon**

- The icon is a graphite plate (`#2A2A25` to `#0B0B09`, with a faint top light and a hairline rim) carrying the yellow mark.
- The mark is 57 % of the artboard height. The plate is inset 48 of 1024 units, with a corner radius of 208.
- **Never put the mark on a yellow plate.** A yellow rounded square with a dark glyph reads as Snapchat.
- To regenerate the app icons, run `npx tauri icon <1024 px render of carbon-icon.svg>`, then delete `android/` and `ios/`.

**Tray**

- The tray icon is the yellow mark with an ink keyline: 1 px at 16, 20 and 24 px, and 2 px at 32 px.
- The keyline lets it hold on both the light (`#F3F3F3`) and dark (`#202020`) taskbar.
- Its straight edges sit on whole pixels.
- Carbon picks the PNG that matches the display scale (100, 125, 150 and 200 %).

**Favicon and touch icon**

- The favicon is a 64-unit tile with a larger mark, so it holds at 16 px in light and dark tab strips.
- The apple-touch-icon is a full-bleed opaque square, because iOS applies its own mask.

## In the product

- **Accent.** Carbon Yellow is the app's default accent (`yellow`) and the website's accent.
  - The other accent presets remain the user's choice.
  - The logo stays Carbon Yellow whichever accent is picked.
  - Buttons filled with the accent always use Ink text.
- **Spotify and YouTube marks.** When Carbon shows Spotify or YouTube content, use their marks as their own guidelines require. Never blend them into Carbon's mark.

## Do

- Use the supplied files.
- Put the yellow mark on graphite or Ink, and the Ink mark on yellow.
- Use black or white versions over photos and on single-colour print.
- Scale proportionally, and respect X and the minimum sizes.

## Don't

- Don't rotate, skew, stretch, outline, bevel, add a drop shadow or add a gradient to the mark.
- Don't recolour it outside the palette, or put two colours inside it.
- Don't add the old pearl dot.
- Don't place yellow on white, on Paper or on busy photos.
- Don't put the mark in a yellow square or circle.
- Don't build new shapes from the mark, or use it as a letter inside words.
- Don't place the lockup's parts in a different arrangement.
- Don't drift toward these neighbours' marks:
  - Snapchat's ghost and yellow square
  - YouTube's play triangle
  - Spotify's three arcs
  - Apple Music's note
  - SoundCloud's cloud and bars
  - Deezer's equaliser bars
  - Bandcamp's parallelogram
  - Bumble's honeycomb
