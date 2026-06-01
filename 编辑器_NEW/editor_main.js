/**
 * 🌌 全能编辑器 V12.2 主入口 (Core Orchestrator - Schema Driven)
 * 修改：集成了全新的“状态字典 (Status DB)”模块，用于管理 Buff/Debuff 及动态条件状态。
 * 清理：移除了纸娃娃/装备系统 (Equip/Doll)，适配男主视角架构。
 */

 import { DialogueEditor } from './module_dialogue.js';
 import { MapEditor } from './module_map.js';
 import { EventsEditor } from './module_events.js'; 
 import { LayoutEditor } from './module_layout.js';
 import { ItemEditor } from './module_item.js';
 import { DollEditor } from './module_character.js'; 
 import { StatusEditor } from './module_status.js'; // 🌟 引入状态模块
 
 const { createApp, reactive, onMounted } = window.Vue;
 
 // -----------------------------------------------------------------------------
 // 1. 全局默认预设 (Default Schemas)
 // -----------------------------------------------------------------------------
 const DEFAULT_LAYOUT_DB = {
     "timeBox": { "name": "时间天气框", "left": "15px", "top": "15px", "right": "auto", "bottom": "auto", "width": "320px", "height": "45px", "zIndex": 100 },
     "leftPanel": { "name": "左侧留白/挂载区", "left": "15px", "top": "75px", "right": "auto", "bottom": "15px", "width": "320px", "height": "auto", "zIndex": 100 },
     "topBar": { "name": "顶部信息条", "left": "350px", "top": "15px", "right": "230px", "bottom": "auto", "height": "45px", "zIndex": 100 },
     "statusBox": { "name": "右下角生存属性", "left": "auto", "top": "auto", "right": "230px", "bottom": "15px", "width": "220px", "height": "110px", "zIndex": 100 },
     "tpBox": { "name": "💗 竖向快感胶囊管", "left": "auto", "top": "auto", "right": "20px", "bottom": "140px", "width": "70px", "height": "240px", "zIndex": 100 },
     "messageLog": { "name": "悬浮消息日志", "left": "18px", "top": "78px", "right": "auto", "bottom": "18px", "width": "314px", "zIndex": 105 },
     "easyDialogueBox": { "name": "简易对话主框", "left": "347px", "top": "auto", "right": "auto", "bottom": "15px", "width": "468px", "height": "110px", "zIndex": 300 },
     "easyChoiceBox": { "name": "简易选项容器", "left": "auto", "top": "auto", "right": "230px", "bottom": "140px", "width": "220px", "height": "auto", "zIndex": 310 },
     "quickItemBar": { "name": "🎒 快捷物品栏", "left": "350px", "top": "auto", "right": "auto", "bottom": "135px", "width": "468px", "height": "60px", "zIndex": 100 },
     "itemDropZone": { "name": "🟢 物品使用判定区", "left": "850px", "top": "100px", "width": "350px", "height": "550px", "zIndex": 100 },
     "buffListZone": { "name": "📜 状态效果列表", "left": "20px", "top": "150px", "width": "200px", "height": "auto", "zIndex": 110 } // 🌟 新增状态显示区
 };

 const DEFAULT_ITEM_DB = {
     settings: { defaultQuickSlots: 3 },
     items: []
 };

 const DEFAULT_STATUS_DB = {
     items: []
 };
 
 // -----------------------------------------------------------------------------
 // 2. 全局响应式状态 (Single Source of Truth)
 // -----------------------------------------------------------------------------
 const state = reactive({
     app: 'map',           
     projectPath: '',      
     dirHandle: null,      
     
     ui: {
         toastShow: false,
         toastMsg: '',
         isProjectLoaded: false,
         isSaving: false
     },
 
     db: {
         dialogueNodes: [],        
         areas: [],                
         characters: [],           
         layoutDb: {},             
         itemDb: {},               
         statusDb: { items: [] }, // 🌟 状态数据库映射
         globalEvents: [],         
         survivalDb: { settings: {} }, 
         fileTree: { "Root": [] }, 
         mapTree: { "Root": [] },  
         mapScenes: {},
         macroSchema: null 
     },
 
     current: { chapter: '', scene: '' }
 });
 
 // -----------------------------------------------------------------------------
 // 3. 全局核心服务 (Global Services)
 // -----------------------------------------------------------------------------
 const services = {
     showToast(msg) {
         state.ui.toastMsg = msg;
         state.ui.toastShow = true;
         setTimeout(() => { state.ui.toastShow = false; }, 3000);
     },
 
     async loadEditorConfigs() {
         console.log("🔄 正在初始化编辑器配置...");
         try {
             const res = await fetch('./MacroSchema.json');
             if (res.ok) {
                 state.db.macroSchema = await res.json();
                 console.log("✅ 演出指令 Schema 读取成功！");
             } else {
                 console.warn("⚠️ 无法获取 MacroSchema.json。");
             }
         } catch (e) {
             console.error("❌ 读取 MacroSchema.json 发生异常:", e);
         }
     },
 
     async scanProject() {
         if (!state.dirHandle) return;
         try {
             const dataDir = await state.dirHandle.getDirectoryHandle('data');
             
             // 扫描剧本目录
             const dd = await dataDir.getDirectoryHandle('dialogue', { create: true });
             const langDir = await dd.getDirectoryHandle('ja', { create: true });
             const newFileTree = { "Root": [] };
             for await (const [n, h] of langDir.entries()) {
                 if (n.includes('.meta')) continue; 
                 if (h.kind === 'directory') {
                     newFileTree[n] = [];
                     for await (const [sn] of h.entries()) {
                         if (sn.endsWith('.json') && !sn.includes('.meta')) newFileTree[n].push(sn.replace('.json', ''));
                     }
                 } else if (h.kind === 'file' && n.endsWith('.json')) {
                     newFileTree["Root"].push(n.replace('.json', ''));
                 }
             }
             state.db.fileTree = newFileTree;
 
             // 扫描地图目录
             const rd = await dataDir.getDirectoryHandle('room', { create: true });
             const newMapTree = { "Root": [] };
             const newMapScenes = {};
             for await (const [n, h] of rd.entries()) {
                 if (h.kind === 'directory') {
                     newMapTree[n] = [];
                     for await (const [sn, sh] of h.entries()) {
                         if (sn.endsWith('.json') && sn !== 'ExploreData.json') {
                             const sceneId = sn.replace('.json', '');
                             newMapTree[n].push(sceneId);
                             newMapScenes[`${n}/${sceneId}`] = JSON.parse(await (await sh.getFile()).text());
                         }
                     }
                 } else if (h.kind === 'file' && n.endsWith('.json')) {
                     const sceneId = n.replace('.json', '');
                     newMapTree["Root"].push(sceneId);
                     newMapScenes[sceneId] = JSON.parse(await (await h.getFile()).text());
                 }
             }
             state.db.mapTree = newMapTree;
             state.db.mapScenes = newMapScenes;
         } catch (e) { console.error("工程扫描中断:", e); }
     },
 
     async openProjectFolder() {
         try {
             const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
             state.dirHandle = handle;
             state.projectPath = handle.name;
             const dataDir = await handle.getDirectoryHandle('data');
             
             // 基础数据加载
             try {
                 const dd = await dataDir.getDirectoryHandle('dialogue');
                 const cf = await dd.getFileHandle('CharacterData.json');
                 state.db.characters = JSON.parse(await (await cf.getFile()).text());
             } catch(e) { state.db.characters = []; }
 
             try { 
                 const lf = await dataDir.getFileHandle('UILayoutData.json'); 
                 const loadedLayout = JSON.parse(await (await lf.getFile()).text()); 
                 state.db.layoutDb = { ...JSON.parse(JSON.stringify(DEFAULT_LAYOUT_DB)), ...loadedLayout };
             } catch(e) { state.db.layoutDb = JSON.parse(JSON.stringify(DEFAULT_LAYOUT_DB)); }

             try {
                 const itmF = await dataDir.getFileHandle('ItemData.json');
                 const loadedItems = JSON.parse(await (await itmF.getFile()).text());
                 state.db.itemDb = { ...JSON.parse(JSON.stringify(DEFAULT_ITEM_DB)), ...loadedItems };
             } catch(e) { state.db.itemDb = JSON.parse(JSON.stringify(DEFAULT_ITEM_DB)); }

             // 🌟 状态数据读取
             try {
                 const stsF = await dataDir.getFileHandle('StatusData.json');
                 state.db.statusDb = JSON.parse(await (await stsF.getFile()).text());
             } catch(e) { state.db.statusDb = JSON.parse(JSON.stringify(DEFAULT_STATUS_DB)); }
 
             await services.scanProject();
             state.ui.isProjectLoaded = true;
             services.showToast(`✅ 工程已挂载: ${handle.name}`);
         } catch (err) { console.error("工程开启失败:", err); }
     },
 
     async saveAllData() {
         if (!state.dirHandle || state.ui.isSaving) return;
         state.ui.isSaving = true;
         try {
             const dataDir = await state.dirHandle.getDirectoryHandle('data', { create: true });
 
             // 1. 保存当前剧本
             if (state.current.scene) {
                 const langDir = await (await dataDir.getDirectoryHandle('dialogue', { create: true })).getDirectoryHandle('ja', { create: true });
                 const td = state.current.chapter ? await langDir.getDirectoryHandle(state.current.chapter, { create: true }) : langDir;
                 
                 const f = await td.getFileHandle(`${state.current.scene}.json`, { create: true });
                 const w = await f.createWritable();
                 await w.write(JSON.stringify(state.db.dialogueNodes, null, 2));
                 await w.close();
                 
                 const mf = await td.getFileHandle(`${state.current.scene}.meta.json`, { create: true }); 
                 const mw = await mf.createWritable(); 
                 await mw.write(JSON.stringify({ areas: state.db.areas }, null, 2)); 
                 await mw.close();
             }
 
             // 2. 保存全局库
             const dd = await dataDir.getDirectoryHandle('dialogue', { create: true }); 
             const cf = await dd.getFileHandle('CharacterData.json', { create: true }); 
             const cw = await cf.createWritable(); await cw.write(JSON.stringify(state.db.characters, null, 2)); await cw.close();
 
             const layoutF = await dataDir.getFileHandle('UILayoutData.json', { create: true });
             const layoutW = await layoutF.createWritable(); await layoutW.write(JSON.stringify(state.db.layoutDb, null, 2)); await layoutW.close();

             const itemF = await dataDir.getFileHandle('ItemData.json', { create: true });
             const itemW = await itemF.createWritable(); await itemW.write(JSON.stringify(state.db.itemDb, null, 2)); await itemW.close();

             // 🌟 保存状态字典
             const statusF = await dataDir.getFileHandle('StatusData.json', { create: true });
             const statusW = await statusF.createWritable(); await statusW.write(JSON.stringify(state.db.statusDb, null, 2)); await statusW.close();
 
             // 3. 遍历保存所有载入的地图数据
             const roomDir = await dataDir.getDirectoryHandle('room', { create: true });
             for (const key of Object.keys(state.db.mapScenes)) {
                 const sceneData = state.db.mapScenes[key];
                 if (!sceneData) continue;
                 let targetDir = roomDir;
                 let fileName = key + '.json';
                 if (key.includes('/')) {
                     const parts = key.split('/');
                     targetDir = await roomDir.getDirectoryHandle(parts[0], { create: true });
                     fileName = parts[1] + '.json';
                 }
                 const mapF = await targetDir.getFileHandle(fileName, { create: true });
                 const mapW = await mapF.createWritable();
                 await mapW.write(JSON.stringify(sceneData, null, 2));
                 await mapW.close();
             }
 
             services.showToast("💾 核心数据同步完成！");
         } catch (e) {
             services.showToast("❌ 保存失败: " + e.message);
         } finally { state.ui.isSaving = false; }
     }
 };
 
 const App = {
     components: {
         'dialogue-editor': DialogueEditor,
         'layout-editor': LayoutEditor, 
         'map-editor': MapEditor,
         'events-editor': EventsEditor,
         'item-editor': ItemEditor,
         'character-editor': DollEditor,
         'status-editor': StatusEditor // 🌟 注册状态编辑器组件
     },
     setup() {
         onMounted(() => services.loadEditorConfigs());
         return { state, ...services };
     },
     template: `
         <div id="editor-shell" class="flex-column" style="width: 100vw; height: 100vh; background: var(--bg-color);">
             
             <div id="toast" :class="{show: state.ui.toastShow}" style="position: fixed; top: 70px; left: 50%; transform: translateX(-50%); background: var(--secondary); color: #000; padding: 8px 20px; border-radius: 20px; font-weight: bold; opacity: 0; transition: 0.3s; z-index: 9999; pointer-events: none; box-shadow: 0 5px 15px var(--secondary-glow);">
                 {{ state.ui.toastMsg }}
             </div>
             <style> #toast.show { opacity: 1 !important; transform: translateX(-50%) translateY(20px) !important; } </style>
  
             <div class="global-top-bar flex-row align-center" style="height: var(--top-bar-height); padding: 0 20px; background: var(--panel-bg); border-bottom: 1px solid var(--border); z-index: 1000; justify-content: space-between; flex-shrink: 0;">
                 <div class="app-switchers flex-row" style="gap: 10px;">
                     <button class="btn" :class="state.app === 'map' ? 'btn-primary' : 'btn-ghost'" @click="state.app='map'">🌍 地图探索</button>
                     <button class="btn" :class="state.app === 'item' ? 'btn-primary' : 'btn-ghost'" @click="state.app='item'">🎒 物品字典</button>
                     <button class="btn" :class="state.app === 'status' ? 'btn-primary' : 'btn-ghost'" @click="state.app='status'">🧠 状态字典</button>
                     <button class="btn" :class="state.app === 'character' ? 'btn-primary' : 'btn-ghost'" @click="state.app='character'">👥 角色库</button> 
                     <button class="btn" :class="state.app === 'layout' ? 'btn-primary' : 'btn-ghost'" @click="state.app='layout'">🖥️ UI 布局</button>
                     <button class="btn" :class="state.app === 'dialogue' ? 'btn-primary' : 'btn-ghost'" @click="state.app='dialogue'">💬 剧本节点</button>
                 </div>
                 
                 <div class="top-bar-right flex-row align-center" style="gap: 15px;">
                     <span v-if="state.projectPath" class="text-muted" style="font-size: 13px;">📂 {{state.projectPath}}</span>
                     <button class="btn btn-secondary" @click="openProjectFolder">
                         {{ state.ui.isProjectLoaded ? '📁 切换项目' : '🚀 开启工程' }}
                     </button>
                     
                     <button v-if="state.ui.isProjectLoaded" 
                             class="btn" 
                             :class="state.ui.isSaving ? 'btn-ghost' : 'btn-primary'"
                             @click="saveAllData"
                             :disabled="state.ui.isSaving"
                             style="background: var(--success); border: none; color: #000;">
                         {{ state.ui.isSaving ? '⌛ 写入中...' : '💾 保存全部' }}
                     </button>
                 </div>
             </div>
  
             <main class="editor-main-viewport flex-1" style="position: relative; width: 100%; overflow: hidden;">
                 <div v-if="!state.ui.isProjectLoaded" class="welcome-screen flex-column align-center justify-center text-muted" style="height: 100%;">
                     <h2>V12.2 数据解耦引擎</h2>
                     <p>👉 请开启工程以激活扫描管线</p>
                 </div>
                 <div v-else class="module-container" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
                     <section v-show="state.app === 'map'" style="width: 100%; height: 100%;"><map-editor></map-editor></section>
                     <section v-show="state.app === 'item'" style="width: 100%; height: 100%;"><item-editor></item-editor></section>
                     <section v-show="state.app === 'status'" style="width: 100%; height: 100%;"><status-editor></status-editor></section>
                     <section v-show="state.app === 'character'" style="width: 100%; height: 100%;"><character-editor></character-editor></section> 
                     <section v-show="state.app === 'layout'" style="width: 100%; height: 100%;"><layout-editor></layout-editor></section>
                     <section v-show="state.app === 'dialogue'" style="width: 100%; height: 100%;"><dialogue-editor></dialogue-editor></section>
                     <section v-show="state.app === 'events'" style="width: 100%; height: 100%;"><events-editor></events-editor></section>
                 </div>
             </main>
         </div>
     `
 };
  
 createApp(App).mount('#app');
 export { state, services };