/**
 * 🌍 全能编辑器 V10.9.1 - 地图探索引擎模块 (module_map.js)
 * 重构：彻底移除分钟级时间系统，全面适配 V7.0 昼夜 12 刻度 (Tick/AP) 架构。
 * 升级：场景背景、POI 出现条件、资源消耗面板全面切换为“昼夜枚举”与“刻度结算”。
 * 架构更新：POI 坐标系全面升级为【百分比相对坐标 (0%~100%)】，兼容任意物理分辨率。
 * 修复：适配 V3.5 角色管理器的数据结构 (state.db.characters.actors)
 * 视图：同步引擎 300% 节点放大 (180px / 150px) 视觉对齐。
 */

import { state, services } from './editor_main.js';
import { ComponentPaperDoll } from './component_paperdoll.js'; 

const { reactive, computed, ref, watch, onMounted, onUnmounted } = window.Vue;

export const MapEditor = {
    components: {
        'component-paperdoll': ComponentPaperDoll
    },
    setup() {
        const local = reactive({
            chapter: "",
            sceneId: "",
            curPointIdx: -1,
            activeTab: 'pt-base',
            panX: 0,
            scale: 1,
            isDollVisible: false, 
            isDraggingPoint: false,
            pointOffsetX: 0,
            pointOffsetY: 0,
            bgBlobUrl: ''
        });

        const avatarBlobs = reactive({}); 

        if (!state.db.mapScenes) state.db.mapScenes = {};
        if (!state.db.mapTree) state.db.mapTree = { "Root": [] };

        const currentSceneKey = computed(() => local.chapter ? `${local.chapter}/${local.sceneId}` : local.sceneId);
        const mapCurrentScene = computed(() => state.db.mapScenes[currentSceneKey.value]);
        const mapCurrentPoint = computed(() => 
            (mapCurrentScene.value && local.curPointIdx >= 0) 
                ? mapCurrentScene.value.points[local.curPointIdx] 
                : null
        );

        const dollDb = computed(() => state.db.dollDb || { settings: {}, items: [], slots: [] });
        const schema = computed(() => state.db.macroSchema);

        const macroModal = reactive({ 
            isOpen: false, targetActIndex: -1, activeActionId: '', 
            fieldValues: {}, condId: '', condValues: {} 
        });

        watch(() => mapCurrentScene.value?.bgImage, async (newVal) => {
            if (!newVal) { local.bgBlobUrl = ''; return; }
            if (state.dirHandle) {
                try {
                    const imgDir = await state.dirHandle.getDirectoryHandle('img');
                    const roomDir = await imgDir.getDirectoryHandle('room');
                    const fileHandle = await roomDir.getFileHandle(newVal + '.png');
                    const file = await fileHandle.getFile();
                    if (local.bgBlobUrl.startsWith('blob:')) URL.revokeObjectURL(local.bgBlobUrl);
                    local.bgBlobUrl = URL.createObjectURL(file);
                    return; 
                } catch (e) { console.warn(`[地图背景] 找不到文件 img/room/${newVal}.png`); }
            }
            local.bgBlobUrl = `../img/room/${newVal}.png`;
        }, { immediate: true });

        watch(() => mapCurrentScene.value?.points, (points) => {
            if (!points || !state.dirHandle) return;
            points.forEach(async (p) => {
                if (p.charId && state.db.characters?.actors) {
                    const c = state.db.characters.actors.find(x => x.id == p.charId);
                    if (c && c.defaultPortrait && !avatarBlobs[c.defaultPortrait]) {
                        try {
                            const imgDir = await state.dirHandle.getDirectoryHandle('img');
                            const picDir = await imgDir.getDirectoryHandle('pictures');
                            const fileHandle = await picDir.getFileHandle(c.defaultPortrait + '.png');
                            const file = await fileHandle.getFile();
                            avatarBlobs[c.defaultPortrait] = URL.createObjectURL(file);
                        } catch(e) { avatarBlobs[c.defaultPortrait] = `../img/pictures/${c.defaultPortrait}.png`; }
                    }
                }
            });
        }, { deep: true, immediate: true });

        const createNewScene = () => {
            const folder = window.prompt("📂 请输入文件夹名 (留空则建在 Root 目录下):", "Root") || "Root";
            const sceneId = window.prompt("🏷️ 请输入新场景 ID (如 RoomA, 必须唯一):");
            if (!sceneId) return;

            if (!state.db.mapTree[folder]) state.db.mapTree[folder] = [];
            if (state.db.mapTree[folder].includes(sceneId)) {
                services.showToast("❌ 场景 ID 已存在");
                return;
            }

            state.db.mapTree[folder].push(sceneId);
            const sceneKey = folder === 'Root' ? sceneId : `${folder}/${sceneId}`;
            state.db.mapScenes[sceneKey] = {
                name: "未命名新场景", bgImage: "", bgm: "",
                timeBgs: [], timeEvents: [], points: []
            };

            services.showToast(`✅ 新场景 [${sceneKey}] 创建成功`);
            loadScene(folder === 'Root' ? '' : folder, sceneId);
        };

        const loadScene = (chapter, sceneId) => {
            local.chapter = chapter; local.sceneId = sceneId; local.curPointIdx = -1;
            if (mapCurrentScene.value) {
                if (!mapCurrentScene.value.timeBgs) mapCurrentScene.value.timeBgs = [];
                if (!mapCurrentScene.value.timeEvents) mapCurrentScene.value.timeEvents = [];
                if (!mapCurrentScene.value.points) mapCurrentScene.value.points = [];
            }
        };

        const addPoint = (e) => {
            if (!mapCurrentScene.value) return;
            const canvasEl = document.getElementById('map-game-canvas');
            if (!canvasEl) return;
            const rect = canvasEl.getBoundingClientRect();
            const absX = (e.clientX - rect.left) / local.scale;
            const absY = (e.clientY - rect.top) / local.scale;
            const x = Number(((absX / 1280) * 100).toFixed(2));
            const y = Number(((absY / 720) * 100).toFixed(2));

            mapCurrentScene.value.points.push({
                id: "poi_" + Date.now().toString().slice(-4),
                name: "新交互点", x: x, y: y, zIndex: 10, icon: "search", refreshMode: "always",
                cooldownTime: 12, costTime: 0, costEnergy: 0, costSatiety: 0,
                condition: "", timeCond: "", charId: "", showTooltip: false,
                actions: [{ condition: "", actionType: "dialogue", arg1: "", arg2: "" }]
            });
            local.curPointIdx = mapCurrentScene.value.points.length - 1;
            local.activeTab = 'pt-base';
            services.showToast("📍 已添加新交互点");
        };

        const startDragPoint = (e, idx, p) => {
            local.curPointIdx = idx; local.activeTab = 'pt-base'; local.isDraggingPoint = true;
            const canvasEl = document.getElementById('map-game-canvas');
            const rect = canvasEl.getBoundingClientRect();
            const absX = (e.clientX - rect.left) / local.scale;
            const absY = (e.clientY - rect.top) / local.scale;
            const percX = (absX / 1280) * 100;
            const percY = (absY / 720) * 100;
            local.pointOffsetX = percX - p.x;
            local.pointOffsetY = percY - p.y;
            if (!p.actions) p.actions = [];
        };

        const onMouseMove = (e) => {
            if (local.isDraggingPoint && mapCurrentPoint.value) {
                const canvasEl = document.getElementById('map-game-canvas');
                const rect = canvasEl.getBoundingClientRect();
                const absX = (e.clientX - rect.left) / local.scale;
                const absY = (e.clientY - rect.top) / local.scale;
                const percX = (absX / 1280) * 100;
                const percY = (absY / 720) * 100;
                mapCurrentPoint.value.x = Number((percX - local.pointOffsetX).toFixed(2));
                mapCurrentPoint.value.y = Number((percY - local.pointOffsetY).toFixed(2));
            }
        };

        const onMouseUp = () => { local.isDraggingPoint = false; };

        const updateScale = () => {
            const wrapper = document.getElementById('map-canvas-wrapper');
            if (wrapper) local.scale = Math.max(0.1, Math.min(wrapper.clientWidth / 1280, wrapper.clientHeight / 720));
        };

        const isNpcMode = (p) => p.charId && state.db.characters?.actors && state.db.characters.actors.some(c => c.id == p.charId);
        const getNpcChar = (p) => state.db.characters?.actors ? state.db.characters.actors.find(c => c.id == p.charId) : null;
        
        const getPointStyle = (p) => {
            if (p.x > 100 || p.x < -100 || p.y > 100 || p.y < -100) {
                p.x = Number(((p.x / 1280) * 100).toFixed(2));
                p.y = Number(((p.y / 720) * 100).toFixed(2));
            }

            let style = { 
                left: p.x + '%', top: p.y + '%', 
                zIndex: p.zIndex || 10, position: 'absolute', transform: 'translate(-50%, -50%)', cursor: 'grab' 
            };
            
            if (isNpcMode(p)) {
                const c = getNpcChar(p);
                // 【视图放大更新】统一调整为 180x180
                if (c && c.defaultPortrait) {
                    const imgUrl = avatarBlobs[c.defaultPortrait] || `../img/pictures/${c.defaultPortrait}.png`;
                    style.background = `url(${imgUrl}) center top / 100% auto no-repeat`;
                    style.borderRadius = '50%'; 
                    style.border = '4px solid var(--primary)';
                    style.width = '180px'; style.height = '180px';
                    style.boxShadow = '0 0 20px var(--primary-glow)';
                    style.imageRendering = 'crisp-edges';
                } else {
                    style.background = 'rgba(0,0,0,0.8)';
                    style.borderRadius = '50%'; 
                    style.border = '4px solid var(--primary)';
                    style.width = '180px'; style.height = '180px';
                    style.display = 'flex'; style.justifyContent = 'center'; style.alignItems = 'center';
                    style.color = '#fff'; style.fontSize = '72px';
                }
            }
            return style;
        };

        const copyToClipboard = (text) => { navigator.clipboard.writeText(text).then(() => services.showToast("📋 路径已复制")); };

        const openMacroGenerator = (actIndex) => {
            macroModal.targetActIndex = actIndex; macroModal.activeActionId = '';
            macroModal.fieldValues = {}; macroModal.condId = ''; macroModal.condValues = {};
            macroModal.isOpen = true;
        };

        const insertMacro = () => {
            const actionDef = schema.value.actions.find(a => a.id === macroModal.activeActionId);
            if (!actionDef) return;

            let finalStr = actionDef.template;
            
            if (macroModal.condId) {
                const condDef = schema.value.conditions.find(c => c.id === macroModal.condId);
                if (condDef) {
                    let condStr = condDef.template;
                    condDef.fields.forEach(f => {
                        condStr = condStr.replace(new RegExp(`\\{${f.key}\\}`, 'g'), macroModal.condValues[f.key]);
                    });
                    macroModal.fieldValues['condition'] = condStr;
                }
            }

            actionDef.fields.forEach(f => {
                finalStr = finalStr.replace(new RegExp(`\\{${f.key}\\}`, 'g'), macroModal.fieldValues[f.key]);
            });

            const targetAct = mapCurrentPoint.value.actions[macroModal.targetActIndex];
            if (!targetAct.macros) targetAct.macros = [];
            targetAct.macros.push(finalStr);
            
            macroModal.isOpen = false;
            services.showToast("✨ 交互宏指令已注入");
        };

        let resizeObserver = null;
        onMounted(() => {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            const wrapper = document.getElementById('map-canvas-wrapper');
            if (wrapper) { resizeObserver = new ResizeObserver(updateScale); resizeObserver.observe(wrapper); }
            updateScale();
        });

        onUnmounted(() => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            if (resizeObserver) resizeObserver.disconnect();
        });

        return {
            state, local, mapCurrentScene, mapCurrentPoint, dollDb, macroModal, schema,
            createNewScene, loadScene, addPoint, startDragPoint, isNpcMode, getNpcChar, 
            getPointStyle, copyToClipboard, openMacroGenerator, insertMacro
        };
    },
    
    template: `
        <div class="flex-row" style="width: 100%; height: 100%; background: var(--bg-color);">
            
            <div class="panel sidebar-left flex-column" style="width: var(--sidebar-width); background: var(--panel-bg); border-right: 1px solid var(--border);">
                <div class="p-10 flex-row align-center" style="color: var(--secondary); font-weight: bold; border-bottom: 1px solid var(--border); justify-content: space-between;">
                    <span>🌍 探索场景库</span>
                    <button class="btn btn-secondary" style="padding: 2px 8px;" title="新建场景" @click="createNewScene">+</button>
                </div>
                <div class="flex-1 flex-column p-10" style="overflow-y: auto; gap: 5px;">
                    <div v-if="Object.keys(state.db.mapTree).length === 0" class="text-muted" style="text-align:center; margin-top:20px; font-size: 13px;">
                        暂无地图数据，请先点击右上角绑定工程
                    </div>
                    <template v-for="(files, folder) in state.db.mapTree" :key="folder">
                        <template v-if="files.length > 0">
                            <div class="text-muted" style="font-size: 12px; margin-top: 10px; padding-left: 5px;">📂 {{ folder === 'Root' ? '根目录' : folder }}</div>
                            <div v-for="file in files" :key="file" 
                                 :style="{ background: currentSceneKey === (folder==='Root' ? file : folder+'/'+file) ? 'var(--secondary-glow)' : 'transparent', color: currentSceneKey === (folder==='Root' ? file : folder+'/'+file) ? 'var(--secondary)' : 'var(--text-main)' }"
                                 style="padding: 8px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; transition: 0.2s;"
                                 @click="loadScene(folder === 'Root' ? '' : folder, file)">
                                🌍 {{ file }}.json
                            </div>
                        </template>
                    </template>
                </div>
            </div>

            <div class="main-workspace flex-1 flex-column" style="position: relative; overflow: hidden; background: var(--bg-color);">
                
                <div class="flex-row" style="position: absolute; top: 15px; left: 15px; z-index: 100; gap: 10px;">
                    <button class="btn" :class="local.isDollVisible ? 'btn-primary' : 'btn-ghost'" @click="local.isDollVisible = !local.isDollVisible">
                        🧍 纸娃娃预览 ({{ local.isDollVisible ? 'ON' : 'OFF' }})
                    </button>
                    <button class="btn btn-secondary" v-show="local.sceneId" @click="copyToClipboard(local.chapter ? local.chapter+'/'+local.sceneId : local.sceneId)">📋 复制路径</button>
                </div>
                
                <div class="flex-row align-center" style="position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); z-index: 100; background: var(--panel-bg); padding: 8px 15px; border-radius: 20px; border: 1px solid var(--border); gap: 10px; color: var(--text-muted); font-size: 13px;">
                    <span>🔍 视图平移</span>
                    <input type="range" v-model.number="local.panX" min="-800" max="800" style="width: 150px; cursor: pointer;">
                </div>

                <div id="map-canvas-wrapper" class="flex-1 flex-row align-center justify-center" style="width: 100%; height: 100%; overflow: visible;">
                    <div id="scale-anchor" :style="{ transform: 'scale(' + local.scale + ') translateX(' + local.panX + 'px)', transition: 'transform 0.1s', position: 'relative' }">
                        
                        <div id="map-game-canvas" 
                             :style="{ 
                                 backgroundImage: local.bgBlobUrl ? 'url(' + local.bgBlobUrl + ')' : 'none',
                                 backgroundColor: 'var(--panel-bg-light)',
                                 backgroundSize: 'cover',
                                 backgroundPosition: 'center'
                             }"
                             style="width: 1280px; height: 720px; position: relative; box-shadow: var(--shadow-lg); border: 1px solid var(--border);">
                             
                             <div v-if="local.isDollVisible" style="position: absolute; width: 100%; height: 100%; z-index: 5; pointer-events: none;">
                             <component-paperdoll
                             :db="dollDb"
                             :equipped="dollDb.settings.defaultEquips || {}"
                             :scale="1.0"
                             :offsetX="0" 
                             :offsetY="0"
                             :dirHandle="state.dirHandle"
                         ></component-paperdoll>
                             </div>

                             <div v-if="!mapCurrentScene" class="text-muted" style="position: absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:bold; letter-spacing:2px;">
                                 请在左侧选择一个场景
                             </div>

                             <div id="explore-layer" style="position: absolute; width: 100%; height: 100%; z-index: 10;" @dblclick="addPoint">
                                 <div v-for="(p, i) in mapCurrentScene?.points || []" :key="p.id" 
                                      :style="getPointStyle(p)" 
                                      @mousedown.stop.prevent="startDragPoint($event, i, p)">
                                     
                                     <template v-if="isNpcMode(p)">
                                         <div style="position:absolute; top:-45px; background:rgba(0,0,0,0.8); padding:4px 10px; border-radius:var(--radius-sm); font-size:14px; white-space:nowrap; border:1px solid var(--primary); z-index: 100;">
                                             <span v-if="getNpcChar(p).title" class="text-secondary">[{{getNpcChar(p).title}}]</span> 
                                             <b class="text-primary" style="font-size:16px;">{{getNpcChar(p).name}}</b>
                                         </div>
                                     </template>
                                     <template v-else>
                                         <div style="font-size: 78px; text-shadow: 0 4px 8px #000; filter: drop-shadow(0 0 10px rgba(0, 242, 254, 0.8));">
                                             {{ p.icon === 'search' ? '🔍' : (p.icon === 'door' ? '🚪' : (p.icon === 'talk' ? '💬' : '✋')) }}
                                         </div>
                                         <div style="position:absolute; top:-40px; background:rgba(0,0,0,0.8); padding:4px 10px; border-radius:var(--radius-sm); font-size:14px; white-space:nowrap; color:#fff;">
                                             {{ p.name || '未命名' }}
                                         </div>
                                     </template>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="panel sidebar-right flex-column" style="width: 340px; background: var(--panel-bg); border-left: 1px solid var(--border); overflow-y: auto;">
                 
                 <div v-if="mapCurrentScene && local.curPointIdx < 0" class="p-10">
                     <div class="text-secondary m-b-10" style="font-weight: bold; border-bottom: 1px dashed var(--border); padding-bottom: 5px;">🎯 场景全局设定</div>
                     
                     <div class="m-b-10 flex-column">
                         <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">场景名称</label>
                         <input type="text" class="input" v-model="mapCurrentScene.name" style="width: 100%;">
                     </div>
                     
                     <div class="m-b-10 flex-column">
                         <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">默认背景图 (img/room/)</label>
                         <input type="text" class="input" v-model="mapCurrentScene.bgImage" style="width: 100%;">
                     </div>
                     
                     <div class="m-b-10 flex-column">
                         <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">场景专属 BGM</label>
                         <input type="text" class="input" v-model="mapCurrentScene.bgm" style="width: 100%;">
                     </div>
                     
                     <div class="text-primary m-b-10" style="font-weight: bold; margin-top: 25px;">⏳ 动态昼夜背景 (Phase BGs)</div>
                     <div class="text-muted m-b-10" style="font-size: 11px; line-height: 1.4;">当刻度匹配昼/夜相位时，自动替换下方配置的背景。</div>
                     <button class="btn btn-primary m-b-10" @click="mapCurrentScene.timeBgs.push({timeCond:'', bgImage:''})" style="width: 100%;">+ 添加昼夜背景</button>
                     
                     <div v-for="(tb, i) in mapCurrentScene.timeBgs" :key="'tb'+i" class="card p-10 m-b-10" style="position: relative; border-color: var(--primary);">
                         <span class="text-muted" @click="mapCurrentScene.timeBgs.splice(i, 1)" style="position: absolute; right: 8px; top: 8px; cursor: pointer;">✕</span>
                         <div class="flex-column m-b-10">
                             <label class="text-warning" style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">昼夜相位条件 (Phase)</label>
                             <select class="select" v-model="tb.timeCond" style="width: 100%;">
                                 <option value="">☀️/🌙 全天 (默认)</option>
                                 <option value="Day">☀️ 昼间 (Day)</option>
                                 <option value="Night">🌙 夜间 (Night)</option>
                             </select>
                         </div>
                         <div class="flex-column">
                             <label class="text-muted" style="font-size: 11px; margin-bottom: 4px;">替换背景图</label>
                             <input type="text" class="input" v-model="tb.bgImage" style="width: 100%;">
                         </div>
                     </div>
                 </div>

                 <div v-if="mapCurrentPoint">
                     <div class="p-10 flex-row" style="background: var(--secondary-glow); border-bottom: 1px solid var(--border); justify-content: space-between;">
                         <span class="text-secondary" style="font-weight: bold;">📍 交互点设定</span>
                         <span class="text-muted" style="font-size: 12px; font-family: monospace;">X:{{mapCurrentPoint.x}}% Y:{{mapCurrentPoint.y}}%</span>
                     </div>
                     
                     <div class="flex-row" style="background: var(--panel-bg-light); border-bottom: 1px solid var(--border);">
                         <div @click="local.activeTab='pt-base'" :style="{ color: local.activeTab==='pt-base' ? 'var(--secondary)' : 'var(--text-muted)', borderBottom: local.activeTab==='pt-base' ? '2px solid var(--secondary)' : 'none' }" class="flex-1 p-10" style="text-align: center; font-size: 12px; cursor: pointer;">🎯 基础</div>
                         <div @click="local.activeTab='pt-cond'" :style="{ color: local.activeTab==='pt-cond' ? 'var(--warning)' : 'var(--text-muted)', borderBottom: local.activeTab==='pt-cond' ? '2px solid var(--warning)' : 'none' }" class="flex-1 p-10" style="text-align: center; font-size: 12px; cursor: pointer;">⏳ 消耗与刷新</div>
                         <div @click="local.activeTab='pt-action'" :style="{ color: local.activeTab==='pt-action' ? 'var(--accent)' : 'var(--text-muted)', borderBottom: local.activeTab==='pt-action' ? '2px solid var(--accent)' : 'none' }" class="flex-1 p-10" style="text-align: center; font-size: 12px; cursor: pointer;">⚡ 点击行为</div>
                     </div>

                     <div v-show="local.activeTab==='pt-base'" class="p-10">
                         <div class="flex-column m-b-10">
                             <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">悬浮提示文本</label>
                             <input type="text" class="input" v-model="mapCurrentPoint.name" style="width: 100%;">
                         </div>
                         <div class="flex-column m-b-10">
                             <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">图标样式</label>
                             <select class="select" v-model="mapCurrentPoint.icon" style="width: 100%;">
                                 <option value="search">🔍 调查</option>
                                 <option value="use">✋ 使用</option>
                                 <option value="door">🚪 移动</option>
                                 <option value="talk">💬 对话</option>
                                 <option value="hidden">👻 隐藏无图标</option>
                             </select>
                         </div>
                         <div class="card p-10 flex-column" style="border-color: var(--primary);">
                             <label class="text-primary" style="font-size: 12px; margin-bottom: 4px;">👤 绑定动态 NPC</label>
                             <select class="select" v-model="mapCurrentPoint.charId" style="width: 100%;">
                                 <option value="">-- 不绑定 --</option>
                                 <option v-for="c in state.db.characters?.actors || []" :key="c.id" :value="c.id">{{c.name}}</option>
                             </select>
                         </div>
                     </div>

                     <div v-show="local.activeTab==='pt-cond'" class="p-10">
                         <div class="card p-10 m-b-10" style="border-color: var(--warning);">
                             <div class="text-warning m-b-10" style="font-size: 13px; font-weight: bold;">⏳ 动作资源结算 (AP/Stats)</div>
                             <div class="flex-row" style="gap: 10px;">
                                 <div class="flex-1 flex-column"><label class="text-warning" style="font-size:11px; font-weight:bold;">刻度(Tick)</label><input type="number" class="input" v-model.number="mapCurrentPoint.costTime" min="0" max="24"></div>
                                 <div class="flex-1 flex-column"><label class="text-primary" style="font-size:11px;">体力(HP)</label><input type="number" class="input" v-model.number="mapCurrentPoint.costEnergy"></div>
                                 <div class="flex-1 flex-column"><label class="text-secondary" style="font-size:11px;">精力(MP)</label><input type="number" class="input" v-model.number="mapCurrentPoint.costSatiety"></div>
                             </div>
                         </div>
                         
                         <div class="flex-column m-b-10">
                             <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">昼夜出现条件 (Time Phase)</label>
                             <select class="select" v-model="mapCurrentPoint.timeCond" style="width: 100%;">
                                 <option value="">☀️/🌙 全天均可出现</option>
                                 <option value="Day">☀️ 仅在昼间 (Day) 出现</option>
                                 <option value="Night">🌙 仅在夜间 (Night) 出现</option>
                             </select>
                         </div>

                         <div class="flex-column m-b-10">
                             <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">交互刷新机制</label>
                             <select class="select" v-model="mapCurrentPoint.refreshMode" style="width: 100%;">
                                 <option value="always">常驻保留 (Always)</option>
                                 <option value="once">一次性消失 (Once)</option>
                                 <option value="daily">次日刷新 (Next Day)</option>
                                 <option value="cooldown">刻度冷却 (Tick Cooldown)</option>
                             </select>
                         </div>
                         
                         <div v-if="mapCurrentPoint.refreshMode === 'cooldown'" class="flex-column m-b-10">
                             <label class="text-warning" style="font-size: 12px; font-weight: bold; margin-bottom: 4px;">冷却需要刻度数 (AP/Ticks)</label>
                             <input type="number" class="input" v-model.number="mapCurrentPoint.cooldownTime" style="width: 100%; border-color: var(--warning);">
                         </div>

                         <div class="flex-column m-b-10">
                             <label class="text-muted" style="font-size: 12px; margin-bottom: 4px;">自定义JS显示条件 (或留空)</label>
                             <input type="text" class="input" v-model="mapCurrentPoint.condition" placeholder="如: $gameSwitches.value(1)" style="width: 100%;">
                         </div>
                     </div>

                     <div v-show="local.activeTab==='pt-action'" class="p-10">
                         <button class="btn" style="width: 100%; background: rgba(255,235,59,0.1); border: 1px solid var(--accent); color: var(--accent); margin-bottom: 15px;" @click="mapCurrentPoint.actions.push({ condition: '', actionType: 'dialogue', arg1: '', arg2: '' })">+ 添加点击分歧/行为</button>
                         
                         <div v-if="!mapCurrentPoint.actions || mapCurrentPoint.actions.length === 0" class="text-muted" style="text-align:center; font-size:12px;">此节点暂无点击行为</div>
                         
                         <div v-for="(act, i) in mapCurrentPoint.actions" :key="'act'+i" class="card p-10 m-b-10" style="border-color: var(--accent); position: relative;">
                             <span class="text-muted" @click="mapCurrentPoint.actions.splice(i, 1)" style="position: absolute; right: 8px; top: 8px; cursor: pointer;">✕</span>
                             
                             <div class="flex-column m-b-10">
                                 <label class="text-muted" style="font-size: 11px; margin-bottom: 4px;">触发前置条件 (物品/开关判断)</label>
                                 <input type="text" class="input" v-model="act.condition" placeholder="例: window.CM_Item.hasItem('item_001') > 0" style="width: 100%;">
                             </div>
                             
                             <div class="flex-column m-b-10">
                                 <label style="color: var(--accent); font-size: 11px; margin-bottom: 4px;">行为类型</label>
                                 <select class="select" v-model="act.actionType" style="width: 100%;">
                                     <option value="dialogue">🎬 触发剧情对话</option>
                                     <option value="macro">✨ 执行宏指令序列 (Macro)</option>
                                     <option value="transfer">🌍 转移场景</option>
                                     <option value="script">⚙️ 执行脚本</option>
                                 </select>
                             </div>
                             
                             <div class="flex-column" v-if="act.actionType === 'dialogue'">
                                 <input type="text" class="input m-b-10" v-model="act.arg1" placeholder="剧本路径: C01/SceneA" style="width: 100%;">
                                 <input type="number" class="input" v-model.number="act.arg2" placeholder="节点ID: 1001" style="width: 100%;">
                             </div>
                             
                             <div class="flex-column" v-else-if="act.actionType === 'macro'">
                                 <div class="flex-row align-center justify-between m-b-10">
                                     <label style="color: var(--warning); font-size: 11px;">宏指令 (自上而下执行)</label>
                                     <button class="btn btn-ghost" style="padding: 2px 6px; font-size: 11px;" 
                                             @click="openMacroGenerator(i)">✨ 启动指令生成器</button>
                                 </div>
                                 <div v-for="(mac, j) in act.macros" :key="'mac'+j" class="flex-row m-b-10" style="gap: 5px;">
                                     <input type="text" class="input flex-1" v-model="act.macros[j]" placeholder="如: <LoseItem: item_001, 1>" style="font-family: monospace; font-size: 11px;">
                                     <button class="btn btn-ghost" style="padding: 0 5px; color: var(--danger);" @click="act.macros.splice(j, 1)">✕</button>
                                 </div>
                                 <button class="btn btn-ghost" style="width: 100%; border: 1px dashed var(--border); font-size: 11px; margin-top: 5px;" 
                                         @click="if(!act.macros) act.macros=[]; act.macros.push('<Eval: >')">+ 手动添加空行</button>
                             </div>

                             <div class="flex-column" v-else-if="act.actionType === 'transfer'">
                                 <input type="text" class="input" v-model="act.arg1" placeholder="目标场景: C01/RoomB" style="width: 100%;">
                             </div>
                             
                             <div class="flex-column" v-else-if="act.actionType === 'script'">
                                 <textarea class="input" v-model="act.arg1" placeholder="在此输入 JavaScript 代码...&#10;如: window.CM_Item.VueState.isStorageOpen = true;" style="width: 100%; height: 60px; font-family: monospace; font-size: 11px; resize: vertical;"></textarea>
                             </div>
                         </div>
                     </div>

                     <div class="p-10" style="padding-top: 0;">
                         <button class="btn btn-ghost" @click="mapCurrentScene.points.splice(local.curPointIdx, 1); local.curPointIdx = -1" style="width: 100%; border-color: var(--danger); color: var(--danger); margin-top: 15px;">🗑️ 彻底删除此节点</button>
                     </div>
                 </div>
            </div>

            <div class="v10-modal-overlay" :class="{'is-active': macroModal.isOpen}">
                <div class="v10-modal-content">
                    <div class="v10-modal-header">
                        <span>✨ 交互节点 - 宏指令编译器</span>
                        <span style="cursor:pointer" @click="macroModal.isOpen=false">✕</span>
                    </div>
                    <div style="padding:20px; display:flex; flex-direction:column; gap:15px; max-height: 70vh; overflow-y: auto;">
                        <label class="label">选择效果动作</label>
                        <select class="select" v-model="macroModal.activeActionId">
                            <option value="">-- 请选择要执行的指令 --</option>
                            <option v-for="a in schema?.actions" :key="a.id" :value="a.id">{{a.name}}</option>
                        </select>

                        <div v-if="macroModal.activeActionId" class="flex-column" style="gap:10px; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px;">
                            
                            <div v-if="macroModal.activeActionId === 'act_jump_if'" class="card p-10 m-b-10" style="border-color: var(--warning);">
                                <label style="color: var(--warning); font-size: 11px; font-weight: bold;">附加条件结构</label>
                                <select class="select m-b-10" v-model="macroModal.condId" style="width: 100%;">
                                    <option value="">(无条件 - 直接跳转)</option>
                                    <option v-for="c in schema?.conditions" :key="c.id" :value="c.id">{{c.name}}</option>
                                </select>
                                <div v-if="macroModal.condId" class="flex-column" style="gap:5px; padding-left: 10px; border-left: 2px solid var(--border);">
                                    <div v-for="cf in schema?.conditions.find(c=>c.id===macroModal.condId).fields" :key="cf.key">
                                        <label class="text-muted" style="font-size:10px;">{{cf.label}}</label>
                                        <select v-if="cf.type==='select'" class="select" v-model="macroModal.condValues[cf.key]">
                                            <option v-for="o in (cf.source ? schema?.enums[cf.source] : cf.options)" :key="o.value" :value="o.value">{{o.label}}</option>
                                        </select>
                                        <input v-else class="input" v-model="macroModal.condValues[cf.key]">
                                    </div>
                                </div>
                            </div>

                            <div v-for="f in schema?.actions.find(a=>a.id===macroModal.activeActionId).fields" :key="f.key">
                                <template v-if="f.key !== 'condition'">
                                    <label class="label">{{f.label}}</label>
                                    <input v-if="f.type==='number'||f.type==='string'" class="input" v-model="macroModal.fieldValues[f.key]">
                                    <select v-else-if="f.type==='select'" class="select" v-model="macroModal.fieldValues[f.key]">
                                        <option v-for="o in (f.source ? schema?.enums[f.source] : f.options)" :key="o.value" :value="o.value">{{o.label}}</option>
                                    </select>
                                </template>
                            </div>
                        </div>
                    </div>
                    <div style="padding:15px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px;">
                        <button class="btn btn-primary" @click="insertMacro" :disabled="!macroModal.activeActionId">🚀 确认并注入</button>
                    </div>
                </div>
            </div>
        </div>
    `
};