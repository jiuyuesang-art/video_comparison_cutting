import React from 'react';
import { Loader2 } from 'lucide-react';

interface ProgressBarProps {
  progress: number;
  message?: string;
  isLoading?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  message,
  isLoading = false,
}) => {
  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-6 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
      <div className="flex items-center gap-4 mb-4">
        {isLoading && (
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        )}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-2">
            <span className="text-cyan-400 font-medium">处理进度</span>
            <span className="text-cyan-400 font-mono text-sm">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>
      </div>
      {message && (
        <p className="text-gray-400 text-sm text-center">{message}</p>
      )}
    </div>
  );
};
