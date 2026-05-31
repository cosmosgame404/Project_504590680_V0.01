/*:
 * @target MZ
 * @plugindesc [v10.9.8] Vue3 ダイアログHUD (フルカスタム座標＆防振最適化版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_DialogueSystem_Core
 * @orderAfter CM_DialogueSystem_Core
 *
 * @param LayoutSettings
 * @text 【UIレイアウト設定】
 * @default ====================================
 *
 * @param DlgBoxWidth
 * @parent LayoutSettings
 * @text 💬 ダイアログ枠：幅
 * @desc 会話枠の幅 (例: 75%, 1050px)
 * @type string
 * @default 75%
 *
 * @param DlgBoxLeft
 * @parent LayoutSettings
 * @text 💬 ダイアログ枠：X座標 (Left)
 * @desc 画面左端からの距離。右に動かす場合は calc(50% + 100px) など (デフォルト: 50%)
 * @type string
 * @default 50%
 *
 * @param DlgBoxTranslateX
 * @parent LayoutSettings
 * @text 💬 ダイアログ枠：X軸オフセット
 * @desc 中心点の補正値 (デフォルト中央揃え: -50%)
 * @type string
 * @default -50%
 *
 * @param DlgBoxBottom
 * @parent LayoutSettings
 * @text 💬 ダイアログ枠：下余白
 * @desc 画面下部からの距離 (例: 30px, 5%)
 * @type string
 * @default 30px
 *
 * @param ChoiceBoxRight
 * @parent LayoutSettings
 * @text 🔘 選択肢枠：右余白
 * @desc 画面右端からの距離 (例: 100px, 15%)
 * @type string
 * @default 100px
 *
 * @param ChoiceBoxBottom
 * @parent LayoutSettings
 * @text 🔘 選択肢枠：下余白
 * @desc 画面下部からの距離 (例: 260px, 30%)
 * @type string
 * @default 260px
 *
 * @help
 * ============================================================================
 * アーキテクチャ設計 (CM_Vue_DialogueHUD):
 * 本プラグインは CM_DialogueSystem_Core から Vue3 に依存する全ての
 * UIレンダリング、CSS、DOMライフサイクル管理を完全に分離したモジュールです。
 * ============================================================================
 */

