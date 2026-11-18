import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

export type BackgroundRemovalMode = 'auto' | 'deterministic' | 'ai' | 'preserve';
export type AiBackgroundRemover = (input: Buffer) => Promise<Buffer>;

export interface ImageAssetPreparationOptions {
  canvas: number;
  padding: number;
  webpQuality: number;
  offsetX?: number;
  offsetY?: number;
  backgroundRemoval?: BackgroundRemovalMode;
  backgroundColorTolerance?: number;
  edgeFeather?: number;
  foregroundMin?: number;
  foregroundMax?: number;
  aiRemoveBackground?: AiBackgroundRemover;
}

export interface PreparedImageAsset {
  buffer: Buffer;
  backgroundMethod: 'existing-alpha' | 'preserve' | 'deterministic' | 'ai' | 'ai-fallback';
  removedBackground: boolean;
}

export interface AlphaBounds {
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  transparentRatio: number;
  visibleRatio: number;
}

export interface ImageAssetValidationOptions {
  canvas: number;
  minTransparentPadding?: number;
  softSizeLimit?: number;
}

export interface ImageAssetValidationResult {
  errors: string[];
  warnings: string[];
  bytes: number;
  alpha: AlphaBounds;
}

const assertMode = (mode: BackgroundRemovalMode): void => {
  if (!['auto', 'deterministic', 'ai', 'preserve'].includes(mode)) {
    throw new Error(`Unsupported background removal mode: ${String(mode)}`);
  }
};

const hasUsefulAlpha = async (input: Buffer): Promise<boolean> => {
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaIndex = info.channels - 1;
  let transparent = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    if ((data[pixel * info.channels + alphaIndex] ?? 0) < 250) transparent += 1;
  }
  return transparent / (info.width * info.height) > 0.005;
};

const averagePatch = (
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  startX: number,
  startY: number,
  patchWidth: number,
  patchHeight: number,
): [number, number, number] => {
  const sum: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (let y = startY; y < Math.min(height, startY + patchHeight); y += 1) {
    for (let x = startX; x < Math.min(width, startX + patchWidth); x += 1) {
      const offset = (y * width + x) * channels;
      sum[0] += data[offset] ?? 0;
      sum[1] += data[offset + 1] ?? 0;
      sum[2] += data[offset + 2] ?? 0;
      count += 1;
    }
  }
  return [sum[0] / Math.max(1, count), sum[1] / Math.max(1, count), sum[2] / Math.max(1, count)];
};

const bilinear = (
  topLeft: number,
  topRight: number,
  bottomLeft: number,
  bottomRight: number,
  x: number,
  y: number,
): number => {
  const top = topLeft * (1 - x) + topRight * x;
  const bottom = bottomLeft * (1 - x) + bottomRight * x;
  return top * (1 - y) + bottom * y;
};

/**
 * Removes a clean generated background without ML.
 *
 * A bilinear background-color model is estimated from the four corners and only matching
 * pixels connected to the image border are removed. Foreground-ratio safety bounds make a
 * suspicious mask fail loudly instead of silently deleting the subject.
 */
