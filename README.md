# GPX Master Pro

**GPX Master Pro** is a high-performance, client-side web application designed for analyzing, editing, and repairing GPX (Global Positioning System) files. It combines professional topography algorithms with an intuitive "Photoshop-like" interface for GPS data.

> **Privacy Note:** This application operates **100% Client-Side**. Your GPS data is processed in your browser's memory and is **never** uploaded to any server.

---

## 🚀 Getting Started

1.  **Load Data**: Drag and drop a `.gpx` file into the main window, or use the "Add Track" button in the top right.
2.  **Multi-Track Support**: You can load unlimited files to compare routes. The "Active" track (clicked on map or list) is the one currently being edited.

---

## 🖥️ The Interface

The workspace is divided into four zones:

1.  **Top Stats Bar**: Global metrics (Distance, Elevation, Max/Min Altitude, Density).
2.  **Left Sidebar (Track Manager)**: Manage visibility, colors, and selection of loaded files.
3.  **Center Map**: The interactive canvas.
4.  **Right Sidebar (The Lab)**: This panel toggles between two modes:
    *   **Editor**: The command center for changing data.
    *   **Profile**: Large, detailed Elevation Charts.

---

## 🛠️ Editing Features

### 1. Global Tools (Tools Tab)
These actions affect the *entire* track at once.
*   **Download GPX**: Export your finished work.
*   **Undo**: Reverses the last action (History stack stores up to 20 states).
*   **Smooth Trace**: Fixes GPS "jitter" (shaky Lat/Lon lines) using a moving average.
*   **Smooth Elev**: Removes sudden altitude spikes.
*   **Offset Elevation**: Add or subtract a fixed altitude value (e.g., +30m) to the entire track.
*   **Simplify**: Reduces file size by removing redundant points.
*   **Reverse**: Swaps Start and End.

### 2. Surgical Point Editing (Point Tab)
Select points directly on the map to edit them.

*   **Show Raw Points**: Toggle the visibility of all individual GPS points on the map.
*   **Single Selection**: Click a point.
    *   **Move**: Drag the orange marker to a new location.
    *   **Edit Data**: Manually type Latitude, Longitude, or Elevation in the sidebar.
    *   **Toggle Anchor**: Lock a point (Gold Star) so it is never deleted or moved by auto-fix tools.
    *   **Delete**: Remove the specific point.
    *   **Insert After**: Enter "Insertion Mode" (see below).

*   **Range Selection (Shift + Click)**:
    1.  Click one point.
    2.  Hold **Shift** and click another point further down the track.
    3.  All points in between are selected.

*   **Multi Selection (Ctrl/Cmd + Click)**:
    *   Hold **Ctrl** (Windows) or **Cmd** (Mac) to pick multiple specific points.

### 3. Batch Operations (Multi-Select)
When multiple points are selected, the Editor offers powerful batch tools:
*   **Soft Smooth**: Gently blends selected points (1 pass).
*   **Strong Smooth**: Aggressively smoothes the selection (5 passes).
*   **Ultra Smooth**: Heavy blending (20 passes).
*   **Densify / Fill Gaps**: Analyzes your track's average density (e.g., 10m per point). If it finds gaps larger than this in your selection, it automatically calculates and inserts new interpolated points to fill the holes.
*   **Batch Delete**: Removes all selected points instantly.

### 4. Creating New Points (Insert Mode)
Add data where it's missing.
1.  Select a point.
2.  Click **"Insert Point After"**.
3.  A **Green Ghost Marker** appears. The app calculates the perfect mathematical midpoint.
4.  **Click anywhere on the map** to reposition this new point.
5.  Click **"Save Point"** to confirm.

### 5. Crop Track (Crop Tab)
Trim the start or end of your activity.
*   Use the sliders to define the active range.
*   **Visual Feedback**: The map shows the "Kept" section in Green/Color and the "Deleted" section in Grey.

### 6. Magic / Smart Lab (Magic Tab)
The advanced algorithmic engine for automatic repairs.

*   **Smart Restoration Engine**: An iterative pipeline that runs up to 50 passes to surgically repair your file.
    1.  **Surgical Extraction**: Identifies specific error points (speed spikes, elevation jumps) based on dynamic density thresholds and deletes them.
    2.  **Smart Fill**: Immediately detects the gap created by the deletion (or pre-existing gaps) and fills it with interpolated points to match the track's natural rhythm.
    3.  **Anchor Preservation**: Any point marked as an Anchor is strictly preserved.
    4.  **Result**: A clean, continuous track with no invalid data, without blurring the geometry of valid sections.

---

## 🗺️ Map Capabilities

*   **Over-Zoom**: The map supports zooming up to Level 22 (past standard map tiles) to allow editing individual meters.
*   **Layers**: Switch between Dark Mode, Light Mode, Satellite (Esri), and OpenStreetMap.
*   **Click Zones**: The track line has an invisible "thickened" click zone, making it easy to grab points even when zoomed out.
*   **Visual Indicators**:
    *   **Red Dots**: Speed/Elevation Errors.
    *   **Orange Dots**: Distance Gaps.
    *   **Gold Stars**: Anchored Points.

---

## 📊 Statistics & Analysis

*   **Density Metric**: Shows "Points per KM". A higher number means a smoother, higher-resolution file.
*   **Elevation Profile**: Switch the right panel to "Profile" to see a large interactive area chart. Hovering the chart highlights the location on the map.

---

## ⌨️ Shortcuts

| Key Combination | Action |
| :--- | :--- |
| **Click** | Select Point |
| **Shift + Click** | Select Range (A to B) |
| **Ctrl/Cmd + Click** | Toggle Selection |
| **Drag Marker** | Move Point |
| **Enter** (in inputs) | Confirm Value |

---
*Built with React, Leaflet, and Tailwind CSS.*