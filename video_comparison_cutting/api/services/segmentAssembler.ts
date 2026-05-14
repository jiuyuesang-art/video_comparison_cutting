import type { MatchSegment } from '../../src/types';

export interface SegmentTimeline {
  start: number;
  end: number;
  type: 'matched' | 'gap';
  originalVideoId?: string;
  originalStart?: number;
  originalEnd?: number;
}

export class SegmentAssembler {
  static buildTimeline(
    duration: number,
    segments: MatchSegment[]
  ): SegmentTimeline[] {
    if (segments.length === 0) {
      return [{
        start: 0,
        end: duration,
        type: 'gap'
      }];
    }

    const sorted = [...segments].sort((a, b) => a.clippedStart - b.clippedStart);
    const timeline: SegmentTimeline[] = [];
    let currentTime = 0;

    for (const segment of sorted) {
      if (segment.clippedStart > currentTime) {
        timeline.push({
          start: currentTime,
          end: segment.clippedStart,
          type: 'gap'
        });
      }

      timeline.push({
        start: segment.clippedStart,
        end: segment.clippedEnd,
        type: 'matched',
        originalVideoId: segment.originalVideoId,
        originalStart: segment.originalStart,
        originalEnd: segment.originalEnd
      });

      currentTime = segment.clippedEnd;
    }

    if (currentTime < duration) {
      timeline.push({
        start: currentTime,
        end: duration,
        type: 'gap'
      });
    }

    return this.mergeAdjacentGaps(timeline);
  }

  private static mergeAdjacentGaps(timeline: SegmentTimeline[]): SegmentTimeline[] {
    if (timeline.length <= 1) return timeline;

    const merged: SegmentTimeline[] = [];
    let current = timeline[0];

    for (let i = 1; i < timeline.length; i++) {
      const next = timeline[i];
      
      if (current.type === 'gap' && next.type === 'gap') {
        current = {
          start: current.start,
          end: next.end,
          type: 'gap'
        };
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  static getSegmentsForVideo(
    segments: MatchSegment[],
    originalVideoId: string
  ): MatchSegment[] {
    return segments.filter(s => s.originalVideoId === originalVideoId);
  }

  static calculateTotalMatchDuration(segments: MatchSegment[]): number {
    return segments.reduce((total, segment) => {
      return total + (segment.clippedEnd - segment.clippedStart);
    }, 0);
  }

  static filterBySimilarity(
    segments: MatchSegment[],
    threshold: number
  ): MatchSegment[] {
    return segments.filter(s => s.similarity >= threshold);
  }

  static mergeOverlappingSegments(segments: MatchSegment[]): MatchSegment[] {
    if (segments.length <= 1) return segments;

    const sorted = [...segments].sort((a, b) => 
      a.clippedStart - b.clippedStart || a.originalVideoId.localeCompare(b.originalVideoId)
    );

    const merged: MatchSegment[] = [];
    let current = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      
      if (current.originalVideoId === next.originalVideoId &&
          current.clippedEnd >= next.clippedStart) {
        const newEnd = Math.max(current.clippedEnd, next.clippedEnd);
        const overlap = current.clippedEnd - next.clippedStart;
        
        current = {
          ...current,
          clippedEnd: newEnd,
          originalEnd: current.originalEnd + (next.originalEnd - next.originalStart) - overlap,
          similarity: Math.max(current.similarity, next.similarity)
        };
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    return merged;
  }
}
