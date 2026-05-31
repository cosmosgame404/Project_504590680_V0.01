/**
 * 🌌 全能编辑器 V10.8.9 - UI 布局可视化调节组件 (component_ui_layout.js)
 * 职责：在沙盒画布中渲染所有 UI 锚点，并提供视觉 Mock 预览。
 * 重构：清理废弃的 DropZone 样式与渲染逻辑。
 */

 const { computed, reactive, onMounted } = window.Vue;

 const injectComponentStyle = () => {
     if (document.getElementById('cm-ui-layout-style')) return;
     const style = document.createElement('style');
     style.id = 'cm-ui-layout-style';
     style.innerHTML = `
         .ui-sandbox-container {
             position: absolute;
             left: 50%;
             top: 50%;
             width: 1280px;
             height: 720px;
             transform-origin: center center;
             background: rgba(0, 0, 0, 0.1);
             border: 1px dashed rgba(0, 242, 254, 0.4);
             pointer-events: none;
             user-select: none;
         }
 
         .ui-layout-box {
             position: absolute;
             background: rgba(0, 242, 254, 0.15);
             border: 2px solid var(--secondary, #00f2fe);
             pointer-events: auto;
             cursor: move;
             display: flex;
             flex-direction: column;
             box-sizing: border-box;
             transition: background 0.2s;
         }
 
         .ui-layout-box:hover {
             background: rgba(0, 242, 254, 0.3);
         }
 
         .ui-layout-box.active {
             border-color: var(--primary, #ff4b8b);
             box-shadow: 0 0 15px rgba(255, 75, 139, 0.6);
             z-index: 9999 !important;
         }
 
         /* 标签与尺寸指示器 */
         .ui-box-label {
             position: absolute;
             top: -24px;
             left: -2px;
             background: var(--secondary, #00f2fe);
             color: #000;
             font-size: 11px;
             padding: 3px 8px;
             font-weight: bold;
             white-space: nowrap;
             border-radius: 4px 4px 0 0;
         }
 
         .ui-layout-box.active .ui-box-label {
             background: var(--primary, #ff4b8b);
             color: #fff;
         }
 
         .ui-box-info {
             position: absolute;
             bottom: 2px;
             right: 4px;
             font-size: 10px;
             color: var(--secondary, #00f2fe);
             opacity: 0.8;
             font-weight: bold;
             text-shadow: 0 1px 2px #000;
         }
 
         /* 拉伸控制柄 */
         .ui-resize-handle {
             position: absolute;
             width: 12px;
             height: 12px;
             background: var(--primary, #ff4b8b);
             right: -6px;
             bottom: -6px;
             cursor: nwse-resize;
             border-radius: 50%;
             box-shadow: 0 0 5px rgba(0,0,0,0.5);
         }
 
         /* 模拟内容预览 */
         .mock-content {
             flex: 1;
             display: flex;
             align-items: center;
             justify-content: center;
             overflow: hidden;
             opacity: 0.8;
             pointer-events: none;
             width: 100%;
             height: 100%;
         }
 
         /* 动画锚点特殊样式 */
         .is-anchor-point {
             border-radius: 50% !important;
             border: 2px solid var(--danger, #ff3b5b) !important;
             background: rgba(255, 59, 91, 0.2) !important;
         }
         .is-anchor-point.active {
             box-shadow: 0 0 20px rgba(255, 59, 91, 0.8) !important;
         }
     `;
     document.head.appendChild(style);
 };
 
 const template = `
     <div class="flex-row justify-center align-center" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none;">
         <div class="ui-sandbox-container" :style="containerStyle">
             
             <div v-for="(config, key) in layoutDb" :key="key"
                  class="ui-layout-box"
                  :class="{ 
                      active: activeKey === key, 
                      'is-anchor-point': key === 'animAnchor'
                  }"
                  :style="getBoxStyle(config, key)"
                  @mousedown.stop="startDrag($event, key)">
                 
                 <div class="ui-box-label" v-if="key !== 'animAnchor'">{{ config.name || key }}</div>
                 <div v-if="key === 'animAnchor'" style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-size: 11px; color: #ff3b5b; font-weight: bold; text-shadow: 0 1px 2px #000; white-space: nowrap;">🎯 动画锚点</div>
                 
                 <div class="mock-content">
                    <div v-if="key === 'animAnchor'" style="color: #ff3b5b; font-size: 24px; line-height: 1; text-shadow: 0 0 5px rgba(255, 59, 91, 0.8);">⌖</div>
                    
                    <div v-else-if="key === 'tpBox'" style="display:flex; flex-direction:column; align-items:center; gap:4px; transform: scale(0.8);">
                        <div style="font-size:12px; color:#ff4b8b; font-weight:bold; text-shadow:0 1px 2px #000;">❤️ TP</div>
                        <div style="width:100%; height:12px; border:1px solid #ff4b8b; border-radius:6px; position:relative; background: rgba(0,0,0,0.5);">
                            <div style="position:absolute; left:0; height:100%; width:60%; background:#ff4b8b; border-radius:5px;"></div>
                        </div>
                    </div>

                    <div v-else-if="key === 'quickItemBar'" style="display:flex; flex-direction:row; align-items:center; justify-content:flex-start; gap:8px; width:100%; padding:0 10px;">
                        <div v-for="i in 3" :key="i" style="width:40px; height:40px; border:2px solid rgba(255,255,255,0.3); border-radius:8px; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; color:rgba(255,255,255,0.4); font-size:16px;">
                            {{ i }}
                        </div>
                        <div style="color:rgba(255,255,255,0.3); font-size:18px;">...</div>
                    </div>

                    <div v-else-if="key === 'timeBox'" style="font-size:18px; font-weight:bold; color:#fff; text-shadow:0 2px 4px #000;">🕒 08:30 <span style="font-size:12px; opacity:0.7;">晴天</span></div>
                    <div v-else-if="key === 'statusBox'" style="font-size:13px; text-align:left; width:90%; color:#fff; text-shadow:0 1px 2px #000;">🩸 HP: 85%<br>⚡ MP: 40%</div>
                    <div v-else-if="key === 'messageLog'" style="font-size:11px; text-align:left; width:90%; color:#bbb; background:rgba(255,255,255,0.05); padding:5px; border-radius:4px; height:80%;">[系统] 发现新线索...<br>[系统] 获得 止痛药 x1</div>
                    <div v-else-if="key === 'easyDialogueBox'" style="width:90%; height:60%; border:2px solid rgba(255,255,255,0.2); border-radius:8px; display:flex; align-items:center; padding:10px; color:#fff; font-size:12px;">这里是对话文本预览区域...</div>
                    
                    <div v-else style="font-size:12px; opacity:0.5; color:#fff;">{{ config.name || key }}</div>
                 </div>
 
                 <div class="ui-box-info" v-if="key !== 'animAnchor'">{{ parseInt(config.width) || 'auto' }} x {{ parseInt(config.height) || 'auto' }}</div>
 
                 <div class="ui-resize-handle" v-if="key !== 'animAnchor'" @mousedown.stop="startResize($event, key)"></div>
             </div>
 
         </div>
     </div>
 `;
 
 export const ComponentUiLayout = {
     name: 'ComponentUiLayout',
     template: template,
     props: {
         layoutDb: { type: Object, required: true },
         scale: { type: Number, default: 1 },
         offsetX: { type: Number, default: 0 },
         offsetY: { type: Number, default: 0 },
         activeKey: { type: String, default: '' }
     },
     emits: ['update:activeKey'],
     
     setup(props, { emit }) {
         onMounted(() => injectComponentStyle());
 
         const interState = reactive({
             isMoving: false,
             isResizing: false,
             targetKey: '',
             startX: 0, startY: 0,
             initX: 0, initY: 0,
             initW: 0, initH: 0
         });
 
         const containerStyle = computed(() => ({
             transform: `translate(calc(-50% + ${props.offsetX}px), calc(-50% + ${props.offsetY}px)) scale(${props.scale})`
         }));
 
         const getBoxStyle = (config, key) => {
             const style = { ...config };
             style.zIndex = config.zIndex || 100;
             
             if (style.left === 'auto') delete style.left;
             if (style.right === 'auto') delete style.right;
             if (style.top === 'auto') delete style.top;
             if (style.bottom === 'auto') delete style.bottom;
 
             if (key === 'animAnchor') {
                 style.width = '40px';
                 style.height = '40px';
                 style.transform = 'translate(-20px, -20px)';
             }
 
             return style;
         };
 
         const startDrag = (e, key) => {
             emit('update:activeKey', key);
             interState.isMoving = true;
             interState.targetKey = key;
             interState.startX = e.clientX;
             interState.startY = e.clientY;
 
             const config = props.layoutDb[key];
             
             interState.initX = parseInt(config.left) || 0;
             interState.initY = parseInt(config.top) || 0;
             
             if (config.right !== undefined && config.right !== 'auto' && (config.left === undefined || config.left === 'auto')) {
                 interState.initX = 1280 - parseInt(config.right) - (parseInt(config.width) || 0);
             }
             if (config.bottom !== undefined && config.bottom !== 'auto' && (config.top === undefined || config.top === 'auto')) {
                 interState.initY = 720 - parseInt(config.bottom) - (parseInt(config.height) || 0);
             }
 
             window.addEventListener('mousemove', doDrag);
             window.addEventListener('mouseup', stopDrag);
         };
 
         const doDrag = (e) => {
             if (!interState.isMoving) return;
             const dx = (e.clientX - interState.startX) / props.scale;
             const dy = (e.clientY - interState.startY) / props.scale;
             
             const config = props.layoutDb[interState.targetKey];
             
             if (config.left !== undefined && config.left !== 'auto') {
                 config.left = `${Math.round(interState.initX + dx)}px`;
             } else if (config.right !== undefined && config.right !== 'auto') {
                 config.right = `${Math.round(1280 - (interState.initX + dx) - parseInt(config.width))}px`;
             }
 
             if (config.top !== undefined && config.top !== 'auto') {
                 config.top = `${Math.round(interState.initY + dy)}px`;
             } else if (config.bottom !== undefined && config.bottom !== 'auto') {
                 config.bottom = `${Math.round(720 - (interState.initY + dy) - parseInt(config.height))}px`;
             }
         };
 
         const stopDrag = () => {
             interState.isMoving = false;
             window.removeEventListener('mousemove', doDrag);
             window.removeEventListener('mouseup', stopDrag);
         };
 
         const startResize = (e, key) => {
             interState.isResizing = true;
             interState.targetKey = key;
             interState.startX = e.clientX;
             interState.startY = e.clientY;
             
             const config = props.layoutDb[key];
             interState.initW = parseInt(config.width) || 100;
             interState.initH = parseInt(config.height) || 50;
 
             window.addEventListener('mousemove', doResize);
             window.addEventListener('mouseup', stopResize);
         };
 
         const doResize = (e) => {
             if (!interState.isResizing) return;
             const dx = (e.clientX - interState.startX) / props.scale;
             const dy = (e.clientY - interState.startY) / props.scale;
             
             const config = props.layoutDb[interState.targetKey];
             config.width = `${Math.max(20, Math.round(interState.initW + dx))}px`;
             config.height = `${Math.max(20, Math.round(interState.initH + dy))}px`;
         };
 
         const stopResize = () => {
             interState.isResizing = false;
             window.removeEventListener('mousemove', doResize);
             window.removeEventListener('mouseup', stopResize);
         };
 
         return { 
             containerStyle, getBoxStyle, 
             startDrag, startResize 
         };
     }
 };