/**
 * 💬 剧本节点编辑器模块 (Dialogue Node Engine - Schema Driven V10.6)
 * 职责：基于 MacroSchema.json 动态渲染指令面板，实现可视化逻辑构建。
 * 进阶：引入「指针锚定缩放」、「微缩导航图」与「焦点防御型快捷键系统」。
 * 更新：内聚 File System API，独立完成剧本 (ja) 的本地化加载与创建。
 */

 import { state, services } from './editor_main.js';

 // -----------------------------------------------------------------------------
 // 1. 局部样式注入
 // -----------------------------------------------------------------------------
 const injectStyles = () => {
     if (document.getElementById('v10-dialogue-style')) return;
     const style = document.createElement('style');
     style.id = 'v10-dialogue-style';
     style.innerHTML = `
         .v10-dlg-root { display: flex; width: 100%; height: 100%; overflow: hidden; }
         .v10-sidebar-left { width: 240px; background: var(--panel-bg); border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index: 50; }
         .v10-sidebar-header { padding: 15px; background: rgba(0,0,0,0.5); border-bottom: 1px solid var(--border); font-weight: bold; color: var(--secondary); display: flex; justify-content: space-between; align-items: center; }
         .v10-tree-container { padding: 10px; overflow-y: auto; flex: 1; font-size: 13px; }
         .v10-tree-folder { color: var(--text-muted); margin-bottom: 5px; cursor: pointer; display: flex; justify-content: space-between; }
         .v10-tree-file { padding: 5px 8px; border-radius: var(--radius-sm); cursor: pointer; color: #ccc; margin-bottom: 2px; }
         .v10-tree-file:hover { background: var(--secondary-glow); color: var(--secondary); }
         .v10-tree-file.active { background: var(--primary-glow); color: var(--primary); border-left: 3px solid var(--primary); }
 
         .v10-dlg-canvas-wrap { flex: 1; position: relative; overflow: hidden; background: radial-gradient(circle at 50% 50%, var(--panel-bg) 0%, var(--bg-color) 100%); outline: none; }
         .v10-dlg-canvas-wrap.is-panning { cursor: grabbing !important; }
         .v10-dlg-canvas { position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: visible; transform-origin: 0 0; }
         
         .v10-dlg-toolbar { position: absolute; top: 15px; left: 15px; z-index: 100; display: flex; gap: 10px; align-items: center; }
         .v10-zoom-indicator { background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: #fff; font-size: 12px; font-weight: bold; pointer-events: none; }
 
         .v10-node { position: absolute; width: 260px; box-sizing: border-box; background: rgba(22, 26, 37, 0.95); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 4px 20px rgba(0,0,0,0.5); display: flex; flex-direction: column; z-index: 10; }
         .v10-node * { box-sizing: border-box; }
         .v10-node.is-active { border-color: var(--secondary); box-shadow: 0 0 20px rgba(0, 242, 254, 0.2); z-index: 20; }
         .v10-node.is-event { border-color: var(--warning); background: rgba(30, 25, 20, 0.95); }
         .v10-node-header { height: 35px; padding: 0 12px; background: rgba(0,0,0,0.4); border-bottom: 1px solid var(--border); border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; cursor: move; }
         .v10-node-body { height: 80px; padding: 10px; }
         .v10-node-body-event { height: 80px; padding: 6px; overflow-y: auto; }
         .v10-node-footer { padding: 5px 0 10px 0; }
         
         .v10-choice-row { height: 30px; margin-bottom: 5px; padding: 0 20px 0 10px; background: rgba(255,255,255,0.05); position: relative; display: flex; justify-content: flex-end; align-items: center; }
         .v10-choice-label { font-size: 12px; margin-right: 5px; color: #ccc; }
         
         .v10-port { position: absolute; width: 14px; height: 14px; background: #222; border: 2px solid #aaa; border-radius: 50%; cursor: crosshair; transition: all 0.2s; z-index: 20; }
         .v10-port:hover { transform: scale(1.3); background: #fff; }
         .v10-port-in { left: -7px; top: 10px; border-color: var(--secondary); }
         .v10-port-out { right: -7px; top: 8px; }
 
         .v10-sidebar-right { width: 340px; background: var(--panel-bg); border-left: 1px solid var(--border); display: flex; flex-direction: column; z-index: 50; }
         .v10-sidebar-content { padding: 15px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 15px; }
 
         .v10-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 9999; display: none; justify-content: center; align-items: center; backdrop-filter: blur(8px); }
         .v10-modal-overlay.is-active { display: flex; }
         .v10-modal-content { background: var(--panel-bg); border: 1px solid var(--primary); border-radius: var(--radius-md); width: 600px; max-height: 90vh; overflow-y: auto; }
         
         .v10-macro-form-item { margin-bottom: 15px; display: flex; flex-direction: column; gap: 5px; }
         .v10-cond-builder { background: rgba(0,0,0,0.3); border: 1px dashed var(--border); padding: 12px; border-radius: var(--radius-sm); margin-top: 5px; }
 
         /* 🌟 缩略图系统样式 */
         .v10-minimap-wrap { position: absolute; bottom: 20px; right: 20px; width: 200px; height: 150px; background: rgba(10, 15, 25, 0.85); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 5px 15px rgba(0,0,0,0.6); overflow: hidden; z-index: 100; cursor: crosshair; }
         .v10-minimap-node { position: absolute; width: 13px; height: 8px; background: rgba(255,255,255,0.3); border-radius: 1px; pointer-events: none; }
         .v10-minimap-node.is-active { background: var(--secondary); box-shadow: 0 0 5px var(--secondary); }
         .v10-minimap-node.is-event { background: var(--warning); }
         .v10-minimap-viewport { position: absolute; border: 1px solid var(--primary); background: rgba(224, 108, 138, 0.1); pointer-events: none; transition: all 0.1s linear; }
     `;
     document.head.appendChild(style);
 };
 injectStyles();
 
 const CHOICE_COLORS = ['#00f2fe', '#ffeb3b', '#00e676', '#e06c8a', '#a020f0', '#ff9800'];
 
 export const DialogueEditor = {
     setup() {
         const ui = Vue.reactive({
             activeNodeId: null,
             isPanning: false,
             pan: { x: window.innerWidth / 3, y: window.innerHeight / 3 },
             zoom: 1,
             connecting: { active: false, startNodeId: null, startIndex: -1, mouseX: 0, mouseY: 0 },
             expandedFolders: { "Root": true },
             showMinimap: true,
             clipboardNode: null
         });
 
         const macro = Vue.reactive({ isOpen: false, activeActionId: '', fieldValues: {}, condId: '', condValues: {} });
 
         const nodes = Vue.computed(() => {
             if (!Array.isArray(state.db.dialogueNodes)) return [];
             return state.db.dialogueNodes.filter(n => n && typeof n === 'object');
         });
         
         const activeNode = Vue.computed(() => nodes.value.find(n => n.id === ui.activeNodeId));
         const schema = Vue.computed(() => state.db.macroSchema);
         const actors = Vue.computed(() => state.db.characters?.actors || []);
         const currentScene = Vue.computed(() => state.current.scene);
         const fileTree = Vue.computed(() => state.db.fileTree || {});
 
         const activeActionDef = Vue.computed(() => schema.value?.actions?.find(a => a.id === macro.activeActionId));
         const activeCondDef = Vue.computed(() => schema.value?.conditions?.find(c => c.id === macro.condId));
 
         const resetMacroForm = () => {
             if (!activeActionDef.value) return;
             macro.fieldValues = {};
             activeActionDef.value.fields.forEach(f => { macro.fieldValues[f.key] = f.default !== undefined ? f.default : ''; });
             macro.condId = schema.value?.conditions?.[0]?.id || '';
             if (activeCondDef.value) {
                 macro.condValues = {};
                 activeCondDef.value.fields.forEach(f => { macro.condValues[f.key] = f.default !== undefined ? f.default : ''; });
             }
         };
 
         Vue.watch(() => macro.activeActionId, resetMacroForm);
         Vue.watch(() => macro.condId, () => {
             if (activeCondDef.value) {
                 macro.condValues = {};
                 activeCondDef.value.fields.forEach(f => { macro.condValues[f.key] = f.default !== undefined ? f.default : ''; });
             }
         });
 
         // ============================================================================
         // 核心修复：内聚 File System API，实现完整的本地剧本读写
         // ============================================================================
         
         const loadScene = async (chapterStr, sceneStr) => {
             const c = chapterStr === 'Root' ? '' : chapterStr;
             if (!state.dirHandle) {
                 services.showToast("⚠️ 请先在顶部工具栏开启工程目录！");
                 return;
             }
             try {
                 const dataDir = await state.dirHandle.getDirectoryHandle('data');
                 const dd = await dataDir.getDirectoryHandle('dialogue');
                 const langDir = await dd.getDirectoryHandle('ja');
                 const targetDir = c ? await langDir.getDirectoryHandle(c) : langDir;
                 
                 const fileHandle = await targetDir.getFileHandle(`${sceneStr}.json`);
                 const file = await fileHandle.getFile();
                 const text = await file.text();
                 
                 state.db.dialogueNodes = JSON.parse(text);
                 state.current.chapter = c;
                 state.current.scene = sceneStr;
                 
                 ui.activeNodeId = null;
                 ui.pan = { x: window.innerWidth / 3, y: window.innerHeight / 3 };
                 ui.zoom = 1;
                 services.showToast(`📄 剧本载入成功: ${sceneStr}`);
             } catch (e) {
                 console.error("加载剧本异常:", e);
                 services.showToast(`❌ 载入失败: 找不到目标剧本文件`);
             }
         };
 
         const createChapter = async (chapterName) => {
             if (!chapterName || !state.dirHandle) return;
             try {
                 const dataDir = await state.dirHandle.getDirectoryHandle('data');
                 const dd = await dataDir.getDirectoryHandle('dialogue');
                 const langDir = await dd.getDirectoryHandle('ja', { create: true });
                 
                 await langDir.getDirectoryHandle(chapterName, { create: true });
                 
                 if (!state.db.fileTree[chapterName]) {
                     state.db.fileTree[chapterName] = [];
                 }
                 services.showToast(`📁 目录 [${chapterName}] 建立成功`);
             } catch(e) {
                 console.error("建立目录异常:", e);
                 services.showToast("❌ 建立目录失败");
             }
         };
 
         const createScene = async (chapterStr, sceneName) => {
             if (!sceneName || !state.dirHandle) return;
             const c = chapterStr === 'Root' ? '' : chapterStr;
             try {
                 const dataDir = await state.dirHandle.getDirectoryHandle('data');
                 const dd = await dataDir.getDirectoryHandle('dialogue');
                 const langDir = await dd.getDirectoryHandle('ja', { create: true });
                 const targetDir = c ? await langDir.getDirectoryHandle(c, { create: true }) : langDir;
                 
                 const fileHandle = await targetDir.getFileHandle(`${sceneName}.json`, { create: true });
                 const writable = await fileHandle.createWritable();
                 await writable.write("[]");
                 await writable.close();
                 
                 const metaHandle = await targetDir.getFileHandle(`${sceneName}.meta.json`, { create: true });
                 const metaWritable = await metaHandle.createWritable();
                 await metaWritable.write(JSON.stringify({ areas: [] }, null, 2));
                 await metaWritable.close();
                 
                 const chapKey = chapterStr || 'Root';
                 if (!state.db.fileTree[chapKey]) state.db.fileTree[chapKey] = [];
                 if (!state.db.fileTree[chapKey].includes(sceneName)) {
                     state.db.fileTree[chapKey].push(sceneName);
                 }
                 services.showToast(`📄 剧本节点 [${sceneName}] 建立成功`);
                 
                 // 建立完成后自动进入该剧本
                 await loadScene(chapterStr, sceneName);
             } catch(e) {
                 console.error("建立剧本异常:", e);
                 services.showToast("❌ 建立剧本失败");
             }
         };
 
         const insertMacro = () => {
             if (!activeNode.value || !activeActionDef.value) return;
             let finalStr = activeActionDef.value.template;
             if (activeCondDef.value) {
                 let condStr = activeCondDef.value.template;
                 activeCondDef.value.fields.forEach(f => { condStr = condStr.replace(new RegExp(`\\{${f.key}\\}`, 'g'), macro.condValues[f.key]); });
                 macro.fieldValues['condition'] = condStr;
             }
             activeActionDef.value.fields.forEach(f => { finalStr = finalStr.replace(new RegExp(`\\{${f.key}\\}`, 'g'), macro.fieldValues[f.key]); });
 
             if (activeNode.value.nodeType === 'event') {
                 if (!activeNode.value.events) activeNode.value.events = [];
                 activeNode.value.events.push(finalStr);
             } else {
                 const textarea = document.getElementById('dlg-text-input');
                 const text = activeNode.value.text || "";
                 if (textarea) {
                     const start = textarea.selectionStart;
                     const end = textarea.selectionEnd;
                     activeNode.value.text = text.slice(0, start) + finalStr + text.slice(end);
                 } else {
                     activeNode.value.text = text + finalStr;
                 }
             }
             macro.isOpen = false;
             services.showToast("✨ 指令已动态编译并注入");
         };
 
         const handleKeyDown = (e) => {
             if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
             if (macro.isOpen) return;
 
             if (e.key === 'Delete' && ui.activeNodeId) {
                 if(confirm("确定删除选中的节点吗？")) {
                     state.db.dialogueNodes = nodes.value.filter(n => n.id !== ui.activeNodeId);
                     ui.activeNodeId = null;
                 }
                 return;
             }
 
             if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
                 if (ui.activeNodeId && activeNode.value) {
                     e.preventDefault();
                     ui.clipboardNode = JSON.parse(JSON.stringify(activeNode.value));
                     services.showToast(`📋 节点 #${ui.activeNodeId} 已复制`);
                 }
             }
 
             if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
                 if (ui.clipboardNode && currentScene.value) {
                     e.preventDefault();
                     const validIds = nodes.value.map(n => Number(n.id)).filter(id => !isNaN(id));
                     const newId = String(validIds.length > 0 ? Math.max(...validIds) + 1 : 1001);
                     
                     const newNode = JSON.parse(JSON.stringify(ui.clipboardNode));
                     newNode.id = newId;
                     newNode.x += 40; 
                     newNode.y += 40;
                     newNode.nextId = null; 
                     if (newNode.choices) newNode.choices.forEach(c => c.nextId = null);
                     
                     state.db.dialogueNodes.push(newNode);
                     ui.activeNodeId = newId;
                     services.showToast(`📥 节点已粘贴为 #${newId}`);
                 }
             }
         };
 
         window.Vue.onMounted(() => { window.addEventListener('keydown', handleKeyDown); });
         window.Vue.onUnmounted(() => { window.removeEventListener('keydown', handleKeyDown); });
 
         const handleWheel = (e) => {
             e.preventDefault(); 
             const zoomSensitivity = 0.001;
             const delta = -e.deltaY * zoomSensitivity;
             let newZoom = ui.zoom * Math.exp(delta);
             newZoom = Math.min(Math.max(newZoom, 0.2), 3.0); 
 
             const wrap = document.querySelector('.v10-dlg-canvas-wrap');
             if (!wrap) return;
             const rect = wrap.getBoundingClientRect();
             const mouseX = e.clientX - rect.left;
             const mouseY = e.clientY - rect.top;
 
             ui.pan.x = mouseX - (mouseX - ui.pan.x) * (newZoom / ui.zoom);
             ui.pan.y = mouseY - (mouseY - ui.pan.y) * (newZoom / ui.zoom);
             ui.zoom = newZoom;
         };
 
         const MINIMAP_SCALE = 0.04;
         const MINIMAP_CENTER_X = 100;
         const MINIMAP_CENTER_Y = 75;  
 
         const viewportStyle = Vue.computed(() => {
             let w = 800, h = 600;
             const wrap = document.querySelector('.v10-dlg-canvas-wrap');
             if (wrap) { w = wrap.clientWidth; h = wrap.clientHeight; }
             return {
                 left: (MINIMAP_CENTER_X + (-ui.pan.x / ui.zoom) * MINIMAP_SCALE) + 'px',
                 top: (MINIMAP_CENTER_Y + (-ui.pan.y / ui.zoom) * MINIMAP_SCALE) + 'px',
                 width: (w / ui.zoom * MINIMAP_SCALE) + 'px',
                 height: (h / ui.zoom * MINIMAP_SCALE) + 'px'
             };
         });
 
         const handleMinimapClick = (e) => {
             const mapRect = e.currentTarget.getBoundingClientRect();
             const clickX = e.clientX - mapRect.left;
             const clickY = e.clientY - mapRect.top;
 
             const targetWorldX = (clickX - MINIMAP_CENTER_X) / MINIMAP_SCALE;
             const targetWorldY = (clickY - MINIMAP_CENTER_Y) / MINIMAP_SCALE;
 
             const wrap = document.querySelector('.v10-dlg-canvas-wrap');
             const w = wrap ? wrap.clientWidth : 800;
             const h = wrap ? wrap.clientHeight : 600;
 
             ui.pan.x = (w / 2) - targetWorldX * ui.zoom;
             ui.pan.y = (h / 2) - targetWorldY * ui.zoom;
         };
 
         const getSpeakerName = (node) => {
             if (node.speaker) return node.speaker;
             const char = actors.value.find(c => String(c.id) === String(node.speakerId));
             return char ? (char.isProtagonist ? `👑 ${char.name}` : char.name) : '旁白';
         };
 
         const translateEventLine = (line) => {
             if (!line) return "";
             const match = line.match(/<([^:>]+)(?:[:：]\s*([^>]+))?>/);
             if (!match) return `📝 ${line}`; 
             
             const cmd = match[1].toLowerCase();
             const argStr = match[2] || '';
             const args = argStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);
 
             const translateCondition = (cond) => {
                 if (!cond) return "";
                 let res = cond;
                 res = res.replace(/\$gameSwitches\.value\((\d+)\)\s*(===|==|!==|!=)\s*(true|false)/gi, (m, id, op, val) => {
                     const isTrue = val.toLowerCase() === 'true';
                     const isOn = (op.includes('=') && isTrue) || (op.includes('!') && !isTrue);
                     return `(开关${id}=${isOn ? 'ON' : 'OFF'})`;
                 });
                 res = res.replace(/\$gameVariables\.value\((\d+)\)\s*([><=!]+)\s*(-?\d+)/gi, (m, id, op, val) => {
                     return `(变量${id} ${op} ${val})`;
                 });
                 res = res.replace(/\$gameActors\.actor\((\d+)\)\.(hp|mp|tp)\s*([><=!]+)\s*(-?\d+)/gi, (m, id, param, op, val) => {
                     return `(角色${id}的${param.toUpperCase()} ${op} ${val})`;
                 });
                 return res;
             };
 
             switch(cmd) {
                 case 'bgm': return `🎵 BGM: ${args[0]}`;
                 case 'bg': return `🖼️ 背景: ${args[0]}`;
                 case 'trans': return `🎬 黑屏转场`;
                 case 'wait': return `⏳ 等待: ${args[0]} 帧`;
                 case 'switch': return `🎚️ 开关 [${args[0]}] -> ${args[1]==='true'?'ON':'OFF'}`;
                 case 'var': return `🔢 变量 [${args[0]}] ${args[1]} ${args[2]}`;
                 case 'jumpif': 
                     if (args.length >= 3) {
                         const condText = translateCondition(args.slice(2).join(','));
                         return `🔀 分歧: 满足去 #${args[0]}, 否则去 #${args[1]} ${condText}`;
                     } else if (args.length === 2) {
                         const condText = translateCondition(args.slice(1).join(','));
                         return `🔀 跳跃: 当 ${condText} 去 #${args[0]}`;
                     } else if (args.length === 1) {
                         return `↩️ 默认跳转: 去 #${args[0]}`;
                     }
                     return `🔀 跳转指令解析异常`;
                 case 'pic': 
                     const picScope = (args[7] && args[7].toLowerCase() === 'persistent') ? ' [持久化]' : '';
                     return `🖼️ 图片 [${args[0]}] -> ${args[1]}${picScope}`;
                 case 'picanim': return `💥 图像动画: ${args[0]}`;
                 case 'leave': return `🚶 退场: ${args[0]}`;
                 case 'bump': return `💢 震动: ${args[0]}`;
                 case 'cinema': return `🎞️ 电影字幕 (${args[0]}帧)`;
                 case 'close': return `🛑 强制结束对话`;
                 case 'coroutine': return `🔄 后台协程: ${args[0]}`;
                 case 'eval': return `⚙️ 执行脚本`;
                 case 'popnode': return `💬 气泡弹窗 -> 节点 #${args[0] || args[1]}`;
                 default: return `⚡ ${match[0]}`;
             }
         };
         
         const getEventJumpTargets = (events) => {
             if (!events || !Array.isArray(events)) return [];
             const targets = [];
             events.forEach(line => {
                 const match = line.match(/<JumpIf[:：]\s*(.+?)>/i);
                 if (match && match[1]) {
                     const args = match[1].split(/[,，]/).map(s => s.trim());
                     if (args.length >= 3) {
                         if (args[0] && !isNaN(args[0])) targets.push({ id: args[0], type: 'true' });
                         if (args[1] && !isNaN(args[1])) targets.push({ id: args[1], type: 'false' });
                     } else if (args.length >= 1) {
                         if (args[0] && !isNaN(args[0])) targets.push({ id: args[0], type: 'true' });
                     }
                 }
             });
             return targets;
         };
 
         const updateConnectMouse = (e) => {
             const wrap = document.querySelector('.v10-dlg-canvas-wrap');
             if(!wrap) return;
             const rect = wrap.getBoundingClientRect();
             ui.connecting.mouseX = (e.clientX - rect.left - ui.pan.x) / ui.zoom;
             ui.connecting.mouseY = (e.clientY - rect.top - ui.pan.y) / ui.zoom;
         };
 
         const startDragNode = (node, e) => {
             ui.activeNodeId = node.id;
             const startX = e.clientX, startY = e.clientY, ox = node.x, oy = node.y;
             const move = (me) => { node.x = ox + (me.clientX - startX) / ui.zoom; node.y = oy + (me.clientY - startY) / ui.zoom; };
             const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
             window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
         };
 
         const startPan = (e) => {
             if (!e.target.classList.contains('v10-dlg-canvas-wrap') && e.target.tagName !== 'svg') return;
             e.currentTarget.focus();
             ui.isPanning = true;
             const sx = e.clientX - ui.pan.x, sy = e.clientY - ui.pan.y;
             const move = (me) => { ui.pan.x = me.clientX - sx; ui.pan.y = me.clientY - sy; };
             const up = () => { ui.isPanning = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
             window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
         };
 
         const getLinePath = (source, targetId, choiceIdx) => {
             const target = nodes.value.find(n => String(n.id) === String(targetId));
             if (!target) return '';
             const x1 = source.x + 267;
             const y1 = source.y + (choiceIdx === -1 ? 135 : 135 + choiceIdx * 35);
             const x2 = target.x;
             const y2 = target.y + 17; 
             const dx = x2 - x1;
             let cpDist = Math.max(50, Math.abs(dx) * 0.5);
             if (dx < 0) cpDist = Math.max(80, Math.abs(dx) * 0.8);
             return `M ${x1} ${y1} C ${x1 + cpDist} ${y1}, ${x2 - cpDist} ${y2}, ${x2} ${y2}`;
         };
 
         const getTempLinePath = () => {
             const src = nodes.value.find(n => n.id === ui.connecting.startNodeId);
             if(!src) return '';
             const x1 = src.x + 267;
             const y1 = src.y + (ui.connecting.startIndex === -1 ? 135 : 135 + ui.connecting.startIndex * 35);
             const x2 = ui.connecting.mouseX;
             const y2 = ui.connecting.mouseY;
             const dx = x2 - x1;
             let cpDist = Math.max(50, Math.abs(dx) * 0.5);
             if (dx < 0) cpDist = Math.max(80, Math.abs(dx) * 0.8);
             return `M ${x1} ${y1} C ${x1 + cpDist} ${y1}, ${x2 - cpDist} ${y2}, ${x2} ${y2}`;
         };
 
         const createNode = (type) => {
             if (!currentScene.value) { services.showToast("⚠️ 请先在左侧选择或创建一个剧本！"); return; }
             const validIds = nodes.value.map(n => Number(n.id)).filter(id => !isNaN(id));
             const id = String(validIds.length > 0 ? Math.max(...validIds) + 1 : 1001);
             
             const wrap = document.querySelector('.v10-dlg-canvas-wrap');
             const w = wrap ? wrap.clientWidth : 800;
             const h = wrap ? wrap.clientHeight : 600;
             const spawnX = (w / 2 - ui.pan.x) / ui.zoom - 130;
             const spawnY = (h / 2 - ui.pan.y) / ui.zoom - 80;
 
             state.db.dialogueNodes.push({ id, nodeType: type, x: spawnX, y: spawnY, speakerId: '', text: '', nextId: null, choices: [], events: [] });
             ui.activeNodeId = id;
         };
 
         return {
             state, ui, nodes, activeNode, fileTree, currentScene, actors, CHOICE_COLORS, macro, schema,
             activeActionDef, activeCondDef, MINIMAP_SCALE, MINIMAP_CENTER_X, MINIMAP_CENTER_Y, viewportStyle,
             getSpeakerName, translateEventLine, insertMacro, getEventJumpTargets,
             startDragNode, startPan, handleWheel, handleMinimapClick,
             startConnect: (id, idx, e) => { ui.connecting.active=true; ui.connecting.startNodeId=id; ui.connecting.startIndex=idx; updateConnectMouse(e); window.addEventListener('mousemove', updateConnectMouse); },
             endConnect: (id) => { 
                 if(!ui.connecting.active) return;
                 const src = nodes.value.find(n => n.id === ui.connecting.startNodeId);
                 if(src) { if(ui.connecting.startIndex===-1) src.nextId=id; else src.choices[ui.connecting.startIndex].nextId=id; }
                 ui.connecting.active=false; window.removeEventListener('mousemove', updateConnectMouse);
             },
             getLinePath, getTempLinePath, createNode, 
             deleteNode: (id) => { if(confirm("确定删除？")) { state.db.dialogueNodes = nodes.value.filter(n=>n.id!==id); ui.activeNodeId=null; } },
             loadScene,
             createChapter,
             createScene
         };
     },
     template: `
         <div class="v10-dlg-root">
             <div class="v10-sidebar-left">
                 <div class="v10-sidebar-header">
                     <span>📂 剧本资源树</span>
                     <button class="btn btn-ghost" style="padding: 2px 8px;" @click="createChapter(prompt('请输入新章节名称:'))">📁+</button>
                 </div>
                 <div class="v10-tree-container">
                     <div v-for="(scenes, chapter) in fileTree" :key="chapter">
                         <div class="v10-tree-folder" @click="ui.expandedFolders[chapter] = !ui.expandedFolders[chapter]">
                             {{ ui.expandedFolders[chapter] ? '📂' : '📁' }} {{ chapter }}
                             <span style="color:var(--primary);" @click.stop="createScene(chapter, prompt('在 ['+chapter+'] 中新建场景:'))">📄+</span>
                         </div>
                         <div v-show="ui.expandedFolders[chapter]" style="padding-left:15px; border-left:1px dashed #333; margin-left:5px;">
                             <div v-for="s in scenes" :key="s" class="v10-tree-file" :class="{active: currentScene===s}" @click="loadScene(chapter, s)">📄 {{s}}</div>
                         </div>
                     </div>
                 </div>
             </div>
 
             <div class="v10-dlg-canvas-wrap" :class="{'is-panning': ui.isPanning}" tabindex="0" @mousedown="startPan" @wheel="handleWheel">
                 <div class="v10-dlg-toolbar">
                     <button class="btn btn-primary" @click="createNode('dialogue')">💬 对话节点</button>
                     <button class="btn" style="background:var(--warning); color:#000;" @click="createNode('event')">⚡ 事件节点</button>
                     <div class="v10-zoom-indicator">🔍 {{ Math.round(ui.zoom * 100) }}%</div>
                     <button class="btn btn-ghost" @click="ui.zoom = 1; ui.pan = {x: window.innerWidth/3, y: window.innerHeight/3}">🎯 视野复位</button>
                     <button class="btn btn-ghost" @click="ui.showMinimap = !ui.showMinimap">🗺️ {{ ui.showMinimap ? '隐藏缩略图' : '显示缩略图' }}</button>
                 </div>
                 
                 <div class="v10-dlg-canvas" :style="{ transform: 'translate('+ui.pan.x+'px,'+ui.pan.y+'px) scale('+ui.zoom+')' }">
                     <svg style="position:absolute; top:0; left:0; width:1px; height:1px; overflow:visible; pointer-events:none; z-index:1;">
                         <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.4)"/></marker>
                         <marker id="arrow-event" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--warning)"/></marker>
                         <marker id="arrow-event-false" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#ff3b3b"/></marker>
                         
                         <g v-for="node in nodes" :key="'lines-'+node.id">
                             <path v-if="node.nextId" :d="getLinePath(node, node.nextId, -1)" stroke="var(--border)" stroke-width="2" fill="none" marker-end="url(#arrow)"/>
                             <template v-if="node.choices && node.choices.length > 0">
                                 <template v-for="(c, idx) in node.choices" :key="'choice-line-'+idx">
                                     <path v-if="c && c.nextId" :d="getLinePath(node, c.nextId, idx)" :stroke="CHOICE_COLORS[idx%6]" stroke-width="2.5" fill="none" marker-end="url(#arrow)"/>
                                 </template>
                             </template>
                             <template v-if="node.nodeType === 'event' && node.events && node.events.length > 0">
                                 <template v-for="(tgt, idx) in getEventJumpTargets(node.events)" :key="'jump-'+node.id+'-'+idx">
                                     <path v-if="tgt && tgt.id" :d="getLinePath(node, tgt.id, -1)" 
                                           :stroke="tgt.type === 'false' ? '#ff3b3b' : 'var(--warning)'" 
                                           stroke-width="2" stroke-dasharray="5,5" fill="none" 
                                           :marker-end="tgt.type === 'false' ? 'url(#arrow-event-false)' : 'url(#arrow-event)'"/>
                                 </template>
                             </template>
                         </g>
                         <path v-if="ui.connecting.active" :d="getTempLinePath()" stroke="var(--primary)" stroke-width="3" stroke-dasharray="8" fill="none"/>
                     </svg>
 
                     <div v-for="node in nodes" :key="node.id" class="v10-node" :class="{'is-active': ui.activeNodeId===node.id, 'is-event': node.nodeType==='event'}" :style="{left: node.x+'px', top: node.y+'px'}" @mousedown.stop="ui.activeNodeId=node.id">
                         <div class="v10-port v10-port-in" @mouseup.stop="endConnect(node.id)"></div>
                         <div class="v10-node-header" @mousedown.stop="startDragNode(node, $event)">
                             <span class="v10-node-id">#{{node.id}}</span>
                             <span style="font-size:11px; color:#aaa;">{{ getSpeakerName(node) }}</span>
                         </div>
                         
                         <div class="v10-node-body" :class="{'v10-node-body-event': node.nodeType==='event'}">
                             <textarea v-if="node.nodeType!=='event'" v-model="node.text" class="textarea" style="width:100%; height:100%; resize:none; margin:0; font-size:12px;" placeholder="文本..."></textarea>
                             <div v-else style="font-size:11px; color:var(--warning);">
                                 <div v-if="!node.events || node.events.length===0" style="color:var(--text-muted); text-align:center;">暂无指令</div>
                                 <div v-for="(e, i) in node.events" :key="i" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{translateEventLine(e)}}</div>
                             </div>
                         </div>
 
                         <div class="v10-node-footer">
                             <div v-for="(c, idx) in node.choices" :key="'choice-'+idx" class="v10-choice-row">
                                 <span class="v10-choice-label" :style="{color: CHOICE_COLORS[idx%6]}">{{c.text}}</span>
                                 <div class="v10-port v10-port-out" :style="{borderColor: CHOICE_COLORS[idx%6]}" @mousedown.stop="startConnect(node.id, idx, $event)"></div>
                             </div>
                             <div v-if="!node.choices || node.choices.length===0" class="v10-choice-row">
                                 <span class="v10-choice-label" style="color:#aaa;">默认流向</span>
                                 <div class="v10-port v10-port-out" style="border-color:#555;" @mousedown.stop="startConnect(node.id, -1, $event)"></div>
                             </div>
                         </div>
                     </div>
                 </div>
 
                 <div v-if="ui.showMinimap && nodes.length > 0" class="v10-minimap-wrap" @mousedown="handleMinimapClick">
                     <div v-for="node in nodes" :key="'mini-'+node.id" class="v10-minimap-node" :class="{'is-active': ui.activeNodeId===node.id, 'is-event': node.nodeType==='event'}" :style="{ left: (MINIMAP_CENTER_X + node.x * MINIMAP_SCALE) + 'px', top: (MINIMAP_CENTER_Y + node.y * MINIMAP_SCALE) + 'px' }"></div>
                     <div class="v10-minimap-viewport" :style="viewportStyle"></div>
                 </div>
             </div>
 
             <div class="v10-sidebar-right" v-if="activeNode">
                 <div class="v10-sidebar-header">
                     <span>⚙️ 属性 #{{activeNode.id}}</span>
                     <button class="v10-btn-icon" @click="deleteNode(activeNode.id)">🗑</button>
                 </div>
                 <div class="v10-sidebar-content">
                     <button class="btn btn-secondary" style="border-style:dashed;" @click="macro.isOpen=true">✨ 演出指令生成器</button>
                     
                     <div class="v10-panel-section" v-if="activeNode.nodeType!=='event'">
                         <div class="v10-panel-title">🗣️ 发言者配置</div>
                         <div class="v10-panel-body">
                             <select class="select" v-model="activeNode.speakerId">
                                 <option value="">旁白/系统</option>
                                 <option v-for="a in actors" :key="a.id" :value="a.id">{{a.isProtagonist?'👑':''}} {{a.name}}</option>
                             </select>
                             <input class="input" v-model="activeNode.speaker" placeholder="覆盖名称 (可选)">
                         </div>
                     </div>
 
                     <div class="v10-panel-section">
                         <div class="v10-panel-title">🔀 分支与事件</div>
                         <div class="v10-panel-body">
                             <div v-if="activeNode.nodeType!=='event'">
                                 <button class="btn btn-ghost" @click="if(!activeNode.choices) activeNode.choices=[]; activeNode.choices.push({text:'新选项', nextId:null})">+ 新增选项</button>
                                 <div v-for="(c, i) in activeNode.choices" :key="i" class="v10-list-item" style="flex-direction:column;">
                                     <div style="display:flex; width:100%; gap:5px;">
                                         <input v-model="c.text" class="input" style="flex:1">
                                         <button class="v10-btn-icon" @click="activeNode.choices.splice(i,1)">×</button>
                                     </div>
                                     <input v-model="c.condition" class="input" style="width:100%; font-size:11px; padding:4px;" placeholder="显示条件 (如: $gameSwitches.value(1))">
                                 </div>
                             </div>
                             <div v-else>
                                 <button class="btn btn-ghost" @click="if(!activeNode.events) activeNode.events=[]; activeNode.events.push('<Wait: 60>')">+ 新增指令行</button>
                                 <div v-for="(e, i) in activeNode.events" :key="i" class="v10-list-item">
                                     <input v-model="activeNode.events[i]" class="input" style="flex:1; font-family:monospace; font-size:11px;">
                                     <button class="v10-btn-icon" @click="activeNode.events.splice(i,1)">×</button>
                                 </div>
                             </div>
                         </div>
                     </div>
                 </div>
             </div>
 
             <div class="v10-modal-overlay" :class="{'is-active': macro.isOpen}">
                 <div class="v10-modal-content">
                     <div class="v10-modal-header">
                         <span>✨ 指令编译器 (Schema Powered)</span>
                         <span style="cursor:pointer" @click="macro.isOpen=false">✕</span>
                     </div>
                     <div style="padding:20px; display:flex; flex-direction:column; gap:15px;">
                         
                         <div class="v10-macro-form-item">
                             <label class="label">选择动作分类</label>
                             <select class="select" v-model="macro.activeActionId">
                                 <option value="" disabled>-- 请选择指令 --</option>
                                 <option v-for="a in schema?.actions" :key="a.id" :value="a.id">{{a.name}}</option>
                             </select>
                             <div v-if="activeActionDef?.description" style="font-size:11px; color:var(--text-muted);">ℹ️ {{activeActionDef.description}}</div>
                         </div>
 
                         <div v-if="activeActionDef" style="display:flex; flex-direction:column; gap:12px;">
                             <div v-for="field in activeActionDef.fields" :key="field.key" class="v10-macro-form-item">
                                 <label class="label">{{field.label}}</label>
                                 
                                 <input v-if="field.type==='string' || field.type==='number'" :type="field.type" class="input" v-model="macro.fieldValues[field.key]">
                                 
                                 <select v-else-if="field.type==='select'" class="select" v-model="macro.fieldValues[field.key]">
                                     <option v-for="opt in (field.source ? schema?.enums?.[field.source] : field.options)" :key="opt.value" :value="opt.value">{{opt.label}}</option>
                                 </select>
 
                                 <select v-else-if="field.type==='actorSelect'" class="select" v-model="macro.fieldValues[field.key]">
                                     <option v-for="a in actors" :key="a.id" :value="a.id">{{a.name}} (ID:{{a.id}})</option>
                                 </select>
 
                                 <div v-else-if="field.type==='conditionBuilder'" class="v10-cond-builder">
                                     <div class="flex-column" style="gap:8px;">
                                         <select class="select" v-model="macro.condId" style="background:#222;">
                                             <option v-for="c in schema?.conditions" :key="c.id" :value="c.id">{{c.name}}</option>
                                         </select>
                                         
                                         <div v-if="activeCondDef" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                                             <div v-for="cf in activeCondDef.fields" :key="cf.key">
                                                 <label style="font-size:11px; color:#aaa;">{{cf.label}}</label>
                                                 <select v-if="cf.type==='select'" class="select" v-model="macro.condValues[cf.key]">
                                                     <option v-for="o in (cf.source ? schema?.enums?.[cf.source] : cf.options)" :key="o.value" :value="o.value">{{o.label}}</option>
                                                 </select>
                                                 <select v-else-if="cf.type==='actorSelect'" class="select" v-model="macro.condValues[cf.key]">
                                                     <option v-for="a in actors" :key="a.id" :value="a.id">{{a.name}}</option>
                                                 </select>
                                                 <input v-else class="input" v-model="macro.condValues[cf.key]">
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         </div>
 
                     </div>
                     <div style="padding:15px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px;">
                         <button class="btn btn-ghost" @click="macro.isOpen=false">取消</button>
                         <button class="btn btn-primary" @click="insertMacro" :disabled="!macro.activeActionId">🚀 编译并注入</button>
                     </div>
                 </div>
             </div>
         </div>
     `
 };