import { computed, ref, toRaw, watch } from 'vue'
import { defineStore } from 'pinia'

export type Page = { pageNo: number; name: string; width: number; height: number; bleed: number; content: string }
export type Position = { id: string; pageNo: number; x: number; y: number; rotation: number; front: boolean }
export type Validation = { id: string; severity: '错误' | '警告'; pageNo?: number; title: string; detail: string }
export type Decision = '待决定' | '通过' | '退回'
export type Proof = {
  id: string
  round: number
  date: string
  sample: string
  deltaE: number
  maxDeltaE: number
  feedback: string
  correction: string
  owner: string
  decision: Decision
  /** 决定（通过/退回）时所在的拼版版本；待决定记录为 null */
  revision: string | null
  /** 决定时间戳；待决定记录为 null */
  decidedAt: string | null
  /** 决定时的预检阻断错误数，随记录一起冻结 */
  blockingErrors: number
  /** 通过/退回时锁定的样张、反馈与拼版快照；待决定记录为 null */
  snapshot: ProofSnapshot | null
}
export type ProofSnapshot = {
  sample: string
  feedback: string
  correction: string
  owner: string
  deltaE: number
  maxDeltaE: number
  revision: string
  positions: Position[]
  pages: Page[]
  validations: Validation[]
  decidedAt: string
}
export type ExportTask = { id: string; name: string; progress: number; status: '排队中' | '生成中' | '已完成' | '已中断'; updatedAt: string; resumable: boolean }

export const sheetSpec = {
  width: 720,
  height: 1020,
  bleed: 3,
  safe: 5,
  gutter: 6,
  binding: '骑马订',
  grain: '纵向',
}

/** 通过阈值：平均 ΔE ≤ 2，单点最高 ΔE ≤ 3 */
export const colorThreshold = { avg: 2, max: 3 }

const seedPages: Page[] = [
  { pageNo: 1, name: '封面', width: 210, height: 297, bleed: 3, content: '潮汐来信 / 节目册' },
  { pageNo: 2, name: '版权页', width: 210, height: 297, bleed: 2, content: '版权与演职人员' },
  { pageNo: 3, name: '序言', width: 210, height: 297, bleed: 3, content: '导演手记' },
  { pageNo: 4, name: '剧照跨页左', width: 210, height: 297, bleed: 3, content: '第一幕剧照' },
  { pageNo: 5, name: '剧照跨页右', width: 210, height: 297, bleed: 3, content: '第一幕剧照延伸' },
  { pageNo: 6, name: '曲目表', width: 210, height: 297, bleed: 3, content: '曲目与时长' },
  { pageNo: 7, name: '创作团队', width: 210, height: 297, bleed: 1, content: '主创与制作团队' },
  { pageNo: 8, name: '封底', width: 210, height: 297, bleed: 3, content: '巡演信息' },
]

const seedPositions: Position[] = [
  { id: 'P-01', pageNo: 8, x: 34, y: 44, rotation: 0, front: true },
  { id: 'P-02', pageNo: 1, x: 372, y: 44, rotation: 180, front: true },
  { id: 'P-03', pageNo: 6, x: 34, y: 548, rotation: 180, front: true },
  { id: 'P-04', pageNo: 3, x: 372, y: 548, rotation: 0, front: true },
  { id: 'P-05', pageNo: 2, x: 34, y: 44, rotation: 0, front: false },
  { id: 'P-06', pageNo: 7, x: 372, y: 44, rotation: 180, front: false },
  { id: 'P-07', pageNo: 4, x: 34, y: 548, rotation: 0, front: false },
  { id: 'P-08', pageNo: 5, x: 372, y: 548, rotation: 180, front: false },
]

/** 第 1 轮（R5）退回时冻结的拼版：P7 出血尚未补齐，与现状略有位移，供版本对比使用 */
const seedR5Positions: Position[] = structuredClone(seedPositions).map((position) =>
  position.pageNo === 7 ? { ...position, x: 354 } : position,
)

function seedValidationsFor(positions: Position[]): Validation[] {
  const issues: Validation[] = []
  const placedPages = positions.map((position) => position.pageNo)
  seedPages.forEach((page) => {
    if (!placedPages.includes(page.pageNo)) issues.push({ id: `missing-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 尚未拼版`, detail: `${page.name} 未出现在正反版位中。` })
    if (page.bleed < sheetSpec.bleed) issues.push({ id: `bleed-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 出血不足`, detail: `页面出血 ${page.bleed}mm，低于印刷要求 ${sheetSpec.bleed}mm。` })
  })
  return issues
}

