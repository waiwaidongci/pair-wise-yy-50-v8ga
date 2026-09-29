<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import { useImpositionStore, colorThreshold, type Proof } from '../stores/imposition'

const store = useImpositionStore()
const active = computed(() => store.proofs.find((proof) => proof.id === store.selectedProof) ?? store.proofs[0])
const draft = ref<Proof>({ ...active.value })
const sampleFile = ref('当前使用数字样张 v2_09025.tif')
const notice = ref<{ severity: 'success' | 'error'; text: string } | null>(null)
const confirmReject = ref(false)
const rejectReason = ref('')

watch(active, (value) => {
  draft.value = { ...value }
  sampleFile.value = value.snapshot ? `${value.snapshot.sample}_已锁定.tif` : '当前使用数字样张 v2_09025.tif'
  notice.value = null
  confirmReject.value = false
  rejectReason.value = ''
}, { immediate: true })

const isLocked = computed(() => active.value?.decision !== '待决定')
const blockers = computed(() => (active.value && !isLocked.value ? store.approvalBlockers(draft.value) : []))
const canApprove = computed(() => blockers.value.length === 0)

function persistDraft() {
  store.saveProofDraft(draft.value.id, {
    sample: draft.value.sample,
    date: draft.value.date,
    owner: draft.value.owner,
    deltaE: draft.value.deltaE,
    maxDeltaE: draft.value.maxDeltaE,
    feedback: draft.value.feedback,
    correction: draft.value.correction,
  })
}

function saveDraft() {
  persistDraft()
  notice.value = { severity: 'success', text: '草稿已保存，记录仍为“待决定”，可继续编辑。' }
}

function approve() {
  persistDraft()
  const result = store.approveProof(draft.value.id)
  if (result.ok) notice.value = { severity: 'success', text: `已通过并锁定：样张、反馈与拼版版本 ${store.revision} 一并冻结为车间生产版本。` }
  else notice.value = { severity: 'error', text: `不能通过：${result.blockers.join('；')}。` }
}

function reject() {
  persistDraft()
  const result = store.rejectProof(draft.value.id, rejectReason.value.trim() || undefined)
  if (result.ok) notice.value = { severity: 'success', text: `已退回：原记录与版本 ${active.value.revision} 保留查看，调整已写入新开的 ${result.newId}。` }
  else notice.value = { severity: 'error', text: `操作失败：${result.blockers.join('；')}。` }
}

