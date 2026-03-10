import { useEffect, useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  type NodeTypes,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { SdeAdresMetRelaties } from '../../types'
import { buildAllTrees, relayoutNodes, type TreeNodeData } from './treeLayout'
import { AdresNode } from './AdresNode'
import { BeschikkingNode } from './BeschikkingNode'
import { AllocatiepuntNode } from './AllocatiepuntNode'

interface TreeViewProps {
  adressen: SdeAdresMetRelaties[]
  loading: boolean
}

type TreeNode = Node<TreeNodeData>

function TreeViewInner({ adressen, loading }: TreeViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TreeNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView } = useReactFlow()

  const nodeTypes: NodeTypes = useMemo(() => ({
    adresNode: AdresNode,
    beschikkingNode: BeschikkingNode,
    allocatiepuntNode: AllocatiepuntNode,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  // Rebuild trees when data changes
  useEffect(() => {
    if (adressen.length === 0) {
      setNodes([])
      setEdges([])
      return
    }
    const { nodes: newNodes, edges: newEdges } = buildAllTrees(adressen)
    setNodes(newNodes as TreeNode[])
    setEdges(newEdges)
    requestAnimationFrame(() => fitView({ padding: 0.15, maxZoom: 1.2 }))
  }, [adressen, setNodes, setEdges, fitView])

  // Toggle expand/collapse on node click
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const nodeData = node.data as TreeNodeData
    if (!nodeData?.nodeType) return

    setNodes(currentNodes => {
      const updated = currentNodes.map(n =>
        n.id === node.id
          ? { ...n, data: { ...n.data, expanded: !(n.data as TreeNodeData).expanded } as TreeNodeData }
          : n
      )
      // Re-layout with updated dimensions, then apply positions
      setTimeout(() => {
        setEdges(currentEdges => {
          const relaid = relayoutNodes(updated as Node<TreeNodeData>[], currentEdges)
          const posMap = new Map(relaid.map(r => [r.id, r.position]))
          const result = updated.map(n => ({
            ...n,
            position: posMap.get(n.id) ?? n.position,
          }))
          setNodes(result)
          requestAnimationFrame(() => fitView({ padding: 0.15, maxZoom: 1.2, duration: 300 }))
          return currentEdges
        })
      }, 0)
      return updated
    })
  }, [setNodes, setEdges, fitView])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Laden...
      </div>
    )
  }

  if (adressen.length === 0) return null

  return (
    <div className="flex-1 min-h-0" style={{ height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        }}
      >
        <Controls showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
      </ReactFlow>
    </div>
  )
}

export function TreeView(props: TreeViewProps) {
  return (
    <ReactFlowProvider>
      <TreeViewInner {...props} />
    </ReactFlowProvider>
  )
}
