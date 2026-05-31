/**
 * 🌌 全能编辑器 V12.2 - UI 布局工作台 (module_layout.js)
 * 修改：集成了“📜 状态效果列表 (buffListZone)”的可视化调节功能。
 */

 import { state, services } from './editor_main.js';
 import { ComponentPaperDoll } from './component_paperdoll.js';
 import { ComponentUiLayout } from './component_ui_layout.js';
 
 const { computed, reactive, ref } = window.Vue;
 
 // -----------------------------------------------------------------------------
 // 1. 全局布局预设 (包含状态列表的新版本)
 // -----------------------------------------------------------------------------
 const DEFAULT_LAYOUT = {
     timeBox: { name: "时间天气框", left: "20px", top: "20px", width: "320px", height: "50px", zIndex: 100 },
     leftPanel: { name: "左侧留白/挂载区", left: "20px", top: "85px", bottom: "20px", width: "320px", zIndex: 100 },
     topBar: { name: "顶部信息条", left: "360px", top: "20px", right: "240px", height: "50px", zIndex: 100 },
     statusBox: { name: "右下角生存属性", right: "20px", bottom: "20px", width: "220px", height: "120px", zIndex: 100 },
     tpBox: { name: "💗 TP爱心/快感管", right: "20px", bottom: "160px", width: "220px", height: "45px", zIndex: 100 },
     messageLog: { name: "悬浮消息日志", left: "20px", top: "90px", bottom: "20px", width: "314px", zIndex: 105 },
     
     // 🌟 新增：状态效果列表 (文字排列区)
     buffListZone: { name: "📜 状态效果列表", left: "20px", top: "150px", width: "200px", height: "auto", zIndex: 110 },
     
     playerAnimAnchor: { name: "🎯 玩家动画靶点 (Left)", left: "320px", top: "360px", width: "50px", height: "50px", zIndex: 200 },
     enemyAnimAnchor: { name: "🎯 敌人动画靶点 (Right)", left: "960px", top: "360px", width: "50px", height: "50px", zIndex: 200 },
     enemyPortrait: { name: "👿 敌方立绘挂载点", left: "800px", top: "100px", width: "400px", height: "500px", zIndex: 15 },
     
     quickItemBar: { name: "🎒 快捷物品栏", left: "350px", top: "auto", right: "auto", bottom: "140px", width: "468px", height: "60px", zIndex: 100 },
     
     easyDialogueBox: { name: "简易对话主框", left: "347px", top: "auto", right: "auto", bottom: "15px", width: "468px", height: "110px", zIndex: 300 },
     easyChoiceBox: { name: "简易选项容器", left: "auto", top: "auto", right: "230px", bottom: "140px", width: "220px", height: "auto", zIndex: 310 }
 };
 
 const template = `
     <div class="flex-row" style="width: 100%; height: 100%; gap: 15px; padding: 15px; box-sizing: border-box;">
         
         <div class="card flex-column" style="width: 450px; flex-shrink: 0; overflow: hidden; background: var(--panel-bg);">
             <div class="flex-row justify-between align-center p-15" style="border-bottom: 1px solid var(--border); background: var(--panel-bg-light);">
                 <span style="font-weight: bold; font-size: 16px; color: var(--secondary);">🖥️ UI 布局管线 (V12.2)</span>
                 <button class="btn btn-ghost text-warning" @click="resetToDefaults" style="font-size: 12px; padding: 4px 8px;">
                     ⚠️ 恢复默认布局
                 </button>
             </div>
 
             <div class="flex-1" style="overflow-y: auto; padding: 15px;">
                 <div class="text-muted m-b-15" style="font-size: 12px; line-height: 1.5;">
                     提示：右侧画布支持 [鼠标左键] 拖动位置，[右下角句柄] 调整尺寸。
                 </div>
 
                 <div v-for="(config, key) in layoutDb" :key="key" 
                      class="card p-10 flex-column m-b-10" 
                      :style="{ 
                          background: activeKey === key ? 'rgba(0, 242, 254, 0.15)' : 'rgba(0,0,0,0.2)', 
                          borderLeft: activeKey === key ? (key.includes('Anchor') ? '3px solid var(--danger)' : '3px solid var(--secondary)') : '3px solid transparent' 
                      }"
                      @click="activeKey = key"
                      style="cursor: pointer; transition: background 0.2s;">
                     
                     <div class="flex-row justify-between align-center m-b-10">
                         <span style="font-weight: bold; font-size: 14px;" :class="key.includes('Anchor') ? 'text-danger' : (activeKey === key ? 'text-secondary' : 'text-primary')">
                             {{ config.name || key }} ({{ key }})
                         </span>
                         <span class="text-muted" style="font-size: 11px;">Z-Index: <input type="number" v-model.number="config.zIndex" class="input" style="width: 60px; height: 20px; padding: 0 4px;" /></span>
                     </div>
 
                     <div class="flex-row" style="gap: 10px; flex-wrap: wrap;">
                         <div class="flex-row align-center" style="gap: 5px; width: 45%;">
                             <span class="text-muted" style="font-size: 11px; width: 35px;">Left:</span>
                             <input type="text" v-model="config.left" class="input flex-1" style="font-size: 12px;" placeholder="auto" />
                         </div>
                         <div class="flex-row align-center" style="gap: 5px; width: 45%;" v-if="!key.includes('Anchor')">
                             <span class="text-muted" style="font-size: 11px; width: 35px;">Right:</span>
                             <input type="text" v-model="config.right" class="input flex-1" style="font-size: 12px;" placeholder="auto" />
                         </div>
                         
                         <div class="flex-row align-center" style="gap: 5px; width: 45%;">
                             <span class="text-muted" style="font-size: 11px; width: 35px;">Top:</span>
                             <input type="text" v-model="config.top" class="input flex-1" style="font-size: 12px;" placeholder="auto" />
                         </div>
                         <div class="flex-row align-center" style="gap: 5px; width: 45%;" v-if="!key.includes('Anchor')">
                             <span class="text-muted" style="font-size: 11px; width: 35px;">Bottom:</span>
                             <input type="text" v-model="config.bottom" class="input flex-1" style="font-size: 12px;" placeholder="auto" />
                         </div>
 
                         <div class="flex-row align-center" style="gap: 5px; width: 45%;">
                             <span class="text-warning" style="font-size: 11px; width: 35px;">Width:</span>
                             <input type="text" v-model="config.width" class="input flex-1" style="font-size: 12px;" />
                         </div>
                         <div class="flex-row align-center" style="gap: 5px; width: 45%;">
                             <span class="text-warning" style="font-size: 11px; width: 35px;">Height:</span>
                             <input type="text" v-model="config.height" class="input flex-1" style="font-size: 12px;" />
                         </div>
                     </div>
                 </div>
             </div>
         </div>
 
         <div class="card flex-1 flex-column" style="position: relative; overflow: hidden; background: #0a0a0f; border: 2px solid var(--border);" @click.self="activeKey = ''">
             
             <div class="flex-row align-center p-10" style="position: absolute; top: 0; left: 0; width: 100%; z-index: 100; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);">
                 <div class="flex-row align-center" style="background: rgba(0,0,0,0.5); border-radius: 20px; border: 1px solid var(--border); overflow: hidden; margin-right: 15px;">
                     <button class="btn" :class="view.showUI ? 'btn-primary' : 'btn-ghost'" @click="view.showUI = !view.showUI">🔲 UI 编辑</button>
                     <div style="width: 1px; height: 16px; background: var(--border); margin: 0 5px;"></div>
                     <button class="btn" :class="view.showDoll ? 'btn-primary' : 'btn-ghost'" @click="view.showDoll = !view.showDoll">🧍 立绘参考</button>
                 </div>
                 
                 <div class="flex-1"></div>
                 <button class="btn btn-ghost" @click="resetView" style="padding: 4px 8px; font-size: 12px; margin-right: 10px;">🔄 重置视角</button>
                 <input type="range" v-model.number="view.scale" min="0.2" max="3" step="0.1" style="width: 100px;" />
                 <span class="text-secondary" style="width: 40px; text-align: right; font-family: monospace;">{{ view.scale.toFixed(1) }}x</span>
             </div>
 
             <div class="flex-1" style="width: 100%; height: 100%; cursor: grab; position: relative; overflow: hidden;"
                  @mousedown="startPan" @mousemove="doPan" @mouseup="endPan" @mouseleave="endPan">
                 
                 <component-paperdoll
                     v-show="view.showDoll"
                     :db="dollDb"
                     :equipped="defaultEquips"
                     expression="default"
                     :scale="view.scale"
                     :offsetX="view.offsetX"
                     :offsetY="view.offsetY"
                     bgImage="background"
                     :showAnchor="false"
                     :dirHandle="dirHandle"
                     style="pointer-events: none; opacity: 0.6;"
                 ></component-paperdoll>
 
                 <component-ui-layout
                     v-show="view.showUI"
                     :layoutDb="layoutDb"
                     :scale="view.scale"
                     :offsetX="view.offsetX"
                     :offsetY="view.offsetY"
                     v-model:activeKey="activeKey"
                 ></component-ui-layout>
             </div>
             
             <div class="flex-row align-center p-10" style="position: absolute; bottom: 0; left: 0; width: 100%; z-index: 100; background: rgba(0,0,0,0.6); gap: 10px;">
                 <span v-if="activeKey" class="text-secondary" style="font-size: 12px;">选中: <b>{{ layoutDb[activeKey]?.name || activeKey }}</b></span>
                 <span v-else class="text-muted" style="font-size: 12px;">拖拽空白处平移，滚轮缩放</span>
             </div>
         </div>
     </div>
 `;
 
 export const LayoutEditor = {
     name: 'LayoutEditor',
     components: {
         'component-paperdoll': ComponentPaperDoll,
         'component-ui-layout': ComponentUiLayout
     },
     template,
     setup() {
         const dirHandle = computed(() => state.dirHandle);
 
         const layoutDb = computed(() => {
             // 初始加载或重置
             if (!state.db.layoutDb || Object.keys(state.db.layoutDb).length === 0) {
                 state.db.layoutDb = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
             }
             
             // 🧹 兼容性数据迁移逻辑
             if (state.db.layoutDb['itemDropZone']) delete state.db.layoutDb['itemDropZone'];
             if (state.db.layoutDb['animAnchor']) {
                 state.db.layoutDb['playerAnimAnchor'] = JSON.parse(JSON.stringify(state.db.layoutDb['animAnchor']));
                 state.db.layoutDb['playerAnimAnchor'].name = "🎯 玩家动画靶点 (Left)";
                 if(!state.db.layoutDb['playerAnimAnchor'].width) state.db.layoutDb['playerAnimAnchor'].width = "50px";
                 if(!state.db.layoutDb['playerAnimAnchor'].height) state.db.layoutDb['playerAnimAnchor'].height = "50px";
                 delete state.db.layoutDb['animAnchor'];
             }
             
             // 🌟 自动补全缺失的预设字段 (如 buffListZone)
             Object.keys(DEFAULT_LAYOUT).forEach(k => {
                 if (!state.db.layoutDb[k]) {
                     state.db.layoutDb[k] = JSON.parse(JSON.stringify(DEFAULT_LAYOUT[k]));
                 }
             });
             return state.db.layoutDb;
         });
 
         const dollDb = computed(() => state.db.dollDb || { settings: { portraitX: 0, portraitY: 0 } });
         const defaultEquips = computed(() => dollDb.value.settings?.defaultEquips || {});
         const activeKey = ref('');
 
         const view = reactive({ 
             scale: 1.0, offsetX: 0, offsetY: 0, 
             isDragging: false, startX: 0, startY: 0, initPanX: 0, initPanY: 0,
             showUI: true, showDoll: true
         });
 
         const resetToDefaults = () => {
             if (confirm("确定恢复默认布局吗？这将覆盖现有所有改动。")) {
                 state.db.layoutDb = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
                 services.showToast("✅ 已重置为默认布局");
             }
         };
 
         const resetView = () => { view.scale = 1.0; view.offsetX = 0; view.offsetY = 0; };
 
         const startPan = (e) => {
             if (e.target !== e.currentTarget) return; 
             view.isDragging = true; 
             view.startX = e.clientX; view.startY = e.clientY; 
             view.initPanX = view.offsetX; view.initPanY = view.offsetY;
             activeKey.value = '';
         };
 
         const doPan = (e) => { 
             if (!view.isDragging) return; 
             view.offsetX = view.initPanX + (e.clientX - view.startX) / view.scale;
             view.offsetY = view.initPanY + (e.clientY - view.startY) / view.scale;
         };
 
         const endPan = () => { view.isDragging = false; };
 
         return {
             layoutDb, dollDb, defaultEquips, dirHandle,
             activeKey, view, resetToDefaults, resetView,
             startPan, doPan, endPan
         };
     }
 };