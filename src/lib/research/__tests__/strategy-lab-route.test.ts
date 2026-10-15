import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks=vi.hoisted(()=>({profile:vi.fn(),get:vi.fn(),run:vi.fn(),settings:vi.fn()}))
vi.mock('../store',()=>({getResearchProfile:mocks.profile}))
vi.mock('../lab/store',()=>({getLab:mocks.get,runLab:mocks.run,setLabEnabled:mocks.settings}))
import { GET, POST } from '@/app/api/research/[industryId]/lab/route'
const context={params:Promise.resolve({industryId:'ai'})}
const request=(body:unknown,origin='http://localhost:3000')=>new NextRequest('http://localhost:3000/api/research/ai/lab',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{vi.resetAllMocks();mocks.get.mockResolvedValue({experiment:null,settings:{enabled:false}});mocks.profile.mockResolvedValue({industryId:'ai'})})
it('protects experiment writes and opt-in settings from cross-origin requests',async()=>{
  expect((await POST(request({action:'run'},'https://other.test'),context)).status).toBe(403)
  expect(mocks.run).not.toHaveBeenCalled()
})
it('validates the scope and boolean opt-in instead of treating strings as authorization',async()=>{
  expect((await POST(request({action:'settings',enabled:'true'}),context)).status).toBe(400)
  expect(mocks.settings).not.toHaveBeenCalled()
  mocks.profile.mockRejectedValue(new Error('未知领域'))
  expect((await POST(request({action:'run'}),context)).status).toBe(400)
  expect(mocks.run).not.toHaveBeenCalled()
})
it('runs a local experiment without invoking an AI model or a trade API',async()=>{
  expect((await POST(request({action:'run'}),context)).status).toBe(200)
  expect(mocks.run).toHaveBeenCalledWith('ai')
  expect((await GET(new NextRequest('http://localhost:3000/api/research/ai/lab'),context)).status).toBe(200)
})
