import { useEffect, useMemo, useRef, useState } from 'react'

type Point2 = [number, number]
type Point3 = [number, number, number]
type Edge = [Point3, Point3]

interface MeshPreviewData {
  edges: Edge[]
  allPts: Point3[]
  triangles: Point3[][]
}

type GerberDraw =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; ap: string | null }
  | { type: 'flash'; x: number; y: number; ap: string | null }
  | { type: 'region'; path: Point2[] }

interface GerberAperture {
  shape: string
  params: number[]
}

interface GerberData {
  apertures: Record<string, GerberAperture>
  draws: GerberDraw[]
  bbox: [number, number, number, number]
}

interface ViewOpts {
  scale: number
  offsetX: number
  offsetY: number
  angle: number
  tilt: number
}

type DisplayMode =
  | 'wireframe'
  | 'solid'
  | 'bounding-box'
  | 'material'
  | 'rendered'
  | 'xray'
  | 'hidden-line'

interface ViewState extends ViewOpts {
  type: 'mesh' | 'gerber' | null
  meshData: MeshPreviewData | null
  gerberData: GerberData | null
  displayMode: DisplayMode
}

interface InspectInfo {
  x: number
  y: number
  title: string
  lines: string[]
}

interface Props {
  fileName: string
  url: string
  ext?: string
  height?: string | number
  displayMode?: DisplayMode
}

const GERBER_EXTS = new Set([
  'gbr', 'gtl', 'gbl', 'gts', 'gbs', 'gto', 'gbo', 'gtp', 'gbp',
  'gko', 'gml', 'gm1', 'ger', 'art',
])
const DRILL_EXTS = new Set(['drl', 'xln', 'exc', 'ncd'])
const DXF_EXTS = new Set(['dxf'])
const MESH_EXTS = new Set(['step', 'stp', 'stl', 'obj'])
const CAD_PLACEHOLDER_EXTS = new Set(['dwg', 'iges', 'igs', '3mf', 'sldprt', 'sldasm', 'x_t', 'x_b'])
const SCHEMATIC_EXTS = new Set(['sch', 'kicad_sch', 'schdoc', 'asc'])
const PCB_EXTS = new Set(['kicad_pcb', 'pcbdoc', 'brd', 'pcb'])

function parseStep(text: string): MeshPreviewData {
  const points: Record<string, Point3> = {}
  const vertices: Record<string, string> = {}
  const edges: Edge[] = []

  const pointRegex = /#(\d+)\s*=\s*CARTESIAN_POINT\s*\([^,]*,\s*\(\s*([-\d.Ee+]+)\s*,\s*([-\d.Ee+]+)\s*,\s*([-\d.Ee+]+)\s*\)/g
  let match: RegExpExecArray | null
  while ((match = pointRegex.exec(text))) points[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])]

  const vertexRegex = /#(\d+)\s*=\s*VERTEX_POINT\s*\([^,]*,\s*#(\d+)\s*\)/g
  while ((match = vertexRegex.exec(text))) vertices[match[1]] = match[2]

  const edgeRegex = /#(\d+)\s*=\s*EDGE_CURVE\s*\([^,]*,\s*#(\d+)\s*,\s*#(\d+)\s*,/g
  while ((match = edgeRegex.exec(text))) {
    const start = points[vertices[match[2]]]
    const end = points[vertices[match[3]]]
    if (start && end) edges.push([start, end])
  }

  return { edges, allPts: Object.values(points), triangles: [] }
}

function addTriangle(edges: Edge[], allPts: Point3[], triangles: Point3[][], a: Point3, b: Point3, c: Point3) {
  edges.push([a, b], [b, c], [c, a])
  allPts.push(a, b, c)
  triangles.push([a, b, c])
}

function parseAsciiStl(text: string): MeshPreviewData {
  const vertices: Point3[] = []
  const vertexRegex = /vertex\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/g
  let match: RegExpExecArray | null
  while ((match = vertexRegex.exec(text))) vertices.push([Number(match[1]), Number(match[2]), Number(match[3])])

  const edges: Edge[] = []
  const allPts: Point3[] = []
  const triangles: Point3[][] = []
  for (let i = 0; i + 2 < vertices.length; i += 3) addTriangle(edges, allPts, triangles, vertices[i], vertices[i + 1], vertices[i + 2])
  return { edges: edges.slice(0, 12000), allPts, triangles }
}

function parseBinaryStl(buffer: ArrayBuffer): MeshPreviewData {
  if (buffer.byteLength < 84) return { edges: [], allPts: [], triangles: [] }

  const view = new DataView(buffer)
  const triangleCount = view.getUint32(80, true)
  const maxTriangles = Math.min(triangleCount, Math.floor((buffer.byteLength - 84) / 50), 4000)
  const edges: Edge[] = []
  const allPts: Point3[] = []
  const triangles: Point3[][] = []

  for (let i = 0; i < maxTriangles; i++) {
    const offset = 84 + i * 50 + 12
    const a: Point3 = [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)]
    const b: Point3 = [view.getFloat32(offset + 12, true), view.getFloat32(offset + 16, true), view.getFloat32(offset + 20, true)]
    const c: Point3 = [view.getFloat32(offset + 24, true), view.getFloat32(offset + 28, true), view.getFloat32(offset + 32, true)]
    addTriangle(edges, allPts, triangles, a, b, c)
  }

  return { edges, allPts, triangles }
}

