# Real coloring-page artwork

`index.html` automatically uses whatever images are listed in
`assets/coloring/manifest.json` for coloring pages, falling back to the
built-in vector-drawn scenes if that file doesn't exist yet or an image fails
to load. You never edit `index.html` to add or remove art — just regenerate
the library and push.

## One-time setup (Option A: reusable art library, not per-book generation)

```
export OPENAI_API_KEY=sk-...
node scripts/generate-coloring-library.js
```

This generates ~20 themed scenes (road trip, farm, coastal, mountain,
national park, desert, airport, train, campsite, etc.) at medium quality,
saves them to this folder, and writes `manifest.json`. Cost: roughly
$1.70–2.20, one time. Commit the PNGs + `manifest.json` and push — Netlify
redeploys and the next generated book uses real art automatically.

To change the scene list (add/remove themes), edit the `SCENES` array at the
top of `scripts/generate-coloring-library.js` before re-running. Re-running
regenerates everything (re-spends the ~$2), it doesn't top up incrementally.

## Adding a one-off image by hand

You don't need the script for this — generate an image any way you like
(ChatGPT, Midjourney, etc.), export as PNG per the spec below, drop it in
this folder, and add its filename to `manifest.json`.

## Prompt spec (what the script sends, and what to match if generating by hand)

```
Create a black-and-white printable coloring book page for children ages 6-10.

Scene: [DESCRIBE — e.g. "A smiling sun shines over a winding road leading
toward a red barn and silo. Rolling hills, pine trees, flowers, birds, and
fluffy clouds surround the scene. A friendly cartoon car drives along the
road. Hidden throughout the illustration are a suitcase, binoculars, a
compass, and a camera."]

One large focal illustration occupying 70-80% of the page, with numerous
secondary objects, background scenery, and a decorative border. Every
character and object must be fully drawn with complete, closed outlines —
no missing lines, no clipped edges, no cropped objects at the page border
unless intentionally full-bleed. Use smooth curves, uniform 4-6pt stroke
width, rounded joins and caps, black outlines only, no shading, no gray
tones, no solid black fills, no cross-hatching, no background textures.
White interior regions for coloring. Cheerful, hand-drawn, kid-friendly
style suitable for commercial coloring books — comparable to Highlights,
Usborne, or Dover Publications activity books.

Output: portrait 8.5 x 11 inches, 300 DPI, print-ready, clear white margin
border, no color, no watermark.
```

Before accepting an image, check it against this list:

- [ ] Every object has a complete, closed outline (no gaps, no broken paths)
- [ ] No missing facial features on any character
- [ ] Nothing is cropped or clipped at the page edge (unless full-bleed is intended)
- [ ] Line weight is consistent throughout
- [ ] Plenty of white interior area to actually color
- [ ] Reads as one cohesive scene, not a grid of disconnected icons

## Sizing

The generator fits whatever resolution/aspect ratio you give it into the
page automatically (`tryRenderRealColoringImage` in index.html), preserving
aspect ratio and centering it — so exact pixel dimensions aren't critical,
but 1024x1536px portrait (what the script requests) is the safe target.

