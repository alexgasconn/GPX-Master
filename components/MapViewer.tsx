import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, CircleMarker, Marker, Popup, LayersControl, useMapEvents } from 'react-leaflet';
import { GPXData, TrackPoint, AnomalyReport, PendingPoint, RoutingMode, RoutingProfile, ExtensionEnd } from '../types';
import L from 'leaflet';
import { Disc, AlertCircle, Magnet, Pencil, Plus, Check, X, LoaderCircle } from 'lucide-react';

const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: iconUrl,
    iconRetinaUrl: iconRetinaUrl,
    shadowUrl: shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// CARTO API key for raster basemaps (added so tiles remove watermark)
const CARTO_API_KEY = 'cb1_2hl3_1_c4dfd0f0c288bbb5cd981bed';

// Custom Draggable Icon
const EditIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Green Icon for New Point Creation
const CreateIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Anchor Icon (Gold Star)
const AnchorIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.5));">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fbbf24" stroke="#78350f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
           </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
});

// Error Icon for Anomalies (Red)
const ErrorIcon = L.divIcon({
    className: 'custom-div-icon',
    html: "<div style='background-color: #ef4444; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.4); border: 2px solid white;'></div>",
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

// Warning Icon for Gaps (Orange)
const GapIcon = L.divIcon({
    className: 'custom-div-icon',
    html: "<div style='background-color: #f97316; width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.4); border: 2px solid white;'></div>",
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

interface MapViewerProps {
    tracks: GPXData[];
    activeTrackId: string | null;
    hoverIndex: number | null;
    onTrackClick: (id: string) => void;
    cropRange: [number, number] | null;
    // Editing props
    selectedPointIndex: number | null;
    selectedIndices: Set<number>;
    onPointSelect: (index: number | null, isMultiSelect?: boolean, isRangeSelect?: boolean) => void;
    onPointMove: (index: number, lat: number, lon: number) => void;
    // Features
    showPoints: boolean;
    onToggleShowPoints: () => void;
    anomalies: AnomalyReport | null;

    // Pending Point (Insert Mode)
    pendingPoint: PendingPoint | null;
    onMapClickForInsert: (lat: number, lon: number) => void;
    routingMode: RoutingMode;
    onRoutingModeChange: (mode: RoutingMode) => void;
    routingProfile: RoutingProfile;
    onRoutingProfileChange: (profile: RoutingProfile) => void;
    extensionEnd: ExtensionEnd | null;
    onExtensionChange: (end: ExtensionEnd | null) => void;
    onExtendPoint: (lat: number, lon: number) => void;
    routingBusy: boolean;
    routingError: string | null;
    onDismissRoutingError: () => void;
}

const ExtensionInteraction: React.FC<{
    endpoint: TrackPoint | undefined;
    enabled: boolean;
    busy: boolean;
    onExtend: (lat: number, lon: number) => void;
    onFinish: () => void;
}> = ({ endpoint, enabled, busy, onExtend, onFinish }) => {
    const [cursor, setCursor] = useState<[number, number] | null>(null);
    const map = useMapEvents({
        click: event => {
            if (enabled && !busy) onExtend(event.latlng.lat, event.latlng.lng);
        },
        mousemove: event => {
            if (enabled && !busy) setCursor([event.latlng.lat, event.latlng.lng]);
        },
        mouseout: () => setCursor(null)
    });
    useEffect(() => {
        const container = map.getContainer();
        const previousCursor = container.style.cursor;
        container.style.cursor = busy ? 'wait' : enabled ? 'crosshair' : previousCursor;
        const doubleClickZoom = map.doubleClickZoom.enabled();
        if (enabled) map.doubleClickZoom.disable();
        const finish = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && enabled && !busy) onFinish();
        };
        window.addEventListener('keydown', finish);
        return () => {
            container.style.cursor = previousCursor;
            if (doubleClickZoom) map.doubleClickZoom.enable();
            window.removeEventListener('keydown', finish);
        };
    }, [map, enabled, busy, onFinish]);
    useEffect(() => { setCursor(null); }, [enabled, busy]);
    if (!enabled || busy || !endpoint || !cursor) return null;
    return <Polyline positions={[[endpoint.lat, endpoint.lon], cursor]} interactive={false}
        pathOptions={{ color: '#10b981', weight: 3, dashArray: '6, 6' }} />;
};

const MapRecenter: React.FC<{ points: TrackPoint[], trackId: string | null, selectedPointIndex: number | null }> = ({ points, trackId, selectedPointIndex }) => {
    const map = useMap();

    // 1. Recenter when Track Changes
    useEffect(() => {
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [trackId, map]); // Dependent on trackId

    // 2. Pan when a specific point is Selected (e.g. from Error List)
    useEffect(() => {
        if (selectedPointIndex !== null && points[selectedPointIndex]) {
            const pt = points[selectedPointIndex];
            // Use panTo for smooth animation, keep current zoom
            map.panTo([pt.lat, pt.lon], { animate: true, duration: 0.5 });
        }
    }, [selectedPointIndex, map]); // Dependent on selectedPointIndex

    return null;
};

// Component to handle drags on the selected point
const DraggablePoint: React.FC<{
    point: TrackPoint;
    index: number;
    onMove: (idx: number, lat: number, lon: number) => void;
}> = ({ point, index, onMove }) => {
    const markerRef = useRef<L.Marker>(null);
    const eventHandlers = useMemo(
        () => ({
            dragend() {
                const marker = markerRef.current;
                if (marker) {
                    const { lat, lng } = marker.getLatLng();
                    onMove(index, lat, lng);
                }
            },
        }),
        [index, onMove],
    );

    return (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={[point.lat, point.lon]}
            ref={markerRef}
            icon={EditIcon}
            zIndexOffset={1000}
        >
            <Popup>
                <strong>Edit Point #{index}</strong><br />
                Drag to move
            </Popup>
        </Marker>
    );
};

// Component to handle drags for NEW point
const PendingPointMarker: React.FC<{
    lat: number;
    lon: number;
    onMove: (lat: number, lon: number) => void;
}> = ({ lat, lon, onMove }) => {
    const markerRef = useRef<L.Marker>(null);
    const eventHandlers = useMemo(
        () => ({
            dragend() {
                const marker = markerRef.current;
                if (marker) {
                    const { lat, lng } = marker.getLatLng();
                    onMove(lat, lng);
                }
            },
        }),
        [onMove],
    );

    return (
        <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={[lat, lon]}
            ref={markerRef}
            icon={CreateIcon}
            zIndexOffset={2000}
        >
            <Popup offset={[0, -30]}>
                <strong>New Point</strong><br />
                Drag or Click map to place
            </Popup>
        </Marker>
    );
};


// Component to handle clicking on the polyline to find closest point
const TrackInteraction: React.FC<{
    points: TrackPoint[],
    isActive: boolean,
    onPointSelect: (index: number, isMultiSelect: boolean, isRangeSelect: boolean) => void,
    isInsertMode: boolean
}> = ({ points, isActive, onPointSelect, isInsertMode }) => {

    if (!isActive || isInsertMode) return null; // Disable selection if inserting

    return (
        <Polyline
            positions={points.map(p => [p.lat, p.lon])}
            // INCREASED WEIGHT HERE (25 -> 45) for better click area
            pathOptions={{ color: 'transparent', weight: 45, zIndex: 50 }}
            eventHandlers={{
                click: (e) => {
                    // Find closest point to click
                    let minDist = Infinity;
                    let closestIndex = -1;
                    const clickLat = e.latlng.lat;
                    const clickLon = e.latlng.lng;

                    points.forEach((p, i) => {
                        const d = Math.sqrt(Math.pow(p.lat - clickLat, 2) + Math.pow(p.lon - clickLon, 2));
                        if (d < minDist) {
                            minDist = d;
                            closestIndex = i;
                        }
                    });

                    if (closestIndex !== -1) {
                        const isMulti = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
                        const isRange = e.originalEvent.shiftKey;
                        onPointSelect(closestIndex, isMulti, isRange);
                        L.DomEvent.stopPropagation(e); // Prevent map click
                    }
                }
            }}
        />
    );
};

// Map Control Button UI
const CustomMapControl: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const controlRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!controlRef.current) return;
        L.DomEvent.disableClickPropagation(controlRef.current);
        L.DomEvent.disableScrollPropagation(controlRef.current);
    }, []);
    return (
        <div ref={controlRef} className="leaflet-bottom leaflet-left" style={{ bottom: '24px', left: '12px', pointerEvents: 'auto', zIndex: 1000 }}>
            <div className="leaflet-control flex flex-col gap-2">
                {children}
            </div>
        </div>
    );
};

