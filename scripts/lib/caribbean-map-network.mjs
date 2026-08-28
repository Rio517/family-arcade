export const OPEN_FREE_MAP_ORIGIN = 'https://tiles.openfreemap.org';

export function isOpenFreeMapRequest(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.origin === OPEN_FREE_MAP_ORIGIN;
}

export function isExpectedOpenFreeMapCancellation(value, failureText) {
  return failureText === 'net::ERR_ABORTED' && isOpenFreeMapRequest(value);
}

export function classifyCaribbeanMapRequest(value, localOrigin) {
  const url = new URL(value);
  if (url.origin === localOrigin) return 'local';
  if (isOpenFreeMapRequest(url.href)) return 'openfreemap';
  return 'unexpected-external';
}
