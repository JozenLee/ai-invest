'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react';

interface CategoryNode {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  articleCount: number;
  children: CategoryNode[];
}

interface CategoryTreeSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxSelections?: number;
}

export function CategoryTreeSelect({
  value = [],
  onChange,
  placeholder = '选择分类',
  maxSelections,
}: CategoryTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // 查询分类树
  const { data, isLoading } = useQuery<{ success: boolean; data: CategoryNode[] }>({
    queryKey: ['category-tree'],
    queryFn: async () => {
      const response = await fetch('/api/events/categories/tree');
      if (!response.ok) throw new Error('Failed to fetch categories');
      return response.json();
    },
  });

  // 自动展开已选择的分类的父节点
  useEffect(() => {
    if (data?.data && value.length > 0) {
      const expanded = new Set<string>();
      const findParents = (nodes: CategoryNode[], targetId: string): boolean => {
        for (const node of nodes) {
          if (node.id === targetId) {
            return true;
          }
          if (node.children.length > 0) {
            if (findParents(node.children, targetId)) {
              expanded.add(node.id);
              return true;
            }
          }
        }
        return false;
      };

      value.forEach(id => {
        findParents(data.data, id);
      });

      setExpandedNodes(expanded);
    }
  }, [data, value]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const toggleSelection = (nodeId: string) => {
    const newValue = value.includes(nodeId)
      ? value.filter(id => id !== nodeId)
      : maxSelections && value.length >= maxSelections
      ? value
      : [...value, nodeId];

    onChange(newValue);
  };

  const clearAll = () => {
    onChange([]);
  };

  // 获取选中分类的名称
  const getSelectedNames = (): string[] => {
    if (!data?.data) return [];
    const names: string[] = [];
    const findNames = (nodes: CategoryNode[]) => {
      nodes.forEach(node => {
        if (value.includes(node.id)) {
          names.push(node.name);
        }
        if (node.children.length > 0) {
          findNames(node.children);
        }
      });
    };
    findNames(data.data);
    return names;
  };

  // 渲染树节点
  const renderNode = (node: CategoryNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = value.includes(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded-md cursor-pointer"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="p-0.5 hover:bg-accent-foreground/10 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleSelection(node.id)}
            disabled={!!maxSelections && value.length >= maxSelections && !isSelected}
          />

          <label
            className="flex-1 text-sm cursor-pointer"
            onClick={() => toggleSelection(node.id)}
          >
            {node.name}
            {node.articleCount > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({node.articleCount})
              </span>
            )}
          </label>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const selectedNames = getSelectedNames();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2 flex-1 overflow-hidden">
            {selectedNames.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                {selectedNames.slice(0, 3).map((name, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))}
                {selectedNames.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedNames.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-2 border-b flex items-center justify-between">
          <span className="text-sm font-medium">选择分类</span>
          {value.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-auto p-1 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              清空
            </Button>
          )}
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          {isLoading && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              加载中...
            </div>
          )}

          {!isLoading && data?.data.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              暂无分类
            </div>
          )}

          {!isLoading && data?.data && (
            <div className="space-y-1">
              {data.data.map(node => renderNode(node))}
            </div>
          )}
        </div>

        {maxSelections && (
          <div className="p-2 border-t text-xs text-muted-foreground">
            已选择 {value.length} / {maxSelections}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
