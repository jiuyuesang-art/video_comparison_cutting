import React, { useMemo, useState } from 'react';
import { useVideoStore } from '../store/videoStore';

interface TimelineProps {
  onSeek?: (time: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ onSeek }) => {
  const { videos, analysis, selectedOriginalVideoId, setSelectedOriginalVideo } = useVideoStore();

  const clippedVideo = videos.find((v) => v.type === 'clipped');
  const originalVideos = videos.filter((v) => v.type === 'original');

  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const segments = useMemo(() => {
    if (!analysis) return [];
    
    if (selectedOriginalVideoId) {
      return analysis.segments.filter(
        (segment) => segment.originalVideoId === selectedOriginalVideoId
      );
    }
    
    return analysis.segments;
  }, [analysis, selectedOriginalVideoId]);

  const duration = useMemo(() => {
    return clippedVideo?.duration || 60;
  }, [clippedVideo]);

  const timelineSegments = useMemo(() => {
    if (!analysis || segments.length === 0) return null;
    if (!clippedVideo) return null;

    const items: { type: 'gap' | 'segment'; width: number; segment?: typeof segments[0] }[] = [];
    
    segments.forEach((segment, index) => {
      const prevEnd = index === 0 ? 0 : segments[index - 1].clippedEnd;
      const gapDuration = Math.max(0, segment.clippedStart - prevEnd);
      
      if (gapDuration > 0.01) {
        const gapWidth = (gapDuration / duration) * 100;
        items.push({ type: 'gap', width: gapWidth });
      }
      
      const segmentDuration = segment.clippedEnd - segment.clippedStart;
      const segmentWidth = Math.max(0.5, (segmentDuration / duration) * 100);
      items.push({ type: 'segment', width: segmentWidth, segment });
    });

    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.clippedEnd < duration) {
      const remainingWidth = ((duration - lastSegment.clippedEnd) / duration) * 100;
      items.push({ type: 'gap', width: Math.max(0, remainingWidth) });
    }

    return items;
  }, [analysis, segments, duration, clippedVideo]);

  const formatTime = useMemo(() => {
    return (time: number) => {
      return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
    };
  }, []);

  const getSimilarityColor = useMemo(() => {
    return (similarity: number) => {
      if (similarity >= 0.9) return 'bg-green-500/20 text-green-400';
      if (similarity >= 0.7) return 'bg-yellow-500/20 text-yellow-400';
      return 'bg-red-500/20 text-red-400';
    };
  }, []);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clippedVideo || clippedVideo.duration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const time = pos * clippedVideo.duration;
    onSeek?.(time);
  };

  if (!clippedVideo) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-gray-300 text-sm font-medium">时间轴</h3>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded" />
              <span className="text-gray-400">视频1</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-cyan-500 rounded" />
              <span className="text-gray-400">相似片段</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-black border border-gray-600 rounded" />
              <span className="text-gray-400">无匹配</span>
            </div>
          </div>
        </div>
        <div className="h-12 bg-gray-800 rounded-lg flex items-center justify-center">
          <span className="text-gray-500 text-sm">请先上传被剪辑视频</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-gray-300 text-sm font-medium">时间轴</h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded" />
            <span className="text-gray-400">视频1</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-cyan-500 rounded" />
            <span className="text-gray-400">相似片段</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-black border border-gray-600 rounded" />
            <span className="text-gray-400">无匹配</span>
          </div>
        </div>
      </div>

      <div
        className="relative h-12 bg-gray-800 rounded-lg cursor-pointer overflow-hidden"
        onClick={handleTimelineClick}
      >
        <div className="absolute inset-0 flex">
          {timelineSegments ? (
            timelineSegments.map((item, index) => {
              if (item.type === 'gap') {
                return (
                  <div
                    key={`gap-${index}`}
                    className="h-full bg-black border-r border-gray-700"
                    style={{ width: `${item.width}%` }}
                  />
                );
              }
              
              const seg = item.segment!;
              const simPercent = Math.round(seg.similarity * 100);
              const isHovered = hoveredSegment === seg.id;
              
              return (
                <div
                  key={`seg-${index}`}
                  className="h-full bg-cyan-500/70 border-r border-cyan-400 relative transition-all hover:bg-cyan-500/90"
                  style={{ width: `${item.width}%` }}
                  title={`相似片段: ${seg.clippedStart.toFixed(1)}s - ${seg.clippedEnd.toFixed(1)}s (相似度: ${simPercent}%)`}
                  onMouseEnter={() => setHoveredSegment(seg.id)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-xs font-medium transition-opacity ${isHovered ? 'text-white' : 'text-white/70'}`}>
                      {simPercent}%
                    </span>
                  </div>
                  {isHovered && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 px-2 py-1 rounded text-xs text-white whitespace-nowrap z-10">
                      {seg.clippedStart.toFixed(1)}s - {seg.clippedEnd.toFixed(1)}s
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="w-full h-full bg-black border-r border-gray-700 flex items-center justify-center">
              <span className="text-gray-500 text-sm">
                {analysis ? '未检测到相似片段' : '点击开始分析以检测相似片段'}
              </span>
            </div>
          )}
        </div>

        <div className="absolute top-0 left-0 w-px h-full bg-gray-600 pointer-events-none" />
        <div className="absolute top-0 right-0 w-px h-full bg-gray-600 pointer-events-none" />
      </div>

      <div className="flex justify-between text-xs text-gray-500 mt-1 font-mono">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>

      {originalVideos.length > 1 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {originalVideos.map((video) => (
            <button
              key={video.id}
              onClick={() => setSelectedOriginalVideo(video.id)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                selectedOriginalVideoId === video.id
                  ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {video.fileName}
            </button>
          ))}
        </div>
      )}

      {analysis && segments.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-gray-400 text-xs font-medium">检测到的片段</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {segments.map((segment, index) => {
              const originalVideo = originalVideos.find(
                (v) => v.id === segment.originalVideoId
              );
              const simPercent = Math.round(segment.similarity * 100);
              
              return (
                <div
                  key={segment.id}
                  className="bg-gray-800/50 rounded p-2 flex items-center justify-between cursor-pointer hover:bg-gray-800 transition-colors"
                  onClick={() => {
                    onSeek?.(segment.clippedStart);
                  }}
                  onMouseEnter={() => setHoveredSegment(segment.id)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-mono text-sm">
                      #{index + 1}
                    </span>
                    <span className="text-gray-300 text-sm">
                      {segment.clippedStart.toFixed(1)}s - {segment.clippedEnd.toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400">
                      原视频: {originalVideo?.fileName || '未知'}
                    </span>
                    <span className={`px-2 py-0.5 rounded ${getSimilarityColor(segment.similarity)}`}>
                      {simPercent}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
