<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import { useImpositionStore, AVG_DELTA_LIMIT, MAX_DELTA_LIMIT, type Proof } from '../stores/imposition'

const store = useImpositionStore()
const active = computed(() => store.proofs.find((proof) => proof.id === store.selectedProof) ?? store.proofs[0])
const draft = ref<Proof>({ ...active.value })
watch(active, (value) => (draft.value = { ...value }), { immediate: true })

const gate = computed(() => store.evaluateGate(draft.value.deltaE, draft.value.maxDeltaE))
const blockReasons = ref<string[]>([])
const infoMessage = ref('')

function persist() {
  if (!store.updateProof(draft.value.id, draft.value)) {
    infoMessage.value = '该记录已锁定，样张、反馈与决定均为只读，不能覆盖。'
  }
}

function approve() {
  blockReasons.value = []
  infoMessage.value = ''
  persist()
  const result = store.approveProof(draft.value.id)
  if (!result.ok) {
    blockReasons.value = result.reasons
  } else {
    const locked = active.value
    infoMessage.value = `已通过并锁定：样张、反馈与拼版版本 ${locked.lockedRevision} 一并归档，车间按该生效版本生产。`
    draft.value = { ...locked }
  }
}

function reject() {
  blockReasons.value = []
  infoMessage.value = ''
  persist()
  const result = store.rejectProof(draft.value.id)
  if (!result.ok) infoMessage.value = result.reasons[0]
}

function pickSample(event: Event) {
  const name = (event.target as HTMLInputElement).files?.[0]?.name
  if (name) draft.value.sampleFile = name
}

