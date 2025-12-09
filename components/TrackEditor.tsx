import React, { useState, useEffect } from 'react';
import { GPXData, AnomalyReport, PendingPoint } from '../types';
import { 
  Scissors, TrendingUp, RefreshCcw, 
  Wand2, MapPin, Trash2, Undo2, MousePointerClick, Download, Disc, RotateCcw, PlusCircle, Check, X, Layers, Sparkles, GalleryHorizontalEnd, Filter, Bot, Star, FileJson, Activity, AlertTriangle, FileCode, LocateFixed, ArrowUp
} from 'lucide-react';
import { 
  analyzeAnomalies, 
  autoFixTrack, 
  exportToGPX, 
  smoothTrackGeometry,
  smoothElevation,
  simplifyTrack,
  reverseTrack,
  cropTrack,
  undoTrack,
  smartTrackRestoration
} from '../services/gpxUtils';

interface TrackEditorProps {
  track: GPXData;
  onUpdateTrack: (updatedTrack: GPXData) => void;
  setCropRange: (range: [number, number] | null) => void;
  selectedPointIndex: number | null;
  selectedIndices?: Set<number>;
  onDeletePoint: (index: number) => void;
  onBatchDelete?: () => void;
  onBatchSmooth?: (strength: 'soft' | 'strong' | 'ultra') => void;
  onBatchDensify?: () => void;
  onBatchSimplify?: () => void;
  onEditPoint?: (index: number, lat: number, lon: number, ele: number) => void;
  onToggleAnchor?: (index: number) => void;
  onSelectPoint?: (index: number) => void; // New prop for Jump feature
  onElevationOffset?: (offset: number) => void; // New prop for global elevation offset
  
  // Lifted state for anomalies
  anomalyReport: AnomalyReport | null;
  setAnomalyReport: (report: AnomalyReport | null) => void;
  // Visualization
  showPoints: boolean;
  onToggleShowPoints: () => void;
  
  // Insert Point Props
  pendingPoint: PendingPoint | null;
  onStartInsert: (index: number) => void;
  onUpdatePending: (lat: number, lon: number, ele: number) => void;
  onConfirmInsert: () => void;
  onCancelInsert: () => void;
}

type Tab = 'tools' | 'point' | 'crop' | 'fix' | 'magic';

