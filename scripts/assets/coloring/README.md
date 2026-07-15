# Real coloring-page artwork

`index.html` automatically uses whatever images are listed in
`assets/coloring/manifest.json` for coloring pages, falling back to the
built-in vector-drawn scenes if that file doesn't exist yet or an image fails
to load. You never edit `index.html` to add or remove art — just regenerate
the library and push.

## One-time setup (Option A: reusable art library, not per-book generation)
