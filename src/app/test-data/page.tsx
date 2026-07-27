'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TestDataPage() {
  const [overviewData, setOverviewData] = useState<any>(null)
  const [capitalFlowData, setCapitalFlowData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch overview
        const overviewRes = await fetch('/api/market/overview?refresh=true')
        const overview = await overviewRes.json()
        setOverviewData(overview)

        // Fetch capital flow
        const capitalRes = await fetch('/api/market/capital-flow?refresh=true')
        const capital = await capitalRes.json()
        setCapitalFlowData(capital)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    fetchData()
  }, [])

  return (
    <div className="container mx-auto p-8 space-y-8">
      <h1 className="text-3xl font-bold">数据测试页面</h1>

      {error && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">错误</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>市场指数数据 (Raw JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-auto text-xs">
            {JSON.stringify(overviewData, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>市场指数解析测试</CardTitle>
        </CardHeader>
        <CardContent>
          {overviewData?.data?.indices?.map((index: any) => (
            <div key={index.code} className="mb-4 p-4 border rounded">
              <h3 className="font-bold">{index.name} ({index.code})</h3>
              <p>价格: {index.price}</p>
              <p>涨跌: {index.change}</p>
              <p>涨跌幅: {index.changePct}%</p>
              <p className="text-xs text-gray-500 mt-2">
                类型检查: price={typeof index.price}, change={typeof index.change}, changePct={typeof index.changePct}
              </p>
              <p className="text-xs text-gray-500">
                值检查: changePct === 0? {index.changePct === 0 ? 'YES' : 'NO'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>资金流向数据 (Raw JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-auto text-xs">
            {JSON.stringify(capitalFlowData, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>资金流向解析测试</CardTitle>
        </CardHeader>
        <CardContent>
          {capitalFlowData?.data && (
            <div className="space-y-4">
              <div className="p-4 border rounded">
                <h3 className="font-bold mb-2">市场资金</h3>
                <p>机构资金: {capitalFlowData.data.market.institutionalNet}亿 ({capitalFlowData.data.market.institutionalPct}%)</p>
                <p>散户资金: {capitalFlowData.data.market.retailNet}亿 ({capitalFlowData.data.market.retailPct}%)</p>
                <p>大盘总资金: {capitalFlowData.data.market.totalNet}亿</p>
                <p>市场情绪: {capitalFlowData.data.market.sentiment}</p>
                <p className="text-xs text-gray-500 mt-2">
                  类型检查: institutionalNet={typeof capitalFlowData.data.market.institutionalNet},
                  institutionalPct={typeof capitalFlowData.data.market.institutionalPct}
                </p>
              </div>

              <div className="p-4 border rounded">
                <h3 className="font-bold mb-2">北向资金</h3>
                <p>净流入: {capitalFlowData.data.northbound.net}亿</p>
                <p>沪股通: {capitalFlowData.data.northbound.shConnect}亿</p>
                <p>深股通: {capitalFlowData.data.northbound.szConnect}亿</p>
              </div>

              <div className="p-4 border rounded">
                <h3 className="font-bold mb-2">Top3 流入板块</h3>
                {capitalFlowData.data.topInflowSectors.slice(0, 3).map((sector: any, idx: number) => (
                  <p key={idx}>{sector.sector}: {sector.netFlow}亿 ({sector.changePct}%)</p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
