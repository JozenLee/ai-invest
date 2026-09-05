import { captureResearchSnapshot } from '@/lib/research/store'
import type { StepDefinition } from '../types'
import { ensureResearchInputsFresh } from '@/lib/research/preflight'
export const freezeResearchStep: StepDefinition = {
  name:'freeze-research',description:'冻结领域配置、交易日历与全部研究证据',dependencies:[],estimatedDuration:1000,
  async execute(context) {
    await context.updateProgress(0,2,'正在检查关键研究数据时效并等待必要同步')
    const preflight=await ensureResearchInputsFresh(context.input.industryId)
    await context.saveArtifact('research-preflight',preflight,'DATA')
    if(preflight.status==='blocked')throw new Error(preflight.warnings.join('；')||'关键研究数据同步未完成')
    await context.updateProgress(1,2,preflight.status==='fresh'?'关键数据已同步，正在冻结快照':'部分数据源受限，正在按严格门禁冻结可用证据')
    const snapshot=await captureResearchSnapshot(context.input.industryId)
    snapshot.workflow={runId:context.runId,parentRunId:context.input.parentRunId||null,baselineSnapshotId:context.input.baselineSnapshotId||null}
    await context.saveArtifact('research-snapshot',snapshot,'DATA')
    await context.saveArtifact('research-manifest',{id:snapshot.id,asOf:snapshot.asOf,version:snapshot.version,evidence:snapshot.evidence},'DATA')
    await context.updateProgress(2,2,'已完成同步校验并冻结研究输入；后续步骤与恢复不重读实时数据')
  },
}
