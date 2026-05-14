import React, { useCallback, useState } from 'react';
import { Upload, X, Film, FileVideo, AlertCircle } from 'lucide-react';
import { useVideoStore } from '../store/videoStore';
import { api } from '../utils/api';
import type { Video, UploadProgress } from '../types';

interface UploadPanelProps {
  onUploadComplete?: (video: Video) => void;
}

export const UploadPanel: React.FC<UploadPanelProps> = ({ onUploadComplete }) => {
  const { videos, addVideo, removeVideo, updateVideoInfo } = useVideoStore();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clippedVideo = videos.find((v) => v.type === 'clipped');
  const originalVideos = videos.filter((v) => v.type === 'original');

  const handleUpload = useCallback(
    async (files: FileList, type: 'clipped' | 'original') => {
      const file = files[0];
      if (!file) return;

      if (!file.type.startsWith('video/')) {
        setError('请上传视频文件');
        return;
      }

      const maxSize = 100 * 1024 * 1024;
      if (file.size > maxSize) {
        setError('文件大小不能超过100MB');
        return;
      }

      setError(null);
      setUploadProgress({ loaded: 0, total: file.size, percentage: 0 });

      try {
        let index = 0;
        if (type === 'original') {
          index = originalVideos.length;
        }

        const video = await api.uploadVideo(
          file,
          type,
          index,
          (progress) => {
            setUploadProgress(progress);
          }
        );

        addVideo(video);
        onUploadComplete?.(video);
      } catch (err) {
        setError(err instanceof Error ? err.message : '上传失败');
      } finally {
        setUploadProgress(null);
      }
    },
    [addVideo, onUploadComplete, originalVideos.length]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, type: 'clipped' | 'original') => {
      e.preventDefault();
      setIsDragging(false);
      handleUpload(e.dataTransfer.files, type);
    },
    [handleUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, type: 'clipped' | 'original') => {
      if (e.target.files) {
        handleUpload(e.target.files, type);
      }
    },
    [handleUpload]
  );

  const handleRemoveVideo = async (video: Video) => {
    try {
      await api.deleteVideo(video.id);
    } catch {
    }
    removeVideo(video.id);
  };

  return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <Upload className="w-6 h-6 text-cyan-400" />
        视频上传
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h3 className="text-gray-300 mb-3 flex items-center gap-2">
            <Film className="w-5 h-5 text-red-400" />
            被剪辑视频（视频1）
          </h3>

          {clippedVideo ? (
            <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileVideo className="w-8 h-8 text-red-400" />
                <div>
                  <p className="text-white font-medium">{clippedVideo.fileName}</p>
                  <p className="text-gray-400 text-sm">
                    {(clippedVideo.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemoveVideo(clippedVideo)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-red-400 bg-red-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'clipped')}
            >
              <Upload className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">拖拽视频文件到这里</p>
              <p className="text-gray-500 text-sm mb-3">或者</p>
              <label className="inline-block">
                <span className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer transition-colors">
                  选择文件
                </span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => handleFileInput(e, 'clipped')}
                />
              </label>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-gray-300 mb-3 flex items-center gap-2">
            <FileVideo className="w-5 h-5 text-green-400" />
            原创视频（视频2-{4 - originalVideos.length}）
          </h3>

          {originalVideos.length < 3 && (
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors mb-4 ${
                isDragging
                  ? 'border-green-400 bg-green-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'original')}
            >
              <Upload className="w-10 h-10 text-gray-500 mx-auto mb-2" />
              <p className="text-gray-400 mb-2">拖拽原创视频到这里</p>
              <p className="text-gray-500 text-sm mb-2">或者</p>
              <label className="inline-block">
                <span className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg cursor-pointer transition-colors text-sm">
                  选择文件
                </span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => handleFileInput(e, 'original')}
                />
              </label>
            </div>
          )}

          <div className="space-y-3">
            {originalVideos.map((video, index) => (
              <div
                key={video.id}
                className="bg-gray-800 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center font-medium">
                    {index + 2}
                  </span>
                  <div>
                    <p className="text-white font-medium">{video.fileName}</p>
                    <p className="text-gray-400 text-sm">
                      {(video.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveVideo(video)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            ))}
          </div>

          {originalVideos.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">
              暂无原创视频，请上传至少一个原创视频
            </p>
          )}
        </div>

        {uploadProgress && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">上传进度</span>
              <span className="text-cyan-400">{uploadProgress.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300"
                style={{ width: `${uploadProgress.percentage}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