// Handle Map Clicks
const MapClickHandler: React.FC<{ onClick: () => void, onInsertClick: (lat: number, lon: number) => void, isInsertMode: boolean }> = ({ onClick, onInsertClick, isInsertMode }) => {
    useMapEvents({
        click: (e) => {
            if (isInsertMode) {
                onInsertClick(e.latlng.lat, e.latlng.lng);
            } else {
                onClick();
            }
        }
    });
    return null;
};


export const MapViewer: React.FC<MapViewerProps> = ({
    tracks, activeTrackId, hoverIndex, onTrackClick, cropRange,
    selectedPointIndex, selectedIndices, onPointSelect, onPointMove,
    showPoints, onToggleShowPoints, anomalies,
    pendingPoint, onMapClickForInsert,
    routingMode, onRoutingModeChange, routingProfile, onRoutingProfileChange,
    extensionEnd, onExtensionChange, onExtendPoint, routingBusy, routingError, onDismissRoutingError
}) => {
    const activeTrack = tracks.find(t => t.id === activeTrackId);
    const visibleTracks = tracks.filter(t => t.visible);
    const isInsertMode = !!pendingPoint || !!extensionEnd || routingBusy;

    if (visibleTracks.length === 0) return (
        <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-500 rounded-2xl border border-slate-700">
            No visible tracks
        </div>
    );

    const pointsForCenter = activeTrack?.points.length ? activeTrack.points : visibleTracks.find(track => track.points.length > 0)?.points;
    if (!pointsForCenter) return <div className="h-full flex items-center justify-center text-slate-400">No hay puntos visibles</div>;
    const canExtend = !!activeTrack?.visible && activeTrack.points.length > 0;
    const endpoint = extensionEnd === 'start' ? activeTrack?.points[0] : activeTrack?.points[activeTrack.points.length - 1];
    const hoverPoint = (activeTrack && hoverIndex !== null) ? activeTrack.points[hoverIndex] : null;
    const selectedPoint = (activeTrack && selectedPointIndex !== null) ? activeTrack.points[selectedPointIndex] : null;

    return (
        <div className="h-full w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-700 z-0 relative">
            <MapContainer
                center={[pointsForCenter[0].lat, pointsForCenter[0].lon]}
                zoom={13}
                maxZoom={22} // Allow higher zoom levels
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
                preferCanvas={true} // Performance optimization for many points
                zoomControl={false} // We can add custom zoom control if needed, but keeping standard for now is fine, actually let's move standard to top right
            >
                <MapClickHandler
                    onClick={() => { if (!extensionEnd && !routingBusy) onPointSelect(null); }}
                    onInsertClick={(lat, lon) => { if (pendingPoint && !routingBusy) onMapClickForInsert(lat, lon); }}
                    isInsertMode={isInsertMode}
                />
                <ExtensionInteraction endpoint={endpoint} enabled={!!extensionEnd && canExtend} busy={routingBusy}
                    onExtend={onExtendPoint} onFinish={() => onExtensionChange(null)} />

                {/* Custom Toggle Control - Moved to Bottom Left */}
                <CustomMapControl>
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleShowPoints(); }}
                        className={`h-10 px-4 flex items-center justify-center gap-2 rounded-xl bg-white/90 backdrop-blur border border-slate-200 hover:bg-white transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 ${showPoints ? 'text-emerald-600 font-bold border-emerald-400 ring-1 ring-emerald-400' : 'text-slate-600'}`}
                        title="Toggle Raw GPX Points Visibility"
                    >
                        <Disc size={18} />
                        <span className="text-xs font-bold">Raw Points</span>
                    </button>
                    {anomalies?.hasErrors && (
                        <div className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl shadow-lg animate-pulse flex items-center gap-2 border border-red-400">
                            <AlertCircle size={16} />
                            <span>Errors Detected</span>
                        </div>
                    )}
                </CustomMapControl>

                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Dark (Carto)">
                        <TileLayer
                            attribution='&copy; CARTO'
                            url={`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`}
                            maxNativeZoom={19}
                            maxZoom={22}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Light (Carto)">
                        <TileLayer
                            attribution='&copy; CARTO'
                            url={`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`}
                            maxNativeZoom={19}
                            maxZoom={22}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Satellite (Esri)">
                        <TileLayer
                            attribution='Tiles &copy; Esri'
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            maxNativeZoom={17}
                            maxZoom={22}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="OpenStreetMap">
                        <TileLayer
                            attribution='&copy; OSM'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            maxNativeZoom={19}
                            maxZoom={22}
                        />
                    </LayersControl.BaseLayer>
                </LayersControl>

                {/* Update MapRecenter to accept selectedPointIndex for auto-pan */}
                <MapRecenter
                    points={pointsForCenter}
                    trackId={activeTrackId || visibleTracks[0]?.id || null}
                    selectedPointIndex={selectedPointIndex}
                />

                {visibleTracks.map((track) => {
                    const isActive = track.id === activeTrackId;
                    const allPositions = track.points.map(p => [p.lat, p.lon] as [number, number]);

                    // Interaction Layer for Click to Edit
                    if (isActive) {
                        return (
                            <React.Fragment key={`interaction-${track.id}`}>
                                <TrackInteraction
                                    points={track.points}
                                    isActive={isActive}
                                    onPointSelect={onPointSelect}
                                    isInsertMode={isInsertMode}
                                />
                                {/* Visual Line */}
                                {cropRange ? (
                                    // Crop Mode Visualization
                                    <>
                                        <Polyline positions={allPositions} pathOptions={{ color: '#64748b', weight: 2, opacity: 0.3, dashArray: '5, 5' }} />
                                        <Polyline positions={allPositions.slice(cropRange[0], cropRange[1] + 1)} pathOptions={{ color: '#10b981', weight: 6, opacity: 1 }} />
                                    </>
                                ) : (
                                    // Normal Mode
                                    <Polyline
                                        positions={allPositions}
                                        interactive={false}
                                        pathOptions={{
                                            color: track.color,
                                            weight: isActive ? 4 : 3,
                                            opacity: isActive ? 1 : 0.6
                                        }}
                                    />
                                )}

                                {/* Visualizing Anchor Points */}
                                {track.points.map((pt, idx) => {
                                    if (!pt.isAnchor) return null;
                                    return (
                                        <Marker
                                            key={`anchor-${idx}`}
                                            position={[pt.lat, pt.lon]}
                                            icon={AnchorIcon}
                                            zIndexOffset={500}
                                            eventHandlers={{
                                                click: (e) => {
                                                    if (!isInsertMode) {
                                                        // Anchors are selectable too
                                                        onPointSelect(idx, false, false);
                                                        L.DomEvent.stopPropagation(e);
                                                    }
                                                }
                                            }}
                                        >
                                            <Popup>
                                                <strong>Anchor Point</strong><br />
                                                Pinned ("Yes or Yes")
                                            </Popup>
                                        </Marker>
                                    );
                                })}

                                {track.points.map((point, index) => point.routingRole === 'control' && !point.isAnchor ? (
                                    <CircleMarker key={`control-${index}`} center={[point.lat, point.lon]} radius={5}
                                        interactive={!isInsertMode}
                                        pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 1, weight: 2 }}
                                        eventHandlers={{
                                            click: event => {
                                                if (isInsertMode) return;
                                                L.DomEvent.stopPropagation(event);
                                                onPointSelect(index, event.originalEvent.ctrlKey || event.originalEvent.metaKey, event.originalEvent.shiftKey);
                                            }
                                        }} />
                                ) : null)}

                                {/* Show Points Feature (Visualizing ALL selected points) */}
                                {(showPoints || selectedIndices.size > 0) && track.points.map((pt, idx) => {
                                    const isSelected = selectedIndices.has(idx);
                                    // If unselected and showPoints OFF, hide
                                    if (!showPoints && !isSelected) return null;

                                    if (isSelected) {
                                        // Render HIGH CONTRAST double-ring for selected points
                                        return (
                                            <React.Fragment key={`pt-selected-${idx}`}>
                                                {/* Outer Halo */}
                                                <CircleMarker
                                                    center={[pt.lat, pt.lon]}
                                                    radius={9}
                                                    pathOptions={{
                                                        fillColor: 'transparent',
                                                        color: '#ef4444',
                                                        weight: 2,
                                                        opacity: 0.5
                                                    }}
                                                />
                                                {/* Inner Core */}
                                                <CircleMarker
                                                    center={[pt.lat, pt.lon]}
                                                    radius={5}
                                                    pathOptions={{
                                                        fillColor: '#ef4444',
                                                        fillOpacity: 1,
                                                        color: 'white',
                                                        weight: 2,
                                                        opacity: 1
                                                    }}
                                                    eventHandlers={{
                                                        click: (e) => {
                                                            if (!isInsertMode) {
                                                                const isMulti = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
                                                                const isRange = e.originalEvent.shiftKey;
                                                                onPointSelect(idx, isMulti, isRange);
                                                                L.DomEvent.stopPropagation(e);
                                                            }
                                                        }
                                                    }}
                                                />
                                            </React.Fragment>
                                        );
                                    }

                                    // Standard Point (Small, White)
                                    return (
                                        <CircleMarker
                                            key={`pt-${idx}`}
                                            center={[pt.lat, pt.lon]}
                                            radius={2}
                                            pathOptions={{
                                                fillColor: 'white',
                                                fillOpacity: 0.5, // Reduced opacity for visual clarity
                                                color: 'transparent',
                                                weight: 0
                                            }}
                                            eventHandlers={{
                                                click: (e) => {
                                                    if (!isInsertMode) {
                                                        const isMulti = e.originalEvent.ctrlKey || e.originalEvent.metaKey;
                                                        const isRange = e.originalEvent.shiftKey;
                                                        onPointSelect(idx, isMulti, isRange);
                                                        L.DomEvent.stopPropagation(e);
                                                    }
                                                }
                                            }}
                                        />
                                    );
                                })}

                                {/* Anomaly Visualization */}
                                {anomalies && anomalies.speedIndices.map(idx => (
                                    <Marker
                                        key={`err-speed-${idx}`}
                                        position={[track.points[idx].lat, track.points[idx].lon]}
                                        icon={ErrorIcon}
                                    >
                                        <Popup>
                                            <strong className="text-red-600">Speed Spike</strong><br />
                                            {track.points[idx].speed.toFixed(1)} km/h
                                        </Popup>
                                    </Marker>
                                ))}
                                {anomalies && anomalies.elevationIndices.map(idx => (
                                    <Marker
                                        key={`err-ele-${idx}`}
                                        position={[track.points[idx].lat, track.points[idx].lon]}
                                        icon={ErrorIcon}
                                    >
                                        <Popup>
                                            <strong className="text-red-600">Elevation Jump</strong><br />
                                            {track.points[idx].ele}m
                                        </Popup>
                                    </Marker>
                                ))}
                                {anomalies && anomalies.gapIndices.map(idx => (
                                    <Marker
                                        key={`err-gap-${idx}`}
                                        position={[track.points[idx].lat, track.points[idx].lon]}
                                        icon={GapIcon}
                                    >
                                        <Popup>
                                            <strong className="text-orange-600">Distance Gap</strong><br />
                                            Possible missing data or GPS jump.
                                        </Popup>
                                    </Marker>
                                ))}

                            </React.Fragment>
                        )
                    }

                    return (
                        <Polyline
                            key={track.id}
                            positions={allPositions}
                            interactive={!extensionEnd && !routingBusy}
                            pathOptions={{ color: track.color, weight: 3, opacity: 0.6 }}
                            eventHandlers={{ click: () => onTrackClick(track.id) }}
                        />
                    );
                })}

                {/* Hover Highlight */}
                {hoverPoint && (
                    <CircleMarker
                        center={[hoverPoint.lat, hoverPoint.lon]}
                        pathOptions={{ color: '#ffffff', fillColor: activeTrack?.color || '#a855f7', fillOpacity: 1 }}
                        radius={8}
                    />
                )}

                {/* Selected / Editing Point (Primary Selection) */}
                {selectedPoint && activeTrack && selectedPointIndex !== null && !isInsertMode && (
                    <DraggablePoint
                        point={selectedPoint}
                        index={selectedPointIndex}
                        onMove={onPointMove}
                    />
                )}

                {/* Pending Point (Insert Mode) */}
                {pendingPoint && !routingBusy && (
                    <PendingPointMarker
                        lat={pendingPoint.lat}
                        lon={pendingPoint.lon}
                        onMove={onMapClickForInsert}
                    />
                )}

            </MapContainer>
            <div className="absolute top-3 left-3 right-14 z-[1000] flex flex-col items-start gap-2 pointer-events-none">
                <div className="max-w-full flex flex-wrap items-center gap-1 p-1 bg-slate-900/95 border border-slate-600 rounded-lg shadow-lg pointer-events-auto">
                    <div role="group" aria-label="Modo de enrutamiento" className="flex gap-1">
                        <button type="button" aria-pressed={routingMode === 'snap'} title="Ajustar a caminos reales"
                            disabled={routingBusy} onClick={() => onRoutingModeChange('snap')}
                            className={`h-9 w-9 flex items-center justify-center rounded-md disabled:opacity-50 ${routingMode === 'snap' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                            <Magnet size={18} aria-hidden="true" /><span className="sr-only">Ajustar a caminos</span>
                        </button>
                        <button type="button" aria-pressed={routingMode === 'free'} title="Modo libre: linea recta"
                            disabled={routingBusy} onClick={() => onRoutingModeChange('free')}
                            className={`h-9 w-9 flex items-center justify-center rounded-md disabled:opacity-50 ${routingMode === 'free' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
                            <Pencil size={18} aria-hidden="true" /><span className="sr-only">Modo libre</span>
                        </button>
                    </div>
                    <select aria-label="Perfil de actividad" title="Perfil de actividad" value={routingProfile}
                        disabled={routingMode === 'free' || routingBusy} onChange={event => onRoutingProfileChange(event.target.value as RoutingProfile)}
                        className="h-9 min-w-0 max-w-full bg-slate-800 text-slate-100 text-xs px-2 rounded-md border border-slate-600 disabled:opacity-50">
                        <option value="pedestrian">Senderismo / Trail</option>
                        <option value="bicycle">Ciclismo / MTB</option>
                    </select>
                    <button type="button" aria-pressed={!!extensionEnd} disabled={!canExtend || routingBusy}
                        onClick={() => onExtensionChange(extensionEnd ? null : 'end')}
                        className={`h-9 px-2 flex items-center gap-2 text-xs font-bold rounded-md disabled:opacity-50 ${extensionEnd ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
                        {extensionEnd ? <Check size={16} /> : <Plus size={16} />}
                        {extensionEnd ? 'Terminar' : 'Anadir puntos'}
                    </button>
                    {extensionEnd && <select aria-label="Extremo de extension" value={extensionEnd} disabled={routingBusy}
                        onChange={event => onExtensionChange(event.target.value as ExtensionEnd)}
                        className="h-9 bg-slate-800 text-white text-xs px-2 rounded-md border border-slate-600">
                        <option value="end">Al final</option><option value="start">Al principio</option>
                    </select>}
                </div>
                {routingBusy && <div role="status" className="flex items-center gap-2 bg-slate-900 text-white text-xs p-2 rounded-lg shadow-lg">
                    <LoaderCircle size={16} className="animate-spin" /> Calculando ruta...
                </div>}
                {routingError && <div role="alert" className="max-w-full flex items-start gap-2 bg-red-950 text-red-100 border border-red-600 text-xs p-2 rounded-lg shadow-lg pointer-events-auto">
                    <AlertCircle size={16} className="shrink-0" /><span className="min-w-0 break-words">{routingError}</span>
                    <button type="button" title="Cerrar error" aria-label="Cerrar error" onClick={onDismissRoutingError} className="shrink-0 p-1"><X size={14} /></button>
                </div>}
            </div>
        </div>
    );
};