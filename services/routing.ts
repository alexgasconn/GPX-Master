import { GPXData, TrackPoint, RoutingMode, RoutingProfile, ExtensionEnd } from '../types';
import { calculateStats } from './gpxUtils';
import { decode } from '@googlemaps/polyline-codec';

type Coordinate = Pick<TrackPoint, 'lat' | 'lon'>;
export type RouteProvider = (from: Coordinate, to: Coordinate, profile: RoutingProfile) => Promise<Coordinate[]>;

export const fetchRoute: RouteProvider = async (from, to, profile) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const request = {
            locations: [from, to].map(({ lat, lon }) => ({ lat, lon })),
            costing: profile,
            shape_format: 'polyline6',
            directions_options: { units: 'kilometers' }
        };
        const response = await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(request))}`, {
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`Servicio de rutas: HTTP ${response.status}`);
        const data = await response.json();
        const shape: unknown = data.trip?.legs?.[0]?.shape;
        if (data.trip?.status !== 0 || typeof shape !== 'string' || !/^[?-~]+$/.test(shape)) {
            throw new Error('El servicio no ha devuelto un camino valido.');
        }
        const coordinates = decode(shape, 6);
        if (coordinates.length < 2 || !coordinates.every(([lat, lon]) =>
            Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
            throw new Error('El servicio no ha devuelto un camino valido.');
        }
        return coordinates.map(([lat, lon]) => ({ lat, lon }));
    } catch (error) {
        if (controller.signal.aborted) throw new Error('El servicio de rutas ha tardado demasiado. Intentalo de nuevo.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

const segment = async (from: TrackPoint, to: TrackPoint, mode: RoutingMode, profile: RoutingProfile, provider: RouteProvider): Promise<TrackPoint[]> => {
    if (mode === 'free' || (from.lat === to.lat && from.lon === to.lon)) return [];
    const coordinates = await provider(from, to, profile);
    return coordinates.filter(point =>
        !(point.lat === from.lat && point.lon === from.lon) &&
        !(point.lat === to.lat && point.lon === to.lon)
    ).map((point, index, points) => {
        const fraction = (index + 1) / (points.length + 1);
        return {
            ...point,
            ele: from.ele + (to.ele - from.ele) * fraction,
            time: from.time && to.time ? new Date(from.time.getTime() + (to.time.getTime() - from.time.getTime()) * fraction) : null,
            dist: 0, speed: 0, gradient: 0,
            routingRole: 'geometry'
        };
    });
};

const commit = (track: GPXData, points: TrackPoint[], selectedIndex: number) => {
    const { stats, enrichedPoints } = calculateStats(points);
    return {
        track: { ...track, points: enrichedPoints, stats, history: [...track.history, track.points].slice(-20) },
        selectedIndex
    };
};

const isControl = (point: TrackPoint) => point.routingRole !== 'geometry' || point.isAnchor;

export const moveRoutedPoint = async (
    track: GPXData, index: number, position: Coordinate & { ele: number },
    mode: RoutingMode, profile: RoutingProfile, provider: RouteProvider = fetchRoute
) => {
    if (!track.points[index]) throw new Error('Punto no encontrado.');
    let before = index - 1;
    let after = index + 1;
    while (before >= 0 && !isControl(track.points[before])) before--;
    while (after < track.points.length && !isControl(track.points[after])) after++;
    const point: TrackPoint = { ...track.points[index], ...position, routingRole: 'control' };
    const incoming = before >= 0 ? await segment(track.points[before], point, mode, profile, provider) : [];
    const outgoing = after < track.points.length ? await segment(point, track.points[after], mode, profile, provider) : [];
    return commit(track, [...track.points.slice(0, before + 1), ...incoming, point, ...outgoing, ...track.points.slice(after)], before + 1 + incoming.length);
};

export const insertRoutedPoint = async (
    track: GPXData, afterIndex: number, position: Coordinate & { ele: number; time: Date | null },
    mode: RoutingMode, profile: RoutingProfile, provider: RouteProvider = fetchRoute
) => {
    if (afterIndex < -1 || afterIndex >= track.points.length) throw new Error('Posicion de insercion no valida.');
    let before = afterIndex;
    let after = afterIndex + 1;
    while (before >= 0 && !isControl(track.points[before])) before--;
    while (after < track.points.length && !isControl(track.points[after])) after++;
    const point: TrackPoint = { ...position, dist: 0, speed: 0, gradient: 0, routingRole: 'control' };
    const incoming = before >= 0 ? await segment(track.points[before], point, mode, profile, provider) : [];
    const outgoing = after < track.points.length ? await segment(point, track.points[after], mode, profile, provider) : [];
    return commit(track, [...track.points.slice(0, before + 1), ...incoming, point, ...outgoing, ...track.points.slice(after)], before + 1 + incoming.length);
};

export const extendRoute = async (
    track: GPXData, end: ExtensionEnd, position: Coordinate, mode: RoutingMode,
    profile: RoutingProfile, provider: RouteProvider = fetchRoute
) => {
    const endpoint = end === 'start' ? track.points[0] : track.points[track.points.length - 1];
    const point: TrackPoint = {
        ...position, ele: endpoint?.ele ?? 0, time: null,
        dist: 0, speed: 0, gradient: 0, routingRole: 'control'
    };
    if (!endpoint) return commit(track, [point], 0);
    const control: TrackPoint = { ...endpoint, routingRole: 'control' };
    if (end === 'start') {
        const geometry = await segment(point, control, mode, profile, provider);
        return commit(track, [point, ...geometry, control, ...track.points.slice(1)], 0);
    }
    const geometry = await segment(control, point, mode, profile, provider);
    return commit(track, [...track.points.slice(0, -1), control, ...geometry, point], track.points.length + geometry.length);
};