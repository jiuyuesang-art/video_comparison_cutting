import { Router } from 'express';
import multer from 'multer';
import { uploadController } from '../controllers/uploadController';
import { analyzeController } from '../controllers/analyzeController';
import { exportController } from '../controllers/exportController';
import { aiConfigController } from '../controllers/aiConfigController';
import { storageService } from '../services/storageService';
import fs from 'fs';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

router.post('/upload', upload.single('file'), uploadController.upload);
router.get('/videos', uploadController.getAll);
router.get('/videos/:videoId', uploadController.getOne);
router.delete('/videos/:videoId', uploadController.delete);

router.get('/files/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await storageService.getVideo(videoId);
    
    if (!video) {
      return res.status(404).json({ success: false, error: '视频不存在' });
    }
    
    const ext = video.filePath.split('.').pop()?.toLowerCase() || 'mp4';
    
    const contentTypeMap: Record<string, string> = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      avi: 'video/avi',
      webm: 'video/webm',
      mkv: 'video/x-matroska'
    };
    
    res.setHeader('Content-Type', contentTypeMap[ext] || 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(video.fileName)}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    
    const fileStream = fs.createReadStream(video.filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: '文件读取失败' });
      }
    });
  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ success: false, error: '文件读取失败' });
  }
});

router.use('/analyze', analyzeController);

router.post('/export', exportController.exportVideo);
router.get('/exports/:fileName', exportController.download);

router.get('/ai/config', aiConfigController.getConfig);
router.post('/ai/config', aiConfigController.updateConfig);
router.post('/ai/config/cloud', aiConfigController.updateCloudConfig);
router.get('/ai/status', aiConfigController.getStatus);

export default router;
