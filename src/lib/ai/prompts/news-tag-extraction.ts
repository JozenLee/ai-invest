import type { TagTreeNode } from '@/lib/services/tag.service'

export interface TagExtractionResult {
  tags: Array<{
    tagId: string
    tagName: string
    tagCode: string
    level: number
    confidence: number
  }>
  relatedNodes: Array<{
    nodeId: string
    nodeName: string
    relevance: number
    reason: string
  }>
}

export function buildTagExtractionPrompt(
  title: string,
  content: string,
  tagTree: TagTreeNode[],
  graphNodes: Array<{ id: string; name: string; type: string }>
): string {
  const tagTreeJSON = JSON.stringify(tagTree, null, 2)
  const nodeListJSON = JSON.stringify(graphNodes, null, 2)

  return `你是一个专业的金融新闻分析师，需要分析以下新闻并提取结构化信息。

新闻标题: ${title}
新闻内容: ${content.substring(0, 1000)}

可用标签库（层级结构）:
${tagTreeJSON}

可用知识图谱节点:
${nodeListJSON}

请按以下JSON格式返回分析结果，不要添加任何额外文字：

{
  "tags": [
    {
      "tagId": "标签ID（从标签库中选择）",
      "tagName": "标签名称",
      "tagCode": "标签代码",
      "level": 层级数字(1-4),
      "confidence": 置信度(0-1之间的小数)
    }
  ],
  "relatedNodes": [
    {
      "nodeId": "节点ID（从图谱节点列表中选择）",
      "nodeName": "节点名称",
      "relevance": 相关度(0-1之间的小数),
      "reason": "关联理由（简短说明为什么相关）"
    }
  ]
}

要求:
1. 标签要包含多个层级（从一级领域到具体技术/公司），尽可能完整
2. 置信度要真实反映匹配程度，不确定的不要勉强标注
3. 相关节点要按相关度从高到低排序
4. 关联理由要具体，不要泛泛而谈
5. 只返回JSON，不要有其他内容`
}
