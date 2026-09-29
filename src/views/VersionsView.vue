<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ImpositionCanvas from '../components/ImpositionCanvas.vue'
import { useImpositionStore, type RevisionSnapshot } from '../stores/imposition'

const router = useRouter()
const store = useImpositionStore()

type Change = { id: string; title: string; before: string; after: string }

const baselineRevision = ref<string | null>(null)
const orderedSnapshots = computed(() => [...store.snapshots].sort((a, b) => b.revision.localeCompare(a.revision, undefined, { numeric: true })))
watch(orderedSnapshots, (list) => {
  if (!list.some((item) => item.revision === baselineRevision.value)) baselineRevision.value = list[0]?.revision ?? null
}, { immediate: true })

const baseline = computed<RevisionSnapshot | null>(() => orderedSnapshots.value.find((item) => item.revision === baselineRevision.value) ?? null)
const baselineProof = computed(() => {
  const snap = baseline.value
  return snap ? store.proofs.find((proof) => proof.id === snap.proofId) ?? null : null
})

const changes = computed<Change[]>(() => {
  const snap = baseline.value
  if (!snap) return []
  const result: Change[] = []
  store.positions.forEach((current) => {
    const before = snap.positions.find((item) => item.id === current.id)
    if (!before) {
      result.push({ id: `add-${current.id}`, title: `${current.id}（P${current.pageNo}）新增版位`, before: '不存在', after: `x ${current.x} / y ${current.y} / 旋转 ${current.rotation}°` })
      return
    }
    const diffs: string[] = []
    if (before.x !== current.x) diffs.push('X 坐标')
    if (before.y !== current.y) diffs.push('Y 坐标')
    if (before.rotation !== current.rotation) diffs.push('旋转')
    if (diffs.length) result.push({ id: `pos-${current.id}`, title: `${current.id}（P${current.pageNo}）${diffs.join('、')}调整`, before: `x ${before.x} / y ${before.y} / 旋转 ${before.rotation}°`, after: `x ${current.x} / y ${current.y} / 旋转 ${current.rotation}°` })
  })
  snap.positions.forEach((before) => {
    if (!store.positions.some((item) => item.id === before.id)) {
      result.push({ id: `del-${before.id}`, title: `${before.id}（P${before.pageNo}）版位移除`, before: `x ${before.x} / y ${before.y}`, after: '不存在' })
    }
  })
  store.pages.forEach((current) => {
    const before = snap.pages.find((item) => item.pageNo === current.pageNo)
    if (before && before.bleed !== current.bleed) {
      result.push({ id: `bleed-P${current.pageNo}`, title: `P${current.pageNo} ${current.name}出血调整`, before: `bleed ${before.bleed}mm`, after: `bleed ${current.bleed}mm` })
    }
  })
  return result
})
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">VERSION COMPARE / 版本对比</p><h1>拼版版本并排审阅</h1><p class="muted">左侧为审批锁定的归档版本（只读），右侧为当前工作版；车间以最近一次通过的生效版本生产。</p></div>
      <div class="actions">
        <Button label="导出对比报告" icon="pi pi-file-export" outlined />
        <Button label="前往打样审批" icon="pi pi-check-circle" @click="router.push('/proofs')" />
      </div>
    </div>

    <div class="effective-strip panel">
      <template v-if="store.effectiveProof">
        <i class="pi pi-verified" />
        <div>
          <strong>生效记录：第 {{ store.effectiveProof.round }} 轮 · {{ store.effectiveProof.sample }}</strong>
          <small>版本 {{ store.effectiveProof.lockedRevision }} · 平均 ΔE {{ store.effectiveProof.deltaE }} / 单点最高 {{ store.effectiveProof.maxDeltaE }} · {{ store.effectiveProof.lockedAt }} 锁定，车间按此版本生产</small>
        </div>
        <Tag value="通过 · 已锁定" severity="success" />
      </template>
      <template v-else>
        <i class="pi pi-info-circle warn" />
        <div>
          <strong>暂无生效记录</strong>
          <small>尚无打样记录通过门禁，当前工作版 {{ store.revision }} 不能下发车间。</small>
        </div>
        <Tag value="未生效" severity="warn" />
      </template>
    </div>

    <div class="compare-grid">
      <section class="panel baseline">
        <div class="panel-head">
          <h3>锁定归档版本
            <Select v-model="baselineRevision" :options="orderedSnapshots.map((s) => s.revision)" :disabled="orderedSnapshots.length <= 1" size="small" />
          </h3>
          <span class="head-tags">
            <Tag v-if="baselineProof" :value="`第 ${baselineProof.round} 轮 · ${baselineProof.decision}`" :severity="baselineProof.decision === '通过' ? 'success' : 'danger'" />
            <Tag value="只读" />
          </span>
        </div>
        <div v-if="baseline" class="canvas-box">
          <ImpositionCanvas :positions="baseline.positions" side="front" :zoom="38" :selected="null" :validations="[]" @update="() => {}" @select="() => {}" />
        </div>
        <div v-else class="canvas-empty">尚无锁定的归档版本。</div>
        <p v-if="baseline" class="snapshot-meta"><i class="pi pi-lock" /> {{ baseline.lockedAt }} 随打样记录 {{ baseline.proofId }} 锁定，样张与反馈在打样审批页可查。</p>
      </section>
      <section class="panel candidate">
        <div class="panel-head">
          <h3>当前工作版 {{ store.revision }}</h3>
          <span class="head-tags">
            <Tag :value="changes.length ? `${changes.length} 项变更` : '与归档一致'" :severity="changes.length ? 'warn' : 'success'" />
            <Tag :value="store.locked ? '已锁定 · 只读' : '编辑中'" :severity="store.locked ? 'success' : 'warn'" />
          </span>
        </div>
        <div class="canvas-box"><ImpositionCanvas :positions="store.positions" side="front" :zoom="38" :selected="null" :validations="store.validations" @update="() => {}" @select="() => {}" /></div>
        <p class="snapshot-meta"><i :class="store.locked ? 'pi pi-lock' : 'pi pi-pencil'" /> {{ store.locked ? '当前版本已被审批记录锁定，继续调整需在打样审批页新开一轮。' : '当前为工作草稿，通过打样审批后锁定归档。' }}</p>
      </section>
    </div>

    <section class="panel change-panel">
      <div class="panel-head"><h3>版式变更差异</h3><span class="muted">{{ baseline ? `${baseline.revision} → ${store.revision} · ` : '' }}{{ changes.length }} 项</span></div>
      <div v-if="changes.length" class="change-list">
        <article v-for="change in changes" :key="change.id">
          <i class="pi pi-angle-right" />
          <div><strong>{{ change.title }}</strong><div class="diff"><span class="before">{{ change.before }}</span><i class="pi pi-arrow-right" /><span class="after">{{ change.after }}</span></div></div>
        </article>
      </div>
      <div v-else class="change-empty">当前工作版与锁定归档版本一致，没有版式差异。</div>
    </section>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; }
