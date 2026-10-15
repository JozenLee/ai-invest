import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { ensurePortfolioFundSubscriptions } from '../src/lib/portfolio-fund-subscriptions'
import { refreshPortfolioProductResearch } from '../src/lib/services/portfolio-product-research.service'
import { refreshStoredPortfolioFundProducts } from '../src/lib/services/fund-product-verification.service'

async function main(){
  const portfolio=await prisma.portfolio.findFirst({orderBy:[{isDefault:'desc'},{createdAt:'asc'}],include:{holdings:true}})
  if(!portfolio)throw new Error('没有可回填的投资组合')
  const holdings=portfolio.holdings.filter(item=>item.quantity>0)
  await ensurePortfolioFundSubscriptions(holdings)
  const refresh=await refreshPortfolioProductResearch(holdings.map(item=>item.ticker),{onProgress:progress=>console.log(JSON.stringify({stage:'research',...progress}))})
  await refreshStoredPortfolioFundProducts(portfolio.id)
  const updated=await prisma.holding.findMany({where:{portfolioId:portfolio.id},orderBy:{ticker:'asc'}})
  const summary={portfolioId:portfolio.id,total:updated.length,industryMapped:updated.filter(item=>item.industryDomain).length,productMapped:updated.filter(item=>(item.mappingConfidence||0)>=.8&&(item.targetEtfCode||item.targetIndexCode)).length,research:refresh.results.map(item=>({ticker:item.ticker,status:item.status,gaps:item.gaps.length})),mappings:updated.map(item=>({ticker:item.ticker,name:item.name,fundType:item.fundType,targetEtfCode:item.targetEtfCode,targetIndexCode:item.targetIndexCode,mappingSource:item.mappingSource,mappingConfidence:item.mappingConfidence}))}
  console.log(JSON.stringify({stage:'complete',summary},null,2))
}

main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect())

