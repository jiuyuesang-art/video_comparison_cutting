import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UPLOADS_DIR, EXPORTS_DIR } from '../app';
import ffmpeg from 'fluent-ffmpeg';

export interface StoredVideo {
  id: string;
  fileName: string;
  type: 'clipped' | 'original';
  index: number;
  duration: number;
  size: number;
  filePath: string;
  thumbnailPath?: string;
  customInfo?: string;
  uploadedAt: string;
}

class StorageService {
  private videos: Map<string, StoredVideo> = new Map();

  async initialize() {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      await fs.mkdir(EXPORTS_DIR, { recursive: true });
      console.log('Storage directories initialized');
    } catch (error) {
      console.error('Failed to initialize storage:', error);
    }
  }

  async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err: Error | null, metadata: any) => {
        if (err || !metadata?.format?.duration) {
          console.warn('Failed to get video duration, using default');
          resolve(60);
          return;
        }
        resolve(parseFloat(metadata.format.duration));
      });
    });
  }

  async saveVideo(
    file: Buffer,
    fileName: string,
    type: 'clipped' | 'original',
    index: number
  ): Promise<StoredVideo> {
    try {
      const id = uuidv4();
      const ext = path.extname(fileName);
      const savedFileName = `${id}${ext}`;
      const filePath = path.join(UPLOADS_DIR, savedFileName);

      let decodedFileName = fileName;
      try {
        if (fileName) {
          decodedFileName = decodeURIComponent(escape(fileName));
        }
      } catch {
      }

      await fs.writeFile(filePath, file);

      const stats = await fs.stat(filePath);
      const duration = await this.getVideoDuration(filePath);

      const video: StoredVideo = {
        id,
        fileName: decodedFileName,
        type,
        index,
        duration,
        size: stats.size,
        filePath,
        uploadedAt: new Date().toISOString(),
      };

      this.videos.set(id, video);
      return video;
    } catch (error) {
      console.error('Error saving video:', error);
      throw error;
    }
  }

  async getVideo(id: string): Promise<StoredVideo | undefined> {
    return this.videos.get(id);
  }

  async getAllVideos(): Promise<StoredVideo[]> {
    return Array.from(this.videos.values());
  }

  async updateVideo(id: string, updates: Partial<StoredVideo>): Promise<StoredVideo | undefined> {
    const video = this.videos.get(id);
    if (!video) return undefined;

    const updated = { ...video, ...updates };
    this.videos.set(id, updated);
    return updated;
  }

  async deleteVideo(id: string): Promise<boolean> {
    const video = this.videos.get(id);
    if (!video) return false;

    try {
      await fs.unlink(video.filePath);
      if (video.thumbnailPath) {
        await fs.unlink(video.thumbnailPath);
      }
    } catch (error) {
      console.error('Failed to delete video file:', error);
    }

    this.videos.delete(id);
    return true;
  }
}

export const storageService = new StorageService();
