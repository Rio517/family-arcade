import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CARIBBEAN_MAP_PRESETS, CARIBBEAN_PLAYER_POINTS, CARIBBEAN_ROUTE } from './caribbeanMapData';
import { CARIBBEAN_MAP_STYLE } from './caribbeanMapStyle';
import { CaribbeanMapRenderer } from './CaribbeanMapRenderer';

describe('<CaribbeanMap> cold shell', () => {
  it('ships its calm chart loading treatment before the lazy renderer CSS arrives', () => {
    const wrapper = readFileSync(resolve('src/games/caribbean/components/map/CaribbeanMap.tsx'), 'utf8');
    const shell = readFileSync(resolve('src/games/caribbean/styles/map-shell.css'), 'utf8');
    const renderer = readFileSync(resolve('src/games/caribbean/styles/map.css'), 'utf8');

    expect(wrapper).toContain("../../styles/map-shell.css");
    expect(shell).toContain('.caribbean-map.caribbean-map--maplibre');
    expect(shell).toContain('.caribbean-map__loading');
    expect(shell).toContain('var(--caribbean-port-chart-material');
    expect(renderer).toMatch(/\.maplibregl-marker\s*\{[^}]*will-change:\s*auto/s);
    expect(renderer).toMatch(/\.maplibregl-marker\s*\{[^}]*transition:\s*none/s);
    expect(renderer).not.toMatch(/\.caribbean-map__marker\s*\{[^}]*filter:/s);
  });
});

const mapTestState = vi.hoisted(() => ({
  latestProps: null as null | Record<string, unknown>,
  mounts: 0,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  flyTo: vi.fn(),
  sourceFeatures: [{}] as unknown[],
}));

vi.mock('./maplibreRuntime', () => ({}));

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react');
  return {
    Map: React.forwardRef(function MockMap(
      { children, onLoad, onIdle, onError, onSourceData, ...props }: Record<string, unknown> & { children?: React.ReactNode },
      ref: React.ForwardedRef<unknown>,
    ) {
      const canvasRef = React.useRef<HTMLCanvasElement>(null);
      mapTestState.mounts += 1;
      mapTestState.latestProps = props;
      React.useImperativeHandle(ref, () => ({
        zoomIn: mapTestState.zoomIn,
        zoomOut: mapTestState.zoomOut,
        flyTo: mapTestState.flyTo,
        getCanvas: () => canvasRef.current,
        getMap: () => ({ querySourceFeatures: () => mapTestState.sourceFeatures }),
      }));
      return (
        <div data-testid="maplibre-map">
          <canvas ref={canvasRef} data-testid="maplibre-canvas" aria-label="Map" tabIndex={0} />
          <button type="button" data-testid="maplibre-load" onClick={() => (onLoad as (() => void) | undefined)?.()}>load</button>
          <button
            type="button"
            data-testid="maplibre-metadata"
            onClick={() => (onSourceData as ((event: unknown) => void) | undefined)?.({
              sourceId: 'openmaptiles', sourceDataType: 'metadata', tile: undefined,
            })}
          >metadata</button>
          <button type="button" data-testid="maplibre-idle" onClick={() => (onIdle as (() => void) | undefined)?.()}>idle</button>
          <button
            type="button"
            data-testid="maplibre-error"
            onClick={() => (onError as ((event: { error: Error }) => void) | undefined)?.({ error: new Error('offline') })}
          >error</button>
          {children}
        </div>
      );
    }),
    Source: ({ children, data, id }: { children?: React.ReactNode; data?: unknown; id: string }) => (
      <div data-testid={`map-source-${id}`} data-source={JSON.stringify(data)}>{children}</div>
    ),
    Layer: ({ id }: { id: string }) => <span data-testid={`map-layer-${id}`} />,
    Marker: React.forwardRef(function MockMarker(
      { children, longitude, latitude, anchor }: {
        children?: React.ReactNode;
        longitude: number;
        latitude: number;
        anchor?: string;
      },
      ref: React.ForwardedRef<unknown>,
    ) {
      const elementRef = React.useRef<HTMLDivElement>(null);
      React.useImperativeHandle(ref, () => ({ getElement: () => elementRef.current }));
      return (
        <div
          ref={elementRef}
          data-testid="map-marker"
          data-longitude={longitude}
          data-latitude={latitude}
          data-anchor={anchor}
        >
          {children}
        </div>
      );
    }),
  };
});

