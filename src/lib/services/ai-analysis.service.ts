/**
 * AI 分析服务
 * 统一封装所有 AI 调用，代理到 Python 后端
 */

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

export interface EventAnalysisRequest {
  title: string;
  content: string;
  source: string;
  publishTime: string;
}

export interface SentimentResult {
  score: number;
  confidence: number;
  label: string;
}

export interface AffectedSector {
  sector: string;
  direction: 'positive' | 'negative';
  weight: number;
}

export interface ImpactResult {
  timeHorizon: string;
  magnitude: number;
  affectedSectors: AffectedSector[];
  reasoning: string;
}

export interface EntitiesResult {
  companies: string[];
  sectors: string[];
  products: string[];
  people: string[];
}

export interface EventAnalysisResponse {
  category: string;
  sentiment: SentimentResult;
  impact: ImpactResult;
  entities: EntitiesResult;
  summary: string;
}

export interface BatchAnalysisRequest {
  events: EventAnalysisRequest[];
}

export interface InvestmentIdeasRequest {
  content: string;
  author?: string;
}

export class AIAnalysisService {
  /**
   * 检查 AI 服务健康状态
   */
  static async checkHealth(): Promise<{
    status: string;
    api_key_configured: boolean;
    model: string;
    timestamp: string;
  }> {
    try {
      const response = await fetch(`${PYTHON_API_URL}/api/ai/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('AI health check failed:', error);
      throw error;
    }
  }

  /**
   * 分析单篇新闻事件
   */
  static async analyzeEvent(
    request: EventAnalysisRequest
  ): Promise<EventAnalysisResponse> {
    try {
      const response = await fetch(`${PYTHON_API_URL}/api/ai/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'AI analysis failed');
      }

      return await response.json();
    } catch (error) {
      console.error('AI event analysis failed:', error);
      throw error;
    }
  }

  /**
   * 批量分析多篇新闻事件
   */
  static async analyzeBatch(request: BatchAnalysisRequest): Promise<{
    success: boolean;
    total: number;
    succeeded: number;
    failed: number;
    results: any[];
    errors: any[];
  }> {
    try {
      const response = await fetch(`${PYTHON_API_URL}/api/ai/analyze-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Batch analysis failed');
      }

      return await response.json();
    } catch (error) {
      console.error('AI batch analysis failed:', error);
      throw error;
    }
  }

  /**
   * 从大V内容中提取投资理念
   */
  static async extractInvestmentIdeas(request: InvestmentIdeasRequest): Promise<{
    success: boolean;
    data: {
      mainThesis: string;
      keyPoints: string[];
      sectors: string[];
      timeHorizon: string;
      riskLevel: string;
      actionable: boolean;
      confidence: number;
    };
  }> {
    try {
      const response = await fetch(`${PYTHON_API_URL}/api/ai/investment-ideas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Investment ideas extraction failed');
      }

      return await response.json();
    } catch (error) {
      console.error('AI investment ideas extraction failed:', error);
      throw error;
    }
  }
}

// 导出单例方法
export const aiAnalysisService = AIAnalysisService;
