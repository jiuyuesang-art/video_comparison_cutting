import { Request, Response } from 'express';
import path from 'path';
import { storageService } from '../services/storageService';
import { ffmpegService } from '../services/ffmpegService';
import { EXPORTS_DIR } from '../app';

export const exportController = {
  async exportVideo(req: Request, res: Response) {
    try {
      const {
        clippedVideoId,
        originalVideoIds,
        segments,
        outputFormat,
        includeAlpha,
        gpuEnabled,
        gapFillThreshold
      } = req.body;

      if (!clippedVideoId) {
        return res.status(400).json({
          success: false,
          error: '缺少被剪辑视频ID'
        });
      }

      const clippedVideo = await storageService.getVideo(clippedVideoId);
      if (!clippedVideo) {
        return res.status(404).json({
          success: false,
          error: '被剪辑视频不存在'
        });
      }

      const originalVideos: { id: string; path: string }[] = [];
      for (const originalId of originalVideoIds || []) {
        const video = await storageService.getVideo(originalId);
        if (video) {
          originalVideos.push({
            id: video.id,
            path: video.filePath
          });
        }
      }

      if (originalVideos.length === 0) {
        return res.status(400).json({
          success: false,
          error: '没有有效的原创视频'
        });
      }

      console.log(`[Export] GPU enabled: ${gpuEnabled}, Gap fill threshold: ${gapFillThreshold}s`);

      const result = await ffmpegService.exportComparisonVideo({
        clippedVideoPath: clippedVideo.filePath,
        originalVideoPaths: originalVideos,
        segments: segments || [],
        outputFormat: outputFormat || 'mp4',
        includeAlpha: includeAlpha ?? true,
        gpuEnabled: gpuEnabled ?? false,
        gapFillThreshold: gapFillThreshold ?? 5.0
      });

      if (!result.success || !result.filePath) {
        return res.status(500).json({
          success: false,
          error: result.error || '导出失败'
        });
      }

      const downloadUrl = `/exports/${path.basename(result.filePath)}`;

      res.json({
        success: true,
        downloadUrl,
        fileName: result.fileName
      });
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '导出失败'
      });
    }
  },

  async download(req: Request, res: Response) {
    try {
      const { fileName } = req.params;
      const filePath = path.join(EXPORTS_DIR, fileName);

      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Download error:', err);
          if (!res.headersSent) {
            res.status(404).json({
              success: false,
              error: '文件不存在'
            });
          }
        }
      });
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '下载失败'
      });
    }
  }
};
