import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IndustryGraphWorkspace } from '../IndustryGraphWorkspace'
import type { SwimLaneData } from '@/types/industry-graph'

const graphData: SwimLaneData = {
  industry: {
    id: 'industry-1',
    name: 'AI 硬件',
    code: 'ai-hardware',
    version: 2,
    revisionId: 'revision-12345678',
    nodeCount: 2,
    edgeCount: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  stages: [
    {
      id: 'upstream',
      name: '上游',
      code: 'upstream',
      order: 1,
      segments: [
        {
          id: 'chips',
          name: 'AI 芯片',
          code: 'chips',
          order: 1,
          companies: [{
            id: 'company-a',
            name: '企业 A',
            ticker: '000001',
            country: 'CN',
            marketPosition: 'leader',
          }],
          matchedEtfs: [{ code: '159001', name: '芯片 ETF', relevance: 0.9, reasoning: '覆盖核心环节' }],
        },
      ],
    },
    {
      id: 'midstream',
      name: '中游',
      code: 'midstream',
      order: 2,
      segments: [
        {
          id: 'servers',
          name: 'AI 服务器',
          code: 'servers',
          order: 1,
          companies: [],
          matchedIndices: [{ code: '930001', name: '算力指数', relevance: 0.8, reasoning: '覆盖服务器环节' }],
        },
      ],
    },
  ],
  relations: [{
    sourceId: 'chips',
    sourceCode: 'chips',
    sourceName: 'AI 芯片',
    targetId: 'servers',
    targetCode: 'servers',
    targetName: 'AI 服务器',
    type: 'SUPPLIES',
    direction: 'positive',
    weight: 0.8,
    confidence: 0.9,
    description: '供应链说明',
    sourceUrls: ['https://example.com/evidence'],
  }],
}

describe('IndustryGraphWorkspace', () => {
  it('renders graph hierarchy and investment context', () => {
    render(<IndustryGraphWorkspace data={graphData} />)

    expect(screen.getByRole('heading', { name: 'AI 硬件全景' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '上游' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '中游' })).toBeInTheDocument()
    expect(screen.getByText('企业 A')).toBeInTheDocument()
    expect(screen.getByText('芯片 ETF')).toBeInTheDocument()
  })

  it('switches to the evidence-backed relationship view', () => {
    render(<IndustryGraphWorkspace data={graphData} />)

    fireEvent.click(screen.getByRole('tab', { name: '关系脉络' }))

    expect(screen.getByText('供应链说明')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '证据 1' })).toHaveAttribute('href', 'https://example.com/evidence')
  })
})
