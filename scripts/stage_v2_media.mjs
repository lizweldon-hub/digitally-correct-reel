#!/usr/bin/env node
/**
 * Digitally Correct Warm Pomelli V2 Web Media Stager (en-ZA)
 *
 * Copies both 56.0s V2 MP4 masters (16:9 and 9:16, < 35 MB, +faststart) into
 * public/media/ and extracts sunlit showreel-poster.jpg (1920x1080) and
 * og-preview.jpg (1200x630) from Clip 8's sunlit stone DC. emblem.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(WEB_ROOT, 'public', 'media');

const SHOWREEL_ROOT = '/Users/lizweldon/Projects/digitally-correct-showreel';
const V2_16X9 = path.join(
  SHOWREEL_ROOT,
  'exports',
  'v2_master',
  'DC_Warm_Capabilities_Showreel_16x9_60fps.mp4'
);
const V2_9X16 = path.join(
  SHOWREEL_ROOT,
  'exports',
  'v2_master',
  'DC_Warm_Capabilities_Showreel_9x16_60fps.mp4'
);
const CLIP_08_SUNLIT_STONE = path.join(
  SHOWREEL_ROOT,
  'public',
  'broll_v2',
  'clip_08.mp4'
);
const BRAND_LOGO = path.join(SHOWREEL_ROOT, 'assets', 'brand', 'dc-logo.png');

async function main() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });

  await fs.copyFile(BRAND_LOGO, path.join(MEDIA_DIR, 'dc-logo.png'));
  await fs.copyFile(V2_16X9, path.join(MEDIA_DIR, 'showreel-16x9.mp4'));
  await fs.copyFile(V2_9X16, path.join(MEDIA_DIR, 'showreel-9x16.mp4'));

  // Extract sunlit 3D DC. stone emblem from Clip 8 (5.8s) for clean poster & OG preview
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss',
    '5.8',
    '-i',
    CLIP_08_SUNLIT_STONE,
    '-frames:v',
    '1',
    '-vf',
    'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080',
    '-q:v',
    '2',
    path.join(MEDIA_DIR, 'showreel-poster.jpg'),
  ]);

  await execFileAsync('ffmpeg', [
    '-y',
    '-ss',
    '5.8',
    '-i',
    CLIP_08_SUNLIT_STONE,
    '-frames:v',
    '1',
    '-vf',
    'scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630',
    '-q:v',
    '2',
    path.join(MEDIA_DIR, 'og-preview.jpg'),
  ]);

  const s16 = await fs.stat(path.join(MEDIA_DIR, 'showreel-16x9.mp4'));
  const s9 = await fs.stat(path.join(MEDIA_DIR, 'showreel-9x16.mp4'));

  const statusPayload = {
    stagedAt: new Date().toISOString(),
    version: '2.0-v2-warm-pomelli',
    locale: 'en-ZA',
    master16x9Ready: true,
    master16x9DurationSec: 56.0,
    master16x9SizeMb: Number((s16.size / (1024 * 1024)).toFixed(2)),
    master9x16Ready: true,
    master9x16DurationSec: 56.0,
    master9x16SizeMb: Number((s9.size / (1024 * 1024)).toFixed(2)),
  };

  await fs.writeFile(
    path.join(MEDIA_DIR, 'media-status.json'),
    `${JSON.stringify(statusPayload, null, 2)}\n`,
    'utf8'
  );

  console.log('Staged Warm Pomelli V2 media:', statusPayload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
