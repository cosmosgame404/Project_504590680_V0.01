/**
 * 🌐 全能编辑器 V10.6 - 全局事件管理模块 (module_events.js)
 * 核心范式：No-Build Native ESM / Vue 3
 * 职责：独立管理跨场景触发的全局监听器，与生存系统彻底解耦
 */

 import { state, services } from './editor_main.js';
 const { reactive, computed } = window.Vue;
 
 export const EventsEditor = {
     setup() {
         const local = reactive({
             curIdx: -1,
             activeTab: 'basic'
         });
 
         // 确保数据结构存在
         if (!state.db.globalEvents) state.db.globalEvents = [];
 
         const currentEvent = computed(() => 
             (local.curIdx >= 0 && state.db.globalEvents[local.curIdx]) 
                 ? state.db.globalEvents[local.curIdx] 
                 : null
         );
 
         const addEvent = () => {
             // 遵循修正案：使用自增数字 ID 简化逻辑
             const newId = state.db.globalEvents.length > 0 
                 ? Math.max(...state.db.globalEvents.map(e => e.id || 0)) + 1 
                 : 100;
 
             state.db.globalEvents.push({
                 id: newId,
                 name: "新全局事件",
                 condition: "",     // JS 条件
                 timeCond: "",      // 时间区间 (如 18-6)
                 days: [],          // 限定星期
                 actionType: "dialogue", 
                 arg1: "", 
                 arg2: ""
             });
             local.curIdx = state.db.globalEvents.length - 1;
             services.showToast("🌐 已创建新的全局监听器");
         };
 
         const removeEvent = (idx) => {
             if (confirm("确定要删除这个全局事件吗？")) {
                 state.db.globalEvents.splice(idx, 1);
                 local.curIdx = -1;
             }
         };
 
         return { state, local, currentEvent, addEvent, removeEvent, services };
     },
     template: `
         <div class="flex-row" style="width: 100%; height: 100%; background: var(--bg-color);">
             
             <div class="panel sidebar-left flex-column" style="width: var(--sidebar-width); background: var(--panel-bg); border-right: 1px solid var(--border);">
                 <div class="p-10 flex-row align-center" style="color: var(--secondary); font-weight: bold; border-bottom: 1px solid var(--border); justify-content: space-between;">
                     <span>🌐 全局事件监听器</span>
                     <button class="btn btn-secondary" style="padding: 2px 8px;" @click="addEvent">+</button>
                 </div>
                 <div class="flex-1 flex-column p-10" style="overflow-y: auto; gap: 8px;">
                     <div v-if="state.db.globalEvents.length === 0" class="text-muted" style="text-align:center; margin-top:20px; font-size: 13px;">
                         暂无全局事件
                     </div>
                     <div v-for="(ev, idx) in state.db.globalEvents" :key="ev.id"
                          class="card p-10" 
                          :style="{ 
                              borderColor: local.curIdx === idx ? 'var(--secondary)' : 'var(--border)',
                              background: local.curIdx === idx ? 'var(--secondary-glow)' : 'var(--panel-bg-light)',
                              cursor: 'pointer'
                          }"
                          @click="local.curIdx = idx">
                         <div class="flex-row align-center" style="justify-content: space-between;">
                             <span :style="{ color: local.curIdx === idx ? 'var(--secondary)' : 'var(--text-main)' }">
                                 <small class="text-muted">#{{ev.id}}</small> {{ev.name}}
                             </span>
                             <span v-if="ev.timeCond" class="text-primary" style="font-size: 10px;">🕒 {{ev.timeCond}}</span>
                         </div>
                     </div>
                 </div>
             </div>
 
             <div class="flex-1 p-10 flex-column" style="overflow-y: auto;">
                 <div v-if="currentEvent" class="card p-10" style="max-width: 800px; margin: 0 auto; width: 100%;">
                     <div class="text-secondary m-b-10" style="font-weight: bold; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
                         ⚙️ 事件触发逻辑配置
                     </div>
 
                     <div class="m-b-10 flex-column">
                         <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">监听器说明 (仅编辑器可见)</label>
                         <input type="text" class="input" v-model="currentEvent.name">
                     </div>
 
                     <div class="card p-10 m-b-10" style="border-color: var(--primary);">
                         <div class="text-primary m-b-10" style="font-weight: bold; font-size: 13px;">🕒 时间与环境判定</div>
                         <div class="flex-row" style="gap: 15px;">
                             <div class="flex-1 flex-column">
                                 <label class="text-muted" style="font-size: 11px;">触发时间段 (如: 7-9 或 18-6)</label>
                                 <input type="text" class="input" v-model="currentEvent.timeCond" placeholder="留空则全天候触发">
                             </div>
                             <div class="flex-1 flex-column">
                                 <label class="text-muted" style="font-size: 11px;">限定星期 (多选)</label>
                                 <div class="flex-row align-center" style="gap: 8px; flex-wrap: wrap; margin-top: 5px;">
                                     <label v-for="d in 7" :key="d" style="font-size: 11px; cursor: pointer;">
                                         <input type="checkbox" :value="d" v-model="currentEvent.days"> {{'周'+d}}
                                     </label>
                                 </div>
                             </div>
                         </div>
                     </div>
 
                     <div class="m-b-10 flex-column">
                         <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">JS 条件表达式 (前置开关/变量判定)</label>
                         <textarea class="textarea" v-model="currentEvent.condition" 
                                   placeholder="例如: $gameSwitches.value(10) && $gameVariables.value(5) >= 1"
                                   style="height: 60px; font-family: monospace;"></textarea>
                     </div>
 
                     <div class="card p-10 m-b-10" style="border-color: var(--accent);">
                         <div style="color: var(--accent); font-weight: bold; font-size: 13px; margin-bottom: 10px;">⚡ 满足条件后的行为</div>
                         <div class="flex-row" style="gap: 10px; margin-bottom: 10px;">
                             <div class="flex-1 flex-column">
                                 <label class="text-muted" style="font-size: 11px;">动作类型</label>
                                 <select class="select" v-model="currentEvent.actionType">
                                     <option value="dialogue">🎬 触发剧情对话</option>
                                     <option value="transfer">🌍 强制转移场景</option>
                                     <option value="script">⚙️ 执行后台脚本</option>
                                 </select>
                             </div>
                         </div>
                         
                         <div v-if="currentEvent.actionType === 'dialogue'" class="flex-row" style="gap: 10px;">
                             <div class="flex-1 flex-column">
                                 <label class="text-muted" style="font-size: 11px;">剧本路径</label>
                                 <input type="text" class="input" v-model="currentEvent.arg1" placeholder="Chapter/SceneName">
                             </div>
                             <div class="flex-column" style="width: 100px;">
                                 <label class="text-muted" style="font-size: 11px;">起始节点 ID</label>
                                 <input type="number" class="input" v-model.number="currentEvent.arg2">
                             </div>
                         </div>
 
                         <div v-if="currentEvent.actionType === 'transfer'" class="flex-column">
                             <label class="text-muted" style="font-size: 11px;">目标场景路径</label>
                             <input type="text" class="input" v-model="currentEvent.arg1" placeholder="RoomA">
                         </div>
 
                         <div v-if="currentEvent.actionType === 'script'" class="flex-column">
                             <label class="text-muted" style="font-size: 11px;">自定义脚本内容</label>
                             <textarea class="textarea" v-model="currentEvent.arg1" style="height: 80px; font-family: monospace;"></textarea>
                         </div>
                     </div>
 
                     <button class="btn btn-ghost" @click="removeEvent(local.curIdx)" style="width: 100%; border-color: var(--danger); color: var(--danger); margin-top: 20px;">🗑️ 永久删除此全局事件</button>
                 </div>
 
                 <div v-else class="flex-1 flex-column align-center justify-center text-muted">
                     <div style="font-size: 40px; margin-bottom: 10px;">🌐</div>
                     <p>请在左侧选择或创建一个全局事件</p>
                     <small>全局事件将在满足条件时，无论玩家在哪个场景都会自动触发。</small>
                 </div>
             </div>
         </div>
     `
 };