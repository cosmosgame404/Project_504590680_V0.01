/*:
 * @target MZ
 * @plugindesc [v7.4.0] Vue3 サバイバルHUD (縦型ネオンカプセル・固定グラデーション展開版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 * @base CM_TimeSurvivalSystem
 * @orderAfter CM_TimeSurvivalSystem
 *
 * @help
 * ============================================================================
 * 🌌 ハイブリッドレンダリング - サバイバルHUD (V7.4)
 *
 * 【アーキテクチャ更新 (v7.4)】
 * 1. 【縦型ネオンカプセル (Vertical Neon Capsule)】:
 * TPゲージを再び縦型レイアウトへ回帰。CSSの border-radius と box-shadow
 * を駆使し、ネオンピンクに発光するサイバーパンク風のガラス管を構築しました。
 * 2. 【Clip-Path グラデーション展開 (Fixed Gradient Reveal)】:
 * 内部の液体は 0deg の固定線形グラデーション (ピンク->紫->赤) を保持し、
 * CSS clip-path: inset() プロパティと GSAP を連動させることで、
 * 色が圧縮されることなく、下から上へ「液面が上昇して色が露出する」
 * ピクセルパーフェクトな充填アニメーションを実現しています。
 * 3. 【フレックス・レスポンシブ (Flex Responsive)】:
 * 数値(上)・カプセル(中)・ハート(下) の縦配列。カプセル部分は flex: 1 で
 * コンテナの高さに応じて自動伸縮します。
 * ============================================================================
 */

