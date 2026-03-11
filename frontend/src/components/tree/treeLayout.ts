import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'
import type { SdeAdresMetRelaties, SdeBeschikking, Allocatiepunt, Nummeraanduiding } from '../../types'

export interface AllocatiepuntMetAdres extends Allocatiepunt {
  exacteAdres: string | null
}

export type AdresNodeData = {
  nodeType: 'adres'
  adres: SdeAdresMetRelaties
  expanded: boolean
  [key: string]: unknown
}

export type BeschikkingNodeData = {
  nodeType: 'beschikking'
  beschikking: SdeBeschikking
  expanded: boolean
  [key: string]: unknown
}

export type AllocatiepuntNodeData = {
  nodeType: 'allocatiepunt'
  allocatiepunt: AllocatiepuntMetAdres
  isPap: boolean
  expanded: boolean
  [key: string]: unknown
}

export type TreeNodeData = AdresNodeData | BeschikkingNodeData | AllocatiepuntNodeData

const NODE_DIMENSIONS = {
  collapsed: { width: 200, height: 44 },
  expandedAdres: { width: 320, height: 85 },
  expandedBeschikking: { width: 300, height: 210 },
  expandedAllocatiepunt: { width: 320, height: 240 },
}

function getNodeDimensions(data: TreeNodeData): { width: number; height: number } {
  if (!data.expanded) return NODE_DIMENSIONS.collapsed
  switch (data.nodeType) {
    case 'adres': return NODE_DIMENSIONS.expandedAdres
    case 'beschikking': return NODE_DIMENSIONS.expandedBeschikking
    case 'allocatiepunt': return NODE_DIMENSIONS.expandedAllocatiepunt
  }
}

function buildExacteAdres(nra: Nummeraanduiding): string | null {
  const parts = [nra.straat, nra.huisnummer, nra.toevoeging].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

function buildTreeGraph(adres: SdeAdresMetRelaties, treeIndex: number): { nodes: Node<TreeNodeData>[]; edges: Edge[] } {
  const nodes: Node<TreeNodeData>[] = []
  const edges: Edge[] = []
  const prefix = `t${treeIndex}`

  // Root: sde_adres
  const rootId = `${prefix}-adres-${adres.sde_adres_id}`
  nodes.push({
    id: rootId,
    type: 'adresNode',
    position: { x: 0, y: 0 },
    data: { nodeType: 'adres', adres, expanded: false },
  })

  // Children: sde_beschikkingen
  for (const beschikking of adres.sde_beschikking) {
    const nodeId = `${prefix}-sde-${beschikking.sde_nummer}`
    nodes.push({
      id: nodeId,
      type: 'beschikkingNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'beschikking', beschikking, expanded: false },
    })
    edges.push({ id: `${rootId}->${nodeId}`, source: rootId, target: nodeId })
  }

  // Flatten allocatiepunten from all nummeraanduidingen
  const alleAllocatiepunten: AllocatiepuntMetAdres[] = []
  for (const nra of adres.nummeraanduiding) {
    const exacteAdres = buildExacteAdres(nra)
    for (const ap of nra.allocatiepunt) {
      alleAllocatiepunten.push({ ...ap, exacteAdres })
    }
  }

  // Split PAP vs SAP
  const paps = alleAllocatiepunten.filter(ap => ap.type === 'PAP' || (!ap.type && !ap.linked_pap_ean))
  const saps = alleAllocatiepunten.filter(ap => ap.type === 'SAP' || ap.linked_pap_ean)
  const papEanSet = new Set(paps.map(p => p.ean_code))

  // PAP nodes: children of root
  for (const pap of paps) {
    const nodeId = `${prefix}-ean-${pap.ean_code}`
    nodes.push({
      id: nodeId,
      type: 'allocatiepuntNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'allocatiepunt', allocatiepunt: pap, isPap: true, expanded: false },
    })
    edges.push({ id: `${rootId}->${nodeId}`, source: rootId, target: nodeId })
  }

  // SAP nodes: children of linked PAP, or root if orphan
  for (const sap of saps) {
    const nodeId = `${prefix}-ean-${sap.ean_code}`
    nodes.push({
      id: nodeId,
      type: 'allocatiepuntNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'allocatiepunt', allocatiepunt: sap, isPap: false, expanded: false },
    })
    const parentId = sap.linked_pap_ean && papEanSet.has(sap.linked_pap_ean)
      ? `${prefix}-ean-${sap.linked_pap_ean}`
      : rootId
    edges.push({ id: `${parentId}->${nodeId}`, source: parentId, target: nodeId })
  }

  return { nodes, edges }
}

function applyDagreLayout(nodes: Node<TreeNodeData>[], edges: Edge[]): Node<TreeNodeData>[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 80, edgesep: 10, marginx: 20, marginy: 20 })

  for (const node of nodes) {
    const { width, height } = getNodeDimensions(node.data)
    g.setNode(node.id, { width, height })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map(node => {
    const pos = g.node(node.id)
    const { width, height } = getNodeDimensions(node.data)
    return {
      ...node,
      position: { x: pos.x - width / 2, y: pos.y - height / 2 },
    }
  })
}

export function buildAllTrees(adressen: SdeAdresMetRelaties[]): { nodes: Node<TreeNodeData>[]; edges: Edge[] } {
  const allNodes: Node<TreeNodeData>[] = []
  const allEdges: Edge[] = []
  let yOffset = 0

  for (let i = 0; i < adressen.length; i++) {
    const { nodes, edges } = buildTreeGraph(adressen[i], i)
    const layoutNodes = applyDagreLayout(nodes, edges)

    if (layoutNodes.length === 0) continue

    // Bounding box
    let minY = Infinity
    let maxY = -Infinity
    for (const n of layoutNodes) {
      const { height } = getNodeDimensions(n.data)
      minY = Math.min(minY, n.position.y)
      maxY = Math.max(maxY, n.position.y + height)
    }

    // Offset nodes vertically
    for (const n of layoutNodes) {
      n.position.y += yOffset - minY
    }

    allNodes.push(...layoutNodes)
    allEdges.push(...edges)
    yOffset += (maxY - minY) + 60
  }

  return { nodes: allNodes, edges: allEdges }
}

export function relayoutNodes(nodes: Node<TreeNodeData>[], edges: Edge[]): Node<TreeNodeData>[] {
  // Re-run dagre on all nodes (single pass, handles multiple trees via disconnected components)
  return applyDagreLayout(nodes, edges)
}
