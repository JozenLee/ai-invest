import {defineConfig,devices} from '@playwright/test'
export default defineConfig({
  testDir:'./tests/e2e/analysis',testMatch:['unified-validation.spec.ts','loop-feedback.spec.ts'],timeout:60000,workers:1,reporter:'list',
  use:{baseURL:'http://127.0.0.1:3101',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{command:'NEXT_DIST_DIR=.next-verification npx next dev -H 127.0.0.1 -p 3101',url:'http://127.0.0.1:3101',reuseExistingServer:false,timeout:120000},
})
