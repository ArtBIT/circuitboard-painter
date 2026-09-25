# Circuit Board Painter

[![Demo](https://github.com/ArtBIT/circuitboard-painter/blob/main/assets/header.png)](http://artbit.github.io/circuitboard-painter/)

[![GitHub license](https://img.shields.io/github/license/ArtBIT/circuitboard-painter.svg)](https://github.com/ArtBIT/circuitboard-painter)
[![GitHub stars](https://img.shields.io/github/stars/ArtBIT/circuitboard-painter.svg)](https://github.com/ArtBIT/circuitboard-painter)
[![awesomeness](https://img.shields.io/badge/awesomeness-maximum-red.svg)](https://github.com/ArtBIT/circuitboard-painter)

This is a tiny web app that generates procedural circuit board patterns with interactive flow field painting.

# Demo
Try out the live demo http://artbit.github.io/circuitboard-painter/

<video src="https://github.com/user-attachments/assets/442a6f90-cf71-4873-b24f-a952f60e8ae0" width="320" height="240" controls></video>

# How it works

Traces are grown cell by cell on a grid, each one turning randomly (controlled by *straightness*) until it runs into another trace or reaches its maximum length. Painting on the canvas builds a **flow field**. Traces that pass through painted areas bend to follow the direction of your strokes.

# Features

- **Three painting tools**: a flow brush, a straight guide that snaps to 45°, and an eraser (right-drag erases with any tool)
- **Mouse, touch and pen** input, including pen pressure
- **Undo / redo** for strokes and every setting
- **Live, on release or manual** trace updates while you paint
- **Palettes** and full control over colors, trace width, pad style and size, and glow
- **Export** to PNG (up to 4× resolution, optional transparent background) or SVG, or copy the image to the clipboard
- **Share links** that include your settings and your painted flow
- Your work is **saved automatically** in the browser
- Cell size changes and window resizes keep your painted flow in place
- Responsive layout for phones and tablets, and full keyboard control

# Keyboard shortcuts

| Key | Action |
| --- | --- |
| `B` / `L` / `E` | Flow brush / straight guide / eraser |
| `[` / `]` | Smaller / larger brush |
| `R` | New random board |
| `←` / `→` | Previous / next seed |
| `A` | Play the build animation |
| `F` / `G` | Toggle flow overlay / grid |
| `Enter` | Apply flow (manual update mode) |
| `Del` | Clear the flow field |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+S` / `Ctrl+Shift+S` | Save PNG / SVG |
| `P` / `H` | Toggle the settings panel / hide the whole interface |
| `Esc` | Cancel the current stroke |
| `?` | Help |

# Running it locally

There is no build step and there are no dependencies.

```
git clone https://github.com/ArtBIT/circuitboard-painter.git
cd circuitboard-painter
# ES modules need to be served over HTTP:
python3 -m http.server 8000
# Then open http://localhost:8000 in your browser
```

# Project layout

| File | Purpose |
| --- | --- |
| `js/main.js` | App state, render loop, actions, keyboard, persistence |
| `js/generator.js` | Trace generation |
| `js/flowGrid.js` | Flow field storage, resampling and compact encoding |
| `js/painter.js` | Pointer input and brushes |
| `js/renderer.js` | Canvas and SVG rendering |
| `js/ui.js` | Settings panel, tooltips, toasts and help |
| `js/params.js` | Defaults, ranges, palettes and validation |

# Credits

Inspired by https://codepen.io/tsuhre/pen/xgmEPe

# License

[MIT](LICENSE)
