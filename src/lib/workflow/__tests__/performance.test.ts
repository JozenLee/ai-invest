import {it,expect} from 'vitest'
import {workflowPerformance} from '../performance'
it('separates concurrent active work, retry attempts and interruption time',()=>{
  const result=workflowPerformance(new Date(0),[
    {stepName:'a',attempts:[{startedAt:new Date(0),completedAt:new Date(10000),status:'FAILED'},{startedAt:new Date(50000),completedAt:new Date(60000),status:'COMPLETED'}],artifacts:[]},
    {stepName:'b',attempts:[{startedAt:new Date(5000),completedAt:new Date(12000),status:'COMPLETED'}],artifacts:[]},
  ],new Date(60000))
  expect(result).toMatchObject({wallMs:60000,activeMs:22000,idleMs:38000,failedAttempts:1})
})
