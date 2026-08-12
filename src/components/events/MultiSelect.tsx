'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown, X, Check } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  title?: string;
  maxSelections?: number;
  className?: string;
  disabled?: boolean;
}

export function MultiSelect({
  value = [],
  onChange,
  options,
  placeholder = '请选择',
  title = '选择选项',
  maxSelections,
  className = '',
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  // 只获取当前组内被选中的项
  const currentGroupValues = value.filter(v =>
    options.some(opt => opt.value === v)
  );

  const toggleSelection = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter(v => v !== optionValue)
      : maxSelections && value.length >= maxSelections
      ? value
      : [...value, optionValue];

    onChange(newValue);
  };

  const clearAll = () => {
    // 只清除当前组的选项
    const optionValues = options.map(opt => opt.value);
    const newValue = value.filter(v => !optionValues.includes(v));
    onChange(newValue);
  };

  const selectAll = () => {
    // 添加当前组的所有选项（去重）
    const optionValues = options.map(opt => opt.value);
    const newValue = Array.from(new Set([...value, ...optionValues]));
    onChange(newValue);
  };

  // 判断当前组是否全选
  const isAllSelected = options.length > 0 &&
    options.every(opt => value.includes(opt.value));

  // 获取当前组选中选项的标签
  const getSelectedLabels = (): string[] => {
    return currentGroupValues
      .map(v => options.find(opt => opt.value === v)?.label)
      .filter(Boolean) as string[];
  };

  const selectedLabels = getSelectedLabels();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`justify-between h-auto min-h-[2.5rem] ${className}`}
          disabled={disabled}
        >
          <div className="flex items-center gap-1 flex-1 overflow-hidden">
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground text-sm">{placeholder}</span>
            ) : selectedLabels.length === 1 ? (
              <span className="text-sm truncate">{selectedLabels[0]}</span>
            ) : (
              <span className="text-sm">
                已选 {selectedLabels.length} 项
              </span>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <div className="p-2 border-b flex items-center justify-between">
          <span className="text-sm font-medium">{title}</span>
          <div className="flex items-center gap-1">
            {!isAllSelected && options.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="h-auto p-1 text-xs"
              >
                <Check className="h-3 w-3 mr-1" />
                全选
              </Button>
            )}
            {currentGroupValues.length > 0 && (
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
        </div>

        <div className="max-h-[300px] overflow-y-auto p-2">
          <div className="space-y-1">
            {options.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <div
                  key={option.value}
                  className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded-md cursor-pointer"
                  onClick={() => toggleSelection(option.value)}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelection(option.value)}
                    disabled={!!maxSelections && value.length >= maxSelections && !isSelected}
                  />
                  <label className="flex-1 text-sm cursor-pointer">
                    {option.label}
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {maxSelections && (
          <div className="p-2 border-t text-xs text-muted-foreground">
            已选择 {currentGroupValues.length} / {maxSelections}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
