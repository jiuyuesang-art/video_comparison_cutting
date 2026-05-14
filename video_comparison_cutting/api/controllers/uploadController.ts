import { Request, Response } from 'express';
import { storageService } from '../services/storageService';

export const uploadController = {
  async upload(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: '没有上传文件'
        });
      }

      const type = req.body.type as 'clipped' | 'original';
      const index = parseInt(req.body.index) || 0;

      if (!['clipped', 'original'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: '无效的视频类型'
        });
      }

      const video = await storageService.saveVideo(
        req.file.buffer,
        req.file.originalname,
        type,
        index
      );

      res.json({
        success: true,
        video: video
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '上传失败'
      });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const { videoId } = req.params;
      
      const deleted = await storageService.deleteVideo(videoId);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: '视频不存在'
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '删除失败'
      });
    }
  },

  async getAll(req: Request, res: Response) {
    try {
      const videos = await storageService.getAllVideos();
      res.json({ success: true, videos });
    } catch (error) {
      console.error('Get all error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取列表失败'
      });
    }
  },

  async getOne(req: Request, res: Response) {
    try {
      const { videoId } = req.params;
      const video = await storageService.getVideo(videoId);

      if (!video) {
        return res.status(404).json({
          success: false,
          error: '视频不存在'
        });
      }

      res.json({ success: true, video });
    } catch (error) {
      console.error('Get one error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取视频失败'
      });
    }
  }
};
