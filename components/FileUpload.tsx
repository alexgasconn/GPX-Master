import React, { useCallback, useState } from 'react';
import { Upload, FileCode, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onFileLoaded: (file: File) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      setError("Please upload a file with .gpx extension");
      return;
    }
    setError(null);
    onFileLoaded(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Support multiple files dropped
      Array.from(e.dataTransfer.files).forEach(processFile);
    }
  }, [onFileLoaded]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Support multiple file selection
      Array.from(e.target.files).forEach(processFile);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-20">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-4 border-dashed rounded-3xl p-12 text-center transition-all duration-300 ease-in-out cursor-pointer group
          ${isDragging
            ? 'border-emerald-500 bg-emerald-500/10 scale-102 shadow-2xl shadow-emerald-500/20'
            : 'border-slate-700 bg-slate-800/50 hover:border-emerald-400 hover:bg-slate-800'}
        `}
      >
        <input
          type="file"
          accept=".gpx"
          multiple
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="flex flex-col items-center justify-center space-y-6 pointer-events-none">
          <div className={`p-6 rounded-full ${isDragging ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-emerald-400 group-hover:scale-110 transition-transform'}`}>
            <Upload size={48} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-white">Drag your GPX file here</h3>
            <p className="text-slate-400">or click to browse your computer</p>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-500 uppercase tracking-widest font-semibold">
            <FileCode size={14} />
            <span>Supported Format: GPX 1.0 / 1.1</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center justify-center space-x-2 text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};