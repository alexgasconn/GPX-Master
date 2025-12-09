import { GPXData, TrackPoint, GPXStatistics, AnomalyReport } from '../types';

// Haversine formula
export const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const deg2rad = (deg: number): number => deg * (Math.PI / 180);

// Helper to format pace (min/km)
const calculatePace = (speedKmh: number): string => {
    if (speedKmh <= 0.5) return "00:00"; // Too slow or stopped
    const minPerKm = 60 / speedKmh;
    const minutes = Math.floor(minPerKm);
    const seconds = Math.round((minPerKm - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// --- Stats Calculation Logic ---
export const calculateStats = (points: TrackPoint[]): { stats: GPXStatistics; enrichedPoints: TrackPoint[] } => {
    if (points.length === 0) {
        return {
            stats: {
                totalDistance: 0, totalElevationGain: 0, totalElevationLoss: 0,
                maxElevation: 0, minElevation: 0, averageSpeed: 0, maxSpeed: 0, averagePace: "00:00",
                movingTime: 0, totalTime: 0, startTime: null, endTime: null
            },
            enrichedPoints: []
        };
    }

    let totalDistance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    let movingTime = 0;
    let maxEle = -Infinity;
    let minEle = Infinity;
    let maxSpeed = 0;

    const enrichedPoints: TrackPoint[] = [];

    // First pass: Calculate basic geometrics
    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const ele = typeof current.ele === 'number' && !isNaN(current.ele) ? current.ele : 0;
        
        let distFromPrev = 0;
        let speed = 0;
        let gradient = 0;
        let timeDiff = 0;

        if (i > 0) {
            const prev = enrichedPoints[i - 1]; // Use previously processed point
            distFromPrev = getDistanceFromLatLonInKm(prev.lat, prev.lon, current.lat, current.lon);
            totalDistance += distFromPrev;

            const eleDiff = ele - prev.ele;
            if (eleDiff > 0) elevationGain += eleDiff;
            if (eleDiff < 0) elevationLoss += Math.abs(eleDiff);

            if (current.time && prev.time) {
                // Safe parsing of time if it happens to be a string
                const cTime = current.time instanceof Date ? current.time : new Date(current.time);
                const pTime = prev.time instanceof Date ? prev.time : new Date(prev.time);
                
                timeDiff = (cTime.getTime() - pTime.getTime()) / 1000;
                if (timeDiff > 0) {
                    speed = (distFromPrev / timeDiff) * 3600;
                    // Filter unrealistic speeds for moving time stats (1km/h to 120km/h)
                    if (speed > 1 && speed < 120) {
                        movingTime += timeDiff;
                    }
                }
            }
            
            if (distFromPrev > 0.005) { // Only calc gradient if moved > 5m
                gradient = (eleDiff / (distFromPrev * 1000)) * 100;
            }
        }

        if (ele > maxEle) maxEle = ele;
        if (ele < minEle) minEle = ele;
        if (speed > maxSpeed && speed < 150) maxSpeed = speed; // Cap max speed tracking at 150 to ignore huge spikes

        enrichedPoints.push({
            ...current,
            ele, 
            dist: parseFloat(totalDistance.toFixed(3)),
            speed: parseFloat(speed.toFixed(1)),
            gradient: parseFloat(gradient.toFixed(1))
        });
    }

    const startTime = enrichedPoints[0]?.time || null;
    const endTime = enrichedPoints[enrichedPoints.length - 1]?.time || null;
    
    let totalTime = 0;
    if (startTime && endTime) {
         const s = startTime instanceof Date ? startTime : new Date(startTime);
         const e = endTime instanceof Date ? endTime : new Date(endTime);
         totalTime = (e.getTime() - s.getTime()) / 1000;
    }
    
    if (movingTime > totalTime) movingTime = totalTime;
    if (movingTime === 0 && totalTime > 0) movingTime = totalTime;

    const averageSpeed = totalTime > 0 ? parseFloat(((totalDistance / totalTime) * 3600).toFixed(1)) : 0;

    return {
        stats: {
            totalDistance: parseFloat(totalDistance.toFixed(2)),
            totalElevationGain: Math.round(elevationGain),
            totalElevationLoss: Math.round(elevationLoss),
            maxElevation: maxEle === -Infinity ? 0 : Math.round(maxEle),
            minElevation: minEle === Infinity ? 0 : Math.round(minEle),
            averageSpeed,
            maxSpeed: parseFloat(maxSpeed.toFixed(1)),
            averagePace: calculatePace(averageSpeed),
            movingTime,
            totalTime,
            startTime,
            endTime
        },
        enrichedPoints
    };
};

// --- History Management (Undo) ---

const pushHistory = (track: GPXData): TrackPoint[][] => {
    // Keep last 20 states
    const newHistory = [...(track.history || []), track.points];
    if (newHistory.length > 20) {
        newHistory.shift();
    }
    return newHistory;
};

export const undoTrack = (track: GPXData): GPXData => {
    if (!track.history || track.history.length === 0) return track;
    
    const newHistory = [...track.history];
    const previousPoints = newHistory.pop();
    
    if (!previousPoints) return track;

    const { stats, enrichedPoints } = calculateStats(previousPoints);
    
    return {
        ...track,
        points: enrichedPoints,
        stats,
        history: newHistory
    };
};

// --- Editing Algorithms ---

// Smooth Latitude/Longitude (Geometry)
export const smoothTrackGeometry = (track: GPXData, windowSize: number = 3): GPXData => {
    const history = pushHistory(track);
    const points = track.points.map((p, i, arr) => {
        // Skip start, end, and ANCHORS
        if (i === 0 || i === arr.length - 1 || p.isAnchor) return p;
        
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(arr.length, i + Math.floor(windowSize / 2) + 1);
        const subset = arr.slice(start, end);
        
        const avgLat = subset.reduce((sum, pt) => sum + pt.lat, 0) / subset.length;
        const avgLon = subset.reduce((sum, pt) => sum + pt.lon, 0) / subset.length;
        
        return { ...p, lat: avgLat, lon: avgLon };
    });

    const { stats, enrichedPoints } = calculateStats(points);
    return { ...track, points: enrichedPoints, stats, history };
};

export const smoothElevation = (track: GPXData, windowSize: number = 5): GPXData => {
    const history = pushHistory(track);
    const points = track.points.map((p, i, arr) => {
        // Skip ANCHORS
        if (p.isAnchor) return p;

        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(arr.length, i + Math.floor(windowSize / 2) + 1);
        const subset = arr.slice(start, end);
        const avgEle = subset.reduce((sum, pt) => sum + pt.ele, 0) / subset.length;
        return { ...p, ele: parseFloat(avgEle.toFixed(1)) };
    });

    const { stats, enrichedPoints } = calculateStats(points);
    return { ...track, points: enrichedPoints, stats, history };
};

export const offsetTrackElevation = (track: GPXData, offsetMeters: number): GPXData => {
    if (offsetMeters === 0) return track;
    const history = pushHistory(track);
    
    const points = track.points.map(p => ({
        ...p,
        ele: parseFloat((p.ele + offsetMeters).toFixed(1))
    }));

    const { stats, enrichedPoints } = calculateStats(points);
    return { ...track, points: enrichedPoints, stats, history };
};

// Smooth only the selected range of points
export const smoothSelectedPoints = (track: GPXData, indices: Set<number>, iterations: number = 1): GPXData => {
    if (indices.size === 0) return track;
    
    const history = pushHistory(track);
    const sortedIndices = Array.from(indices).sort((a, b) => a - b);
    let currentPoints = [...track.points];

    for (let k = 0; k < iterations; k++) {
        const sourcePoints = [...currentPoints]; // Read from current state of this iteration
        
        sortedIndices.forEach(i => {
            // Skip track boundaries and ANCHORS
            if (i <= 0 || i >= sourcePoints.length - 1 || sourcePoints[i].isAnchor) return;

            const prev = sourcePoints[i - 1];
            const curr = sourcePoints[i];
            const next = sourcePoints[i + 1];

            // Weighted Average: (Prev + 2*Curr + Next) / 4
            currentPoints[i] = {
                ...curr,
                lat: (prev.lat + 2 * curr.lat + next.lat) / 4,
                lon: (prev.lon + 2 * curr.lon + next.lon) / 4
            };
        });
    }

    const { stats, enrichedPoints } = calculateStats(currentPoints);
    return { ...track, points: enrichedPoints, stats, history };
};

export const densifyTrackSegment = (track: GPXData, indices: Set<number>): GPXData => {
    if (indices.size < 2) return track;
    const history = pushHistory(track);
    
    // Calculate target spacing (Average spacing of the WHOLE track)
    const numPoints = track.points.length;
    const avgSpacingKm = numPoints > 1 ? track.stats.totalDistance / (numPoints - 1) : 0.01;
    // Enforce a minimum practical spacing (e.g. 5 meters) to prevent explosion
    const TARGET_SPACING = Math.max(avgSpacingKm, 0.005); 

    const selectionSet = new Set(indices);
    const newPoints: TrackPoint[] = [];

    for (let i = 0; i < track.points.length; i++) {
        const current = track.points[i];
        newPoints.push(current);

        // If current is selected AND next is selected (filling gap inside selection)
        // AND we are not at the end
        if (selectionSet.has(i) && selectionSet.has(i + 1) && i < track.points.length - 1) {
            const next = track.points[i + 1];
            const dist = getDistanceFromLatLonInKm(current.lat, current.lon, next.lat, next.lon);
            
            if (dist > TARGET_SPACING) {
                const steps = Math.ceil(dist / TARGET_SPACING);
                
                for (let k = 1; k < steps; k++) {
                    const fraction = k / steps;
                    
                    const lat = current.lat + (next.lat - current.lat) * fraction;
                    const lon = current.lon + (next.lon - current.lon) * fraction;
                    const ele = current.ele + (next.ele - current.ele) * fraction;
                    
                    let time: Date | null = null;
                    if (current.time && next.time) {
                         const t1 = current.time instanceof Date ? current.time.getTime() : new Date(current.time).getTime();
                         const t2 = next.time instanceof Date ? next.time.getTime() : new Date(next.time).getTime();
                         time = new Date(t1 + (t2 - t1) * fraction);
                    }

                    newPoints.push({
                        lat, lon, 
                        ele: parseFloat(ele.toFixed(1)), 
                        time,
                        dist: 0, speed: 0, gradient: 0,
                        isAnchor: false
                    });
                }
            }
        }
    }

    const { stats, enrichedPoints } = calculateStats(newPoints);
    return { ...track, points: enrichedPoints, stats, history };
};


export const simplifyTrack = (track: GPXData, factor: number): GPXData => {
    const history = pushHistory(track);
    // Keep anchors even if they would be skipped by factor
    const newPoints = track.points.filter((p, i) => i === 0 || i === track.points.length - 1 || i % factor === 0 || p.isAnchor);
    const { stats, enrichedPoints } = calculateStats(newPoints);
    return { ...track, points: enrichedPoints, stats, history };
};

// Simplify ONLY the selected points (keep every Nth point in the selection)
export const simplifySelectedPoints = (track: GPXData, indices: Set<number>, factor: number = 2): GPXData => {
    if (indices.size === 0) return track;
    const history = pushHistory(track);
    
    // Filter rule: Keep point if (NOT in selection) OR (In selection AND index meets factor) OR (In Selection AND isAnchor)
    const newPoints = track.points.filter((p, i) => !indices.has(i) || i % factor === 0 || p.isAnchor);

    const { stats, enrichedPoints } = calculateStats(newPoints);
    return { ...track, points: enrichedPoints, stats, history };
};

export const reverseTrack = (track: GPXData): GPXData => {
    const history = pushHistory(track);
    const reversedPoints = [...track.points].reverse().map(p => ({
        ...p,
        time: null, // Invalidate time
        dist: 0,
        speed: 0
    }));
    
    const { stats, enrichedPoints } = calculateStats(reversedPoints);
    return { ...track, points: enrichedPoints, stats, history };
};

export const cropTrack = (track: GPXData, startIdx: number, endIdx: number): GPXData => {
    if (startIdx < 0) startIdx = 0;
    if (endIdx >= track.points.length) endIdx = track.points.length - 1;
    if (startIdx >= endIdx) return track;

    const history = pushHistory(track);
    const slicedPoints = track.points.slice(startIdx, endIdx + 1);
    const { stats, enrichedPoints } = calculateStats(slicedPoints);
    
    return { ...track, points: enrichedPoints, stats, history };
};

// --- Single Point Editing ---

export const deleteTrackPoint = (track: GPXData, index: number): GPXData => {
    if (index < 0 || index >= track.points.length) return track;
    if (track.points[index].isAnchor) return track; // Cannot delete anchor
    
    const history = pushHistory(track);
    const newPoints = [...track.points];
    newPoints.splice(index, 1);
    
    const { stats, enrichedPoints } = calculateStats(newPoints);
    return { ...track, points: enrichedPoints, stats, history };
};

export const deleteMultipleTrackPoints = (track: GPXData, indices: Set<number>): GPXData => {
    if (indices.size === 0) return track;
    
    const history = pushHistory(track);
    // Filter out points whose index exists in the set, BUT keep Anchors
    const newPoints = track.points.filter((p, idx) => !indices.has(idx) || p.isAnchor);
    
    const { stats, enrichedPoints } = calculateStats(newPoints);
    return { ...track, points: enrichedPoints, stats, history };
};

export const updateTrackPoint = (track: GPXData, index: number, newLat: number, newLon: number, newEle: number): GPXData => {
    if (index < 0 || index >= track.points.length) return track;

    const history = pushHistory(track);
    const newPoints = [...track.points];
    // Preserve anchor status and time
    newPoints[index] = { ...newPoints[index], lat: newLat, lon: newLon, ele: newEle };
    
    const { stats, enrichedPoints } = calculateStats(newPoints);
    return { ...track, points: enrichedPoints, stats, history };
};

export const toggleTrackAnchor = (track: GPXData, index: number): GPXData => {
    if (index < 0 || index >= track.points.length) return track;
    
    const history = pushHistory(track);
    const newPoints = [...track.points];
    const isAnchor = !newPoints[index].isAnchor;
    newPoints[index] = { ...newPoints[index], isAnchor };
    
    // Stats don't change, but we return new object
    return { ...track, points: newPoints, history };
}

// Helper: Calculate what a new point would look like if inserted at index
export const calculateInterpolatedPoint = (track: GPXData, index: number): { lat: number, lon: number, ele: number, time: Date | null } => {
    const current = track.points[index];
    const next = track.points[index + 1] || current; // If last point, duplicate

    // Calculate midpoint
    const newLat = (current.lat + next.lat) / 2;
    const newLon = (current.lon + next.lon) / 2;
    // If it's the very last point, offset it slightly
    const finalLat = (index === track.points.length - 1) ? current.lat + 0.0001 : newLat;
    const finalLon = (index === track.points.length - 1) ? current.lon + 0.0001 : newLon;
    
    const newEle = (current.ele + next.ele) / 2;

    let newTime: Date | null = null;
    if (current.time) {
        if (next.time && index !== track.points.length - 1) {
             const t1 = current.time instanceof Date ? current.time.getTime() : new Date(current.time).getTime();
             const t2 = next.time instanceof Date ? next.time.getTime() : new Date(next.time).getTime();
             newTime = new Date((t1 + t2) / 2);
        } else {
             const t1 = current.time instanceof Date ? current.time.getTime() : new Date(current.time).getTime();
             newTime = new Date(t1 + 1000);
        }
    }

    return { lat: finalLat, lon: finalLon, ele: parseFloat(newEle.toFixed(1)), time: newTime };
};

// Modified: Accepts the specific point data to insert
export const insertTrackPoint = (track: GPXData, index: number, lat: number, lon: number, ele: number, time: Date | null): GPXData => {
    if (index < 0 || index >= track.points.length) return track;

    const history = pushHistory(track);
    
    const newPoint: TrackPoint = {
        lat: lat,
        lon: lon,
        ele: ele,
        time: time,
        dist: 0, speed: 0, gradient: 0,
        isAnchor: false
    };

    const newPoints = [...track.points];
    newPoints.splice(index + 1, 0, newPoint); // Insert AFTER index

    const { stats, enrichedPoints } = calculateStats(newPoints);
    return { ...track, points: enrichedPoints, stats, history };
};

export const revertToOriginal = (track: GPXData): GPXData => {
    let resetPoints: TrackPoint[] = [];

    if (track.originalXML) {
        try {
            const { points } = parseGPXContent(track.originalXML);
            resetPoints = points;
        } catch (e) {
            console.error("Failed to re-parse original XML, falling back to backup points", e);
        }
    }

    if (resetPoints.length === 0 && track.originalPoints && track.originalPoints.length > 0) {
        resetPoints = track.originalPoints.map(p => {
            let time: Date | null = null;
            if (p.time) {
                if (p.time instanceof Date) {
                    time = new Date(p.time.getTime());
                } else {
                    const t = new Date(p.time);
                    if (!isNaN(t.getTime())) {
                        time = t;
                    }
                }
            }
            return { ...p, time };
        });
    }

    if (resetPoints.length === 0) {
        throw new Error("Cannot revert: No original data found.");
    }
    
    const { stats, enrichedPoints } = calculateStats(resetPoints);
    
    return { 
        ...track, 
        points: enrichedPoints, 
        stats,
        history: [] // Clear undo stack on revert
    };
};

// --- Anomaly Detection ---

const calculateThresholds = (track: GPXData) => {
    const numPoints = track.points.length;
    const avgSpacingKm = numPoints > 1 ? track.stats.totalDistance / (numPoints - 1) : 0.01;
    
    const DIST_THRESHOLD_KM = Math.max(0.2, avgSpacingKm * 50);
    const ELE_THRESHOLD_M = Math.max(15, avgSpacingKm * 1000 * 0.8);
    const MAX_SPEED_KMH = 100;

    return { DIST_THRESHOLD_KM, ELE_THRESHOLD_M, MAX_SPEED_KMH };
};

export const analyzeAnomalies = (track: GPXData): AnomalyReport => {
    const speedIndices: number[] = [];
    const elevationIndices: number[] = [];
    const gapIndices: number[] = [];
    let stops = 0;
    
    const { DIST_THRESHOLD_KM, ELE_THRESHOLD_M, MAX_SPEED_KMH } = calculateThresholds(track);
    
    for (let i = 1; i < track.points.length; i++) {
        const p = track.points[i];
        const prev = track.points[i-1];
        
        const segmentDist = getDistanceFromLatLonInKm(prev.lat, prev.lon, p.lat, p.lon);

        if (segmentDist > DIST_THRESHOLD_KM) {
            gapIndices.push(i);
        }

        if (p.speed > MAX_SPEED_KMH) {
            speedIndices.push(i);
        } 
        
        if (Math.abs(p.ele - prev.ele) > ELE_THRESHOLD_M) {
            elevationIndices.push(i);
        }

        if (p.speed < 1) stops++; 
    }

    return {
        hasErrors: speedIndices.length > 0 || elevationIndices.length > 0 || gapIndices.length > 0,
        speedSpikes: speedIndices.length,
        elevationSpikes: elevationIndices.length,
        distanceGaps: gapIndices.length,
        stops,
        totalPointsToRemove: speedIndices.length + elevationIndices.length + gapIndices.length,
        speedIndices,
        elevationIndices,
        gapIndices
    };
};

// Iterative Deep Clean Algorithm
export const autoFixTrack = (track: GPXData): { track: GPXData, deletedCount: number } => {
    const history = pushHistory(track);
    const { DIST_THRESHOLD_KM, ELE_THRESHOLD_M, MAX_SPEED_KMH } = calculateThresholds(track);
    const MAX_ITERATIONS = 10;

    let currentPoints = [...track.points];
    let totalDeleted = 0;
    let iteration = 0;
    let foundErrors = true;

    while(foundErrors && iteration < MAX_ITERATIONS) {
        foundErrors = false;
        const indicesToRemove = new Set<number>();
        
        for(let i = 1; i < currentPoints.length; i++) {
            const p = currentPoints[i];
            const prev = currentPoints[i-1];

            const dist = getDistanceFromLatLonInKm(prev.lat, prev.lon, p.lat, p.lon);
            const eleDiff = Math.abs(p.ele - prev.ele);
            
            let speed = 0;
            if (p.time && prev.time) {
                const t1 = p.time instanceof Date ? p.time.getTime() : new Date(p.time).getTime();
                const t2 = prev.time instanceof Date ? prev.time.getTime() : new Date(prev.time).getTime();
                const timeDiff = (t1 - t2) / 1000;
                if(timeDiff > 0) speed = (dist / timeDiff) * 3600;
            }

            const isSpeedError = speed > MAX_SPEED_KMH;
            const isEleError = eleDiff > ELE_THRESHOLD_M;
            const isGapError = dist > DIST_THRESHOLD_KM;

            if ((isSpeedError || isEleError || isGapError) && !p.isAnchor) {
                indicesToRemove.add(i);
                foundErrors = true;
            }
        }

        if (indicesToRemove.size > 0) {
            currentPoints = currentPoints.filter((_, i) => !indicesToRemove.has(i));
            totalDeleted += indicesToRemove.size;
        }
        
        iteration++;
    }

    const { stats, enrichedPoints } = calculateStats(currentPoints);
    
    return { 
        track: { ...track, points: enrichedPoints, stats, history },
        deletedCount: totalDeleted
    };
};

// --- Smart Restoration Engine (Context Aware) ---

// Helper: Point to Line Segment Distance (Cross Track Distance)
const getCrossTrackDistance = (p: TrackPoint, start: TrackPoint, end: TrackPoint): number => {
    const R = 6371e3; // meters
    const d13 = getDistanceFromLatLonInKm(start.lat, start.lon, p.lat, p.lon) * 1000;
    const brng13 = Math.atan2(Math.sin(deg2rad(p.lon - start.lon)) * Math.cos(deg2rad(p.lat)), Math.cos(deg2rad(start.lat)) * Math.sin(deg2rad(p.lat)) - Math.sin(deg2rad(start.lat)) * Math.cos(deg2rad(p.lat)) * Math.cos(deg2rad(p.lon - start.lon)));
    const brng12 = Math.atan2(Math.sin(deg2rad(end.lon - start.lon)) * Math.cos(deg2rad(end.lat)), Math.cos(deg2rad(start.lat)) * Math.sin(deg2rad(end.lat)) - Math.sin(deg2rad(start.lat)) * Math.cos(deg2rad(end.lat)) * Math.cos(deg2rad(end.lon - start.lon)));
    const dXt = Math.asin(Math.sin(d13 / R) * Math.sin(brng13 - brng12)) * R;
    return Math.abs(dXt);
};

export const smartTrackRestoration = (track: GPXData): { track: GPXData, report: string } => {
    const history = pushHistory(track);
    
    const MAX_ITERATIONS = 50; 
    let currentPoints = [...track.points];
    let totalDeleted = 0;
    let totalInjected = 0;
    let totalRepositioned = 0;
    let iteration = 0;
    let hasWorkRemaining = true;

    while (hasWorkRemaining && iteration < MAX_ITERATIONS) {
        hasWorkRemaining = false;
        
        const { stats } = calculateStats(currentPoints);
        const numPointsOriginal = currentPoints.length;
        const avgSpacingKm = numPointsOriginal > 1 ? stats.totalDistance / (numPointsOriginal - 1) : 0.01;
        const tempTrack = { ...track, points: currentPoints, stats };
        const { DIST_THRESHOLD_KM, MAX_SPEED_KMH } = calculateThresholds(tempTrack);

        // Heuristic Thresholds
        const CROSS_TRACK_ERR_METERS = 30; // 30m off course = drift/spike

        // 1. CONTEXT AWARE SCAN (Filter / Reposition)
        const processedPoints: TrackPoint[] = [currentPoints[0]];
        
        for (let i = 1; i < currentPoints.length - 1; i++) {
            const prev = processedPoints[processedPoints.length - 1]; // Use LAST KEPT point
            const curr = currentPoints[i];
            const next = currentPoints[i+1];

            if (curr.isAnchor) {
                processedPoints.push(curr);
                continue;
            }

            // A. Check for Spike (Geometry)
            const offCourseDist = getCrossTrackDistance(curr, prev, next);
            const distFromPrev = getDistanceFromLatLonInKm(prev.lat, prev.lon, curr.lat, curr.lon);
            const distToNext = getDistanceFromLatLonInKm(curr.lat, curr.lon, next.lat, next.lon);
            
            // Calculate instantaneous speed
            let speed = 0;
            if (curr.time && prev.time) {
                 const t1 = curr.time instanceof Date ? curr.time.getTime() : new Date(curr.time).getTime();
                 const t2 = prev.time instanceof Date ? prev.time.getTime() : new Date(prev.time).getTime();
                 const timeDiff = (t1 - t2) / 1000;
                 if(timeDiff > 0) speed = (distFromPrev / timeDiff) * 3600;
            }

            // LOGIC: If high speed AND off course -> It's a GPS Spike
            if (speed > MAX_SPEED_KMH || (speed > MAX_SPEED_KMH * 0.8 && offCourseDist > CROSS_TRACK_ERR_METERS)) {
                 // Try Repositioning (Project to midpoint)
                 if (distFromPrev < DIST_THRESHOLD_KM && distToNext < DIST_THRESHOLD_KM) {
                      // It's a local spike, just project it
                      const newLat = (prev.lat + next.lat) / 2;
                      const newLon = (prev.lon + next.lon) / 2;
                      processedPoints.push({ ...curr, lat: newLat, lon: newLon });
                      totalRepositioned++;
                      hasWorkRemaining = true;
                 } else {
                      // It's too messy, DELETE it
                      totalDeleted++;
                      hasWorkRemaining = true;
                 }
            } else {
                 processedPoints.push(curr);
            }
        }
        // Always keep last point
        processedPoints.push(currentPoints[currentPoints.length - 1]);


        // 2. RECONSTRUCTION (Smart Fill)
        const reconstructedPoints: TrackPoint[] = [];
        const GAP_FILL_THRESHOLD = Math.max(avgSpacingKm * 2, 0.02); // 20 meters min

        for (let i = 0; i < processedPoints.length; i++) {
            const current = processedPoints[i];
            reconstructedPoints.push(current);

            if (i < processedPoints.length - 1) {
                const next = processedPoints[i+1];
                const dist = getDistanceFromLatLonInKm(current.lat, current.lon, next.lat, next.lon);

                if (dist > GAP_FILL_THRESHOLD) {
                    const targetStep = Math.max(avgSpacingKm, 0.01); 
                    const steps = Math.ceil(dist / targetStep);
                    // Safe cap on insertion per gap
                    const actualSteps = Math.min(steps, 50); 

                    for (let k = 1; k < actualSteps; k++) {
                        const fraction = k / actualSteps;
                        const lat = current.lat + (next.lat - current.lat) * fraction;
                        const lon = current.lon + (next.lon - current.lon) * fraction;
                        const ele = current.ele + (next.ele - current.ele) * fraction;
                        
                        let time: Date | null = null;
                        if (current.time && next.time) {
                             const t1 = current.time instanceof Date ? current.time.getTime() : new Date(current.time).getTime();
                             const t2 = next.time instanceof Date ? next.time.getTime() : new Date(next.time).getTime();
                             time = new Date(t1 + (t2 - t1) * fraction);
                        }

                        reconstructedPoints.push({
                            lat, lon, ele: parseFloat(ele.toFixed(1)), time,
                            dist: 0, speed: 0, gradient: 0, isAnchor: false
                        });
                        totalInjected++;
                        hasWorkRemaining = true;
                    }
                }
            }
        }
        
        currentPoints = reconstructedPoints;
        iteration++;
    }

    const { stats, enrichedPoints } = calculateStats(currentPoints);
    
    const report = `Context-Aware Repair: ${totalDeleted} removed, ${totalRepositioned} repositioned, ${totalInjected} filled (${iteration} passes).`;

    return { 
        track: { ...track, points: enrichedPoints, stats, history },
        report
    };
};


// --- Parser ---

const parseGPXContent = (xmlString: string): { name: string, points: TrackPoint[] } => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        throw new Error("Error parsing XML/GPX content");
    }

    const trkpts = Array.from(xmlDoc.getElementsByTagName("trkpt"));
    const name = xmlDoc.getElementsByTagName("name")[0]?.textContent || "";

    if (trkpts.length === 0) {
        throw new Error("No valid track points found.");
    }

    const points: TrackPoint[] = trkpts.map(pt => {
        const lat = parseFloat(pt.getAttribute("lat") || "0");
        const lon = parseFloat(pt.getAttribute("lon") || "0");
        const ele = parseFloat(pt.getElementsByTagName("ele")[0]?.textContent || "0");
        const timeStr = pt.getElementsByTagName("time")[0]?.textContent;
        const time = timeStr ? new Date(timeStr) : null;
        
        return {
            lat, lon, ele, time,
            dist: 0, speed: 0, gradient: 0, isAnchor: false
        };
    });

    return { name, points };
};

