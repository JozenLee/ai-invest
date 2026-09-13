import { NextResponse } from 'next/server'
import { comprehensiveWorkflowDefinition, validateWorkflowDefinition } from '@/lib/workflow/comprehensive-definition'
import { workflowDefinitionHash } from '@/lib/workflow/definition-hash'

export async function GET() {
  const validation=validateWorkflowDefinition(comprehensiveWorkflowDefinition)
  if(!validation.valid)return NextResponse.json({error:'工作流定义无效',issues:validation.errors},{status:500})
  return NextResponse.json({...comprehensiveWorkflowDefinition,definitionHash:workflowDefinitionHash(comprehensiveWorkflowDefinition)})
}
