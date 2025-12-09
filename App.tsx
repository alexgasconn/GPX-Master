import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { StatsPanel } from './components/StatsPanel';
import { AnalysisCharts } from './components/AnalysisCharts';
import { MapViewer } from './components/MapViewer';
import { TrackManager } from './components/TrackManager';
import { TrackEditor } from './components/TrackEditor';
import { parseGPXFile, updateTrackPoint, deleteTrackPoint, insertTrackPoint, calculateInterpolatedPoint, deleteMultipleTrackPoints, smoothSelectedPoints, densifyTrackSegment, simplifySelectedPoints, toggleTrackAnchor, offsetTrackElevation } from './services/gpxUtils';
import { GPXData, AnomalyReport, PendingPoint } from './types';
import { Activity, Plus, PanelLeftOpen, LineChart, Wrench } from 'lucide-react';

const App: React.FC = () => {
  const [tracks, setTracks] = useState<GPXData[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  
  // Layout State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [rightPanelMode, setRightPanelMode] = useState<'editor' | 'profile'>('editor');

  // State for interactive cropping visualization
  const [cropRange, setCropRange] = useState<[number, number] | null>(null);
  
  // State for Point Editing
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  // State for creating a NEW point
  const [pendingPoint, setPendingPoint] = useState<PendingPoint | null>(null);

  // State for Map Visualization Features
  const [showPoints, setShowPoints] = useState(false);
  const [anomalyReport, setAnomalyReport] = useState<AnomalyReport | null>(null);


  const handleFileLoad = async (file: File) => {
    setLoading(true);
    try {
      const parsedData = await parseGPXFile(file);
      setTracks(prev => [...prev, parsedData]);
      setActiveTrackId(parsedData.id);
      setSelectedPointIndex(null);
      setSelectedIndices(new Set());
      setAnomalyReport(null);
      setPendingPoint(null);
    } catch (error) {
      console.error(error);
      alert('Error reading file. Please ensure it is a valid GPX.');
    } finally {
      setLoading(false);
    }
  };

  const activeTrack = tracks.find(t => t.id === activeTrackId);

  const updateTrack = (updatedTrack: GPXData) => {
      setTracks(prev => prev.map(t => t.id === updatedTrack.id ? updatedTrack : t));
  };

  // Editing Handlers
  const handlePointMove = (index: number, lat: number, lon: number) => {
      if (!activeTrack) return;
      // When dragging map, preserve current elevation
      const currentEle = activeTrack.points[index].ele;
      const updated = updateTrackPoint(activeTrack, index, lat, lon, currentEle);
      updateTrack(updated);
  };

  const handlePointEdit = (index: number, lat: number, lon: number, ele: number) => {
      if (!activeTrack) return;
      const updated = updateTrackPoint(activeTrack, index, lat, lon, ele);
      updateTrack(updated);
  };
  
  const handleToggleAnchor = (index: number) => {
      if (!activeTrack) return;
      const updated = toggleTrackAnchor(activeTrack, index);
      updateTrack(updated);
  }

  const handlePointSelect = (index: number | null, isMultiSelect: boolean = false, isRangeSelect: boolean = false) => {
    // If index is null, clear everything
    if (index === null) {
      setSelectedPointIndex(null);
      setSelectedIndices(new Set());
      setPendingPoint(null); // Cancel insert if deselecting
      return;
    }

    // Cancel insert mode if selecting a point
    setPendingPoint(null);
    
    // Auto switch to editor to show point details
    setRightPanelMode('editor');

    let newSet: Set<number>;

    // RANGE SELECTION (Shift + Click)
    if (isRangeSelect && selectedPointIndex !== null) {
        // Keep existing selection
        newSet = new Set(selectedIndices);
        
        const start = Math.min(selectedPointIndex, index);
        const end = Math.max(selectedPointIndex, index);

        // Add all points in range
        for (let i = start; i <= end; i++) {
            newSet.add(i);
        }
    } 
    // MULTI SELECTION (Ctrl + Click)
    else if (isMultiSelect) {
        newSet = new Set(selectedIndices);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
    } 
    // SINGLE SELECTION
    else {
        newSet = new Set([index]);
    }

    setSelectedIndices(newSet);

    // Update Primary Selection (Last clicked is always primary for dragging/focus)
    setSelectedPointIndex(index);
  };


  // --- Insert Point Workflow ---

  const handleStartInsert = (index: number) => {
      if (!activeTrack) return;
      const defaults = calculateInterpolatedPoint(activeTrack, index);
      setPendingPoint({
          lat: defaults.lat,
          lon: defaults.lon,
          ele: defaults.ele,
          index: index
      });
      setRightPanelMode('editor');
  };

  const handleUpdatePendingPoint = (lat: number, lon: number, ele: number) => {
      setPendingPoint(prev => prev ? { ...prev, lat, lon, ele } : null);
  };

  const handleConfirmInsert = () => {
      if (!activeTrack || !pendingPoint) return;
      
      const defaults = calculateInterpolatedPoint(activeTrack, pendingPoint.index);
      
      const updated = insertTrackPoint(
          activeTrack, 
          pendingPoint.index, 
          pendingPoint.lat, 
          pendingPoint.lon, 
          pendingPoint.ele,
          defaults.time // use interpolated time
      );
      
      updateTrack(updated);
      setPendingPoint(null);
      
      // Select the new point
      const newIndex = pendingPoint.index + 1;
      setSelectedPointIndex(newIndex);
      setSelectedIndices(new Set([newIndex]));
  };

  const handleCancelInsert = () => {
      setPendingPoint(null);
  };

  // Map Click handler for "Add Mode"
  const handleMapClickForInsert = (lat: number, lon: number) => {
      if(pendingPoint) {
          handleUpdatePendingPoint(lat, lon, pendingPoint.ele);
      }
  };


  const handleDeletePoint = (index: number) => {
      if (!activeTrack) return;
      const updated = deleteTrackPoint(activeTrack, index);
      updateTrack(updated);
      setSelectedPointIndex(null); // Deselect after delete
      setSelectedIndices(new Set());
      
      // If we deleted a point while anomalies were shown, re-run analysis to keep indices valid
      if (anomalyReport) {
          // Ideally we re-run analysis here, but for simplicity we clear it to avoid stale indices
          setAnomalyReport(null);
      }
  };

  const handleBatchDelete = () => {
      if (!activeTrack || selectedIndices.size === 0) return;
      const updated = deleteMultipleTrackPoints(activeTrack, selectedIndices);
      updateTrack(updated);
      setSelectedPointIndex(null);
      setSelectedIndices(new Set());
      setAnomalyReport(null);
  };

  const handleBatchSmooth = (strength: 'soft' | 'strong' | 'ultra') => {
      if (!activeTrack || selectedIndices.size === 0) return;
      // Soft = 1 pass, Strong = 5 passes, Ultra = 20 passes
      let iterations = 1;
      if (strength === 'strong') iterations = 5;
      if (strength === 'ultra') iterations = 20;

      const updated = smoothSelectedPoints(activeTrack, selectedIndices, iterations);
      updateTrack(updated);
  };

  const handleBatchDensify = () => {
      if (!activeTrack || selectedIndices.size < 2) return;
      const updated = densifyTrackSegment(activeTrack, selectedIndices);
      updateTrack(updated);
      // Selection invalid after adding points
      setSelectedIndices(new Set());
      setSelectedPointIndex(null);
  };

  const handleBatchSimplify = () => {
      if (!activeTrack || selectedIndices.size === 0) return;
      // Simplify by removing 50% of points (keeping every 2nd point) within selection
      const updated = simplifySelectedPoints(activeTrack, selectedIndices, 2);
      updateTrack(updated);
      // Selection invalid after removing points
      setSelectedIndices(new Set());
      setSelectedPointIndex(null);
  };

  const handleElevationOffset = (offset: number) => {
    if (!activeTrack) return;
    const updated = offsetTrackElevation(activeTrack, offset);
    updateTrack(updated);
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden flex flex-col">
      {/* Header Compacto */}
      <header className="bg-slate-900 border-b border-slate-800 h-14 flex-none z-50 shadow-md">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-1.5 rounded-lg shadow-lg shadow-emerald-900/20">
              <Activity className="text-white" size={20} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block tracking-tight">
              GPX Studio
            </h1>
          </div>
          
           {tracks.length > 0 && (
               <div className="flex items-center gap-4">
                  <div className="text-xs text-slate-500 font-mono hidden md:block">
                      {tracks.length} track(s) loaded
                  </div>
                  <label 
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold cursor-pointer transition-colors shadow-lg shadow-emerald-900/20 active:scale-95"
                    title="Upload .gpx file"
                  >
                    <Plus size={16} />
                    <span>Add Track</span>
                    <input 
                        type="file" 
                        accept=".gpx" 
                        onChange={(e) => {
                            if(e.target.files?.[0]) handleFileLoad(e.target.files[0]);
                        }} 
                        className="hidden" 
                    />
                  </label>
               </div>
           )}
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
        
        {tracks.length === 0 ? (
          // Empty State
          <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950">
            <div className="max-w-xl w-full">
                <div className="text-center mb-10">
                    <h2 className="text-5xl font-extrabold text-white mb-6 tracking-tight">Your Route Lab</h2>
                    <p className="text-lg text-slate-400 leading-relaxed">
                        Edit, combine, analyze, and visualize multiple GPX files. 
                        Professional topography tools right in your browser.
                    </p>
                </div>
                {loading ? (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-emerald-400 font-medium animate-pulse">Analyzing geometry...</p>
                    </div>
                ) : (
                    <FileUpload onFileLoaded={handleFileLoad} />
                )}
            </div>
          </div>
        ) : (
          // Dashboard Grid
          <div className="w-full h-full grid grid-cols-12 grid-rows-[auto_1fr] p-2 gap-2 lg:gap-3">
            
            {/* Top Stats Bar - Full Width */}
            <div className="col-span-12 h-auto flex-none">
                {activeTrack ? (
                     <StatsPanel stats={{...activeTrack.stats, pointCount: activeTrack.points.length} as any} />
                ) : (
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 text-center text-slate-500 text-sm">
                        Select a track to view statistics
                    </div>
                )}
            </div>

            {/* Left Sidebar: Track List (Collapsible) */}
            {isSidebarOpen && (
              <div className="col-span-12 lg:col-span-2 xl:col-span-2 flex flex-col gap-3 min-h-0 min-w-0">
                  <div className="flex-1 min-h-0 overflow-hidden shadow-xl rounded-2xl h-full">
                      <TrackManager 
                          tracks={tracks} 
                          activeTrackId={activeTrackId}
                          onSelectTrack={(id) => {
                              setActiveTrackId(id);
                              setCropRange(null); 
                              setSelectedPointIndex(null);
                              setSelectedIndices(new Set());
                              setAnomalyReport(null);
                              setPendingPoint(null);
                          }}
                          onToggleVisibility={(id) => {
                              setTracks(tracks.map(t => t.id === id ? {...t, visible: !t.visible} : t));
                          }}
                          onDeleteTrack={(id) => {
                               const newTracks = tracks.filter(t => t.id !== id);
                               setTracks(newTracks);
                               if (activeTrackId === id) setActiveTrackId(newTracks[0]?.id || null);
                          }}
                          onColorChange={(id, color) => {
                              setTracks(tracks.map(t => t.id === id ? {...t, color} : t));
                          }}
                          onClose={() => setIsSidebarOpen(false)}
                      />
                  </div>
              </div>
            )}

            {/* Center: Map (Dynamic Width) */}
            <div className={`col-span-12 ${isSidebarOpen ? 'lg:col-span-7 xl:col-span-7' : 'lg:col-span-9 xl:col-span-9'} min-h-0 min-w-0 relative group h-full`}>
                <MapViewer 
                    tracks={tracks} 
                    activeTrackId={activeTrackId}
                    hoverIndex={hoverIndex}
                    onTrackClick={(id) => {
                        setActiveTrackId(id);
                        setSelectedPointIndex(null);
                        setSelectedIndices(new Set());
                        setPendingPoint(null);
                    }}
                    cropRange={cropRange}
                    selectedPointIndex={selectedPointIndex}
                    selectedIndices={selectedIndices}
                    onPointSelect={handlePointSelect}
                    onPointMove={handlePointMove}
                    showPoints={showPoints}
                    onToggleShowPoints={() => setShowPoints(!showPoints)}
                    anomalies={anomalyReport}
                    
                    // New Insert Mode Props
                    pendingPoint={pendingPoint}
                    onMapClickForInsert={handleMapClickForInsert}
                />
                
                {/* Expand Sidebar Button (Floating) */}
                {!isSidebarOpen && (
                    <button 
                        onClick={() => setIsSidebarOpen(true)}
                        className="absolute top-4 left-4 z-[400] bg-slate-800 text-white p-2.5 rounded-lg border border-slate-600 shadow-xl hover:bg-slate-700 transition-colors"
                        title="Show Routes"
                    >
                        <PanelLeftOpen size={20} />
                    </button>
                )}
            </div>

            {/* Right Sidebar: Analysis & Editor (Fixed) */}
            <div className="col-span-12 lg:col-span-3 xl:col-span-3 flex flex-col gap-3 min-h-0 min-w-0 overflow-hidden shadow-xl rounded-2xl h-full">
                 {activeTrack ? (
                     <>
                        {/* Toggle Header */}
                        <div className="bg-slate-800 p-1 rounded-xl border border-slate-700 flex flex-none gap-1 shrink-0 shadow-sm">
                             <button
                                onClick={() => setRightPanelMode('editor')}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${rightPanelMode === 'editor' ? 'bg-slate-700 text-white shadow-md ring-1 ring-slate-600' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                             >
                                 <Wrench size={14} className={rightPanelMode === 'editor' ? 'text-emerald-400' : ''} />
                                 EDITOR
                             </button>
                             <button
                                onClick={() => setRightPanelMode('profile')}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${rightPanelMode === 'profile' ? 'bg-slate-700 text-white shadow-md ring-1 ring-slate-600' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                             >
                                 <LineChart size={14} className={rightPanelMode === 'profile' ? 'text-blue-400' : ''} />
                                 PROFILE
                             </button>
                        </div>
                        
                        {/* Conditional Rendering for Full Height */}
                        {rightPanelMode === 'profile' && (
                             <div className="flex-1 min-h-0 overflow-hidden animate-in fade-in duration-300">
                                 <AnalysisCharts 
                                    data={activeTrack.points} 
                                    onHoverPoint={setHoverIndex} 
                                />
                            </div>
                        )}
                        
                        {rightPanelMode === 'editor' && (
                            <div className="flex-1 min-h-0 overflow-hidden relative">
                                <TrackEditor 
                                    track={activeTrack}
                                    onUpdateTrack={updateTrack}
                                    setCropRange={setCropRange}
                                    selectedPointIndex={selectedPointIndex}
                                    selectedIndices={selectedIndices}
                                    onDeletePoint={handleDeletePoint}
                                    onBatchDelete={handleBatchDelete}
                                    onBatchSmooth={handleBatchSmooth}
                                    onBatchDensify={handleBatchDensify}
                                    onBatchSimplify={handleBatchSimplify}
                                    onEditPoint={handlePointEdit}
                                    onToggleAnchor={handleToggleAnchor}
                                    onElevationOffset={handleElevationOffset}
                                    anomalyReport={anomalyReport}
                                    setAnomalyReport={setAnomalyReport}
                                    showPoints={showPoints}
                                    onToggleShowPoints={() => setShowPoints(!showPoints)}
                                    
                                    // Pass handlePointSelect to enable "Jump" feature
                                    onSelectPoint={(idx) => handlePointSelect(idx)}

                                    // New Insert Props
                                    pendingPoint={pendingPoint}
                                    onStartInsert={handleStartInsert}
                                    onUpdatePending={handleUpdatePendingPoint}
                                    onConfirmInsert={handleConfirmInsert}
                                    onCancelInsert={handleCancelInsert}
                                />
                            </div>
                        )}
                     </>
                 ) : (
                     <div className="h-full bg-slate-800 rounded-2xl border border-slate-700 flex items-center justify-center text-slate-500 text-center p-6">
                        <div className="space-y-4">
                            <Activity size={48} className="mx-auto opacity-20" />
                            <p>Select a route to activate analysis and editing tools.</p>
                        </div>
                     </div>
                 )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;