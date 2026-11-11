# Carbon design system

Carbon's interface is a black frame lit by the music, around a quiet graphite stage. The frame (title bar, sidebar, player bar) is drawn straight on one wallpaper layer that takes its colour from the playing song's artwork. Content sits on the stage, an inset rounded panel that stays near-black so artwork and text read the same whatever is playing. Carbon Yellow marks the brand and the active state. Glass is kept for things that float.

All tokens live in `src/app.css`. Components use the tokens, never raw values. Brand colours, the mark and the wordmark are defined in [`brand/BRAND.md`](../brand/BRAND.md).

## Layout

| Region | Size | Notes |
| --- | --- | --- |
| Title bar | 56 px (`--titlebar-h`) | Mark, back/forward, sidebar toggle; lyrics, queue, more; window controls |
| Sidebar | 240 px (`--sidebar-w`), 68 px rail (`--rail-w`) | Search pill, collapsible sections, playlist tree, profile pill |
| Stage | fills the rest | Inset 8 px (`--inset`) from the frame, 12 px corners, 1 px hairline |
| Lyrics panel | 300 px (`--lyrics-w`) | Optional, docked right of the stage, on the frame |
| Player bar | 96 px (`--player-h`) | Track and like, progress over transport, room controls |

The sidebar's sections come from `NAV_SECTIONS` in `src/lib/nav.ts`; a new source of music adds a section there. Layout state (rail, lyrics panel, folded sections) is remembered per PC.

Pages lay out against the stage, not the window. The stage is a size container (`container: stage`), so headers, grids and track lists respond to the space left after the sidebar and lyrics panel. Carbon is designed for 1920 x 1080 and holds down to its minimum window of 980 x 640.

## Colour

| Token | Use |
| --- | --- |
| `--black` | The frame when nothing is loaded |
| `--stage` (Graphite 950) | The content panel |
| `--text`, `--text-muted`, `--text-faint` | Text on the stage. Faint still clears 4.5:1 on a hovered row |
| `--chrome-text`, `--chrome-text-muted` | Text on the frame. Alpha-white, so it holds on any wash |
| `--glass`, `--glass-hover`, `--glass-active`, `--glass-edge` | Fills and hairlines on the stage |
| `--accent` | Carbon Yellow by default; the user can pick another accent |

Yellow is for the mark, focus rings, switches, selection, progress fills, the playing row and the idle player. Anything filled with yellow uses Ink text.

### Colour from artwork

`src/lib/wallpaper.ts` turns an artwork's dominant colours (`paletteFrom` in `src/lib/palette.ts`) into tones, each pinned to a relative luminance so contrast never depends on the cover:

- **Frame wash**: four colour fields, deep enough that Paper text stays above 7:1 and secondary frame text above 4.5:1.
- **Header wash**: two colours that meet behind a detail page's header and fade out about 520 px down.
- **Play pill**: a light tint that keeps Ink text above 7:1.

Without artwork, tones fall back to graphite. `wallpaper.test.ts` checks these limits against near-black, saturated, near-white and missing artwork.

## Artwork

Carbon follows Spotify's display rules for cover art everywhere, and treats local files the same way:

- Artwork is never cropped, distorted, blurred, animated or overlaid. No text, controls or logos sit on it; card buttons sit beside the caption.
- Corners are 8 px for large art (`--r-art`) and 4 px for small art (`--r-art-sm`). Artist photos are round.
- Backgrounds take colour from artwork; they never show a blurred copy of it.
- Film grain is painted on the wallpaper and under glass content, never on top of art.

## Type

One family: Segoe UI Variable (Display for headings, Text for everything else); Settings can swap each role for an installed font. The scale is fixed, not fluid: 11, 12, 13, 14, 15, 20, 34 and 40 px (`--fs-micro` to `--fs-title`). Headings use −0.025 em tracking. Labels are sentence case; only the small fact chips under a title are uppercase.

## Surfaces

- **Stage plates** (`.plate`): settings groups, the equaliser, notices. A faint fill and a hairline, 12 px corners.
- **Glass** (`.glass`): menus, dialogs, toasts, popovers, the queue and tooltips. Blur and saturation of what's behind, a top highlight, a soft shadow and grain under the content. There is one wallpaper layer and glass only where something floats, so the GPU blurs little.
- **Controls**: one vocabulary. `.pill` buttons (`.accent`, `.ghost`, `.danger`), `.segmented` choices, 44 px circles in detail headers, `select` and `.input` fields.

## Motion

Only `transform`, `opacity` and `clip-path` animate (plus small colour changes on hover).

- **Press**: controls scale to 0.96 (`--press`) in 90 ms and spring back; wide rows use 0.985 (`--press-wide`). Cards and tiles that carry artwork answer a press with a deeper fill instead, so the art never scales.
- **Hover**: surfaces lift by fill, never by moving or scaling artwork.
- **Press and hold** (`src/lib/hold.ts`): holding a row, card or playlist for 450 ms opens its menu. A fill sweeps across the element as it charges, and the release's click is swallowed. The same menu is always reachable by right-click, the menu key or the "…" button.
- **Wallpaper**: fields drift over 46 to 64 s and cross-fade over 1.4 s when the song changes. Paused music dims the wash.
- **Tooltips** appear after 400 ms of hover or keyboard focus.

The **Effects** setting scales all of this: Full animates the wallpaper and shows grain; Balanced keeps the colour and grain but holds still; Minimal uses one flat tone, no blur, no grain and no motion. The wallpaper stops while the window is hidden, and `prefers-reduced-motion` turns animation off.

## Loading

The loading screen is plain HTML and CSS inside `src/app.html`, so it paints before any script runs: the yellow mark on black with a soft breathing halo and a thin shimmer. The app removes it as soon as it knows which screen to show and has drawn it. There is no minimum display time.

## Sound

Interface sounds are synthesised with WebAudio (`src/lib/ui-sound.ts`); there are no audio files. Taps for buttons, a soft whoosh for links that change the page, a rising pair for switching on, a falling pair for switching off, a short chime for completing a hold and a low pair for errors. The default volume peaks around −24 dBFS and never exceeds −18 dBFS.

Carbon never plays its own sounds over Spotify's audio: they are silent whenever a Spotify track is playing, and may play while paused, idle or on a local file. Settings → Interface sounds turns them off or sets the volume.

## Accessibility

- Text meets WCAG AA on the stage and on any frame wash.
- Every control is reachable by keyboard and shows a 2 px accent focus ring.
- Icon buttons carry labels; tooltips repeat them for pointer users.
- Menus follow the WAI-ARIA menu pattern; dialogs are native `<dialog>` elements.
