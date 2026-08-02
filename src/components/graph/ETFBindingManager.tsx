'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Trash2, TrendingUp, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

interface ETFBinding {
  id: string
  etfCode: string
  etfName?: string
  weight?: number
  relevance?: number
  isActive: boolean
  createdAt: string
}

interface ETFBindingManagerProps {
  nodeId: string
  nodeName: string
}

export function ETFBindingManager({ nodeId, nodeName }: ETFBindingManagerProps) {
  const [bindings, setBindings] = useState<ETFBinding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    etfCode: '',
    etfName: '',
    weight: 1,
    relevance: 1,
  })

  const fetchBindings = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/graph/nodes/${nodeId}/etfs`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setBindings(data.data)
        }
      }
    } catch (error) {
      console.error('获取ETF绑定失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchBindings()
  }, [nodeId])

  const handleCreate = () => {
    setFormData({
      etfCode: '',
      etfName: '',
      weight: 1,
      relevance: 1,
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.etfCode.trim()) {
      toast.error('请输入ETF代码')
      return
    }

    try {
      const response = await fetch(`/api/graph/nodes/${nodeId}/etfs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success('ETF绑定创建成功')
        setIsDialogOpen(false)
        fetchBindings()
      } else {
        toast.error(data.error || '创建失败')
      }
    } catch (error) {
      console.error('创建ETF绑定失败:', error)
      toast.error('创建失败')
    }
  }

  const handleDelete = async (etfCode: string) => {
    if (!confirm(`确定要删除ETF"${etfCode}"的绑定吗？`)) {
      return
    }

    try {
      const response = await fetch(`/api/graph/nodes/${nodeId}/etfs/${etfCode}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success('ETF绑定删除成功')
        fetchBindings()
      } else {
        toast.error(data.error || '删除失败')
      }
    } catch (error) {
      console.error('删除ETF绑定失败:', error)
      toast.error('删除失败')
    }
  }

  const activeBindings = bindings.filter(b => b.isActive)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              ETF跟踪
            </CardTitle>
            <CardDescription>
              {nodeName} 相关的ETF基金
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            添加ETF
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            加载中...
          </div>
        ) : activeBindings.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              暂无ETF绑定。ETF绑定用于追踪该节点相关的指数基金。
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {activeBindings.map((binding) => (
              <div
                key={binding.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Badge variant="default" className="font-mono">
                    {binding.etfCode}
                  </Badge>
                  {binding.etfName && (
                    <span className="text-sm">{binding.etfName}</span>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {binding.weight !== undefined && binding.weight !== 1 && (
                      <span>权重: {binding.weight}</span>
                    )}
                    {binding.relevance !== undefined && binding.relevance !== 1 && (
                      <span>相关度: {binding.relevance}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(binding.etfCode)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* 添加ETF对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加ETF绑定</DialogTitle>
            <DialogDescription>
              为 {nodeName} 添加相关的ETF基金
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="etfCode">ETF代码 *</Label>
              <Input
                id="etfCode"
                value={formData.etfCode}
                onChange={(e) => setFormData({ ...formData, etfCode: e.target.value.toUpperCase() })}
                placeholder="例如: 515050"
                required
              />
            </div>

            <div>
              <Label htmlFor="etfName">ETF名称</Label>
              <Input
                id="etfName"
                value={formData.etfName}
                onChange={(e) => setFormData({ ...formData, etfName: e.target.value })}
                placeholder="例如: 华夏芯片ETF"
              />
            </div>

            <div>
              <Label htmlFor="weight">权重</Label>
              <Input
                id="weight"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                0-1之间，表示该节点在ETF中的权重
              </p>
            </div>

            <div>
              <Label htmlFor="relevance">相关度</Label>
              <Input
                id="relevance"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={formData.relevance}
                onChange={(e) => setFormData({ ...formData, relevance: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                0-1之间，表示该ETF与节点的相关程度
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">
                添加
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
