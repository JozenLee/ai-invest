import {describe,it,expect} from 'vitest'
import {sameOriginRequest} from './request-origin'
const request=(origin?:string,host='localhost:3000')=>new Request('http://0.0.0.0:3000/api/analysis/comprehensive',{headers:{host,...(origin?{origin}:{})}})
describe('browser mutation origin guard',()=>{
  it('accepts the browser origin behind the internal Next host',()=>expect(sameOriginRequest(request('http://localhost:3000'))).toBe(true))
  it('allows local server jobs without a browser origin',()=>expect(sameOriginRequest(request())).toBe(true))
  it('rejects foreign and malformed origins',()=>{expect(sameOriginRequest(request('https://attacker.test'))).toBe(false);expect(sameOriginRequest(request('invalid'))).toBe(false)})
})
