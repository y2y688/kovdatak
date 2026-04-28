import type { MousePoint } from '../types/ipc';
import { clamp, formatMmSs } from './utils';

export type Highlight = { startTs?: number; endTs?: number; color?: string }
export type Marker = { ts: number; color?: string; radius?: number; type?: 'circle' | 'cross' }

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00.00'
  const s = ms / 1000
  return formatMmSs(s, 2)
}

export function lerpRGB(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const b2 = Math.round(a[2] + (b[2] - a[2]) * t)
  return [r, g, b2]
}

// HSL转RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

// 根据速度获取颜色：低速=绿色(120°)，高速=红色(0°)
export function getAccelerationColor(t: number): [number, number, number] {
  // t: 0-1，速度从低到高
  // 低速：绿色 H=120°, S=70%, L=50%
  // 高加速度：红色 H=0°, S=80%, L=50°
  const h = 120 - t * 120  // 120° -> 0°
  const s = 70 + t * 10    // 70% -> 80%
  return hslToRgb(h, s, 50)
}

// 计算两点之间的距离（像素）
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

// 计算轨迹的速度数组，并返回最大速度用于归一化
export function calculateSpeeds(points: MousePoint[], startIdx: number, endIdx: number): { speeds: number[], maxV: number } {
  const speeds: number[] = []

  // 实时计算速度
  for (let i = startIdx; i < endIdx - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    const dt = (p2.ts - p1.ts) / 1000  // 毫秒转秒

    if (dt <= 0) {
      speeds.push(0)
      continue
    }

    const d = distance(p1.x, p1.y, p2.x, p2.y)
    const v = d / dt  // 像素/秒
    speeds.push(v)
  }
  // 最后一个点继承前一个速度
  speeds.push(speeds.length > 0 ? speeds[speeds.length - 1] : 0)

  const maxV = Math.max(...speeds, 1)  // 避免除零
  return { speeds, maxV }
}

