<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ImpositionCanvas from '../components/ImpositionCanvas.vue'
import { useImpositionStore, type Proof, type Validation } from '../stores/imposition'

const store = useImpositionStore()
const router = useRouter()

/** 已锁定（通过/退回）的记录，按轮次倒序；每份都冻结了各自的拼版版本 */
const lockedProofs = computed(() => store.proofs.filter((proof) => proof.snapshot).slice().reverse())
/** 对比基线：生效的通过版本优先，否则取最近一份锁定留档 */
const baseline = computed<Proof | null>(() => store.effectiveProof ?? lockedProofs.value[0] ?? null)
const historyRows = computed(() => lockedProofs.value.map((proof) => ({
  proof,
  active: baseline.value?.id === proof.id,
  effective: store.effectiveProof?.id === proof.id,
})))

type ChangeRow = { id: string; title: string; before: string; after: string; status: '变更' | '一致' }

const changes = computed<ChangeRow[]>(() => {
  const snapshot = baseline.value?.snapshot
  if (!snapshot) return []
  const rows: ChangeRow[] = []
  store.positions.forEach((current) => {
    const old = snapshot.positions.find((p) => p.id === current.id)
    if (!old) {
      rows.push({ id: current.id, title: `P${current.pageNo} 新增版位`, before: '—', after: `x ${current.x} / y ${current.y} / ${current.rotation}°`, status: '变更' })
      return
    }
    if (old.x !== current.x || old.y !== current.y) rows.push({ id: `${current.id}-pos`, title: `P${current.pageNo} 版位移动`, before: `x ${old.x} / y ${old.y}`, after: `x ${current.x} / y ${current.y}`, status: '变更' })
    if (old.rotation !== current.rotation) rows.push({ id: `${current.id}-rot`, title: `P${current.pageNo} 旋转调整`, before: `rotation ${old.rotation}°`, after: `rotation ${current.rotation}°`, status: '变更' })
  })
  snapshot.positions.forEach((old) => {
    if (!store.positions.some((p) => p.id === old.id)) rows.push({ id: `${old.id}-del`, title: `P${old.pageNo} 版位移除`, before: `x ${old.x} / ${old.rotation}°`, after: '—', status: '变更' })
  })
  store.pages.forEach((page) => {
    const oldPage = snapshot.pages.find((p) => p.pageNo === page.pageNo)
    if (oldPage && oldPage.bleed !== page.bleed) rows.push({ id: `bleed-${page.pageNo}`, title: `P${page.pageNo} 出血调整`, before: `bleed ${oldPage.bleed}mm`, after: `bleed ${page.bleed}mm`, status: '变更' })
  })
  return rows
})

