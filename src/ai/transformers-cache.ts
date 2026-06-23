type TransformersModule = typeof import('@xenova/transformers');

/**
 * @xenova/transformers does not read TRANSFORMERS_CACHE automatically in
 * Node. Set its runtime cache before the first pipeline() call so the
 * non-root Docker user writes model files to /app/.cache, not node_modules.
 */
export async function importTransformers(): Promise<TransformersModule> {
  const transformers = await import('@xenova/transformers');
  const cacheDir =
    process.env.TRANSFORMERS_CACHE ??
    process.env.HF_HOME ??
    process.env.XDG_CACHE_HOME;

  if (cacheDir) {
    transformers.env.cacheDir = cacheDir;
  }

  return transformers;
}
