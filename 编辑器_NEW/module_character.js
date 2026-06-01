/**
 * 🎭 角色/UI 编辑器模块 (Actor & UI Architect - V3.5 核心元数据升维版 + 头像裁切支持)
 * 修复：补全了 mhp, mmp (最大体力/魔力) 的数据定义，彻底分离“状态值”与“上限值”。
 * 新增：支持探索系统(ExploreSystem)联动节点的圆形头像区域选取。
 */

import { state, services } from './editor_main.js';

const injectStyles = () => {
    if (document.getElementById('v30-doll-style')) return;
    const style = document.createElement('style');
    style.id = 'v30-doll-style';
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
        .v10-doll-ai-row { display: grid; grid-template-columns: 2fr 1fr 2fr 3fr auto; gap: 10px; align-items: center; background: rgba(0,0,0,0.2); padding: 8px; border-radius: var(--radius-sm); margin-bottom: 5px; }
        
        .v10-btn-icon { background: rgba(255,59,91,0.2); border: 1px solid var(--danger); color: var(--danger); border-radius: 4px; cursor: pointer; display: flex; justify-content: center; align-items: center; transition: 0.2s; width: 28px; height: 28px; flex-shrink: 0; }
        .v10-btn-icon:hover { background: var(--danger); color: #fff; }

        /* 裁切工具专属样式 */
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

        // 裁切工具状态
        const cropUI = Vue.reactive({
            isOpen: false,
            imgSrc: '',
            imgScale: 1,      // naturalWidth / clientWidth
            x: 0,             // 相对于图片容器的显示中心坐标 X
            y: 0,             // 相对于图片容器的显示中心坐标 Y
            r: 80,            // 显示半径
            actualR: 80,      // 真实半径 (控制条绑定的值)
            isDragging: false,
            startX: 0,
            startY: 0,
            initX: 0,
            initY: 0
        });

        const cropImgRef = Vue.ref(null);

        // ============================================================================
        // 数据统一升维引擎 (Data Normalization Engine)
        // ============================================================================
        const normalizeData = (data) => {
            if (!data) return;
            
            const defaultAliases = { 
                mhp: "最大体力", mmp: "最大魔力", hp: "初始体力", mp: "初始魔力", 
                tp: "初始战技", sp: "初始精力", msp: "最大精力", spRegen: "精力恢复", 
                atk: "力量", def: "护甲", mat: "灵力", mdf: "抗性", agi: "敏捷", luk: "幸运" 
            };

            if (Array.isArray(data)) {
                state.db.characters = {
                    version: "3.5.0",
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
                if (typeof actor.isProtagonist !== 'boolean') actor.isProtagonist = false;
                if (typeof actor.isEnemy !== 'boolean') actor.isEnemy = false;
                if (!actor.baseParams) actor.baseParams = {};
                
                const defs = { 
                    mhp: 100, mmp: 50, hp: 100, mp: 50, tp: 0, 
                    sp: 10, msp: 10, spRegen: 2, 
                    atk: 10, def: 10, mat: 10, mdf: 10, agi: 10, luk: 10 
                };
                for (const k in defs) {
                    if (typeof actor.baseParams[k] === 'undefined') actor.baseParams[k] = defs[k];
                }
                
                if (actor.baseParams.mhp === 100 && actor.baseParams.hp !== 100) {
                    actor.baseParams.mhp = actor.baseParams.hp;
                }
                if (actor.baseParams.mmp === 50 && actor.baseParams.mp !== 50) {
                    actor.baseParams.mmp = actor.baseParams.mp;
                }

                if (!actor.customProps) actor.customProps = [];
                if (!actor.actionPatterns) actor.actionPatterns = [];
                
                // 默认立绘结构补全，加入裁切参数
                if (!actor.portrait) {
                    actor.portrait = { useOverride: false, overrideName: "", crop: { active: false, x: 0, y: 0, r: 100 } };
                } else if (!actor.portrait.crop) {
                    actor.portrait.crop = { active: false, x: 0, y: 0, r: 100 };
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
        // 图像与资源管线 (Image Pipeline)
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
                // 静默降级
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
            return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 100"><rect width="100" height="100" fill="%232a2e38"/><text x="50%" y="50%" fill="%23666" font-size="12" text-anchor="middle" dy=".3em">无立绘</text></svg>';
        };

        // ============================================================================
        // 联动头像裁切管线 (Crop Interactive Logic)
        // ============================================================================
        const openCropModal = () => {
            if (!activeActor.value) return;
            cropUI.imgSrc = getActorImageSrc(activeActor.value);
            cropUI.isOpen = true;
        };

        const onCropImageLoad = () => {
            const img = cropImgRef.value;
            if (!img) return;
            
            // 计算真实尺寸与显示尺寸的缩放比例
            cropUI.imgScale = img.naturalWidth / img.clientWidth;
            
            const cropData = activeActor.value.portrait.crop;
            if (cropData && cropData.active && cropData.r > 0) {
                // 如果已有保存数据，将其转换为当前界面的显示坐标
                cropUI.actualR = cropData.r;
                cropUI.r = cropData.r / cropUI.imgScale;
                cropUI.x = cropData.x / cropUI.imgScale;
                cropUI.y = cropData.y / cropUI.imgScale;
            } else {
                // 默认初始化在图片中心
                cropUI.actualR = 150; 
                cropUI.r = 150 / cropUI.imgScale;
                cropUI.x = img.clientWidth / 2;
                cropUI.y = img.clientHeight / 2;
            }
        };

        // 监听真实半径数值滑动条的变化，动态更新 UI 半径
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
            
            // 限制拖拽边界，不超出图片显示区域
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
            // 换算回图片的真实坐标并落盘
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
        // 数据操作管线 (Data Mutations)
        // ============================================================================
        const addActor = () => {
            const currentActors = state.db.characters.actors || [];
            const newId = currentActors.length > 0 ? Math.max(...currentActors.map(a => Number(a.id) || 0)) + 1 : 1;
            
            currentActors.push({
                id: newId,
                name: `新建角色_${newId}`,
                nickname: "",
                title: "",
                isProtagonist: false,
                isEnemy: false,
                baseParams: { mhp: 100, mmp: 50, hp: 100, mp: 50, tp: 0, sp: 10, msp: 10, spRegen: 2, atk: 10, def: 10, mat: 10, mdf: 10, agi: 10, luk: 10 },
                customProps: [],
                actionPatterns: [], 
                portrait: { useOverride: false, overrideName: "", crop: { active: false, x: 0, y: 0, r: 100 } }
            });
            
            ui.activeActorId = newId;
        };

        const removeActor = (id) => {
            if (confirm(`确定要彻底删除 ID: ${id} 吗？`)) {
                state.db.characters.actors = state.db.characters.actors.filter(a => a.id !== id);
                if (ui.activeActorId === id) ui.activeActorId = null;
            }
        };

        const saveCharacterData = async () => {
            if (!state.dirHandle) {
                services.showToast("⚠️ 错误：未挂载工程目录根节点！");
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
                services.showToast("💾 角色库结构落盘成功！");
            } catch (e) {
                console.error(e);
                services.showToast("❌ 写入异常: " + e.message);
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
                    <span>🎭 角色实体库 ({{actors.length}})</span>
                    <button class="btn btn-ghost" style="padding: 2px 8px;" @click="addActor">➕ 注册实体</button>
                </div>
                <div class="v10-doll-list cm-custom-scroll">
                    <div v-for="actor in actors" :key="actor.id" 
                         class="v10-doll-item" 
                         :class="{'is-active': ui.activeActorId === actor.id}"
                         @click="selectActor(actor.id)">
                        
                        <div class="v10-doll-avatar-mini" style="display:flex; justify-content:center; align-items:center; font-size:12px; background:var(--primary);" v-if="actor.isProtagonist">👑</div>
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
                        {{ activeActor ? '正在介入: ' + activeActor.name : '👈 请在导航树选中或创建一个实体节点' }}
                    </span>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-secondary" @click="ui.settingsOpen = true">⚙️ 全局映射重载</button>
                        <button class="btn btn-primary" @click="saveCharacterData" :disabled="ui.isLoading">💾 序列化写盘</button>
                    </div>
                </div>

                <div class="v10-doll-content cm-custom-scroll" v-if="activeActor">
                    
                    <div class="v10-doll-card">
                        <div class="v10-doll-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>📝 基础元数据 (Metadata)</span>
                            <div style="display:flex; gap: 15px;">
                                <label style="display:flex; align-items:center; gap:5px; color:#fff; cursor:pointer;" v-if="!activeActor.isProtagonist">
                                    <input type="checkbox" v-model="activeActor.isEnemy">
                                    <span style="color:var(--danger); font-weight:bold;">👿 注册为敌对目标</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:5px; color:#fff; cursor:pointer;">
                                    <input type="checkbox" v-model="activeActor.isProtagonist" @change="handleProtagonistChange(activeActor)">
                                    <span style="color:var(--primary); font-weight:bold;">👑 接管为特权控制者 (Player)</span>
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

                    <div class="v10-doll-card" style="border-color:var(--danger);" v-if="!activeActor.isProtagonist">
                        <div class="v10-doll-card-header" style="background:rgba(255,59,91,0.1); color:var(--danger);">
                            <div style="display:flex; justify-content:space-between;">
                                <span>🧠 行为树：AI 指令优先级序列 (Action Patterns)</span>
                                <button class="btn btn-ghost" style="padding:0 5px; color: var(--danger);" @click="activeActor.actionPatterns.push({ actionId: '', priority: 5, condition: '', description: '' })">➕ 追加叶节点</button>
                            </div>
                        </div>
                        <div class="v10-doll-card-body">
                            <div style="display:grid; grid-template-columns: 2fr 1fr 2fr 3fr auto; gap:10px; color:var(--text-muted); font-size:11px; margin-bottom:5px; padding:0 8px;">
                                <span>映射动作ID (基于物品字典)</span><span>启发权重 (Priority)</span><span>环境触发条件 (Eval)</span><span>人工标注 (备注)</span><span></span>
                            </div>
                            <div class="v10-doll-ai-row" v-for="(pat, idx) in activeActor.actionPatterns" :key="'ai_'+idx">
                                <input type="text" class="input" v-model="pat.actionId" placeholder="如: item_enemy_bite">
                                <input type="number" class="input" v-model.number="pat.priority" title="数字越大越优先选取">
                                <input type="text" class="input" v-model="pat.condition" placeholder="如: actor.hp < 50 (空代表无条件)">
                                <input type="text" class="input" v-model="pat.description" placeholder="此分支的行为语义...">
                                <button class="v10-btn-icon" @click="activeActor.actionPatterns.splice(idx, 1)">×</button>
                            </div>
                            <div v-if="activeActor.actionPatterns.length === 0" style="text-align:center; color:#555; font-size:12px; padding:10px;">
                                🚧 当前实体未接入 AI 决策树。在战斗轮中，该节点仅能执行默认的 Skip (跳过) 指令。
                            </div>
                        </div>
                    </div>

                    <div class="v10-layout-bottom">
                        <div class="v10-doll-card" style="height: 100%;">
                            <div class="v10-doll-card-header">📊 战斗基面域 (Base Parameters)</div>
                            <div class="v10-doll-card-body v10-doll-grid-params">
                                <div class="v10-field-group" v-for="(alias, key) in settings.paramAliases" :key="key">
                                    <span class="v10-field-label">{{ alias }} ({{ key.toUpperCase() }})</span>
                                    <input type="number" class="input" v-model.number="activeActor.baseParams[key]">
                                </div>
                            </div>
                        </div>

                        <div class="v10-doll-card" v-if="!activeActor.isProtagonist" style="height: 100%;">
                            <div class="v10-doll-card-header" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>🖼️ 视觉挂载与静态回退 (Fallback)</span>
                                <button class="btn btn-primary" style="padding: 2px 8px; font-size: 11px;" @click="openCropModal">
                                    ✂️ 设置节点联动头像
                                </button>
                            </div>
                            <div class="v10-doll-card-body">
                                <div class="v10-doll-preview-box">
                                    <img :src="getActorImageSrc(activeActor)" class="v10-doll-preview-img">
                                </div>
                                
                                <div v-if="activeActor.portrait.crop?.active" style="background: rgba(0,242,254,0.1); border: 1px solid var(--secondary); border-radius: 4px; padding: 8px; font-size: 11px; margin-top: 10px; color: var(--secondary);">
                                    ✓ 已绑定联动裁切坐标：(X:{{activeActor.portrait.crop.x}}, Y:{{activeActor.portrait.crop.y}}, 半径:{{activeActor.portrait.crop.r}})
                                </div>

                                <div style="font-size:11px; color:var(--text-muted); text-align:center; margin-top: 5px;">默认寻址: <code>img/npc/npc_{{activeActor.id}}.png</code></div>
                                <label style="display:flex; align-items:center; gap:5px; font-size:12px; color:#aaa; cursor: pointer; margin-top: 10px;">
                                    <input type="checkbox" v-model="activeActor.portrait.useOverride"> 强行接管文件寻址策略
                                </label>
                                <input type="text" class="input" v-model="activeActor.portrait.overrideName" v-if="activeActor.portrait.useOverride" placeholder="例如: evil_boss_01" style="margin-top: 10px;">
                            </div>
                        </div>
                    </div>
                    
                    <div class="v10-doll-card" style="border-color:var(--primary);" v-if="activeActor.isProtagonist">
                        <div class="v10-doll-card-header" style="background:rgba(0,242,254,0.1); color:var(--primary);">
                            <div style="display:flex; justify-content:space-between;">
                                <span>🧬 特权接管：绑定生存动态属性</span>
                                <button class="btn btn-ghost" style="padding:0 5px;" @click="activeActor.customProps.push({ key: 'prop_' + Date.now(), name: '新属性', value: 0, bindVarId: 0 })">➕ 注入指针</button>
                            </div>
                        </div>
                        <div class="v10-doll-card-body">
                            <div style="display:grid; grid-template-columns: 2fr 2fr 1fr 1fr auto; gap:10px; color:var(--text-muted); font-size:11px; margin-bottom:5px; padding:0 8px;">
                                <span>指针键名 (Key)</span><span>UI 呈现名 (Name)</span><span>初识值</span><span>同步 Game_Variables</span><span></span>
                            </div>
                            <div class="v10-doll-prop-row" v-for="(prop, idx) in activeActor.customProps" :key="'prop_'+idx">
                                <input type="text" class="input" v-model="prop.key" placeholder="如: sanity">
                                <input type="text" class="input" v-model="prop.name" placeholder="如: 理智">
                                <input type="number" class="input" v-model.number="prop.value">
                                <input type="number" class="input" v-model.number="prop.bindVarId" title="填0断开原生引擎同步">
                                <button class="v10-btn-icon" @click="activeActor.customProps.splice(idx, 1)">×</button>
                            </div>
                            <div v-if="activeActor.customProps.length === 0" style="text-align:center; color:#555; font-size:12px; padding:10px;">
                                尚未挂载额外的生存动态属性。
                            </div>
                            <div style="margin-top:10px; padding:10px; background:rgba(0,0,0,0.3); border-radius:var(--radius-sm); border: 1px dashed #555; font-size:12px; color:#aaa;">
                                📌 特权节点已自动被静态渲染管线剔除，视觉呈现现由 <b>CM_PaperDollSystem (纸娃娃装备总线)</b> 全权接管。
                            </div>
                        </div>
                    </div>

                    <div style="text-align:right; margin-top: 10px;">
                        <button class="btn" style="background:transparent; border:1px solid var(--danger); color:var(--danger);" @click="removeActor(activeActor.id)">🗑 摧毁此节点</button>
                    </div>

                </div>
            </div>

            <div class="v10-modal-overlay" :class="{ 'is-active': cropUI.isOpen }" style="z-index: 100;">
                <div class="v10-modal-content" style="width: 600px; background: var(--panel-bg); border: 1px solid var(--secondary); display: flex; flex-direction: column;">
                    <div class="v10-modal-header" style="background: rgba(0,242,254,0.1); border-bottom: 1px solid var(--border);">
                        <span style="color: var(--secondary); font-weight: bold;">✂️ 定义探索节点联动头像</span>
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
                            <span style="font-size: 12px; color: var(--text-muted);">缩放圆框半径:</span>
                            <input type="range" v-model.number="cropUI.actualR" min="40" max="400" step="1" style="width: 150px;">
                            <span style="font-size: 12px; color: var(--secondary);">{{ cropUI.actualR }}px</span>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-ghost" @click="clearCropData">清除配置</button>
                            <button class="btn btn-primary" @click="saveCropData">保存坐标落盘</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="v10-modal-overlay" :class="{ 'is-active': ui.settingsOpen }">
                <div class="v10-modal-content" style="width: 400px; background: var(--panel-bg); border: 1px solid var(--border);">
                    <div class="v10-modal-header" style="background: rgba(0,0,0,0.5);">
                        <span>⚙️ 核心映射表覆写 (i18n Compatible)</span>
                        <span style="cursor:pointer; color:#fff;" @click="ui.settingsOpen = false">✕</span>
                    </div>
                    <div class="v10-doll-card-body flex-column cm-custom-scroll" style="gap:10px; max-height:400px; overflow-y:auto;">
                        <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">在此处更改映射表，全能编辑器（含宏面板及其他工作台）将自动热更新字段名，支持原生的本地化多语言。</div>
                        <div v-for="(val, key) in settings.paramAliases" :key="key" style="display:flex; align-items:center; gap:10px;">
                            <span style="width:50px; font-weight:bold; color:var(--secondary); text-transform:uppercase;">{{ key }}</span>
                            <input type="text" class="input" v-model="settings.paramAliases[key]" style="flex:1;">
                        </div>
                    </div>
                    <div style="padding: 15px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; background: rgba(0,0,0,0.2);">
                        <button class="btn btn-primary" @click="ui.settingsOpen = false">确认应用</button>
                    </div>
                </div>
            </div>

        </div>
    `
};