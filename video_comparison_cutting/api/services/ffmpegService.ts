import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { promises as fs, existsSync } from 'fs';
import { EXPORTS_DIR } from '../app';
import type { MatchSegment } from '../../src/types';

const configureFFmpeg = () => {
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    const ffmpegPath = ffmpegInstaller.path;
    const ffprobePath = ffmpegInstaller.path.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
    
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    console.log('FFmpeg path:', ffmpegPath);
    console.log('FFprobe path:', ffprobePath);
  } catch (error) {
    console.warn('Warning: @ffmpeg-installer/ffmpeg not found, using system FFmpeg');
  }
};

configureFFmpeg();

export interface ExportOptions {
  clippedVideoPath: string;
  originalVideoPaths: { id: string; path: string }[];
  segments: MatchSegment[];
  outputFormat: 'mp4' | 'mov';
  includeAlpha: boolean;
  width?: number;
  height?: number;
  gpuEnabled?: boolean;
  gapFillThreshold?: number;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
}

interface TimelineSegment {
  type: 'match' | 'gap' | 'black';
  start: number;
  end: number;
  origStart?: number;
  origEnd?: number;
  speedRatio?: number;
}

class FFmpegService {
  async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.warn('ffprobe error, using default duration:', err.message);
          resolve(60);
          return;
        }
        const duration = metadata.format.duration || 60;
        resolve(duration);
      });
    });
  }

  async getVideoAspectRatio(videoPath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.warn('ffprobe error, defaulting aspect ratio to 16:9');
          resolve(16 / 9);
          return;
        }
        
        const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
        if (videoStream && videoStream.width && videoStream.height) {
          const aspectRatio = videoStream.width / videoStream.height;
          resolve(aspectRatio);
        } else {
          resolve(16 / 9);
        }
      });
    });
  }

  async exportComparisonVideo(options: ExportOptions): Promise<ExportResult> {
    try {
      const { 
        clippedVideoPath, 
        originalVideoPaths, 
        segments, 
        outputFormat,
        includeAlpha,
        gpuEnabled = false,
        gapFillThreshold = 5.0
      } = options;

      const OUTPUT_WIDTH = 2560;
      const OUTPUT_HEIGHT = 1440;
      const LEFT_AREA = { x: 85, y: 170, width: 1538, height: 865 };
      const RIGHT_AREA = { x: 1695, y: 170, width: 770, height: 433 };

      console.log('Export started with options:', {
        clippedVideoPath,
        originalVideoPaths,
        segmentsCount: segments.length,
        outputFormat,
        includeAlpha,
        gpuEnabled,
        gapFillThreshold,
        outputSize: `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
        leftArea: LEFT_AREA,
        rightArea: RIGHT_AREA
      });

      if (!existsSync(clippedVideoPath)) {
        return {
          success: false,
          error: `被剪辑视频文件不存在: ${clippedVideoPath}`
        };
      }

      for (const original of originalVideoPaths) {
        if (!existsSync(original.path)) {
          return {
            success: false,
            error: `原创视频文件不存在: ${original.path}`
          };
        }
      }

      const outputFileName = `comparison_${Date.now()}.${outputFormat}`;
      const outputPath = path.join(EXPORTS_DIR, outputFileName);

      if (!existsSync(EXPORTS_DIR)) {
        await fs.mkdir(EXPORTS_DIR, { recursive: true });
      }

      const clippedDuration = await this.getVideoDuration(clippedVideoPath);
      console.log('Clipped video duration:', clippedDuration);

      const original = originalVideoPaths[0];
      const videoSegments = segments.filter(s => s.originalVideoId === original.id);

      const timeline = this.buildTimeline(videoSegments, clippedDuration, gapFillThreshold);
      console.log('Timeline segments:', JSON.stringify(timeline, null, 2));

      const filterComplex = this.buildFilter(
        timeline, 
        clippedDuration, 
        includeAlpha,
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
        LEFT_AREA,
        RIGHT_AREA
      );
      console.log('FFmpeg filter complex:', filterComplex);

      const outputArgs: string[] = [
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', '0:a'
      ];

      if (outputFormat === 'mp4') {
        outputArgs.push('-c:v', 'libx264', '-crf', '16', '-preset', 'medium');
      } else {
        outputArgs.push('-c:v', 'libx264', '-crf', '16');
      }

      if (gpuEnabled) {
        console.log('[Export] GPU acceleration enabled');
        if (outputFormat === 'mp4') {
          outputArgs.push('-preset', 'fast');
        }
      }

      outputArgs.push('-c:a', 'aac', '-b:a', '192k');

      console.log('Running FFmpeg command...');

      await this.runFFmpegCommand([clippedVideoPath, original.path], outputPath, outputArgs, gpuEnabled);

      if (!existsSync(outputPath)) {
        return {
          success: false,
          error: '导出完成但文件未生成'
        };
      }

      console.log('Export successful:', outputPath);

      return {
        success: true,
        filePath: outputPath,
        fileName: outputFileName
      };
    } catch (error) {
      console.error('Export failed with error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '导出失败'
      };
    }
  }

  private buildTimeline(
    segments: MatchSegment[],
    totalDuration: number,
    maxGapFillDuration: number = 5.0
  ): TimelineSegment[] {
    const timeline: TimelineSegment[] = [];
    
    const sortedSegments = [...segments].sort((a, b) => a.clippedStart - b.clippedStart);
    
    let currentTime = 0;
    
    for (let i = 0; i < sortedSegments.length; i++) {
      const seg = sortedSegments[i];
      const gap = seg.clippedStart - currentTime;
      
      if (gap > 0) {
        if (gap <= maxGapFillDuration && i > 0) {
          const prevSeg = sortedSegments[i - 1];
          const gapOrigStart = prevSeg.originalEnd || 0;
          const gapOrigEnd = seg.originalStart || gapOrigStart;
          
          console.log(`[Timeline] Gap ${currentTime.toFixed(2)}-${seg.clippedStart.toFixed(2)}s: filling with original ${gapOrigStart.toFixed(2)}-${gapOrigEnd.toFixed(2)}s (threshold: ${maxGapFillDuration}s)`);
          
          timeline.push({ 
            type: 'gap', 
            start: currentTime, 
            end: seg.clippedStart,
            origStart: gapOrigStart,
            origEnd: gapOrigEnd
          });
        } else {
          console.log(`[Timeline] Gap ${currentTime.toFixed(2)}-${seg.clippedStart.toFixed(2)}s: black (${gap.toFixed(2)}s > ${maxGapFillDuration}s threshold)`);
          timeline.push({ 
            type: 'black', 
            start: currentTime, 
            end: seg.clippedStart
          });
        }
        currentTime = seg.clippedStart;
      }
      
      timeline.push({
        type: 'match',
        start: seg.clippedStart,
        end: seg.clippedEnd,
        origStart: seg.originalStart,
        origEnd: seg.originalEnd,
        speedRatio: seg.speedRatio
      });
      
      currentTime = seg.clippedEnd;
    }
    
    if (currentTime < totalDuration) {
      const lastGap = totalDuration - currentTime;
      if (lastGap <= maxGapFillDuration && sortedSegments.length > 0) {
        const lastSeg = sortedSegments[sortedSegments.length - 1];
        const gapOrigStart = lastSeg.originalEnd || 0;
        const gapOrigEnd = gapOrigStart + lastGap;
        
        console.log(`[Timeline] Final gap ${currentTime.toFixed(2)}-${totalDuration.toFixed(2)}s: filling with original ${gapOrigStart.toFixed(2)}-${gapOrigEnd.toFixed(2)}s`);
        
        timeline.push({ 
          type: 'gap', 
          start: currentTime, 
          end: totalDuration,
          origStart: gapOrigStart,
          origEnd: gapOrigEnd
        });
      } else {
        console.log(`[Timeline] Final gap ${currentTime.toFixed(2)}-${totalDuration.toFixed(2)}s: black`);
        timeline.push({ type: 'black', start: currentTime, end: totalDuration });
      }
    }
    
    return timeline;
  }

  private buildFilter(
    timeline: TimelineSegment[],
    totalDuration: number,
    includeAlpha: boolean,
    outputWidth: number,
    outputHeight: number,
    leftArea: { x: number; y: number; width: number; height: number },
    rightArea: { x: number; y: number; width: number; height: number }
  ): string {
    const filters: string[] = [];
    
    // Step 1: 创建黑色背景画布
    filters.push(
      `color=c=black:s=${outputWidth}x${outputHeight}:d=${totalDuration}[bg]`
    );
    
    // Step 2: 处理左侧视频 - 缩放并放置到正确位置（完整播放全程）
    // 简化：只使用 scale，不使用 pad，通过 overlay 居中
    filters.push(
      `[0:v]scale=${leftArea.width}:${leftArea.height}:force_original_aspect_ratio=decrease,setsar=1[left_scaled]`
    );
    
    // Step 3: 处理右侧视频 - 构建时间线并缩放
    // 先准备右侧视频的基础流（黑色）
    filters.push(
      `color=c=black:s=${rightArea.width}x${rightArea.height}:d=${totalDuration}[right_black]`
    );
    
    let currentRight = 'right_black';
    let segmentIdx = 0;
    let gapIdx = 0;
    
    for (const seg of timeline) {
      if (seg.type === 'match') {
        const origDuration = (seg.origEnd || 0) - (seg.origStart || 0);
        const origStart = seg.origStart || 0;
        const speedRatio = seg.speedRatio || 1.0;
        
        let extractFilter = `[1:v]trim=start=${origStart}:duration=${origDuration},setpts=PTS-STARTPTS`;
        
        if (Math.abs(speedRatio - 1.0) > 0.01) {
          const ptsFactor = 1 / speedRatio;
          extractFilter += `,setpts=${ptsFactor}*PTS`;
          console.log(`Speed adjustment for segment ${segmentIdx}: ${speedRatio}x`);
        }
        
        extractFilter += `,scale=${rightArea.width}:${rightArea.height}:force_original_aspect_ratio=decrease,setsar=1[seg${segmentIdx}]`;
        
        filters.push(extractFilter);
        
        filters.push(
          `[seg${segmentIdx}]setpts=PTS+${seg.start}/TB[seg_offset${segmentIdx}]`
        );
        
        filters.push(
          `[${currentRight}][seg_offset${segmentIdx}]overlay=x=0:y=0:enable='between(t,${seg.start},${seg.end})'[right_${segmentIdx}]`
        );
        
        currentRight = `right_${segmentIdx}`;
        segmentIdx++;
      } else if (seg.type === 'gap' && seg.origStart !== undefined && seg.origEnd !== undefined) {
        const gapDuration = seg.end - seg.start;
        const origGapDuration = seg.origEnd - seg.origStart;
        
        if (gapDuration > 0.1 && origGapDuration > 0.1) {
          let extractFilter = `[1:v]trim=start=${seg.origStart}:duration=${origGapDuration},setpts=PTS-STARTPTS`;
          
          extractFilter += `,scale=${rightArea.width}:${rightArea.height}:force_original_aspect_ratio=decrease,setsar=1[gap${gapIdx}]`;
          
          filters.push(extractFilter);
          
          filters.push(
            `[gap${gapIdx}]setpts=PTS+${seg.start}/TB[gap_offset${gapIdx}]`
          );
          
          filters.push(
            `[${currentRight}][gap_offset${gapIdx}]overlay=x=0:y=0:enable='between(t,${seg.start},${seg.end})'[right_gap${gapIdx}]`
          );
          
          currentRight = `right_gap${gapIdx}`;
          gapIdx++;
        }
      }
    }
    
    filters.push(`[${currentRight}]trim=0:${totalDuration},setpts=PTS-STARTPTS[right_final]`);
    
    // Step 4: 把左右两个视频叠加到背景上，计算居中位置
    // 计算 left 居中位置
    const leftX = leftArea.x;
    const leftY = leftArea.y;
    // 计算 right 居中位置
    const rightX = rightArea.x;
    const rightY = rightArea.y;
    
    filters.push(
      `[bg][left_scaled]overlay=x=${leftX}:y=${leftY}:eof_action=pass[bg_with_left]`
    );
    filters.push(
      `[bg_with_left][right_final]overlay=x=${rightX}:y=${rightY}:eof_action=pass[v]`
    );
    
    return filters.join(';');
  }

  private runFFmpegCommand(
    inputPaths: string[], 
    outputPath: string, 
    args: string[],
    gpuEnabled: boolean = false
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg();
      
      for (const input of inputPaths) {
        command = command.input(input);
      }

      if (gpuEnabled) {
        command = command.inputOptions(['-hwaccel', 'auto']);
      }

      console.log('FFmpeg command being executed...');
      
      command
        .output(outputPath)
        .outputOptions(args)
        .on('start', (cmdLine) => {
          console.log('FFmpeg started with command:', cmdLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Processing: ${Math.round(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          console.log('FFmpeg finished successfully');
          resolve();
        })
        .on('error', (err, stdout, stderr) => {
          console.error('FFmpeg error:', err.message);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .run();
    });
  }
}

export const ffmpegService = new FFmpegService();
