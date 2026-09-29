<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useImpositionStore } from '../stores/imposition'

const store = useImpositionStore()
const errors = computed(() => store.validations.filter((item) => item.severity === '错误').length)
const draft = computed(() => store.proofs.find((proof) => !proof.locked) ?? null)
const effective = computed(() => store.effectiveProof)

function decisionSeverity(decision: string) {
  return decision === '通过' ? 'success' : decision === '退回' ? 'danger' : 'warn'
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">PRINT PRODUCTION / 印刷生产</p><h1>拼版预检与打样总览</h1><p class="muted">在当前拼版版本进入生产前，集中处理页序、出血、色彩与装订风险。</p></div>
      <div class="actions"><Button label="运行完整预检" icon="pi pi-check-circle" outlined /><Button label="进入拼版工作区" icon="pi pi-th-large" @click="$router.push('/imposition')" /></div>
    </div>

    <div class="metric-grid">
      <article class="metric"><span>页面文件</span><strong>{{ store.pages.length }}</strong><small>{{ store.positions.length }} 个已排版位</small></article>
      <article class="metric"><span>预检错误</span><strong class="error">{{ errors }}</strong><small>必须处理后方可通过</small></article>
      <article class="metric">
        <span>生效打样</span>
        <strong :class="{ muted: !effective }">{{ effective ? effective.lockedRevision : '—' }}</strong>
        <small v-if="effective">第 {{ effective.round }} 轮通过 · ΔE {{ effective.deltaE }}</small>
        <small v-else>尚无通过记录，车间不可投产</small>
      </article>
      <article class="metric"><span>待恢复导出</span><strong>{{ store.tasks.filter((task) => task.resumable && task.status !== '已完成').length }}</strong><small>断点可继续</small></article>
    </div>

    <div class="overview-grid">
      <section class="panel">
        <div class="panel-head">
          <h3>当前拼版任务</h3>
          <span class="head-tags">
            <Tag :value="store.revision" severity="info" />
            <Tag :value="store.locked ? '已锁定 · 只读' : '工作版 · 编辑中'" :severity="store.locked ? 'success' : 'warn'" />
          </span>
        </div>
        <div class="project-card">
          <div>
            <strong>《潮汐来信》上海巡演节目册</strong>
            <p>成品 210 × 297mm · 8P · 骑马订 · 720 × 1020mm 对开纸</p>
            <div class="specs"><span>CMYK + 专色</span><span>纵向纸纹</span><span>PDF/X-4</span><span>色彩控制条已配置</span></div>
          </div>
          <Button label="打开拼版" icon="pi pi-arrow-right" @click="$router.push('/imposition')" />
        </div>
        <div class="checklist">
          <div><i class="pi pi-check-circle" /><span>页面尺寸与成品规格</span><Tag value="通过" severity="success" /></div>
          <div><i class="pi pi-exclamation-triangle warn" /><span>折手与页码顺序</span><Tag value="1 项警告" severity="warn" /></div>
          <div><i :class="errors ? 'pi pi-times-circle error' : 'pi pi-check-circle'" /><span>出血与版位安全区</span><Tag :value="`${errors} 项错误`" :severity="errors ? 'danger' : 'success'" /></div>
          <div><i class="pi pi-check-circle" /><span>色彩控制条与纸张规格</span><Tag value="通过" severity="success" /></div>
        </div>
      </section>

      <aside>
        <section class="panel effective-panel" :class="{ on: effective }">
          <div class="panel-head"><h3>生效记录 · 车间生产依据</h3><i v-if="effective" class="pi pi-lock" /></div>
          <div v-if="effective" class="effective-card">
            <div>
              <strong>第 {{ effective.round }} 轮 · {{ effective.sample }}</strong>
              <small>{{ effective.date }} · {{ effective.owner }}</small>
              <small>平均 ΔE {{ effective.deltaE }} / 单点最高 {{ effective.maxDeltaE }} · {{ effective.lockedAt }} 锁定</small>
            </div>
            <span class="stack-tags"><Tag value="通过" severity="success" /><Tag :value="effective.lockedRevision!" severity="info" /></span>
          </div>
          <div v-else class="effective-empty">
            <i class="pi pi-info-circle" />
            <p>暂无生效的通过记录。当前{{ draft ? `第 ${draft.round} 轮草稿（ΔE ${draft.deltaE}）` : '没有进行中的草稿' }}，通过门禁后版本锁定才会下发车间。</p>
            <Button label="前往审批" size="small" @click="$router.push('/proofs')" />
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>打样记录</h3><Button label="查看全部" text size="small" @click="$router.push('/proofs')" /></div>
          <div class="proof-summary">
            <template v-for="proof in store.proofs.slice().reverse()" :key="proof.id">
              <div class="proof-row" :class="{ effective: proof.id === effective?.id }">
                <div>
                  <strong>第 {{ proof.round }} 轮 · {{ proof.sample }}<i v-if="proof.id === effective?.id" class="pi pi-verified" title="生效记录" /></strong>
                  <small>{{ proof.date }} · {{ proof.locked ? `锁定 ${proof.lockedRevision}` : `草稿 ${store.revision}` }} · ΔE {{ proof.deltaE }}/{{ proof.maxDeltaE }}</small>
                </div>
                <span class="stack-tags">
                  <i v-if="proof.locked" class="pi pi-lock" />
                  <Tag :value="proof.decision" :severity="decisionSeverity(proof.decision)" />
                </span>
              </div>
            </template>
          </div>
        </section>
        <section class="panel export-mini">
          <div class="panel-head"><h3>导出任务</h3></div>
          <div v-for="task in store.tasks" :key="task.id">
            <div><span>{{ task.name }}</span><strong>{{ task.progress }}%</strong></div>
            <ProgressBar :value="task.progress" :showValue="false" :style="{ height: '7px' }" />
            <small>{{ task.status }} · {{ task.updatedAt }}</small>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.head-tags { display: inline-flex; gap: 6px; }
.muted { color: #8a979d; }
.metric .error { color: #b84e35; }
.overview-grid { display: grid; grid-template-columns: minmax(0,1fr) 350px; gap: 14px; align-items: start; }
.project-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px; }
.project-card strong { font-size: 17px; }
.project-card p { margin: 7px 0 14px; color: #66757c; }
.specs { display: flex; flex-wrap: wrap; gap: 7px; }
.specs span { padding: 5px 8px; border-radius: 5px; color: #45676d; background: #eef4f4; font-size: 10px; }
.checklist { padding: 0 18px 16px; }
.checklist > div { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 9px; padding: 11px 0; border-top: 1px solid #ecf0f0; font-size: 12px; }
.checklist i { color: #3b8a67; }
.checklist i.warn { color: #c4872f; }
.checklist i.error { color: #bb4c35; }
aside { display: grid; gap: 14px; }
.effective-panel.on { border-color: #8ab8a5; }
.effective-panel .panel-head i { color: #3f8a6a; font-size: 15px; }
.effective-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; }
.effective-card strong, .effective-card small { display: block; }
.effective-card strong { font-size: 13px; }
.effective-card small { margin-top: 5px; color: #77868c; font-size: 10px; }
.stack-tags { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.stack-tags > i { color: #3f7a78; font-size: 12px; }
.effective-empty { display: grid; gap: 10px; justify-items: start; padding: 16px; }
.effective-empty > i { color: #c4872f; font-size: 18px; }
.effective-empty p { margin: 0; color: #738087; font-size: 11px; line-height: 1.6; }
.proof-summary { padding: 8px 16px 14px; }
.proof-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid #edf1f1; }
.proof-row.effective { padding-left: 9px; border-left: 3px solid #3f8a6a; }
.proof-row strong, .proof-row small { display: block; }
.proof-row strong { font-size: 12px; }
.proof-row strong i { margin-left: 5px; color: #3f8a6a; }
.proof-row small { margin-top: 4px; color: #7a878d; font-size: 10px; }
.export-mini > div:not(.panel-head) { padding: 11px 16px 4px; }
.export-mini > div > div { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; }
.export-mini small { display: block; margin-top: 5px; color: #7d898e; }
@media (max-width: 1050px) { .overview-grid { grid-template-columns: 1fr; } }
</style>
