import React, { useState } from 'react';
import { Download, FileVideo, Loader2, CheckCircle, AlertCircle, Zap, Clock } from 'lucide-react';
import { useVideoStore } from '../store/videoStore';
import { api } from '../utils/api';
import type { ExportOptions } from '../types';

export const ExportPanel: React.FC = () => {
  const { videos, analysis, isExporting, setIsExporting } = useVideoStore();
  const [exportFormat, setExportFormat] = useState<'mp4' | 'mov'>('mp4');
  const [includeAlpha, setIncludeAlpha] = useState(true);
  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [gapFillThreshold, setGapFillThreshold] = useState(5);
  const [exportResult, setExportResult] = useState<{
    success: boolean;
    downloadUrl?: string;
    fileName?: string;
    error?: string;
  } | null>(null);

  const clippedVideo = videos.find((v) => v.type === 'clipped');
  const originalVideos = videos.filter((v) => v.type === 'original');

  const canExport = clippedVideo && originalVideos.length > 0;

  const handleExport = async () => {
    if (!canExport) return;

    setIsExporting(true);
    setExportResult(null);

    try {
      const options: ExportOptions = {
        clippedVideoId: clippedVideo.id,
        originalVideoIds: originalVideos.map((v) => v.id),
        segments: analysis?.segments || [],
        outputFormat: exportFormat,
        includeAlpha,
        gpuEnabled,
        gapFillThreshold,
      };

      const result = await api.exportVideo(options);
      setExportResult({
        success: true,
        downloadUrl: result.downloadUrl,
        fileName: result.fileName,
      });

      setTimeout(() => {
        if (result.downloadUrl) {
          window.open(result.downloadUrl, '_blank');
        }
      }, 500);
    } catch (error) {
      setExportResult({
        success: false,
        error: error instanceof Error ? error.message : '导出失败',
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!clippedVideo) {
    return null;
  }

  return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <Download className="w-6 h-6 text-cyan-400" />
        导出对比视频
      </h2>

      <div className="space-y-6">
        <div>
          <label className="block text-gray-300 text-sm mb-3">
            导出格式
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setExportFormat('mp4')}
              className={`p-3 rounded-lg border transition-all ${
                exportFormat === 'mp4'
                  ? 'border-cyan-400 bg-cyan-500/10 text-cyan-400'
                  : 'border-gray-700 hover:border-gray-600 text-gray-400'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <FileVideo className="w-6 h-6" />
                <span className="text-sm font-medium">MP4</span>
                <span className="text-xs opacity-70">H.264 编码</span>
              </div>
            </button>

            <button
              onClick={() => setExportFormat('mov')}
              className={`p-3 rounded-lg border transition-all ${
                exportFormat === 'mov'
                  ? 'border-cyan-400 bg-cyan-500/10 text-cyan-400'
                  : 'border-gray-700 hover:border-gray-600 text-gray-400'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <FileVideo className="w-6 h-6" />
                <span className="text-sm font-medium">MOV</span>
                <span className="text-xs opacity-70">ProRes 编码</span>
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAlpha}
              onChange={(e) => setIncludeAlpha(e.target.checked)}
              className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-cyan-400 focus:ring-cyan-400 focus:ring-offset-0"
            />
            <div>
              <span className="text-gray-300 text-sm">包含 Alpha 通道</span>
              <p className="text-gray-500 text-xs">支持透明背景导出</p>
            </div>
          </label>
        </div>

        <div className="border-t border-gray-700 pt-4">
          <label className="block text-gray-300 text-sm mb-3">
            导出选项
          </label>
          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
              <div className="flex items-center gap-3">
                <Zap className={`w-5 h-5 ${gpuEnabled ? 'text-green-400' : 'text-gray-500'}`} />
                <div>
                  <p className="text-white text-sm font-medium">GPU加速导出</p>
                  <p className="text-gray-400 text-xs">使用GPU加速视频导出</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={gpuEnabled}
                  onChange={(e) => setGpuEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </div>
            </label>

            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-gray-500" />
                <label className="text-white text-sm font-medium">
                  Gap填充阈值: <span className="text-cyan-400">{gapFillThreshold}秒</span>
                </label>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={gapFillThreshold}
                onChange={(e) => setGapFillThreshold(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>0秒（始终黑屏）</span>
                <span>10秒（始终填充）</span>
              </div>
              <p className="text-gray-400 text-xs mt-2">
                当非匹配片段间距 ≤ 此值时，用原创视频内容填充；否则显示黑屏
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-800/50 rounded-lg">
          <h4 className="text-gray-300 text-sm mb-2">导出设置</h4>
          <div className="space-y-1 text-xs text-gray-400">
            <p>视频1: {clippedVideo.fileName}（完整播放）</p>
            <p>原创视频: {originalVideos.length} 个</p>
            <p>相似片段: {analysis?.segments.length || 0} 个</p>
            <p>格式: {exportFormat.toUpperCase()}</p>
            <p>音频: 仅保留视频1的音频</p>
            <p>Gap填充阈值: {gapFillThreshold}秒</p>
            {gpuEnabled && <p className="text-green-400">GPU加速: 已启用</p>}
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={!canExport || isExporting}
          className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
            canExport && !isExporting
              ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-black'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isExporting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              正在导出...
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              导出对比视频
            </>
          )}
        </button>

        {exportResult && (
          <div
            className={`p-4 rounded-lg flex items-start gap-3 ${
              exportResult.success
                ? 'bg-green-500/10 border border-green-500/30'
                : 'bg-red-500/10 border border-red-500/30'
            }`}
          >
            {exportResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              {exportResult.success ? (
                <>
                  <p className="text-green-400 font-medium">导出成功！</p>
                  <p className="text-gray-400 text-sm mt-1">
                    文件: {exportResult.fileName}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-red-400 font-medium">导出失败</p>
                  <p className="text-gray-400 text-sm mt-1">{exportResult.error}</p>
                </>
              )}
            </div>
          </div>
        )}

        {!analysis && (
          <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
            <p className="text-yellow-400 text-sm">
              ⚠️ 请先进行AI分析后再导出，系统将根据分析结果生成对比视频
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
