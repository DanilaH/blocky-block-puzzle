import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

export interface RuntimeImageAssetPair {
  id: string;
  input: string;
  output: string;
  category?: string;
}

export type AvifQualityPolicy = number | ((asset: RuntimeImageAssetPair) => number);

export interface BuildAvifCompanionsOptions {
  quality: AvifQualityPolicy;
  effort?: number;
  concurrency?: number;
}

export interface AvifCompanionItemReport {
  id: string;
  category: string | undefined;
  quality: number;
  sourceBytes: number;
  avifBytes: number;
  savingRatio: number;
}

export interface AvifCompanionReport {
  count: number;
  sourceBytes: number;
  avifBytes: number;
  savingRatio: number;
  items: AvifCompanionItemReport[];
}

const resolveQuality = (policy: AvifQualityPolicy, asset: RuntimeImageAssetPair): number => {
  const value = typeof policy === 'function' ? policy(asset) : policy;
  const quality = Math.round(value);
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error(`Invalid AVIF quality for ${asset.id}: ${String(value)}`);
  }
  return quality;
};

export const buildAvifCompanions = async (
  assets: readonly RuntimeImageAssetPair[],
  options: BuildAvifCompanionsOptions,
): Promise<AvifCompanionReport> => {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
  const effort = Math.max(0, Math.min(9, Math.floor(options.effort ?? 4)));
  const items: AvifCompanionItemReport[] = [];

  const encode = async (asset: RuntimeImageAssetPair): Promise<AvifCompanionItemReport> => {
    const quality = resolveQuality(options.quality, asset);
    await fs.mkdir(path.dirname(asset.output), { recursive: true });
    const sourceStat = await fs.stat(asset.input);
    await sharp(asset.input).avif({ quality, effort }).toFile(asset.output);
    const avifStat = await fs.stat(asset.output);
    return {
      id: asset.id,
      category: asset.category,
      quality,
      sourceBytes: sourceStat.size,
      avifBytes: avifStat.size,
      savingRatio: sourceStat.size === 0 ? 0 : 1 - avifStat.size / sourceStat.size,
    };
  };

  for (let index = 0; index < assets.length; index += concurrency) {
    items.push(...await Promise.all(assets.slice(index, index + concurrency).map(encode)));
  }

  const sourceBytes = items.reduce((total, item) => total + item.sourceBytes, 0);
  const avifBytes = items.reduce((total, item) => total + item.avifBytes, 0);
  return {
    count: items.length,
    sourceBytes,
    avifBytes,
    savingRatio: sourceBytes === 0 ? 0 : 1 - avifBytes / sourceBytes,
    items,
  };
};

export interface ValidateAvifCompanionsOptions {
  minAggregateSavingRatio?: number;
}

export interface AvifValidationItemReport {
  id: string;
  category: string | undefined;
  sourceBytes: number;
  avifBytes: number;
  savingRatio: number;
}

export interface AvifValidationReport {
  count: number;
  sourceBytes: number;
  avifBytes: number;
  savingRatio: number;
  items: AvifValidationItemReport[];
  errors: string[];
}

