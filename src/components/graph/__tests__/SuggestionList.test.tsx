import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SuggestionList } from '../SuggestionList'

const mockSuggestions = [
  {
    id: 's1',
    type: 'add_node',
    targetType: 'node',
    data: JSON.stringify({ name: 'Node1', type: 'chip_design' }),
    confidence: 0.95,
    source: 'ai_extraction',
    status: 'pending',
    createdAt: new Date().toISOString()
  },
  {
    id: 's2',
    type: 'add_edge',
    targetType: 'edge',
    data: JSON.stringify({ source: 'A', target: 'B', relation: 'supply_chain' }),
    confidence: 0.75,
    source: 'rule_inference',
    status: 'pending',
    createdAt: new Date().toISOString()
  }
]

describe('SuggestionList', () => {
  it('should render suggestions', () => {
    render(<SuggestionList suggestions={mockSuggestions} />)

    expect(screen.getByText('Node1')).toBeInTheDocument()
    expect(screen.getByText(/chip_design/)).toBeInTheDocument()
  })

  it('should filter by confidence', () => {
    render(<SuggestionList suggestions={mockSuggestions} />)

    const confidenceFilter = screen.getByLabelText('最低置信度')
    fireEvent.change(confidenceFilter, { target: { value: '0.8' } })

    expect(screen.getByText('Node1')).toBeInTheDocument()
    expect(screen.queryByText(/supply_chain/)).not.toBeInTheDocument()
  })

  it('should select suggestions', () => {
    const onSelectionChange = vi.fn()
    render(
      <SuggestionList
        suggestions={mockSuggestions}
        onSelectionChange={onSelectionChange}
      />
    )

    const checkbox = screen.getAllByRole('checkbox')[1] // First item checkbox (0 is select-all)
    fireEvent.click(checkbox)

    expect(onSelectionChange).toHaveBeenCalledWith(['s1'])
  })

  it('should select all', () => {
    const onSelectionChange = vi.fn()
    render(
      <SuggestionList
        suggestions={mockSuggestions}
        onSelectionChange={onSelectionChange}
      />
    )

    const selectAllCheckbox = screen.getByRole('checkbox', { name: /全选/ })
    fireEvent.click(selectAllCheckbox)

    expect(onSelectionChange).toHaveBeenCalledWith(['s1', 's2'])
  })
})
