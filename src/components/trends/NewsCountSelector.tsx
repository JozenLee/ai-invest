import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface NewsCountSelectorProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

const NEWS_COUNT_OPTIONS = [
  { value: 20, label: '最近20条新闻' },
  { value: 50, label: '最近50条新闻' },
  { value: 100, label: '最近100条新闻' },
  { value: 200, label: '最近200条新闻' },
]

/**
 * 新闻数量选择器
 * 用于选择分析的新闻数量（20/50/100/200）
 */
export function NewsCountSelector({ value, onChange, disabled }: NewsCountSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium">分析数量：</span>
      <Select
        value={value.toString()}
        onValueChange={(val) => val && onChange(parseInt(val))}
        disabled={disabled}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue>
            {NEWS_COUNT_OPTIONS.find(opt => opt.value === value)?.label || '最近50条新闻'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {NEWS_COUNT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value.toString()}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
