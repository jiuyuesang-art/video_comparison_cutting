import React, { useCallback, useState } from 'react';
import { UploadPanel } from '../components/UploadPanel';
import { CompareView } from '../components/CompareView';
import { Timeline } from '../components/Timeline';
import { AIModeSelector } from '../components/AIModeSelector';
import { ExportPanel } from '../components/ExportPanel';
import { ProgressBar } from '../components/ProgressBar';
import { useVideoStore } from '../store/videoStore';
import { Search, Play, Trash2 } from 'lucide-react';

const Home: React.FC = () => {
  const {
    videos,
    analysis,
    isAnalyzing,
    analysisProgress,
    clearAll
  } = useVideoStore();

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleClear = useCallback(() => {
    if (confirm('确定要清除所有视频和结果吗？')) {
      clearAll();
    }
  }, [clearAll]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMzYiIGZpbGwtb3BhY2l0eT0iMC40NSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-50 pointer-events-none" />
      
      <div className="relative z-10">
        <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <Search className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">视频剪辑检测</h1>
                  <p className="text-xs text-gray-400">Video Clip Detection</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleClear}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  清除
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          {isAnalyzing && analysisProgress && (
            <div className="mb-6">
              <ProgressBar
                progress={analysisProgress.progress}
                message={analysisProgress.message}
                isLoading
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <UploadPanel />
              
              <CompareView />

              {analysis && (
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-purple-400 hover:from-purple-400 hover:to-purple-300 text-white"
                >
                  <Play className="w-5 h-5" />
                  {isPlaying ? '暂停预览' : '预览对比'}
                </button>
              )}

              <Timeline />
            </div>

            <div className="space-y-6">
              <AIModeSelector />

              <ExportPanel />

              <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 rounded-xl p-6 border border-cyan-500/20">
                <h4 className="text-white font-medium mb-3">快速指南</h4>
                <ol className="text-sm text-gray-400 space-y-2">
                  <li className="flex gap-2">
                    <span className="text-cyan-400 font-medium">1.</span>
                    上传被剪辑的视频（视频1）
                  </li>
                  <li className="flex gap-2">
                    <span className="text-cyan-400 font-medium">2.</span>
                    上传1-3个原创视频（视频2-4）
                  </li>
                  <li className="flex gap-2">
                    <span className="text-cyan-400 font-medium">3.</span>
                    选择AI检测模式和参数
                  </li>
                  <li className="flex gap-2">
                    <span className="text-cyan-400 font-medium">4.</span>
                    点击"开始AI分析"
                  </li>
                  <li className="flex gap-2">
                    <span className="text-cyan-400 font-medium">5.</span>
                    查看结果并导出对比视频
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </main>

        <footer className="border-t border-gray-800 mt-12">
          <div className="container mx-auto px-6 py-4">
            <p className="text-center text-gray-500 text-sm">
              © 2026 视频剪辑检测系统 - 支持本地AI和云端AI检测
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Home;
