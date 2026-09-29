<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useImpositionStore } from '../stores/imposition'

const store = useImpositionStore()
const router = useRouter()
const errors = computed(() => store.validations.filter((item) => item.severity === '错误').length)
const effective = computed(() => store.effectiveProof)
const lockedVersions = computed(() => store.proofs.filter((proof) => proof.decision !== '待决定').length)

function goProofs() {
  router.push('/proofs')
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">PRINT PRODUCTION / 印刷生产</p><h1>拼版预检与打样总览</h1><p class="muted">在当前拼版版本进入生产前，集中处理页序、出血、色彩与装订风险。</p></div>
      <div class="actions"><Button label="运行完整预检" icon="pi pi-check-circle" outlined /><Button label="进入拼版工作区" icon="pi pi-th-large" @click="$router.push('/imposition')" /></div>
    </div>

    <!-- 生效生产版本状态条：车间以此为准 -->
    <div class="effective-banner" :class="store.locked ? 'locked' : 'open'">
      <i :class="store.locked ? 'pi pi-lock' : 'pi pi-pencil'" />
      <div class="banner-text">
        <strong>{{ store.locked ? '生产版本已锁定' : '生产版本调整中（未锁定）' }}</strong>
        <p v-if="effective && store.locked">
          车间生效：第 {{ effective.round }} 轮打样 · {{ effective.snapshot?.sample ?? effective.sample }} · 拼版版本 {{ effective.revision }}
          （平均 ΔE {{ effective.snapshot?.deltaE ?? effective.deltaE }}，单点 {{ effective.snapshot?.maxDeltaE ?? effective.maxDeltaE }}，{{ effective.decidedAt?.slice(0, 10) }} 通过）
        </p>
        <p v-else-if="effective">
          生效版本为 {{ effective.revision }}，当前工作区 {{ store.revision }} 是通过后新开的调整稿；新一轮打样通过前，车间仍按 {{ effective.revision }} 生产。
        </p>
        <p v-else>尚无通过的打样记录；第 {{ store.pendingProof?.round ?? 1 }} 轮待决定，预检与色差达标并通过后才会锁定生产版本。</p>
      </div>
      <Tag :value="store.locked ? `已锁定 ${store.revision}` : `${store.revision} 编辑中`" :severity="store.locked ? 'success' : 'warn'" />
      <Button label="前往打样审批" icon="pi pi-arrow-right" text size="small" @click="goProofs" />
    </div>

    <div class="metric-grid">
      <article class="metric"><span>页面文件</span><strong>{{ store.pages.length }}</strong><small>{{ store.positions.length }} 个已排版位</small></article>
      <article class="metric"><span>预检错误</span><strong class="error">{{ errors }}</strong><small>{{ errors ? '不允许通过打样' : '可进入通过校验' }}</small></article>
      <article class="metric"><span>生效打样</span><strong>{{ effective ? `第 ${effective.round} 轮` : '—' }}</strong><small>{{ effective ? `ΔE ${effective.snapshot?.deltaE ?? effective.deltaE} · ${effective.revision}` : '尚无通过记录' }}</small></article>
      <article class="metric"><span>待恢复导出</span><strong>{{ store.tasks.filter((task) => task.resumable && task.status !== '已完成').length }}</strong><small>断点可继续</small></article>
    </div>

    <div class="overview-grid">
      <section class="panel">
        <div class="panel-head"><h3>当前拼版任务</h3><Tag :value="store.revision" severity="info" /></div>
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
          <div><i :class="errors ? 'pi pi-times-circle error' : 'pi pi-check-circle'" /><span>出血与版位安全区</span><Tag :value="errors ? `${errors} 项错误` : '通过'" :severity="errors ? 'danger' : 'success'" /></div>
          <div><i class="pi pi-check-circle" /><span>色彩控制条与纸张规格</span><Tag value="通过" severity="success" /></div>
        </div>
      </section>

      <aside>
        <section class="panel">
          <div class="panel-head"><h3>打样记录</h3><Button label="查看全部" text size="small" @click="goProofs" /></div>
          <div class="proof-summary">
            <template v-for="proof in store.proofs.slice().reverse()" :key="proof.id">
              <div class="proof-row" :class="{ effective: store.effectiveProof?.id === proof.id }">
                <div>
                  <strong>第 {{ proof.round }} 轮 · {{ proof.snapshot?.sample ?? proof.sample }}<i v-if="store.effectiveProof?.id === proof.id" class="pi pi-bolt" /></strong>
                  <small>
                    {{ proof.date }} · 平均 ΔE {{ proof.snapshot?.deltaE ?? proof.deltaE }} / 单点 {{ proof.snapshot?.maxDeltaE ?? proof.maxDeltaE }}
                    · {{ proof.revision ? `版本 ${proof.revision}` : '版本未定' }}
                    <i v-if="proof.decision !== '待决定'" class="pi pi-lock lock-ico" />
                  </small>
                </div>
                <Tag :value="proof.decision" :severity="proof.decision === '通过' ? 'success' : proof.decision === '退回' ? 'danger' : 'warn'" />
              </div>
            </template>
            <p class="summary-foot">已锁定 {{ lockedVersions }} 份（通过/退回均留档不可改）</p>
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
.effective-banner { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; padding: 14px 18px; border-radius: 10px; border: 1px solid; }
.effective-banner.locked { border-color: #bfe0d1; background: #eef8f2; }
.effective-banner.open { border-color: #ecd3b2; background: #fdf6ea; }
.effective-banner > i { font-size: 22px; }
.effective-banner.locked > i { color: #2f8a63; }
.effective-banner.open > i { color: #c08434; }
.banner-text { flex: 1; min-width: 0; }
.banner-text strong { font-size: 13px; }
.banner-text p { margin: 5px 0 0; color: #5c6d6f; font-size: 11px; line-height: 1.55; }
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
.proof-summary { padding: 8px 16px 12px; }
.proof-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid #edf1f1; }
.proof-row.effective strong { color: #9a6a22; }
.proof-row.effective i.pi-bolt { margin-left: 5px; color: #c98236; }
.lock-ico { font-size: 9px; color: #93a0a5; margin-left: 3px; }
.proof-row strong, .proof-row small { display: block; }
.proof-row small { margin-top: 4px; color: #7a878d; font-size: 10px; }
.summary-foot { margin: 10px 0 0; color: #8a969b; font-size: 10px; }
.export-mini > div:not(.panel-head) { padding: 11px 16px 4px; }
.export-mini > div > div { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; }
.export-mini small { display: block; margin-top: 5px; color: #7d898e; }
@media (max-width: 1050px) { .overview-grid { grid-template-columns: 1fr; } }
</style>
