/** Shared by prompt construction and validation; derived archive fields do not
 * count against the model's authored output budget. */
export const INVESTMENT_OUTPUT_CHARACTERS = 3200
export const RESEARCH_INPUT_CHARACTERS: Record<string, number> = {
  'market-analysis': 28_000, 'news-analysis': 30_000, 'company-analysis': 30_000,
  'industry-overview': 34_000, 'investment-advice': 38_000,
}