export const TrackEditor: React.FC<TrackEditorProps> = ({ 
    track, onUpdateTrack, setCropRange, selectedPointIndex, selectedIndices = new Set(), onDeletePoint, onBatchDelete, onBatchSmooth, onBatchDensify, onBatchSimplify, onEditPoint, onToggleAnchor, onSelectPoint, onElevationOffset,
    anomalyReport, setAnomalyReport, showPoints, onToggleShowPoints,
    pendingPoint, onStartInsert, onUpdatePending, onConfirmInsert, onCancelInsert
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('tools');
  
  // Crop State
  const [cropStart, setCropStart] = useState(0); 
  const [cropEnd, setCropEnd] = useState(0); 

  // Point Edit State
  const [eleInput, setEleInput] = useState<string>("");
  
  // Elevation Offset State
  const [eleOffsetInput, setEleOffsetInput] = useState<string>("");

  // Pending Point Inputs
  const [pendingLat, setPendingLat] = useState("");
  const [pendingLon, setPendingLon] = useState("");
  const [pendingEle, setPendingEle] = useState("");
  
  // Feedback for Fix
  const [fixFeedback, setFixFeedback] = useState<string | null>(null);

  const isMultiSelect = selectedIndices.size > 1;
  const hasHistory = track.history && track.history.length > 0;

  useEffect(() => {
      setCropStart(0);
      setCropEnd(track.points.length - 1);
      setAnomalyReport(null);
      setCropRange(null);
      setFixFeedback(null);
      setEleOffsetInput("");
      
      // Auto switch to point tab if point selected
      if (selectedPointIndex !== null || selectedIndices.size > 0) {
          setActiveTab('point');
          if (selectedPointIndex !== null && track.points[selectedPointIndex]) {
             setEleInput(track.points[selectedPointIndex].ele.toString());
          }
      }
  }, [track.id, selectedPointIndex, selectedIndices.size, setAnomalyReport, track.points.length, setCropRange]);

  useEffect(() => {
    // Sync ele input if point data changes externally (e.g. undo)
    if (selectedPointIndex !== null && track.points[selectedPointIndex]) {
        setEleInput(track.points[selectedPointIndex].ele.toString());
    }
  }, [track.points, selectedPointIndex]);

  useEffect(() => {
      if (activeTab === 'crop') {
          setCropRange([cropStart, cropEnd]);
      } else {
          setCropRange(null);
      }
  }, [cropStart, cropEnd, activeTab, setCropRange]);
  
  // Sync Pending Inputs with State
  useEffect(() => {
      if (pendingPoint) {
          setActiveTab('point');
          setPendingLat(pendingPoint.lat.toFixed(6));
          setPendingLon(pendingPoint.lon.toFixed(6));
          setPendingEle(pendingPoint.ele.toString());
      }
  }, [pendingPoint]);

  const runAnalysis = () => {
      const report = analyzeAnomalies(track);
      setAnomalyReport(report);
      setFixFeedback(null);
  };

  const applyFix = () => {
      const { track: fixed, deletedCount } = autoFixTrack(track);
      onUpdateTrack(fixed);
      const newReport = analyzeAnomalies(fixed);
      setAnomalyReport(newReport);
      setFixFeedback(`Deep clean finished! Removed ${deletedCount} erroneous points.`);
  };

  const applySmartRestoration = () => {
      const { track: fixed, report } = smartTrackRestoration(track);
      onUpdateTrack(fixed);
      const newReport = analyzeAnomalies(fixed);
      setAnomalyReport(newReport);
      setFixFeedback(report);
  };

  const handleApplyCrop = () => {
      const newTrack = cropTrack(track, cropStart, cropEnd);
      onUpdateTrack(newTrack);
      setActiveTab('tools');
  };

  const handleUndo = () => {
      const undone = undoTrack(track);
      onUpdateTrack(undone);
  };

  const handleEleBlur = () => {
      if (selectedPointIndex === null || !onEditPoint) return;
      const val = parseFloat(eleInput);
      if (!isNaN(val)) {
          const pt = track.points[selectedPointIndex];
          // Only update if changed
          if (val !== pt.ele) {
              onEditPoint(selectedPointIndex, pt.lat, pt.lon, val);
          }
      } else {
          // Reset to current val if invalid
           setEleInput(track.points[selectedPointIndex].ele.toString());
      }
  };

  const handleApplyEleOffset = () => {
      if (!onElevationOffset) return;
      const val = parseFloat(eleOffsetInput);
      if (!isNaN(val) && val !== 0) {
          onElevationOffset(val);
          setEleOffsetInput("");
      }
  };
  
  const handlePendingBlur = () => {
      const lat = parseFloat(pendingLat);
      const lon = parseFloat(pendingLon);
      const ele = parseFloat(pendingEle);
      if (!isNaN(lat) && !isNaN(lon) && !isNaN(ele)) {
          onUpdatePending(lat, lon, ele);
      }
  };

  // Helper for Context Tip
  const getContextTip = () => {
      if (activeTab === 'tools') return "Global modifications apply to the entire track at once.";
      if (activeTab === 'point' && isMultiSelect) return "Batch Mode: Editing multiple points simultaneously.";
      if (activeTab === 'point' && selectedPointIndex !== null) return "Drag the map marker to adjust placement.";
      if (activeTab === 'crop') return "Drag sliders to remove start/end sections.";
      if (activeTab === 'fix') return "Inspects list of errors. Jump to see them, delete to fix.";
      if (activeTab === 'magic') return "Iterative engine that reconstructs broken sections.";
      return "Select a tab to begin editing.";
  };

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 h-full flex flex-col overflow-hidden relative shadow-xl">
       {/* Tab Header */}
       <div className="flex border-b border-slate-700 bg-slate-900/80 overflow-x-auto relative z-20 scrollbar-hide flex-none">
            {[
                { id: 'tools', label: 'Tools', color: 'emerald' },
                { id: 'point', label: 'Point', color: 'emerald' },
                { id: 'crop', label: 'Crop', color: 'emerald' },
                { id: 'fix', label: 'Fix', color: 'purple' },
                { id: 'magic', label: 'Magic', color: 'blue' }
            ].map((tab) => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
                    disabled={!!pendingPoint}
                    className={`
                        flex-1 min-w-[65px] py-3 text-[11px] font-bold uppercase tracking-wider transition-all relative
                        ${activeTab === tab.id 
                            ? `text-${tab.color}-400 bg-slate-800` 
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}
                        ${pendingPoint ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                >
                    {tab.label}
                    {activeTab === tab.id && (
                        <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-${tab.color}-500 shadow-[0_-2px_6px_rgba(0,0,0,0.3)]`} />
                    )}
                </button>
            ))}
       </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative z-10 bg-slate-800 min-h-0">
        
        {/* === TOOLS TAB (Reorganized) === */}
        {activeTab === 'tools' && !pendingPoint && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                
                {/* 1. File & Actions Card */}
                <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-700/50">
                     <div className="flex items-center gap-2 mb-3 text-slate-400 font-bold text-xs uppercase tracking-wide">
                        <FileCode size={14} />
                        File Actions
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                         <button 
                            onClick={handleUndo}
                            disabled={!hasHistory}
                            className={`p-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all border
                                ${hasHistory 
                                    ? 'bg-blue-900/20 hover:bg-blue-800/40 text-blue-200 border-blue-500/30' 
                                    : 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                                }`}
                        >
                            <Undo2 size={16} />
                            Undo
                        </button>
                        <button 
                            onClick={() => exportToGPX(track)}
                            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg border border-emerald-500/20 shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 text-xs font-bold transition-all"
                        >
                            <Download size={16} />
                            Save GPX
                        </button>
                     </div>
                </div>

                {/* 2. Global Geometry Card */}
                <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-700/50">
                     <div className="flex items-center gap-2 mb-3 text-slate-400 font-bold text-xs uppercase tracking-wide">
                        <Wand2 size={14} />
                        Geometry
                     </div>
                     <div className="space-y-2">
                        <button 
                            onClick={() => onUpdateTrack(smoothTrackGeometry(track))}
                            className="w-full p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600/50 hover:border-emerald-500/50 rounded-lg transition-all flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-2 text-slate-300 group-hover:text-white">
                                <Activity size={16} className="text-emerald-500" />
                                <span className="text-xs font-bold">Smooth Trace</span>
                            </div>
                            <span className="text-[10px] text-slate-500">Fix jitter</span>
                        </button>

                        <button 
                            onClick={() => onUpdateTrack(simplifyTrack(track, 2))}
                            className="w-full p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600/50 hover:border-purple-500/50 rounded-lg transition-all flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-2 text-slate-300 group-hover:text-white">
                                <Scissors size={16} className="text-purple-500" />
                                <span className="text-xs font-bold">Simplify</span>
                            </div>
                             <span className="text-[10px] text-slate-500">Reduce 50%</span>
                        </button>
                        
                         <button 
                            onClick={() => onUpdateTrack(reverseTrack(track))}
                            className="w-full p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600/50 hover:border-orange-500/50 rounded-lg transition-all flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-2 text-slate-300 group-hover:text-white">
                                <RefreshCcw size={16} className="text-orange-500" />
                                <span className="text-xs font-bold">Reverse</span>
                            </div>
                             <span className="text-[10px] text-slate-500">Swap ends</span>
                        </button>
                     </div>
                </div>

                 {/* 3. Elevation Card */}
                 <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-3 text-slate-400 font-bold text-xs uppercase tracking-wide">
                        <TrendingUp size={14} />
                        Elevation
                     </div>
                     <div className="space-y-2">
                        <button 
                            onClick={() => onUpdateTrack(smoothElevation(track))}
                            className="w-full p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600/50 hover:border-blue-500/50 rounded-lg transition-all flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-2 text-slate-300 group-hover:text-white">
                                <TrendingUp size={16} className="text-blue-500" />
                                <span className="text-xs font-bold">Smooth Altitudes</span>
                            </div>
                            <span className="text-[10px] text-slate-500">Remove spikes</span>
                        </button>

                         {/* Elevation Offset Tool */}
                         <div className="pt-2 mt-2 border-t border-slate-700/50">
                             <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Offset All Points</label>
                             <div className="flex gap-2">
                                 <input 
                                    type="number"
                                    placeholder="+/- meters"
                                    value={eleOffsetInput}
                                    onChange={(e) => setEleOffsetInput(e.target.value)}
                                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"
                                 />
                                 <button
                                    onClick={handleApplyEleOffset}
                                    className="px-3 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-xs shadow-sm"
                                    title="Apply Offset"
                                 >
                                    Apply
                                 </button>
                             </div>
                         </div>
                     </div>
                 </div>
            </div>
        )}

        {/* === POINT EDIT TAB === */}
        {activeTab === 'point' && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                
                {/* Global Toggle for Points Visibility - Moved Here */}
                <button 
                    onClick={onToggleShowPoints}
                    className={`w-full p-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all border mb-2
                        ${showPoints 
                            ? 'bg-white text-slate-900 border-white shadow-sm' 
                            : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'
                        }`}
                >
                    <Disc size={14} />
                    {showPoints ? 'Hide Raw Points' : 'Show Raw Points'}
                </button>

                {pendingPoint ? (
                     <div className="bg-emerald-950/30 p-4 rounded-xl border border-emerald-500/30 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-4 opacity-10">
                             <PlusCircle size={64} className="text-emerald-500" />
                         </div>
                         <div className="flex items-center gap-2 mb-4 text-emerald-400 relative z-10">
                             <PlusCircle size={20} />
                             <h4 className="font-bold text-sm">Create New Point</h4>
                        </div>
                        
                        <div className="p-3 bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-200 text-xs mb-4 leading-relaxed">
                            <strong>Interactive Mode:</strong> Click map to place point.
                        </div>

                        <div className="space-y-3 text-xs mb-6 relative z-10">
                             {/* Inputs for Pending Point */}
                             <div className="grid grid-cols-2 gap-2">
                                 <div className="space-y-1">
                                    <span className="text-slate-400 text-[10px] uppercase font-bold">Latitude</span>
                                    <input
                                        type="number"
                                        value={pendingLat}
                                        onChange={(e) => setPendingLat(e.target.value)}
                                        onBlur={handlePendingBlur}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 font-mono text-white focus:border-emerald-500 outline-none"
                                    />
                                 </div>
                                 <div className="space-y-1">
                                    <span className="text-slate-400 text-[10px] uppercase font-bold">Longitude</span>
                                    <input
                                        type="number"
                                        value={pendingLon}
                                        onChange={(e) => setPendingLon(e.target.value)}
                                        onBlur={handlePendingBlur}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 font-mono text-white focus:border-emerald-500 outline-none"
                                    />
                                 </div>
                                 <div className="col-span-2 space-y-1">
                                    <span className="text-slate-400 text-[10px] uppercase font-bold">Elevation (m)</span>
                                    <input
                                        type="number"
                                        value={pendingEle}
                                        onChange={(e) => setPendingEle(e.target.value)}
                                        onBlur={handlePendingBlur}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 font-mono text-white focus:border-emerald-500 outline-none"
                                    />
                                 </div>
                             </div>
                        </div>

                        <div className="flex gap-2 relative z-10">
                             <button 
                                onClick={onCancelInsert}
                                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs transition-colors border border-slate-600"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={onConfirmInsert}
                                className="flex-[2] py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
                            >
                                <Check size={14} />
                                Save Point
                            </button>
                        </div>
                     </div>
                ) : isMultiSelect ? (
                    // MULTI-SELECT MODE
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 shadow-inner">
                        <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-2 text-purple-400">
                                <Layers size={18} />
                                <h4 className="font-bold text-sm">Batch Selection</h4>
                             </div>
                             <div className="px-2 py-0.5 bg-purple-500/10 text-purple-300 rounded text-[10px] font-bold border border-purple-500/20">
                                 {selectedIndices.size} selected
                             </div>
                        </div>
                        
                        <div className="space-y-4">
                             {/* Batch Modifier Panel */}
                             <div className="grid grid-cols-2 gap-2">
                                <h5 className="col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 mb-1">Smoothing & Density</h5>
                                
                                <button 
                                    onClick={() => onBatchSmooth && onBatchSmooth('soft')}
                                    className="p-2 bg-slate-800 hover:bg-purple-900/20 text-slate-300 hover:text-purple-200 border border-slate-700 hover:border-purple-500/30 rounded-lg flex flex-col items-center justify-center gap-1 transition-all group"
                                >
                                    <Wand2 size={16} className="text-purple-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold">Soft</span>
                                </button>
                                <button 
                                    onClick={() => onBatchSmooth && onBatchSmooth('strong')}
                                    className="p-2 bg-slate-800 hover:bg-purple-900/20 text-slate-300 hover:text-purple-200 border border-slate-700 hover:border-purple-500/30 rounded-lg flex flex-col items-center justify-center gap-1 transition-all group"
                                >
                                    <Sparkles size={16} className="text-purple-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold">Strong</span>
                                </button>
                                
                                <button 
                                    onClick={onBatchDensify}
                                    className="p-2 bg-slate-800 hover:bg-indigo-900/20 text-slate-300 hover:text-indigo-200 border border-slate-700 hover:border-indigo-500/30 rounded-lg flex flex-col items-center justify-center gap-1 transition-all group"
                                >
                                    <GalleryHorizontalEnd size={16} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold">Fill Gaps</span>
                                </button>
                                <button 
                                    onClick={onBatchSimplify}
                                    className="p-2 bg-slate-800 hover:bg-indigo-900/20 text-slate-300 hover:text-indigo-200 border border-slate-700 hover:border-indigo-500/30 rounded-lg flex flex-col items-center justify-center gap-1 transition-all group"
                                >
                                    <Filter size={16} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold">Reduce</span>
                                </button>
                                
                                <button 
                                    onClick={() => onBatchSmooth && onBatchSmooth('ultra')}
                                    className="col-span-2 py-2 bg-gradient-to-r from-purple-900/50 to-fuchsia-900/50 hover:from-purple-900 hover:to-fuchsia-900 border border-purple-500/30 text-purple-100 font-bold rounded-lg flex items-center justify-center gap-2 text-xs transition-all shadow-lg"
                                >
                                    <Sparkles size={14} />
                                    Ultra Smooth (20x)
                                </button>
                             </div>

                            <div className="w-full h-px bg-slate-800"></div>

                            <button 
                                onClick={onBatchDelete}
                                className="w-full py-2 bg-red-950/50 hover:bg-red-900/50 text-red-200 border border-red-900/30 font-bold rounded-lg flex items-center justify-center gap-2 text-xs transition-colors"
                            >
                                <Trash2 size={14} />
                                Delete Selected Points
                            </button>
                        </div>
                    </div>
                ) : selectedPointIndex !== null ? (
                    // SINGLE POINT MODE
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 shadow-inner">
                        <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-2 text-emerald-400">
                                <MapPin size={18} />
                                <h4 className="font-bold text-sm">Point #{selectedPointIndex}</h4>
                             </div>
                        </div>
                        
                        {/* Data Display */}
                        <div className="grid grid-cols-2 gap-3 mb-6">
                             <div className="bg-slate-800 p-2 rounded-lg border border-slate-700">
                                <div className="text-[10px] text-slate-500 uppercase font-bold">Latitude</div>
                                <div className="font-mono text-white text-xs">{track.points[selectedPointIndex].lat.toFixed(6)}</div>
                             </div>
                             <div className="bg-slate-800 p-2 rounded-lg border border-slate-700">
                                <div className="text-[10px] text-slate-500 uppercase font-bold">Longitude</div>
                                <div className="font-mono text-white text-xs">{track.points[selectedPointIndex].lon.toFixed(6)}</div>
                             </div>
                             
                             {/* Editable Elevation */}
                             <div className="col-span-2 bg-slate-800 p-2 rounded-lg border border-slate-700 flex items-center justify-between">
                                <div className="text-[10px] text-slate-500 uppercase font-bold">Elevation (m)</div>
                                <input
                                    type="number"
                                    value={eleInput}
                                    onChange={(e) => setEleInput(e.target.value)}
                                    onBlur={handleEleBlur}
                                    onKeyDown={(e) => e.key === 'Enter' && handleEleBlur()}
                                    className="bg-transparent border-b border-slate-600 w-24 text-right font-mono text-white focus:outline-none focus:border-emerald-500 text-sm"
                                />
                             </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                             <button
                                onClick={() => onToggleAnchor && onToggleAnchor(selectedPointIndex)}
                                className={`w-full py-2 border font-bold rounded-lg flex items-center justify-center gap-2 text-xs transition-all ${track.points[selectedPointIndex].isAnchor 
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/50' 
                                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                            >
                                <Star size={14} fill={track.points[selectedPointIndex].isAnchor ? "currentColor" : "none"} />
                                {track.points[selectedPointIndex].isAnchor ? "Anchor Locked" : "Toggle Anchor"}
                            </button>

                             <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={() => onStartInsert(selectedPointIndex)}
                                    className="py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 text-xs transition-colors border border-slate-600"
                                >
                                    <PlusCircle size={14} />
                                    Insert
                                </button>

                                <button 
                                    onClick={() => onDeletePoint(selectedPointIndex)}
                                    disabled={track.points[selectedPointIndex].isAnchor}
                                    className={`py-2 font-bold rounded-lg flex items-center justify-center gap-2 text-xs transition-colors border ${track.points[selectedPointIndex].isAnchor ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed' : 'bg-red-950/30 text-red-300 border-red-900/30 hover:bg-red-900/50'}`}
                                >
                                    <Trash2 size={14} />
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 py-10 opacity-40">
                        <MousePointerClick size={64} strokeWidth={1} />
                        <p className="text-center text-xs px-6 font-medium">
                            Select a point on the map line.
                        </p>
                    </div>
                )}
             </div>
        )}

        {/* === CROP TAB === */}
        {activeTab === 'crop' && !pendingPoint && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-500/20">
                     <div className="flex items-center gap-2 mb-2 text-emerald-400 font-bold text-sm">
                        <Scissors size={18} />
                        Trimming Tool
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        Drag the sliders to remove unwanted start or end sections.
                    </p>
                </div>

                <div className="space-y-8 px-2">
                    <div className="relative">
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                            <span>Start Point</span>
                            <span className="text-emerald-400">{((cropStart / track.points.length) * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max={track.points.length - 1} 
                            value={cropStart}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if(val < cropEnd) setCropStart(val);
                            }}
                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                    </div>

                    <div className="relative">
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                            <span>End Point</span>
                            <span className="text-emerald-400">{((cropEnd / track.points.length) * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" 
                            max={track.points.length - 1} 
                            value={cropEnd}
                             onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if(val > cropStart) setCropEnd(val);
                            }}
                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                    </div>

                    <div className="flex gap-2 pt-4">
                        <button 
                            onClick={() => { setCropStart(0); setCropEnd(track.points.length - 1); }}
                            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-600 transition-colors"
                        >
                            Reset
                        </button>
                        <button 
                            onClick={handleApplyCrop}
                            className="flex-[2] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-900/20 transition-all"
                        >
                            Apply Crop
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* === FIX TAB === */}
        {activeTab === 'fix' && !pendingPoint && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col h-full">
                {!anomalyReport ? (
                    <div className="h-full flex flex-col items-center justify-center py-8">
                        <div className="w-16 h-16 bg-purple-900/20 rounded-full flex items-center justify-center mb-4">
                            <Activity size={32} className="text-purple-400" />
                        </div>
                        <h4 className="text-white font-bold mb-2">Health Scan</h4>
                        <p className="text-xs text-slate-400 mb-6 text-center px-4 leading-relaxed">
                            Detect errors like supersonic speed spikes, sudden elevation jumps, and GPS teleportation.
                        </p>
                        <button 
                            onClick={runAnalysis}
                            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-purple-900/30 transition-all"
                        >
                            Start Scan
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col h-full overflow-hidden">
                         <div className="flex items-center justify-between mb-4 flex-none">
                            <h4 className="font-bold text-white text-sm">
                                {anomalyReport.hasErrors ? "Issues Detected" : "Track Healthy"}
                            </h4>
                            {anomalyReport.hasErrors ? (
                                <AlertTriangle size={18} className="text-red-400" />
                            ) : (
                                <Check size={18} className="text-emerald-400" />
                            )}
                        </div>

                        {/* Interactive List of Errors */}
                        {anomalyReport.hasErrors && (
                             <div className="flex-1 overflow-y-auto custom-scrollbar mb-4 space-y-2 pr-1">
                                 {/* Speed Errors */}
                                 {anomalyReport.speedIndices.map(idx => (
                                     <div key={`s-${idx}`} className="flex items-center justify-between p-2.5 bg-slate-900/50 rounded-lg border border-red-500/20 group hover:border-red-500/50 transition-colors">
                                         <div className="flex items-center gap-2">
                                             <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                             <div>
                                                 <div className="text-[10px] font-bold text-red-200 uppercase">Speed Spike</div>
                                                 <div className="text-[10px] text-slate-500">{track.points[idx].dist.toFixed(1)} km</div>
                                             </div>
                                         </div>
                                         <div className="flex gap-1">
                                             <button onClick={() => onSelectPoint && onSelectPoint(idx)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white" title="Jump to Point">
                                                <LocateFixed size={12} />
                                             </button>
                                             <button onClick={() => onDeletePoint(idx)} className="p-1.5 hover:bg-red-900/50 rounded text-slate-400 hover:text-red-400" title="Delete Point">
                                                <Trash2 size={12} />
                                             </button>
                                         </div>
                                     </div>
                                 ))}
                                 
                                 {/* Gap Errors */}
                                 {anomalyReport.gapIndices.map(idx => (
                                     <div key={`g-${idx}`} className="flex items-center justify-between p-2.5 bg-slate-900/50 rounded-lg border border-orange-500/20 group hover:border-orange-500/50 transition-colors">
                                         <div className="flex items-center gap-2">
                                             <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                                             <div>
                                                 <div className="text-[10px] font-bold text-orange-200 uppercase">Gap / Jump</div>
                                                 <div className="text-[10px] text-slate-500">{track.points[idx].dist.toFixed(1)} km</div>
                                             </div>
                                         </div>
                                         <div className="flex gap-1">
                                             <button onClick={() => onSelectPoint && onSelectPoint(idx)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white" title="Jump to Point">
                                                <LocateFixed size={12} />
                                             </button>
                                             <button onClick={() => onDeletePoint(idx)} className="p-1.5 hover:bg-red-900/50 rounded text-slate-400 hover:text-red-400" title="Delete Point">
                                                <Trash2 size={12} />
                                             </button>
                                         </div>
                                     </div>
                                 ))}

                                 {/* Elevation Errors */}
                                 {anomalyReport.elevationIndices.map(idx => (
                                     <div key={`e-${idx}`} className="flex items-center justify-between p-2.5 bg-slate-900/50 rounded-lg border border-red-500/20 group hover:border-red-500/50 transition-colors">
                                         <div className="flex items-center gap-2">
                                             <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                             <div>
                                                 <div className="text-[10px] font-bold text-red-200 uppercase">Elev Jump</div>
                                                 <div className="text-[10px] text-slate-500">{track.points[idx].dist.toFixed(1)} km</div>
                                             </div>
                                         </div>
                                         <div className="flex gap-1">
                                             <button onClick={() => onSelectPoint && onSelectPoint(idx)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white" title="Jump to Point">
                                                <LocateFixed size={12} />
                                             </button>
                                             <button onClick={() => onDeletePoint(idx)} className="p-1.5 hover:bg-red-900/50 rounded text-slate-400 hover:text-red-400" title="Delete Point">
                                                <Trash2 size={12} />
                                             </button>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                        )}
                        
                        {fixFeedback && (
                            <div className="p-3 mb-4 bg-emerald-900/20 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 flex items-center gap-2 flex-none">
                                <Check size={14} className="shrink-0" />
                                {fixFeedback}
                            </div>
                        )}

                        <div className="space-y-3 flex-none">
                            {anomalyReport.hasErrors && (
                                <button onClick={applyFix} className="w-full py-3 bg-slate-700 hover:bg-slate-600 transition-colors text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg">
                                    <Trash2 size={14} />
                                    Delete ALL Errors
                                </button>
                            )}
                            
                            {!anomalyReport.hasErrors && !fixFeedback && (
                                <button onClick={() => setAnomalyReport(null)} className="w-full py-3 bg-slate-800 text-slate-400 hover:text-white font-bold rounded-xl text-xs transition-colors border border-slate-700">
                                    Reset Scan
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* === MAGIC TAB === */}
        {activeTab === 'magic' && !pendingPoint && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                 <div className="p-5 bg-gradient-to-b from-blue-900/20 to-slate-900 rounded-2xl border border-blue-500/20 shadow-inner">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Bot size={20} className="text-blue-400" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white">Smart Restoration</h4>
                            <p className="text-[10px] text-blue-300/70">Context-Aware Reconstruction</p>
                        </div>
                    </div>

                    <div className="space-y-2 mb-6 text-xs text-slate-400 leading-relaxed">
                        <p>Heuristic engine that adapts to context:</p>
                        <ul className="list-disc pl-4 space-y-1 text-slate-500">
                            <li><strong>Spikes:</strong> Repositions (projects) geometry errors.</li>
                            <li><strong>Gaps:</strong> Fills missing data with interpolated points.</li>
                            <li><strong>Jitter:</strong> Smooths noisy sections.</li>
                        </ul>
                    </div>

                    <button 
                        onClick={applySmartRestoration} 
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 transition-all text-white font-bold rounded-xl text-xs shadow-xl shadow-blue-900/20 flex items-center justify-center gap-2 group"
                    >
                        <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
                        Run Restoration
                    </button>
                    
                    {fixFeedback && (
                         <div className="mt-4 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-[10px] text-blue-200 leading-normal">
                             {fixFeedback}
                         </div>
                    )}
                 </div>

                 <div className="px-4 py-3 bg-amber-900/10 border border-amber-500/10 rounded-xl flex items-start gap-3">
                    <Star size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-amber-500/80 leading-relaxed">
                        <strong>Tip:</strong> Mark important locations as <strong>Anchors</strong> in the Point Tab to protect them from being deleted by the AI engine.
                    </p>
                </div>
             </div>
        )}

      </div>
      
      {/* Contextual Pro Tip Bar */}
      <div className="p-3 bg-slate-900/80 border-t border-slate-700 text-[10px] text-slate-400 flex items-center gap-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse"></div>
          <p className="truncate">{getContextTip()}</p>
      </div>
    </div>
  );
};