import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import os from 'os';
import { promises as fs, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { pipeline, env } from '@xenova/transformers';

// 使用国内镜像加速下载
env.prefix = 'https://hf-mirror.com';
env.endpoint = 'https://hf-mirror.com';
process.env.HF_ENDPOINT = 'https://hf-mirror.com';
process.env.HF_HUB_OFFLINE = '0';

env.allowLocalModels = false;
env.useBrowserCache = false;

interface FrameEmbedding {
  timestamp: number;
  embedding: Float32Array;
}

interface MatchSegment {
  clippedStart: number;
  clippedEnd: number;
  originalStart: number;
  originalEnd: number;
  similarity: number;
  type: 'exact' | 'scaled' | 'cropped' | 'speed_adjusted' | 'none';
  confidence: number;
  speedRatio?: number;
}

interface CLIPConfig {
  modelName?: string;
  device?: 'cpu' | 'cuda';
  batchSize?: number;
  similarityThreshold?: number;
  minMatchDuration?: number;
  frameInterval?: number;
}

function getTempDir(): string {
  const tmpDir = os.tmpdir();
  const appTmpDir = path.join(tmpDir, 'video-clip-detection');
  if (!existsSync(appTmpDir)) {
    fs.mkdir(appTmpDir, { recursive: true }).catch(() => {});
  }
  return appTmpDir;
}

class CLIPService {
  private featureExtractor: any = null;
  private modelLoaded: boolean = false;
  private modelName: string = 'Xenova/clip-vit-base-patch32';
  private isInitializing: boolean = false;
  private initPromise: Promise<void> | null = null;

  async initialize(config?: CLIPConfig): Promise<void> {
    if (this.modelLoaded) {
      return;
    }

    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this.doInitialize(config);
    return this.initPromise;
  }

  private async doInitialize(config?: CLIPConfig): Promise<void> {
    try {
      if (config?.modelName) {
        this.modelName = config.modelName;
      }

      console.log(`[CLIP] Initializing model: ${this.modelName}`);
      console.log(`[CLIP] Using HuggingFace mirror: ${env.endpoint}`);
      console.log('[CLIP] This may take a few minutes on first run (model download required)...');

      this.featureExtractor = await pipeline(
        'image-feature-extraction',
        this.modelName,
        { 
          device: config?.device || 'cpu',
          progress_callback: (progress: any) => {
            if (progress.status === 'progress') {
              const file = progress.file || 'model';
              const percent = Math.round(progress.progress || 0);
              if (percent % 10 === 0) {
                console.log(`[CLIP] Downloading: ${file} - ${percent}%`);
              }
            }
          }
        }
      );

      this.modelLoaded = true;
      console.log('[CLIP] Model loaded successfully!');
    } catch (error) {
      console.error('[CLIP] Failed to initialize model:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async extractEmbedding(videoPath: string, timestamp: number): Promise<FrameEmbedding | null> {
    return new Promise((resolve) => {
      const tempDir = getTempDir();
      const tempPath = path.join(tempDir, `frame_${uuidv4()}.jpg`);
      
      if (!existsSync(videoPath)) {
        console.warn(`[CLIP] Video file not found: ${videoPath}`);
        resolve(null);
        return;
      }

      console.log(`[CLIP] Extracting frame at ${timestamp}s to ${tempPath}`);

      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .size('224x224')
        .output(tempPath)
        .outputOptions(['-q:v', '2'])
        .on('end', async () => {
          try {
            if (!existsSync(tempPath)) {
              console.warn(`[CLIP] Temp file was not created`);
              resolve(null);
              return;
            }
            
            const stats = await fs.stat(tempPath);
            if (stats.size < 100) {
              console.warn(`[CLIP] Extracted frame is too small: ${stats.size} bytes`);
              await fs.unlink(tempPath).catch(() => {});
              resolve(null);
              return;
            }

            console.log(`[CLIP] Processing frame from ${tempPath}`);
            
            let result;
            try {
              result = await this.featureExtractor(tempPath);
            } catch (e) {
              console.warn(`[CLIP] First attempt failed, trying with options...`);
              result = await this.featureExtractor(tempPath, {
                pooling: 'mean',
                normalize: true
              });
            }
            
            let embedding;
            if (result && result.data) {
              embedding = new Float32Array(result.data);
            } else if (result && ArrayBuffer.isView(result)) {
              embedding = new Float32Array(result as ArrayBuffer);
            } else if (result && typeof result === 'object') {
              const values = Object.values(result);
              if (values.length > 0 && ArrayBuffer.isView(values[0])) {
                embedding = new Float32Array(values[0] as ArrayBuffer);
              } else {
                embedding = new Float32Array(values as unknown as Iterable<number>);
              }
            } else {
              throw new Error(`Unexpected result type: ${typeof result}`);
            }
            
            await fs.unlink(tempPath).catch(() => {});
            
            resolve({
              timestamp,
              embedding
            });
          } catch (error) {
            console.warn(`[CLIP] Failed to extract embedding at ${timestamp}s:`, (error as Error).message);
            await fs.unlink(tempPath).catch(() => {});
            resolve(null);
          }
        })
        .on('error', (err) => {
          console.warn(`[CLIP] FFmpeg error at ${timestamp}s:`, err.message);
          resolve(null);
        })
        .run();
    });
  }

  async extractVideoEmbeddings(
    videoPath: string, 
    frameInterval: number = 1.0,
    onProgress?: (progress: number, message: string) => void
  ): Promise<FrameEmbedding[]> {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    const duration = await this.getVideoDuration(videoPath);
    console.log(`[CLIP] Video duration: ${duration}s, frame interval: ${frameInterval}s`);
    
    const embeddings: FrameEmbedding[] = [];
    
    const numFrames = Math.floor(duration / frameInterval);
    
    for (let i = 0; i < numFrames; i++) {
      const timestamp = i * frameInterval;
      
      if (onProgress) {
        const progress = Math.round((i / numFrames) * 100);
        onProgress(progress, `Extracting frame ${i + 1}/${numFrames} at ${timestamp.toFixed(1)}s`);
      }

      const embedding = await this.extractEmbedding(videoPath, timestamp);
      if (embedding) {
        embeddings.push(embedding);
      }
    }

    console.log(`[CLIP] Successfully extracted ${embeddings.length}/${numFrames} embeddings`);
    return embeddings;
  }

  private computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  async findMatchingSegments(
    clippedVideoPath: string,
    originalVideoPath: string,
    config: CLIPConfig = {},
    onProgress?: (stage: string, progress: number, message: string) => void
  ): Promise<MatchSegment[]> {
    const {
      similarityThreshold = 0.75,
      minMatchDuration = 1.0,
      frameInterval = 1.0
    } = config;

    if (!this.modelLoaded) {
      await this.initialize(config);
    }

    onProgress?.('extracting', 0, 'Extracting embeddings from clipped video...');
    
    const clippedEmbeddings = await this.extractVideoEmbeddings(
      clippedVideoPath, 
      frameInterval,
      (p, m) => onProgress?.('extracting', p * 0.5, `Clipped video: ${m}`)
    );

    onProgress?.('extracting', 50, 'Extracting embeddings from original video...');
    
    const originalEmbeddings = await this.extractVideoEmbeddings(
      originalVideoPath, 
      frameInterval,
      (p, m) => onProgress?.('extracting', 50 + p * 0.25, `Original video: ${m}`)
    );

    if (clippedEmbeddings.length === 0 || originalEmbeddings.length === 0) {
      console.warn('[CLIP] No embeddings extracted from videos');
      return [];
    }

    onProgress?.('matching', 75, 'Finding matching segments...');

    const matches = this.findMatchesWithSlidingWindow(
      clippedEmbeddings,
      originalEmbeddings,
      similarityThreshold,
      minMatchDuration,
      frameInterval
    );

    onProgress?.('complete', 100, `Found ${matches.length} matching segments`);

    return matches;
  }

  private findMatchesWithSlidingWindow(
    clippedEmbeddings: FrameEmbedding[],
    originalEmbeddings: FrameEmbedding[],
    threshold: number,
    minDuration: number,
    frameInterval: number
  ): MatchSegment[] {
    const matches: MatchSegment[] = [];
    const windowSize = Math.max(3, Math.floor(minDuration / frameInterval));

    let i = 0;
    while (i < clippedEmbeddings.length - windowSize) {
      let bestAvgSim = 0;
      let bestOrigStart = -1;
      let bestOrigEnd = -1;

      for (let j = 0; j < originalEmbeddings.length - windowSize; j++) {
        let windowSim = 0;
        let validCount = 0;

        for (let w = 0; w < windowSize; w++) {
          const clipIdx = i + w;
          const origIdx = j + w;

          if (clipIdx < clippedEmbeddings.length && origIdx < originalEmbeddings.length) {
            const sim = this.computeCosineSimilarity(
              clippedEmbeddings[clipIdx].embedding,
              originalEmbeddings[origIdx].embedding
            );
            
            if (sim > threshold * 0.6) {
              windowSim += sim;
              validCount++;
            }
          }
        }

        if (validCount >= windowSize * 0.5) {
          const avgSim = windowSim / validCount;
          if (avgSim > bestAvgSim) {
            bestAvgSim = avgSim;
            bestOrigStart = j;
            bestOrigEnd = j + windowSize - 1;
          }
        }
      }

      if (bestOrigStart >= 0 && bestAvgSim >= threshold * 0.7) {
        const clippedStartIdx = i;
        const clippedEndIdx = i + windowSize - 1;

        const clippedDuration = clippedEmbeddings[clippedEndIdx].timestamp - 
                               clippedEmbeddings[clippedStartIdx].timestamp;
        const origDuration = originalEmbeddings[bestOrigEnd].timestamp - 
                           originalEmbeddings[bestOrigStart].timestamp;

        let speedRatio = 1.0;
        if (origDuration > 0.1) {
          speedRatio = clippedDuration / origDuration;
          speedRatio = Math.max(0.5, Math.min(2.0, speedRatio));
        }

        const matchType: MatchSegment['type'] = 
          Math.abs(speedRatio - 1.0) > 0.15 ? 'speed_adjusted' : 
          bestAvgSim >= threshold ? 'exact' : 'none';

        if (matchType !== 'none') {
          matches.push({
            clippedStart: clippedEmbeddings[clippedStartIdx].timestamp,
            clippedEnd: clippedEmbeddings[clippedEndIdx].timestamp,
            originalStart: originalEmbeddings[bestOrigStart].timestamp,
            originalEnd: originalEmbeddings[bestOrigEnd].timestamp,
            similarity: bestAvgSim,
            type: matchType,
            confidence: bestAvgSim,
            speedRatio: Math.abs(speedRatio - 1.0) > 0.1 ? speedRatio : undefined
          });
        }

        i += windowSize;
      } else {
        i++;
      }
    }

    return this.mergeNearbyMatches(matches, clippedEmbeddings);
  }

  private mergeNearbyMatches(matches: MatchSegment[], embeddings: FrameEmbedding[]): MatchSegment[] {
    if (matches.length === 0) return [];

    const sorted = [...matches].sort((a, b) => a.clippedStart - b.clippedStart);
    const merged: MatchSegment[] = [];

    let current = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const gap = next.clippedStart - current.clippedEnd;
      const minGap = 0.5;

      if (gap < minGap) {
        current.clippedEnd = Math.max(current.clippedEnd, next.clippedEnd);
        current.originalEnd = Math.max(current.originalEnd, next.originalEnd);
        current.similarity = (current.similarity + next.similarity) / 2;
        current.confidence = (current.confidence + next.confidence) / 2;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    return merged;
  }

  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.warn('[CLIP] ffprobe error:', err.message);
          resolve(60);
          return;
        }
        const duration = metadata.format.duration || 60;
        console.log(`[CLIP] ffprobe duration: ${duration}s`);
        resolve(duration);
      });
    });
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  async getModelInfo(): Promise<{ modelName: string; loaded: boolean }> {
    return {
      modelName: this.modelName,
      loaded: this.modelLoaded
    };
  }
}

export const clipService = new CLIPService();
export type { CLIPConfig, MatchSegment };