export function findPointIndex(points: MousePoint[], targetMs: number): number {
  let lo = 0, hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (points[mid].ts < targetMs) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function getCanvasScale(cssW: number, cssH: number, baseW: number, baseH: number, zoom: number) {
  // Larger fixed padding + lower fit ratio to keep visible breathing room.
  const pad = 24
  const fitScale = Math.min((cssW - pad * 2) / baseW, (cssH - pad * 2) / baseH) * 0.78
  return fitScale * clamp(zoom, 0.1, 50)
}

export function renderTrace(
  ctx: CanvasRenderingContext2D,
  props: {
    width: number
    height: number
    points: MousePoint[]
    startIdx: number
    endIdx: number
    step: number
    base: any
    zoom: number
    center: { cx: number; cy: number }
    trailMode: 'all' | 'last2'
    clickMarkersMode: 'all' | 'hit' | 'click' | 'none' | 'hold'
    highlight?: Highlight
    markers?: Marker[]
    curT: number
    accentRGB: [number, number, number]
    dangerRGB: [number, number, number]
    startPointColor: string
    endPointColor: string
    highlightColor: string
    markerColor: string
    markerBorder: string
    trailFill: string
    trailStroke: string
    hitColor?: string  // 命中标记颜色
  }
) {
  const {
    width, height, points, startIdx, endIdx, step, base, zoom, center, trailMode, clickMarkersMode,
    highlight, markers, curT, accentRGB, dangerRGB, startPointColor, endPointColor,
    highlightColor, markerColor, markerBorder, trailFill, trailStroke, hitColor
  } = props
  const srcW = base.w
  const srcH = base.h
  const scale = getCanvasScale(width, height, srcW, srcH, zoom)
  const screenCX = width / 2
  const screenCY = height / 2
  const { cx, cy } = center
  const toX = (x: number) => screenCX + (x - cx) * scale
  const toY = (y: number) => screenCY + (y - cy) * scale

  // Do not draw the base bounding box. It visually exaggerates "edge sticking"
  // when a dense trace uses data-bounds fallback framing.

  // draw path with gradient and optional fade within last2 mode
  const count = Math.max(0, endIdx - startIdx)
  if (count >= 2) {
    const showLast2 = trailMode === 'last2'
    const tailStart = curT - 2000
    const segs = Math.ceil(count / step)
    let prev = points[startIdx]
    let drawnCount = 0
    const pad = 50 // pixel padding for culling

    // 计算速度用于颜色映射
    const { speeds, maxV } = calculateSpeeds(points, startIdx, endIdx)

    // 使用中位数作为基准，让颜色变化更明显
    const sorted = [...speeds].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? 200
    // 红色阈值设为中位数的2倍
    const threshold = Math.max(median * 2, 200)

    // 根据速度获取颜色（内部函数）
    const getColorForSegment = (segIdx: number): [number, number, number] => {
      // segIdx 对应的是线段索引，从 startIdx 开始
      const speedIdx = segIdx - startIdx
      if (speedIdx < 0 || speedIdx >= speeds.length) {
        // 调用导出函数，默认低速=绿色
        return getAccelerationColor(0)
      }
      // 速度小于阈值时为绿色，超过阈值才逐渐变红
      const t = clamp((speeds[speedIdx] - median) / (threshold - median), 0, 1)
      return getAccelerationColor(t)
    }

    for (let i = startIdx + step; i < endIdx; i += step) {
      const p = points[i]

      // Culling: Check if segment is visible
      const x1 = toX(prev.x)
      const y1 = toY(prev.y)
      const x2 = toX(p.x)
      const y2 = toY(p.y)

      if (
        (x1 < -pad && x2 < -pad) ||
        (x1 > width + pad && x2 > width + pad) ||
        (y1 < -pad && y2 < -pad) ||
        (y1 > height + pad && y2 > height + pad)
      ) {
        prev = p
        drawnCount++
        continue
      }

      let t = drawnCount / segs // 0..1 along drawn segment
      let alpha = 0.9
      if (showLast2) {
        const pt = p.ts
        const denom = Math.max(1, curT - tailStart)
        const ageT = clamp((pt - tailStart) / denom, 0, 1)
        t = ageT
        alpha = 0.15 + 0.85 * Math.pow(ageT, 1.1)
      }
      // 使用加速度颜色替代位置渐变
      const [r, g, b] = getColorForSegment(i)
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      prev = p
      drawnCount++
    }
    // Ensure last segment connects to the very last point if we skipped it
    const lastP = points[endIdx - 1]
    if (prev !== lastP) {
      const p = lastP
      const x1 = toX(prev.x)
      const y1 = toY(prev.y)
      const x2 = toX(p.x)
      const y2 = toY(p.y)

      // Only draw if visible
      if (!(
        (x1 < -pad && x2 < -pad) ||
        (x1 > width + pad && x2 > width + pad) ||
        (y1 < -pad && y2 < -pad) ||
        (y1 > height + pad && y2 > height + pad)
      )) {
        let t = 1
        let alpha = 0.9
        if (showLast2) {
          const pt = p.ts
          const denom = Math.max(1, curT - tailStart)
          const ageT = clamp((pt - tailStart) / denom, 0, 1)
          t = ageT
          alpha = 0.15 + 0.85 * Math.pow(ageT, 1.1)
        }
        // 使用速度颜色
        const lastSpeedIdx = speeds.length - 1
        const lastT = lastSpeedIdx >= 0 ? clamp(speeds[lastSpeedIdx] / maxV, 0, 1) : 0
        const [r, g, b] = getAccelerationColor(lastT)
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }
  }

  // draw endpoints (always draw the latest point; draw start if we have at least 2 points)
  if (count >= 1) {
    const first = points[startIdx]
    const last = points[endIdx - 1]
    if (trailMode === 'all' && count >= 2) {
      ctx.fillStyle = startPointColor
      ctx.beginPath()
      ctx.arc(toX(first.x), toY(first.y), 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = endPointColor
    ctx.beginPath()
    ctx.arc(toX(last.x), toY(last.y), 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // 绘制连续命中段：用线段连接连续命中的点
  if (count >= 2 && clickMarkersMode !== 'none' && clickMarkersMode !== 'click') {
    let inHitChain = false
    let chainStartIdx = -1
    for (let i = startIdx; i < endIdx; i++) {
      const p = points[i]
      const isHit = p.hit === true
      // 在 all 或 hit 模式下，显示命中点的连线
      const shouldShow = clickMarkersMode === 'all' || (clickMarkersMode === 'hit' && isHit)

      if (shouldShow && isHit) {
        if (!inHitChain) {
          inHitChain = true
          chainStartIdx = i
        }
        // 如果是最后一个点了，绘制整段
        if (i === endIdx - 1 && inHitChain && chainStartIdx < i) {
          ctx.strokeStyle = hitColor || 'rgba(16, 185, 129, 0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(toX(points[chainStartIdx].x), toY(points[chainStartIdx].y))
          for (let j = chainStartIdx + 1; j <= i; j++) {
            ctx.lineTo(toX(points[j].x), toY(points[j].y))
          }
          ctx.stroke()
        }
      } else {
        // 遇到非命中点：如果之前有连续命中段，绘制它
        if (inHitChain && chainStartIdx < i - 1) {
          ctx.strokeStyle = hitColor || 'rgba(16, 185, 129, 0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(toX(points[chainStartIdx].x), toY(points[chainStartIdx].y))
          for (let j = chainStartIdx + 1; j <= i - 1; j++) {
            ctx.lineTo(toX(points[j].x), toY(points[j].y))
          }
          ctx.stroke()
        }
        inHitChain = false
        chainStartIdx = -1
      }
    }
  }

  // 绘制按住段：用线段连接按住鼠标的点（all模式也显示）
  if ((count >= 2 && clickMarkersMode === 'hold') || (count >= 2 && clickMarkersMode === 'all')) {
    let inHoldChain = false
    let chainStartIdx = -1
    for (let i = startIdx; i < endIdx; i++) {
      const p = points[i]
      const isHolding = (p.buttons ?? 0) !== 0

      if (isHolding) {
        if (!inHoldChain) {
          inHoldChain = true
          chainStartIdx = i
        }
        // 如果是最后一个点了，绘制整段
        if (i === endIdx - 1 && inHoldChain && chainStartIdx < i) {
          ctx.strokeStyle = markerColor || 'rgba(255, 255, 255, 0.8)'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])  // 虚线表示按住
          ctx.beginPath()
          ctx.moveTo(toX(points[chainStartIdx].x), toY(points[chainStartIdx].y))
          for (let j = chainStartIdx + 1; j <= i; j++) {
            ctx.lineTo(toX(points[j].x), toY(points[j].y))
          }
          ctx.stroke()
          ctx.setLineDash([])
        }
      } else {
        // 遇到非按住点：如果之前有按住段，绘制它
        if (inHoldChain && chainStartIdx < i - 1) {
          ctx.strokeStyle = markerColor || 'rgba(255, 255, 255, 0.8)'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])  // 虚线表示按住
          ctx.beginPath()
          ctx.moveTo(toX(points[chainStartIdx].x), toY(points[chainStartIdx].y))
          for (let j = chainStartIdx + 1; j <= i - 1; j++) {
            ctx.lineTo(toX(points[j].x), toY(points[j].y))
          }
          ctx.stroke()
          ctx.setLineDash([])
        }
        inHoldChain = false
        chainStartIdx = -1
      }
    }
  }

  // Draw left-click press/release markers (white, smaller).
  // Hit markers are drawn in green to indicate successful hits.
  if (count >= 1 && clickMarkersMode !== 'none') {
    let prevLeft = ((points[startIdx].buttons ?? 0) & 1) !== 0
    // 仅点击模式：显示所有有点击的点（不管是否命中都用白色）
    const showStart = clickMarkersMode === 'all' || (clickMarkersMode === 'hit' && points[startIdx].hit) || (clickMarkersMode === 'click' && prevLeft) || (clickMarkersMode === 'hold' && prevLeft)
    if (showStart) {
      // 仅点击模式始终用白色，其他模式根据是否命中选择颜色
      const hitColorToUse = (clickMarkersMode === 'click' || clickMarkersMode === 'hold' || !points[startIdx].hit) ? markerColor : hitColor
      const forceWhite = clickMarkersMode === 'click' || clickMarkersMode === 'hold'
      drawMarker(ctx, toX(points[startIdx].x), toY(points[startIdx].y), true, hitColorToUse || markerColor, markerBorder, points[startIdx].hit, forceWhite)
    }
    for (let i = startIdx + 1; i < endIdx; i++) {
      const p = points[i]
      const curLeft = ((p.buttons ?? 0) & 1) !== 0
      if (curLeft !== prevLeft) {
        const showMarker = clickMarkersMode === 'all' || (clickMarkersMode === 'hit' && p.hit) || (clickMarkersMode === 'click' && curLeft) || (clickMarkersMode === 'hold' && curLeft)
        if (showMarker) {
          const hitColorToUse = (clickMarkersMode === 'click' || clickMarkersMode === 'hold' || !p.hit) ? markerColor : hitColor
          const forceWhite = clickMarkersMode === 'click' || clickMarkersMode === 'hold'
          drawMarker(ctx, toX(p.x), toY(p.y), curLeft, hitColorToUse || markerColor, markerBorder, p.hit, forceWhite)
        }
      }
      prevLeft = curLeft
    }
  }

  // Highlight overlay for selected segment
  if (highlight && (highlight.startTs || highlight.endTs)) {
    const hStartMs = highlight.startTs ?? points[0].ts
    const hEndMs = highlight.endTs ?? points[points.length - 1].ts
    if (Number.isFinite(hStartMs) && Number.isFinite(hEndMs)) {
      const i0 = Math.max(0, Math.min(points.length - 1, findPointIndex(points, hStartMs)))
      const i1 = Math.max(0, Math.min(points.length - 1, findPointIndex(points, hEndMs)))
      if (i1 > i0) {
        ctx.lineWidth = 2
        ctx.strokeStyle = highlight.color || highlightColor
        ctx.beginPath()
        ctx.moveTo(toX(points[i0].x), toY(points[i0].y))
        for (let i = i0 + 1; i <= i1; i++) {
          ctx.lineTo(toX(points[i].x), toY(points[i].y))
        }
        ctx.stroke()
        ctx.lineWidth = 1
      }
    }
  }

  // Draw optional external markers
  if (Array.isArray(markers) && markers.length > 0) {
    for (const m of markers) {
      const ms = m.ts
      const i = Math.max(0, Math.min(points.length - 1, findPointIndex(points, ms)))
      const sx = toX(points[i].x)
      const sy = toY(points[i].y)
      const col = m.color || markerColor
      const borderCol = markerBorder
      const r = m.radius ?? 3
      if (m.type === 'cross') {
        ctx.strokeStyle = col
        ctx.beginPath()
        ctx.moveTo(sx - r, sy)
        ctx.lineTo(sx + r, sy)
        ctx.moveTo(sx, sy - r)
        ctx.lineTo(sx, sy + r)
        ctx.stroke()
      } else {
        ctx.strokeStyle = borderCol
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
  }
}

function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, pressed: boolean, color: string, border: string, isHit: boolean = false, forceWhite: boolean = false) {
  const col = color || 'rgba(255,255,255,0.95)'
  const borderCol = border || 'rgba(0,0,0,0.12)'
  // forceWhite=true for click mode: use same size for all markers
  const radius = forceWhite ? 2 : (isHit ? 3.5 : 2)

  if (pressed) {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    // 命中标记使用更粗的边框
    ctx.strokeStyle = forceWhite ? borderCol : (isHit ? col : borderCol)
    ctx.lineWidth = forceWhite ? 1 : (isHit ? 1.5 : 1)
    ctx.stroke()
  }
  // 不显示按键抬起标记
}