(() => {
    "use strict";

    const CM = window.CM_Dialogue;
    if (!CM) {
        console.error("[CM_Vue_DialogueHUD] 致命的エラー: CM_DialogueSystem_Core.js が見つかりません。");
        return;
    }

    // プラグインパラメータの取得
    CM.Param = CM.Param || {};
    const params = PluginManager.parameters('CM_Vue_DialogueHUD');
    CM.Param.DlgBoxWidth = params['DlgBoxWidth'] || '75%';
    CM.Param.DlgBoxLeft = params['DlgBoxLeft'] || '50%';
    CM.Param.DlgBoxTranslateX = params['DlgBoxTranslateX'] || '-50%';
    CM.Param.DlgBoxBottom = params['DlgBoxBottom'] || '30px';
    CM.Param.ChoiceBoxRight = params['ChoiceBoxRight'] || '100px';
    CM.Param.ChoiceBoxBottom = params['ChoiceBoxBottom'] || '260px';

    //=========================================================================
    // 1. スタイルシートの動的注入 (CSS Injection)
    //=========================================================================
    const injectHUDStyles = function() {
        if (document.getElementById('cm-dialogue-vue-style')) return;
        const style = document.createElement('style');
        style.id = 'cm-dialogue-vue-style';
        style.innerHTML = `
            #cm-dialogue-vue-root {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                pointer-events: none; z-index: 9000; overflow: hidden;
            }
            
            #cm-canvas-tracker { position: absolute; transform-origin: 0 0; pointer-events: none; }
            #cm-dialogue-wrapper { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
            
            .dlg-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; z-index: 1; pointer-events: auto; }
            
            .cm-top-right-menu {
                position: absolute; top: 30px; right: 30px; z-index: 10000;
                display: flex; gap: 15px; pointer-events: auto; transition: opacity 0.3s;
            }
            .cm-top-right-menu.is-hidden { opacity: 0; pointer-events: none; }
            .sys-btn {
                background: var(--cm-bg-glass, rgba(255, 255, 255, 0.9)); border: none;
                box-shadow: var(--cm-shadow-diffuse, 0 4px 16px rgba(0,0,0,0.08));
                color: var(--cm-color-text-main, #333); padding: 8px 18px; border-radius: 20px;
                font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px;
                backdrop-filter: blur(10px); transition: all 0.2s ease;
            }
            .sys-btn:hover { background: var(--cm-color-primary, #ff4b8b); color: #fff; transform: translateY(-2px); }
            .sys-btn.active { background: var(--cm-color-secondary, #00d2ff); color: #fff; }
            
            /* メインダイアログコンテナ 
               ※Vue側から left, bottom, transform がインラインで注入されるため、ここでは省略
            */
            .dlg-box { 
                position: absolute; 
                max-width: 1050px; padding: 20px; box-sizing: border-box; 
                z-index: 10; pointer-events: none; transition: opacity 0.4s ease; opacity: 1;
                background: transparent; border: none; box-shadow: none; backdrop-filter: none;
                display: flex; flex-direction: column; align-items: center;
                will-change: transform, opacity; backface-visibility: hidden;
            }
            /* 非表示時の Y軸オフセットも Vue 側で計算して適用する */
            .dlg-box.is-empty-box { background: transparent !important; box-shadow: none !important; border: none !important; backdrop-filter: none !important; }
            .is-empty-box .dlg-speaker, .is-empty-box .dlg-next-icon, .is-empty-box .dlg-text-container { display: none !important; }
            .dlg-box.is-cinematic { padding: 0; }
            
            /* 話者名ネームタグ */
            .dlg-speaker { 
                display: flex; flex-direction: column; align-items: center;
                margin-bottom: 20px; width: auto; min-width: 250px; z-index: 20;
            }
            .speaker-name { 
                font-family: var(--cm-font-bold); font-weight: 900; font-size: 26px; 
                color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.8); 
                letter-spacing: 2px; padding-bottom: 8px; border-bottom: 2px solid rgba(255, 255, 255, 0.6); 
                width: 100%; text-align: center;
                transform: translateZ(0); backface-visibility: hidden; -webkit-font-smoothing: antialiased;
            }
            .is-cinematic .dlg-speaker { display: none !important; }
            
            /* テキストエリア */
            .dlg-text-container { width: 100%; height: auto; min-height: 80px; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; text-align: center; overflow: hidden; }
            .dlg-text { 
                color: #ffffff; font-size: 24px; line-height: 1.6; text-shadow: 0 2px 6px rgba(0,0,0,0.8); font-weight: bold; font-family: var(--cm-font-main); width: 100%; letter-spacing: 1px; 
                transform: translateZ(0); backface-visibility: hidden; -webkit-font-smoothing: antialiased;
            }

            .dlg-next-icon { position: absolute; bottom: 15px; right: 20px; color: #ffffff; font-size: 22px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
            .is-cinematic .dlg-next-icon { display: none !important; }
            
            /* 選択肢コンテナ */
            .dlg-choices-container { 
                position: absolute; width: auto; max-width: 60%; z-index: 20; pointer-events: none; 
                display: flex; flex-direction: column; align-items: flex-end; gap: 12px; 
            }

            /* 選択肢ボタン */
            .dlg-choice-btn { 
                position: relative; padding: 12px 28px; cursor: pointer; pointer-events: auto; 
                min-width: 250px; text-align: left; 
                background: #ffffff; border: 2px solid var(--cm-color-primary, #ff4b8b); color: var(--cm-color-text-main, #333333);
                border-radius: 30px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                will-change: transform;
            }
            .dlg-choice-btn:hover { background: var(--cm-color-primary, #ff4b8b); color: #ffffff; box-shadow: 0 8px 16px rgba(255, 75, 139, 0.3); transform: scale(1.05) translateX(-5px); }
            .dlg-choice-btn > div { font-weight: bold; font-size: 18px; text-shadow: none; }
            
            /* ログ・フェード層 */
            #cm-log-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); z-index: 9500; display: flex; justify-content: center; align-items: center; pointer-events: auto; }
            .log-panel { width: 85%; max-width: 900px; height: 80%; background: var(--cm-bg-glass, rgba(255, 255, 255, 0.95)); border: none; border-radius: var(--cm-border-radius, 16px); display: flex; flex-direction: column; box-shadow: var(--cm-shadow-diffuse, 0 10px 40px rgba(0,0,0,0.15)); overflow: hidden; }
            .log-header { padding: 20px 30px; background: rgba(0, 0, 0, 0.03); border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; }
            .log-title { color: var(--cm-color-primary, #ff4b8b); font-size: 20px; font-family: var(--cm-font-bold); font-weight: 900; letter-spacing: 2px; }
            .log-close { color: #aaa; cursor: pointer; font-size: 28px; transition: 0.2s; line-height: 1; }
            .log-close:hover { color: var(--cm-color-primary, #ff4b8b); transform: scale(1.1) rotate(90deg); }
            .log-content { flex: 1; overflow-y: auto; padding: 30px; display: flex; flex-direction: column; gap: 20px; scroll-behavior: smooth; }
            .log-content::-webkit-scrollbar { width: 8px; }
            .log-content::-webkit-scrollbar-track { background: transparent; }
            .log-content::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
            .log-content::-webkit-scrollbar-thumb:hover { background: var(--cm-color-primary, #ff4b8b); }
            
            #cm-fade-screen-global { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; z-index: 10000; pointer-events: none; }
        `;
        document.head.appendChild(style);
    };

    //=========================================================================
    // 2. ログおよびタイプライターDOM操作
    //=========================================================================
    CM.toggleLog = function() {
        if (CM.UI.isCinematic || CM.UI.isTextEmpty) return; 
        CM.UI.isLogOpen = !CM.UI.isLogOpen;
        if (CM.UI.isLogOpen) { 
            CM.playSystemSe(CM.Param.seAdvance); 
            if (window.Vue) window.Vue.nextTick(() => { 
                const el = document.getElementById('cm-log-content'); 
                if (el) el.scrollTop = el.scrollHeight; 
            }); 
        } 
        else { CM.playSystemSe(CM.Param.seCancel); }
    };

    CM.prepareTypewriter = function(htmlStr) {
        if (!htmlStr) return htmlStr;
        const tempDiv = document.createElement('div'); tempDiv.innerHTML = htmlStr;
        function wrapTextNodes(node) {
            if (node.nodeType === 3) {
                const frag = document.createDocumentFragment();
                for (let char of Array.from(node.nodeValue)) { 
                    const span = document.createElement('span'); 
                    span.className = 'tw-char'; span.style.opacity = '0'; span.textContent = char; frag.appendChild(span); 
                }
                node.parentNode.replaceChild(frag, node);
            } else { Array.from(node.childNodes).forEach(wrapTextNodes); }
        }
        Array.from(tempDiv.childNodes).forEach(wrapTextNodes);
        return tempDiv.innerHTML;
    };

    CM.playTypewriter = function() {
        CM.UI.isTyping = true; 
        const chars = document.querySelectorAll("#cm-pure-text-container .tw-char");
        if (chars.length === 0) { CM.UI.isTyping = false; return; }
        gsap.killTweensOf(chars); gsap.set(chars, { opacity: 0 });
        gsap.to(chars, { opacity: 1, duration: 0.01, stagger: 0.03, ease: "none", onComplete: () => { CM.UI.isTyping = false; }});
    };

    CM.skipTyping = function() {
        if (!CM.UI.isTyping) return;
        const chars = document.querySelectorAll("#cm-pure-text-container .tw-char");
        gsap.killTweensOf(chars); gsap.set(chars, { opacity: 1 });
        CM.UI.isTyping = false;
    };

    //=========================================================================
    // 3. Vue3 アプリケーションの初期化とマウント
    //=========================================================================
    CM.initVueApp = function() {
        if (document.getElementById('cm-dialogue-vue-root')) return;
        
        const root = document.createElement('div');
        root.id = 'cm-dialogue-vue-root';
        
        root.innerHTML = `
            <div id="cm-fade-screen-global" :style="{ opacity: ui.fadeOpacity }"></div>

            <div id="cm-canvas-tracker">
                <div v-show="ui.isActive || ui.isMap" :style="{ opacity: ui.uiOpacity }" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; pointer-events: none;">
                    
                    <div class="dlg-overlay" 
                         @mousedown="advance" 
                         @touchstart.passive="advance" 
                         v-if="ui.isActive && !ui.isCinematic && !ui.isTextEmpty"
                         :style="{ pointerEvents: ui.choices.length > 0 ? 'none' : 'auto' }">
                    </div>
                    
                    <div class="cm-top-right-menu" :class="{ 'is-hidden': ui.isTextEmpty || ui.isHidden || !ui.isActive }">
                        <div class="sys-btn" :class="{ active: ui.isAutoMode }" @click.stop="toggleAuto">
                            <span v-show="ui.isAutoMode">▶</span> Auto
                        </div>
                        <div class="sys-btn" @click.stop="toggleLog">Log</div>
                        <div class="sys-btn" @click.stop="toggleHide">Hide</div>
                    </div>

                    <div id="cm-dialogue-wrapper">
                        
                        <!-- 選択肢ボックス -->
                        <div class="dlg-choices-container" v-show="ui.isActive && ui.choices.length > 0" :style="getChoiceBoxStyle">
                            <transition-group tag="div" @before-enter="onChoiceBeforeEnter" @enter="onChoiceEnter" style="display:flex;flex-direction:column;gap:12px;width:100%;align-items:flex-end;">
                                <div class="dlg-choice-btn" v-for="(c, index) in ui.choices" :key="c.html + '-' + index" :data-index="index" @click.stop="selectChoice(c, $event)"><div v-html="c.html"></div></div>
                            </transition-group>
                        </div>

                        <!-- 🌟 テキストダイアログボックス -->
                        <div class="dlg-box" 
                             :class="{ 'is-hidden': ui.isHidden, 'is-cinematic': ui.isActive && ui.isCinematic, 'is-empty-box': ui.isActive && ui.isTextEmpty }" 
                             :style="getDlgBoxStyle">
                            
                            <div class="dlg-speaker" v-show="ui.speakerName && !ui.isCinematic">
                                <span class="speaker-name">{{ ui.speakerName }}</span>
                            </div>
                            
                            <div class="dlg-text-container"><div id="cm-pure-text-container" class="dlg-text"></div></div>
                            <div class="dlg-next-icon" v-show="!ui.isTyping && ui.choices.length === 0 && !ui.isCinematic && !ui.isAutoMode">▼</div>
                        </div>
                        
                    </div>
                </div>
                
                <transition @enter="onLogEnter" @leave="onLogLeave">
                    <div id="cm-log-overlay" v-show="ui.isLogOpen" @click.self="toggleLog" @contextmenu.prevent>
                        <div class="log-panel">
                            <div class="log-header">
                                <span class="log-title">LOG</span>
                                <span class="log-close" @click="toggleLog">×</span>
                            </div>
                            <div id="cm-log-content" class="log-content" @wheel.stop @touchmove.stop @touchstart.stop>
                                <div class="log-item" v-for="(item, idx) in ui.logList" :key="idx">
                                    <div class="log-item-name" :class="item.isProtagonist ? 'name-protag' : 'name-npc'" v-if="item.speakerName">{{ item.speakerName }}</div>
                                    <div class="log-item-text" v-html="item.textHtml"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </transition>
            </div>
        `;
        document.body.appendChild(root);

        const { createApp, onMounted, onUnmounted, computed } = window.Vue || Vue;

        CM.VueApp = createApp({
            setup() {
                const ui = CM.UI;
                const toggleLog = () => CM.toggleLog();
                const toggleHide = () => { if(ui.isCinematic || ui.isTextEmpty) return; ui.isHidden = !ui.isHidden; if (ui.isHidden) CM.playSystemSe(CM.Param.seCancel); };
                const toggleAuto = () => { ui.isAutoMode = !ui.isAutoMode; };
                
                const advance = () => { 
                    if (!ui.isActive || ui.isCinematic || ui.isTextEmpty) return; 
                    if (ui.isHidden) { ui.isHidden = false; CM.playSystemSe(CM.Param.seAdvance); return; } 
                    ui.isAutoMode = false; 
                    CM.advanceDialogue(); 
                };

                // 🌟 プラグインパラメータのバインディング
                const getDlgBoxStyle = computed(() => {
                    let yOffset = ui.isHidden ? '20px' : '0px';
                    let b = CM.Param.DlgBoxBottom;
                    let w = CM.Param.DlgBoxWidth;
                    
                    if (ui.isActive && ui.isCinematic) {
                        b = '5%';
                        w = '90%';
                    }

                    return {
                        width: w,
                        left: CM.Param.DlgBoxLeft,
                        bottom: b,
                        // hidden 状態の Y 軸オフセットアニメーションもここで制御
                        transform: `translate(${CM.Param.DlgBoxTranslateX}, ${yOffset}) translateZ(0)`,
                        opacity: ui.isHidden ? 0 : 1
                    };
                });

                const getChoiceBoxStyle = computed(() => {
                    return {
                        right: CM.Param.ChoiceBoxRight,
                        bottom: CM.Param.ChoiceBoxBottom
                    };
                });
                
                const selectChoice = (c, event) => {
                    if (ui.isChoiceClicked) return;
                    ui.isChoiceClicked = true;

                    CM.playSystemSe(CM.Param.seChoice);
                    CM.State.waitFrames = 0; CM.State.waitForAnim = false;
                    
                    if (!ui.isTextEmpty) {
                        ui.logList.push({ speakerName: '', isProtagonist: true, textHtml: `<span style="color: #aaa;">> ${c.html}</span>` });
                    }

                    const allBtns = document.querySelectorAll('.dlg-choice-btn');
                    if (allBtns.length > 0) {
                        gsap.set(allBtns, { pointerEvents: "none" }); 
                        if (event && event.currentTarget) {
                            const targetEl = event.currentTarget;
                            const unselected = Array.from(allBtns).filter(btn => btn !== targetEl);
                            if (unselected.length > 0) gsap.to(unselected, { opacity: 0, x: -10, duration: 0.15, ease: "power1.in" });
                            gsap.to(targetEl, { opacity: 0, x: 15, scale: 1.05, duration: 0.25, ease: "power2.in", onComplete: () => CM.doNextNode(c.nextId) });
                        } else {
                            gsap.to(allBtns, { opacity: 0, y: 20, duration: 0.25, stagger: 0.05, ease: "power2.in", onComplete: () => CM.doNextNode(c.nextId) });
                        }
                    } else {
                        CM.doNextNode(c.nextId);
                    }
                };

                const onChoiceBeforeEnter = el => gsap.set(el, { x: 20, opacity: 0, pointerEvents: 'none' });
                const onChoiceEnter = (el, done) => { const idx = parseInt(el.dataset.index) || 0; gsap.to(el, { x: 0, opacity: 1, duration: 0.4, delay: idx * 0.05, ease: "back.out(1.2)", onComplete: () => { gsap.set(el, { clearProps: "transform,pointerEvents" }); done(); } }); };
                const onLogEnter = (el, done) => { gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, onComplete: done }); const p = el.querySelector('.log-panel'); if (p) gsap.fromTo(p, { y: 30, scale: 0.98 }, { y: 0, scale: 1, duration: 0.3, ease: "power2.out" }); };
                const onLogLeave = (el, done) => { gsap.to(el, { opacity: 0, duration: 0.2, onComplete: done }); const p = el.querySelector('.log-panel'); if (p) gsap.to(p, { y: 20, scale: 0.98, duration: 0.2, ease: "power2.in" }); };

                // キャンバストラッカー
                const syncCanvasPhysicalLayout = () => {
                    const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas');
                    const tracker = document.getElementById('cm-canvas-tracker');
                    if (!tracker || !canvas) return;

                    const rect = canvas.getBoundingClientRect();
                    const baseW = window.Graphics ? Graphics.boxWidth : 1280;
                    const baseH = window.Graphics ? Graphics.boxHeight : 720;
                    
                    const scaleX = rect.width / baseW;
                    const scaleY = rect.height / baseH;
                    
                    tracker.style.left = rect.left + 'px';
                    tracker.style.top = rect.top + 'px';
                    tracker.style.width = baseW + 'px';
                    tracker.style.height = baseH + 'px';
                    tracker.style.transform = `scale(${scaleX}, ${scaleY})`;
                };

                let resizeObserver = null;
                let fallbackTimer = null;

                onMounted(() => { 
                    gsap.to(".dlg-next-icon", { y: 6, yoyo: true, repeat: -1, duration: 0.5, ease: "sine.inOut" }); 
                    
                    syncCanvasPhysicalLayout();
                    window.addEventListener('resize', syncCanvasPhysicalLayout);
                    
                    const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas');
                    if (canvas && typeof ResizeObserver !== 'undefined') {
                        resizeObserver = new ResizeObserver(syncCanvasPhysicalLayout);
                        resizeObserver.observe(canvas);
                    }
                    fallbackTimer = setInterval(syncCanvasPhysicalLayout, 300);
                });

                onUnmounted(() => {
                    window.removeEventListener('resize', syncCanvasPhysicalLayout);
                    if (resizeObserver) resizeObserver.disconnect();
                    if (fallbackTimer) clearInterval(fallbackTimer);
                });
                
                return { 
                    ui, advance, toggleLog, toggleHide, toggleAuto, selectChoice, 
                    onChoiceBeforeEnter, onChoiceEnter, onLogEnter, onLogLeave,
                    getDlgBoxStyle, getChoiceBoxStyle
                };
            }
        }).mount(root);
    };

    //=========================================================================
    // 4. フックの登録 (Hook Registration)
    //=========================================================================
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        injectHUDStyles();
        CM.initVueApp();
    };

})();