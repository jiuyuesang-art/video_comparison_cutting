export interface Video {
  id: string;
  fileName: string;
  type: 'clipped' | 'original';
  index: number;
  duration: number;
  size: number;
  filePath: string;
  thumbnailPath?: string;
  customInfo?: string;
  uploadedAt: string;
}

export interface MatchSegment {
  id: string;
  clippedStart: number;
  clippedEnd: number;
  originalVideoId: string;
  originalStart: number;
  originalEnd: number;
  similarity: number;
  type: 'exact' | 'scaled' | 'cropped' | 'speed_adjusted' | 'none';
  confidence: number;
  speedRatio?: number;
  originalSpeedRatio?: number;
}

export interface Analysis {
  id: string;
  clippedVideoId: string;
  originalVideoIds: string[];
  segments: MatchSegment[];
  totalMatchDuration: number;
  aiMode: 'local' | 'cloud' | 'clip';
  cloudProvider?: 'google' | 'azure' | 'custom';
  processingTime: number;
  analyzedAt: string;
}

export interface MatchConfig {
  gpuEnabled: boolean;
  fullRangeSearch: boolean;
  sensitivity: number;
  minMatchDuration: number;
}

export interface AIConfig {
  mode: 'local' | 'cloud' | 'clip';
  local: {
    available: boolean;
    models: string[];
    currentModel: string;
    gpuEnabled: boolean;
  };
  cloud: {
    available: boolean;
    providers: Array<{
      name: string;
      configured: boolean;
      credits?: number;
    }>;
    cloudProvider?: 'google' | 'azure' | 'custom';
    config?: {
      apiKey?: string;
      endpoint?: string;
      region?: string;
    };
  };
  clip: {
    available: boolean;
    modelName: string;
    device: 'cpu' | 'cuda';
    loaded: boolean;
  };
  defaultMode: 'local' | 'cloud' | 'clip';
  sensitivity: number;
  fullRangeSearch: boolean;
}

export interface ExportOptions {
  clippedVideoId: string;
  originalVideoIds: string[];
  segments: MatchSegment[];
  outputFormat: 'mp4' | 'mov';
  includeAlpha: boolean;
  gpuEnabled?: boolean;
  gapFillThreshold?: number;
}

export interface ExportResult {
  success: boolean;
  downloadUrl: string;
  fileName: string;
  error?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface AnalysisProgress {
  stage: 'extracting' | 'comparing' | 'matching' | 'complete';
  progress: number;
  message: string;
}

export type VideoType = 'clipped' | 'original';
