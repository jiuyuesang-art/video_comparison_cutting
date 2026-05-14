import { Router, Request, Response } from 'express';
import { storageService } from '../services/storageService';
import { videoAnalysisService } from '../services/videoAnalysisService';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      clippedVideoId,
      originalVideoIds,
      aiMode,
      cloudProvider,
      sensitivity,
      gpuEnabled,
      fullRangeSearch
    } = req.body;

    if (!clippedVideoId || !originalVideoIds || originalVideoIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters: clippedVideoId or originalVideoIds'
      });
      return;
    }

    const validModes = ['local', 'cloud', 'clip'];
    const mode = validModes.includes(aiMode) ? aiMode : 'local';

    console.log(`[Analyze API] Starting analysis with mode: ${mode}`);

    const result = await videoAnalysisService.analyze({
      clippedVideoId,
      originalVideoIds,
      aiMode: mode,
      cloudProvider,
      sensitivity,
      gpuEnabled,
      fullRangeSearch
    });

    console.log(`[Analyze API] Analysis complete. Found ${result.segments.length} segments`);

    res.json({
      success: true,
      segments: result.segments,
      totalMatchDuration: result.totalMatchDuration,
      processingTime: result.processingTime
    });
  } catch (error) {
    console.error('[Analyze API] Error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

router.get('/clip-status', async (_req: Request, res: Response) => {
  try {
    const status = await videoAnalysisService.getCLIPStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('[Analyze API] CLIP status error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

router.post('/init-clip', async (req: Request, res: Response) => {
  try {
    const { gpuEnabled } = req.body;
    
    console.log('[Analyze API] Initializing CLIP model...');
    await videoAnalysisService.initializeCLIP(gpuEnabled);
    
    const status = await videoAnalysisService.getCLIPStatus();
    
    res.json({
      success: true,
      message: 'CLIP model initialized successfully',
      ...status
    });
  } catch (error) {
    console.error('[Analyze API] CLIP initialization error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export { router as analyzeController };
