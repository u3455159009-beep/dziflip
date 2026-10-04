import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

import { decodeJpeg } from '../vision/decode';
import { extractFeatures, type FeatureVector } from '../vision/features';
import { newId } from './ids';

/** Width the analysis copy is reduced to (the matcher resamples to 64×64 anyway). */
const ANALYSIS_WIDTH = 128;

export function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'targets');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Downscale + decode + describe. Runs fully on-device. */
export async function analyzePhoto(uri: string): Promise<FeatureVector> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: ANALYSIS_WIDTH }).renderAsync();
  const small = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const file = new File(small.uri);
  try {
    const bytes = await file.bytes();
    return extractFeatures(decodeJpeg(bytes));
  } finally {
    try {
      file.delete();
    } catch {
      // cache file
    }
  }
}

/** Keeps a compact copy of a reference photo (for display) in app storage. */
export async function storeReferencePhoto(uri: string): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 720 }).renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const target = new File(photoDir(), `${newId()}.jpg`);
  await new File(saved.uri).move(target);
  return target.uri;
}

export function deleteStoredPhotos(uris: string[]): void {
  for (const u of uris) {
    try {
      const f = new File(u);
      if (f.exists) f.delete();
    } catch {
      // ignore
    }
  }
}