export const parseGPXFile = async (file: File): Promise<GPXData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const { name: xmlName, points: rawPoints } = parseGPXContent(text);
        const trackName = xmlName || file.name.replace('.gpx', '');
        const { stats, enrichedPoints } = calculateStats(rawPoints);
        
        const originalPoints: TrackPoint[] = enrichedPoints.map(p => {
             let time: Date | null = null;
             if (p.time) {
                 if (p.time instanceof Date) time = new Date(p.time.getTime());
                 else time = new Date(p.time);
             }
             return { ...p, time };
        });

        resolve({
          id: Math.random().toString(36).substr(2, 9),
          name: trackName,
          points: enrichedPoints,
          originalPoints: originalPoints,
          originalXML: text,
          history: [], 
          stats,
          color: getRandomColor(),
          visible: true
        });

      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsText(file);
  });
};

const getRandomColor = () => {
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#d946ef'];
    return colors[Math.floor(Math.random() * colors.length)];
};

export const exportToGPX = (data: GPXData) => {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPX Master Pro - https://gpxmaster.pro">
  <trk>
    <name>${data.name}</name>
    <trkseg>`;
    
    data.points.forEach(pt => {
        let timeStr = '';
        if (pt.time) {
            timeStr = (pt.time instanceof Date) ? pt.time.toISOString() : new Date(pt.time).toISOString();
        }

        gpx += `
      <trkpt lat="${pt.lat}" lon="${pt.lon}">
        <ele>${pt.ele}</ele>${timeStr ? `
        <time>${timeStr}</time>` : ''}
      </trkpt>`;
    });

    gpx += `
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
};