describe('<CaribbeanMapRenderer>', () => {
  beforeEach(() => {
    mapTestState.latestProps = null;
    mapTestState.mounts = 0;
    mapTestState.zoomIn.mockClear();
    mapTestState.zoomOut.mockClear();
    mapTestState.flyTo.mockClear();
    mapTestState.sourceFeatures = [{}];
  });

  it('uses the repository-owned style, real route, and context camera on one MapLibre surface', () => {
    render(<CaribbeanMapRenderer context="encounter" playerName="Mistral" contactVisible />);

    const chart = screen.getByRole('region', { name: 'Caribbean nautical chart' });
    expect(screen.getByTestId('maplibre-canvas')).toHaveAttribute('aria-describedby');
    expect(chart).toHaveAttribute('data-map-context', 'encounter');
    expect(chart).toHaveAttribute('data-map-phase', 'loading');
    expect(chart).toHaveAttribute('data-map-render-state', 'loading');
    expect(chart).toHaveAttribute('data-map-route', 'red-jackdaw');
    expect(mapTestState.latestProps).toMatchObject({
      mapStyle: CARIBBEAN_MAP_STYLE,
      initialViewState: CARIBBEAN_MAP_PRESETS.encounter,
      fadeDuration: 0,
    });
    expect(screen.getByTestId('map-source-red-jackdaw-route')).toHaveAttribute('data-source', JSON.stringify(CARIBBEAN_ROUTE));
    expect(screen.getByText('Bridgetown')).toBeInTheDocument();
    expect(screen.getByText('Mistral')).toBeInTheDocument();
    expect(screen.getByText('Red Jackdaw')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Red Jackdaw contact' })).toHaveAttribute('data-anchor', 'bottom-right');
    expect(screen.getByRole('img', { name: 'Mistral' })).toHaveAttribute(
      'data-longitude',
      String(CARIBBEAN_PLAYER_POINTS.encounter[0]),
    );

    fireEvent.click(screen.getByTestId('maplibre-load'));
    expect(chart).toHaveAttribute('data-map-phase', 'loading');
    fireEvent.click(screen.getByTestId('maplibre-metadata'));
    expect(chart).toHaveAttribute('data-map-phase', 'loading');
    fireEvent.click(screen.getByTestId('maplibre-idle'));
    expect(chart).toHaveAttribute('data-map-phase', 'ready');
    expect(chart).toHaveAttribute('data-map-render-state', 'idle');
    fireEvent.click(screen.getByTestId('maplibre-error'));
    expect(chart).toHaveAttribute('data-map-phase', 'ready');
  });

  it('does not declare success when provider metadata loads without real vector features', () => {
    mapTestState.sourceFeatures = [];
    render(<CaribbeanMapRenderer context="port" playerName="Mistral" contactVisible={false} />);

    const chart = screen.getByRole('region', { name: 'Caribbean nautical chart' });
    fireEvent.click(screen.getByTestId('maplibre-load'));
    fireEvent.click(screen.getByTestId('maplibre-metadata'));
    fireEvent.click(screen.getByTestId('maplibre-idle'));

    expect(chart).toHaveAttribute('data-map-phase', 'loading');
    expect(chart).toHaveAttribute('data-map-render-state', 'loading');
  });

  it('keeps contact intelligence out of an unmarked port chart', () => {
    render(<CaribbeanMapRenderer context="port" playerName="Mistral" contactVisible={false} statusLabel="Safe harbour" />);

    const chart = screen.getByRole('region', { name: 'Caribbean nautical chart' });
    expect(mapTestState.latestProps).toMatchObject({ initialViewState: CARIBBEAN_MAP_PRESETS.port });
    expect(chart).not.toHaveAttribute('data-map-route');
    expect(screen.queryByText('Red Jackdaw')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map-source-red-jackdaw-route')).not.toBeInTheDocument();
    expect(screen.getByText('Safe harbour')).toBeInTheDocument();
  });

  it('shows honest initial-load failure and remounts the online chart on retry', () => {
    render(<CaribbeanMapRenderer context="sailing" playerName="Mistral" contactVisible />);
    const firstMounts = mapTestState.mounts;

    fireEvent.click(screen.getByTestId('maplibre-error'));
    expect(screen.getByRole('region', { name: 'Caribbean nautical chart' })).toHaveAttribute('data-map-phase', 'unavailable');
    expect(screen.getByText('Caribbean chart needs a network connection.')).toBeInTheDocument();
    expect(screen.queryByTestId('maplibre-map')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry chart' }));
    expect(screen.getByTestId('maplibre-map')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Caribbean nautical chart' })).toHaveAttribute('data-map-phase', 'loading');
    expect(mapTestState.mounts).toBeGreaterThan(firstMounts);
  });

  it('wires accessible brass controls to MapLibre and resets to the context home', () => {
    render(<CaribbeanMapRenderer context="sailing" playerName="Mistral" contactVisible />);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset map view' }));
    fireEvent.keyDown(screen.getByTestId('maplibre-canvas'), { key: 'Home' });

    expect(mapTestState.zoomIn).toHaveBeenCalledOnce();
    expect(mapTestState.zoomOut).toHaveBeenCalledOnce();
    expect(mapTestState.flyTo).toHaveBeenCalledTimes(2);
    expect(mapTestState.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({
      center: [CARIBBEAN_MAP_PRESETS.sailing.longitude, CARIBBEAN_MAP_PRESETS.sailing.latitude],
      zoom: CARIBBEAN_MAP_PRESETS.sailing.zoom,
    }));
    expect(screen.getByText('Press Home to reset the chart view.')).toBeInTheDocument();
  });
});