.head-tags { display: inline-flex; gap: 6px; }
.effective-strip { display: flex; align-items: center; gap: 13px; margin-bottom: 14px; padding: 14px 18px; }
.effective-strip > i { font-size: 20px; color: #3f8a6a; }
.effective-strip > i.warn { color: #c4872f; }
.effective-strip strong, .effective-strip small { display: block; }
.effective-strip small { margin-top: 4px; color: #74828a; font-size: 11px; }
.effective-strip .head-tags, .effective-strip > tag { margin-left: auto; }
.effective-strip > .p-tag { margin-left: auto; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.baseline { border-color: #c3d2d4; }
.candidate { border-color: #5d9693; }
.canvas-box { height: 440px; overflow: auto; padding: 12px; background: #35474d; }
.canvas-empty { display: grid; height: 440px; place-items: center; color: #8fa0a6; font-size: 13px; }
.snapshot-meta { display: flex; align-items: center; gap: 7px; margin: 0; padding: 11px 16px; color: #6d7d83; font-size: 11px; border-top: 1px solid #edf1f1; }
.snapshot-meta i { color: #3f7a78; }
.change-panel { overflow: hidden; }
.change-list article { display: grid; grid-template-columns: 20px 1fr; gap: 10px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #edf1f1; }
.change-list article > i { color: #5d9693; }
.change-list strong { font-size: 12px; }
.diff { display: flex; align-items: center; gap: 8px; margin-top: 7px; font-family: monospace; font-size: 10px; }
.diff span { padding: 4px 6px; border-radius: 4px; }
.before { color: #9f4c38; background: #fff0ec; }
.after { color: #2d735b; background: #e9f5ef; }
.change-empty { padding: 26px; color: #82919a; font-size: 12px; text-align: center; }
@media (max-width: 1000px) { .compare-grid { grid-template-columns: 1fr; } }
</style>
