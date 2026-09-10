import type { DecisionTimingAssessment } from '@/lib/analysis/decision-timing'
import type { FrozenGraphContext } from '@/lib/graph/research-context'
import type { ExecutiveInvestmentConclusion } from '@/lib/analysis/investment-conclusion'

/** Versioned, serializable boundary shared by collection, research, replay and UI. */
export const RESEARCH_VERSION = 1 as const
export type Bar = { date: string; open: number; high: number; low: number; close: number; volume: number; amount: number }
export type CalendarDay = { date: string; open: boolean }
export type Evidence = { id: string; source: string; dataDate: string | null; publishedAt: string | null; fetchedAt: string; unit?: string; hash: string }
export type SourceRecord = { id: string; datasetKey: string; targetCode: string; provider: string | null; payload: string; fetchedAt: string; contentHash: string }
export type Profile = {
  version: 1; industryId: string; name: string; benchmark: string; horizonDays: number;
  sectors: string[]; segments: Array<{ name: string; companies: string[] }>;
  leaders: Array<{ code: string; name: string; segment: string }>;
  historyReports?: { enabled: boolean; lookbackTradingDays: number; mode: 'latest-per-trading-day' };
  rules: { minHistory: number; maxPremiumPct: number; minDailyAmount: number; maxSpreadBps: number; maxVolatilityPct: number; flowDays: number; entryConfirmDays: number };
}
export type EventInput = { id: string; title: string; content: string; source: string; url?: string | null; publishedAt: string; fetchedAt: string; company?: string; segments?: string[]; kind: 'announcement' | 'news' }
export type ResearchEvent = {
  id: string; title: string; category: 'earnings' | 'demand' | 'policy' | 'risk' | 'administrative' | 'technology' | 'other';
  publishedAt: string; expiresAt: string; companies: string[]; segments: string[];
  evidenceIds: string[]; sources: string[]; urls: string[]; excerpt: string;
  selectionReason?: string;
  evidenceGrade?: 'A' | 'B' | 'C' | 'D';
  sourceTier?: 'primary' | 'corroborated' | 'secondary' | 'lead';
  independentSourceCount?: number;
  materialityScore?: number;
  status: 'evidence' | 'lead'; priority: number; verification: 'source-linked-not-independently-verified';
}
export type ETFInput = {
  ticker: string; name: string; bars: Bar[]; evidenceIds: string[];
  factors: Array<{ date: string; factor: number }>; adjustmentSource?: string;
  indexCode: string | null; indexName?: string; indexBars: Bar[];
  fieldStatus?: Record<string,{status:string;detail?:string;expectedAt?:string}>;
  navHistory?: Array<{date:string;nav:number}>;
  indexConstituents?: Array<{code:string;weight:number;date:string}>;
  holdings: Array<{ code: string; name: string; weight: number | null; period: string | null; publishedAt: string | null; observedAt?: string | null; source: string; evidenceId: string }>;
  product: { navSource?:string|null; navStatus?:string|null; navDetail?:string|null; publicationNotes?:string[]; date: string | null; nav: number | null; shares: number | null; previousShares: number | null; shareDate?:string|null; previousShareDate?:string|null; bookDate?:string|null; bookPublishedAt?:string|null; valuationDate?:string|null; valuationSource?:string|null; pePercentile5y?:number|null; pbPercentile5y?:number|null; pePercentileHistory?:number|null; pbPercentileHistory?:number|null; valuationHistoryStart?:string|null; valuationSampleCount?:number; spreadBps: number | null; feePct: number | null; pe: number | null; pb: number | null; evidenceIds: string[] };
}
export type ResearchSnapshot = {
  version: 1; id: string; asOf: string; capturedAt: string; profile: Profile; calendar: CalendarDay[]; evidence: Evidence[];
  etfs: ETFInput[]; benchmarkBars: Bar[]; sectorFlows: Array<{ date: string; sector: string; net: number; netPct: number | null; evidenceId: string }>;
  events: ResearchEvent[];
  historicalReports?: Array<{ reportId:string; industryId:string; industryName:string; sessionDate:string; createdAt:string; title:string; comprehensiveConclusion:ExecutiveInvestmentConclusion; role:'historical-comprehensive-conclusion' }>;
  companies: Array<{ code: string; name: string; stage?:string; stageCode?:string; segment: string; segmentCode?:string; pool: 'holding' | 'leader' | 'graph' | 'both'; financialPeriods: number; announcementCount: number; profitGrowthPct?:number|null; cashConversionPct?:number|null; financialGaps?:string[]; evidenceIds: string[]; representativeEtfs?:Array<{code:string;name:string;relevance:number;holdingVerified:boolean;holdingWeight?:number;reportPeriod?:string;source?:string}>; representativeIndices?:Array<{code:string;name:string;relevance:number;source?:string}>; matchSource?:string; matchConfidence?:number; representativenessScore?:number; selectionReason?:string }>;
  graphContext?: FrozenGraphContext;
  /** Frozen projections keep the existing report steps on exactly the same input. */
  projections: Record<string, Record<string, unknown>>;
  records?: Record<string, unknown>;
  decisionTiming?: DecisionTimingAssessment;
  workflow?: { runId: string; parentRunId: string | null; baselineSnapshotId: string | null };
}
export type Condition = { availability?:'failed'|'missing'|'stale'|'pending-publication'|'not-applicable'; detail?:string; key: string; label: string; value: number | string | null; operator: '>=' | '<=' | '='; threshold: number | string; status: 'met' | 'unmet' | 'unknown'; evidenceIds: string[] }
export type Decision = {
  ticker: string; name: string; indexCode: string | null; state: 'blocked' | 'watch' | 'eligible' | 'risk-off';
  unheldAction: '建仓' | '观望'; heldAction: '持有' | '减仓' | '观望';
  reason: string; trigger: string; invalidation: string; horizon: string; evidence: string[];
  /** Raw rule intent is retained for audit; user-facing actions stay non-executable until validation passes. */
  ruleAction?: { unheld: '建仓' | '观望'; held: '持有' | '减仓' | '观望' };
  conditions: Condition[]; gaps: string[]; evidenceIds: string[]; expiresAt: string; researchOnly: true;
  metrics: { date: string | null; ma20: number | null; ma60: number | null; return20Pct: number | null; return60Pct?:number|null; return120Pct?:number|null; relative20Pct: number | null; relative60Pct?:number|null; volatilityPct: number | null; downsideVolatilityPct?:number|null; maxDrawdown120Pct?:number|null; factorScore?:number|null; factorRegime?:'强势'|'改善'|'中性'|'承压'|'未知'; premiumPct: number | null; amount20: number | null; flowSum: number | null; flowNetPct: number | null; flowDays: number; adjusted: boolean; trackingErrorPct: number | null; disclosedWeightPct: number | null };
}
export type Evaluation = {
  version: 1; snapshotId: string; asOf: string; profile: Profile; expectedSession: string | null; calendarVerified: boolean;
  validation: 'experimental-not-backtest-validated' | 'walk-forward-validated'; decisions: Decision[];
  indexBreadth: { mappedIndices: number; usableIndices: number; aboveMA20: number; coverage: number };
  modules: Record<string, { status: 'available' | 'limited' | 'missing'; detail: string }>;
  events: ResearchEvent[]; changes: Array<{ ticker: string; from: string; to: string; reason: string; changedConditions: string[] }>;
  previousSnapshotId: string | null; evidence: Evidence[];
  evidenceTotal?: number; eventsTotal?: number;
  omittedConditions?: Array<{key:string;label:string;reason:string}>;
  workflow?: { runId: string; parentRunId: string | null; baselineSnapshotId: string | null };
  comparisonVersion?: number;
  productComparisons?: Array<{indexCode:string;comparisonDate:string|null;candidate:string|null;status:string;executionReady:boolean;reason:string;products:Array<{ticker:string;score:number;exclusions:string[]}>}>;
  indexOverlaps?: Array<{leftIndexCode:string;rightIndexCode:string;commonHoldings:number;weightedOverlapPct:number|null;periods:string[];basis:string}>;
  baselineReport?: {id:string;createdAt:string;title:string};
  products?: Array<{nav?:number|null;navSource?:string|null;navStatus?:string|null;navDetail?:string|null;ticker:string;indexCode:string|null;feePct:number|null;navDate:string|null;shareChangePct:number|null;trackingErrorPct:number|null;pe?:number|null;pb?:number|null;valuationDate?:string|null;valuationSource?:string|null;pePercentile5y?:number|null;pbPercentile5y?:number|null;pePercentileHistory?:number|null;pbPercentileHistory?:number|null;valuationHistoryStart?:string|null;valuationSampleCount?:number;top10WeightPct?:number|null;holdingsPeriod?:string|null;exposure:Array<{segment:string;weightPct:number|null}>;alternatives:string[]}>;
}