function parseStl(buffer: ArrayBuffer): MeshPreviewData {
  const header = new TextDecoder('utf-8').decode(buffer.slice(0, Math.min(256, buffer.byteLength))).trim().toLowerCase()
  if (header.startsWith('solid')) {
    try {
      const ascii = parseAsciiStl(new TextDecoder('utf-8').decode(buffer))
      if (ascii.edges.length) return ascii
    } catch {
      // Fall back to binary STL parsing.
    }
  }
  return parseBinaryStl(buffer)
}

function parseObj(text: string): MeshPreviewData {
  const vertices: Point3[] = []
  const edges: Edge[] = []
  const allPts: Point3[] = []
  const triangles: Point3[][] = []

  const vertexAt = (token: string): Point3 | null => {
    const index = Number.parseInt(token.split('/')[0], 10)
    if (!Number.isFinite(index) || index === 0) return null
    const resolved = index > 0 ? index - 1 : vertices.length + index
    return vertices[resolved] ?? null
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)

    if (parts[0] === 'v' && parts.length >= 4) {
      const point: Point3 = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
      if (point.every(Number.isFinite)) vertices.push(point)
      continue
    }

    if ((parts[0] === 'f' || parts[0] === 'l') && parts.length >= 3) {
      const face = parts.slice(1).map(vertexAt).filter((point): point is Point3 => point !== null)
      if (face.length < 2) continue
      for (let i = 0; i < face.length; i++) {
        const a = face[i]
        const b = face[(i + 1) % face.length]
        if (parts[0] === 'l' && i === face.length - 1) break
        edges.push([a, b])
        allPts.push(a, b)
      }
      if (face.length >= 3) {
        for (let i = 1; i + 1 < face.length; i++) triangles.push([face[0], face[i], face[i + 1]])
      }
    }
  }

  return { edges: edges.slice(0, 12000), allPts: allPts.length ? allPts : vertices, triangles }
}

function projectPoint(point: Point3, angle: number, tilt: number): Point2 {
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  const cosT = Math.cos(tilt)
  const sinT = Math.sin(tilt)
  const x1 = point[0] * cosA + point[2] * sinA
  const z1 = -point[0] * sinA + point[2] * cosA
  return [x1, -(point[1] * cosT - z1 * sinT)]
}

interface ProjectedPoint {
  x: number
  y: number
  depth: number
}

function projectPoint3D(point: Point3, angle: number, tilt: number): ProjectedPoint {
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  const cosT = Math.cos(tilt)
  const sinT = Math.sin(tilt)
  const x1 = point[0] * cosA + point[2] * sinA
  const z1 = -point[0] * sinA + point[2] * cosA
  const y1 = point[1] * cosT - z1 * sinT
  const depth = z1 * cosT + point[1] * sinT
  return { x: x1, y: -y1, depth }
}

function subtract3(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross3(a: Point3, b: Point3): Point3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function length3(v: Point3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function normalize3(v: Point3): Point3 {
  const len = length3(v) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

function dot3(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function pointInTriangle(p: Point2, a: Point2, b: Point2, c: Point2): boolean {
  const v0: Point2 = [c[0] - a[0], c[1] - a[1]]
  const v1: Point2 = [b[0] - a[0], b[1] - a[1]]
  const v2: Point2 = [p[0] - a[0], p[1] - a[1]]
  const dot00 = v0[0] * v0[0] + v0[1] * v0[1]
  const dot01 = v0[0] * v1[0] + v0[1] * v1[1]
  const dot02 = v0[0] * v2[0] + v0[1] * v2[1]
  const dot11 = v1[0] * v1[0] + v1[1] * v1[1]
  const dot12 = v1[0] * v2[0] + v1[1] * v2[1]
  const invDenom = 1 / ((dot00 * dot11) - (dot01 * dot01) || 1)
  const u = ((dot11 * dot02) - (dot01 * dot12)) * invDenom
  const v = ((dot00 * dot12) - (dot01 * dot02)) * invDenom
  return u >= 0 && v >= 0 && u + v <= 1
}

function distanceToSegment(point: Point2, a: Point2, b: Point2): number {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const apx = point[0] - a[0]
  const apy = point[1] - a[1]
  const denom = abx * abx + aby * aby || 1
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom))
  const px = a[0] + abx * t
  const py = a[1] + aby * t
  return Math.hypot(point[0] - px, point[1] - py)
}

function cross(origin: Point2, a: Point2, b: Point2): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])
}

