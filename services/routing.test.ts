import { describe, expect, it, vi } from 'vitest';
import { calculateStats, undoTrack } from './gpxUtils';
import { extendRoute, fetchRoute, insertRoutedPoint, moveRoutedPoint, RouteProvider } from './routing';
import { GPXData, TrackPoint } from '../types';
import { encode } from '@googlemaps/polyline-codec';

const point = (lon: number, routingRole?: TrackPoint['routingRole']): TrackPoint => ({
    lat: 40, lon, ele: 100, time: null, dist: 0, speed: 0, gradient: 0, routingRole
});
const track = (): GPXData => {
    const points = [point(0), point(1, 'control'), point(1.5, 'geometry'), point(2, 'control'), point(2.5, 'geometry'), point(3, 'control'), point(4)];
    return { id: 'test', name: 'test', points, originalPoints: points, history: [], stats: calculateStats(points).stats, color: '#fff', visible: true };
};
const provider = vi.fn<RouteProvider>(async (from, to) => [from, { lat: 40.01, lon: (from.lon + to.lon) / 2 }, to]);

describe('route editing', () => {
    it('replaces only adjacent geometry, preserves controls and supports one-step undo', async () => {
        provider.mockClear();
        const original = track();
        const result = await moveRoutedPoint(original, 3, { lat: 41, lon: 2, ele: 120 }, 'snap', 'pedestrian', provider);
        expect(provider).toHaveBeenCalledTimes(2);
        expect(result.track.points.map(value => value.lon)).toEqual([0, 1, 1.5, 2, 2.5, 3, 4]);
        expect(result.track.points[2].lat).toBe(40.01);
        expect(result.track.points[result.selectedIndex].lat).toBe(41);
        expect(result.track.points[0]).toMatchObject(original.points[0]);
        expect(result.track.history).toHaveLength(1);
        expect(undoTrack(result.track).points.map(({ lat, lon }) => [lat, lon])).toEqual(original.points.map(({ lat, lon }) => [lat, lon]));
    });

    it('uses straight segments in free mode without network calls', async () => {
        provider.mockClear();
        const result = await moveRoutedPoint(track(), 3, { lat: 41, lon: 2, ele: 100 }, 'free', 'bicycle', provider);
        expect(provider).not.toHaveBeenCalled();
        expect(result.track.points.map(value => value.lon)).toEqual([0, 1, 2, 3, 4]);
    });

    it.each(['start', 'end'] as const)('extends the %s without changing existing geometry', async end => {
        const original = track();
        const result = await extendRoute(original, end, { lat: 42, lon: 5 }, 'snap', 'bicycle', provider);
        expect(result.track.points).toHaveLength(original.points.length + 2);
        expect(result.track.points[result.selectedIndex]).toMatchObject({ lat: 42, lon: 5, routingRole: 'control', time: null });
        expect(result.track.points.slice(end === 'start' ? 2 : 0, end === 'start' ? undefined : -2).map(value => value.lon)).toEqual(original.points.map(value => value.lon));
        expect(provider).toHaveBeenLastCalledWith(expect.any(Object), expect.any(Object), 'bicycle');
    });

    it('inserts a control inside routed geometry and regenerates both sides', async () => {
        provider.mockClear();
        const result = await insertRoutedPoint(track(), 2, { lat: 41, lon: 1.7, ele: 100, time: null }, 'snap', 'pedestrian', provider);
        expect(provider).toHaveBeenCalledTimes(2);
        expect(result.track.points[result.selectedIndex].lon).toBe(1.7);
        expect(result.track.points.filter(value => value.routingRole === 'control')).toHaveLength(4);
    });

    it.each(['start', 'end'] as const)('preserves a cropped geometry endpoint at the %s', async end => {
        const original = track();
        original.points = original.points.slice(2, 5);
        const result = await extendRoute(original, end, { lat: 42, lon: 5 }, 'free', 'pedestrian', provider);
        const retained = result.track.points.slice(end === 'start' ? 1 : 0, end === 'start' ? undefined : -1);
        expect(retained.map(value => value.lon)).toEqual(original.points.map(value => value.lon));
        expect(retained[end === 'start' ? 0 : retained.length - 1].routingRole).toBe('control');
    });

    it('leaves the original untouched when routing fails', async () => {
        const original = track();
        const points = [...original.points];
        await expect(extendRoute(original, 'end', { lat: 42, lon: 5 }, 'snap', 'pedestrian', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
        expect(original.points).toEqual(points);
        expect(original.history).toEqual([]);
    });
});

describe('Valhalla client', () => {
    it('requests the real activity profile and decodes polyline6', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ trip: { status: 0, legs: [{ shape: encode([[40, -3], [40.1, -3.1]], 6) }] } })));
        try {
            expect(await fetchRoute({ lat: 40, lon: -3 }, { lat: 40.1, lon: -3.1 }, 'bicycle')).toEqual([{ lat: 40, lon: -3 }, { lat: 40.1, lon: -3.1 }]);
            const request = JSON.parse(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('json')!);
            expect(request.costing).toBe('bicycle');
            expect(request.shape_format).toBe('polyline6');
        } finally {
            fetchMock.mockRestore();
        }
    });
});