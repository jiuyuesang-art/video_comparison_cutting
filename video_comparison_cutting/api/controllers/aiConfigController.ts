import { Request, Response } from 'express';
import { cloudService } from '../services/cloudService';

interface AIConfigState {
  mode: 'local' | 'cloud' | 'clip';
  cloudProvider?: 'google' | 'azure' | 'custom';
  sensitivity: number;
  local: {
    available: boolean;
    models: string[];
    currentModel: string;
    gpuEnabled: boolean;
  };
  cloud: {
    available: boolean;
    providers: Array<{
      name: string;
      configured: boolean;
      credits?: number;
    }>;
    config?: {
      apiKey?: string;
      endpoint?: string;
      region?: string;
    };
  };
}

let aiConfig: AIConfigState = {
  mode: 'local',
  sensitivity: 75,
  local: {
    available: true,
    models: ['perceptual_hash', 'feature_matching'],
    currentModel: 'perceptual_hash',
    gpuEnabled: false
  },
  cloud: {
    available: false,
    providers: [
      { name: 'google', configured: false },
      { name: 'azure', configured: false },
      { name: 'custom', configured: false }
    ]
  }
};

if (process.env.CLOUD_API_ENDPOINT) {
  const provider = (process.env.CLOUD_API_PROVIDER || 'custom') as 'google' | 'azure' | 'custom';
  aiConfig.cloud.available = true;
  aiConfig.cloud.providers.forEach(p => {
    if (p.name === provider) {
      p.configured = true;
    }
  });
  
  aiConfig.cloud.config = {
    apiKey: process.env.CLOUD_API_KEY,
    endpoint: process.env.CLOUD_API_ENDPOINT,
    region: process.env.CLOUD_API_REGION
  };
  
  cloudService.setConfig({
    provider,
    apiKey: process.env.CLOUD_API_KEY,
    endpoint: process.env.CLOUD_API_ENDPOINT,
    region: process.env.CLOUD_API_REGION
  });
}

export const aiConfigController = {
  async getConfig(req: Request, res: Response) {
    try {
      res.json({
        success: true,
        mode: aiConfig.mode,
        sensitivity: aiConfig.sensitivity,
        local: aiConfig.local,
        cloud: aiConfig.cloud,
        defaultMode: aiConfig.mode
      });
    } catch (error) {
      console.error('Get AI config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取配置失败'
      });
    }
  },

  async updateConfig(req: Request, res: Response) {
    try {
      const { mode, cloudProvider, sensitivity, localModel, gpuEnabled } = req.body;

      if (mode) {
        aiConfig.mode = mode;
      }

      if (cloudProvider) {
        aiConfig.cloudProvider = cloudProvider;
        aiConfig.cloud.providers.forEach(p => {
          p.configured = p.name === cloudProvider;
        });
      }

      if (sensitivity !== undefined) {
        aiConfig.sensitivity = Math.max(50, Math.min(100, sensitivity));
      }

      if (localModel) {
        aiConfig.local.currentModel = localModel;
      }

      if (gpuEnabled !== undefined) {
        aiConfig.local.gpuEnabled = gpuEnabled;
      }

      res.json({
        success: true,
        mode: aiConfig.mode,
        sensitivity: aiConfig.sensitivity,
        local: aiConfig.local,
        cloud: aiConfig.cloud
      });
    } catch (error) {
      console.error('Update AI config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '更新配置失败'
      });
    }
  },

  async updateCloudConfig(req: Request, res: Response) {
    try {
      const { provider, apiKey, endpoint, region } = req.body;
      
      if (!provider) {
        return res.status(400).json({
          success: false,
          error: 'Provider is required'
        });
      }

      aiConfig.cloudProvider = provider as any;
      aiConfig.cloud.config = {
        apiKey,
        endpoint,
        region
      };

      aiConfig.cloud.providers.forEach(p => {
        p.configured = p.name === provider;
      });

      if (provider === 'custom' && endpoint) {
        aiConfig.cloud.available = true;
      } else if ((provider === 'google' || provider === 'azure') && apiKey) {
        aiConfig.cloud.available = true;
      }

      cloudService.setConfig({
        provider: provider as any,
        apiKey,
        endpoint,
        region
      });

      const testResult = await cloudService.testConnection();

      res.json({
        success: true,
        cloud: aiConfig.cloud,
        cloudProvider: aiConfig.cloudProvider,
        test: testResult
      });
    } catch (error) {
      console.error('Update cloud config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '更新云端配置失败'
      });
    }
  },

  async getStatus(req: Request, res: Response) {
    try {
      const cloudTest = await cloudService.testConnection();
      
      res.json({
        success: true,
        local: {
          available: aiConfig.local.available,
          gpuEnabled: aiConfig.local.gpuEnabled,
          currentModel: aiConfig.local.currentModel
        },
        cloud: {
          available: cloudTest.available,
          configured: aiConfig.cloud.providers.some(p => p.configured),
          provider: cloudTest.provider,
          message: cloudTest.message
        }
      });
    } catch (error) {
      console.error('Get AI status error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取状态失败'
      });
    }
  }
};