export const validateAvifCompanions = async (
  assets: readonly RuntimeImageAssetPair[],
  options: ValidateAvifCompanionsOptions = {},
): Promise<AvifValidationReport> => {
  const items: AvifValidationItemReport[] = [];
  const errors: string[] = [];

  for (const asset of assets) {
    try {
      const [sourceStat, avifStat, sourceMeta, avifMeta] = await Promise.all([
        fs.stat(asset.input),
        fs.stat(asset.output),
        sharp(asset.input).metadata(),
        sharp(asset.output).metadata(),
      ]);
      if (avifMeta.format !== 'heif') {
        errors.push(`${asset.id}: expected AVIF/HEIF metadata, got ${avifMeta.format ?? 'unknown'}`);
      }
      if (sourceMeta.width !== avifMeta.width || sourceMeta.height !== avifMeta.height) {
        errors.push(
          `${asset.id}: dimension mismatch ${String(sourceMeta.width)}x${String(sourceMeta.height)} vs `
          + `${String(avifMeta.width)}x${String(avifMeta.height)}`,
        );
      }
      if (sourceMeta.hasAlpha && !avifMeta.hasAlpha) errors.push(`${asset.id}: lost alpha channel`);
      items.push({
        id: asset.id,
        category: asset.category,
        sourceBytes: sourceStat.size,
        avifBytes: avifStat.size,
        savingRatio: sourceStat.size === 0 ? 0 : 1 - avifStat.size / sourceStat.size,
      });
    } catch (error: unknown) {
      errors.push(`${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const sourceBytes = items.reduce((total, item) => total + item.sourceBytes, 0);
  const avifBytes = items.reduce((total, item) => total + item.avifBytes, 0);
  const savingRatio = sourceBytes === 0 ? 0 : 1 - avifBytes / sourceBytes;
  const minimum = options.minAggregateSavingRatio ?? 0;
  if (savingRatio < minimum) {
    errors.push(
      `AVIF aggregate saving ${(savingRatio * 100).toFixed(1)}% is below required `
      + `${(minimum * 100).toFixed(1)}%`,
    );
  }
  return { count: items.length, sourceBytes, avifBytes, savingRatio, items, errors };
};

export interface RuntimeImageBudgetAsset {
  id: string;
  file: string;
  category?: string;
}

export interface RuntimeImageBudgetBucket {
  count: number;
  encodedBytes: number;
  pixels: number;
  estimatedRgbaBytes: number;
}

export interface RuntimeImageBudgetReport extends RuntimeImageBudgetBucket {
  categories: Record<string, RuntimeImageBudgetBucket>;
}

export const inspectRuntimeImageBudget = async (
  assets: readonly RuntimeImageBudgetAsset[],
): Promise<RuntimeImageBudgetReport> => {
  const categories: Record<string, RuntimeImageBudgetBucket> = {};
  let encodedBytes = 0;
  let pixels = 0;

  for (const asset of assets) {
    const [stat, metadata] = await Promise.all([fs.stat(asset.file), sharp(asset.file).metadata()]);
    if (!metadata.width || !metadata.height) throw new Error(`${asset.id}: image dimensions unavailable`);
    const assetPixels = metadata.width * metadata.height;
    encodedBytes += stat.size;
    pixels += assetPixels;
    const category = asset.category ?? 'uncategorized';
    const bucket = categories[category] ?? { count: 0, encodedBytes: 0, pixels: 0, estimatedRgbaBytes: 0 };
    bucket.count += 1;
    bucket.encodedBytes += stat.size;
    bucket.pixels += assetPixels;
    bucket.estimatedRgbaBytes += assetPixels * 4;
    categories[category] = bucket;
  }

  return {
    count: assets.length,
    encodedBytes,
    pixels,
    estimatedRgbaBytes: pixels * 4,
    categories,
  };
};

export interface LogicalTrimFrame {
  logicalWidth: number;
  logicalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrimTransparentWebpOptions {
  webpQuality: number;
  alphaThreshold?: number;
  gutter?: number;
  minPixelSavingRatio?: number;
  maxVisibleRgbMae?: number;
  maxAlphaMae?: number;
  effort?: number;
  smartSubsample?: boolean;
}

export interface TrimTransparentWebpResult {
  buffer: Buffer;
  trimmed: boolean;
  frame: LogicalTrimFrame | undefined;
  beforeBytes: number;
  afterBytes: number;
  beforePixels: number;
  afterPixels: number;
  pixelSavingRatio: number;
  encodedSavingRatio: number;
  rgbMae: number | undefined;
  alphaMae: number | undefined;
}

interface DecodedRgba {
  data: Buffer;
  width: number;
  height: number;
}

const decodeRgba = async (input: Buffer | string): Promise<DecodedRgba> => {
  const { data, info } = await sharp(input)
    .rotate()
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`Expected 4-channel RGBA decode, got ${info.channels}`);
  return { data, width: info.width, height: info.height };
};

const findVisibleBounds = (
  decoded: DecodedRgba,
  alphaThreshold: number,
  gutter: number,
): { x: number; y: number; width: number; height: number } | null => {
  let minX = decoded.width;
  let minY = decoded.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const alpha = decoded.data[(y * decoded.width + x) * 4 + 3] ?? 0;
      if (alpha <= alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;
  const left = Math.max(0, minX - gutter);
  const top = Math.max(0, minY - gutter);
  const right = Math.min(decoded.width - 1, maxX + gutter);
  const bottom = Math.min(decoded.height - 1, maxY + gutter);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
};

const reconstruct = (
  cropped: DecodedRgba,
  logicalWidth: number,
  logicalHeight: number,
  frame: LogicalTrimFrame,
): Buffer => {
  const output = Buffer.alloc(logicalWidth * logicalHeight * 4);
  for (let y = 0; y < frame.height; y += 1) {
    const sourceStart = y * frame.width * 4;
    const sourceEnd = sourceStart + frame.width * 4;
    const targetStart = ((frame.y + y) * logicalWidth + frame.x) * 4;
    cropped.data.copy(output, targetStart, sourceStart, sourceEnd);
  }
  return output;
};

const compareVisible = (
  original: DecodedRgba,
  reconstructed: Buffer,
  alphaThreshold: number,
): { rgbMae: number; alphaMae: number } => {
  let rgbAbs = 0;
  let alphaAbs = 0;
  let visiblePixels = 0;
  for (let pixel = 0; pixel < original.width * original.height; pixel += 1) {
    const offset = pixel * 4;
    const originalAlpha = original.data[offset + 3] ?? 0;
    const candidateAlpha = reconstructed[offset + 3] ?? 0;
    if (Math.max(originalAlpha, candidateAlpha) <= alphaThreshold) continue;
    visiblePixels += 1;
    rgbAbs += Math.abs((original.data[offset] ?? 0) - (reconstructed[offset] ?? 0));
    rgbAbs += Math.abs((original.data[offset + 1] ?? 0) - (reconstructed[offset + 1] ?? 0));
    rgbAbs += Math.abs((original.data[offset + 2] ?? 0) - (reconstructed[offset + 2] ?? 0));
    alphaAbs += Math.abs(originalAlpha - candidateAlpha);
  }
  return {
    rgbMae: visiblePixels === 0 ? 0 : rgbAbs / (visiblePixels * 3),
    alphaMae: visiblePixels === 0 ? 0 : alphaAbs / visiblePixels,
  };
};

export const validateLogicalTrimFrame = (frame: LogicalTrimFrame): boolean =>
  Number.isInteger(frame.logicalWidth)
  && Number.isInteger(frame.logicalHeight)
  && Number.isInteger(frame.x)
  && Number.isInteger(frame.y)
  && Number.isInteger(frame.width)
  && Number.isInteger(frame.height)
  && frame.logicalWidth > 0
  && frame.logicalHeight > 0
  && frame.x >= 0
  && frame.y >= 0
  && frame.width > 0
  && frame.height > 0
  && frame.x + frame.width <= frame.logicalWidth
  && frame.y + frame.height <= frame.logicalHeight;

/**
 * Crops transparent physical pixels while returning the logical frame needed to
 * restore the original placement in an engine atlas/frame API.
 */
export const trimTransparentWebp = async (
  input: Buffer | string,
  options: TrimTransparentWebpOptions,
): Promise<TrimTransparentWebpResult> => {
  const originalBuffer = typeof input === 'string' ? await fs.readFile(input) : input;
  const original = await decodeRgba(originalBuffer);
  const alphaThreshold = Math.max(0, Math.min(255, Math.floor(options.alphaThreshold ?? 8)));
  const gutter = Math.max(0, Math.floor(options.gutter ?? 4));
  const minPixelSavingRatio = Math.max(0, Math.min(1, options.minPixelSavingRatio ?? 0.08));
  const maxVisibleRgbMae = Math.max(0, options.maxVisibleRgbMae ?? 5);
  const maxAlphaMae = Math.max(0, options.maxAlphaMae ?? 0.5);
  const bounds = findVisibleBounds(original, alphaThreshold, gutter);
  if (!bounds) throw new Error('Cannot trim an image with no visible pixels');

  const beforePixels = original.width * original.height;
  const afterPixels = bounds.width * bounds.height;
  const pixelSavingRatio = 1 - afterPixels / beforePixels;
  if (pixelSavingRatio < minPixelSavingRatio) {
    return {
      buffer: originalBuffer,
      trimmed: false,
      frame: undefined,
      beforeBytes: originalBuffer.length,
      afterBytes: originalBuffer.length,
      beforePixels,
      afterPixels: beforePixels,
      pixelSavingRatio: 0,
      encodedSavingRatio: 0,
      rgbMae: undefined,
      alphaMae: undefined,
    };
  }

  const frame: LogicalTrimFrame = {
    logicalWidth: original.width,
    logicalHeight: original.height,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  const quality = Math.max(1, Math.min(100, Math.round(options.webpQuality)));
  const candidateBuffer = await sharp(originalBuffer)
    .rotate()
    .extract({ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height })
    .webp({
      quality,
      alphaQuality: 100,
      effort: Math.max(0, Math.min(6, Math.floor(options.effort ?? 4))),
      smartSubsample: options.smartSubsample ?? true,
    })
    .toBuffer();
  const candidate = await decodeRgba(candidateBuffer);
  const reconstructed = reconstruct(candidate, original.width, original.height, frame);
  const comparison = compareVisible(original, reconstructed, alphaThreshold);
  if (comparison.rgbMae > maxVisibleRgbMae || comparison.alphaMae > maxAlphaMae) {
    throw new Error(
      `Trim QA failed: rgb MAE ${comparison.rgbMae.toFixed(3)}, alpha MAE ${comparison.alphaMae.toFixed(3)}`,
    );
  }

  return {
    buffer: candidateBuffer,
    trimmed: true,
    frame,
    beforeBytes: originalBuffer.length,
    afterBytes: candidateBuffer.length,
    beforePixels,
    afterPixels,
    pixelSavingRatio,
    encodedSavingRatio: 1 - candidateBuffer.length / originalBuffer.length,
    rgbMae: comparison.rgbMae,
    alphaMae: comparison.alphaMae,
  };
};
