/**
 * 🌌 全能编辑器 V12.3 - 状态与被动管线工作台 (module_status.js)
 * 职责：定义游戏内的 Buff/Debuff/被动/条件状态 Schema。
 * 更新：将随机字符串 ID 修改为序列数字 ID (state_001 格式)，提升开发可读性。
 */

 import { state, services } from './editor_main.js';

 const { computed, reactive, ref } = window.Vue;
 
 const template = `
     <div class="flex-row" style="width: 100%; height: 100%; gap: 15px; padding: 15px; box-sizing: border-box;">
         
         <div class="card flex-column" style="width: 380px; flex-shrink: 0; overflow: hidden; background: var(--panel-bg);">
             <div class="p-15 flex-column" style="border-bottom: 1px solid var(--border); background: var(--panel-bg-light); gap: 10px;">
                 <div class="flex-row justify-between align-center">
                     <span style="font-weight: bold; font-size: 16px; color: var(--secondary);">🧠 状态字典 (Status DB)</span>
                     <button class="btn btn-secondary" @click="addStatus">➕ 新增状态</button>
                 </div>
                 <input v-model="searchQuery" class="input" placeholder="🔍 搜索状态 ID 或名称..." />
             </div>
 
             <div class="flex-1 cm-custom-scroll" style="overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                 <div v-for="item in filteredStatus" :key="item.id" 
                      class="card p-10 flex-row align-center" 
                      style="cursor: pointer; transition: 0.2s;"
                      :style="selectedId === item.id ? 'background: rgba(0, 210, 255, 0.15); border-left: 3px solid var(--secondary);' : 'background: rgba(0,0,0,0.2); border-left: 3px solid transparent;'"
                      @click="selectedId = item.id">
                     <div class="flex-column flex-1">
                         <div class="flex-row justify-between">
                             <span style="font-weight: bold; font-size: 14px; color: var(--text-main);">{{ item.name || '未命名状态' }}</span>
                             <span class="text-muted" style="font-size: 10px;">{{ getDurationLabel(item.durationType) }}</span>
                         </div>
                         <span class="text-muted" style="font-size: 11px; margin-top: 4px;">{{ item.id }}</span>
                     </div>
                 </div>
             </div>
         </div>
 
         <div class="card flex-1 flex-column" style="background: var(--panel-bg); overflow: hidden;">
             <div v-if="!currentStatus" class="flex-column align-center justify-center text-muted" style="height: 100%;">
                 <span style="font-size: 48px; margin-bottom: 20px;">📜</span>
                 <h3>请从左侧选择或创建一个状态</h3>
             </div>
 
             <div v-else class="flex-column flex-1" style="overflow-y: auto;">
                 <div class="p-15 flex-row justify-between align-center" style="border-bottom: 1px solid var(--border); background: var(--panel-bg-light); position: sticky; top: 0; z-index: 10;">
                     <div class="flex-row align-center" style="gap: 10px;">
                         <span style="font-size: 18px; font-weight: bold; color: var(--secondary);">编辑状态实体</span>
                     </div>
                     <button class="btn btn-ghost text-danger" @click="removeStatus(currentStatus.id)">🗑️ 删除状态</button>
                 </div>
 
                 <div class="p-20 flex-column" style="gap: 20px;">
                     <div class="card p-15" style="background: rgba(0,0,0,0.15); border: 1px solid var(--border);">
                         <h4 class="text-secondary m-b-15">📌 基础标识</h4>
                         <div class="flex-row" style="gap: 15px;">
                             <div class="flex-column flex-1" style="gap: 5px;">
                                 <label class="text-muted" style="font-size: 12px;">系统 ID (建议保持序列化)</label>
                                 <input v-model="currentStatus.id" class="input" placeholder="state_001" />
                             </div>
                             <div class="flex-column flex-1" style="gap: 5px;">
                                 <label class="text-muted" style="font-size: 12px;">显示名称 (纯文字/Emoji)</label>
                                 <input v-model="currentStatus.name" class="input" placeholder="☠️ 剧毒" />
                             </div>
                         </div>
                         <div class="flex-column m-t-15" style="gap: 5px;">
                             <label class="text-muted" style="font-size: 12px;">状态描述 (Tooltip)</label>
                             <textarea v-model="currentStatus.description" class="input" style="height: 60px; resize: none;"></textarea>
                         </div>
                     </div>
 
                     <div class="card p-15" style="background: rgba(0, 210, 255, 0.05); border: 1px solid rgba(0, 210, 255, 0.3);">
                         <h4 class="text-secondary m-b-15">⏳ 生命周期与触发规则 (Lifecycle)</h4>
                         <div class="flex-row" style="gap: 15px; margin-bottom: 15px;">
                             <div class="flex-column flex-1" style="gap: 5px;">
                                 <label class="text-muted" style="font-size: 12px;">消失/结算类型</label>
                                 <select v-model="currentStatus.durationType" class="select">
                                     <option value="turn">按战斗回合 (Turn Based)</option>
                                     <option value="tick">按时间刻度 (Tick Based)</option>
                                     <option value="permanent">永久存在 (Permanent)</option>
                                     <option value="conditional">条件触发/光环 (Conditional)</option>
                                 </select>
                             </div>
                             <div v-if="['turn', 'tick'].includes(currentStatus.durationType)" class="flex-column flex-1" style="gap: 5px;">
                                 <label class="text-warning" style="font-size: 12px;">初始持续数值 (回合/刻度)</label>
                                 <input type="number" v-model.number="currentStatus.durationValue" class="input" min="1" />
                             </div>
                         </div>
 
                         <div v-if="currentStatus.durationType === 'conditional'" class="flex-column" style="gap: 5px;">
                             <label class="text-primary" style="font-size: 12px; font-weight: bold;">自动挂载条件 (evalCondition)</label>
                             <input v-model="currentStatus.triggerCondition" class="input" style="font-family: monospace;" placeholder="例如: $gameActors.actor(1).tp >= 100" />
                             <p class="text-muted" style="font-size: 11px;">当此表达式为 true 时，状态自动附加；为 false 时自动移除。</p>
                         </div>
                     </div>
 
                     <div class="card p-15" style="background: rgba(255, 75, 139, 0.05); border: 1px solid rgba(255, 75, 139, 0.3);">
                         <div class="flex-row justify-between align-center m-b-15">
                             <h4 class="text-primary">✨ 状态效果宏指令 (Effect Macros)</h4>
                             <button class="btn btn-ghost" style="font-size: 12px; padding: 2px 8px;" @click="addMacro">➕ 添加指令</button>
                         </div>
                         <div class="flex-column" style="gap: 8px;">
                             <div v-for="(macro, idx) in currentStatus.effects" :key="idx" class="flex-row align-center" style="gap: 10px;">
                                 <input v-model="currentStatus.effects[idx]" class="input flex-1" style="font-family: monospace; color: var(--secondary);" placeholder="例如: <Stat: ATK, *0.8>" />
                                 <button class="btn btn-ghost text-danger" @click="removeMacro(idx)">❌</button>
                             </div>
                         </div>
                     </div>
                 </div>
             </div>
         </div>
     </div>
 `;
 
 export const StatusEditor = {
     name: 'StatusEditor',
     template,
     setup() {
         const selectedId = ref(null);
         const searchQuery = ref("");
 
         const statusDb = computed(() => {
             if (!state.db.statusDb) state.db.statusDb = { items: [] };
             return state.db.statusDb;
         });
 
         const filteredStatus = computed(() => {
             const query = searchQuery.value.trim().toLowerCase();
             if (!query) return statusDb.value.items;
             return statusDb.value.items.filter(i => 
                 i.id.toLowerCase().includes(query) || i.name.toLowerCase().includes(query)
             );
         });
 
         const currentStatus = computed(() => 
             statusDb.value.items.find(i => i.id === selectedId.value)
         );
 
         // 🌟 序列 ID 生成器
         const generateId = (prefix, arr) => {
             let max = 0;
             arr.forEach(obj => {
                 const match = obj.id && obj.id.match(new RegExp(`^${prefix}(\\d+)$`));
                 if (match) max = Math.max(max, parseInt(match[1]));
             });
             return `${prefix}${String(max + 1).padStart(3, '0')}`;
         };
 
         const getDurationLabel = (type) => {
             const map = { turn: '战斗回合', tick: '时间刻度', permanent: '永久', conditional: '条件触发' };
             return map[type] || '未知';
         };
 
         const addStatus = () => {
             const newId = generateId('state_', statusDb.value.items);
             const newItem = {
                 id: newId,
                 name: '新状态模板',
                 description: '',
                 durationType: 'turn',
                 durationValue: 3,
                 triggerCondition: '',
                 effects: []
             };
             statusDb.value.items.push(newItem);
             selectedId.value = newId;
         };
 
         const removeStatus = (id) => {
             if (!confirm(`确定要删除状态定义 [${id}] 吗？`)) return;
             const idx = statusDb.value.items.findIndex(i => i.id === id);
             if (idx > -1) {
                 statusDb.value.items.splice(idx, 1);
                 selectedId.value = null;
             }
         };
 
         const addMacro = () => {
             if (!currentStatus.value.effects) currentStatus.value.effects = [];
             currentStatus.value.effects.push("");
         };
 
         const removeMacro = (idx) => {
             currentStatus.value.effects.splice(idx, 1);
         };
 
         return {
             statusDb, filteredStatus, currentStatus, selectedId, searchQuery,
             getDurationLabel, addStatus, removeStatus, addMacro, removeMacro
         };
     }
 };