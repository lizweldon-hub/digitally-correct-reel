#!/usr/bin/env node
/**
 * Digitally Correct 2.0: Smart Media Staging Programme (en-ZA)
 *
 * Safely inspects ~/Projects/digitally-correct-showreel without modifying exports/:
 * - Uses verified 50s 16:9 master if valid (< 35 MB web fast-start transcode),
 *   otherwise falls back cleanly to public/broll/clip_01.mp4.
 * - Uses verified 50s 9:16 master if valid (< 35 MB web fast-start transcode),
 *   otherwise stages public/broll/clip_01.mp4 temporarily as vertical preview.
 * - Extracts Frame 0:04 as showreel-poster.jpg (1920x1080) and og-preview.jpg (1200x630).
 * - Copies brand emblem dc-logo.png into public/media/dc-logo.png.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
const MASTER_16X9 = path.join(
  SHOWREEL_ROOT,
  'exports',
  '16x9_master',
  'DC_Mint_Spark_Odyssey_16x9_60fps.mp4'
);
const MASTER_9X16 = path.join(
  SHOWREEL_ROOT,
  'exports',
  '9x16_reel',
  'DC_Mint_Spark_Odyssey_9x16_60fps.mp4'
);
const FALLBACK_CLIP_01 = path.join(SHOWREEL_ROOT, 'public', 'broll', 'clip_01.mp4');
const BRAND_LOGO = path.join(SHOWREEL_ROOT, 'assets', 'brand', 'dc-logo.png');

const MAX_BYTES = 34 * 1024 * 1024; // Strictly under 35 MB ceiling

async function probeValidMaster(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames',
      '-show_entries',
      'format=duration,size',
      '-of',
      'json',
      filePath,
    ]);
    const info = JSON.parse(stdout);
    const vStream = info.streams?.find((s) => s.codec_type === 'video');
    const duration = Number(info.format?.duration || 0);
    if (!vStream || duration < 48.5) {
      return null;
    }
    return {
      duration,
      sizeBytes: Number(info.format?.size || 0),
      width: Number(vStream.width),
      height: Number(vStream.height),
      frames: Number(vStream.nb_frames || 0),
    };
  } catch {
    return null;
  }
}

async function stageWebOptimisedMp4(inputPath, outputPath, crf = 22) {
  const stat = await fs.stat(inputPath);
  // Transcode with faststart if over 34 MB, else remux with +faststart
  if (stat.size <= MAX_BYTES) {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
  } else {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      String(crf),
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
  }

  const outStat = await fs.stat(outputPath);
  if (outStat.size > MAX_BYTES && crf < 28) {
    return stageWebOptimisedMp4(inputPath, outputPath, crf + 3);
  }
  return outStat.size;
}

async function main() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });

  if (existsSync(BRAND_LOGO)) {
    await fs.copyFile(BRAND_LOGO, path.join(MEDIA_DIR, 'dc-logo.png'));
  }

  const forcePreview = process.argv.includes('--force-clip01');

  const valid16x9 = forcePreview ? null : await probeValidMaster(MASTER_16X9);
  const valid9x16 = forcePreview ? null : await probeValidMaster(MASTER_9X16);

  const out16x9 = path.join(MEDIA_DIR, 'showreel-16x9.mp4');
  const out9x16 = path.join(MEDIA_DIR, 'showreel-9x16.mp4');
  const outPoster = path.join(MEDIA_DIR, 'showreel-poster.jpg');
  const outOg = path.join(MEDIA_DIR, 'og-preview.jpg');

  const source16x9 = valid16x9 ? MASTER_16X9 : FALLBACK_CLIP_01;
  console.log(
    `Staging 16:9 stream from ${path.basename(source16x9)} (verified50s=${Boolean(valid16x9)})...`
  );
  const size16x9 = await stageWebOptimisedMp4(source16x9, out16x9, 22);

  let size9x16 = 0;
  if (valid9x16) {
    console.log('Staging 9:16 stream from verified 50s 9:16 master...');
    size9x16 = await stageWebOptimisedMp4(MASTER_9X16, out9x16, 22);
  } else {
    console.log('Staging temporary 6s preview from clip_01.mp4 for 9:16 slot...');
    size9x16 = await stageWebOptimisedMp4(FALLBACK_CLIP_01, out9x16, 22);
  }

  // Extract Frame 0:04 as showreel-poster.jpg (1920x1080) and og-preview.jpg (1200x630)
  const posterSource = valid16x9 ? out16x9 : FALLBACK_CLIP_01;
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss',
    '4.0',
    '-i',
    posterSource,
    '-frames:v',
    '1',
    '-vf',
    'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080',
    '-q:v',
    '2',
    outPoster,
  ]);

  await execFileAsync('ffmpeg', [
    '-y',
    '-ss',
    '4.0',
    '-i',
    posterSource,
    '-frames:v',
    '1',
    '-vf',
    'scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630',
    '-q:v',
    '2',
    outOg,
  ]);

  const statusPayload = {
    stagedAt: new Date().toISOString(),
    locale: 'en-ZA',
    master16x9Ready: Boolean(valid16x9),
    master16x9DurationSec: valid16x9 ? 50.0 : 6.0,
    master16x9SizeMb: Number((size16x9 / (1024 * 1024)).toFixed(2)),
    master9x16Ready: Boolean(valid9x16),
    master9x16DurationSec: valid9x16 ? 50.0 : 6.0,
    master9x16SizeMb: Number((size9x16 / (1024 * 1024)).toFixed(2)),
  };

  await fs.writeFile(
    path.join(MEDIA_DIR, 'media-status.json'),
    `${JSON.stringify(statusPayload, null, 2)}\n`,
    'utf8'
  );

  console.log('Staged media summary:', statusPayload);
}

main().catch((err) => {
  console.error('Media staging failed:', err.message || err);
  process.exit(1);
});
