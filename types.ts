export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  time: Date | null;
  dist: number; // Cumulative distance in km
  speed: number; // Speed at this point in km/h
  gradient: number; // Slope percentage
  isAnchor?: boolean; // If true, this point should not be moved or deleted by algorithms
}

export interface GPXStatistics {
  totalDistance: number; // km
  totalElevationGain: number; // m
  totalElevationLoss: number; // m
  maxElevation: number; // m
  minElevation: number; // m
  averageSpeed: number; // km/h
  maxSpeed: number; // km/h
  averagePace: string; // min/km formatted
  movingTime: number; // seconds
  totalTime: number; // seconds
  startTime: Date | null;
  endTime: Date | null;
}

export interface GPXData {
  id: string;
  name: string;
  points: TrackPoint[];
  originalPoints: TrackPoint[]; // Legacy backup
  originalXML?: string; // Raw XML content for true "Reload"
  history: TrackPoint[][]; // For "Undo" functionality (Stack of point arrays)
  stats: GPXStatistics;
  color: string;
  visible: boolean;
}

export interface PendingPoint {
  lat: number;
  lon: number;
  ele: number;
  index: number; // Index to insert AFTER
}

export interface AnomalyReport {
  hasErrors: boolean;
  speedSpikes: number; // Points with unrealistic speed
  elevationSpikes: number; // Points with unrealistic elevation change
  distanceGaps: number; // Points with huge distance jumps (teleportation)
  stops: number; // Potential drift points while stopped
  totalPointsToRemove: number;
  // Arrays of indices for visualization
  speedIndices: number[];
  elevationIndices: number[];
  gapIndices: number[];
}