function decisionSeverity(decision: Proof['decision']) {
  return decision === '通过' ? 'success' : decision === '退回' ? 'danger' : 'warn'
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div><p class="eyebrow">PROOFING / 打样审批</p><h1>打样轮次与色彩反馈</h1><p class="muted">通过或退回后记录即锁定，样张、反馈与当时拼版版本一并归档；继续调整需新开一轮。</p></div>
      <Button label="新开一轮调整" icon="pi pi-plus" @click="store.startNewRound()" />
    </div>

    <div class="proof-layout">
      <section class="panel">
        <div class="panel-head"><h3>打样轮次</h3><Tag :value="`${store.proofs.length} 轮`" /></div>
        <div class="proof-list">
          <button v-for="proof in store.proofs.slice().reverse()" :key="proof.id" :class="{ active: proof.id === store.selectedProof }" @click="store.selectedProof = proof.id">
            <div>
              <strong>第 {{ proof.round }} 轮 · {{ proof.sample }}</strong>
              <small>{{ proof.date }} · {{ proof.locked ? `锁定于 ${proof.lockedRevision}` : `工作版 ${store.revision}（草稿）` }}</small>
            </div>
            <span>ΔE {{ proof.deltaE }}</span>
            <span class="lock-cell"><Tag :value="proof.decision" :severity="decisionSeverity(proof.decision)" /><i v-if="proof.locked" class="pi pi-lock" title="记录已锁定" /></span>
          </button>
        </div>
      </section>

      <section class="panel proof-editor">
        <div class="panel-head">
          <h3>{{ draft.id }} · 第 {{ draft.round }} 轮打样记录</h3>
          <span class="head-tags">
            <Tag :value="active.locked ? `已锁定 · ${active.lockedRevision}` : `草稿 · ${store.revision}`" :severity="active.locked ? 'success' : 'warn'" />
            <Tag :value="draft.decision" :severity="decisionSeverity(draft.decision)" />
          </span>
        </div>

        <div v-if="active" class="proof-body">
          <Message v-if="active.locked" severity="success" :closable="false">
            <template #icon><i class="pi pi-lock" /></template>
            {{ active.decision === '通过' ? '本记录已通过并锁定' : '本记录已退回并锁定' }}：样张、反馈与拼版版本 {{ active.lockedRevision }} 为只读归档（{{ active.lockedAt }}）。
            <template v-if="active.decision === '退回'">下一轮调整已在新版本中进行，原记录保留查看。</template>
            <template v-else>继续调整请新开一轮，工作版本升版后该记录仍为生效记录直至新版本通过。</template>
          </Message>

          <Message v-if="blockReasons.length" severity="error" :closable="false">
            <strong>不能通过，保存被阻断：</strong>
            <ul><li v-for="reason in blockReasons" :key="reason">{{ reason }}</li></ul>
          </Message>
          <Message v-if="infoMessage" severity="info" :closable="false">{{ infoMessage }}</Message>

          <div class="sample-preview">
            <div class="print-sample"><span>P1 / P8</span><strong>潮汐来信</strong><i>数字样张色靶</i></div>
            <div>
              <strong>{{ draft.sampleFile || '尚未上传样张文件' }}</strong>
              <p>样张{{ active.locked ? `已随版本 ${active.lockedRevision} 锁定` : `将在通过/退回时随当前拼版版本 ${store.revision} 一并锁定` }}，包含 P1、P3、P7、P8 重点页面。</p>
              <label v-if="!active.locked" class="file-button"><i class="pi pi-upload" /> 替换样张照片<input type="file" accept="image/*,.pdf,.tif" style="display:none" @change="pickSample" /></label>
            </div>
          </div>

          <fieldset :disabled="active.locked" class="proof-fields">
            <div class="form-grid">
              <label>样张名称<InputText v-model="draft.sample" /></label>
              <label>打样日期<InputText v-model="draft.date" /></label>
              <label>负责人<InputText v-model="draft.owner" /></label>
              <label>平均色差 ΔE<InputNumber v-model="draft.deltaE" :min="0" :max="10" :minFractionDigits="1" :maxFractionDigits="1" /></label>
              <label>单点最高 ΔE<InputNumber v-model="draft.maxDeltaE" :min="0" :max="10" :minFractionDigits="1" :maxFractionDigits="1" /></label>
            </div>
            <label>色差与外观反馈<Textarea v-model="draft.feedback" rows="4" /></label>
            <label>修正说明<Textarea v-model="draft.correction" rows="4" /></label>
          </fieldset>

          <!-- 通过前门禁：预检阻断错误 + 平均/单点色差，任一不达标禁止通过 -->
          <div class="gate" :class="{ blocked: !gate.ok }">
            <h4><i class="pi pi-shield" /> 保存预检 · 通过门禁</h4>
            <ul>
              <li :class="{ fail: gate.errorCount > 0, pass: gate.errorCount === 0 }">
                <i :class="gate.errorCount === 0 ? 'pi pi-check-circle' : 'pi pi-times-circle'" />
                预检阻断错误 {{ gate.errorCount }} 项<small>必须为 0（警告不阻断）</small>
              </li>
              <li :class="{ fail: !gate.avgOk, pass: gate.avgOk }">
                <i :class="gate.avgOk ? 'pi pi-check-circle' : 'pi pi-times-circle'" />
                平均色差 ΔE {{ draft.deltaE.toFixed(1) }} ≤ {{ AVG_DELTA_LIMIT.toFixed(1) }}
              </li>
              <li :class="{ fail: !gate.maxOk, pass: gate.maxOk }">
                <i :class="gate.maxOk ? 'pi pi-check-circle' : 'pi pi-times-circle'" />
                单点最高 ΔE {{ draft.maxDeltaE.toFixed(1) }} ≤ {{ MAX_DELTA_LIMIT.toFixed(1) }}
              </li>
            </ul>
          </div>

          <div v-if="!active.locked" class="decision-row">
            <Button label="暂存草稿" icon="pi pi-save" severity="secondary" outlined @click="persist(); infoMessage = '草稿已保存，尚未锁定。'" />
            <Button label="退回并新开一轮" icon="pi pi-undo" severity="danger" outlined @click="reject" />
            <Button label="检查通过并锁定" icon="pi pi-check-circle" :disabled="!gate.ok" @click="approve" />
          </div>
          <div v-else class="decision-row">
            <Button label="基于新版本继续调整" icon="pi pi-plus" @click="store.startNewRound()" />
          </div>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-head"><h3>色彩控制</h3><span class="muted">CMYK + 专色</span></div>
        <div class="color-bars">
          <div v-for="color in ['Cyan','Magenta','Yellow','Black','PANTONE 2965 C']" :key="color"><i :class="color.toLowerCase().replaceAll(' ','-')" /><span>{{ color }}</span><strong>{{ color.includes('PANTONE') ? '1.2' : '0.8' }} ΔE</strong></div>
        </div>
        <div class="threshold"><strong>通过阈值</strong><p>重点页面平均 ΔE ≤ {{ AVG_DELTA_LIMIT.toFixed(1) }}，单点最高不超过 {{ MAX_DELTA_LIMIT.toFixed(1) }}；预检存在阻断错误时记录不能通过。</p></div>
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
.lock-cell { display: inline-flex; align-items: center; gap: 5px; }
.lock-cell > i { color: #3f7a78; font-size: 11px; }
.head-tags { display: inline-flex; gap: 6px; }
.proof-body { display: grid; gap: 15px; padding: 18px; }
.proof-body :deep(ul) { margin: 6px 0 0; padding-left: 18px; }
.sample-preview { display: grid; grid-template-columns: 190px 1fr; gap: 16px; align-items: center; padding: 14px; background: #f4f6f5; }
.print-sample { position: relative; display: grid; width: 150px; aspect-ratio: .72; place-items: center; padding: 12px; color: #dce9e8; background: linear-gradient(145deg,#173a4a,#306a6d); box-shadow: 0 8px 18px rgba(29,54,62,.18); }
.print-sample span { position: absolute; top: 8px; left: 9px; font-size: 9px; }
.print-sample strong { font-size: 16px; }
.print-sample i { font-size: 9px; font-style: normal; }
.sample-preview p { color: #68777d; font-size: 11px; line-height: 1.55; }
.file-button { display: inline-flex; width: fit-content; align-items: center; gap: 6px; padding: 7px 9px; border: 1px solid #bdc9cb; border-radius: 6px; color: #38666d; background: white; cursor: pointer; }
.proof-fields { display: grid; gap: 13px; margin: 0; padding: 0; border: 0; }
.proof-fields:disabled { opacity: .62; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.proof-body label { display: grid; gap: 6px; color: #5e6e75; font-size: 11px; font-weight: 700; }
.gate { padding: 13px 15px; border: 1px solid #cfe0dc; border-radius: 8px; background: #f1f7f5; }
.gate.blocked { border-color: #e3b3a6; background: #fdf3f0; }
.gate h4 { margin: 0 0 9px; color: #2f5f5a; font-size: 12px; }
.gate ul { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0; padding: 0; list-style: none; }
.gate li { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; font-size: 11px; font-weight: 700; color: #47605d; }
.gate li small { flex-basis: 100%; font-weight: 400; color: #83929a; }
.gate li.pass i { color: #3b8a67; }
.gate li.fail { color: #b04a33; }
.gate li.fail i { color: #c0492f; }
.decision-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
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
.threshold p { margin: 5px 0 0; color: #716555; font-size: 10px; line-height: 1.5; }
@media (max-width: 1200px) { .proof-layout { grid-template-columns: 300px 1fr; } .proof-layout > aside { grid-column: 1 / -1; } .gate ul { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .proof-layout { grid-template-columns: 1fr; } .sample-preview { grid-template-columns: 1fr; } }
</style>
