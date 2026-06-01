/**
 * CM_Editor: Actor & UI Architect - V4.0 (AVG/Galgame SSOT Architecture)
 * * [アーキテクチャ更新履歴]
 * - レガシーな戦闘AI(ActionPatterns)を完全撤廃し、データ構造をスリム化。
 * - 生存・関係性動的プロパティ(CustomProps)を全エンティティ(NPC含む)に解放。
 * これにより、好感度(Affinity)や気分(Mood)の定義がネイティブに可能化。
 * - 独自のインタラクションハブ(Interactions)を実装し、行動コスト(AP/Time)と
 * トリガー条件(Condition)の完全なマッピングを実現。
 * - 多表情差分システム(Expressions)を導入し、単一のクロップ座標に基づく
 * バリエーション画像の切り替えをサポート。
 * * @author Cosmos404
 */

 import { state, services } from './editor_main.js';

 const injectStyles = () => {
     if (document.getElementById('v40-doll-style')) return;
     const style = document.createElement('style');
     style.id = 'v40-doll-style';
     style.innerHTML = `
         .v10-doll-root { display: flex; width: 100%; height: 100%; overflow: hidden; background: var(--bg-color); }
         
         .v10-doll-sidebar { width: 280px; background: var(--panel-bg); border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index: 50; flex-shrink: 0; }
         .v10-doll-header { padding: 15px; background: rgba(0,0,0,0.5); border-bottom: 1px solid var(--border); font-weight: bold; color: var(--primary); display: flex; justify-content: space-between; align-items: center; }
         .v10-doll-list { padding: 10px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px; }
         
         .v10-doll-item { padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s; }
         .v10-doll-item:hover { background: rgba(255,255,255,0.08); }
         .v10-doll-item.is-active { background: var(--primary-glow); border-color: var(--primary); }
         .v10-doll-avatar-mini { width: 32px; height: 32px; border-radius: 50%; background: #222; border: 1px solid #444; object-fit: cover; flex-shrink: 0; }
         
         .v10-doll-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
         .v10-doll-toolbar { height: 50px; border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 20px; justify-content: space-between; background: rgba(0,0,0,0.2); flex-shrink: 0; }
         .v10-doll-content { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
         
         .v10-doll-card { background: var(--panel-bg); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: visible; display: flex; flex-direction: column; }
         .v10-doll-card-header { padding: 10px 15px; background: rgba(0,0,0,0.4); border-bottom: 1px solid var(--border); font-weight: bold; color: var(--secondary); flex-shrink: 0; }
         .v10-doll-card-body { padding: 15px; display: flex; flex-direction: column; gap: 15px; }
         
         .v10-doll-grid-meta { display: grid; grid-template-columns: 0.5fr 1fr 1fr 1fr; gap: 15px; align-items: start; }
         .v10-doll-grid-params { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
         .v10-layout-bottom { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; align-items: start; }
         
         .v10-field-group { display: flex; flex-direction: column; gap: 6px; }
         .v10-field-label { font-size: 12px; color: var(--text-muted); font-weight: bold; white-space: nowrap; }
         
         .v10-doll-preview-box { width: 100%; height: 180px; background: repeating-conic-gradient(#1a1d24 0% 25%, #222630 0% 50%) 50% / 10px 10px; border: 1px dashed var(--border); border-radius: var(--radius-md); display: flex; justify-content: center; align-items: center; overflow: hidden; position: relative; }
         .v10-doll-preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
         
         .v10-doll-prop-row { display: grid; grid-template-columns: 2fr 2fr 1fr 1fr auto; gap: 10px; align-items: center; background: rgba(0,0,0,0.2); padding: 8px; border-radius: var(--radius-sm); margin-bottom: 5px; }
         
         /* インタラクションブロック専用スタイル (Interaction Block Styles) */
         .v40-interaction-block { background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-left: 3px solid var(--secondary); border-radius: var(--radius-sm); padding: 10px; display: flex; flex-direction: column; gap: 8px; }
         .v40-interaction-row { display: flex; gap: 10px; align-items: center; }
         .v40-interaction-row .input { flex: 1; }
         .v40-interaction-row select.input { flex: 0.5; }
         
         .v10-btn-icon { background: rgba(255,59,91,0.2); border: 1px solid var(--danger); color: var(--danger); border-radius: 4px; cursor: pointer; display: flex; justify-content: center; align-items: center; transition: 0.2s; width: 28px; height: 28px; flex-shrink: 0; }
         .v10-btn-icon:hover { background: var(--danger); color: #fff; }
 
         /* クロップツール専用スタイル (Crop Workspace Styles) */
         .v10-crop-workspace { position: relative; width: 100%; min-height: 300px; display: flex; justify-content: center; align-items: center; background: #0a0a0c; border: 1px dashed var(--border); overflow: hidden; user-select: none; }
         .v10-crop-image { max-width: 100%; max-height: 50vh; display: block; object-fit: contain; pointer-events: none; }
         .v10-crop-mask-overlay { position: absolute; border-radius: 50%; box-shadow: 0 0 0 9999px rgba(0,0,0,0.75); border: 2px solid var(--secondary); cursor: grab; transform: translate(-50%, -50%); transition: border-color 0.2s; }
         .v10-crop-mask-overlay:hover { border-color: #fff; }
         .v10-crop-mask-overlay:active { cursor: grabbing; border-color: var(--primary); }
     `;
     document.head.appendChild(style);
 };
 injectStyles();
 
 export const DollEditor = {
     setup() {
         const ui = Vue.reactive({
             activeActorId: null,
             settingsOpen: false,
             isLoading: false,
             imageCache: {}
         });
 
         // クロップツールのリアクティブ状態 (Crop Tool State)
         const cropUI = Vue.reactive({
             isOpen: false,
             imgSrc: '',
             imgScale: 1,      
             x: 0,             
             y: 0,             
             r: 80,            
             actualR: 80,      
             isDragging: false,
             startX: 0,
             startY: 0,
             initX: 0,
             initY: 0
         });
 
         const cropImgRef = Vue.ref(null);
 
         // ============================================================================
         // データ正規化エンジン (Data Normalization Engine)
         // ============================================================================
         const normalizeData = (data) => {
             if (!data) return;
             
             const defaultAliases = { 
                 mhp: "Max_HP", mmp: "Max_MP", hp: "Init_HP", mp: "Init_MP", 
                 tp: "Init_TP", sp: "Init_SP", msp: "Max_SP", spRegen: "SP_Regen", 
                 atk: "ATK", def: "DEF", mat: "MAT", mdf: "MDF", agi: "AGI", luk: "LUK" 
             };
 
             if (Array.isArray(data)) {
                 state.db.characters = {
                     version: "4.0.0",
                     settings: { paramAliases: defaultAliases },
                     actors: data
                 };
                 return; 
             }
 
             if (!data.settings) data.settings = { paramAliases: {} };
             
             for (const k in defaultAliases) {
                 if (!data.settings.paramAliases[k]) {
                     data.settings.paramAliases[k] = defaultAliases[k];
                 }
             }
 
             if (!data.actors) data.actors = [];
             
             data.actors.forEach(actor => {
                 // 基本フラグ (Base Flags)
                 if (typeof actor.isProtagonist !== 'boolean') actor.isProtagonist = false;
                 if (typeof actor.isEnemy !== 'boolean') actor.isEnemy = false;
                 
                 // パラメータ初期化 (Parameter Init)
                 if (!actor.baseParams) actor.baseParams = {};
                 const defs = { 
                     mhp: 100, mmp: 50, hp: 100, mp: 50, tp: 0, 
                     sp: 10, msp: 10, spRegen: 2, 
                     atk: 10, def: 10, mat: 10, mdf: 10, agi: 10, luk: 10 
                 };
                 for (const k in defs) {
                     if (typeof actor.baseParams[k] === 'undefined') actor.baseParams[k] = defs[k];
                 }
                 
                 if (actor.baseParams.mhp === 100 && actor.baseParams.hp !== 100) actor.baseParams.mhp = actor.baseParams.hp;
                 if (actor.baseParams.mmp === 50 && actor.baseParams.mp !== 50) actor.baseParams.mmp = actor.baseParams.mp;
 
                 // AVG特化：動的プロパティ (Dynamic Props for AVG Affinity/Mood etc.)
                 if (!actor.customProps) actor.customProps = [];
                 
                 // レガシー戦闘AIのパージ (Purge Legacy Combat AI)
                 if (actor.actionPatterns !== undefined) delete actor.actionPatterns;
 
                 // インタラクションハブ (Interaction Hub Init)
                 if (!actor.interactions) actor.interactions = [];
                 
                 // 立絵と差分システム (Portrait & Expression Init)
                 if (!actor.portrait) {
                     actor.portrait = { useOverride: false, overrideName: "", default: "", crop: { active: false, x: 0, y: 0, r: 100 }, expressions: [] };
                 } else {
                     if (!actor.portrait.crop) actor.portrait.crop = { active: false, x: 0, y: 0, r: 100 };
                     if (typeof actor.portrait.default === 'undefined') actor.portrait.default = "";
                     if (!actor.portrait.expressions) actor.portrait.expressions = [];
                 }
             });
         };
 
         Vue.watch(() => state.db.characters, normalizeData, { deep: true, immediate: true });
 
         const actors = Vue.computed(() => state.db.characters?.actors || []);
         const settings = Vue.computed(() => state.db.characters?.settings || { paramAliases: {} });
         const activeActor = Vue.computed(() => actors.value.find(a => a.id === ui.activeActorId) || null);
 
         const selectActor = (id) => { ui.activeActorId = id; };
 
         const handleProtagonistChange = (actor) => {
             if (actor && actor.isProtagonist) {
                 actor.isEnemy = false;
             }
         };
 
         // ============================================================================
         // 画像リソース管理 (Image Pipeline)
         // ============================================================================
         const loadImagesFromProject = async () => {
             if (!state.dirHandle) return;
             try {
                 const imgDir = await state.dirHandle.getDirectoryHandle('img');
                 const npcDir = await imgDir.getDirectoryHandle('npc');
                 
                 for (const actor of actors.value) {
                     if (actor.isProtagonist) continue;
                     
                     const imgName = actor.portrait?.useOverride && actor.portrait.overrideName 
                         ? actor.portrait.overrideName 
                         : `npc_${actor.id}`;
                     
                     if (ui.imageCache[imgName]) continue;
                     ui.imageCache[imgName] = 'loading'; 
 
                     try {
                         const fileHandle = await npcDir.getFileHandle(`${imgName}.png`);
                         const file = await fileHandle.getFile();
                         ui.imageCache[imgName] = URL.createObjectURL(file);
                     } catch (e) {
                         try {
                             const defHandle = await npcDir.getFileHandle(`npc_def.png`);
                             const defFile = await defHandle.getFile();
                             ui.imageCache[imgName] = URL.createObjectURL(defFile);
                         } catch (err2) {
                             ui.imageCache[imgName] = 'none';
                         }
                     }
                 }
             } catch (e) {
                 // Silent Catch
             }
         };
 
         Vue.watch(() => actors.value, loadImagesFromProject, { deep: true, immediate: true });
 
         const getActorImageSrc = (actor) => {
             if (!actor) return '';
             const imgName = actor.portrait?.useOverride && actor.portrait.overrideName 
                 ? actor.portrait.overrideName 
                 : `npc_${actor.id}`;
             
             const cachedUrl = ui.imageCache[imgName];
             if (cachedUrl && cachedUrl !== 'none' && cachedUrl !== 'loading') {
                 return cachedUrl;
             }
             return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 100"><rect width="100" height="100" fill="%232a2e38"/><text x="50%" y="50%" fill="%23666" font-size="12" text-anchor="middle" dy=".3em">NO_DATA</text></svg>';
         };
 
         // ============================================================================
         // クロップ演算ロジック (Crop Computation Logic)
         // ============================================================================
         const openCropModal = () => {
             if (!activeActor.value) return;
             cropUI.imgSrc = getActorImageSrc(activeActor.value);
             cropUI.isOpen = true;
         };
 
         const onCropImageLoad = () => {
             const img = cropImgRef.value;
             if (!img) return;
             
             cropUI.imgScale = img.naturalWidth / img.clientWidth;
             
             const cropData = activeActor.value.portrait.crop;
             if (cropData && cropData.active && cropData.r > 0) {
                 cropUI.actualR = cropData.r;
                 cropUI.r = cropData.r / cropUI.imgScale;
                 cropUI.x = cropData.x / cropUI.imgScale;
                 cropUI.y = cropData.y / cropUI.imgScale;
             } else {
                 cropUI.actualR = 150; 
                 cropUI.r = 150 / cropUI.imgScale;
                 cropUI.x = img.clientWidth / 2;
                 cropUI.y = img.clientHeight / 2;
             }
         };
 
         Vue.watch(() => cropUI.actualR, (newActualR) => {
             if(cropUI.imgScale > 0) {
                 cropUI.r = newActualR / cropUI.imgScale;
             }
         });
 
         const startCropDrag = (e) => {
             cropUI.isDragging = true;
             cropUI.startX = e.clientX;
             cropUI.startY = e.clientY;
             cropUI.initX = cropUI.x;
             cropUI.initY = cropUI.y;
         };
 
         const onCropDrag = (e) => {
             if (!cropUI.isDragging) return;
             const dx = e.clientX - cropUI.startX;
             const dy = e.clientY - cropUI.startY;
             
             const img = cropImgRef.value;
             let newX = cropUI.initX + dx;
             let newY = cropUI.initY + dy;
             
             if (img) {
                 newX = Math.max(0, Math.min(newX, img.clientWidth));
                 newY = Math.max(0, Math.min(newY, img.clientHeight));
             }
             
             cropUI.x = newX;
             cropUI.y = newY;
         };
 
         const endCropDrag = () => {
             cropUI.isDragging = false;
         };
 
         const saveCropData = () => {
             if (!activeActor.value) return;
             activeActor.value.portrait.crop = {
                 active: true,
                 x: Math.round(cropUI.x * cropUI.imgScale),
                 y: Math.round(cropUI.y * cropUI.imgScale),
                 r: Math.round(cropUI.actualR)
             };
             cropUI.isOpen = false;
         };
         
         const clearCropData = () => {
             if (!activeActor.value) return;
             activeActor.value.portrait.crop.active = false;
             cropUI.isOpen = false;
         };
 
         // ============================================================================
         // データミューテーション (Data Mutations)
         // ============================================================================
         const addActor = () => {
             const currentActors = state.db.characters.actors || [];
             const newId = currentActors.length > 0 ? Math.max(...currentActors.map(a => Number(a.id) || 0)) + 1 : 1;
             
             currentActors.push({
                 id: newId,
                 name: `Entity_${newId}`,
                 nickname: "",
                 title: "",
                 isProtagonist: false,
                 isEnemy: false,
                 baseParams: { mhp: 100, mmp: 50, hp: 100, mp: 50, tp: 0, sp: 10, msp: 10, spRegen: 2, atk: 10, def: 10, mat: 10, mdf: 10, agi: 10, luk: 10 },
                 customProps: [],
                 interactions: [],
                 portrait: { useOverride: false, overrideName: "", default: "", crop: { active: false, x: 0, y: 0, r: 100 }, expressions: [] }
             });
             
             ui.activeActorId = newId;
         };
 
         const removeActor = (id) => {
             if (confirm(`Target ID: ${id} - Delete Confirmation`)) {
                 state.db.characters.actors = state.db.characters.actors.filter(a => a.id !== id);
                 if (ui.activeActorId === id) ui.activeActorId = null;
             }
         };
 
         const saveCharacterData = async () => {
             if (!state.dirHandle) {
                 services.showToast("[ERROR] Workspace not mounted.");
                 return;
             }
             try {
                 ui.isLoading = true;
                 const dataDir = await state.dirHandle.getDirectoryHandle('data');
                 const dd = await dataDir.getDirectoryHandle('dialogue', { create: true });
                 const fileHandle = await dd.getFileHandle('CharacterData.json', { create: true });
                 const writable = await fileHandle.createWritable();
                 await writable.write(JSON.stringify(state.db.characters, null, 2));
                 await writable.close();
                 services.showToast("[SUCCESS] CharacterData.json Serialized.");
             } catch (e) {
                 console.error(e);
                 services.showToast("[FAIL] " + e.message);
             } finally {
                 ui.isLoading = false;
             }
         };
 
         return {
             ui, actors, settings, activeActor, cropUI, cropImgRef,
             selectActor, addActor, removeActor, 
             getActorImageSrc, saveCharacterData, handleProtagonistChange,
             openCropModal, onCropImageLoad, startCropDrag, onCropDrag, endCropDrag, saveCropData, clearCropData
         };
     },
     template: `
         <div class="v10-doll-root">
             
             <div class="v10-doll-sidebar">
                 <div class="v10-doll-header">
                     <span>[ 角色实体库 Entities ]</span>
                     <button class="btn btn-ghost" style="padding: 2px 8px;" @click="addActor">[+] 注册实体</button>
                 </div>
                 <div class="v10-doll-list cm-custom-scroll">
                     <div v-for="actor in actors" :key="actor.id" 
                          class="v10-doll-item" 
                          :class="{'is-active': ui.activeActorId === actor.id}"
                          @click="selectActor(actor.id)">
                         
                         <div class="v10-doll-avatar-mini" style="display:flex; justify-content:center; align-items:center; font-size:12px; background:var(--primary);" v-if="actor.isProtagonist">P1</div>
                         <img :src="getActorImageSrc(actor)" class="v10-doll-avatar-mini" v-else>
                         
                         <div style="flex:1; overflow:hidden;">
                             <div style="font-weight:bold; color:#fff; text-overflow:ellipsis; white-space:nowrap;">{{ actor.name }}</div>
                             <div style="font-size:11px; color:var(--text-muted);">UID: {{ actor.id }}</div>
                         </div>
                     </div>
                 </div>
             </div>
 
             <div class="v10-doll-main">
                 <div class="v10-doll-toolbar">
                     <span style="color:var(--text-muted); font-size:13px; font-weight: bold;">
                         {{ activeActor ? '当前接管实例: ' + activeActor.name : '<- 请在导航树选中或创建一个实体节点' }}
                     </span>
                     <div style="display:flex; gap:10px;">
                         <button class="btn btn-secondary" @click="ui.settingsOpen = true">[ 映射重载 Settings ]</button>
                         <button class="btn btn-primary" @click="saveCharacterData" :disabled="ui.isLoading">[ 序列化落盘 Save ]</button>
                     </div>
                 </div>
 
                 <div class="v10-doll-content cm-custom-scroll" v-if="activeActor">
                     
                     <div class="v10-doll-card">
                         <div class="v10-doll-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                             <span>[ 基础元数据 Metadata ]</span>
                             <div style="display:flex; gap: 15px;">
                                 <label style="display:flex; align-items:center; gap:5px; color:#fff; cursor:pointer;" v-if="!activeActor.isProtagonist">
                                     <input type="checkbox" v-model="activeActor.isEnemy">
                                     <span style="color:var(--danger); font-weight:bold;">[ 敌对目标 Hostile ]</span>
                                 </label>
                                 <label style="display:flex; align-items:center; gap:5px; color:#fff; cursor:pointer;">
                                     <input type="checkbox" v-model="activeActor.isProtagonist" @change="handleProtagonistChange(activeActor)">
                                     <span style="color:var(--primary); font-weight:bold;">[ 主控实例 Player ]</span>
                                 </label>
                             </div>
                         </div>
                         <div class="v10-doll-card-body">
                             <div class="v10-doll-grid-meta">
                                 <div class="v10-field-group"><span class="v10-field-label">序列 ID</span><input type="number" class="input" v-model.number="activeActor.id"></div>
                                 <div class="v10-field-group"><span class="v10-field-label">基准显示名</span><input type="text" class="input" v-model="activeActor.name"></div>
                                 <div class="v10-field-group"><span class="v10-field-label">昵称 / 别名</span><input type="text" class="input" v-model="activeActor.nickname"></div>
                                 <div class="v10-field-group"><span class="v10-field-label">尊号 / 头衔</span><input type="text" class="input" v-model="activeActor.title"></div>
                             </div>
                         </div>
                     </div>
 
                     <div class="v10-doll-card" style="border-color:var(--primary);">
                         <div class="v10-doll-card-header" style="background:rgba(0,242,254,0.1); color:var(--primary);">
                             <div style="display:flex; justify-content:space-between;">
                                 <span>[ 生存与关系动态属性 Custom Properties ]</span>
                                 <button class="btn btn-ghost" style="padding:0 5px;" @click="activeActor.customProps.push({ key: 'prop_' + Date.now(), name: '新属性', value: 0, bindVarId: 0 })">[+] 注入指针</button>
                             </div>
                         </div>
                         <div class="v10-doll-card-body">
                             <div style="display:grid; grid-template-columns: 2fr 2fr 1fr 1fr auto; gap:10px; color:var(--text-muted); font-size:11px; margin-bottom:5px; padding:0 8px;">
                                 <span>指针键名 (Key)</span><span>UI 呈现名 (Name)</span><span>初识值</span><span>同步 Game_Variables</span><span></span>
                             </div>
                             <div class="v10-doll-prop-row" v-for="(prop, idx) in activeActor.customProps" :key="'prop_'+idx">
                                 <input type="text" class="input" v-model="prop.key" placeholder="如: affinity, mood, sanity">
                                 <input type="text" class="input" v-model="prop.name" placeholder="如: 好感度, 心情">
                                 <input type="number" class="input" v-model.number="prop.value">
                                 <input type="number" class="input" v-model.number="prop.bindVarId" title="填0断开原生引擎同步">
                                 <button class="v10-btn-icon" @click="activeActor.customProps.splice(idx, 1)">X</button>
                             </div>
                             <div v-if="activeActor.customProps.length === 0" style="text-align:center; color:#555; font-size:12px; padding:10px;">
                                 尚未挂载额外的动态属性。
                             </div>
                             <div style="margin-top:10px; padding:10px; background:rgba(0,0,0,0.3); border-radius:var(--radius-sm); border: 1px dashed #555; font-size:12px; color:#aaa;" v-if="activeActor.isProtagonist">
                                 [INFO] 特权节点的主体视觉渲染由 CM_PaperDollSystem 全权接管。
                             </div>
                         </div>
                     </div>
 
                     <div class="v10-doll-card" style="border-color:var(--secondary);" v-if="!activeActor.isProtagonist">
                         <div class="v10-doll-card-header" style="background:rgba(0, 242, 254, 0.05); color:var(--secondary);">
                             <div style="display:flex; justify-content:space-between;">
                                 <span>[ 交互枢纽动作映射 Interactions Hub ]</span>
                                 <button class="btn btn-ghost" style="padding:0 5px; color:var(--secondary);" @click="activeActor.interactions.push({ id: 'act_' + Date.now(), name: '新交互', icon: '', costAp: 0, costTime: 0, condition: '', actionType: 'dialogue', arg1: '', arg2: '' })">[+] 追加选项</button>
                             </div>
                         </div>
                         <div class="v10-doll-card-body">
                             <div class="v40-interaction-block" v-for="(act, idx) in activeActor.interactions" :key="'act_'+idx">
                                 <div class="v40-interaction-row">
                                     <input type="text" class="input" v-model="act.icon" placeholder="Icon文字(如: 💬)" style="max-width: 120px;">
                                     <input type="text" class="input" v-model="act.name" placeholder="UI呈现名 (如: 提出邀约)">
                                     <input type="text" class="input" v-model="act.id" placeholder="唯一映射ID (如: btn_date)">
                                     <button class="v10-btn-icon" @click="activeActor.interactions.splice(idx, 1)">X</button>
                                 </div>
                                 <div class="v40-interaction-row" style="padding-left: 20px; border-left: 1px dashed #444;">
                                     <span style="font-size: 11px; color: var(--text-muted);">预期消耗:</span>
                                     <input type="number" class="input" v-model.number="act.costAp" placeholder="AP" style="max-width: 80px;" title="行动力消耗">
                                     <input type="number" class="input" v-model.number="act.costTime" placeholder="Min" style="max-width: 80px;" title="时间消耗(分钟)">
                                     <input type="text" class="input" v-model="act.condition" placeholder="显现条件 (例: actor.customProps.affinity >= 50)">
                                 </div>
                                 <div class="v40-interaction-row" style="padding-left: 20px; border-left: 1px dashed #444;">
                                     <span style="font-size: 11px; color: var(--text-muted);">载荷执行:</span>
                                     <select class="input" v-model="act.actionType">
                                         <option value="dialogue">调用对话 (Dialogue)</option>
                                         <option value="macro">宏指令 (Macro)</option>
                                         <option value="script">脚本 (Script)</option>
                                     </select>
                                     <input type="text" class="input" v-model="act.arg1" placeholder="Arg1 (如: Alice_Date.json)">
                                     <input type="text" class="input" v-model="act.arg2" placeholder="Arg2 (起始节点ID)">
                                 </div>
                             </div>
                             <div v-if="activeActor.interactions.length === 0" style="text-align:center; color:#555; font-size:12px; padding:10px;">
                                 [无交互载荷] 玩家点击该节点将不会弹出交互面板。
                             </div>
                         </div>
                     </div>
 
                     <div class="v10-layout-bottom">
                         <div class="v10-doll-card" style="height: 100%;">
                             <div class="v10-doll-card-header">[ 战斗基面域 Base Parameters ]</div>
                             <div class="v10-doll-card-body v10-doll-grid-params">
                                 <div class="v10-field-group" v-for="(alias, key) in settings.paramAliases" :key="key">
                                     <span class="v10-field-label">{{ alias }} ({{ key.toUpperCase() }})</span>
                                     <input type="number" class="input" v-model.number="activeActor.baseParams[key]">
                                 </div>
                             </div>
                         </div>
 
                         <div class="v10-doll-card" v-if="!activeActor.isProtagonist" style="height: 100%;">
                             <div class="v10-doll-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                                 <span>[ 视觉挂载与差分图库 Visuals & Expressions ]</span>
                                 <button class="btn btn-primary" style="padding: 2px 8px; font-size: 11px;" @click="openCropModal">
                                     [ 设定基准裁切 Crop ]
                                 </button>
                             </div>
                             <div class="v10-doll-card-body">
                                 <div class="v10-doll-preview-box">
                                     <img :src="getActorImageSrc(activeActor)" class="v10-doll-preview-img">
                                 </div>
                                 
                                 <div v-if="activeActor.portrait.crop?.active" style="background: rgba(0,242,254,0.1); border: 1px solid var(--secondary); border-radius: 4px; padding: 8px; font-size: 11px; margin-top: 10px; color: var(--secondary);">
                                     [✓] 基准裁切坐标已绑定：(X:{{activeActor.portrait.crop.x}}, Y:{{activeActor.portrait.crop.y}}, 半径:{{activeActor.portrait.crop.r}})
                                 </div>
 
                                 <div style="font-size:11px; color:var(--text-muted); text-align:center; margin-top: 5px;">默认基准寻址: <code>img/npc/npc_{{activeActor.id}}.png</code></div>
                                 <label style="display:flex; align-items:center; gap:5px; font-size:12px; color:#aaa; cursor: pointer; margin-top: 10px;">
                                     <input type="checkbox" v-model="activeActor.portrait.useOverride"> 强行接管基准寻址策略
                                 </label>
                                 <input type="text" class="input" v-model="activeActor.portrait.overrideName" v-if="activeActor.portrait.useOverride" placeholder="例如: evil_boss_01" style="margin-top: 10px;">
                                 
                                 <hr style="border-color: #333; margin: 15px 0;">
                                 
                                 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                     <span style="font-size:12px; font-weight:bold; color:var(--text-muted);">[ 表情差分映射 Expressions ]</span>
                                     <button class="btn btn-ghost" style="padding: 2px 5px; font-size: 11px;" @click="activeActor.portrait.expressions.push({ tag: 'smile', filename: '' })">[+] 添加差分</button>
                                 </div>
                                 
                                 <div class="v10-doll-prop-row" style="grid-template-columns: 1fr 2fr auto;" v-for="(exp, idx) in activeActor.portrait.expressions" :key="'exp_'+idx">
                                     <input type="text" class="input" v-model="exp.tag" placeholder="标签(如: angry)">
                                     <input type="text" class="input" v-model="exp.filename" placeholder="文件名(不含后缀)">
                                     <button class="v10-btn-icon" @click="activeActor.portrait.expressions.splice(idx, 1)">X</button>
                                 </div>
                             </div>
                         </div>
                     </div>
                     
                     <div style="text-align:right; margin-top: 10px;">
                         <button class="btn" style="background:transparent; border:1px solid var(--danger); color:var(--danger);" @click="removeActor(activeActor.id)">[ 摧毁此实例 Destroy ]</button>
                     </div>
 
                 </div>
             </div>
 
             <div class="v10-modal-overlay" :class="{ 'is-active': cropUI.isOpen }" style="z-index: 100;">
                 <div class="v10-modal-content" style="width: 600px; background: var(--panel-bg); border: 1px solid var(--secondary); display: flex; flex-direction: column;">
                     <div class="v10-modal-header" style="background: rgba(0,242,254,0.1); border-bottom: 1px solid var(--border);">
                         <span style="color: var(--secondary); font-weight: bold;">[ 定义探索节点联动头像 Avatar Crop ]</span>
                         <span style="cursor:pointer; color:#fff;" @click="cropUI.isOpen = false">✕</span>
                     </div>
                     
                     <div class="v10-doll-card-body" style="padding: 0; background: var(--bg-color);">
                         <div class="v10-crop-workspace" 
                          @mousemove="onCropDrag" 
                          @mouseup="endCropDrag" 
                          @mouseleave="endCropDrag">
                         
                         <div style="position: relative; display: flex;">
                             <img :src="cropUI.imgSrc" ref="cropImgRef" @load="onCropImageLoad" class="v10-crop-image">
                             
                             <div class="v10-crop-mask-overlay" 
                                  v-if="cropImgRef"
                                  @mousedown="startCropDrag"
                                  :style="{ 
                                      left: cropUI.x + 'px', 
                                      top: cropUI.y + 'px', 
                                      width: (cropUI.r * 2) + 'px', 
                                      height: (cropUI.r * 2) + 'px' 
                                  }">
                             </div>
                         </div>
                         
                     </div>
                     
                     <div style="padding: 15px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--panel-bg);">
                         <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                             <span style="font-size: 12px; color: var(--text-muted);">Radius:</span>
                             <input type="range" v-model.number="cropUI.actualR" min="40" max="400" step="1" style="width: 150px;">
                             <span style="font-size: 12px; color: var(--secondary);">{{ cropUI.actualR }}px</span>
                         </div>
                         
                         <div style="display: flex; gap: 10px;">
                             <button class="btn btn-ghost" @click="clearCropData">Clear</button>
                             <button class="btn btn-primary" @click="saveCropData">Save & Apply</button>
                         </div>
                     </div>
                 </div>
             </div>
 
             <div class="v10-modal-overlay" :class="{ 'is-active': ui.settingsOpen }">
                 <div class="v10-modal-content" style="width: 400px; background: var(--panel-bg); border: 1px solid var(--border);">
                     <div class="v10-modal-header" style="background: rgba(0,0,0,0.5);">
                         <span>[ 核心映射表覆写 i18n Overrides ]</span>
                         <span style="cursor:pointer; color:#fff;" @click="ui.settingsOpen = false">✕</span>
                     </div>
                     <div class="v10-doll-card-body flex-column cm-custom-scroll" style="gap:10px; max-height:400px; overflow-y:auto;">
                         <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">在此处更改映射表，全能编辑器将自动热更新字段名，支持原生本地化多语言。</div>
                         <div v-for="(val, key) in settings.paramAliases" :key="key" style="display:flex; align-items:center; gap:10px;">
                             <span style="width:50px; font-weight:bold; color:var(--secondary); text-transform:uppercase;">{{ key }}</span>
                             <input type="text" class="input" v-model="settings.paramAliases[key]" style="flex:1;">
                         </div>
                     </div>
                     <div style="padding: 15px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; background: rgba(0,0,0,0.2);">
                         <button class="btn btn-primary" @click="ui.settingsOpen = false">Apply</button>
                     </div>
                 </div>
             </div>
 
         </div>
     `
 };