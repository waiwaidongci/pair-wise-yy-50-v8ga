import { computed, ref, toRaw, watch } from 'vue'
import { defineStore } from 'pinia'

export type Page = { pageNo: number; name: string; width: number; height: number; bleed: number; content: string }
export type Position = { id: string; pageNo: number; x: number; y: number; rotation: number; front: boolean }
export type Validation = { id: string; severity: '错误' | '警告'; pageNo?: number; title: string; detail: string }
export type ExportTask = { id: string; name: string; progress: number; status: '排队中' | '生成中' | '已完成' | '已中断'; updatedAt: string; resumable: boolean }
export type ProofDecision = '待决定' | '通过' | '退回'
export type Proof = {
  id: string
  round: number
  date: string
  sample: string
  sampleFile: string
  deltaE: number
  maxDeltaE: number
  feedback: string
  correction: string
  owner: string
  decision: ProofDecision
  locked: boolean
  /** 锁定时关联的拼版版本；草稿始终对应当前工作版本 */
  lockedRevision?: string
  lockedAt?: string
  /** 退回后新开的一轮，指向上一轮记录 */
  supersedes?: string
  /** 决定做出时的阻断错误数（通过时必为 0） */
  blockingErrors: number
}
export type RevisionSnapshot = {
  revision: string
  proofId: string
  decision: Extract<ProofDecision, '通过' | '退回'>
  lockedAt: string
  pages: Page[]
  positions: Position[]
}
export type GateOutcome = { ok: boolean; reasons: string[]; errorCount: number; avgOk: boolean; maxOk: boolean }

export const AVG_DELTA_LIMIT = 2
export const MAX_DELTA_LIMIT = 3

export const sheetSpec = {
  width: 720,
  height: 1020,
  bleed: 3,
  safe: 5,
  gutter: 6,
  binding: '骑马订',
  grain: '纵向',
}

