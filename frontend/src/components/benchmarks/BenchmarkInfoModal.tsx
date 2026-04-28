import { Check, ChevronDown, ChevronUp, LayoutDashboard, Minus, NotebookPen, Play, Sparkles, Trophy, Zap } from 'lucide-react'
import { Modal } from '../shared/Modal'

type BenchmarkInfoModalProps = {
  isOpen: boolean
  onClose: () => void
}

export function BenchmarkInfoModal({ isOpen, onClose }: BenchmarkInfoModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="基准测试跟踪信息" width={650} height="auto">
      <div className="p-6 space-y-8 text-sm text-secondary">

        {/* Overview */}
        <div className="space-y-3">
          <h3 className="text-primary font-medium flex items-center gap-2">
            <LayoutDashboard size={16} className="text-accent" />
            概览
          </h3>
          <p>
            此仪表板跟踪您在各种场景中的进度，按类别组织。
            它提供您技能水平的综合视图，帮助您识别优势、劣势以及接下来应该练习什么以有效提高。
          </p>
        </div>

        {/* Recommendations */}
        <div className="space-y-3">
          <h3 className="text-primary font-medium flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            推荐
          </h3>
          <p>
            RefleK's 分析您最近的会话、表现趋势和疲劳程度来推荐场景。
          </p>

          <div className="bg-surface-3/50 p-4 rounded border border-primary/50">
            <div className="flex flex-wrap gap-6 text-xs text-secondary">
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center -space-y-1.5 text-accent"><ChevronUp size={12} /><ChevronUp size={12} /></div>
                <span>首选</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center -space-y-1.5 text-success"><ChevronUp size={12} /><ChevronUp size={12} /></div>
                <span>强烈推荐</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center -space-y-1.5 text-success"><ChevronUp size={12} /></div>
                <span>推荐</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center -space-y-1.5 text-warning"><ChevronUp size={12} /></div>
                <span>考虑练习</span>
              </div>
              <div className="flex items-center gap-2">
                <Minus size={12} className="text-tertiary" />
                <span>中性</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center -space-y-1.5 text-warning"><ChevronDown size={12} /></div>
                <span>考虑切换</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center -space-y-1.5 text-danger"><ChevronDown size={12} /><ChevronDown size={12} /></div>
                <span>停止/切换</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={12} className="text-tertiary" />
                <span>已完成</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-3/30 p-3 rounded text-xs space-y-2">
            <p><span className="text-accent font-medium">首选</span>是基于以下因素的特殊推荐：</p>
            <ul className="list-disc list-inside ml-1 space-y-1 text-tertiary">
              <li>高推荐分数（表现 + 提升潜力）</li>
              <li>类别多样性（确保平衡的练习）</li>
              <li>最近的关注领域</li>
            </ul>
          </div>
        </div>

        {/* Progress & Ranks */}
        <div className="space-y-3">
          <h3 className="text-primary font-medium flex items-center gap-2">
            <Trophy size={16} className="text-accent" />
            进度与等级
          </h3>
          <p>
            每个场景都有等级阈值（例如：铁、铜、银）。进度条显示您距离达到下一个等级有多近。
          </p>
          <ul className="list-disc list-inside space-y-1 ml-1 text-tertiary">
            <li><span className="text-primary">填充条：</span> 向下一个等级阈值的进度。</li>
            <li><span className="text-primary">颜色：</span> 您已达到的等级层级。</li>
            <li><span className="text-primary">分数：</span> 您当前的最高分。</li>
          </ul>
        </div>

        {/* Features */}
        <div className="space-y-3">
          <h3 className="text-primary font-medium flex items-center gap-2">
            <Zap size={16} className="text-accent" />
            工具与功能
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded bg-surface-3 text-primary shrink-0">
                <NotebookPen size={14} />
              </div>
              <div className="text-xs">
                <span className="text-primary font-medium block mb-0.5">笔记与灵敏度</span>
                为每个场景保存策略笔记和特定的灵敏度设置。
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded bg-surface-3 text-primary shrink-0">
                <Play size={14} />
              </div>
              <div className="text-xs">
                <span className="text-primary font-medium block mb-0.5">快速播放</span>
                直接在 Kovaak's 中启动场景。
              </div>
            </div>
          </div>
        </div>

      </div>
    </Modal>
  )
}