const baselineErrors = computed(() => (baseline.value?.snapshot?.validations ?? []).filter((v: Validation) => v.severity === '错误').length)
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">VERSION COMPARE / 版本对比</p><h1>锁定版本与当前调整对比</h1><p class="muted">已通过的记录连同拼版快照锁定为生产版本；调整在新版本中进行，通过前不影响车间拿到的版本。</p></div>
      <div class="actions">
        <Button label="导出对比报告" icon="pi pi-file-export" outlined />
        <Button v-if="store.locked" label="当前版本已锁定" icon="pi pi-lock" disabled />
        <Button v-else label="去打样审批通过并锁定" icon="pi pi-check-circle" @click="router.push('/proofs')" />
      </div>
    </div>

    <div class="version-history panel">
      <div class="panel-head"><h3>版本与锁定记录</h3><span class="muted">通过 / 退回均冻结留档，不可再编辑</span></div>
      <div class="history-list">
        <div v-for="row in historyRows" :key="row.proof.id" :class="['history-row', { active: row.active, effective: row.effective }]" @click="store.selectedProof = row.proof.id">
          <i :class="row.effective ? 'pi pi-bolt' : 'pi pi-lock'" />
          <div>
            <strong>第 {{ row.proof.round }} 轮 · {{ row.proof.snapshot?.sample }} · {{ row.proof.revision }}</strong>
            <small>{{ row.proof.decidedAt?.slice(0, 10) }} · 平均 ΔE {{ row.proof.snapshot?.deltaE }} / 单点 {{ row.proof.snapshot?.maxDeltaE }} · 阻断错误 {{ row.proof.blockingErrors }}</small>
          </div>
          <Tag v-if="row.effective" value="生效生产版本" severity="success" />
          <Tag v-else :value="row.proof.decision" :severity="row.proof.decision === '退回' ? 'danger' : 'success'" />
        </div>
        <div v-if="!lockedProofs.length" class="empty-history">还没有锁定记录。</div>
      </div>
    </div>

    <div class="compare-grid">
      <section class="panel">
        <div class="panel-head">
          <h3>基线 {{ baseline?.revision ?? '—' }}</h3>
          <Tag v-if="baseline" :value="store.effectiveProof?.id === baseline.id ? '生效 · 只读' : '退回留档 · 只读'" :severity="store.effectiveProof?.id === baseline.id ? 'success' : 'danger'" />
        </div>
        <div v-if="baseline?.snapshot" class="canvas-box">
          <ImpositionCanvas :positions="baseline.snapshot.positions" side="front" :zoom="38" :selected="null" :validations="baseline.snapshot.validations" @update="() => {}" @select="() => {}" />
        </div>
        <div v-else class="canvas-empty">尚无锁定版本，第一份打样通过后这里会显示冻结的基线。</div>
        <div class="snapshot-meta" v-if="baseline?.snapshot">
          <span>{{ baseline.snapshot.sample }}</span>
          <small>阻断错误 {{ baselineErrors }} 个 · 决定 {{ baseline.decidedAt?.replace('T', ' ').slice(0, 16) }}</small>
        </div>
      </section>
      <section class="panel candidate">
        <div class="panel-head">
          <h3>当前工作版 {{ store.revision }}</h3>
          <Tag :value="store.locked ? '已锁定（即生效版本）' : `${changes.length} 项未锁定变更`" :severity="store.locked ? 'success' : 'warn'" />
        </div>
        <div class="canvas-box"><ImpositionCanvas :positions="store.positions" side="front" :zoom="38" :selected="null" :validations="store.validations" @update="() => {}" @select="() => {}" /></div>
        <div class="snapshot-meta">
          <span>车间当前仍按生效版本 {{ store.effectiveProof?.revision ?? '—' }} 生产</span>
          <small>工作版需在打样审批通过后才会锁定生效</small>
        </div>
      </section>
    </div>

    <section class="panel change-panel">
      <div class="panel-head"><h3>版式变更差异</h3><span class="muted">{{ baseline ? `${baseline.revision} → ${store.revision}` : '—' }} · {{ changes.length }} 项</span></div>
      <div class="change-list">
        <article v-for="change in changes" :key="change.id">
          <i class="pi pi-pencil" />
          <div><strong>{{ change.title }}</strong><div class="diff"><span class="before">{{ change.before }}</span><i class="pi pi-arrow-right" /><span class="after">{{ change.after }}</span></div></div>
          <Tag :value="change.status" severity="warn" />
        </article>
        <div v-if="!changes.length" class="no-change">当前工作版与基线一致，或尚无锁定基线。</div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; }
.version-history { margin-bottom: 14px; }
.history-list { display: flex; gap: 10px; padding: 12px 16px 16px; overflow-x: auto; }
.history-row { display: flex; align-items: center; gap: 10px; min-width: 290px; padding: 11px 13px; border: 1px solid #e2e8e9; border-radius: 8px; cursor: pointer; }
.history-row.active { border-color: #5d9693; background: #f0f6f5; }
.history-row.effective { border-color: #d9b077; background: #fdf7ed; }
.history-row > i { font-size: 15px; color: #8aa0a3; }
.history-row.effective > i { color: #c98236; }
.history-row strong, .history-row small { display: block; }
.history-row strong { font-size: 11px; }
.history-row small { margin-top: 4px; color: #82909a; font-size: 9px; }
.history-row > div { flex: 1; min-width: 0; }
.empty-history { padding: 12px; color: #82909a; font-size: 11px; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.candidate { border-color: #5d9693; }
.canvas-box { height: 440px; overflow: auto; padding: 12px; background: #35474d; }
.canvas-empty { display: grid; height: 440px; place-items: center; color: #8ea0a4; background: #35474d; font-size: 12px; text-align: center; padding: 20px; }
.snapshot-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 16px; font-size: 11px; }
.snapshot-meta small { color: #8a969b; }
.change-panel { overflow: hidden; }
.change-list article { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #edf1f1; }
.change-list article > i { color: #5d8b93; }
.change-list strong { font-size: 12px; }
.no-change { padding: 22px; color: #82909a; font-size: 11px; text-align: center; }
.diff { display: flex; align-items: center; gap: 8px; margin-top: 7px; font-family: monospace; font-size: 10px; }
.diff span { padding: 4px 6px; border-radius: 4px; }
.before { color: #9f4c38; background: #fff0ec; }
.after { color: #2d735b; background: #e9f5ef; }
@media (max-width: 1000px) { .compare-grid { grid-template-columns: 1fr; } }
</style>