function convexHull(points: Point2[]): Point2[] {
  const unique = Array.from(new Map(points.map(point => [`${point[0].toFixed(4)}:${point[1].toFixed(4)}`, point])).values())
  if (unique.length <= 3) return unique

  const sorted = [...unique].sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0])
  const lower: Point2[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }

  const upper: Point2[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function formatDimension(value: number): string {
  if (!Number.isFinite(value)) return '0.00'
  if (value >= 100) return value.toFixed(0)
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function computeDimensions(points: Point3[]): { x: number; y: number; z: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const point of points) {
    const [x, y, z] = point
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return {
    x: maxX - minX || 0,
    y: maxY - minY || 0,
    z: maxZ - minZ || 0,
  }
}

interface MeshFrame {
  projected: ProjectedPoint[]
  scale: number
  originX: number
  originY: number
  width: number
  height: number
  dims: { x: number; y: number; z: number }
}

function buildMeshFrame(canvas: HTMLCanvasElement, data: MeshPreviewData, opts: ViewOpts): MeshFrame | null {
  if (!data.allPts.length) return null
  const dims = computeDimensions(data.allPts)
  const projected = data.allPts.map(point => projectPoint3D(point, opts.angle, opts.tilt))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of projected) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  const width = maxX - minX || 1
  const height = maxY - minY || 1
  const scale = Math.min((canvas.width - 64) / width, (canvas.height - 64) / height) * opts.scale
  const originX = opts.offsetX + (canvas.width - width * scale) / 2 - minX * scale
  const originY = opts.offsetY + (canvas.height - height * scale) / 2 - minY * scale
  return { projected, scale, originX, originY, width, height, dims }
}

function pickMeshInspection(
  data: MeshPreviewData,
  frame: MeshFrame,
  opts: ViewOpts,
  displayMode: DisplayMode,
  point: Point2,
): InspectInfo | null {
  const isWireframe = displayMode === 'wireframe'
  const screenPoint = point
  const toCanvas = (p: ProjectedPoint): Point2 => [frame.originX + p.x * frame.scale, frame.originY + p.y * frame.scale]

  if (data.triangles.length > 0 && !isWireframe) {
    const faces = data.triangles.map((triangle, index) => {
      const projectedTri = triangle.map(vertex => projectPoint3D(vertex, opts.angle, opts.tilt))
      const p0 = toCanvas(projectedTri[0])
      const p1 = toCanvas(projectedTri[1])
      const p2 = toCanvas(projectedTri[2])
      const center: Point2 = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3]
      const centroid3D: Point3 = [
        (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
        (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3,
        (triangle[0][2] + triangle[1][2] + triangle[2][2]) / 3,
      ]
      const a = subtract3(triangle[1], triangle[0])
      const b = subtract3(triangle[2], triangle[0])
      const normal = normalize3(cross3(a, b))
      const brightness = Math.max(0.08, Math.min(1, 0.25 + dot3(normal, normalize3([0.55, 0.82, 0.35])) * 0.75))
      return { index, triangle, projectedTri, p0, p1, p2, center, centroid3D, brightness }
    }).sort((a, b) => {
      const depthA = (a.projectedTri[0].depth + a.projectedTri[1].depth + a.projectedTri[2].depth) / 3
      const depthB = (b.projectedTri[0].depth + b.projectedTri[1].depth + b.projectedTri[2].depth) / 3
      return depthB - depthA
    })

    let bestFace: typeof faces[number] | null = null
    let bestDistance = Infinity

    for (const face of faces) {
      if (pointInTriangle(screenPoint, face.p0, face.p1, face.p2)) {
        bestFace = face
        break
      }
      const centroidDistance = Math.hypot(screenPoint[0] - face.center[0], screenPoint[1] - face.center[1])
      if (centroidDistance < bestDistance) {
        bestDistance = centroidDistance
        bestFace = face
      }
    }

    if (!bestFace) return null
    const selectedTriangle = bestFace.triangle
    return {
      x: screenPoint[0],
      y: screenPoint[1],
      title: `${displayMode === 'material' ? 'Material' : displayMode === 'rendered' ? 'Rendered' : 'Surface'} face`,
      lines: [
        `Mode: ${displayMode}`,
        `Face: ${bestFace.index + 1}`,
        `Material: ${displayMode === 'material' ? 'Neutral matte' : 'Shaded preview'}`,
        `Surface normal: ${bestFace.brightness.toFixed(2)}`,
        `Vertices: ${selectedTriangle.map(v => `${formatDimension(v[0])}, ${formatDimension(v[1])}, ${formatDimension(v[2])}`).join(' | ')}`,
      ],
    }
  }

  let bestEdgeIndex = -1
  let bestEdgeDistance = Infinity
  for (let i = 0; i < data.edges.length; i++) {
    const [start, end] = data.edges[i]
    const a = toCanvas(projectPoint3D(start, opts.angle, opts.tilt))
    const b = toCanvas(projectPoint3D(end, opts.angle, opts.tilt))
    const distance = distanceToSegment(screenPoint, a, b)
    if (distance < bestEdgeDistance) {
      bestEdgeDistance = distance
      bestEdgeIndex = i
    }
  }

  if (bestEdgeIndex >= 0) {
    const [start, end] = data.edges[bestEdgeIndex]
    return {
      x: screenPoint[0],
      y: screenPoint[1],
      title: 'Wireframe edge',
      lines: [
        `Mode: ${displayMode}`,
        `Edge: ${bestEdgeIndex + 1}`,
        `Start: ${formatDimension(start[0])}, ${formatDimension(start[1])}, ${formatDimension(start[2])}`,
        `End: ${formatDimension(end[0])}, ${formatDimension(end[1])}, ${formatDimension(end[2])}`,
      ],
    }
  }

  return null
}

function renderMesh(canvas: HTMLCanvasElement, data: MeshPreviewData, opts: ViewOpts, label: string, displayMode: DisplayMode) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const isWireframe = displayMode === 'wireframe'
  const isBoundingBox = displayMode === 'bounding-box'
  const isHiddenLine = displayMode === 'hidden-line'
  const isXRay = displayMode === 'xray'
  const isRendered = displayMode === 'rendered'
  const isMaterial = displayMode === 'material'
  const isSolid = displayMode === 'solid'

  const background = isRendered ? '#edf4ff' : isMaterial ? '#f8fbff' : '#fffdf7'
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (!data.allPts.length) {
    renderPlaceholder(canvas, '3D', 'No 3D geometry found', ['Use STEP or STL for direct browser preview.'])
    return
  }

  const dims = computeDimensions(data.allPts)
  const projected = data.allPts.map(point => projectPoint3D(point, opts.angle, opts.tilt))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of projected) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  const width = maxX - minX || 1
  const height = maxY - minY || 1
  const scale = Math.min((canvas.width - 64) / width, (canvas.height - 64) / height) * opts.scale
  const originX = opts.offsetX + (canvas.width - width * scale) / 2 - minX * scale
  const originY = opts.offsetY + (canvas.height - height * scale) / 2 - minY * scale

  const toCanvas = (point: ProjectedPoint): Point2 => [originX + point.x * scale, originY + point.y * scale]
  const light = normalize3([0.55, 0.82, 0.35])
  const hasFaces = data.triangles.length > 0 && !isWireframe
  const faceFill = (brightness: number): string => {
    if (isMaterial) {
      const gray = 232 - Math.round(brightness * 20)
      return `rgba(${gray}, ${gray + 2}, ${gray + 6}, 0.98)`
    }
    if (isRendered) {
      const blue = 205 + Math.round(brightness * 26)
      return `rgba(${blue - 12}, ${blue}, 255, 0.98)`
    }
    if (isXRay) {
      const blue = 220 - Math.round(brightness * 18)
      return `rgba(${blue - 2}, ${blue + 6}, 255, 0.28)`
    }
    const blue = 222 - Math.round(brightness * 22)
    return `rgba(${Math.max(176, blue - 12)}, ${Math.max(212, blue + 2)}, 255, ${isSolid ? 0.88 : 0.78})`
  }

  if (isBoundingBox) {
    ctx.save()
    ctx.strokeStyle = '#2563eb'
    ctx.fillStyle = 'rgba(219, 234, 254, 0.48)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 5])
    ctx.fillRect(originX, originY, width * scale, height * scale)
    ctx.strokeRect(originX, originY, width * scale, height * scale)
    ctx.setLineDash([])
    ctx.strokeStyle = '#93c5fd'
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(originX, originY)
    ctx.lineTo(originX + width * scale, originY + height * scale)
    ctx.moveTo(originX + width * scale, originY)
    ctx.lineTo(originX, originY + height * scale)
    ctx.stroke()
    ctx.restore()
  } else if (hasFaces) {
    const faces = data.triangles.map(triangle => {
      const projectedTri = triangle.map(point => projectPoint3D(point, opts.angle, opts.tilt))
      const p0 = projectedTri[0]
      const p1 = projectedTri[1]
      const p2 = projectedTri[2]
      const a = subtract3(triangle[1], triangle[0])
      const b = subtract3(triangle[2], triangle[0])
      const normal = normalize3(cross3(a, b))
      const brightness = Math.max(0.08, Math.min(1, 0.25 + dot3(normal, light) * 0.75))
      const depth = (p0.depth + p1.depth + p2.depth) / 3
      return { triangle, projectedTri, brightness, depth }
    }).sort((a, b) => a.depth - b.depth)

    for (const face of faces) {
      const [p0, p1, p2] = face.projectedTri
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(...toCanvas(p0))
      ctx.lineTo(...toCanvas(p1))
      ctx.lineTo(...toCanvas(p2))
      ctx.closePath()
      const fill = faceFill(face.brightness)
      ctx.shadowColor = isRendered ? 'rgba(30, 64, 175, 0.18)' : isMaterial ? 'rgba(15, 23, 42, 0.08)' : 'transparent'
      ctx.shadowBlur = isRendered ? 18 : 0
      ctx.fillStyle = fill
      ctx.fill()
      ctx.lineWidth = isHiddenLine ? 1.2 : isRendered ? 1.05 : isMaterial ? 0.85 : 0.9
      ctx.strokeStyle = isHiddenLine ? '#64748b' : isMaterial ? 'rgba(51, 65, 85, 0.56)' : isXRay ? 'rgba(37, 99, 235, 0.3)' : 'rgba(37, 99, 235, 0.45)'
      ctx.stroke()
      ctx.restore()
    }
  }

  if (isWireframe) {
    const edgeLimit = Math.min(data.edges.length, 12000)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 1.15
    ctx.strokeStyle = '#1d4ed8'
    ctx.fillStyle = '#1d4ed8'
    for (let i = 0; i < edgeLimit; i++) {
      const [start, end] = data.edges[i]
      const a = projectPoint3D(start, opts.angle, opts.tilt)
      const b = projectPoint3D(end, opts.angle, opts.tilt)
      ctx.beginPath()
      ctx.moveTo(originX + a.x * scale, originY + a.y * scale)
      ctx.lineTo(originX + b.x * scale, originY + b.y * scale)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(originX + a.x * scale, originY + a.y * scale, 0.9, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(originX + b.x * scale, originY + b.y * scale, 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (!isHiddenLine) {
    const edgeLimit = Math.min(data.edges.length, 12000)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = isRendered ? 1.15 : isMaterial ? 0.95 : isXRay ? 0.8 : 0.85
    ctx.strokeStyle = isRendered
      ? 'rgba(29, 78, 216, 0.7)'
      : isMaterial
      ? 'rgba(37, 99, 235, 0.68)'
      : isXRay
      ? 'rgba(37, 99, 235, 0.42)'
      : 'rgba(96, 165, 250, 0.72)'

    for (let i = 0; i < edgeLimit; i++) {
      const [start, end] = data.edges[i]
      const a = projectPoint3D(start, opts.angle, opts.tilt)
      const b = projectPoint3D(end, opts.angle, opts.tilt)
      ctx.beginPath()
      ctx.moveTo(originX + a.x * scale, originY + a.y * scale)
      ctx.lineTo(originX + b.x * scale, originY + b.y * scale)
      ctx.stroke()
    }
  }

  ctx.fillStyle = '#334155'
  ctx.font = '11px Consolas, monospace'
  ctx.textAlign = 'left'
  const modeLabel =
    displayMode === 'wireframe' ? 'Wireframe' :
    displayMode === 'solid' ? 'Solid / Shaded' :
    displayMode === 'bounding-box' ? 'Bounding Box' :
    displayMode === 'material' ? 'Material Preview' :
    displayMode === 'rendered' ? 'Rendered' :
    displayMode === 'xray' ? 'X-Ray' :
    'Hidden Line'
  ctx.fillText(`${label} - ${modeLabel} - ${data.edges.length.toLocaleString()} edges`, 10, 18)
  ctx.fillStyle = '#64748b'
  ctx.font = '10.5px Segoe UI, Arial, sans-serif'
  ctx.fillText(`Model size: ${formatDimension(dims.x)} × ${formatDimension(dims.y)} × ${formatDimension(dims.z)}`, 10, 34)

  const dimensionText = `Dimensions: X ${formatDimension(dims.x)}  Y ${formatDimension(dims.y)}  Z ${formatDimension(dims.z)}`
  const pillWidth = Math.min(canvas.width - 24, Math.max(210, dimensionText.length * 5.4 + 18))
  const pillX = canvas.width - pillWidth - 12
  const pillY = 12
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
  ctx.strokeStyle = '#bfdbfe'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(pillX, pillY, pillWidth, 24, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#1d4ed8'
  ctx.font = '700 10.5px Segoe UI, Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(dimensionText, pillX + 10, pillY + 15.5)
  ctx.restore()

  ctx.strokeStyle = '#d8d1bf'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
}

function coordinate(value: string, intDigits: number, decimalDigits: number): number {
  const negative = value.startsWith('-')
  let raw = negative ? value.slice(1) : value
  while (raw.length < intDigits + decimalDigits) raw = `0${raw}`
  const integer = Number.parseInt(raw.slice(0, raw.length - decimalDigits) || '0', 10)
  const decimal = Number.parseInt(raw.slice(raw.length - decimalDigits) || '0', 10)
  const number = integer + decimal / 10 ** decimalDigits
  return negative ? -number : number
}

function parseGerber(text: string): GerberData {
  const apertures: Record<string, GerberAperture> = {}
  const draws: GerberDraw[] = []
  let format = { xi: 2, xd: 6, yi: 2, yd: 6 }
  let currentX = 0
  let currentY = 0
  let currentAperture: string | null = null
  let inRegion = false
  let regionPath: Point2[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  text.replace(/%FS[LT]A[XI](\d)(\d)[YI](\d)(\d)\*%/g, (_match, xi, xd, yi, yd) => {
    format = { xi: Number(xi), xd: Number(xd), yi: Number(yi), yd: Number(yd) }
    return ''
  })

  text.replace(/%ADD(\d+)([CROP])[,X]?([^*%]*)[\*%]/g, (_match, code, shape, params) => {
    apertures[code] = { shape, params: params ? String(params).split('X').map(Number) : [] }
    return ''
  })

  const setBounds = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const expand = (xValue?: string, yValue?: string): Point2 => {
    const x = xValue !== undefined ? coordinate(xValue, format.xi, format.xd) : currentX
    const y = yValue !== undefined ? coordinate(yValue, format.yi, format.yd) : currentY
    setBounds(x, y)
    return [x, y]
  }

  for (const block of text.split('*')) {
    const command = block.replace(/%[^%]*%/g, '').trim()
    if (!command) continue

    if (command.includes('G36')) {
      inRegion = true
      regionPath = []
      continue
    }

    if (command.includes('G37')) {
      if (regionPath.length > 1) draws.push({ type: 'region', path: [...regionPath] })
      inRegion = false
      regionPath = []
      continue
    }

    const apertureSelect = command.match(/^(?:G54)?D(\d{2,})$/)
    if (apertureSelect && Number(apertureSelect[1]) >= 10) {
      currentAperture = apertureSelect[1]
      continue
    }

    const drawMatch = command.match(/^(?:G0[123])?(X([-\d]+))?(Y([-\d]+))?(I([-\d]+))?(J([-\d]+))?D0([123])/)
    if (!drawMatch) continue

    const next = expand(drawMatch[2], drawMatch[4])
    const operation = drawMatch[9]
    if (operation === '1') {
      if (inRegion) {
        if (!regionPath.length) regionPath.push([currentX, currentY])
        regionPath.push(next)
      } else {
        draws.push({ type: 'line', x1: currentX, y1: currentY, x2: next[0], y2: next[1], ap: currentAperture })
      }
    } else if (operation === '3') {
      draws.push({ type: 'flash', x: next[0], y: next[1], ap: currentAperture })
    }

    currentX = next[0]
    currentY = next[1]
  }

  if (minX === Infinity) return { apertures, draws, bbox: [0, 0, 100, 100] }
  return { apertures, draws, bbox: [minX, minY, maxX, maxY] }
}

function parseDrill(text: string): GerberData {
  const draws: GerberDraw[] = []
  const apertures: Record<string, GerberAperture> = { T01: { shape: 'C', params: [0.35] } }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const setBounds = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  for (const line of text.split(/\r?\n/)) {
    const hit = line.trim().match(/^X(-?\d+(?:\.\d+)?)Y(-?\d+(?:\.\d+)?)/i)
    if (!hit) continue
    const x = Number(hit[1])
    const y = Number(hit[2])
    draws.push({ type: 'flash', x, y, ap: 'T01' })
    setBounds(x, y)
  }

  if (minX === Infinity) return { apertures, draws, bbox: [0, 0, 100, 100] }
  return { apertures, draws, bbox: [minX, minY, maxX, maxY] }
}

function parseDxf(text: string): GerberData {
  const draws: GerberDraw[] = []
  const apertures: Record<string, GerberAperture> = { DXF: { shape: 'C', params: [0.12] } }
  const lines = text.split(/\r?\n/).map(line => line.trim())
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const setBounds = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const readGroupValue = (start: number, code: string): number | null => {
    for (let i = start; i + 1 < lines.length; i += 2) {
      if (lines[i] === '0') break
      if (lines[i] === code) {
        const value = Number(lines[i + 1])
        return Number.isFinite(value) ? value : null
      }
    }
    return null
  }

  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] !== '0') continue
    const entity = lines[i + 1].toUpperCase()
    if (entity === 'LINE') {
      const x1 = readGroupValue(i + 2, '10')
      const y1 = readGroupValue(i + 2, '20')
      const x2 = readGroupValue(i + 2, '11')
      const y2 = readGroupValue(i + 2, '21')
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue
      draws.push({ type: 'line', x1, y1, x2, y2, ap: 'DXF' })
      setBounds(x1, y1)
      setBounds(x2, y2)
    } else if (entity === 'CIRCLE') {
      const cx = readGroupValue(i + 2, '10')
      const cy = readGroupValue(i + 2, '20')
      const radius = readGroupValue(i + 2, '40')
      if (cx === null || cy === null || radius === null) continue
      const segments = 48
      for (let step = 0; step < segments; step++) {
        const a1 = (Math.PI * 2 * step) / segments
        const a2 = (Math.PI * 2 * (step + 1)) / segments
        const x1 = cx + Math.cos(a1) * radius
        const y1 = cy + Math.sin(a1) * radius
        const x2 = cx + Math.cos(a2) * radius
        const y2 = cy + Math.sin(a2) * radius
        draws.push({ type: 'line', x1, y1, x2, y2, ap: 'DXF' })
      }
      setBounds(cx - radius, cy - radius)
      setBounds(cx + radius, cy + radius)
    }
  }

  if (minX === Infinity) return { apertures, draws, bbox: [0, 0, 100, 100] }
  return { apertures, draws, bbox: [minX, minY, maxX, maxY] }
}

function renderGerber(canvas: HTMLCanvasElement, data: GerberData, opts: ViewOpts, label: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#fffdf7'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const [minX, minY, maxX, maxY] = data.bbox
  const width = maxX - minX || 1
  const height = maxY - minY || 1
  const baseScale = Math.min((canvas.width - 52) / width, (canvas.height - 52) / height)
  const scale = baseScale * opts.scale
  const originX = opts.offsetX + (canvas.width - width * scale) / 2 - minX * scale
  const originY = opts.offsetY + (canvas.height - height * scale) / 2 + maxY * scale
  const tx = (x: number) => originX + x * scale
  const ty = (y: number) => originY - y * scale

  const apertureRadius = (code: string | null) => {
    if (!code) return 1
    const aperture = data.apertures[code]
    return aperture ? Math.max(0.8, (aperture.params[0] || 0.12) * scale / 2) : 1
  }

  for (const draw of data.draws) {
    if (draw.type === 'line') {
      ctx.beginPath()
      ctx.strokeStyle = '#b48a16'
      ctx.lineWidth = Math.max(1, apertureRadius(draw.ap) * 2)
      ctx.lineCap = 'round'
      ctx.moveTo(tx(draw.x1), ty(draw.y1))
      ctx.lineTo(tx(draw.x2), ty(draw.y2))
      ctx.stroke()
    } else if (draw.type === 'flash') {
      const aperture = draw.ap ? data.apertures[draw.ap] : null
      const cx = tx(draw.x)
      const cy = ty(draw.y)
      ctx.fillStyle = '#b48a16'
      if (aperture?.shape === 'R' || aperture?.shape === 'O' || aperture?.shape === 'P') {
        const w = Math.max(1, (aperture.params[0] || 0.12) * scale)
        const h = Math.max(1, (aperture.params[1] ?? aperture.params[0] ?? 0.12) * scale)
        ctx.fillRect(cx - w / 2, cy - h / 2, w, h)
      } else {
        ctx.beginPath()
        ctx.arc(cx, cy, apertureRadius(draw.ap), 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.beginPath()
      ctx.fillStyle = 'rgba(180, 138, 22, 0.68)'
      draw.path.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(tx(x), ty(y))
        else ctx.lineTo(tx(x), ty(y))
      })
      ctx.closePath()
      ctx.fill()
    }
  }

  ctx.fillStyle = '#6b5c25'
  ctx.font = '11px Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${label} preview - ${data.draws.length.toLocaleString()} primitives`, 10, 18)
  ctx.strokeStyle = '#d8d1bf'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
}

function renderPlaceholder(canvas: HTMLCanvasElement, icon: string, title: string, lines: string[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#fffdf7'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const centerX = canvas.width / 2
  const centerY = canvas.height / 2 - 32
  ctx.fillStyle = '#eff6ff'
  ctx.strokeStyle = '#bfdbfe'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(centerX, centerY, 42, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#60a5fa'
  ctx.font = '700 18px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(icon.slice(0, 6).toUpperCase(), centerX, centerY + 7)

  ctx.fillStyle = '#1e293b'
  ctx.font = '700 14px Segoe UI, Arial, sans-serif'
  ctx.fillText(title, centerX, centerY + 62)

  ctx.fillStyle = '#64748b'
  ctx.font = '12px Segoe UI, Arial, sans-serif'
  lines.forEach((line, index) => ctx.fillText(line, centerX, centerY + 84 + index * 18))

  ctx.strokeStyle = '#d8d1bf'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
}

function viewerLabel(ext: string) {
  if (MESH_EXTS.has(ext) || CAD_PLACEHOLDER_EXTS.has(ext)) return '3D Model'
  if (GERBER_EXTS.has(ext)) return 'Gerber Layer'
  if (DRILL_EXTS.has(ext)) return 'Drill File'
  if (DXF_EXTS.has(ext)) return 'DXF Drawing'
  if (PCB_EXTS.has(ext)) return 'PCB Layout'
  if (SCHEMATIC_EXTS.has(ext)) return 'Schematic'
  return ext ? ext.toUpperCase() : 'File'
}

export default function SchematicAgentViewer({ fileName, url, ext: extProp, height = '100%', displayMode = 'solid' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [inspect, setInspect] = useState<InspectInfo | null>(null)
  const stateRef = useRef<ViewState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    angle: 0.6,
    tilt: 0.4,
    type: null,
    meshData: null,
    gerberData: null,
    displayMode,
  })

  const ext = useMemo(() => (extProp ?? fileName.split('.').pop() ?? '').toLowerCase(), [extProp, fileName])
  const isMesh = MESH_EXTS.has(ext)
  const isCadPlaceholder = CAD_PLACEHOLDER_EXTS.has(ext)
  const isGerber = GERBER_EXTS.has(ext)
  const isDrill = DRILL_EXTS.has(ext)
  const isDxf = DXF_EXTS.has(ext)
  const isPCB = PCB_EXTS.has(ext)
  const isSchematic = SCHEMATIC_EXTS.has(ext)
  const label = viewerLabel(ext)

  const fitCanvas = () => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    canvas.width = wrapper.clientWidth || 700
    canvas.height = wrapper.clientHeight || 460
  }

  const redraw = () => {
    const canvas = canvasRef.current
    const state = stateRef.current
    if (!canvas) return
    if (state.type === 'mesh' && state.meshData) renderMesh(canvas, state.meshData, state, label, state.displayMode)
    if (state.type === 'gerber' && state.gerberData) renderGerber(canvas, state.gerberData, state, label)
  }

  useEffect(() => {
    stateRef.current.displayMode = displayMode
    redraw()
  }, [displayMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    setInspect(null)
    const state = stateRef.current
    Object.assign(state, { scale: 1, offsetX: 0, offsetY: 0, angle: 0.6, tilt: 0.4, type: null, meshData: null, gerberData: null, displayMode })
    fitCanvas()

    if (isSchematic) {
      renderPlaceholder(canvas, 'SCH', 'Schematic preview', ['Use a PDF export for visual preview.', 'Run AI Review for schematic analysis.'])
      return
    }

    if (isPCB) {
      renderPlaceholder(canvas, 'PCB', 'PCB layout preview', ['Export Gerber layers for direct preview.', 'Run AI Review for layout and DFM analysis.'])
      return
    }

    if (isCadPlaceholder) {
      renderPlaceholder(canvas, ext.toUpperCase(), 'CAD conversion required', ['STEP or STL files render directly in this viewer.', 'Use the download link to open native CAD files.'])
      return
    }

    if (isMesh) {
      if (ext === 'stl') {
        fetch(url)
          .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.arrayBuffer()
          })
          .then(buffer => {
            if (cancelled) return
            fitCanvas()
            const data = parseStl(buffer)
            if (!data.edges.length) {
              renderPlaceholder(canvas, 'STL', 'STL preview', ['No triangle geometry was found.'])
              return
            }
            state.type = 'mesh'
            state.meshData = data
            renderMesh(canvas, data, state, label, state.displayMode)
          })
          .catch(error => renderPlaceholder(canvas, 'STL', 'STL preview failed', [error.message]))
        return
      }

      if (ext === 'obj') {
        fetch(url)
          .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.text()
          })
          .then(text => {
            if (cancelled) return
            fitCanvas()
            const data = parseObj(text)
            if (!data.edges.length) {
              renderPlaceholder(canvas, 'OBJ', 'OBJ preview', ['No mesh faces or lines were found.'])
              return
            }
            state.type = 'mesh'
            state.meshData = data
            renderMesh(canvas, data, state, label, state.displayMode)
          })
          .catch(error => renderPlaceholder(canvas, 'OBJ', 'OBJ preview failed', [error.message]))
        return
      }

      fetch(url.replace(/\/raw$/, '/step-preview'))
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((payload: { edges?: number[][] }) => {
          if (cancelled) return
          if (!payload.edges?.length) throw new Error('No edge geometry found')
          const edges = payload.edges.map(edge => [[edge[0], edge[1], edge[2]], [edge[3], edge[4], edge[5]]] as Edge)
          const allPts: Point3[] = []
          for (const edge of payload.edges) {
            allPts.push([edge[0], edge[1], edge[2]], [edge[3], edge[4], edge[5]])
          }
          state.type = 'mesh'
          state.meshData = { edges, allPts }
          fitCanvas()
          renderMesh(canvas, state.meshData, state, label, state.displayMode)
        })
        .catch(() => {
          fetch(url)
            .then(response => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              return response.text()
            })
            .then(text => {
              if (cancelled) return
              const data = parseStep(text)
              if (!data.edges.length) {
                renderPlaceholder(canvas, '3D', 'STEP preview', ['No edge geometry was found.'])
                return
              }
              state.type = 'mesh'
              state.meshData = data
              fitCanvas()
              renderMesh(canvas, data, state, label, state.displayMode)
            })
            .catch(error => renderPlaceholder(canvas, '3D', 'STEP preview failed', [error.message]))
        })
      return
    }

    if (isGerber || isDrill || isDxf) {
      fetch(url)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.text()
        })
        .then(text => {
          if (cancelled) return
          const data = isDxf ? parseDxf(text) : isDrill ? parseDrill(text) : parseGerber(text)
          if (!data.draws.length) {
            renderPlaceholder(canvas, isDxf ? 'DXF' : isDrill ? 'DRL' : 'GBR', 'No drawable data found', ['The file loaded, but no preview primitives were detected.'])
            return
          }
          state.type = 'gerber'
          state.gerberData = data
          fitCanvas()
          renderGerber(canvas, data, state, label)
        })
        .catch(error => renderPlaceholder(canvas, isDxf ? 'DXF' : isDrill ? 'DRL' : 'GBR', `${label} preview failed`, [error.message]))
      return
    }

    renderPlaceholder(canvas, ext.toUpperCase(), 'Preview not available', ['Run AI Review for file-level engineering analysis.'])

    return () => {
      cancelled = true
    }
  }, [ext, fileName, isCadPlaceholder, isDrill, isDxf, isGerber, isMesh, isPCB, isSchematic, label, url])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let dragging = false
    let lastX = 0
    let lastY = 0
    let downX = 0
    let downY = 0
    let moved = 0

    const onMouseDown = (event: MouseEvent) => {
      dragging = true
      moved = 0
      lastX = event.clientX
      lastY = event.clientY
      downX = event.clientX
      downY = event.clientY
      canvas.style.cursor = 'grabbing'
      event.preventDefault()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!dragging) return
      const state = stateRef.current
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      moved += Math.abs(dx) + Math.abs(dy)

      if (state.type === 'mesh' && !(event.shiftKey || event.buttons === 2)) {
        state.angle += dx * 0.012
        state.tilt = Math.max(-1.45, Math.min(1.45, state.tilt + dy * 0.012))
      } else {
        state.offsetX += dx
        state.offsetY += dy
      }
      redraw()
    }

    const onMouseUp = () => {
      const state = stateRef.current
      if (dragging && moved < 6 && state.type === 'mesh' && state.meshData) {
        const frame = buildMeshFrame(canvas, state.meshData, state)
        if (frame) {
          const rect = canvas.getBoundingClientRect()
          const clickPoint: Point2 = [downX - rect.left, downY - rect.top]
          const picked = pickMeshInspection(state.meshData, frame, state, state.displayMode, clickPoint)
          setInspect(picked)
          if (picked) {
            redraw()
          }
        }
      }
      dragging = false
      canvas.style.cursor = 'grab'
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const state = stateRef.current
      const factor = event.deltaY < 0 ? 1.12 : 0.89
      state.scale = Math.max(0.05, Math.min(60, state.scale * factor))
      redraw()
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.style.cursor = 'grab'

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const observer = new ResizeObserver(() => {
      fitCanvas()
      redraw()
    })
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [])

  const canTransform = isMesh || isGerber || isDrill || isDxf

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 38,
        padding: '6px 10px',
        background: '#ffffff',
        borderBottom: '1px solid #dbe3ef',
        flexShrink: 0,
      }}>
        <span style={{
          background: '#eaf2ff',
          color: '#1d4ed8',
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 4,
          letterSpacing: 0,
        }}>
          {label}
        </span>

        {canTransform && (
          <span style={{ color: '#64748b', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isMesh ? 'Drag to rotate. Shift-drag to pan. Scroll to zoom.' : 'Drag to pan. Scroll to zoom.'}
          </span>
        )}

        <span style={{
          marginLeft: 'auto',
          color: '#334155',
          fontSize: 11,
          maxWidth: 260,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {fileName}
        </span>

        {canTransform && (
          <>
            <button style={buttonStyle} onClick={() => {
              Object.assign(stateRef.current, { scale: 1, offsetX: 0, offsetY: 0, angle: 0.6, tilt: 0.4 })
              redraw()
            }}>
              Fit
            </button>
            <button style={buttonStyle} onClick={() => {
              stateRef.current.scale = Math.min(60, stateRef.current.scale * 1.25)
              redraw()
            }}>
              +
            </button>
            <button style={buttonStyle} onClick={() => {
              stateRef.current.scale = Math.max(0.05, stateRef.current.scale * 0.8)
              redraw()
            }}>
              -
            </button>
          </>
        )}

        {(isMesh || isCadPlaceholder) && (
          <a href="https://3dviewer.net" target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>
            Open 3D
          </a>
        )}
        {(isGerber || isDrill) && (
          <a href="https://gerber.ucamco.com/" target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>
            Ucamco
          </a>
        )}
        {(isSchematic || isPCB) && (
          <a href="https://kicanvas.org" target="_blank" rel="noreferrer" style={{ ...buttonStyle, textDecoration: 'none' }}>
            KiCanvas
          </a>
        )}
      </div>

      <div ref={wrapperRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#ffffff' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        {inspect && (
          <div
            style={{
              position: 'absolute',
              left: inspect.x + 14,
              top: inspect.y + 14,
              width: 260,
              maxWidth: 'calc(100% - 24px)',
              background: 'rgba(255, 255, 255, 0.96)',
              border: '1px solid #cbd5e1',
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
              padding: '10px 12px',
              pointerEvents: 'auto',
              zIndex: 5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 12, color: '#0f172a' }}>{inspect.title}</strong>
              <button
                onClick={() => setInspect(null)}
                style={{
                  marginLeft: 'auto',
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                }}
                aria-label="Close inspection"
                title="Close inspection"
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, color: '#334155' }}>
              {inspect.lines.map(line => (
                <div key={line} style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#1d4ed8',
  fontSize: 11,
  padding: '4px 9px',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
}