const r5Validations = seedValidationsFor(seedR5Positions)

const seedProofs: Proof[] = [
  {
    id: 'PRF-01', round: 1, date: '2026-09-18', sample: '数字样张 v1', deltaE: 3.8, maxDeltaE: 4.6,
    feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。', correction: '调整 CMYK 曲线，黑色通道减少 4%。',
    owner: '周默 / 色彩管理', decision: '退回', revision: 'R5', decidedAt: '2026-09-18T17:20:00',
    blockingErrors: 1,
    snapshot: {
      sample: '数字样张 v1', feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。', correction: '调整 CMYK 曲线，黑色通道减少 4%。',
      owner: '周默 / 色彩管理', deltaE: 3.8, maxDeltaE: 4.6, revision: 'R5',
      positions: seedR5Positions, pages: structuredClone(seedPages), validations: r5Validations, decidedAt: '2026-09-18T17:20:00',
    },
  },
  {
    id: 'PRF-02', round: 2, date: '2026-09-25', sample: '数字样张 v2', deltaE: 1.9, maxDeltaE: 2.6,
    feedback: '整体色差改善，P7 出血仍不足。', correction: '重排 P7 版位并增加 2mm 出血。',
    owner: '林青 / 拼版', decision: '待决定', revision: null, decidedAt: null, blockingErrors: 0, snapshot: null,
  },
]

const seedTasks: ExportTask[] = [
  { id: 'EXP-0925-01', name: '印刷交付包 · PDF/X-4', progress: 72, status: '已中断', updatedAt: '09-25 16:42', resumable: true },
  { id: 'EXP-0925-02', name: '数字样张低分辨率预览', progress: 100, status: '已完成', updatedAt: '09-25 15:18', resumable: false },
]

/** 兼容旧版本 localStorage：补齐新增字段，已做决定的记录一律视为锁定留档 */
function normalizeProof(raw: Partial<Proof> & Record<string, unknown>, index: number, all: Array<Partial<Proof>>): Proof {
  const decision: Decision = raw.decision === '通过' || raw.decision === '退回' ? raw.decision : '待决定'
  const revision = (raw.revision as string | null) ?? (decision === '待决定' ? null : `R${Math.max(1, all.length - index)}`)
  const snapshot = (raw.snapshot as ProofSnapshot | null) ?? null
  return {
    id: String(raw.id ?? `PRF-${index + 1}`),
    round: Number(raw.round ?? index + 1),
    date: String(raw.date ?? ''),
    sample: String(raw.sample ?? ''),
    deltaE: Number(raw.deltaE ?? 0),
    maxDeltaE: Number(raw.maxDeltaE ?? raw.deltaE ?? 0),
    feedback: String(raw.feedback ?? ''),
    correction: String(raw.correction ?? ''),
    owner: String(raw.owner ?? ''),
    decision,
    revision,
    decidedAt: (raw.decidedAt as string | null) ?? (decision === '待决定' ? null : revision),
    blockingErrors: Number(raw.blockingErrors ?? 0),
    snapshot,
  }
}

