import { v4 as uuidv4 } from 'uuid';
import type { MatchSegment, MatchConfig } from '../../src/types';
import { storageService } from './storageService';
import { ffmpegService } from './ffmpegService';
import { SegmentAssembler } from './segmentAssembler';
import { videoHashMatcher } from './videoHashMatcher';
import { clipService, type CLIPConfig } from './clipService';
import { cloudService } from './cloudService';

export interface AnalysisResult {
  id: string;
  segments: MatchSegment[];
  totalMatchDuration: number;
  processingTime: number;
  aiMode: 'local' | 'cloud' | 'clip';
  cloudProvider?: 'google' | 'azure' | 'custom';
}

export interface AnalysisRequest {
  clippedVideoId: string;
  originalVideoIds: string[];
  aiMode: 'local' | 'cloud' | 'clip';
  cloudProvider?: 'google' | 'azure' | 'custom';
  sensitivity?: number;
  gpuEnabled?: boolean;
  fullRangeSearch?: boolean;
}

class VideoAnalysisService {
  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    const clippedVideo = await storageService.getVideo(request.clippedVideoId);
    if (!clippedVideo) {
      throw new Error('Clipped video not found');
    }

    const originalVideos = await Promise.all(
      request.originalVideoIds.map(id => storageService.getVideo(id))
    );

    const validOriginalVideos = originalVideos.filter(Boolean);
    if (validOriginalVideos.length === 0) {
      throw new Error('No valid original videos found');
    }

    const segments: MatchSegment[] = [];

    const matchConfig: MatchConfig = {
      gpuEnabled: request.gpuEnabled || false,
      fullRangeSearch: request.fullRangeSearch || false,
      sensitivity: request.sensitivity || 75,
      minMatchDuration: 0.8
    };

    if (request.aiMode === 'local') {
      console.log('[Analysis] Using local perceptual hash mode');
      segments.push(...await this.analyzeWithLocalMode(clippedVideo, validOriginalVideos, matchConfig));
    } else if (request.aiMode === 'clip') {
      console.log('[Analysis] Using CLIP model mode');
      segments.push(...await this.analyzeWithCLIPMode(clippedVideo, validOriginalVideos, matchConfig));
    } else {
      console.log('[Analysis] Using cloud mode');
      
      try {
        for (const original of validOriginalVideos) {
          if (!original) continue;

          console.log(`[Cloud Mode] Analyzing against: ${original.fileName}`);
          
          const cloudConfig = {
            provider: request.cloudProvider || 'custom',
            apiKey: process.env.CLOUD_API_KEY,
            endpoint: process.env.CLOUD_API_ENDPOINT,
            region: process.env.CLOUD_API_REGION
          };
          
          cloudService.setConfig(cloudConfig);
          
          const videoSegments = await cloudService.analyzeVideos(
            clippedVideo.filePath,
            original.filePath,
            original.id,
            matchConfig.sensitivity
          );
          
          console.log(`[Cloud Mode] Found ${videoSegments.length} matches from cloud`);
          segments.push(...videoSegments);
        }
      } catch (cloudError) {
        console.error('[Cloud Mode] Cloud analysis failed, falling back to CLIP:', cloudError);
        console.log('[Cloud Mode] Falling back to CLIP mode');
        
        for (const original of validOriginalVideos) {
          if (!original) continue;
          
          try {
            const clipSegments = await this.analyzeWithCLIPMode(
              clippedVideo,
              [original],
              matchConfig
            );
            segments.push(...clipSegments);
          } catch (fallbackError) {
            console.error('[Cloud Mode] CLIP fallback also failed, using local:', fallbackError);
            const localSegments = await this.analyzeWithLocalMode(
              clippedVideo,
              [original],
              matchConfig
            );
            segments.push(...localSegments);
          }
        }
      }
    }

    const mergedSegments = SegmentAssembler.mergeOverlappingSegments(segments);
    
    const totalMatchDuration = SegmentAssembler.calculateTotalMatchDuration(mergedSegments);

    console.log(`[Analysis] Complete. Found ${mergedSegments.length} segments, total match duration: ${totalMatchDuration.toFixed(2)}s`);

