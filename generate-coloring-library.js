#!/usr/bin/env node
/**
 * generate-coloring-library.js
 *
 * ONE-TIME batch script — NOT part of the Netlify build, NOT called per book.
 * Run this locally whenever you want to (re)generate the reusable coloring-page
 * art library. It costs real money (OpenAI image API) but only runs when YOU
 * run it, not on every deploy or every customer purchase.
 *
 * Usage:
 *   export OPENAI_API_KEY=sk-...
 *   node scripts/generate-coloring-library.js
 *
 * Output:
 *   assets/coloring/*.png            (the generated art)
 *   assets/coloring/manifest.json    (list of filenames — index.html reads this
 *                                     automatically, so no code edits needed
 *                                     after running this script)
 *
 * Cost: ~24 images at "medium" quality ≈ $1.70–2.20 total (one time).
 * Re-running regenerates everything and re-spends that amount — it does not
 * top up incrementally. To add just a few more scenes later, either edit the
 * SCENES list down to the new ones before re-running, or generate those by
 * hand and drop them in assets/coloring/ + add their names to manifest.json.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'coloring');
const MODEL = 'gpt-image-1.5';
const QUALITY = 'medium';      // low | medium | high — medium is the quality/cost sweet spot
const SIZE = '1024x1536';      // portrait, closest available to 8.5x11

const STYLE_SUFFIX = `
One large focal illustration occupying 70-80% of the page, with numerous secondary
objects, background scenery, and a decorative border. Every character and object
must be fully drawn with complete, closed outlines -- no missing lines, no clipped
edges, no cropped objects at the page border. Use smooth curves, uniform 4-6pt
stroke width, rounded joins and caps, black outlines only, no shading, no gray
tones, no solid black fills, no cross-hatching, no background textures. White
interior regions for coloring. Cheerful, hand-drawn, kid-friendly style suitable
for commercial coloring books -- comparable to Highlights, Usborne, or Dover
Publications activity books. Portrait orientation, 300 DPI, print-ready, clear
white margin border, black and white line art only, no color, no watermark.
`.trim().replace(/\s+/g, ' ');

// One scene per line item; filename is derived from the key. Keep this list to
// ~20-30 to control cost. Add/remove/edit freely before running.
const SCENES = [
  ['farm-1', "A winding country road through farmland, with a red barn, a silo, grazing cows and horses, a tractor in a cornfield, split-rail fences, and a friendly cartoon car driving down the road toward the horizon."],
  ['farm-2', "A farmyard scene with chickens, a barn, a windmill, hay bales, sunflowers, and a dirt path leading to rolling green hills in the background."],
  ['farm-3', "A cornfield maze scene from above, with a scarecrow, a red barn, pumpkins, crows flying overhead, and winding pathways through the corn."],
  ['coastal-1', "A coastal highway along cliffs above the ocean, with a lighthouse, sailboats, seagulls, sand dunes, beach grass, and a car driving along the winding road."],
  ['coastal-2', "A beach boardwalk scene with a pier, seashells, starfish, a sandcastle, palm trees, and gentle waves rolling in."],
  ['mountain-1', "A mountain highway with switchback turns, pine forests, a waterfall, deer grazing near the road, and snow-capped peaks in the background."],
  ['mountain-2', "A national park scene with a ranger station, hiking trail, a family with backpacks, a bear and cubs in the distance, tall pine trees, and a scenic overlook."],
  ['park-1', "A wide national park vista with bison grazing on the plains, a winding river, geysers steaming in the distance, and a wooden welcome sign."],
  ['desert-1', "A desert highway scene with tall saguaro cacti, mesas, a roadrunner, tumbleweeds, and a dramatic sunset sky."],
  ['road-1', "A cheerful road trip scene: a winding highway through rolling hills with a smiling sun overhead, fluffy clouds, roadside wildflowers, birds flying, and a packed car with a roof rack driving toward the horizon."],
  ['road-2', "A highway rest stop scene with a gas station, a diner, a water tower, picnic tables, a few parked cars and trucks, and travelers stretching their legs."],
  ['road-3', "A scenic overlook pull-off on a mountain road, with a family taking photos, a guardrail, distant valleys, and hawks circling overhead."],
  ['road-4', "A small town Main Street scene with a welcome sign, storefronts, a clock tower, streetlamps, and a car driving through on a road trip."],
  ['bridge-1', "A big suspension bridge crossing a wide river, with boats below, birds flying alongside, and a car driving across."],
  ['airport-1', "A busy but friendly airport scene with an airplane at the gate, luggage carts, a pilot waving, departure signs, and a family walking with rolling suitcases."],
  ['train-1', "A classic train station scene with a steam-style passenger train, a conductor waving, luggage on a cart, and a clock tower."],
  ['camp-1', "A campsite scene with a tent, a campfire with marshmallows roasting, pine trees, a canoe by a lake, stars overhead, and a friendly raccoon peeking out."],
  ['welcome-1', "A state welcome sign scene along a highway, with rolling hills, wildflowers, a split-rail fence, birds, and fluffy clouds surrounding the sign."],
  ['animals-1', "A wildlife scene with a deer family, rabbits, squirrels, and birds in a forest clearing, with tall trees, ferns, and dappled sunlight."],
  ['generic-1', "A cheerful road trip landscape with hills, a winding road, a smiling sun, hot air balloons in the sky, wildflowers, and a small car driving toward distant mountains."]
];

async function generateOne(key, prompt){
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: `${prompt} ${STYLE_SUFFIX}`,
      size: SIZE,
      quality: QUALITY,
      n: 1
    })
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text.slice(0,300)}`);
  }
  const data = await res.json();
  const b64 = data.data && data.data[0] && data.data[0].b64_json;
  if(!b64) throw new Error('No image returned');
  return Buffer.from(b64, 'base64');
}

async function main(){
  const key = process.env.OPENAI_API_KEY;
  if(!key){
    console.error('Set OPENAI_API_KEY first, e.g.:\n  export OPENAI_API_KEY=sk-...');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Generating ${SCENES.length} images at ${QUALITY} quality (${SIZE})...`);
  console.log(`Estimated cost: roughly $${(SCENES.length * 0.08).toFixed(2)}–$${(SCENES.length * 0.10).toFixed(2)} total.\n`);

  const manifest = [];
  for(const [key_, prompt] of SCENES){
    const filename = `${key_}.png`;
    process.stdout.write(`  ${filename} ... `);
    try{
      const buf = await generateOne(key, prompt);
      fs.writeFileSync(path.join(OUT_DIR, filename), buf);
      manifest.push(`assets/coloring/${filename}`);
      console.log('done');
    } catch(err){
      console.log(`FAILED (${err.message})`);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${manifest.length}/${SCENES.length} images to ${OUT_DIR}`);
  console.log(`Wrote manifest.json — index.html will pick these up automatically on next page load.`);
  console.log(`\nCommit and push assets/coloring/ (images + manifest.json) to deploy.`);
}

main();
