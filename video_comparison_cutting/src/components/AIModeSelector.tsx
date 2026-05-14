import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Cloud, Settings, Activity, Brain, Search, RefreshCw, CheckCircle, AlertCircle, Server } from 'lucide-react';
import { useVideoStore } from '../store/videoStore';
import type { AIConfig } from '../types';
import { api } from '../utils/api';

export const AIModeSelector: React.FC = () => {
  const { 
    videos, 
    aiConfig, 
    setAIConfig, 
    setAnalysis, 
    isAnalyzing, 
    setIsAnalyzing,
    analysisProgress,
    setAnalysisProgress 
  } = useVideoStore();
  
  const [clipLoading, setClipLoading] = useState(false);
  const [clipLoaded, setClipLoaded] = useState(false);
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [cloudConfig, setCloudConfig] = useState({
    provider: 'custom' as 'google' | 'azure' | 'custom',
    apiKey: '',
    endpoint: '',
    region: ''
  });
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configStatus, setConfigStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [cloudConfigTested, setCloudConfigTested] = useState(false);
  const [cloudConfigValid, setCloudConfigValid] = useState(false);

  const clippedVideo = videos.find((v) => v.type === 'clipped');
  const originalVideos = videos.filter((v) => v.type === 'original');
  
  const canAnalyze = () => {
    const hasVideos = clippedVideo && originalVideos.length > 0;
    if (!hasVideos) return false;
    
    if (aiConfig.mode === 'cloud') {
      return checkCloudConfigValid();
    }
    return true;
  };
  
  const checkCloudConfigValid = () => {
    if (!aiConfig.cloud.config) return false;
    
    const config = aiConfig.cloud.config;
    const provider = aiConfig.cloud.cloudProvider;
    
    if (provider === 'custom') {
      return !!config.endpoint;
    } else if (provider === 'google' || provider === 'azure') {
      return !!config.apiKey;
    }
    return false;
  };

  useEffect(() => {
    if (aiConfig.mode === 'clip' && !clipLoaded) {
      checkCLIPStatus();
    }
    if (aiConfig.mode === 'cloud' && !showCloudConfig) {
      setShowCloudConfig(true);
    }
  }, [aiConfig.mode]);
  
  useEffect(() => {
    if (aiConfig.cloud.config) {
      setCloudConfig({
        provider: aiConfig.cloud.cloudProvider || 'custom',
        apiKey: aiConfig.cloud.config.apiKey || '',
        endpoint: aiConfig.cloud.config.endpoint || '',
        region: aiConfig.cloud.config.region || '',
      });
    }
  }, []);

  const checkCLIPStatus = async () => {
    try {
      const response = await fetch('/api/analyze/clip-status');
      const data = await response.json();
      if (data.loaded) {
        setClipLoaded(true);
      }
    } catch (error) {
      console.log('CLIP状态检查失败:', error);
    }
  };

  const handleModeChange = async (mode: 'local' | 'cloud' | 'clip') => {
    if (mode === 'clip' && !clipLoaded) {
      setClipLoading(true);
      try {
        const response = await fetch('/api/analyze/init-clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await response.json();
        if (data.success) {
          setClipLoaded(true);
          setAIConfig({ mode: 'clip' });
        } else {
          alert('CLIP模型初始化失败: ' + (data.error || '未知错误'));
        }
      } catch (error) {
        console.error('CLIP初始化失败:', error);
        alert('CLIP模型初始化失败，请确保依赖已安装。');
      } finally {
        setClipLoading(false);
      }
    } else {
      setAIConfig({ mode });
    }
  };

  const handleSensitivityChange = (sensitivity: number) => {
    setAIConfig({ sensitivity });
  };

  const handleCloudProviderChange = (provider: 'google' | 'azure' | 'custom') => {
    setAIConfig({ cloudProvider: provider } as Partial<AIConfig>);
    setCloudConfig(prev => ({ ...prev, provider }));
  };

  const handleFullRangeSearchChange = (enabled: boolean) => {
    setAIConfig({ fullRangeSearch: enabled });
  };

  const handleSaveCloudConfig = async () => {
    setIsSavingConfig(true);
    setConfigStatus('idle');
    
    try {
      const response = await fetch('/api/ai/config/cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloudConfig)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setConfigStatus('success');
        setCloudConfigTested(true);
        setCloudConfigValid(data.test?.available || false);
        setAIConfig({
          cloudProvider: cloudConfig.provider,
          cloud: {
            ...aiConfig.cloud,
            cloudProvider: cloudConfig.provider,
            config: cloudConfig,
            providers: aiConfig.cloud.providers.map(p => ({
              ...p,
              configured: p.name === cloudConfig.provider
            })),
            available: data.test?.available || false,
          }
        } as Partial<AIConfig>);
        setTimeout(() => setConfigStatus('idle'), 3000);
      } else {
        setConfigStatus('error');
        setCloudConfigTested(true);
        setCloudConfigValid(false);
        alert('配置保存失败: ' + (data.error || '未知错误'));
      }
    } catch (error) {
      setConfigStatus('error');
      setCloudConfigTested(true);
      setCloudConfigValid(false);
      console.error('保存云端配置失败:', error);
      alert('保存配置失败');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleStartAnalysis = useCallback(async () => {
    if (!canAnalyze() || !clippedVideo) return;

    setIsAnalyzing(true);
    setAnalysisProgress({
      stage: 'extracting',
      progress: 0,
      message: '正在提取视频特征...'
    });

    try {
      const result = await api.analyzeVideos(
        clippedVideo.id,
        originalVideos.map((v) => v.id),
        aiConfig.mode,
        undefined,
        aiConfig.sensitivity,
        false,
        aiConfig.fullRangeSearch
      );

      setAnalysis({
        id: result.segments.length > 0 ? `analysis-${Date.now()}` : '',
        segments: result.segments,
        totalMatchDuration: result.totalMatchDuration,
        aiMode: result.processingTime > 0 ? aiConfig.mode : 'local',
        processingTime: result.processingTime
      });

      setAnalysisProgress({
        stage: 'complete',
        progress: 100,
        message: '分析完成！'
      });
    } catch (error) {
      console.error('分析失败:', error);
      setAnalysisProgress({
        stage: 'complete',
        progress: 0,
        message: '分析失败，请重试'
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [clippedVideo, originalVideos, aiConfig, setAnalysis, setAnalysisProgress, setIsAnalyzing]);

  return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <Activity className="w-6 h-6 text-cyan-400" />
        AI检测设置
      </h2>

      <div className="space-y-6">
        <div>
          <label className="block text-gray-300 text-sm mb-3">
            AI检测模式
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleModeChange('local')}
              className={`p-4 rounded-lg border-2 transition-all ${
                aiConfig.mode === 'local'
                  ? 'border-cyan-400 bg-cyan-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <Cpu className={`w-8 h-8 ${
                  aiConfig.mode === 'local' ? 'text-cyan-400' : 'text-gray-500'
                }`} />
                <span className={`font-medium text-sm ${
                  aiConfig.mode === 'local' ? 'text-cyan-400' : 'text-gray-400'
                }`}>
                  本地
                </span>
                <span className="text-xs text-gray-500 text-center">
                  快速
                  <br />
                  哈希算法
                </span>
              </div>
            </button>

            <button
              onClick={() => handleModeChange('cloud')}
              className={`p-4 rounded-lg border-2 transition-all relative ${
                aiConfig.mode === 'cloud'
                  ? 'border-purple-400 bg-purple-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <Cloud className={`w-8 h-8 ${
                  aiConfig.mode === 'cloud' ? 'text-purple-400' : 'text-gray-500'
                }`} />
                <span className={`font-medium text-sm ${
                  aiConfig.mode === 'cloud' ? 'text-purple-400' : 'text-gray-400'
                }`}>
                  云端
                </span>
                <span className="text-xs text-gray-500 text-center">
                  高精度
                  <br />
                  需配置API
                </span>
              </div>
              <div className="absolute -top-2 -right-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCloudConfig(!showCloudConfig);
                  }}
                  className="p-1 bg-purple-500/20 rounded-full hover:bg-purple-500/30 transition-colors"
                >
                  <Settings className="w-3 h-3 text-purple-400" />
                </button>
              </div>
            </button>

            <button
              onClick={() => handleModeChange('clip')}
              disabled={clipLoading}
              className={`p-4 rounded-lg border-2 transition-all ${
                aiConfig.mode === 'clip'
                  ? 'border-green-400 bg-green-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              } ${clipLoading ? 'opacity-50 cursor-wait' : ''}`}
            >
              <div className="flex flex-col items-center gap-2">
                <Brain className={`w-8 h-8 ${
                  aiConfig.mode === 'clip' ? 'text-green-400' : 'text-gray-500'
                } ${clipLoading ? 'animate-pulse' : ''}`} />
                <span className={`font-medium text-sm ${
                  aiConfig.mode === 'clip' ? 'text-green-400' : 'text-gray-400'
                }`}>
                  {clipLoading ? '加载中...' : 'CLIP'}
                </span>
                <span className="text-xs text-gray-500 text-center">
                  高精度
                  <br />
                  AI视觉
                </span>
              </div>
            </button>
          </div>
        </div>

        {showCloudConfig && (
          <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/30">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-purple-400 font-medium flex items-center gap-2">
                <Server className="w-4 h-4" />
                云端API配置
              </h4>
              <button
                onClick={() => setShowCloudConfig(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(['google', 'azure', 'custom'] as const).map((provider) => (
                  <button
                    key={provider}
                    onClick={() => handleCloudProviderChange(provider)}
                    className={`p-2 rounded border text-xs transition-all ${
                      cloudConfig.provider === provider
                        ? 'border-purple-400 bg-purple-500/20 text-purple-400'
                        : 'border-gray-600 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {provider === 'google' && 'Google'}
                    {provider === 'azure' && 'Azure'}
                    {provider === 'custom' && '自定义API'}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-gray-300 text-xs mb-1">
                  {cloudConfig.provider === 'custom' ? 'API端点' : 'API密钥'}
                </label>
                <input
                  type={cloudConfig.provider === 'custom' ? 'text' : 'password'}
                  value={cloudConfig.provider === 'custom' ? cloudConfig.endpoint : cloudConfig.apiKey}
                  onChange={(e) => setCloudConfig(prev => ({
                    ...prev,
                    [cloudConfig.provider === 'custom' ? 'endpoint' : 'apiKey']: e.target.value
                  }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                  placeholder={
                    cloudConfig.provider === 'custom' 
                      ? 'https://your-api.com/v1/analyze' 
                      : '输入API密钥'
                  }
                />
              </div>

              {cloudConfig.provider === 'custom' && (
                <div>
                  <label className="block text-gray-300 text-xs mb-1">
                    API密钥（可选）
                  </label>
                  <input
                    type="password"
                    value={cloudConfig.apiKey}
                    onChange={(e) => setCloudConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                    placeholder="输入API密钥（如需要）"
                  />
                </div>
              )}

              {cloudConfig.provider === 'azure' && (
                <div>
                  <label className="block text-gray-300 text-xs mb-1">
                    区域
                  </label>
                  <input
                    type="text"
                    value={cloudConfig.region}
                    onChange={(e) => setCloudConfig(prev => ({ ...prev, region: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                    placeholder="如：eastus"
                  />
                </div>
              )}

              <button
                onClick={handleSaveCloudConfig}
                disabled={isSavingConfig}
                className="w-full py-2 px-4 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-600 text-white rounded text-sm transition-colors flex items-center justify-center gap-2"
              >
                {isSavingConfig ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : configStatus === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : configStatus === 'error' ? (
                  <AlertCircle className="w-4 h-4" />
                ) : null}
                {isSavingConfig ? '保存中...' : configStatus === 'success' ? '保存成功！' : '保存配置'}
              </button>
            </div>
          </div>
        )}

        {aiConfig.mode === 'clip' && (
          <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-medium">CLIP模型</span>
              {clipLoaded && <span className="text-green-400 text-xs">（就绪）</span>}
            </div>
            <div className="space-y-2">
              <label className="block text-gray-300 text-xs">
                模型: Xenova/clip-vit-base-patch32
              </label>
              <div>
                <label className="block text-gray-300 text-xs mb-1">设备:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const clipConfig = { ...aiConfig.clip, device: 'cpu' as const };
                      setAIConfig({ clip: clipConfig } as Partial<AIConfig>);
                      setClipLoaded(false);
                    }}
                    className={`p-2 rounded text-xs transition-all ${
                      aiConfig.clip?.device === 'cpu'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    CPU
                  </button>
                  <button
                    onClick={() => {
                      const clipConfig = { ...aiConfig.clip, device: 'cuda' as const };
                      setAIConfig({ clip: clipConfig } as Partial<AIConfig>);
                      setClipLoaded(false);
                    }}
                    className={`p-2 rounded text-xs transition-all ${
                      aiConfig.clip?.device === 'cuda'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    GPU (CUDA)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-gray-300 text-sm mb-3">
            敏感度: <span className="text-cyan-400">{aiConfig.sensitivity}%</span>
          </label>
          <div className="space-y-2">
            <input
              type="range"
              min="50"
              max="100"
              value={aiConfig.sensitivity}
              onChange={(e) => handleSensitivityChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>更宽松</span>
              <span>更严格</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleStartAnalysis}
            disabled={!canAnalyze() || isAnalyzing}
            className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              canAnalyze() && !isAnalyzing
                ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-black'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                {analysisProgress?.message || '分析中...'}
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                开始AI分析
              </>
            )}
          </button>

          {aiConfig.mode === 'cloud' && !checkCloudConfigValid() && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-400">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>请先在上方配置云端API，然后点击「保存配置」</span>
              </div>
              <ul className="mt-1 ml-6 list-disc">
                {cloudConfig.provider === 'custom' && (
                  <li>需要填写API端点地址</li>
                )}
                {(cloudConfig.provider === 'google' || cloudConfig.provider === 'azure') && (
                  <li>需要填写API密钥</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 pt-4">
          <label className="block text-gray-300 text-sm mb-3">
            性能选项
          </label>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
              <div className="flex items-center gap-3">
                <Cpu className={`w-5 h-5 ${
                  aiConfig.fullRangeSearch ? 'text-cyan-400' : 'text-gray-500'
                }`} />
                <div>
                  <p className="text-white text-sm font-medium">100%全范围搜索</p>
                  <p className="text-gray-400 text-xs">搜索所有可能的相似片段</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={aiConfig.fullRangeSearch || false}
                  onChange={(e) => handleFullRangeSearchChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </div>
            </label>
          </div>
        </div>

        <div className="p-4 bg-gray-800/50 rounded-lg">
          <h4 className="text-gray-300 text-sm mb-2 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            当前配置
          </h4>
          <div className="space-y-1 text-xs text-gray-400">
            <p>模式: {aiConfig.mode === 'local' ? '本地 (感知哈希)' : aiConfig.mode === 'clip' ? 'CLIP (AI视觉)' : '云端'}</p>
            {aiConfig.mode === 'cloud' && (
              <p>服务商: {aiConfig.cloud.cloudProvider || '未选择'}</p>
            )}
            {aiConfig.mode === 'clip' && (
              <>
                <p>设备: {aiConfig.clip?.device || 'cpu'}</p>
                <p>模型: {aiConfig.clip?.modelName || 'Xenova/clip-vit-base-patch32'}</p>
              </>
            )}
            <p>敏感度: {aiConfig.sensitivity}%</p>
            <p>全范围搜索: {aiConfig.fullRangeSearch ? '已启用' : '未启用'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
