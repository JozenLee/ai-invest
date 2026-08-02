'use client'

import { useState, useEffect } from 'react'
import { TagTreeNode, TagTree } from '@/components/tags/TagTree'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, RefreshCw, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

interface TagFormData {
  name: string
  code: string
  type: string
  level: number
  parentId: string | null
}

export default function TagManagementPage() {
  const [tags, setTags] = useState<TagTreeNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagTreeNode | null>(null)
  const [parentTag, setParentTag] = useState<TagTreeNode | null>(null)
  const [formData, setFormData] = useState<TagFormData>({
    name: '',
    code: '',
    type: 'domain',
    level: 1,
    parentId: null,
  })

  const fetchTags = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/tags/tree')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setTags(data.data)
        }
      }
    } catch (error) {
      console.error('获取标签失败:', error)
      toast.error('获取标签失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTags()
  }, [])

  const handleCreate = () => {
    setEditingTag(null)
    setParentTag(null)
    setFormData({
      name: '',
      code: '',
      type: 'domain',
      level: 1,
      parentId: null,
    })
    setIsDialogOpen(true)
  }

  const handleEdit = (tag: TagTreeNode) => {
    setEditingTag(tag)
    setParentTag(null)
    setFormData({
      name: tag.name,
      code: tag.code,
      type: tag.type,
      level: tag.level,
      parentId: tag.parentId,
    })
    setIsDialogOpen(true)
  }

  const handleAddChild = (parent: TagTreeNode) => {
    setEditingTag(null)
    setParentTag(parent)
    setFormData({
      name: '',
      code: '',
      type: parent.type, // 继承父标签类型
      level: parent.level + 1,
      parentId: parent.id,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (tag: TagTreeNode) => {
    if (!confirm(`确定要删除标签"${tag.name}"吗？\n\n注意：如果该标签有子标签或已被使用，将无法删除。`)) {
      return
    }

    try {
      const response = await fetch(`/api/tags/${tag.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success('标签删除成功')
        fetchTags()
      } else {
        toast.error(data.error || '删除失败')
      }
    } catch (error) {
      console.error('删除标签失败:', error)
      toast.error('删除标签失败')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证
    if (!formData.name.trim()) {
      toast.error('请输入标签名称')
      return
    }
    if (!formData.code.trim()) {
      toast.error('请输入标签代码')
      return
    }

    try {
      let response
      if (editingTag) {
        // 更新
        response = await fetch(`/api/tags/${editingTag.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
      } else {
        // 创建
        response = await fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
      }

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(editingTag ? '标签更新成功' : '标签创建成功')
        setIsDialogOpen(false)
        fetchTags()
      } else {
        toast.error(data.error || '操作失败')
      }
    } catch (error) {
      console.error('操作失败:', error)
      toast.error('操作失败')
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">标签管理</h1>
          <p className="text-muted-foreground mt-2">
            统一标签体系：领域、技术、公司、概念标签
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchTags} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            创建标签
          </Button>
        </div>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          标签系统用于统一管理新闻、知识图谱节点等实体的分类。
          支持树形结构，可以创建多级标签体系。
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>标签树</CardTitle>
          <CardDescription>
            当前共 {tags.length} 个一级标签
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <TagTree
              data={tags}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAddChild={handleAddChild}
            />
          )}
        </CardContent>
      </Card>

      {/* 创建/编辑对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTag ? '编辑标签' : parentTag ? `为"${parentTag.name}"添加子标签` : '创建标签'}
            </DialogTitle>
            <DialogDescription>
              {parentTag && `父标签: ${parentTag.name} (${parentTag.code})`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">标签名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如: 人工智能"
                required
              />
            </div>

            <div>
              <Label htmlFor="code">标签代码 *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="例如: ai"
                required
                disabled={!!editingTag} // 编辑时不允许修改代码
              />
              <p className="text-xs text-muted-foreground mt-1">
                唯一标识，只能包含字母、数字、下划线
              </p>
            </div>

            <div>
              <Label htmlFor="type">标签类型</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value || 'domain' })}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="domain">领域</SelectItem>
                  <SelectItem value="tech">技术</SelectItem>
                  <SelectItem value="company">公司</SelectItem>
                  <SelectItem value="concept">概念</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="level">层级</Label>
              <Input
                id="level"
                type="number"
                min="1"
                max="10"
                value={formData.level}
                onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) })}
                disabled={!!parentTag} // 添加子标签时自动计算层级
              />
              <p className="text-xs text-muted-foreground mt-1">
                {parentTag ? `自动设置为 ${parentTag.level + 1}` : '1=一级领域，2=二级细分，3=三级技术，4=公司/概念'}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">
                {editingTag ? '更新' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
