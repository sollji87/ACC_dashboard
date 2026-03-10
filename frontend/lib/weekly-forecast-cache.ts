export const WEEKLY_FORECAST_CACHE_VERSION = 5;

export function hasCurrentWeeklyForecastCacheVersion(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { cacheVersion?: unknown };
  return candidate.cacheVersion === WEEKLY_FORECAST_CACHE_VERSION;
}
