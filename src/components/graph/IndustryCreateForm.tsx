'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface IndustryCreateFormProps {
  onSubmit: (name: string, description?: string) => void
  isLoading: boolean
}

export function IndustryCreateForm({ onSubmit, isLoading }: IndustryCreateFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim(), description.trim() || undefined)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">产业名称 *</Label>
        <Input
          id="name"
          placeholder="例如：AI算力硬件、新能源汽车"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">描述（可选）</Label>
        <Textarea
          id="description"
          placeholder="简要描述产业范围和特点"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isLoading}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={isLoading || !name.trim()}>
        {isLoading ? '创建中...' : '开始探索'}
      </Button>
    </form>
  )
}
