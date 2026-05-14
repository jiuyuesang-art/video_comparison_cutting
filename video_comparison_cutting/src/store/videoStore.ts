import { create } from 'zustand';
import type { Video, MatchSegment, AIConfig, AnalysisProgress } from '../types';

interface VideoStore {
  videos: Video[];
  analysis: {
    id: string;
    segments: MatchSegment[];
    totalMatchDuration: number;
    aiMode: 'local' | 'cloud' | 'clip';
    processingTime: number;
  } | null;
  
  selectedOriginalVideoId: string | null;
  
  aiConfig: AIConfig;
  
  analysisProgress: AnalysisProgress | null;
  
  isAnalyzing: boolean;
  isExporting: boolean;
  
  addVideo: (video: Video) => void;
  removeVideo: (id: string) => void;
  updateVideoInfo: (id: string, customInfo: string) => void;
  setSelectedOriginalVideo: (id: string | null) => void;
  
  setAnalysis: (analysis: VideoStore['analysis']) => void;
  clearAnalysis: () => void;
  
  setAIConfig: (config: Partial<AIConfig>) => void;
  setAnalysisProgress: (progress: AnalysisProgress | null) => void;
  
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setIsExporting: (isExporting: boolean) => void;
  
  clearAll: () => void;
}

export const useVideoStore = create<VideoStore>((set) => ({
  videos: [],
  analysis: null,
  selectedOriginalVideoId: null,
  
  aiConfig: {
    mode: 'local',
    local: {
      available: true,
      models: ['perceptual_hash'],
      currentModel: 'perceptual_hash',
      gpuEnabled: false,
    },
    cloud: {
      available: false,
      providers: [
        { name: 'google', configured: false },
        { name: 'azure', configured: false },
        { name: 'custom', configured: false }
      ],
      cloudProvider: undefined,
      config: undefined,
    },
    clip: {
      available: true,
      modelName: 'Xenova/clip-vit-base-patch32',
      device: 'cpu',
      loaded: false,
    },
    defaultMode: 'local',
    sensitivity: 75,
    fullRangeSearch: true,
  },
  
  analysisProgress: null,
  isAnalyzing: false,
  isExporting: false,
  
  addVideo: (video) =>
    set((state) => {
      if (video.type === 'clipped') {
        const existingClipped = state.videos.filter((v) => v.type === 'clipped');
        if (existingClipped.length > 0) {
          return {
            videos: state.videos
              .filter((v) => v.id !== video.id)
              .filter((v) => v.type !== 'clipped')
              .concat(video),
          };
        }
      }
      const existingIndex = state.videos.findIndex((v) => v.id === video.id);
      if (existingIndex >= 0) {
        const newVideos = [...state.videos];
        newVideos[existingIndex] = video;
        return { videos: newVideos };
      }
      return { videos: [...state.videos, video] };
    }),
  
  removeVideo: (id) =>
    set((state) => ({
      videos: state.videos.filter((v) => v.id !== id),
      selectedOriginalVideoId:
        state.selectedOriginalVideoId === id ? null : state.selectedOriginalVideoId,
    })),
  
  updateVideoInfo: (id, customInfo) =>
    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === id ? { ...v, customInfo } : v
      ),
    })),
  
  setSelectedOriginalVideo: (id) =>
    set({ selectedOriginalVideoId: id }),
  
  setAnalysis: (analysis) => set({ analysis }),
  
  clearAnalysis: () => set({ analysis: null }),
  
  setAIConfig: (config) =>
    set((state) => ({
      aiConfig: { ...state.aiConfig, ...config },
    })),
  
  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),
  
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  
  setIsExporting: (isExporting) => set({ isExporting }),
  
  clearAll: () =>
    set({
      videos: [],
      analysis: null,
      selectedOriginalVideoId: null,
      analysisProgress: null,
      isAnalyzing: false,
      isExporting: false,
    }),
}));