const seedPages: Page[] = [
  { pageNo: 1, name: '封面', width: 210, height: 297, bleed: 3, content: '潮汐来信 / 节目册' },
  { pageNo: 2, name: '版权页', width: 210, height: 297, bleed: 3, content: '版权与演职人员' },
  { pageNo: 3, name: '序言', width: 210, height: 297, bleed: 3, content: '导演手记' },
  { pageNo: 4, name: '剧照跨页左', width: 210, height: 297, bleed: 3, content: '第一幕剧照' },
  { pageNo: 5, name: '剧照跨页右', width: 210, height: 297, bleed: 3, content: '第一幕剧照延伸' },
  { pageNo: 6, name: '曲目表', width: 210, height: 297, bleed: 3, content: '曲目与时长' },
  { pageNo: 7, name: '创作团队', width: 210, height: 297, bleed: 3, content: '主创与制作团队' },
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

const seedProofs: Proof[] = [
  {
    id: 'PRF-01', round: 1, date: '2026-09-18', sample: '数字样张 v1', sampleFile: '数字样张_v1_0918.tif',
    deltaE: 3.8, maxDeltaE: 4.6, feedback: '封面夜空蓝偏紫，剧照暗部层次压缩。',
    correction: '调整 CMYK 曲线，黑色通道减少 4%。', owner: '周默 / 色彩管理',
    decision: '退回', locked: true, lockedRevision: 'R5', lockedAt: '2026-09-18 17:05', blockingErrors: 2,
  },
  {
    id: 'PRF-02', round: 2, date: '2026-09-25', sample: '数字样张 v2', sampleFile: '数字样张_v2_0925.tif',
    deltaE: 1.9, maxDeltaE: 2.4, feedback: '封面夜空蓝已校正，暗部层次恢复，整体色差可接受。',
    correction: '已重排 P7 版位并补足 3mm 出血，等待负责人决定。', owner: '林青 / 拼版',
    decision: '待决定', locked: false, blockingErrors: 0,
  },
]

// R5 为第 1 轮退回时锁定的归档版本：P2/P7 出血不足、P1 尚未按骑马订旋转
const seedR5Pages: Page[] = seedPages.map((page) => {
  if (page.pageNo === 2) return { ...page, bleed: 2 }
  if (page.pageNo === 7) return { ...page, bleed: 1 }
  return page
})
const seedR5Positions: Position[] = seedPositions.map((position) => (position.id === 'P-02' ? { ...position, rotation: 0 } : position))

const seedSnapshots: RevisionSnapshot[] = [
  { revision: 'R5', proofId: 'PRF-01', decision: '退回', lockedAt: '2026-09-18 17:05', pages: seedR5Pages, positions: seedR5Positions },
]

const seedTasks: ExportTask[] = [
  { id: 'EXP-0925-01', name: '印刷交付包 · PDF/X-4', progress: 72, status: '已中断', updatedAt: '09-25 16:42', resumable: true },
  { id: 'EXP-0925-02', name: '数字样张低分辨率预览', progress: 100, status: '已完成', updatedAt: '09-25 15:18', resumable: false },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function nowStamp() {
  return `${today()} ${new Date().toTimeString().slice(0, 5)}`
}

function nextRevision(revision: string) {
  return `R${Number(revision.slice(1)) + 1}`
}

export const useImpositionStore = defineStore('imposition', () => {
  const saved = localStorage.getItem('print-imposition-v2')
  const restored = saved ? JSON.parse(saved) : null
  const pages = ref<Page[]>(restored?.pages ?? structuredClone(seedPages))
  const positions = ref<Position[]>(restored?.positions ?? structuredClone(seedPositions))
  const proofs = ref<Proof[]>(restored?.proofs ?? structuredClone(seedProofs))
  const tasks = ref<ExportTask[]>(restored?.tasks ?? structuredClone(seedTasks))
  const snapshots = ref<RevisionSnapshot[]>(restored?.snapshots ?? structuredClone(seedSnapshots))
  const side = ref<'front' | 'back'>('front')
  const zoom = ref(72)
  const revision = ref(restored?.revision ?? 'R6')
  const selectedPosition = ref<string | null>(null)
  const selectedProof = ref('PRF-02')

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

  /** 当前工作版本是否已被某条审批记录锁定（锁定后画布只读，调整必须升版新开一轮） */
  const locked = computed(() => snapshots.value.some((snapshot) => snapshot.revision === revision.value))

  /** 生效记录：最近一次「通过」决定，车间以此版本生产 */
  const effectiveProof = computed(() => [...proofs.value].reverse().find((proof) => proof.decision === '通过' && proof.locked) ?? null)

  const currentDraft = computed(() => proofs.value.find((proof) => !proof.locked) ?? null)

  watch([pages, positions, proofs, tasks, snapshots, revision], () => {
    localStorage.setItem('print-imposition-v2', JSON.stringify({ pages: pages.value, positions: positions.value, proofs: proofs.value, tasks: tasks.value, snapshots: snapshots.value, revision: revision.value }))
  }, { deep: true })

  function evaluateGate(deltaE: number, maxDeltaE: number): GateOutcome {
    const errorCount = blockingErrorCount.value
    const avgOk = deltaE <= AVG_DELTA_LIMIT
    const maxOk = maxDeltaE <= MAX_DELTA_LIMIT
    const reasons: string[] = []
    if (errorCount > 0) reasons.push(`预检仍有 ${errorCount} 个阻断错误，必须全部处理后才能通过。`)
    if (!avgOk) reasons.push(`平均色差 ΔE ${deltaE.toFixed(1)} 超过限值 ${AVG_DELTA_LIMIT.toFixed(1)}。`)
    if (!maxOk) reasons.push(`单点最高 ΔE ${maxDeltaE.toFixed(1)} 超过限值 ${MAX_DELTA_LIMIT.toFixed(1)}。`)
    return { ok: reasons.length === 0, reasons, errorCount, avgOk, maxOk }
  }

  function updatePosition(id: string, patch: Partial<Position>) {
    if (locked.value) return
    const position = positions.value.find((item) => item.id === id)
    if (position) Object.assign(position, patch)
  }

  function updatePage(pageNo: number, patch: Partial<Page>) {
    if (locked.value) return
    const page = pages.value.find((item) => item.pageNo === pageNo)
    if (page) Object.assign(page, patch)
  }

  function addPosition(pageNo: number) {
    if (locked.value || positions.value.some((item) => item.pageNo === pageNo && item.front === (side.value === 'front'))) return
    positions.value.push({ id: `P-${Date.now().toString().slice(-3)}`, pageNo, x: 34, y: 44, rotation: 0, front: side.value === 'front' })
  }

  /** 草稿字段保存；已锁定记录拒绝任何覆盖 */
  function updateProof(id: string, patch: Partial<Proof>) {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof || proof.locked) return false
    Object.assign(proof, patch)
    return true
  }

  function takeSnapshot(proof: Proof, decision: '通过' | '退回') {
    snapshots.value = snapshots.value.filter((snapshot) => snapshot.revision !== revision.value)
    snapshots.value.push({
      revision: revision.value,
      proofId: proof.id,
      decision,
      lockedAt: nowStamp(),
      pages: structuredClone(toRaw(pages.value)),
      positions: structuredClone(toRaw(positions.value)),
    })
  }

  /** 通过：预检与色差门禁通过后，记录样张/反馈与当前拼版版本一并锁定 */
  function approveProof(id: string): GateOutcome {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof) return { ok: false, reasons: ['打样记录不存在。'], errorCount: blockingErrorCount.value, avgOk: false, maxOk: false }
    if (proof.locked) return { ok: false, reasons: ['该记录已锁定为只读归档，不能重复决定；继续调整请新开一轮。'], errorCount: blockingErrorCount.value, avgOk: false, maxOk: false }

    const gate = evaluateGate(proof.deltaE, proof.maxDeltaE)
    if (!gate.ok) return gate

    proof.decision = '通过'
    proof.locked = true
    proof.lockedRevision = revision.value
    proof.lockedAt = nowStamp()
    proof.blockingErrors = 0
    takeSnapshot(proof, '通过')
    return { ok: true, reasons: [], errorCount: 0, avgOk: true, maxOk: true }
  }

  /** 退回：原记录与当前版本原样保留锁定，调整内容进入新升版的新一份记录 */
  function rejectProof(id: string): GateOutcome {
    const proof = proofs.value.find((item) => item.id === id)
    if (!proof) return { ok: false, reasons: ['打样记录不存在。'], errorCount: blockingErrorCount.value, avgOk: false, maxOk: false }
    if (proof.locked) return { ok: false, reasons: ['该记录已锁定为只读归档，不能重复决定。'], errorCount: blockingErrorCount.value, avgOk: false, maxOk: false }

    proof.decision = '退回'
    proof.locked = true
    proof.lockedRevision = revision.value
    proof.lockedAt = nowStamp()
    proof.blockingErrors = blockingErrorCount.value
    takeSnapshot(proof, '退回')

    revision.value = nextRevision(revision.value)
    const next = createProof(proof.id)
    selectedProof.value = next.id
    return { ok: true, reasons: [], errorCount: 0, avgOk: true, maxOk: true }
  }

  function newProofId() {
    return `PRF-${Date.now().toString(36).slice(-5).toUpperCase()}`
  }

  function createProof(supersedes?: string): Proof {
    const round = proofs.value.reduce((max, proof) => Math.max(max, proof.round), 0) + 1
    const proof: Proof = {
      id: newProofId(),
      round,
      date: today(),
      sample: `数字样张 v${round}`,
      sampleFile: '',
      deltaE: 0,
      maxDeltaE: 0,
      feedback: '',
      correction: '',
      owner: '当前用户',
      decision: '待决定',
      locked: false,
      blockingErrors: blockingErrorCount.value,
      ...(supersedes ? { supersedes } : {}),
    }
    proofs.value.push(proof)
    selectedProof.value = proof.id
    return proof
  }

  /** 继续调整：工作版本已锁定时先升版，再新开一份草稿；已有草稿则直接进入 */
  function startNewRound(): Proof {
    if (locked.value) revision.value = nextRevision(revision.value)
    const existing = proofs.value.find((proof) => !proof.locked)
    if (existing) {
      selectedProof.value = existing.id
      return existing
    }
    return createProof()
  }

  function saveCandidateRevision() {
    if (locked.value) return
    revision.value = nextRevision(revision.value)
  }

  function snapshotByRevision(rev: string | undefined) {
    return rev ? snapshots.value.find((snapshot) => snapshot.revision === rev) ?? null : null
  }

  function proofRevision(proof: Proof) {
    return proof.locked ? proof.lockedRevision! : revision.value
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
    pages, positions, proofs, tasks, snapshots, side, zoom, revision, selectedPosition, selectedProof,
    validations, blockingErrorCount, locked, effectiveProof, currentDraft,
    evaluateGate, updatePosition, updatePage, addPosition, updateProof,
    approveProof, rejectProof, createProof, startNewRound, saveCandidateRevision,
    snapshotByRevision, proofRevision, resumeTask,
  }
})