function newRound() {
  const id = store.startRevisionRound()
  if (id !== active.value?.id) notice.value = null
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">PROOFING / 打样审批</p><h1>打样轮次与色彩反馈</h1><p class="muted">通过后样张、反馈与拼版版本一起锁定；继续调整自动新开一轮，旧记录只读留档。</p></div>
      <Button :label="store.pendingProof ? '进入待决定轮次' : '基于生效版本新开一轮'" icon="pi pi-plus" @click="newRound" />
    </div>

    <div class="proof-layout">
      <section class="panel">
        <div class="panel-head"><h3>打样轮次</h3><Tag :value="`${store.proofs.length} 轮`" /></div>
        <div class="proof-list">
          <button v-for="proof in store.proofs.slice().reverse()" :key="proof.id" :class="{ active: proof.id === store.selectedProof }" @click="store.selectedProof = proof.id">
            <div>
              <strong>
                第 {{ proof.round }} 轮 · {{ proof.snapshot?.sample ?? proof.sample }}
                <i v-if="store.effectiveProof?.id === proof.id" class="pi pi-bolt effective" title="当前生效生产版本" />
              </strong>
              <small>{{ proof.date }} · {{ proof.revision ? `版本 ${proof.revision}` : '版本未定' }} · {{ proof.owner }}</small>
            </div>
            <span>ΔE {{ proof.snapshot?.deltaE ?? proof.deltaE }}</span>
            <span class="lock-cell">
              <i v-if="proof.decision !== '待决定'" class="pi pi-lock" :title="proof.decision === '通过' ? '已通过锁定' : '已退回留档'" />
              <Tag :value="proof.decision" :severity="proof.decision === '通过' ? 'success' : proof.decision === '退回' ? 'danger' : 'warn'" />
            </span>
          </button>
        </div>
      </section>

      <section class="panel proof-editor">
        <div class="panel-head">
          <h3>{{ active.id }} · 第 {{ active.round }} 轮打样记录</h3>
          <Tag v-if="isLocked" :value="`${active.decision} · 已锁定 ${active.revision}`" :severity="active.decision === '通过' ? 'success' : 'danger'" />
          <Tag v-else value="待决定 · 可编辑" severity="warn" />
        </div>

        <!-- 已决定（通过/退回）：只读留档，拒绝任何编辑 -->
        <div v-if="isLocked" class="proof-body readonly-body">
          <Message severity="success" :closable="false" v-if="active.decision === '通过'">
            本记录已通过并锁定，样张、反馈与拼版版本 {{ active.revision }} 为车间当前生效版本，内容不可修改。需要继续调整请新开一轮。
          </Message>
          <Message severity="warn" :closable="false" v-else>
            本记录已退回并锁定留档，原样张与版本 {{ active.revision }} 保留查看；调整内容记录在后续新开的轮次中。
          </Message>
          <div class="sample-preview">
            <div class="print-sample"><span>{{ active.revision }} / P1·P8</span><strong>潮汐来信</strong><i>已锁定样张</i></div>
            <div>
              <strong>{{ active.snapshot?.sample ?? active.sample }}</strong>
              <p>决定时间 {{ active.decidedAt?.replace('T', ' ').slice(0, 16) }} · 决定时预检阻断错误 {{ active.blockingErrors }} 个 · 拼版版本 {{ active.revision }}</p>
              <span class="locked-file"><i class="pi pi-lock" /> 样张文件已随版本冻结，不可替换</span>
            </div>
          </div>
          <div class="form-grid">
            <div class="readonly-field"><span>样张名称</span><strong>{{ active.snapshot?.sample ?? active.sample }}</strong></div>
            <div class="readonly-field"><span>打样日期</span><strong>{{ active.date }}</strong></div>
            <div class="readonly-field"><span>负责人</span><strong>{{ active.snapshot?.owner ?? active.owner }}</strong></div>
            <div class="readonly-field"><span>平均 / 单点最高 ΔE</span><strong>{{ active.snapshot?.deltaE ?? active.deltaE }} / {{ active.snapshot?.maxDeltaE ?? active.maxDeltaE }}</strong></div>
          </div>
          <div class="readonly-field block"><span>色差与外观反馈</span><p>{{ active.snapshot?.feedback ?? active.feedback }}</p></div>
          <div class="readonly-field block"><span>修正说明</span><p>{{ active.snapshot?.correction ?? active.correction }}</p></div>
          <div class="decision-row">
            <Button v-if="active.decision === '通过'" label="基于此版本继续调整（新开一轮）" icon="pi pi-copy" outlined @click="newRound" />
            <Button v-else-if="store.pendingProof" label="查看新开的调整轮次" icon="pi pi-arrow-right" outlined @click="store.selectedProof = store.pendingProof!.id" />
          </div>
        </div>

        <!-- 待决定：可编辑，保存前先过预检与色差门槛 -->
        <div v-else class="proof-body">
          <Message v-if="notice" :severity="notice.severity" :closable="false" @close="notice = null">{{ notice.text }}</Message>
          <div class="gate" :class="{ blocked: blockers.length, passed: !blockers.length }">
            <header><i :class="blockers.length ? 'pi pi-ban' : 'pi pi-shield'" /><strong>保存（通过）前校验</strong><Tag :value="blockers.length ? `${blockers.length} 项阻断` : '全部达标'" :severity="blockers.length ? 'danger' : 'success'" /></header>
            <ul>
              <li :class="{ fail: store.blockingErrorCount > 0, ok: store.blockingErrorCount === 0 }">
                <i :class="store.blockingErrorCount > 0 ? 'pi pi-times-circle' : 'pi pi-check-circle'" />
                预检阻断错误 {{ store.blockingErrorCount }} 个
              </li>
              <li :class="{ fail: draft.deltaE > colorThreshold.avg, ok: draft.deltaE <= colorThreshold.avg }">
                <i :class="draft.deltaE > colorThreshold.avg ? 'pi pi-times-circle' : 'pi pi-check-circle'" />
                平均色差 ΔE {{ draft.deltaE.toFixed(1) }} ≤ {{ colorThreshold.avg.toFixed(1) }}
              </li>
              <li :class="{ fail: draft.maxDeltaE > colorThreshold.max, ok: draft.maxDeltaE <= colorThreshold.max }">
                <i :class="draft.maxDeltaE > colorThreshold.max ? 'pi pi-times-circle' : 'pi pi-check-circle'" />
                单点最高 ΔE {{ draft.maxDeltaE.toFixed(1) }} ≤ {{ colorThreshold.max.toFixed(1) }}
              </li>
            </ul>
          </div>
          <div class="sample-preview">
            <div class="print-sample"><span>P1 / P8</span><strong>潮汐来信</strong><i>数字样张色靶</i></div>
            <div>
              <strong>{{ sampleFile }}</strong>
              <p>样张通过后将与当前拼版版本 {{ store.revision }} 一并锁定，包含 P1、P3、P7、P8 重点页面。</p>
              <label class="file-button"><i class="pi pi-upload" /> 替换样张照片<input type="file" accept="image/*,.pdf,.tif" style="display:none" @change="sampleFile = ($event.target as HTMLInputElement).files?.[0]?.name ?? sampleFile" /></label>
            </div>
          </div>
          <div class="form-grid">
            <label>样张名称<InputText v-model="draft.sample" /></label>
            <label>打样日期<InputText v-model="draft.date" /></label>
            <label>负责人<InputText v-model="draft.owner" /></label>
            <label>平均色差 ΔE（阈值 ≤ {{ colorThreshold.avg }}）<InputNumber v-model="draft.deltaE" :min="0" :max="10" :minFractionDigits="1" :maxFractionDigits="1" /></label>
            <label>单点最高 ΔE（阈值 ≤ {{ colorThreshold.max }}）<InputNumber v-model="draft.maxDeltaE" :min="0" :max="10" :minFractionDigits="1" :maxFractionDigits="1" /></label>
          </div>
          <label>色差与外观反馈<Textarea v-model="draft.feedback" rows="4" /></label>
          <label>修正说明<Textarea v-model="draft.correction" rows="4" /></label>

          <div v-if="confirmReject" class="reject-box">
            <strong>退回并新开调整轮次</strong>
            <p>当前记录将连同版本 {{ store.revision }} 一起冻结留档，系统自动新开下一轮（新版本）承接调整。可补充退回原因：</p>
            <Textarea v-model="rejectReason" rows="2" placeholder="例如：封面专色仍偏紫，需重新打样…" />
            <div class="decision-row">
              <Button label="确认退回" icon="pi pi-undo" severity="danger" size="small" @click="reject" />
              <Button label="取消" text size="small" @click="confirmReject = false" />
            </div>
          </div>

          <div v-else class="decision-row">
            <Button label="保存草稿" icon="pi pi-save" outlined @click="saveDraft" />
            <Button label="通过并锁定" icon="pi pi-lock" :disabled="!canApprove" @click="approve" />
            <Button label="退回修改（留档并新开）" icon="pi pi-undo" severity="danger" outlined @click="confirmReject = true" />
            <span v-if="!canApprove" class="muted gate-hint">阻断项清除前不能通过，可先保存草稿或退回。</span>
          </div>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-head"><h3>色彩控制</h3><span class="muted">CMYK + 专色</span></div>
        <div class="color-bars">
          <div v-for="color in ['Cyan','Magenta','Yellow','Black','PANTONE 2965 C']" :key="color"><i :class="color.toLowerCase().replaceAll(' ','-')" /><span>{{ color }}</span><strong>{{ color.includes('PANTONE') ? '1.2' : '0.8' }} ΔE</strong></div>
        </div>
        <div class="threshold" :class="{ violated: !isLocked && blockers.length > 0 }">
          <strong>通过阈值（保存时强校验）</strong>
          <p>预检阻断错误必须为 0；重点页面平均 ΔE ≤ {{ colorThreshold.avg.toFixed(1) }}，单点最高 ΔE ≤ {{ colorThreshold.max.toFixed(1) }}。任一不达标，记录不能通过。</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.proof-layout { display: grid; grid-template-columns: 350px minmax(0,1fr) 300px; gap: 14px; align-items: start; }
.proof-list { padding: 8px; }
.proof-list button { display: grid; width: 100%; grid-template-columns: 1fr 58px auto; gap: 8px; align-items: center; padding: 11px; border: 0; border-radius: 7px; text-align: left; background: transparent; cursor: pointer; }
.proof-list button.active { background: #edf5f4; box-shadow: inset 3px 0 #337b79; }
.proof-list strong, .proof-list small { display: block; }
.proof-list strong { font-size: 12px; }
.proof-list small { margin-top: 4px; color: #7a878e; font-size: 10px; }
.proof-list > button > span { color: #506f75; font-family: monospace; font-weight: 700; }
.effective { color: #c98236; margin-left: 4px; }
.lock-cell { display: inline-flex; align-items: center; gap: 5px; }
.lock-cell > i { font-size: 10px; color: #8a969b; }
.proof-body { display: grid; gap: 15px; padding: 18px; }
.gate { padding: 12px 14px; border-radius: 8px; border: 1px solid #cde7dc; background: #f0f8f4; }
.gate.blocked { border-color: #e3b4a7; background: #fdf1ee; }
.gate header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.gate header i { font-size: 15px; }
.gate.passed header i { color: #2f7d5b; }
.gate.blocked header i { color: #bb4c35; }
.gate ul { display: grid; gap: 5px; margin: 0; padding-left: 2px; list-style: none; }
.gate li { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #4f6a63; }
.gate li.ok i { color: #2f8a63; }
.gate li.fail { color: #a9442f; font-weight: 700; }
.gate li.fail i { color: #c14c33; }
.sample-preview { display: grid; grid-template-columns: 190px 1fr; gap: 16px; align-items: center; padding: 14px; background: #f4f6f5; }
.print-sample { position: relative; display: grid; width: 150px; aspect-ratio: .72; place-items: center; padding: 12px; color: #dce9e8; background: linear-gradient(145deg,#173a4a,#306a6d); box-shadow: 0 8px 18px rgba(29,54,62,.18); }
.print-sample span { position: absolute; top: 8px; left: 9px; font-size: 9px; }
.print-sample strong { font-size: 16px; }
.print-sample i { font-size: 9px; font-style: normal; }
.sample-preview p { color: #68777d; font-size: 11px; line-height: 1.55; }
.file-button { display: inline-flex; width: fit-content; align-items: center; gap: 6px; padding: 7px 9px; border: 1px solid #bdc9cb; border-radius: 6px; color: #38666d; background: white; cursor: pointer; }
.locked-file { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 6px 9px; border-radius: 6px; color: #7d6a55; background: #f6efe6; font-size: 10px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.proof-body > label { display: grid; gap: 6px; color: #5e6e75; font-size: 11px; font-weight: 700; }
.readonly-field { display: grid; gap: 5px; padding: 10px 12px; border-radius: 6px; background: #f4f6f5; }
.readonly-field.block { grid-column: 1 / -1; }
.readonly-field span { color: #82909a; font-size: 10px; font-weight: 700; }
.readonly-field strong, .readonly-field p { color: #31474e; font-size: 12px; }
.readonly-field p { margin: 0; line-height: 1.6; white-space: pre-wrap; }
.decision-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gate-hint { font-size: 10px; }
.reject-box { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid #e3b4a7; border-radius: 8px; background: #fdf3f0; }
.reject-box p { margin: 0; color: #8a6255; font-size: 11px; line-height: 1.55; }
.color-bars { padding: 12px 16px 16px; }
.color-bars > div { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid #edf1f1; font-size: 11px; }
.color-bars i { width: 18px; height: 18px; border-radius: 4px; background: #2a2a2a; }
.color-bars i.cyan { background: #18b6d6; }
.color-bars i.magenta { background: #e33d98; }
.color-bars i.yellow { background: #f1d22d; }
.color-bars i.black { background: #222; }
.color-bars i.pantone-2965-c { background: #1f4e6e; }
.color-bars strong { color: #4c6d72; }
.threshold { margin: 0 16px 16px; padding: 12px; border-left: 3px solid #c98236; background: #fff5e8; }
.threshold.violated { border-left-color: #c0492f; background: #fdeee9; }
.threshold p { margin: 5px 0 0; color: #716555; font-size: 10px; line-height: 1.5; }
@media (max-width: 1200px) { .proof-layout { grid-template-columns: 300px 1fr; } .proof-layout > aside { grid-column: 1 / -1; } }
@media (max-width: 760px) { .proof-layout { grid-template-columns: 1fr; } .sample-preview { grid-template-columns: 1fr; } }
</style>
