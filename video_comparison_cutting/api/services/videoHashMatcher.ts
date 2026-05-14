import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface FrameData {
  timestamp: number;
  histogram: Float32Array;
  contentHash: string;
  edgeMap: Float32Array;
}

interface MatchCandidate {
  clippedIdx: number;
  originalIdx: number;
  similarity: number;
}

interface MatchResult {
  clippedStart: number;
  clippedEnd: number;
  originalStart: number;
  originalEnd: number;
  similarity: number;
  type: 'exact' | 'scaled' | 'cropped' | 'speed_adjusted' | 'none';
  confidence: number;
  speedRatio?: number;
}

interface MatchConfig {
  gpuEnabled: boolean;
  fullRangeSearch: boolean;
  sensitivity: number;
  minMatchDuration: number;
}

export class VideoHashMatcher {
  private tempDir: string;
  private exportsDir: string;
  private similarityThreshold = 0.55;
  private minMatchDuration = 0.8;
  private frameInterval = 0.15;
  private cache: Map<string, Float32Array[]> = new Map();

  constructor() {
    this.exportsDir = path.join(process.cwd(), 'exports');
    this.tempDir = path.join(this.exportsDir, 'temp');
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async extractAndHashFrames(
    videoPath: string,
    frameInterval?: number,
    config?: MatchConfig
  ): Promise<FrameData[]> {
    const frames: FrameData[] = [];
    const duration = await this.getVideoDuration(videoPath);
    const interval = frameInterval || this.frameInterval;
    
    console.log(`[${config?.gpuEnabled ? 'GPU' : 'CPU'} Mode] Extracting frames...`);
    console.log(`Duration: ${duration.toFixed(2)}s, Interval: ${interval}s`);
    
    const numFrames = Math.floor(duration / interval);
    const maxFrames = config?.fullRangeSearch ? 500 : 250;
    
    for (let i = 0; i < Math.min(numFrames, maxFrames); i++) {
      const timestamp = i * interval;
      try {
        const frameData = await this.extractFrameData(videoPath, timestamp, config);
        if (frameData) {
          frames.push(frameData);
        }
      } catch (error) {
      }
    }

    console.log(`Extracted ${frames.length} frames`);
    return frames;
  }

  private async extractFrameData(
    videoPath: string,
    timestamp: number,
    config?: MatchConfig
  ): Promise<FrameData | null> {
    return new Promise((resolve) => {
      const tempFramePath = path.join(this.tempDir, `frame_${uuidv4()}.jpg`);
      
      const command = ffmpeg(videoPath)
        .seekInput(Math.max(0, timestamp - 0.05))
        .frames(1)
        .size('48x48')
        .output(tempFramePath)
        .outputOptions('-q:v', '3');

      if (config?.gpuEnabled) {
        command.addOutputOption('-hwaccel', 'auto');
      }
      
      command
        .on('end', async () => {
          try {
            const frameData = await this.analyzeFrame(tempFramePath, timestamp);
            try { await fs.unlink(tempFramePath); } catch {}
            resolve(frameData);
          } catch (error) {
            try { await fs.unlink(tempFramePath); } catch {}
            resolve(null);
          }
        })
        .on('error', () => resolve(null))
        .run();
    });
  }

  private async analyzeFrame(framePath: string, timestamp: number): Promise<FrameData | null> {
    try {
      const buffer = await fs.readFile(framePath);
      
      const histogram = this.computeColorHistogram(buffer);
      const contentHash = this.computeContentHash(buffer);
      const edgeMap = this.computeEdgeMap(buffer);
      
      return {
        timestamp,
        histogram,
        contentHash,
        edgeMap
      };
    } catch (error) {
      return null;
    }
  }

  private computeColorHistogram(buffer: Buffer): Float32Array {
    const histogram = new Float32Array(64);
    let offset = 0;
    
    if (buffer.length > 24 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      offset = 2;
    }
    
    const step = Math.max(1, Math.floor((buffer.length - offset) / 6000));
    let pixelCount = 0;
    
    for (let i = offset; i < buffer.length - 2; i += step) {
      const r = buffer[i];
      const g = buffer[i + 1];
      const b = buffer[i + 2];
      
      const binIndex = ((r >> 5) << 2) | ((g >> 5) << 1) | (b >> 5);
      if (binIndex >= 0 && binIndex < 64) {
        histogram[binIndex] += 1;
        pixelCount++;
      }
    }
    
    if (pixelCount > 0) {
      const maxVal = Math.max(...histogram);
      for (let i = 0; i < histogram.length; i++) {
        histogram[i] = histogram[i] / maxVal;
      }
    }
    
    return histogram;
  }

  private computeContentHash(buffer: Buffer): string {
    let hash = 0;
    const sampleSize = Math.min(buffer.length, 256);
    const step = Math.floor(buffer.length / sampleSize) || 1;
    
    for (let i = 0; i < sampleSize; i++) {
      const idx = (i * step) % buffer.length;
      const byte = buffer[idx];
      hash = ((hash << 5) - hash + byte) | 0;
    }
    
    return hash.toString(16);
  }

  private computeEdgeMap(buffer: Buffer): Float32Array {
    const edgeMap = new Float32Array(128);
    const sampleSize = 128;
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));
    
