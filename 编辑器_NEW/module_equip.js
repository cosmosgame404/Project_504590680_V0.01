/**
 * 🌌 全能编辑器 V10.7 - 装备规则库与试衣镜工作台 (module_equip.js)
 * 更新：引入同屏复合预览 (Composite Preview) 架构。
 * 效果：在纸娃娃图层上方叠加 ComponentUiLayout 作为视觉参考层，
 * 采用 pointer-events: none 实现物理隔离，保证拖拽纸娃娃时互不干扰。
 */

 import { state, services } from './editor_main.js';
 import { ComponentPaperDoll } from './component_paperdoll.js';
 // [新增] 引入 UI 布局沙盒组件
 import { ComponentUiLayout } from './component_ui_layout.js';
 
 const { computed, reactive, ref } = window.Vue;
 
 const template = `
     <div class="flex-row" style="width: 100%; height: 100%; gap: 15px; padding: 15px; box-sizing: border-box;">
         
         <div class="card flex-column" style="width: 520px; flex-shrink: 0; overflow: hidden; background: var(--panel-bg);">
             
             <div class="flex-row" style="border-bottom: 1px solid var(--border); background: var(--panel-bg-light);">
                 <button class="btn flex-1" :class="activeTab === 'items' ? 'btn-primary' : 'btn-ghost'" @click="activeTab = 'items'" style="border-radius: 0; border: none;">👗 装备库</button>
                 <button class="btn flex-1" :class="activeTab === 'slots' ? 'btn-primary' : 'btn-ghost'" @click="activeTab = 'slots'" style="border-radius: 0; border: none;">🗂️ 穿戴槽</button>
                 <button class="btn flex-1" :class="activeTab === 'expressions' ? 'btn-primary' : 'btn-ghost'" @click="activeTab = 'expressions'" style="border-radius: 0; border: none;">🎭 表情组</button>
                 <button class="btn flex-1" :class="activeTab === 'settings' ? 'btn-primary' : 'btn-ghost'" @click="activeTab = 'settings'" style="border-radius: 0; border: none;">⚙️ 基底</button>
             </div>
 
             <div class="flex-1" style="overflow-y: auto; padding: 15px;">
                 
                 <div v-show="activeTab === 'items'" class="flex-column" style="gap: 12px;">
                     <div class="flex-row justify-center m-b-10">
                         <button class="btn btn-secondary" @click="addItem">➕ 新建装备 (添加到未分类)</button>
                     </div>
                     
                     <div v-for="slot in dollDb.slots" :key="'group_'+slot.id" class="flex-column" style="gap: 5px;">
                         <div class="card p-10 flex-row justify-between align-center" 
                              style="background: var(--panel-bg-light); cursor: pointer; border-left: 3px solid var(--primary);"
                              @click="toggleGroup(slot.id)">
                             <span style="font-weight: bold; font-size: 14px;">📁 {{ slot.name }} <span class="text-muted">({{ groupedItems[slot.id].length }})</span></span>
                             <span class="text-muted">{{ expandedGroups[slot.id] ? '▼' : '◀' }}</span>
                         </div>
                         
                         <div v-show="expandedGroups[slot.id]" class="flex-column" style="gap: 8px; padding-left: 15px; border-left: 1px dashed var(--border); margin-left: 5px;">
                             <div v-for="item in groupedItems[slot.id]" :key="item.id" class="card p-10 flex-column" style="gap: 8px; background: rgba(0,0,0,0.2);">
                                 <div class="flex-row align-center" style="gap: 10px;">
                                     <input v-model="item.id" class="input flex-1" placeholder="系统ID (cloth_xxx)" />
                                     <input v-model="item.name" class="input flex-1" placeholder="显示名称" />
                                 </div>
                                 <div class="flex-row align-center" style="gap: 10px;">
                                     <select v-model="item.slotId" class="select flex-1">
                                         <option value="" disabled>-- 绑定槽位 --</option>
                                         <option v-for="s in dollDb.slots" :key="s.id" :value="s.id">{{ s.name }}</option>
                                     </select>
                                     <input v-model="item.image" class="input flex-1" placeholder="图片名 (不带后缀)" />
                                 </div>
                                 <div class="flex-row align-center justify-center" style="gap: 10px; margin-top: 5px;">
                                     <button class="btn" :class="isPreviewing(item) ? 'btn-primary' : 'btn-ghost'" @click="togglePreviewItem(item)">
                                         {{ isPreviewing(item) ? '👀 卸下' : '👕 试穿' }}
                                     </button>
                                     <button class="btn btn-ghost text-danger" @click="removeItem(item)">🗑️ 删除</button>
                                 </div>
                             </div>
                             <div v-if="groupedItems[slot.id].length === 0" class="text-muted" style="font-size: 12px; padding: 5px;">此槽位暂无装备。</div>
                         </div>
                     </div>
 
                     <div v-if="groupedItems['unassigned'].length > 0" class="flex-column" style="gap: 5px; margin-top: 10px;">
                         <div class="card p-10 flex-row justify-between align-center" 
                              style="background: rgba(255, 152, 0, 0.1); cursor: pointer; border-left: 3px solid var(--warning);"
                              @click="toggleGroup('unassigned')">
                             <span style="font-weight: bold; color: var(--warning); font-size: 14px;">⚠️ 未分类装备 <span class="text-muted">({{ groupedItems['unassigned'].length }})</span></span>
                             <span class="text-muted">{{ expandedGroups['unassigned'] ? '▼' : '◀' }}</span>
                         </div>
                         <div v-show="expandedGroups['unassigned']" class="flex-column" style="gap: 8px; padding-left: 15px; border-left: 1px dashed var(--border); margin-left: 5px;">
                             <div v-for="item in groupedItems['unassigned']" :key="item.id" class="card p-10 flex-column" style="gap: 8px; background: rgba(0,0,0,0.2);">
                                 <div class="flex-row align-center" style="gap: 10px;">
                                     <input v-model="item.id" class="input flex-1" />
                                     <input v-model="item.name" class="input flex-1" />
                                 </div>
                                 <div class="flex-row align-center" style="gap: 10px;">
                                     <select v-model="item.slotId" class="select flex-1" style="border-color: var(--warning);">
                                         <option value="">-- 请分配槽位 --</option>
                                         <option v-for="s in dollDb.slots" :key="s.id" :value="s.id">{{ s.name }}</option>
                                     </select>
                                     <button class="btn btn-ghost text-danger" @click="removeItem(item)">🗑️ 删除</button>
                                 </div>
                             </div>
                         </div>
                     </div>
                 </div>
 
                 <div v-show="activeTab === 'slots'" class="flex-column" style="gap: 12px;">
                     <div class="flex-row justify-center"><button class="btn btn-secondary" @click="addSlot">➕ 新建槽位</button></div>
                     <div v-for="(slot, index) in dollDb.slots" :key="slot.id" class="card p-10 flex-column" style="gap: 8px; background: rgba(0,0,0,0.2);">
                         <div class="flex-row align-center" style="gap: 10px;">
                             <input v-model="slot.id" class="input flex-1" placeholder="槽位ID" />
                             <input v-model="slot.name" class="input flex-1" placeholder="显示名称" />
                         </div>
                         <div class="flex-row align-center" style="gap: 10px;">
                             <span class="text-muted" style="font-size: 12px;">Z-Index:</span>
                             <input type="number" v-model.number="slot.zIndex" class="input flex-1" />
                             <span class="text-muted" style="font-size: 12px;">排序:</span>
                             <input type="number" v-model.number="slot.order" class="input flex-1" />
                         </div>
                         <div class="flex-row justify-center"><button class="btn btn-ghost text-danger" @click="removeSlot(index)">🗑️ 删除槽位</button></div>
                     </div>
                 </div>
 
                 <div v-show="activeTab === 'expressions'" class="flex-column" style="gap: 12px;">
                     <div class="flex-row justify-center"><button class="btn btn-secondary" @click="addExpression">➕ 新建表情</button></div>
                     <div v-for="(exp, index) in dollDb.expressions" :key="exp.id" class="card p-10 flex-column" style="gap: 8px; background: rgba(0,0,0,0.2);">
                         <div class="flex-row align-center" style="gap: 10px;">
                             <input v-model="exp.id" class="input flex-1" placeholder="ID" />
                             <select v-model="exp.type" class="select flex-1">
                                 <option value="default">默认</option>
                                 <option value="damage">受伤</option>
                                 <option value="condition">条件触发</option>
                             </select>
                         </div>
                         <input v-model="exp.image" class="input" placeholder="图片名" />
                         <div class="flex-row align-center justify-center" style="gap: 10px;">
                             <button class="btn" :class="preview.expression === exp.id ? 'btn-primary' : 'btn-ghost'" @click="togglePreviewExpression(exp)">预览</button>
                             <button class="btn btn-ghost text-danger" @click="removeExpression(index)">🗑️ 删除</button>
                         </div>
                     </div>
                 </div>
 
                 <div v-show="activeTab === 'settings'" class="flex-column" style="gap: 12px;">
                     
                     <div class="card p-15 flex-column" style="gap: 15px; background: rgba(0,0,0,0.2);">
                         <div class="flex-column" style="gap: 5px;">
                             <label class="text-primary" style="font-weight: bold; font-size: 13px;">🧍 素体 (Base Body)</label>
                             <div class="flex-row align-center" style="gap: 10px;">
                                 <input v-model="dollDb.settings.baseBodyImage" class="input flex-1" placeholder="图片名" />
                                 <input type="number" v-model.number="dollDb.settings.baseBodyZIndex" class="input" style="width: 80px;" />
                             </div>
                         </div>
                         <div class="flex-column" style="gap: 5px;">
                             <label class="text-primary" style="font-weight: bold; font-size: 13px;">🎭 表情层全局 Z-Index</label>
                             <input type="number" v-model.number="dollDb.settings.expressionZIndex" class="input" />
                         </div>
                         
                         <div class="flex-column" style="gap: 5px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
                             <label class="text-secondary" style="font-weight: bold; font-size: 13px;">🔒 纸娃娃真实坐标 (Portrait X/Y)</label>
                             <div class="text-muted m-b-10" style="font-size: 11px;">1280x720 绝对坐标，同步 MZ 实机。可以直接输入，或在右侧选择"移动纸娃娃"进行直观拖拽。</div>
                             <div class="flex-row align-center" style="gap: 10px;">
                                 <span class="text-muted" style="font-size: 12px;">X:</span>
                                 <input type="number" v-model.number="dollDb.settings.portraitX" class="input flex-1" />
                                 <span class="text-muted" style="font-size: 12px;">Y:</span>
                                 <input type="number" v-model.number="dollDb.settings.portraitY" class="input flex-1" />
                             </div>
                         </div>
                     </div>
 
                     <div class="card p-15 flex-column" style="gap: 15px; background: rgba(0,0,0,0.2);">
                         <div class="flex-column" style="gap: 5px;">
                             <label class="text-secondary" style="font-weight: bold; font-size: 14px;">🎒 初始默认穿着</label>
                             <div class="flex-column" style="gap: 10px; margin-top: 10px;">
                                 <div v-for="slot in dollDb.slots" :key="'def_'+slot.id" class="flex-row align-center" style="gap: 10px;">
                                     <span style="width: 80px; font-size: 13px; color: #ccc;">{{ slot.name }}:</span>
                                     <select v-model="dollDb.settings.defaultEquips[slot.id]" class="select flex-1">
                                         <option value="">-- 裸装 --</option>
                                         <option v-for="item in groupedItems[slot.id]" :key="item.id" :value="item.id">{{ item.name }}</option>
                                     </select>
                                 </div>
                             </div>
                         </div>
                     </div>
 
                 </div>
             </div>
         </div>
 
         <div class="card flex-1 flex-column" style="position: relative; overflow: hidden; background: #0a0a0f; border: 2px solid var(--border);">
             
             <div class="flex-row align-center p-10" style="position: absolute; top: 0; left: 0; width: 100%; z-index: 100; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);">
                 
                 <div class="flex-row align-center" style="background: rgba(0,0,0,0.5); border-radius: 20px; border: 1px solid var(--border); overflow: hidden; margin-right: 15px;">
                     <button class="btn" :class="view.dragMode === 'viewport' ? 'btn-primary' : 'btn-ghost'" 
                             @click="view.dragMode = 'viewport'" style="border: none; border-radius: 0; padding: 6px 12px;">
                         🌍 移动视角
                     </button>
                     <button class="btn" :class="view.dragMode === 'doll' ? 'btn-primary' : 'btn-ghost'" 
                             @click="view.dragMode = 'doll'" style="border: none; border-radius: 0; padding: 6px 12px;">
                         🧍 移动纸娃娃
                     </button>
                     <div style="width: 1px; height: 16px; background: var(--border); margin: 0 5px;"></div>
                     <button class="btn" :class="view.showUI ? 'btn-primary' : 'btn-ghost'" 
                             @click="view.showUI = !view.showUI" style="border: none; border-radius: 0; padding: 6px 12px;" title="显示/隐藏系统UI参考层">
                         🔲 UI 参考
                     </button>
                 </div>
 
                 <div class="flex-row align-center" style="gap: 5px;">
                     <span class="text-muted" style="font-size: 12px;">对照图(img/room):</span>
                     <input type="text" v-model="view.bgImageName" class="input" style="width: 100px; height: 26px; padding: 0 5px;" placeholder="background" />
                 </div>
                 
                 <div class="flex-1"></div>
                 <button class="btn btn-ghost" @click="resetView" style="padding: 4px 8px; font-size: 12px; margin-right: 10px;">🔄 重置视角</button>
                 <input type="range" v-model.number="view.scale" min="0.2" max="3" step="0.1" style="width: 100px;" />
                 <span class="text-secondary" style="width: 40px; text-align: right; font-family: monospace;">{{ view.scale.toFixed(1) }}x</span>
             </div>
 
             <div class="flex-1" style="width: 100%; height: 100%; cursor: grab; position: relative; overflow: hidden;"
                  @mousedown="startPan" @mousemove="doPan" @mouseup="endPan" @mouseleave="endPan">
                 
                 <component-paperdoll
                     :db="dollDb"
                     :equipped="preview.equipped"
                     :expression="preview.expression"
                     :scale="view.scale"
                     :offsetX="view.offsetX"
                     :offsetY="view.offsetY"
                     :bgImage="view.bgImageName"
                     :showAnchor="true"
                     :dirHandle="dirHandle" 
                 ></component-paperdoll>
 
                 <component-ui-layout
                     v-show="view.showUI"
                     :layoutDb="layoutDb"
                     :scale="view.scale"
                     :offsetX="view.offsetX"
                     :offsetY="view.offsetY"
                     style="pointer-events: none; opacity: 0.75;" 
                 ></component-ui-layout>
 
             </div>
             
             <div class="flex-row align-center p-10" style="position: absolute; bottom: 0; left: 0; width: 100%; z-index: 100; background: rgba(0,0,0,0.6); gap: 10px;">
                 <span v-if="!dirHandle" class="text-danger" style="font-size: 12px;">❌ 警告：工程未挂载</span>
                 <span v-else class="text-success" style="font-size: 12px;">✅ WebGL 沙盒已就绪</span>
                 <span class="text-muted" style="font-size: 12px; margin-left: auto;">
                     {{ view.dragMode === 'viewport' ? '当前拖拽：整个画布视角' : '当前拖拽：写入底层 portrait 坐标' }}
                 </span>
             </div>
         </div>
 
     </div>
 `;
 
 export const EquipEditor = {
     name: 'EquipEditor',
     components: {
         'component-paperdoll': ComponentPaperDoll,
         'component-ui-layout': ComponentUiLayout // [新增] 注册组件
     },
     template,
     setup() {
         const dollDb = computed(() => {
             if (!state.db.dollDb) state.db.dollDb = {};
             const db = state.db.dollDb;
             if (!db.settings) db.settings = { baseBodyImage: '', baseBodyZIndex: 20, expressionZIndex: 999 };
             if (!db.settings.defaultEquips) db.settings.defaultEquips = {}; 
             
             // 初始化安全锚点
             if (db.settings.portraitX === undefined) db.settings.portraitX = 0;
             if (db.settings.portraitY === undefined) db.settings.portraitY = 0;
 
             if (!db.slots) db.slots = [];
             if (!db.items) db.items = [];
             if (!db.expressions) db.expressions = [];
             return db;
         });
 
         // [新增] 获取全局 UI 布局数据
         const layoutDb = computed(() => {
             if (!state.db.layoutDb) state.db.layoutDb = {};
             return state.db.layoutDb;
         });
 
         const dirHandle = computed(() => state.dirHandle);
         const activeTab = ref('items');
         const expandedGroups = reactive({ unassigned: true });
         
         const toggleGroup = (groupId) => { expandedGroups[groupId] = !expandedGroups[groupId]; };
 
         const groupedItems = computed(() => {
             const groups = { unassigned: [] };
             dollDb.value.slots.forEach(s => { groups[s.id] = []; });
             dollDb.value.items.forEach(item => {
                 if (item.slotId && groups[item.slotId]) groups[item.slotId].push(item);
                 else groups.unassigned.push(item);
             });
             return groups;
         });
 
         const preview = reactive({ equipped: {}, expression: '' });
         const isPreviewing = (item) => preview.equipped[item.slotId] === item.id;
 
         const togglePreviewItem = (item) => {
             if (!item.slotId) return services.showToast("⚠️ 该装备未绑定槽位");
             if (isPreviewing(item)) delete preview.equipped[item.slotId];
             else preview.equipped[item.slotId] = item.id;
         };
 
         const togglePreviewExpression = (exp) => { preview.expression = preview.expression === exp.id ? '' : exp.id; };
 
         const generateId = (prefix, arr) => {
             let max = 0;
             arr.forEach(obj => {
                 const match = obj.id && obj.id.match(new RegExp(`^${prefix}(\\d+)$`));
                 if (match) max = Math.max(max, parseInt(match[1]));
             });
             return `${prefix}${String(max + 1).padStart(3, '0')}`;
         };
 
         const addItem = () => {
             dollDb.value.items.push({ id: generateId('cloth_', dollDb.value.items), name: '新装备', slotId: '', image: '', lockedCondition: '', memo: '' });
             expandedGroups['unassigned'] = true;
         };
 
         const removeItem = (item) => {
             const index = dollDb.value.items.findIndex(i => i === item);
             if (index > -1) {
                 if (item.slotId && preview.equipped[item.slotId] === item.id) delete preview.equipped[item.slotId];
                 if (item.slotId && dollDb.value.settings.defaultEquips[item.slotId] === item.id) dollDb.value.settings.defaultEquips[item.slotId] = "";
                 dollDb.value.items.splice(index, 1);
             }
         };
 
         const addSlot = () => {
             const newId = `slot_${Date.now().toString().slice(-4)}`;
             dollDb.value.slots.push({ id: newId, name: '新槽位', zIndex: 10, order: dollDb.value.slots.length + 1 });
             dollDb.value.settings.defaultEquips[newId] = "";
             expandedGroups[newId] = true;
         };
 
         const removeSlot = (index) => {
             const slotId = dollDb.value.slots[index].id;
             delete preview.equipped[slotId];
             delete dollDb.value.settings.defaultEquips[slotId];
             dollDb.value.slots.splice(index, 1);
         };
 
         const addExpression = () => { dollDb.value.expressions.push({ id: generateId('exp_', dollDb.value.expressions), type: 'default', image: '', condition: '' }); };
         const removeExpression = (index) => {
             const expId = dollDb.value.expressions[index].id;
             if (preview.expression === expId) preview.expression = '';
             dollDb.value.expressions.splice(index, 1);
         };
 
         const view = reactive({ 
             scale: 1.0, offsetX: 0, offsetY: 0, 
             isDragging: false, startX: 0, startY: 0, initPanX: 0, initPanY: 0, initDollX: 0, initDollY: 0,
             dragMode: 'viewport',
             bgImageName: 'background',
             showUI: true // [新增] 控制 UI 参考层显示
         });
 
         const resetView = () => { view.scale = 1.0; view.offsetX = 0; view.offsetY = 0; };
 
         const startPan = (e) => { 
             view.isDragging = true; 
             view.startX = e.clientX; 
             view.startY = e.clientY; 
             
             if (view.dragMode === 'viewport') {
                 view.initPanX = view.offsetX;
                 view.initPanY = view.offsetY;
             } else {
                 view.initDollX = dollDb.value.settings.portraitX || 0;
                 view.initDollY = dollDb.value.settings.portraitY || 0;
             }
             e.currentTarget.style.cursor = 'grabbing'; 
         };
 
         const doPan = (e) => { 
             if (!view.isDragging) return; 
             const dx = (e.clientX - view.startX) / view.scale;
             const dy = (e.clientY - view.startY) / view.scale;
             
             if (view.dragMode === 'viewport') {
                 view.offsetX = view.initPanX + dx;
                 view.offsetY = view.initPanY + dy;
             } else {
                 dollDb.value.settings.portraitX = Math.round(view.initDollX + dx);
                 dollDb.value.settings.portraitY = Math.round(view.initDollY + dy);
             }
         };
         const endPan = (e) => { view.isDragging = false; if (e && e.currentTarget) e.currentTarget.style.cursor = 'grab'; };
 
         return {
             dollDb, layoutDb, dirHandle, activeTab, preview, view, groupedItems, expandedGroups,
             toggleGroup, isPreviewing, togglePreviewItem, togglePreviewExpression,
             addItem, removeItem, addSlot, removeSlot, addExpression, removeExpression,
             resetView, startPan, doPan, endPan
         };
     }
 };