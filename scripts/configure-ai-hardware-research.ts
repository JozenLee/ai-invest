import { config } from 'dotenv'
config({quiet:true})
async function main(){
  const industryId=process.argv[2]
  if(!industryId)throw new Error('请提供AI算力硬件领域ID')
  const {getResearchProfile}=await import('../src/lib/research/store')
  const {getResearchSchedule,saveResearchSettings}=await import('../src/lib/research/schedule')
  const {prisma}=await import('../src/lib/db')
  try{
    const current=await getResearchProfile(industryId)
    if(current.name!=='AI算力硬件')throw new Error('目标领域不是AI算力硬件，拒绝写入示例配置')
    if(current.sectors.length||current.segments.length||current.leaders.length){console.log(JSON.stringify({status:'preserved',reason:'已有用户配置，不覆盖'}));return}
    const profile={...current,sectors:['半导体','通信设备','IT服务'],segments:[
      {name:'算力芯片',companies:['688256','688041']},
      {name:'存储与接口',companies:['603986','688525','688766','001309']},
      {name:'半导体设备',companies:['002371','688012']},
      {name:'晶圆制造与封装',companies:['688981','688347','600584']},
      {name:'光通信',companies:['300308','300502','002281','000988']},
    ],leaders:[
      {code:'688256',name:'寒武纪',segment:'算力芯片'},
      {code:'688041',name:'海光信息',segment:'算力芯片'},
      {code:'002371',name:'北方华创',segment:'半导体设备'},
      {code:'688012',name:'中微公司',segment:'半导体设备'},
      {code:'688981',name:'中芯国际',segment:'晶圆制造与封装'},
      {code:'300308',name:'中际旭创',segment:'光通信'},
      {code:'300502',name:'新易盛',segment:'光通信'},
    ]}
    const result=await saveResearchSettings(industryId,profile,await getResearchSchedule(industryId))
    console.log(JSON.stringify({status:'configured',sectors:result.profile.sectors.length,segments:result.profile.segments.length,leaders:result.profile.leaders.length,scheduleEnabled:result.schedule.enabled}))
  }finally{await prisma.$disconnect()}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'配置失败');process.exitCode=1})
