/**
 * 🌌 全能编辑器 V10.6 - 纯净纸娃娃渲染组件 (component_paperdoll.js)
 * 核心重构：废除 DOM 中心对齐，引入 1280x720 虚拟沙盒与 Top-Left (0,0) 锚点，100% 完美复刻 PIXI.js 渲染矩阵。
 * 新增：原生支持实机背景图层 (bgImage) 对照，实现真实坐标零误差锚定。
 */

 const { computed, reactive, onMounted } = window.Vue;

 const injectComponentStyle = () => {
     if (document.getElementById('cm-paperdoll-style')) return;
     const style = document.createElement('style');
     style.id = 'cm-paperdoll-style';
     style.innerHTML = `
         .pd-layer-img {
             position: absolute;
             left: 0;
             top: 0;
             pointer-events: none;
             user-select: none;
             will-change: transform, opacity;
             /* 关键修复：废除 translate(-50%, -50%)，对齐 PIXI 默认 anchor (0,0) */
             transform-origin: 0 0;
             image-rendering: -webkit-optimize-contrast;
         }
         .pd-layer-fade-enter-active, .pd-layer-fade-leave-active {
             transition: opacity 0.3s ease, transform 0.3s ease;
         }
         .pd-layer-fade-enter-from, .pd-layer-fade-leave-to {
             opacity: 0;
             transform: translateY(-20px);
         }
         .pd-anchor-point {
             position: absolute; 
             left: 0; 
             top: 0; 
             width: 10px; 
             height: 10px;
             background: var(--primary); 
             border-radius: 50%;
             /* 偏移 5px 让圆点物理中心精准压在 (0,0) 真实坐标上 */
             margin-left: -5px; 
             margin-top: -5px;
             box-shadow: 0 0 10px var(--primary-glow);
             z-index: 9999; 
             pointer-events: none;
         }
     `;
     document.head.appendChild(style);
 };
 
 const template = `
     <div class="flex-row justify-center align-center" style="position: relative; width: 100%; height: 100%; overflow: hidden;">
         
         <div :style="containerStyle">
             
             <transition-group name="pd-layer-fade">
                 <img v-for="layer in renderLayers" 
                      :key="layer.key" 
                      :src="layer.src" 
                      class="pd-layer-img"
                      :style="{ 
                          zIndex: layer.zIndex, 
                          opacity: layer.opacity || 1,
                          transform: layer.isBg ? 'none' : \`translate(\${portraitX}px, \${portraitY}px)\` 
                      }"
                      @error="handleImageError(layer.key)" />
             </transition-group>
             
             <div v-if="showAnchor" class="pd-anchor-point" title="纸娃娃真实原点 (0,0)"
                  :style="{ transform: \`translate(\${portraitX}px, \${portraitY}px)\` }">
             </div>
             
         </div>
     </div>
 `;
 
 export const ComponentPaperDoll = {
     name: 'ComponentPaperDoll',
     template: template,
     props: {
         db: { type: Object, required: true },
         equipped: { type: Object, default: () => ({}) },
         expression: { type: String, default: '' },
         scale: { type: Number, default: 1 },
         offsetX: { type: Number, default: 0 }, // 纯视口平移X
         offsetY: { type: Number, default: 0 }, // 纯视口平移Y
         showAnchor: { type: Boolean, default: false },
         dirHandle: { type: Object, default: null },
         bgImage: { type: String, default: '' } // 背景图名称
     },
     
     setup(props) {
         onMounted(() => injectComponentStyle());
 
         const imageCache = reactive({});
 
         // 内部直接提取真实的 portrait 坐标
         const portraitX = computed(() => Number(props.db?.settings?.portraitX) || 0);
         const portraitY = computed(() => Number(props.db?.settings?.portraitY) || 0);
 
         const loadBlobUrl = async (filename, isRoomBg = false) => {
             if (!filename || !props.dirHandle) return;
             const cleanName = filename.replace(/\.png$/i, '');
             if (imageCache[cleanName] !== undefined) return;
 
             try {
                 imageCache[cleanName] = 'loading'; 
                 const imgDir = await props.dirHandle.getDirectoryHandle('img');
                 const targetDir = await imgDir.getDirectoryHandle(isRoomBg ? 'room' : 'Equipment');
                 const fileHandle = await targetDir.getFileHandle(`${cleanName}.png`);
                 const file = await fileHandle.getFile();
                 imageCache[cleanName] = URL.createObjectURL(file);
             } catch (e) {
                 console.warn(`[PaperDoll] 磁盘未找到图片: ${cleanName}.png`);
                 imageCache[cleanName] = 'error'; 
             }
         };
 
         const renderLayers = computed(() => {
             const layers = [];
             const data = props.db;
             if (!data || !data.settings) return layers;
 
             const getSrc = (filename, isRoomBg = false) => {
                 const cleanName = filename.replace(/\.png$/i, '');
                 loadBlobUrl(cleanName, isRoomBg); 
                 const cached = imageCache[cleanName];
                 return (cached && cached !== 'loading' && cached !== 'error') ? cached : null;
             };
 
             // 0. 注入实机背景对照层 (不受 portraitX/Y 干扰，永远钉死在沙盒 0,0)
             if (props.bgImage) {
                 const bgSrc = getSrc(props.bgImage, false); // 默认去 Equipment 找
                 if (bgSrc) {
                     layers.push({
                         key: 'layer-reference-bg',
                         src: bgSrc,
                         zIndex: -9999,
                         isBg: true,
                         opacity: 0.75 // 略微透明以突显角色
                     });
                 }
             }
 
             // 1. 素体层
             if (data.settings.baseBodyImage) {
                 const src = getSrc(data.settings.baseBodyImage);
                 if (src) {
                     layers.push({
                         key: 'layer-base-body',
                         src: src,
                         zIndex: data.settings.baseBodyZIndex !== undefined ? Number(data.settings.baseBodyZIndex) : 20,
                         isBg: false
                     });
                 }
             }
 
             // 2. 装备层
             if (data.items && data.slots) {
                 for (const [slotId, rawItemId] of Object.entries(props.equipped)) {
                     if (!rawItemId) continue;
                     const itemId = String(rawItemId).startsWith('cloth_') ? rawItemId : `cloth_${rawItemId}`;
                     const itemDef = data.items.find(i => i.id === itemId);
                     const slotDef = data.slots.find(s => s.id === slotId);
 
                     if (itemDef && itemDef.image) {
                         const src = getSrc(itemDef.image);
                         if (src) {
                             layers.push({
                                 key: `layer-equip-${slotId}-${itemId}`,
                                 src: src,
                                 zIndex: slotDef && slotDef.zIndex !== undefined ? Number(slotDef.zIndex) : 10,
                                 isBg: false
                             });
                         }
                     }
                 }
             }
 
             // 3. 表情层
             if (props.expression && data.expressions) {
                 const expDef = data.expressions.find(e => e.id === props.expression);
                 const imgName = expDef ? expDef.image : props.expression;
                 if (imgName) {
                     const src = getSrc(imgName);
                     if (src) {
                         layers.push({
                             key: `layer-exp-${props.expression}`,
                             src: src,
                             zIndex: data.settings.expressionZIndex !== undefined ? Number(data.settings.expressionZIndex) : 999,
                             isBg: false
                         });
                     }
                 }
             }
 
             return layers.sort((a, b) => a.zIndex - b.zIndex);
         });
 
         // 强锁定 1280x720 虚拟沙盒矩阵
         const containerStyle = computed(() => ({
             position: 'absolute', 
             left: '50%', 
             top: '50%', 
             width: '1280px', 
             height: '720px',
             // 先居中，然后叠加用户的鼠标视口平移，最后按中心点缩放
             transform: `translate(calc(-50% + ${props.offsetX}px), calc(-50% + ${props.offsetY}px)) scale(${props.scale})`,
             transformOrigin: 'center center',
             pointerEvents: 'none',
             border: props.bgImage ? '1px dashed rgba(255,255,255,0.3)' : 'none' // 提供沙盒边界视觉参考
         }));
 
         const handleImageError = (key) => console.warn(`[PaperDoll] 渲染管道异常: ${key}`);
 
         return { renderLayers, containerStyle, handleImageError, portraitX, portraitY };
     }
 };