import type {
  Video,
  MatchSegment,
  AIConfig,
  AnalysisProgress,
  ExportOptions,
  ExportResult,
  UploadProgress,
} from '../types';

const API_BASE = '/api';

export const api = {
  async uploadVideo(
    file: File,
    type: 'clipped' | 'original',
    index: number,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Video> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    formData.append('index', index.toString());

    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success && response.video) {
              resolve(response.video);
            } else {
              reject(new Error(response.error || 'Upload failed'));
            }
          } catch (e) {
            reject(new Error('Invalid response format'));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('POST', `${API_BASE}/upload`);
      xhr.send(formData);
    });
  },

  async analyzeVideos(
    clippedVideoId: string,
    originalVideoIds: string[],
    aiMode: 'local' | 'cloud',
    cloudProvider?: 'google' | 'azure' | 'custom',
    sensitivity?: number,
    gpuEnabled?: boolean,
    fullRangeSearch?: boolean
  ): Promise<{
    success: boolean;
    segments: MatchSegment[];
    totalMatchDuration: number;
    processingTime: number;
  }> {
    const response = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clippedVideoId,
        originalVideoIds,
        aiMode,
        cloudProvider,
        sensitivity,
        gpuEnabled,
        fullRangeSearch,
      }),
    });

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }

    return response.json();
  },

  async getAIConfig(): Promise<AIConfig> {
    const response = await fetch(`${API_BASE}/ai/config`);
    if (!response.ok) {
      throw new Error(`Failed to get AI config: ${response.statusText}`);
    }
    return response.json();
  },

  async updateAIConfig(config: Partial<AIConfig>): Promise<AIConfig> {
    const response = await fetch(`${API_BASE}/ai/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      throw new Error(`Failed to update AI config: ${response.statusText}`);
    }

    return response.json();
  },

  async exportVideo(
    options: ExportOptions,
    onProgress?: (progress: number) => void
  ): Promise<ExportResult> {
    const response = await fetch(`${API_BASE}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Export failed: ${response.statusText}`);
    }

    return response.json();
  },

  async getVideoFrames(videoId: string, timestamp: number): Promise<string> {
    const response = await fetch(
      `${API_BASE}/frames?videoId=${videoId}&timestamp=${timestamp}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get frames: ${response.statusText}`);
    }

    const data = await response.json();
    return data.frameUrl;
  },

  async deleteVideo(videoId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/videos/${videoId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete video: ${response.statusText}`);
    }
  },

  async getAnalysisProgress(
    analysisId: string,
    onProgress: (progress: AnalysisProgress) => void
  ): Promise<{ success: boolean; segments: MatchSegment[] }> {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(
        `${API_BASE}/analyze/progress/${analysisId}`
      );

      eventSource.onmessage = (event) => {
        const progress = JSON.parse(event.data) as AnalysisProgress;
        onProgress(progress);

        if (progress.stage === 'complete') {
          eventSource.close();
          resolve({ success: true, segments: [] });
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        reject(new Error('Progress stream failed'));
      };
    });
  },
};
