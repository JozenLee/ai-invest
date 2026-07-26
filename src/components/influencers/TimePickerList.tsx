'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';

interface TimePickerListProps {
  times: string[];
  onChange: (times: string[]) => void;
  maxTimes?: number;
}

export function TimePickerList({ times, onChange, maxTimes = 10 }: TimePickerListProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const validateTime = (time: string): boolean => {
    // 验证HH:MM格式
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(time);
  };

  const handleAdd = () => {
    setError('');

    if (!inputValue) {
      setError('请输入时间');
      return;
    }

    if (!validateTime(inputValue)) {
      setError('时间格式错误，请使用 HH:MM 格式（如 12:00）');
      return;
    }

    if (times.includes(inputValue)) {
      setError('该时间已存在');
      return;
    }

    if (times.length >= maxTimes) {
      setError(`最多只能添加 ${maxTimes} 个时间点`);
      return;
    }

    onChange([...times, inputValue]);
    setInputValue('');
  };

  const handleRemove = (timeToRemove: string) => {
    onChange(times.filter(t => t !== timeToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-3">
      {/* 已添加的时间列表 */}
      {times.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {times.map((time) => (
            <Badge key={time} variant="secondary" className="px-3 py-1 text-sm">
              {time}
              <button
                type="button"
                onClick={() => handleRemove(time)}
                className="ml-2 hover:text-destructive"
                aria-label="删除"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* 添加新时间 */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="HH:MM (如 12:00)"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError('');
          }}
          onKeyPress={handleKeyPress}
          className="flex-1"
          maxLength={5}
        />
        <Button
          type="button"
          onClick={handleAdd}
          disabled={times.length >= maxTimes}
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-1" />
          添加
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* 帮助文本 */}
      <p className="text-xs text-muted-foreground">
        {times.length === 0 && '点击"添加"按钮添加每日执行时间'}
        {times.length > 0 && `已添加 ${times.length} 个时间点${times.length >= maxTimes ? '（已达上限）' : ''}`}
      </p>
    </div>
  );
}
