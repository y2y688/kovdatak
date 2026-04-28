import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { useChartTheme } from '../../hooks/useChartTheme'
import { CHART_DECIMALS } from '../../lib/constants'
import { formatNumber, formatPct, getDatePlayed } from '../../lib/utils'
import type { ScenarioRecord } from '../../types/ipc'
import { ChartBox } from '../shared/ChartBox'

type Props = {
  items: ScenarioRecord[]
}

export function ScenarioScoreAccHistoryChart({ items }: Props) {
  const colors = useChartTheme()

  const sorted = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => Date.parse(getDatePlayed(a.stats)) - Date.parse(getDatePlayed(b.stats)))
    return copy
  }, [items])

  const labels = useMemo(() => sorted.map(s => getDatePlayed(s.stats)), [sorted])
  const scores = useMemo(() => sorted.map(s => Number(s.stats['Score'] ?? 0)), [sorted])
  const accs = useMemo(() => sorted.map(s => Number(s.stats['Accuracy'] ?? 0)), [sorted])
  const scoreMinMax = useMemo(() => {
    if (!scores.length) return { min: 0, max: 1 }
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const v of scores) {
      if (!Number.isFinite(v)) continue
      if (v < min) min = v
      if (v > max) max = v
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 }
    const span = Math.max(1, max - min)
    const pad = span * 0.08
    return { min: Math.max(0, min - pad), max: max + pad }
  }, [scores])

  const data = useMemo(() => ({
    labels,
    datasets: [
      {
        label: '分数',
        data: scores,
        borderColor: colors.accent,
        backgroundColor: colors.accentSoft,
        yAxisID: 'yScore',
        tension: 0.2,
        pointRadius: 2,
      },
      {
        label: '准确率',
        data: accs,
        borderColor: colors.success,
        backgroundColor: colors.successSoft,
        yAxisID: 'yAcc',
        tension: 0.2,
        pointRadius: 2,
      },
    ],
  }), [labels, scores, accs, colors])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 260,
      easing: 'easeOutQuart' as const,
    },
    transitions: {
      show: {
        animations: {
          x: { from: 0 },
          yScore: { from: 0 },
          yAcc: { from: 0 },
        },
      },
      hide: {
        animations: {
          x: { to: 0 },
          yScore: { to: 0 },
          yAcc: { to: 0 },
        },
      },
    },
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { display: true, labels: { color: colors.textPrimary } },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.textPrimary,
        bodyColor: colors.textSecondary,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        callbacks: {
          label: (ctx: any) => {
            const label = String(ctx.dataset?.label ?? '')
            const v = Number(ctx.parsed?.y)
            if (label.includes('准确率')) return `${label}: ${formatPct(v, CHART_DECIMALS.pctTooltip)}`
            return `${label}: ${formatNumber(v, CHART_DECIMALS.numTooltip)}`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: colors.textSecondary, maxRotation: 0, autoSkip: true },
        grid: { color: colors.grid },
      },
      yScore: {
        type: 'linear' as const,
        position: 'left' as const,
        min: scoreMinMax.min,
        max: scoreMinMax.max,
        ticks: { color: colors.textSecondary, callback: (v: any) => formatNumber(v, 0) },
        grid: { color: colors.grid },
      },
      yAcc: {
        type: 'linear' as const,
        position: 'right' as const,
        suggestedMin: 0,
        suggestedMax: 1,
        ticks: { color: colors.textSecondary, callback: (v: any) => formatPct(v, 0) },
        grid: { drawOnChartArea: false },
      },
    },
  }), [colors, scoreMinMax.min, scoreMinMax.max])

  if (!sorted.length) return null

  return (
    <ChartBox title="每次记录：分数与准确率" height={260}>
      <div className="h-full">
        <Line data={data as any} options={options as any} />
      </div>
    </ChartBox>
  )
}