export const removeBorderBackground = async (
  input: Buffer,
  options: {
    colorTolerance?: number;
    edgeFeather?: number;
    foregroundMin?: number;
    foregroundMax?: number;
  } = {},
): Promise<Buffer> => {
  const colorTolerance = options.colorTolerance ?? 48;
  const edgeFeather = options.edgeFeather ?? 0.8;
  const foregroundMin = options.foregroundMin ?? 0.04;
  const foregroundMax = options.foregroundMax ?? 0.9;
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixelCount = width * height;
  const alphaIndex = channels - 1;
  const patch = Math.max(4, Math.floor(Math.min(width, height) * 0.04));
  const topLeft = averagePatch(data, width, height, channels, 0, 0, patch, patch);
  const topRight = averagePatch(data, width, height, channels, width - patch, 0, patch, patch);
  const bottomLeft = averagePatch(data, width, height, channels, 0, height - patch, patch, patch);
  const bottomRight = averagePatch(data, width, height, channels, width - patch, height - patch, patch, patch);

  const isBackgroundCandidate = (pixel: number): boolean => {
    const offset = pixel * channels;
    if ((data[offset + alphaIndex] ?? 0) < 16) return true;
    const x = width <= 1 ? 0 : (pixel % width) / (width - 1);
    const y = height <= 1 ? 0 : Math.floor(pixel / width) / (height - 1);
    const expected = [0, 1, 2].map((channel) =>
      bilinear(topLeft[channel]!, topRight[channel]!, bottomLeft[channel]!, bottomRight[channel]!, x, y),
    );
    return Math.max(
      Math.abs((data[offset] ?? 0) - expected[0]!),
      Math.abs((data[offset + 1] ?? 0) - expected[1]!),
      Math.abs((data[offset + 2] ?? 0) - expected[2]!),
    ) <= colorTolerance;
  };

  const background = new Uint8Array(pixelCount);
  const queued = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (pixel: number): void => {
    if ((queued[pixel] ?? 0) !== 0 || !isBackgroundCandidate(pixel)) return;
    queued[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixel = queue[head] ?? 0;
    head += 1;
    background[pixel] = 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }

  let foregroundPixels = 0;
  const mask = Buffer.alloc(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if ((background[pixel] ?? 0) === 0) {
      mask[pixel] = 255;
      foregroundPixels += 1;
    }
  }

  const foregroundRatio = foregroundPixels / pixelCount;
  if (foregroundRatio < foregroundMin || foregroundRatio > foregroundMax) {
    throw new Error(
      `Background removal produced unsafe foreground ratio ${(foregroundRatio * 100).toFixed(1)}%. `
      + 'Use AI mode, preserve mode, a cleaner source, or adjusted deterministic thresholds.',
    );
  }

  const dilated = Buffer.from(mask);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      if (mask[pixel] !== 255) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          dilated[(y + dy) * width + x + dx] = 255;
        }
      }
    }
  }

  const feathered = edgeFeather > 0
    ? await sharp(dilated, { raw: { width, height, channels: 1 } }).blur(edgeFeather).raw().toBuffer()
    : dilated;

  const rgba = Buffer.from(data);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const originalAlpha = data[pixel * channels + alphaIndex] ?? 0;
    rgba[pixel * channels + alphaIndex] = Math.min(originalAlpha, feathered[pixel] ?? 0);
  }

  return sharp(rgba, { raw: { width, height, channels } }).png().toBuffer();
};

const prepareCutout = async (
  sourceBuffer: Buffer,
  options: ImageAssetPreparationOptions,
): Promise<Pick<PreparedImageAsset, 'backgroundMethod' | 'buffer'>> => {
  if (await hasUsefulAlpha(sourceBuffer)) {
    return {
      buffer: await sharp(sourceBuffer).rotate().ensureAlpha().png().toBuffer(),
      backgroundMethod: 'existing-alpha',
    };
  }

  const mode = options.backgroundRemoval ?? 'auto';
  assertMode(mode);
  if (mode === 'preserve') {
    return {
      buffer: await sharp(sourceBuffer).rotate().ensureAlpha().png().toBuffer(),
      backgroundMethod: 'preserve',
    };
  }
  if (mode === 'ai') {
    if (!options.aiRemoveBackground) throw new Error('AI background removal requested without aiRemoveBackground');
    return { buffer: await options.aiRemoveBackground(sourceBuffer), backgroundMethod: 'ai' };
  }

  const deterministic = (): Promise<Buffer> => removeBorderBackground(sourceBuffer, {
    ...(options.backgroundColorTolerance === undefined ? {} : { colorTolerance: options.backgroundColorTolerance }),
    ...(options.edgeFeather === undefined ? {} : { edgeFeather: options.edgeFeather }),
    ...(options.foregroundMin === undefined ? {} : { foregroundMin: options.foregroundMin }),
    ...(options.foregroundMax === undefined ? {} : { foregroundMax: options.foregroundMax }),
  });

  if (mode === 'deterministic') {
    return { buffer: await deterministic(), backgroundMethod: 'deterministic' };
  }

  try {
    return { buffer: await deterministic(), backgroundMethod: 'deterministic' };
  } catch (deterministicError) {
    if (!options.aiRemoveBackground) throw deterministicError;
    try {
      return { buffer: await options.aiRemoveBackground(sourceBuffer), backgroundMethod: 'ai-fallback' };
    } catch (aiError) {
      throw new AggregateError(
        [deterministicError, aiError],
        'Both deterministic and AI background removal failed for this asset',
      );
    }
  }
};