export const useImpositionStore = defineStore('imposition', () => {
  const saved = localStorage.getItem('print-imposition-v1')
  const restored = saved ? JSON.parse(saved) : null
  const pages = ref<Page[]>(restored?.pages ? restored.pages.map((p: Page) => ({ ...p })) : structuredClone(seedPages))
  const positions = ref<Position[]>(restored?.positions ? restored.positions.map((p: Position) => ({ ...p })) : structuredClone(seedPositions))
  const proofs = ref<Proof[]>(restored?.proofs ? (restored.proofs as Array<Partial<Proof>>).map(normalizeProof) : structuredClone(seedProofs))
  const tasks = ref<ExportTask[]>(restored?.tasks ?? structuredClone(seedTasks))
  const side = ref<'front' | 'back'>('front')
  const zoom = ref(72)
  const revision = ref(restored?.revision ?? 'R6')
  const selectedPosition = ref<string | null>(null)
  const selectedProof = ref(restored?.selectedProof ?? 'PRF-02')

  const validations = computed<Validation[]>(() => {
    const issues: Validation[] = []
    const placedPages = positions.value.map((position) => position.pageNo)
    pages.value.forEach((page) => {
      if (!placedPages.includes(page.pageNo)) issues.push({ id: `missing-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 尚未拼版`, detail: `${page.name} 未出现在正反版位中。` })
      if (page.bleed < sheetSpec.bleed) issues.push({ id: `bleed-${page.pageNo}`, severity: '错误', pageNo: page.pageNo, title: `P${page.pageNo} 出血不足`, detail: `页面出血 ${page.bleed}mm，低于印刷要求 ${sheetSpec.bleed}mm。` })
    })
    for (let index = 0; index < positions.value.length; index += 1) {
      for (let next = index + 1; next < positions.value.length; next += 1) {
        const a = positions.value[index]
        const b = positions.value[next]
        if (a.front === b.front && Math.abs(a.x - b.x) < 320 && Math.abs(a.y - b.y) < 430) {
          issues.push({ id: `overlap-${a.id}-${b.id}`, severity: '错误', pageNo: a.pageNo, title: `${a.id} 与 ${b.id} 版位重叠`, detail: '当前纸张尺寸下页面之间不足安全间隙。' })
        }
      }
    }
    const frontOrder = positions.value.filter((item) => item.front).sort((a, b) => a.x - b.x || a.y - b.y).map((item) => item.pageNo)
    if (frontOrder[0] !== 1) issues.push({ id: 'binding-order', severity: '警告', pageNo: 1, title: '骑马订正版页序需要复核', detail: `当前首位为 P${frontOrder[0]}，装订方向规则期望封面位于首版位。` })
    return issues
  })

  const blockingErrorCount = computed(() => validations.value.filter((item) => item.severity === '错误').length)

  /** 待决定（编辑中）的打样记录 */
  const pendingProof = computed(() => proofs.value.find((proof) => proof.decision === '待决定') ?? null)
  /** 最近一次通过的记录，即当前车间生效的生产版本 */
  const effectiveProof = computed(() => [...proofs.value].reverse().find((proof) => proof.decision === '通过') ?? null)
  /** 生效记录锁定时，拼版工作区只读 */
  const locked = computed(() => effectiveProof.value?.revision === revision.value)

  /** 保存（通过）前的阻断校验：预检错误、平均色差、单点色差任一不达标即不允许通过 */
  function approvalBlockers(proof: Pick<Proof, 'deltaE' | 'maxDeltaE'>, errors = blockingErrorCount.value) {
    const blockers: string[] = []
    if (errors > 0) blockers.push(`预检仍有 ${errors} 个阻断错误`)
    if (proof.deltaE > colorThreshold.avg) blockers.push(`平均色差 ΔE ${proof.deltaE.toFixed(1)} 超过 ${colorThreshold.avg.toFixed(1)}`)
    if (proof.maxDeltaE > colorThreshold.max) blockers.push(`单点最高 ΔE ${proof.maxDeltaE.toFixed(1)} 超过 ${colorThreshold.max.toFixed(1)}`)
    return blockers
  }

  watch([pages, positions, proofs, tasks, revision, selectedProof], () => {
    localStorage.setItem('print-imposition-v1', JSON.stringify({ pages: pages.value, positions: positions.value, proofs: proofs.value, tasks: tasks.value, revision: revision.value, selectedProof: selectedProof.value }))
  }, { deep: true })

  function updatePosition(id: string, patch: Partial<Position>) {
    if (locked.value) return
    const position = positions.value.find((item) => item.id === id)
    if (position) Object.assign(position, patch)
  }

  function addPosition(pageNo: number) {
    if (locked.value || positions.value.some((item) => item.pageNo === pageNo && item.front === (side.value === 'front'))) return
    positions.value.push({ id: `P-${Date.now().toString().slice(-3)}`, pageNo, x: 34, y: 44, rotation: 0, front: side.value === 'front' })
  }

  function nextRevision() {
    return `R${Math.max(...proofs.value.map((proof) => Number((proof.revision ?? revision.value).slice(1))), Number(revision.value.slice(1))) + 1}`
  }

  /**
   * 仅允许保存“待决定”记录的草稿；
   * 已通过 / 已退回的记录连同快照锁定，任何编辑都被拒绝，需要新开一轮。
   */
  function saveProofDraft(id: string, patch: Partial<Proof>) {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof || proof.decision !== '待决定') return
    Object.assign(proof, patch)
  }

  function freezeSnapshot(proof: Proof, revisionValue: string, decidedAt: string): ProofSnapshot {
    return {
      sample: proof.sample,
      feedback: proof.feedback,
      correction: proof.correction,
      owner: proof.owner,
      deltaE: proof.deltaE,
      maxDeltaE: proof.maxDeltaE,
      revision: revisionValue,
      positions: structuredClone(toRaw(positions.value)),
      pages: structuredClone(toRaw(pages.value)),
      validations: structuredClone(toRaw(validations.value)),
      decidedAt,
    }
  }

  /** 通过：预检与色差达标后，把样张、反馈和当前拼版版本一起锁定为生效生产版本 */
  function approveProof(id: string): { ok: boolean; blockers: string[] } {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof) return { ok: false, blockers: ['记录不存在'] }
    if (proof.decision !== '待决定') return { ok: false, blockers: ['该记录已锁定，不能重复决定'] }
    const blockers = approvalBlockers(proof)
    if (blockers.length) return { ok: false, blockers }
    const decidedAt = new Date().toISOString()
    Object.assign(proof, { decision: '通过' as Decision, revision: revision.value, decidedAt, blockingErrors: 0, snapshot: freezeSnapshot(proof, revision.value, decidedAt) })
    return { ok: true, blockers: [] }
  }

  /**
   * 退回：保留原记录和它引用的版本，仅冻结留痕；
   * 随后的调整进入新开的下一轮（新版本），不覆盖旧记录。
   */
  function rejectProof(id: string, reason?: string): { ok: boolean; blockers: string[]; newId?: string } {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof) return { ok: false, blockers: ['记录不存在'] }
    if (proof.decision !== '待决定') return { ok: false, blockers: ['该记录已锁定，不能重复决定'] }
    const decidedAt = new Date().toISOString()
    if (reason) proof.feedback = reason
    Object.assign(proof, { decision: '退回' as Decision, revision: revision.value, decidedAt, blockingErrors: blockingErrorCount.value, snapshot: freezeSnapshot(proof, revision.value, decidedAt) })

    const round = proofs.value.length + 1
    const newRevision = nextRevision()
    revision.value = newRevision
    const newId = `PRF-${String(proofs.value.length + 1).padStart(2, '0')}`
    proofs.value.push({
      id: newId, round, date: new Date().toISOString().slice(0, 10), sample: `数字样张 v${round}`,
      deltaE: 0, maxDeltaE: 0, feedback: '', correction: '', owner: '当前用户',
      decision: '待决定', revision: null, decidedAt: null, blockingErrors: 0, snapshot: null,
    })
    selectedProof.value = newId
    return { ok: true, blockers: [], newId }
  }

  /** 通过后需要继续调整：旧通过记录保留查看，新开一轮并把拼版解锁到新版本 */
  function startRevisionRound() {
    if (pendingProof.value) {
      selectedProof.value = pendingProof.value.id
      return pendingProof.value.id
    }
    const round = proofs.value.length + 1
    const newRevision = nextRevision()
    revision.value = newRevision
    const newId = `PRF-${String(proofs.value.length + 1).padStart(2, '0')}`
    proofs.value.push({
      id: newId, round, date: new Date().toISOString().slice(0, 10), sample: `数字样张 v${round}`,
      deltaE: 0, maxDeltaE: 0, feedback: '', correction: '', owner: '当前用户',
      decision: '待决定', revision: null, decidedAt: null, blockingErrors: 0, snapshot: null,
    })
    selectedProof.value = newId
    return newId
  }

  function resumeTask(id: string) {
    const task = tasks.value.find((item) => item.id === id)
    if (task && task.resumable) {
      task.status = '生成中'
      task.progress = Math.max(task.progress, 10)
      task.updatedAt = '刚刚'
    }
  }

  return {
    pages, positions, proofs, tasks, side, zoom, revision, selectedPosition, selectedProof,
    validations, blockingErrorCount, pendingProof, effectiveProof, locked,
    approvalBlockers, updatePosition, addPosition, saveProofDraft, approveProof, rejectProof, startRevisionRound, resumeTask,
  }
})
