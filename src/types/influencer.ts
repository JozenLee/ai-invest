export interface Influencer {
  id: string;
  name: string;
  platform: string;
  accountId: string;
  driverType: string;
  isActive: boolean;
  lastFetchAt?: string;
  lastFetchStatus?: string;
  createdAt: string;
}

export interface InfluencerPost {
  id: string;
  influencerId: string;
  content: string;
  originalUrl?: string;
  publishTime: string;
  mediaType: string;
  mediaUrls?: string[];
  engagement?: {
    likes: number;
    comments: number;
    shares: number;
  };
  aiProcessed: boolean;
  opinionSummary?: string;
  opinionStance?: string;
  sentiment?: number;
}

export interface DomainOpinions {
  domain: string;
  timeWindow: string;
  statistics: {
    totalOpinions: number;
    stanceDistribution: {
      bullish: number;
      neutral: number;
      bearish: number;
    };
    avgConfidence: number;
    avgSentiment: number;
    avgCredibility: number;
  };
  topOpinions: Array<{
    postId: string;
    influencerName: string;
    opinionSummary: string;
    stance: string;
    compositeScore: number;
    publishTime: string;
  }>;
  consensusPoints: Array<{
    theme: string;
    supportingCount: number;
    keywords: string[];
    avgConfidence: number;
  }>;
  timeline: Array<{
    date: string;
    bullishCount: number;
    neutralCount: number;
    bearishCount: number;
    avgSentiment: number;
  }>;
}