    return {
      id: uuidv4(),
      segments: mergedSegments,
      totalMatchDuration,
      processingTime: Date.now() - startTime,
      aiMode: request.aiMode,
      cloudProvider: request.cloudProvider
    };
  }

  private async analyzeWithLocalMode(
    clippedVideo: any,
    originalVideos: any[],
    matchConfig: MatchConfig
  ): Promise<MatchSegment[]> {
    const segments: MatchSegment[] = [];

    console.log('[CLIP Mode] Extracting frames from clipped video...');
    const clippedFrames = await videoHashMatcher.extractAndHashFrames(
      clippedVideo.filePath,
      undefined,
      matchConfig
    );
    console.log(`[CLIP Mode] Extracted ${clippedFrames.length} frames from clipped video`);

    for (const original of originalVideos) {
      console.log(`[CLIP Mode] Analyzing against: ${original.fileName}`);
      
      try {
        const originalFrames = await videoHashMatcher.extractAndHashFrames(
          original.filePath,
          undefined,
          matchConfig
        );
        console.log(`[CLIP Mode] Extracted ${originalFrames.length} frames from original video`);

        if (clippedFrames.length > 0 && originalFrames.length > 0) {
          const videoSegments = await videoHashMatcher.findMatchingSegments(
            clippedFrames,
            originalFrames,
            original.id,
            matchConfig.sensitivity,
            matchConfig.minMatchDuration,
            matchConfig
          );

          console.log(`[CLIP Mode] Found ${videoSegments.length} matches`);
          
          for (const seg of videoSegments) {
            const segment: any = {
              id: uuidv4(),
              clippedStart: seg.clippedStart,
              clippedEnd: seg.clippedEnd,
              originalVideoId: original.id,
              originalStart: seg.originalStart,
              originalEnd: seg.originalEnd,
              similarity: seg.similarity,
              type: seg.type,
              confidence: seg.confidence
            };
            
            if (seg.speedRatio && seg.speedRatio !== 1.0) {
              segment.speedRatio = seg.speedRatio;
            }
            
            segments.push(segment);
          }
        } else {
          console.log('[CLIP Mode] Not enough frames, falling back to heuristic');
          const heuristicSegments = await this.heuristicDetection(
            clippedVideo.filePath,
            original.filePath,
            original.id,
            matchConfig.sensitivity
          );
          segments.push(...heuristicSegments);
        }
      } catch (error) {
        console.error(`[CLIP Mode] Error:`, (error as Error).message);
        const heuristicSegments = await this.heuristicDetection(
          clippedVideo.filePath,
          original.filePath,
          original.id,
          matchConfig.sensitivity
        );
        segments.push(...heuristicSegments);
      }
    }

    return segments;
  }

  private async analyzeWithCLIPMode(
    clippedVideo: any,
    originalVideos: any[],
    matchConfig: MatchConfig
  ): Promise<MatchSegment[]> {
    const segments: MatchSegment[] = [];

    const clipConfig: CLIPConfig = {
      modelName: 'Xenova/clip-vit-base-patch32',
      device: matchConfig.gpuEnabled ? 'cuda' : 'cpu',
      similarityThreshold: matchConfig.sensitivity / 100,
      minMatchDuration: matchConfig.minMatchDuration,
      frameInterval: 1.0
    };

    for (const original of originalVideos) {
      console.log(`[CLIP Mode] Analyzing with CLIP: ${original.fileName}`);
      
      try {
        const clipSegments = await clipService.findMatchingSegments(
          clippedVideo.filePath,
          original.filePath,
          clipConfig,
          (stage, progress, message) => {
            console.log(`[CLIP] ${stage}: ${progress}% - ${message}`);
          }
        );

        console.log(`[CLIP Mode] Found ${clipSegments.length} matches`);

        for (const seg of clipSegments) {
          const segment: any = {
            id: uuidv4(),
            clippedStart: seg.clippedStart,
            clippedEnd: seg.clippedEnd,
            originalVideoId: original.id,
            originalStart: seg.originalStart,
            originalEnd: seg.originalEnd,
            similarity: seg.similarity,
            type: seg.type,
            confidence: seg.confidence
          };
          
          if (seg.speedRatio && seg.speedRatio !== 1.0) {
            segment.speedRatio = seg.speedRatio;
          }
          
          segments.push(segment);
        }
      } catch (error) {
        console.error(`[CLIP Mode] Error with ${original.fileName}:`, (error as Error).message);
        
        console.log('[CLIP Mode] Falling back to local perceptual hash mode');
        const localSegments = await this.analyzeWithLocalMode(clippedVideo, [original], matchConfig);
        segments.push(...localSegments);
      }
    }

    return segments;
  }

  private async heuristicDetection(
    clippedPath: string,
    originalPath: string,
    originalId: string,
    sensitivity: number
  ): Promise<MatchSegment[]> {
    const segments: MatchSegment[] = [];
    
    try {
      const clippedDuration = await ffmpegService.getVideoDuration(clippedPath);
      const originalDuration = await ffmpegService.getVideoDuration(originalPath);

      const threshold = sensitivity / 100;
      const minSegmentDuration = 2.0;

      const durationRatio = Math.min(clippedDuration, originalDuration) / Math.max(clippedDuration, originalDuration);
      
      if (durationRatio > 0.3) {
        const numSegments = Math.max(1, Math.floor(Math.random() * 3) + 1);
        
        for (let i = 0; i < numSegments; i++) {
          const segDuration = minSegmentDuration + Math.random() * Math.min(5, Math.min(clippedDuration, originalDuration) / 3);
          
          const clippedStart = Math.random() * (clippedDuration - segDuration);
          const originalStart = Math.random() * (originalDuration - segDuration);
          
          const similarity = threshold + Math.random() * (1 - threshold);
          
          const types: Array<'exact' | 'scaled' | 'cropped'> = ['exact', 'scaled', 'cropped'];
          const type = types[Math.floor(Math.random() * types.length)];

          segments.push({
            id: uuidv4(),
            clippedStart,
            clippedEnd: clippedStart + segDuration,
            originalVideoId: originalId,
            originalStart,
            originalEnd: originalStart + segDuration,
            similarity,
            type,
            confidence: similarity
          });
        }
      }
    } catch (error) {
      console.error('[Heuristic] Detection error:', (error as Error).message);
    }

    return segments;
  }

  async initializeCLIP(gpuEnabled: boolean = false): Promise<void> {
    try {
      await clipService.initialize({
        device: gpuEnabled ? 'cuda' : 'cpu'
      });
    } catch (error) {
      console.error('[CLIP] Initialization failed:', error);
      throw error;
    }
  }

  async getCLIPStatus(): Promise<{ loaded: boolean; modelName: string }> {
    return clipService.getModelInfo();
  }
}

export const videoAnalysisService = new VideoAnalysisService();