(() => {
    "use strict";

    const Core = window.CM_Core;
    if (!Core) {
        console.error("[CM_Vue_SurvivalHUD] CM_CoreEngine.js がロードされていません。");
        return;
    }

    const survivalParams = PluginManager.parameters("CM_TimeSurvivalSystem");
    const VAR_TICK = Number(survivalParams['tickVarId'] || 13);
    const VAR_DAY = Number(survivalParams['dayVarId'] || 14);

    const HUD_DICT = {
        ja: {
            dayPrefix: "第", daySuffix: "日",
            dayName: "昼間", nightName: "夜間",
            location: "現在地", hp: "体力", mp: "気力",
            actionRunning: "行動進行中..."
        },
        en: {
            dayPrefix: "Day ", daySuffix: "",
            dayName: "Day", nightName: "Night",
            location: "Location", hp: "HP", mp: "SP",
            actionRunning: "In Progress..."
        },
        zh: {
            dayPrefix: "第", daySuffix: "天",
            dayName: "白天", nightName: "夜晚",
            location: "所在位置", hp: "生命", mp: "精力",
            actionRunning: "行动进行中..."
        }
    };

    //=============================================================================
    // 1. CSS インジェクション (動的スケーリング & 縦型ネオンカプセル)
    //=============================================================================
    const injectHUDStyles = () => {
        if (document.getElementById('cm-survival-hud-style')) return;

        const style = document.createElement('style');
        style.id = 'cm-survival-hud-style';
        style.innerHTML = `
            #cm-vue-survival-app {
                position: absolute; top: 0; left: 0; width: 100vw; height: 100vh;
                pointer-events: none; overflow: hidden;
                display: flex; justify-content: center; align-items: center;
                z-index: 9000;
            }

            #cm-survival-wrapper {
                position: relative; width: 1280px; height: 720px;
                transform-origin: center; pointer-events: none;
            }

            .panel-time-box { position: absolute; display: flex; flex-direction: column; justify-content: center; padding: 12px 20px; }
            .panel-left-mount { position: absolute; display: flex; flex-direction: column; overflow: hidden; background: transparent; border: none; }
            .panel-top { position: absolute; display: flex; justify-content: flex-start; align-items: center; padding: 0 24px; }
            .panel-bottom-right { position: absolute; display: flex; flex-direction: column; justify-content: center; padding: 0 24px; gap: 10px; }

            .panel-tp-box {
                position: absolute;
                display: flex; justify-content: center; align-items: center;
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                backdrop-filter: none !important;
                overflow: visible !important;
            }

            /* --- Typography & Basics --- */
            .info-group { display: flex; align-items: baseline; gap: 16px; }
            .cm-label { font-size: 16px; font-weight: normal; color: var(--cm-color-text-muted); letter-spacing: 1px; }
            .cm-value { font-size: 20px; font-family: var(--cm-font-bold); color: var(--cm-color-text-main); text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4); }
            
            .status-row { display: flex; justify-content: space-between; align-items: baseline; }
            .status-row .val { font-size: 20px; font-family: var(--cm-font-bold); color: var(--cm-color-text-main); }
            .val.danger { color: var(--cm-color-danger); text-shadow: 0 2px 6px rgba(255, 59, 59, 0.5); }
            .val.mp-cyan { color: var(--cm-color-secondary); text-shadow: 0 2px 6px rgba(0, 242, 254, 0.3); }

            @keyframes elegantPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
            .action-running-text { font-size: 18px; font-family: var(--cm-font-bold); animation: elegantPulse 2s infinite ease-in-out; }

            /* --- 12刻数プログレスバー --- */
            .tick-bar-container {
                width: 100%; height: 12px; background: rgba(0, 0, 0, 0.3);
                border-radius: 6px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);
                margin-top: 8px; position: relative;
            }
            .tick-bar-fill {
                height: 100%; width: 0%; transition: width 0.4s cubic-bezier(0.23, 1, 0.32, 1);
            }
            .phase-info { display: flex; align-items: center; gap: 8px; font-family: var(--cm-font-bold); font-size: 18px; }
            .theme-day { color: #ffca28; } .theme-night { color: #9fa8da; }
            .fill-day { background: linear-gradient(90deg, #ff9800, #ffca28); box-shadow: 0 0 10px rgba(255, 152, 0, 0.5); }
            .fill-night { background: linear-gradient(90deg, #3949ab, #9fa8da); box-shadow: 0 0 10px rgba(92, 107, 192, 0.5); }

            /* ==================================================================
               Dynamic Responsive Pleasure Gauge (V7.4 縦型ネオンカプセル版)
               ================================================================== */
            
            .tp-vertical-container {
                display: flex;
                flex-direction: column; /* 縦方向レイアウト */
                align-items: center;
                height: 100%;
                width: 100%;
                gap: 12px;
                position: relative;
            }

            /* --- 1. 上段：動的数値 --- */
            .tp-numeric-value {
                font-family: var(--cm-font-bold);
                font-size: 28px;
                color: #ff66cc; /* ネオンピンク */
                text-shadow: 
                    0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000,
                    0 0 12px rgba(255, 102, 204, 0.8), 0 0 20px rgba(255, 102, 204, 0.6);
                line-height: 1;
                flex-shrink: 0;
            }

            /* --- 2. 中段：ネオンカプセル (フレックス伸縮) --- */
            .tp-capsule-wrapper {
                flex: 1; /* 余った高さを全て占有 */
                width: 30px; /* カプセルの太さ */
                border-radius: 999px; /* 完全なカプセル形状 */
                border: 2px solid #ff66cc; /* ピンクの境界線 */
                background: rgba(10, 5, 15, 0.6); /* 暗い内部 */
                box-shadow: 
                    0 0 15px rgba(255, 102, 204, 0.6), /* 外側のネオン光 */
                    inset 0 0 10px rgba(255, 102, 204, 0.3); /* 内側の反射光 */
                position: relative;
                overflow: hidden; /* 中身がカプセル外に溢れないように */
            }

            /* --- 固定グラデーション＆クリップマスク (方案Bの中核) --- */
            .tp-capsule-fill {
                position: absolute;
                bottom: 0; left: 0; right: 0; top: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(0deg, #ff66cc 0%, #b366ff 50%, #ff0066 100%);
                /* クリップマスク：上(top)を削ることで、下から湧き上がるように見せる */
                /* clip-path: inset(100% 0 0 0) = 0%表示, inset(0% 0 0 0) = 100%表示 */
                will-change: clip-path;
            }

            /* カプセルの立体感ハイライト */
            .tp-capsule-glare {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                background: linear-gradient(
                    to right,
                    rgba(255, 255, 255, 0.6) 0%,
                    rgba(255, 255, 255, 0.1) 20%,
                    transparent 40%,
                    transparent 70%,
                    rgba(0, 0, 0, 0.4) 100%
                );
            }

            /* --- 3. 下段：線画ハートアイコン --- */
            .tp-outline-heart {
                width: 32px;
                height: 32px;
                flex-shrink: 0;
                filter: drop-shadow(0 0 6px rgba(255, 102, 204, 0.8));
                animation: gentleHeartbeat 1.5s ease-in-out infinite;
                margin-top: -4px; /* カプセルに少し寄せる */
            }

            @keyframes gentleHeartbeat {
                0% { transform: scale(1); }
                20% { transform: scale(1.15); }
                40% { transform: scale(1); }
                100% { transform: scale(1); }
            }

            /* --- 4. 粒子エフェクト --- */
            .cm-pixel-particle {
                position: absolute;
                width: 6px; height: 6px;
                background: #ff66cc;
                box-shadow: 0 0 8px rgba(255, 102, 204, 0.8);
                pointer-events: none;
                z-index: 25;
            }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.id = 'cm-vue-survival-app';
        container.innerHTML = `
            <div id="cm-survival-wrapper" :style="{ zIndex: layout.timeBox ? layout.timeBox.zIndex : 100 }">
                <transition name="fade">
                    <div v-show="isVisible" style="width: 100%; height: 100%; position: absolute;">
                        
                        <div class="cm-glass-panel panel-time-box" ref="timeBoxRef" :style="layout.timeBox">
                            <div v-if="!isActionRunning">
                                <div class="phase-info" :class="isNight ? 'theme-night' : 'theme-day'">
                                    <span>{{ isNight ? '🌙' : '☀️' }}</span>
                                    <span>{{ tDict('dayPrefix') }}{{ day }}{{ tDict('daySuffix') }} · {{ isNight ? tDict('nightName') : tDict('dayName') }}</span>
                                </div>
                                <div class="tick-bar-container">
                                    <div class="tick-bar-fill" :class="isNight ? 'fill-night' : 'fill-day'" :style="{ width: tickProgress + '%' }"></div>
                                </div>
                            </div>
                            <div v-else class="action-running-text cm-label">
                                {{ tDict('actionRunning') }}
                            </div>
                        </div>

                        <div class="panel-left-mount" ref="leftPanelRef" id="cm-log-frame-mount" :style="layout.leftPanel"></div>

                        <div class="cm-glass-panel panel-top" ref="topBarRef" :style="layout.topBar">
                            <div class="info-group">
                                <span class="cm-label">{{ tDict('location') }}</span>
                                <span class="cm-value">{{ tCore(sceneName) }}</span>
                            </div>
                        </div>

                        <div class="cm-glass-panel panel-bottom-right" ref="bottomRightRef" :style="layout.statusBox">
                            <div class="status-row">
                                <span class="cm-label">{{ tDict('hp') }}</span>
                                <span class="val" :class="{'danger': hpRatio <= 0.2}">{{ hp }} / {{ mhp }}</span>
                            </div>
                            <div class="status-row">
                                <span class="cm-label">{{ tDict('mp') }}</span>
                                <span class="val mp-cyan">{{ mp }} / {{ mmp }}</span>
                            </div>
                        </div>

                        <div class="panel-tp-box" ref="tpBoxRef" :style="layout.tpBox">
                            <div class="tp-vertical-container" id="tp-particle-container">
                                
                                <div class="tp-numeric-value">{{ Math.floor(tp) }}</div>
                                
                                <div class="tp-capsule-wrapper" id="tp-capsule-node">
                                    <div class="tp-capsule-fill" :style="{ clipPath: 'inset(' + (100 - tpRevealPercent) + '% 0 0 0)' }"></div>
                                    <div class="tp-capsule-glare"></div>
                                </div>

                                <svg class="tp-outline-heart" viewBox="0 0 24 24" fill="none" stroke="#ff66cc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>

                            </div>
                        </div>

                    </div>
                </transition>
            </div>
        `;
        document.body.appendChild(container);
        window.addEventListener('resize', updateLayout);
    };

    const updateLayout = () => {
        const wrapper = document.getElementById('cm-survival-wrapper');
        if (!wrapper) return;
        const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        wrapper.style.transform = `scale(${scale})`;
    };

    //=============================================================================
    // 2. Vue3 初期化 & ロジック
    //=============================================================================
    const initVueApp = () => {
        if (!window.Vue || window.CM_SurvivalHUD_VueState) return;

        const { createApp, reactive, computed, watch, ref, nextTick } = Vue;

        const hudState = reactive({
            isVisible: false,
            isActionRunning: false,
            tick: 0, day: 1,
            hp: 100, mhp: 100,
            mp: 100, mmp: 100,
            tp: 0, mtp: 100,
            sceneName: ""
        });
        
        window.CM_SurvivalHUD_VueState = hudState;

        createApp({
            setup() {
                const timeBoxRef = ref(null);
                const leftPanelRef = ref(null);
                const topBarRef = ref(null);
                const bottomRightRef = ref(null);
                const tpBoxRef = ref(null);

                const layoutState = computed(() => {
                    if (Core && Core.UILayout && Core.UILayout.reactiveState) return Core.UILayout.reactiveState.config;
                    return Core.UILayout.defaults;
                });

                const currentLang = computed(() => {
                    let lang = 'ja';
                    if (Core && Core.I18n && Core.I18n.reactiveState) lang = Core.I18n.reactiveState.lang || 'ja';
                    else if (window.ConfigManager && window.ConfigManager.currentLang) lang = window.ConfigManager.currentLang;
                    return HUD_DICT[lang] ? lang : 'ja';
                });

                const tDict = (key) => HUD_DICT[currentLang.value][key] || "";
                const tCore = (path) => (Core && path) ? Core.I18n.translate(path) : path;

                // --- 12刻数ロジック ---
                const isNight = computed(() => hudState.tick >= 12);
                const tickProgress = computed(() => {
                    const phaseTick = hudState.tick % 12;
                    return (phaseTick / 12) * 100;
                });

                const hpRatio = computed(() => hudState.mhp > 0 ? hudState.hp / hudState.mhp : 0);
                const tpRatio = computed(() => {
                    let ratio = hudState.mtp > 0 ? hudState.tp / hudState.mtp : 0;
                    return Math.min(Math.max(ratio, 0), 1); 
                });

                // --- TP アニメーション (Inset マスク用パーセンテージ) ---
                // 0 = 液体なし(クリップ100%), 100 = 満タン(クリップ0%)
                const tpRevealPercent = ref(0); 

                watch(() => tpRatio.value, (newVal) => {
                    if (window.gsap) {
                        gsap.to(tpRevealPercent, { 
                            value: newVal * 100, 
                            duration: 0.4, 
                            ease: "power2.out", 
                            overwrite: "auto" 
                        });
                    } else {
                        tpRevealPercent.value = newVal * 100;
                    }
                });

                // --- バースト・パーティクル・エンジン (縦向き適応) ---
                const spawnBurstEmission = () => {
                    if (!hudState.isVisible || !window.gsap) return;
                    
                    const wrapperEl = document.getElementById('tp-capsule-node');
                    const containerEl = document.getElementById('tp-particle-container');
                    if (!wrapperEl || !containerEl) return;

                    const wrapperRect = wrapperEl.getBoundingClientRect();
                    const containerRect = containerEl.getBoundingClientRect();
                    
                    // 液面のY座標を算出 (下から上に伸びるため、100% から引く)
                    const liquidTopY = wrapperRect.height * (1 - (tpRevealPercent.value / 100));
                    
                    const baseStartX = (wrapperRect.left - containerRect.left) + (wrapperRect.width / 2);
                    const baseStartY = (wrapperRect.top - containerRect.top) + liquidTopY;

                    const count = Math.floor(Math.random() * 4) + 5; 
                    
                    for (let i = 0; i < count; i++) {
                        const particle = document.createElement('div');
                        particle.className = 'cm-pixel-particle';
                        particle.style.backgroundColor = Math.random() > 0.6 ? '#ffffff' : '#ff66cc';
                        containerEl.appendChild(particle);

                        // 基点からランダムに散らす
                        const startX = baseStartX + (Math.random() * 16 - 8); 
                        const startY = baseStartY + (Math.random() * 8 - 4); 

                        gsap.set(particle, { x: startX, y: startY, opacity: 1, scale: Math.random() * 0.5 + 0.5 });
                        
                        // 上方向へ噴射
                        gsap.to(particle, {
                            y: startY - (Math.random() * 40 + 20),
                            x: startX + (Math.random() * 20 - 10), 
                            opacity: 0,
                            duration: Math.random() * 0.4 + 0.4,
                            ease: "power1.out", 
                            onComplete: () => { if (particle.parentNode) particle.parentNode.removeChild(particle); }
                        });
                    }
                };

                watch(() => hudState.tp, (newTp, oldTp) => {
                    if (newTp > oldTp && hudState.isVisible) {
                        nextTick(() => spawnBurstEmission());
                    }
                });

                watch(() => hudState.isVisible, (val) => {
                    if (val && window.gsap) {
                        gsap.fromTo(timeBoxRef.value, { opacity: 0, x: -15 }, { opacity: 1, x: 0, duration: 0.8, ease: "power3.out" });
                        gsap.fromTo(topBarRef.value, { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.1 });
                        gsap.fromTo(bottomRightRef.value, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.2 });
                        gsap.fromTo(tpBoxRef.value, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "back.out(1.2)", delay: 0.3 });
                    }
                });

                return { 
                    ...Vue.toRefs(hudState), layout: layoutState,
                    isNight, tickProgress, hpRatio, tpRatio, tpRevealPercent,
                    timeBoxRef, leftPanelRef, topBarRef, bottomRightRef, tpBoxRef,
                    tDict, tCore
                };
            }
        }).mount('#cm-vue-survival-app');
    };

    //=============================================================================
    // 3. RMMZ Hook 同期
    //=============================================================================
    const _Game_Actor_refresh = Game_Actor.prototype.refresh;
    Game_Actor.prototype.refresh = function() {
        _Game_Actor_refresh.call(this);
        if (this.actorId() === 1 && window.CM_SurvivalHUD_VueState) {
            const state = window.CM_SurvivalHUD_VueState;
            state.hp = this.hp; state.mhp = this.mhp;
            state.mp = this.mp; state.mmp = this.mmp;
            state.tp = this.tp; state.mtp = this.maxTp(); 
        }
    };

    const _Game_Variables_setValue = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function(variableId, value) {
        _Game_Variables_setValue.call(this, variableId, value);
        if (window.CM_SurvivalHUD_VueState) {
            if (variableId === VAR_TICK) window.CM_SurvivalHUD_VueState.tick = value;
            if (variableId === VAR_DAY) window.CM_SurvivalHUD_VueState.day = value;
        }
    };

    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        _Scene_Map_onMapLoaded.call(this);
        if (window.CM_SurvivalHUD_VueState) {
            const actor = $gameActors.actor(1);
            if (actor) {
                const state = window.CM_SurvivalHUD_VueState;
                state.hp = actor.hp; state.mhp = actor.mhp;
                state.mp = actor.mp; state.mmp = actor.mmp;
                state.tp = actor.tp; state.mtp = actor.maxTp(); 
            }
            window.CM_SurvivalHUD_VueState.tick = $gameVariables.value(VAR_TICK);
            window.CM_SurvivalHUD_VueState.day = $gameVariables.value(VAR_DAY);
            window.CM_SurvivalHUD_VueState.sceneName = $dataMap ? $dataMap.displayName : "";
            
            window.CM_SurvivalHUD_VueState.isVisible = true;
            window.CM_SurvivalHUD_VueState.isActionRunning = false; 
        }
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        _Scene_Map_terminate.call(this);
        if (window.CM_SurvivalHUD_VueState) window.CM_SurvivalHUD_VueState.isVisible = false;
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        injectHUDStyles();
        initVueApp();
        updateLayout();
    };

})();