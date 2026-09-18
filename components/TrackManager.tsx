import React from 'react';
import { GPXData } from '../types';
import { Eye, EyeOff, Trash2, MapPin, Download, PanelLeftClose } from 'lucide-react';
import { exportToGPX } from '../services/gpxUtils';

interface TrackManagerProps {
    tracks: GPXData[];
    activeTrackId: string | null;
    // Tracks currently selected in the sidebar (supports multi-select)
    selectedTrackIds?: Set<string>;
    // onSelectTrack receives isMulti (Ctrl/Cmd) to toggle multi-selection
    onSelectTrack: (id: string, isMulti: boolean) => void;
    onToggleVisibility: (id: string) => void;
    onDeleteTrack: (id: string) => void;
    onColorChange: (id: string, color: string) => void;
    onClose?: () => void;
}

export const TrackManager: React.FC<TrackManagerProps> = ({
    tracks,
    activeTrackId,
    onSelectTrack,
    onToggleVisibility,
    onDeleteTrack,
    onColorChange,
    onClose
}) => {
    return (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex items-center justify-between">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <MapPin size={18} className="text-emerald-500" />
                    My Routes ({tracks.length})
                </h3>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded transition-colors"
                        title="Hide Sidebar"
                    >
                        <PanelLeftClose size={18} />
                    </button>
                )}
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                {tracks.map(track => (
                    <div
                        key={track.id}
                        onClick={(e) => onSelectTrack(track.id, e.ctrlKey || e.metaKey)}
                        className={`
                    p-3 rounded-xl border transition-all cursor-pointer group
                    ${activeTrackId === track.id || (selectedTrackIds && selectedTrackIds.has(track.id))
                                ? 'bg-emerald-900/20 border-emerald-500/50'
                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'}
                `}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <div
                                    className="w-3 h-3 rounded-full shadow-sm flex-shrink-0"
                                    style={{ backgroundColor: track.color }}
                                />
                                <span className={`font-medium truncate text-sm ${activeTrackId === track.id ? 'text-white' : 'text-slate-300'}`}>
                                    {track.name}
                                </span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onToggleVisibility(track.id); }}
                                className="text-slate-500 hover:text-white transition-colors p-1"
                            >
                                {track.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                        </div>

                        <div className="flex items-center justify-between mt-2 pl-5">
                            <div className="text-xs text-slate-500">
                                {track.stats.totalDistance.toFixed(1)} km • {track.points.length} pts
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <input
                                    type="color"
                                    value={track.color}
                                    onChange={(e) => onColorChange(track.id, e.target.value)}
                                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                    onClick={(e) => { e.stopPropagation(); exportToGPX(track); }}
                                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400"
                                    title="Download GPX"
                                >
                                    <Download size={14} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDeleteTrack(track.id); }}
                                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
                                    title="Delete"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {tracks.length === 0 && (
                    <div className="text-center py-10 text-slate-500 text-sm">
                        No routes loaded.
                    </div>
                )}
            </div>
        </div>
    );
};