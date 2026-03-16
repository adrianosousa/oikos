/**
 * Mock Event Source — 5-minute simulated stream.
 *
 * Generates a realistic sequence of events for demo/testing:
 * Min 0-1: Low activity, quiet chat
 * Min 2: Viewer count crosses 100 → milestone
 * Min 3: Engagement spike, positive sentiment
 * Min 4: Large donation → excitement wave
 * Min 5: Agent should hit session limit → policy enforcement
 */

import type {
  EventSource,
  StreamEvent,
  ChatMessageData,
  ViewerCountData,
  DonationData,
  MilestoneData,
  EngagementData,
  StreamStatusData,
} from './types.js';

/** Pre-scripted event timeline */
interface TimelineEntry {
  /** Seconds from start when this batch fires */
  offsetSeconds: number;
  events: StreamEvent[];
}

function makeEvent(offsetSeconds: number, type: StreamEvent['type'], data: StreamEvent['data']): StreamEvent {
  const timestamp = new Date(Date.now() + offsetSeconds * 1000).toISOString();
  return {
    id: `mock-${offsetSeconds}-${type}`,
    timestamp,
    type,
    data,
  };
}

function buildTimeline(): TimelineEntry[] {
  return [
    // T+0s: Stream starts
    {
      offsetSeconds: 0,
      events: [
        makeEvent(0, 'stream_status', { type: 'stream_status', status: 'live' } as StreamStatusData),
        makeEvent(0, 'viewer_count', { type: 'viewer_count', count: 25, delta: 25 } as ViewerCountData),
      ],
    },

    // T+10s: Quiet chat
    {
      offsetSeconds: 10,
      events: [
        makeEvent(10, 'chat_message', { type: 'chat_message', username: 'alice', message: 'hey everyone!', sentiment: 'positive' } as ChatMessageData),
        makeEvent(10, 'viewer_count', { type: 'viewer_count', count: 35, delta: 10 } as ViewerCountData),
      ],
    },

    // T+20s: More chat
    {
      offsetSeconds: 20,
      events: [
        makeEvent(20, 'chat_message', { type: 'chat_message', username: 'bob', message: 'this content is great', sentiment: 'positive' } as ChatMessageData),
        makeEvent(20, 'viewer_count', { type: 'viewer_count', count: 55, delta: 20 } as ViewerCountData),
      ],
    },

    // T+30s: Growing audience
    {
      offsetSeconds: 30,
      events: [
        makeEvent(30, 'viewer_count', { type: 'viewer_count', count: 75, delta: 20 } as ViewerCountData),
        makeEvent(30, 'chat_message', { type: 'chat_message', username: 'charlie', message: 'just joined, what did I miss?', sentiment: 'neutral' } as ChatMessageData),
      ],
    },

    // T+45s: MILESTONE — 100 viewers
    {
      offsetSeconds: 45,
      events: [
        makeEvent(45, 'viewer_count', { type: 'viewer_count', count: 105, delta: 30 } as ViewerCountData),
        makeEvent(45, 'milestone', { type: 'milestone', name: '100_viewers', value: 105, threshold: 100 } as MilestoneData),
        makeEvent(45, 'chat_message', { type: 'chat_message', username: 'diana', message: '100 viewers lets gooo!', sentiment: 'positive' } as ChatMessageData),
      ],
    },

    // T+60s: Engagement spike
    {
      offsetSeconds: 60,
      events: [
        makeEvent(60, 'engagement_spike', { type: 'engagement_spike', chatRate: 45, previousChatRate: 15, multiplier: 3.0 } as EngagementData),
        makeEvent(60, 'chat_message', { type: 'chat_message', username: 'eve', message: 'this is amazing content!', sentiment: 'positive' } as ChatMessageData),
        makeEvent(60, 'chat_message', { type: 'chat_message', username: 'frank', message: 'best stream today', sentiment: 'positive' } as ChatMessageData),
      ],
    },

    // T+80s: Activity normalizes
    {
      offsetSeconds: 80,
      events: [
        makeEvent(80, 'viewer_count', { type: 'viewer_count', count: 85, delta: -20 } as ViewerCountData),
        makeEvent(80, 'chat_message', { type: 'chat_message', username: 'grace', message: 'gotta go, catch you later', sentiment: 'neutral' } as ChatMessageData),
      ],
    },

    // T+100s: Large donation
    {
      offsetSeconds: 100,
      events: [
        makeEvent(100, 'donation', { type: 'donation', username: 'whale_henry', amount: 50, currency: 'USD', message: 'Keep up the amazing work!' } as DonationData),
        makeEvent(100, 'chat_message', { type: 'chat_message', username: 'iris', message: 'omg huge donation!', sentiment: 'positive' } as ChatMessageData),
        makeEvent(100, 'engagement_spike', { type: 'engagement_spike', chatRate: 60, previousChatRate: 20, multiplier: 3.0 } as EngagementData),
      ],
    },

    // T+120s: Excitement continues
    {
      offsetSeconds: 120,
      events: [
        makeEvent(120, 'viewer_count', { type: 'viewer_count', count: 120, delta: 35 } as ViewerCountData),
        makeEvent(120, 'chat_message', { type: 'chat_message', username: 'jack', message: 'this creator deserves more support', sentiment: 'positive' } as ChatMessageData),
      ],
    },

    // T+150s: Stream ending (triggers session limit check)
    {
      offsetSeconds: 150,
      events: [
        makeEvent(150, 'stream_status', { type: 'stream_status', status: 'ending' } as StreamStatusData),
        makeEvent(150, 'chat_message', { type: 'chat_message', username: 'alice', message: 'great stream, thanks!', sentiment: 'positive' } as ChatMessageData),
        makeEvent(150, 'viewer_count', { type: 'viewer_count', count: 90, delta: -30 } as ViewerCountData),
      ],
    },

    // T+180s: Stream offline
    {
      offsetSeconds: 180,
      events: [
        makeEvent(180, 'stream_status', { type: 'stream_status', status: 'offline' } as StreamStatusData),
      ],
    },
  ];
}

export class MockEventSource implements EventSource {
  private timeline: TimelineEntry[];
  private timelineIndex = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private handler: ((events: StreamEvent[]) => void) | null = null;
  private startTime = 0;

  constructor() {
    this.timeline = buildTimeline();
  }

  onEvents(handler: (events: StreamEvent[]) => void): void {
    this.handler = handler;
  }

  start(): void {
    this.startTime = Date.now();
    this.timelineIndex = 0;
    this.scheduleNext();
    console.error('[events] Mock event source started (3-min simulated stream)');
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.error('[events] Mock event source stopped');
  }

  private scheduleNext(): void {
    const entry = this.timeline[this.timelineIndex];
    if (!entry) {
      console.error('[events] Mock timeline complete');
      return;
    }

    const elapsed = Date.now() - this.startTime;
    const targetMs = entry.offsetSeconds * 1000;
    const delay = Math.max(0, targetMs - elapsed);

    this.timer = setTimeout(() => {
      if (this.handler) {
        // Update timestamps to real time
        const events = entry.events.map(e => ({
          ...e,
          timestamp: new Date().toISOString(),
        }));
        this.handler(events);
      }

      this.timelineIndex++;
      this.scheduleNext();
    }, delay);
  }
}
