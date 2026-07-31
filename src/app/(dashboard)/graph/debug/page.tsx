'use client'

import { useState, useEffect } from 'react'

export default function GraphDebugPage() {
  const [nodesData, setNodesData] = useState<any>(null)
  const [edgesData, setEdgesData] = useState<any>(null)
  const [fullData, setFullData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Test /api/graph/nodes
        const nodesRes = await fetch('/api/graph/nodes')
        const nodes = await nodesRes.json()
        setNodesData(nodes)

        // Test /api/graph/edges
        const edgesRes = await fetch('/api/graph/edges')
        const edges = await edgesRes.json()
        setEdgesData(edges)

        // Test /api/graph/full
        const fullRes = await fetch('/api/graph/full')
        const full = await fullRes.json()
        setFullData(full)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    fetchData()
  }, [])

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">图谱数据调试页面</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>错误:</strong> {error}
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">API: /api/graph/nodes</h2>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-60">
            {JSON.stringify(nodesData, null, 2)}
          </pre>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">API: /api/graph/edges</h2>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-60">
            {JSON.stringify(edgesData, null, 2)}
          </pre>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">API: /api/graph/full</h2>
          <div className="space-y-2">
            <p>节点数: {fullData?.data?.nodes?.length || 0}</p>
            <p>边数: {fullData?.data?.edges?.length || 0}</p>
            <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-96">
              {JSON.stringify(fullData, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
