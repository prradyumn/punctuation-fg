# village — "Final" game assets

**Source:** Figma `9xydFCYrapJ6V0ypxX1l3c` ("village"), section **Final** (`94:16`). Pulled 20 Aug 2026 via Figma MCP.

One flat folder. Every duplicate removed — the 12 slides in the Final section reuse the same art, so the whole scene is these files.

## Art (PNG, transparent, source resolution)

| File | Size | Use |
|---|---|---|
| `desk-wood.png` | 1672 × 1071 | Table background, tiles horizontally |
| `envelope.png` | 1254 × 1254 | Airmail envelope, hero size |
| `envelope-icon.png` | 314 × 314 | Same envelope for the progress pill |
| `stamp-tray.png` | 2172 × 724 | Tray the stamps sit in |
| `stamp-period.png` | 280 × 446 | Full-stop stamp (blue) |
| `stamp-comma.png` | 281 × 446 | Comma stamp (green) |
| `stamp-question.png` | 280 × 444 | Question-mark stamp (yellow) |
| `stamp-exclamation.png` | 285 × 444 | Exclamation stamp (red) |
| `stamp-apostrophe.png` | 281 × 445 | Apostrophe stamp (purple) |
| `ready-to-post.png` | 1254 × 1254 | "READY TO POST" success badge |

The five stamps were sliced out of a single strip export, so each is now independently animatable.

## Vectors (SVG — the only true vectors in the file)

| File | Size | Use |
|---|---|---|
| `letter-card.svg` | 1173 × 656 | The letter card the text sits on |
| `card-small.svg` | 272 × 152 | Small card / pill shape |
| `badge-ellipse.svg` | 65 × 56 | Cream ellipse behind the stamp face |
| `arrow-right.svg` | 14 × 15 | Right chevron |

## Reference

`reference-slide-64.png`, `reference-slide-75.png` — two full slide renders @2x (3840 × 2160) showing how the pieces compose. `contact-sheet.png` is a visual index.

## On SVG for animation

The desk, envelope, tray, stamps and badge are baked bitmaps with 3D shading — no vector source exists in the Figma file. Auto-tracing them costs quality and file size (84 KB of fringed paths vs a 30 KB clean PNG), so the PNGs above are the right animation source. Resolution is generous, so scale up freely. Clean vectors would mean redrawing the props in Figma.