const normalizeToCanvas = async (
  input: Buffer,
  options: ImageAssetPreparationOptions,
): Promise<Buffer> => {
  const canvas = Math.max(1, Math.floor(options.canvas));
  const padding = Math.max(0, Math.floor(options.padding));
  const inner = canvas - padding * 2;
  if (inner <= 0) throw new Error(`Invalid canvas/padding combination: ${canvas}/${padding}`);

  const trimmed = await sharp(input)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .png()
    .toBuffer();
  const resized = await sharp(trimmed)
    .resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });

  const left = Math.round((canvas - resized.info.width) / 2 + (options.offsetX ?? 0));
  const top = Math.round((canvas - resized.info.height) / 2 + (options.offsetY ?? 0));
  if (left < 0 || top < 0 || left + resized.info.width > canvas || top + resized.info.height > canvas) {
    throw new Error('Configured visual offset pushes the asset outside the output canvas');
  }

  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized.data, left, top }])
    .webp({ quality: options.webpQuality, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
};

export const prepareImageAsset = async (
  sourceBuffer: Buffer,
  options: ImageAssetPreparationOptions,
): Promise<PreparedImageAsset> => {
  const cutout = await prepareCutout(sourceBuffer, options);
  return {
    buffer: await normalizeToCanvas(cutout.buffer, options),
    backgroundMethod: cutout.backgroundMethod,
    removedBackground: cutout.backgroundMethod !== 'existing-alpha' && cutout.backgroundMethod !== 'preserve',
  };
};

export const findAlphaBounds = async (
  input: Buffer | string,
  threshold = 8,
): Promise<AlphaBounds> => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaIndex = info.channels - 1;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let transparent = 0;
  let visible = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + alphaIndex] ?? 0;
      if (alpha < 250) transparent += 1;
      if (alpha > threshold) visible += 1;
      if (alpha <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    width: info.width,
    height: info.height,
    bounds: maxX >= 0 ? { minX, minY, maxX, maxY } : null,
    transparentRatio: transparent / (info.width * info.height),
    visibleRatio: visible / (info.width * info.height),
  };
};

export const validatePreparedImage = async (
  input: Buffer | string,
  options: ImageAssetValidationOptions,
): Promise<ImageAssetValidationResult> => {
  const metadata = await sharp(input).metadata();
  const alpha = await findAlphaBounds(input);
  const bytes = typeof input === 'string' ? (await fs.stat(input)).size : input.length;
  const errors: string[] = [];
  const warnings: string[] = [];
  const canvas = Math.max(1, Math.floor(options.canvas));
  const minTransparentPadding = options.minTransparentPadding ?? 24;
  const softSizeLimit = options.softSizeLimit ?? 500 * 1024;

  if (metadata.format !== 'webp') errors.push(`expected WebP, got ${metadata.format ?? 'unknown'}`);
  if (metadata.width !== canvas || metadata.height !== canvas) {
    errors.push(`expected ${canvas}x${canvas}, got ${metadata.width ?? 0}x${metadata.height ?? 0}`);
  }
  if (!metadata.hasAlpha || alpha.transparentRatio < 0.01) errors.push('missing meaningful transparency');
  if (alpha.visibleRatio < 0.02) errors.push('visible foreground is effectively empty');
  if (!alpha.bounds) {
    errors.push('no visible foreground pixels');
  } else {
    const padding = Math.min(
      alpha.bounds.minX,
      alpha.bounds.minY,
      canvas - 1 - alpha.bounds.maxX,
      canvas - 1 - alpha.bounds.maxY,
    );
    if (padding < minTransparentPadding) errors.push(`foreground padding is only ${padding}px`);
  }
  if (bytes > softSizeLimit) warnings.push(`encoded size ${(bytes / 1024).toFixed(0)} KB exceeds soft target`);

  return { errors, warnings, bytes, alpha };
};

/** Prepares, validates and only then writes the final output file. */
export const prepareImageAssetFile = async (
  sourcePath: string,
  outputPath: string,
  options: ImageAssetPreparationOptions,
  validation: Omit<ImageAssetValidationOptions, 'canvas'> = {},
): Promise<PreparedImageAsset & { validation: ImageAssetValidationResult }> => {
  const sourceBuffer = await fs.readFile(sourcePath);
  const prepared = await prepareImageAsset(sourceBuffer, options);
  const validationResult = await validatePreparedImage(prepared.buffer, {
    canvas: options.canvas,
    ...validation,
  });
  if (validationResult.errors.length > 0) {
    throw new Error(`Prepared asset failed validation: ${validationResult.errors.join('; ')}`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, prepared.buffer);
  return { ...prepared, validation: validationResult };
};
