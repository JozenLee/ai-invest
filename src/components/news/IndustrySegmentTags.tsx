'use client'

import { Badge } from '@/components/ui/badge'
import { Network } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface IndustrySegmentTag {
  industry_code: string
  industry_name: string
  segment_code: string
  segment_name: string
}

interface IndustrySegmentTagsProps {
  tags?: IndustrySegmentTag[]
  maxDisplay?: number
  showIcon?: boolean
}

export function IndustrySegmentTags({
  tags,
  maxDisplay = 3,
  showIcon = true
}: IndustrySegmentTagsProps) {
  const router = useRouter()

  if (!tags || tags.length === 0) {
    return null
  }

  // 按一级分类（产业）分组
  const groupedByIndustry = tags.reduce((acc, tag) => {
    const industryCode = tag.industry_code
    if (!acc[industryCode]) {
      acc[industryCode] = {
        industry_name: tag.industry_name,
        industry_code: tag.industry_code,
        segments: []
      }
    }
    acc[industryCode].segments.push({
      segment_code: tag.segment_code,
      segment_name: tag.segment_name
    })
    return acc
  }, {} as Record<string, {
    industry_name: string
    industry_code: string
    segments: Array<{ segment_code: string, segment_name: string }>
  }>)

  const industries = Object.values(groupedByIndustry)
  const displayIndustries = industries.slice(0, maxDisplay)
  const remainingCount = industries.length - maxDisplay

  const handleTagClick = (industryCode: string, segmentCode: string) => {
    router.push(`/graph?industry=${industryCode}&highlight=${segmentCode}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showIcon && <Network className="h-3 w-3 text-blue-600" />}
      {displayIndustries.map((industry) => (
        <div key={industry.industry_code} className="flex items-center gap-1">
          {/* 一级分类 - 产业名称 */}
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors"
            onClick={() => handleTagClick(industry.industry_code, industry.segments[0].segment_code)}
            title={`产业: ${industry.industry_name}\n点击查看知识图谱`}
          >
            {industry.industry_name}
          </Badge>

          {/* 包含关系箭头 */}
          <span className="text-blue-400 text-xs">›</span>

          {/* 二级分类 - 细分领域（同一产业下的用逗号分隔） */}
          {industry.segments.map((segment, idx) => (
            <Badge
              key={segment.segment_code}
              variant="outline"
              className="bg-blue-100 text-blue-800 border-blue-300 cursor-pointer hover:bg-blue-200 transition-colors"
              onClick={() => handleTagClick(industry.industry_code, segment.segment_code)}
              title={`细分领域: ${segment.segment_name}\n点击查看知识图谱`}
            >
              {segment.segment_name}
            </Badge>
          ))}
        </div>
      ))}
      {remainingCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{remainingCount}
        </Badge>
      )}
    </div>
  )
}
