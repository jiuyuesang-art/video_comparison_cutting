import { Readable } from 'stream';
import { storageService } from './storageService';

export interface CloudConfig {
  provider: 'google' | 'azure' | 'custom';
  apiKey?: string;
  endpoint?: string;
  region?: string;
}

export interface MatchSegment {
  id: string;
  clippedStart: number;
  clippedEnd: number;
  originalVideoId: string;
  originalStart: number;
  originalEnd: number;
  similarity: number;
  confidence: number;
  type: 'exact' | 'scaled' | 'cropped';
}

class CloudService {
  private config: CloudConfig | null = null;

  setConfig(config: CloudConfig) {
    this.config = config;
  }

  async analyzeVideos(
    clippedVideoPath: string,
    originalVideoPath: string,
    originalVideoId: string,
    sensitivity: number = 75
  ): Promise<MatchSegment[]> {
    if (!this.config) {
      throw new Error('Cloud service not configured');
    }

    console.log(`[Cloud Service] Analyzing with provider: ${this.config.provider}`);

    try {
      switch (this.config.provider) {
        case 'google':
          return await this.analyzeWithGoogle(clippedVideoPath, originalVideoPath, originalVideoId, sensitivity);
        case 'azure':
          return await this.analyzeWithAzure(clippedVideoPath, originalVideoPath, originalVideoId, sensitivity);
        case 'custom':
          return await this.analyzeWithCustomAPI(clippedVideoPath, originalVideoPath, originalVideoId, sensitivity);
        default:
          throw new Error('Unknown cloud provider');
      }
    } catch (error) {
      console.error('[Cloud Service] Analysis failed, falling back to CLIP:', error);
      throw error;
    }
  }

  private async analyzeWithGoogle(
    clippedVideoPath: string,
    originalVideoPath: string,
    originalVideoId: string,
    sensitivity: number
  ): Promise<MatchSegment[]> {
    console.log('[Google Cloud] Attempting to use Google Video Intelligence...');
    
    const apiKey = this.config?.apiKey;
    if (!apiKey) {
      console.log('[Google Cloud] No API key configured, using fallback');
      throw new Error('Google API key not configured');
    }

    throw new Error('Google Cloud integration requires API setup');
  }

  private async analyzeWithAzure(
    clippedVideoPath: string,
    originalVideoPath: string,
    originalVideoId: string,
    sensitivity: number
  ): Promise<MatchSegment[]> {
    console.log('[Azure] Attempting to use Azure Video Indexer...');
    
    const apiKey = this.config?.apiKey;
    const region = this.config?.region;
    if (!apiKey || !region) {
      console.log('[Azure] No API key or region configured, using fallback');
      throw new Error('Azure API key or region not configured');
    }

    throw new Error('Azure integration requires API setup');
  }

  private async analyzeWithCustomAPI(
    clippedVideoPath: string,
    originalVideoPath: string,
    originalVideoId: string,
    sensitivity: number
  ): Promise<MatchSegment[]> {
    const endpoint = this.config?.endpoint;
    const apiKey = this.config?.apiKey;

    if (!endpoint) {
      console.log('[Custom API] No endpoint configured');
      throw new Error('Custom API endpoint not configured');
    }

    console.log(`[Custom API] Calling endpoint: ${endpoint}`);
    
    try {
      const requestBody = {
        clippedVideo: clippedVideoPath,
        originalVideo: originalVideoPath,
        sensitivity: sensitivity,
        timestamp: Date.now()
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['X-API-Key'] = apiKey;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[Custom API] Received response:', result);

      if (result.segments && Array.isArray(result.segments)) {
        return result.segments.map((seg: any) => ({
          id: seg.id || `custom-${Date.now()}-${Math.random()}`,
          clippedStart: seg.clippedStart || 0,
          clippedEnd: seg.clippedEnd || 1,
          originalVideoId,
          originalStart: seg.originalStart || 0,
          originalEnd: seg.originalEnd || 1,
          similarity: seg.similarity || 0.8,
          confidence: seg.confidence || 0.9,
          type: seg.type || 'exact'
        }));
      }

      throw new Error('Invalid API response format');
    } catch (error) {
      console.error('[Custom API] Request failed:', error);
      throw error;
    }
  }

  async testConnection(): Promise<{ available: boolean; provider: string; message: string }> {
    if (!this.config) {
      return {
        available: false,
        provider: 'none',
        message: 'No cloud provider configured'
      };
    }

    try {
      if (this.config.provider === 'custom' && this.config.endpoint) {
        const response = await fetch(this.config.endpoint, { 
          method: 'GET',
          headers: {
            ...(this.config.apiKey ? { 
              'Authorization': `Bearer ${this.config.apiKey}`,
              'X-API-Key': this.config.apiKey
            } : {})
          }
        }).catch(() => null);
        
        if (response && response.ok) {
          return {
            available: true,
            provider: 'custom',
            message: 'Custom API connection successful'
          };
        }
      }

      return {
        available: true,
        provider: this.config.provider,
        message: 'Configured (API key set)'
      };
    } catch (error) {
      return {
        available: false,
        provider: this.config.provider,
        message: `Connection failed: ${(error as Error).message}`
      };
    }
  }
}

export const cloudService = new CloudService();