    let prev = buffer[0] || 0;
    for (let i = 0; i < sampleSize && i * step < buffer.length; i++) {
      const current = buffer[i * step];
      edgeMap[i] = Math.abs(current - prev) / 255;
      prev = current;
    }
    
    return edgeMap;
  }

  private computeHistogramSimilarity(hist1: Float32Array, hist2: Float32Array): number {
    let sum = 0;
    let sum1 = 0;
    let sum2 = 0;
    
    for (let i = 0; i < hist1.length; i++) {
      sum += hist1[i] * hist2[i];
      sum1 += hist1[i] * hist1[i];
      sum2 += hist2[i] * hist2[i];
    }
    
    const denominator = Math.sqrt(sum1 * sum2);
    return denominator > 0 ? sum / denominator : 0;
  }

  private computeContentSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0;
    
    let diff = 0;
    const maxLen = Math.max(hash1.length, hash2.length);
    
    for (let i = 0; i < maxLen; i++) {
      const c1 = parseInt(hash1[i] || '0', 16);
      const c2 = parseInt(hash2[i] || '0', 16);
      diff += Math.abs(c1 - c2);
    }
    
    return Math.max(0, 1 - diff / (maxLen * 15));
  }

  private computeEdgeSimilarity(edge1: Float32Array, edge2: Float32Array): number {
    let totalDiff = 0;
    const len = edge1.length;
    
    for (let i = 0; i < len; i++) {
      const max = Math.max(edge1[i], edge2[i], 0.001);
      totalDiff += Math.abs(edge1[i] - edge2[i]) / max;
    }
    
    return Math.max(0, 1 - totalDiff / len);
  }

  private computeFrameSimilarity(frame1: FrameData, frame2: FrameData): number {
    const histSim = this.computeHistogramSimilarity(frame1.histogram, frame2.histogram);
    const contentSim = this.computeContentSimilarity(frame1.contentHash, frame2.contentHash);
    const edgeSim = this.computeEdgeSimilarity(frame1.edgeMap, frame2.edgeMap);
    
    return (0.45 * histSim) + (0.35 * contentSim) + (0.2 * edgeSim);
  }

  private computeAllSimilarities(clippedFrames: FrameData[], originalFrames: FrameData[]): Float32Array {
    const rows = clippedFrames.length;
    const cols = originalFrames.length;
    const simMatrix = new Float32Array(rows * cols);
    
    console.log(`Computing ${rows * cols} similarity pairs...`);
    
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        simMatrix[i * cols + j] = this.computeFrameSimilarity(clippedFrames[i], originalFrames[j]);
      }
      
      if (i % 50 === 0) {
        console.log(`Progress: ${Math.round((i / rows) * 100)}%`);
      }
    }
    
    return simMatrix;
  }

  private findMatchesInFullRange(
    clippedFrames: FrameData[],
    originalFrames: FrameData[],
    threshold: number,
    config: MatchConfig
  ): MatchResult[] {
    console.log(`[Full Range Search] Finding matches...`);
    
    const simMatrix = this.computeAllSimilarities(clippedFrames, originalFrames);
    const matches: MatchResult[] = [];
    const windowSize = Math.max(8, Math.floor(this.minMatchDuration / this.frameInterval));
    const cols = originalFrames.length;
    
    let i = 0;
    while (i < clippedFrames.length - windowSize) {
      let bestAvgSim = 0;
      let bestOrigStart = -1;
      let bestOrigEnd = -1;
      
      for (let j = 0; j < originalFrames.length - windowSize; j++) {
        let windowSim = 0;
        let validCount = 0;
        
        for (let w = 0; w < windowSize; w++) {
          const sim = simMatrix[(i + w) * cols + (j + w)];
          if (sim > threshold * 0.5) {
            windowSim += sim;
            validCount++;
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
        
        let clippedDuration = clippedFrames[clippedEndIdx].timestamp - clippedFrames[clippedStartIdx].timestamp;
        let origDuration = originalFrames[bestOrigEnd].timestamp - originalFrames[bestOrigStart].timestamp;
        
        let speedRatio = 1.0;
        if (origDuration > 0.1) {
          speedRatio = clippedDuration / origDuration;
          speedRatio = Math.max(0.4, Math.min(2.5, speedRatio));
        }
        
        const matchType: MatchResult['type'] = 
          Math.abs(speedRatio - 1.0) > 0.15 ? 'speed_adjusted' : 
          bestAvgSim >= threshold ? 'exact' : 'none';
        
        if (matchType !== 'none') {
          matches.push({
            clippedStart: clippedFrames[clippedStartIdx].timestamp,
            clippedEnd: clippedFrames[clippedEndIdx].timestamp,
            originalStart: originalFrames[bestOrigStart].timestamp,
            originalEnd: originalFrames[bestOrigEnd].timestamp,
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
    
    return this.refineMatches(matches, clippedFrames, originalFrames, threshold);
  }

  private findBestMatchForFrame(
    clippedFrame: FrameData,
    originalFrames: FrameData[],
    searchRange: number
  ): { idx: number; similarity: number } {
    let bestIdx = -1;
    let bestSim = 0;
    
    const start = Math.max(0, searchRange);
    const end = originalFrames.length;
    
    for (let j = start; j < end; j++) {
      const sim = this.computeFrameSimilarity(clippedFrame, originalFrames[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }
    
    return { idx: bestIdx, similarity: bestSim };
  }

  private findMatchesUsingSlidingWindow(
    clippedFrames: FrameData[],
    originalFrames: FrameData[],
    threshold: number,
    config: MatchConfig
  ): MatchResult[] {
    console.log(`[Sliding Window] Finding matches...`);
    
    const matches: MatchResult[] = [];
    const windowSize = Math.max(8, Math.floor(this.minMatchDuration / this.frameInterval));
    
    let i = 0;
    while (i < clippedFrames.length - windowSize) {
      const segmentMatches: { clippedIdx: number; origIdx: number; sim: number }[] = [];
      
      for (let w = 0; w < windowSize; w++) {
        if (i + w >= clippedFrames.length) break;
        
        const { idx, similarity } = this.findBestMatchForFrame(
          clippedFrames[i + w],
          originalFrames,
          0
        );
        
        if (idx >= 0 && similarity > threshold * 0.6) {
          segmentMatches.push({ clippedIdx: i + w, origIdx: idx, sim: similarity });
        }
      }
      
      if (segmentMatches.length >= windowSize * 0.5) {
        const avgSim = segmentMatches.reduce((sum, m) => sum + m.sim, 0) / segmentMatches.length;
        
        if (avgSim >= threshold * 0.7) {
          const clippedStartIdx = Math.min(...segmentMatches.map(m => m.clippedIdx));
          const clippedEndIdx = Math.max(...segmentMatches.map(m => m.clippedIdx));
          const origStartIdx = Math.min(...segmentMatches.map(m => m.origIdx));
          const origEndIdx = Math.max(...segmentMatches.map(m => m.origIdx));
          
          const clippedDuration = clippedFrames[clippedEndIdx].timestamp - clippedFrames[clippedStartIdx].timestamp;
          const origDuration = originalFrames[origEndIdx].timestamp - originalFrames[origStartIdx].timestamp;
          
          let speedRatio = 1.0;
          if (origDuration > 0.1) {
            speedRatio = clippedDuration / origDuration;
            speedRatio = Math.max(0.4, Math.min(2.5, speedRatio));
          }
          
          const matchType: MatchResult['type'] = 
            Math.abs(speedRatio - 1.0) > 0.15 ? 'speed_adjusted' : 
            avgSim >= threshold ? 'exact' : 'none';
          
          if (matchType !== 'none') {
            matches.push({
              clippedStart: clippedFrames[clippedStartIdx].timestamp,
              clippedEnd: clippedFrames[clippedEndIdx].timestamp,
              originalStart: originalFrames[origStartIdx].timestamp,
              originalEnd: originalFrames[origEndIdx].timestamp,
              similarity: avgSim,
              type: matchType,
              confidence: avgSim,
              speedRatio: Math.abs(speedRatio - 1.0) > 0.1 ? speedRatio : undefined
            });
          }
          
          i += windowSize;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    
    return this.refineMatches(matches, clippedFrames, originalFrames, threshold);
  }

  private refineMatches(
    matches: MatchResult[],
    clippedFrames: FrameData[],
    originalFrames: FrameData[],
    threshold: number
  ): MatchResult[] {
    if (matches.length === 0) return [];
    
    const refined: MatchResult[] = [];
    
    for (const match of matches) {
      const clippedStartIdx = this.findFrameIndex(clippedFrames, match.clippedStart);
      const clippedEndIdx = this.findFrameIndex(clippedFrames, match.clippedEnd);
      const origStartIdx = this.findFrameIndex(originalFrames, match.originalStart);
      const origEndIdx = this.findFrameIndex(originalFrames, match.originalEnd);
      
      if (clippedStartIdx < 0 || clippedEndIdx < 0 || origStartIdx < 0 || origEndIdx < 0) {
        continue;
      }
      
      let totalSim = 0;
      let count = 0;
      let validOrigStart = origStartIdx;
      let validOrigEnd = origEndIdx;
      
      for (let ci = clippedStartIdx; ci <= clippedEndIdx; ci++) {
        const { idx, similarity } = this.findBestMatchForFrame(
          clippedFrames[ci],
          originalFrames,
          0
        );
        
        if (idx >= 0 && similarity > threshold * 0.5) {
          totalSim += similarity;
          count++;
          validOrigStart = Math.min(validOrigStart, idx);
          validOrigEnd = Math.max(validOrigEnd, idx);
        }
      }
      
      if (count >= (clippedEndIdx - clippedStartIdx) * 0.4) {
        const finalSim = totalSim / count;
        
        refined.push({
          clippedStart: match.clippedStart,
          clippedEnd: match.clippedEnd,
          originalStart: originalFrames[validOrigStart].timestamp,
          originalEnd: originalFrames[validOrigEnd].timestamp,
          similarity: finalSim,
          type: match.type,
          confidence: finalSim,
          speedRatio: match.speedRatio
        });
      }
    }
    
    return this.mergeOverlappingMatches(refined);
  }

  private mergeOverlappingMatches(matches: MatchResult[]): MatchResult[] {
    if (matches.length === 0) return [];
    
    const sorted = [...matches].sort((a, b) => a.clippedStart - b.clippedStart);
    const merged: MatchResult[] = [];
    
    let current = { ...sorted[0] };
    
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const gap = next.clippedStart - current.clippedEnd;
      
      if (gap < this.minMatchDuration * 0.3) {
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
    
    return merged.filter(m => 
      m.clippedEnd - m.clippedStart >= this.minMatchDuration * 0.5
    );
  }

  private findFrameIndex(frames: FrameData[], timestamp: number): number {
    for (let i = 0; i < frames.length; i++) {
      if (Math.abs(frames[i].timestamp - timestamp) < this.frameInterval * 0.5) {
        return i;
      }
    }
    return -1;
  }

  async findMatchingSegments(
    clippedFrames: FrameData[],
    originalFrames: FrameData[],
    originalVideoId: string,
    sensitivity: number,
    minMatchDuration: number = 1.0,
    config?: MatchConfig
  ): Promise<Array<{
    clippedStart: number;
    clippedEnd: number;
    originalStart: number;
    originalEnd: number;
    similarity: number;
    type: 'exact' | 'scaled' | 'cropped' | 'speed_adjusted' | 'none';
    confidence: number;
    speedRatio?: number;
  }>> {
    this.minMatchDuration = minMatchDuration;
    this.similarityThreshold = sensitivity / 100;
    
    const startTime = Date.now();
    const matchConfig = config || { 
      gpuEnabled: false, 
      fullRangeSearch: false, 
      sensitivity, 
      minMatchDuration 
    };
    
    console.log(`Starting matching process...`);
    console.log(`Mode: ${matchConfig.fullRangeSearch ? 'Full Range' : 'Sliding Window'}`);
    console.log(`GPU: ${matchConfig.gpuEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`Clipped frames: ${clippedFrames.length}, Original frames: ${originalFrames.length}`);
    console.log(`Threshold: ${this.similarityThreshold.toFixed(2)}, Min duration: ${this.minMatchDuration}s`);
    
    if (clippedFrames.length < 5 || originalFrames.length < 5) {
      console.log('Not enough frames to match');
      return [];
    }
    
    let matches: MatchResult[];
    if (matchConfig.fullRangeSearch) {
      matches = this.findMatchesInFullRange(
        clippedFrames,
        originalFrames,
        this.similarityThreshold,
        matchConfig
      );
    } else {
      matches = this.findMatchesUsingSlidingWindow(
        clippedFrames,
        originalFrames,
        this.similarityThreshold,
        matchConfig
      );
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`Found ${matches.length} matches in ${elapsed.toFixed(2)}s`);
    
    return matches.map(m => ({
      clippedStart: m.clippedStart,
      clippedEnd: m.clippedEnd,
      originalStart: m.originalStart,
      originalEnd: m.originalEnd,
      similarity: m.similarity,
      type: m.type,
      confidence: m.confidence,
      speedRatio: m.speedRatio
    }));
  }

  async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          resolve(60);
          return;
        }
        const duration = metadata.format.duration || 60;
        resolve(duration);
      });
    });
  }
}

export const videoHashMatcher = new VideoHashMatcher();
