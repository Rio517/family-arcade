import { setWorkerUrl } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';

export const MAPLIBRE_WORKER_URL = mapLibreWorkerUrl;

setWorkerUrl(MAPLIBRE_WORKER_URL);
