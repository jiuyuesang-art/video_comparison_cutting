import React, { useState, useEffect } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { useVideoStore } from '../store/videoStore';
import { Edit2, Check, X } from 'lucide-react';

export const CompareView: React.FC = () => {
  const {
    videos,
    analysis,
    selectedOriginalVideoId,
    setSelectedOriginalVideo,
    updateVideoInfo,
  } = useVideoStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [editingInfo, setEditingInfo] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const clippedVideo = videos.find((v) => v.type === 'clipped');
  const originalVideos = videos.filter((v) => v.type === 'original');
  const selectedOriginal = selectedOriginalVideoId
    ? originalVideos.find((v) => v.id === selectedOriginalVideoId)
    : originalVideos[0];

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
  };

  const handleOriginalSelect = (id: string) => {
    setSelectedOriginalVideo(id);
  };

  const handleEditStart = (videoId: string, currentInfo: string) => {
    setEditingInfo(videoId);
    setEditValue(currentInfo);
  };

  const handleEditSave = () => {
    if (editingInfo) {
      updateVideoInfo(editingInfo, editValue);
      setEditingInfo(null);
      setEditValue('');
    }
  };

  const handleEditCancel = () => {
    setEditingInfo(null);
    setEditValue('');
  };

  useEffect(() => {
    if (!selectedOriginal && originalVideos.length > 0) {
      setSelectedOriginalVideo(originalVideos[0].id);
    }
  }, [originalVideos, selectedOriginal, setSelectedOriginalVideo]);

  if (!clippedVideo) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-12 border border-gray-800 text-center">
        <p className="text-gray-500 text-lg">
          请先上传被剪辑视频（视频1）以开始对比
        </p>
      </div>
    );
  }

  if (originalVideos.length === 0) {
    return (
      <div className="bg-gray-900/50 rounded-xl p-12 border border-gray-800 text-center">
        <p className="text-gray-500 text-lg">
          请上传至少一个原创视频（视频2-{4}）以进行对比
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
      <h2 className="text-xl font-bold text-white mb-6">视频对比</h2>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-red-400 font-medium flex items-center gap-2">
              <span className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center text-sm">
                1
              </span>
              被剪辑视频
            </h3>
            {clippedVideo && (
              <div className="flex items-center gap-2">
                {editingInfo === clippedVideo.id ? (
                  <>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600"
                      placeholder="添加备注..."
                    />
                    <button
                      onClick={handleEditSave}
                      className="p-1 hover:bg-green-500/20 rounded transition-colors"
                    >
                      <Check className="w-4 h-4 text-green-400" />
                    </button>
                    <button
                      onClick={handleEditCancel}
                      className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-red-400" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() =>
                      handleEditStart(clippedVideo.id, clippedVideo.customInfo || '')
                    }
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
            )}
          </div>
          {clippedVideo.id ? (
            <VideoPlayer
              src={`/api/files/${clippedVideo.id}`}
              title={clippedVideo.fileName}
              customInfo={clippedVideo.customInfo}
              currentTime={currentTime}
              isPlaying={isPlaying}
              muted={false}
              onPlayPause={handlePlayPause}
              onTimeUpdate={handleTimeUpdate}
              onSeek={handleSeek}
            />
          ) : (
            <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
              <p className="text-gray-500">视频加载中...</p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-green-400 font-medium flex items-center gap-2">
              <span className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center text-sm">
                2
              </span>
              原创视频
            </h3>
            {selectedOriginal && (
              <div className="flex items-center gap-2">
                {editingInfo === selectedOriginal.id ? (
                  <>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600"
                      placeholder="添加备注..."
                    />
                    <button
                      onClick={handleEditSave}
                      className="p-1 hover:bg-green-500/20 rounded transition-colors"
                    >
                      <Check className="w-4 h-4 text-green-400" />
                    </button>
                    <button
                      onClick={handleEditCancel}
                      className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-red-400" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() =>
                      handleEditStart(
                        selectedOriginal.id,
                        selectedOriginal.customInfo || ''
                      )
                    }
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
            )}
          </div>

          {selectedOriginal && selectedOriginal.id ? (
            <VideoPlayer
              src={`/api/files/${selectedOriginal.id}`}
              title={selectedOriginal.fileName}
              customInfo={selectedOriginal.customInfo}
              currentTime={currentTime}
              isPlaying={isPlaying}
              muted={true}
              onPlayPause={handlePlayPause}
              onTimeUpdate={handleTimeUpdate}
              onSeek={handleSeek}
              isActive
            />
          ) : (
            <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
              <p className="text-gray-500">选择或上传原创视频</p>
            </div>
          )}
        </div>
      </div>

      {originalVideos.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {originalVideos.map((video, index) => (
            <button
              key={video.id}
              onClick={() => handleOriginalSelect(video.id)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedOriginalVideoId === video.id || (!selectedOriginalVideoId && index === 0)
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              视频{index + 2}: {video.fileName}
            </button>
          ))}
        </div>
      )}

      {analysis && (
        <div className="mt-6 p-4 bg-gray-800/50 rounded-lg">
          <h4 className="text-white font-medium mb-2">检测结果</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">检测到的相似片段:</span>
              <span className="text-cyan-400 ml-2">{analysis.segments.length} 个</span>
            </div>
            <div>
              <span className="text-gray-400">总匹配时长:</span>
              <span className="text-cyan-400 ml-2">
                {analysis.totalMatchDuration.toFixed(1)} 秒
              </span>
            </div>
            <div>
              <span className="text-gray-400">AI模式:</span>
              <span className="text-cyan-400 ml-2">
                {analysis.aiMode === 'local' ? '本地AI' : analysis.aiMode === 'clip' ? 'CLIP' : '云端AI'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">处理耗时:</span>
              <span className="text-cyan-400 ml-2">
                {(analysis.processingTime / 1000).toFixed(1)} 秒
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
