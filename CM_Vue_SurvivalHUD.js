/*:
 * @target MZ
 * @plugindesc [v9.0.2] サバイバルHUD (1.4xスケール・3言語I18N・英語フォールバック版)
 * @author Cosmos404
 * @base CM_CoreEngine
 * @base CM_TimeSurvivalSystem
 * @orderAfter CM_TimeSurvivalSystem
 *
 * @help
 * ============================================================================
 * Survival HUD & Transition UI - Unified Architecture (1.4x + Reactive I18N)
 * * 【アーキテクチャ仕様 (v9.0.2 言語仕様最適化)】
 * 1. 完璧なI18N同期: CM_CoreEngineの window.CM_Core.I18n.reactiveState.lang 
 * を直接監視 (computed) し、ゲーム内の言語変更が即座にHUDへ反映されます。
 * 2. 組み込み多言語辞書: [ja, en, zh(簡体)] の3言語に対応。
 * 3. 安全なフォールバック: 未知の言語または取得失敗時は確実に英語(en)へ降格します。
 * ============================================================================
 */

(() => {
    "use strict";

    // グローバル状態管理オブジェクトの初期化
    window.CM_SurvivalHUD_VueState = window.CM_SurvivalHUD_VueState || { 
        sceneName: "", 
        isActionRunning: false 
    };

    //=============================================================================
    // 多言語ローカライズ辞書 (I18N Dictionary)
    // CM_CoreEngine の ConfigManager.currentLang キーに直接対応 (3言語に最適化)
    //=============================================================================
    const CM_HUD_I18N = {
        ja: { rest: "休憩", days: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"] },
        en: { rest: "Rest", days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] },
        zh: { rest: "休息", days: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] }
    };

    //=============================================================================
    // CSS Injection (統合コンテナ・左上完全固定・1.4倍スケール)
    //=============================================================================
    if (!document.getElementById('cm-survival-hud-styles')) {
        const style = document.createElement('style');
        style.id = 'cm-survival-hud-styles';
        style.innerHTML = `
            #cm-survival-hud-root {
                pointer-events: none;
            }

            .cm-hud-unified-container {
                position: absolute;
                top: 34px;
                left: 34px;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 17px;
                z-index: 100;
                pointer-events: none;
                font-family: var(--cm-font-main, sans-serif);
                perspective: 1200px;
            }

            .cm-unified-block {
                background-color: #1a1a1a;
                color: #ffffff;
                border: 4px solid #ffffff;
                padding: 11px 28px;
                font-weight: 800;
                font-size: 28px;
                letter-spacing: 1px;
                box-shadow: 6px 6px 0px #1a1a1a;
                display: flex;
                align-items: center;
                gap: 17px;
                pointer-events: auto;
            }

            .cm-date-block {
                transform-origin: center center;
                transform-style: preserve-3d;
                will-change: transform;
            }

            .cm-text-separator {
                opacity: 0.6;
                font-weight: normal;
                margin: 0 6px;
            }

            .cm-hud-phase-icon {
                font-size: 31px;
                line-height: 1;
            }

            .cm-hud-btn-rest {
                background-color: #1a1a1a; 
                color: #ffffff;
                border: 3px solid #ffffff;
                margin-left: 17px;
                padding: 6px 28px;
                font-weight: 800;
                font-size: 25px;
                cursor: pointer;
                transition: transform 0.1s ease, border-color 0.1s ease, color 0.1s ease;
                outline: none;
            }

            .cm-hud-btn-rest:active {
                transform: translate(3px, 3px);
            }

            .cm-hud-btn-rest.is-night-phase {
                color: #777777; 
                border-color: #777777;
            }

            .cm-hud-transition-overlay {
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                background-color: #1a1a1a;
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
                pointer-events: auto; 
                visibility: hidden;
                opacity: 0;
            }

            .cm-hud-anim-large-icon {
                position: absolute;
                font-size: 168px;
                visibility: hidden;
                opacity: 0;
                color: #ffffff;
            }
        `;
        document.head.appendChild(style);
    }

    //=============================================================================
    // Vue 3 Component Definition
    //=============================================================================
    const SurvivalHUDComponent = {
        template: `
            <div>
                <div class="cm-hud-unified-container" v-show="isVisible">
                    
                    <div class="cm-unified-block cm-date-block" ref="dateBlockRef">
                        <span class="cm-date-day">{{ currentDay }} Days</span>
                        <span class="cm-text-separator">|</span>
                        <span class="cm-date-weekday">{{ localizedWeekday }}</span>
                        <span class="cm-text-separator">|</span>
                        <span class="cm-hud-phase-icon">{{ phaseIcon }}</span>
                        <span class="cm-text-separator">|</span>
                        <span class="cm-info-map">{{ currentMapName }}</span>
                    </div>

                    <div class="cm-unified-block cm-info-block" v-show="!isAnimating && currentGold > 0">
                        <span class="cm-info-gold">{{ currentGold }} G</span>
                    </div>

                    <div class="cm-unified-block cm-ap-block" v-show="!isAnimating">
                        <span>AP: {{ currentAp }} / {{ maxAp }}</span>
                        <button 
                            class="cm-hud-btn-rest" 
                            :class="{ 'is-night-phase': phase === 1 }"
                            @click="handleRestAction">
                            {{ localizedRestBtn }}
                        </button>
                    </div>
                </div>

                <div class="cm-hud-transition-overlay" ref="overlayRef">
                    <div class="cm-hud-anim-large-icon" ref="sunRef">☀️</div>
                    <div class="cm-hud-anim-large-icon" ref="moonRef">🌙</div>
                </div>
            </div>
        `,
        setup() {
            const { ref, computed, onMounted, onUnmounted } = window.Vue || Vue;

            // DOM参照
            const overlayRef = ref(null);
            const sunRef = ref(null);
            const moonRef = ref(null);
            const dateBlockRef = ref(null);

            // コアデータ状態
            const currentAp = ref(3);
            const maxAp = ref(3);
            const phase = ref(0);
            const currentDay = ref(1);
            
            // 拡張データ状態
            const currentMapName = ref("");
            const currentGold = ref(0);

            // UI制御状態
            const isVisible = ref(true);
            const isAnimating = ref(false);

            // エモジアイコン
            const phaseIcon = computed(() => phase.value === 0 ? "☀️" : "🌙");

            //=========================================================================
            // 究極のリアクティブI18Nバインディング (CoreEngine直結)
            //=========================================================================
            const currentLangKey = computed(() => {
                if (window.CM_Core && window.CM_Core.I18n && window.CM_Core.I18n.reactiveState) {
                    return window.CM_Core.I18n.reactiveState.lang;
                }
                // フォールバックを 'zh' から 'en' へ変更
                return window.ConfigManager ? window.ConfigManager.currentLang : 'en';
            });

            const localizedRestBtn = computed(() => {
                const lang = currentLangKey.value || 'en';
                // 未知の言語コードが来たら en へフォールバック
                const dict = CM_HUD_I18N[lang] || CM_HUD_I18N['en'];
                return dict.rest;
            });

            const localizedWeekday = computed(() => {
                const lang = currentLangKey.value || 'en';
                // 未知の言語コードが来たら en へフォールバック
                const dict = CM_HUD_I18N[lang] || CM_HUD_I18N['en'];
                
                let dayIdx = 1;
                if (window.CM_TimeSurvival && typeof window.CM_TimeSurvival.getDayOfWeek === 'function') {
                    dayIdx = window.CM_TimeSurvival.getDayOfWeek();
                }
                return dict.days[dayIdx % 7];
            });

            /**
             * SSOTおよびネイティブゲームインスタンスからのリアルタイム同期 (非Vueデータ用)
             */
            const syncData = () => {
                const sys = $gameSystem && $gameSystem._cmSurvival;
                if (sys) {
                    currentAp.value = sys.ap;
                    maxAp.value = sys.maxAp;
                    phase.value = sys.phase;
                }
                
                if (window.CM_TimeSurvival && typeof window.CM_TimeSurvival.getTotalDays === 'function') {
                    currentDay.value = window.CM_TimeSurvival.getTotalDays();
                }

                if (window.CM_SurvivalHUD_VueState && window.CM_SurvivalHUD_VueState.sceneName) {
                    currentMapName.value = window.CM_SurvivalHUD_VueState.sceneName;
                } else if ($gameMap) {
                    currentMapName.value = $gameMap.displayName() || "???";
                }

                if ($gameParty) {
                    currentGold.value = $gameParty.gold() || 0;
                }
                
                if (SceneManager._scene && SceneManager._scene.constructor.name !== "Scene_Map") {
                    isVisible.value = false;
                } else {
                    isVisible.value = true;
                }
            };

            const handleRestAction = () => {
                if (isAnimating.value) return;

                if (phase.value === 0) {
                    if (window.CM_TimeSurvival && window.CM_TimeSurvival.restAtDaytime) {
                        window.CM_TimeSurvival.restAtDaytime();
                    }
                } else {
                    if (window.CM_Message && window.CM_Message.pushNode) {
                        const msgFile = window.CM_TimeSurvival ? window.CM_TimeSurvival.Params.msgFile : 'TimeMessages';
                        window.CM_Message.pushNode(msgFile, 99, 'system');
                    }
                }
            };

            const playTransition = (detail) => {
                if (!window.gsap) {
                    if (detail.onOpaque) detail.onOpaque();
                    return;
                }

                isAnimating.value = true;
                const tl = gsap.timeline();

                if (detail.type === "sleep" && dateBlockRef.value) {
                    tl.to(dateBlockRef.value, { rotationX: -90, duration: 0.3, ease: "power1.in" }, 0);
                }

                tl.to(overlayRef.value, { autoAlpha: 1, duration: 0.6, ease: "power2.out" }, 0);

                tl.call(() => {
                    if (detail.onOpaque) detail.onOpaque();
                    syncData(); 
                });

                if (detail.type === "rest") {
                    tl.fromTo(sunRef.value, 
                        { y: 0, autoAlpha: 1, scale: 1 }, 
                        { y: 168, autoAlpha: 0, scale: 0.8, duration: 0.8, ease: "back.in(1.5)" }
                    );
                    tl.fromTo(moonRef.value, 
                        { y: -168, autoAlpha: 0, scale: 0.8 }, 
                        { y: 0, autoAlpha: 1, scale: 1, duration: 0.8, ease: "back.out(1.5)" }, 
                        "-=0.4"
                    );
                } else if (detail.type === "sleep") {
                    tl.fromTo(moonRef.value, 
                        { y: 0, autoAlpha: 1, scale: 1 }, 
                        { y: 168, autoAlpha: 0, scale: 0.8, duration: 0.8, ease: "back.in(1.5)" }
                    );
                    tl.fromTo(sunRef.value, 
                        { y: -168, autoAlpha: 0, scale: 0.8 }, 
                        { y: 0, autoAlpha: 1, scale: 1, duration: 0.8, ease: "back.out(1.5)" }, 
                        "-=0.4"
                    );
                    
                    if (dateBlockRef.value) {
                        tl.to(dateBlockRef.value, { rotationX: 0, duration: 0.6, ease: "back.out(1.5)" }, "-=0.4");
                    }
                }

                tl.to({}, { duration: 0.4 }); 

                tl.to([sunRef.value, moonRef.value], { autoAlpha: 0, duration: 0.2 });
                tl.to(overlayRef.value, { 
                    autoAlpha: 0, 
                    duration: 0.6, 
                    ease: "power2.in",
                    onComplete: () => {
                        isAnimating.value = false;
                    }
                });
            };

            const onAnimationRequest = (e) => {
                if (e.detail) playTransition(e.detail);
            };

            let syncInterval = null;

            onMounted(() => {
                syncData();
                syncInterval = setInterval(syncData, 100);
                document.addEventListener("CM_TimeSurvival:RequestAnimation", onAnimationRequest);
            });

            onUnmounted(() => {
                if (syncInterval) clearInterval(syncInterval);
                document.removeEventListener("CM_TimeSurvival:RequestAnimation", onAnimationRequest);
            });

            return { 
                overlayRef, sunRef, moonRef, dateBlockRef, 
                currentAp, maxAp, phase, currentDay, localizedWeekday, localizedRestBtn,
                currentMapName, currentGold,
                phaseIcon, isVisible, isAnimating, handleRestAction 
            };
        }
    };

    //=============================================================================
    // 自己マウント・ライフサイクル・ハイジャック
    //=============================================================================
    
    Scene_Map.prototype.mountSurvivalHUD = function() {
        let uiContainer = document.getElementById('cm-survival-hud-root');
        if (uiContainer) uiContainer.remove();

        uiContainer = document.createElement('div');
        uiContainer.id = 'cm-survival-hud-root';
        uiContainer.className = 'cm-sandbox-root'; 
        document.body.appendChild(uiContainer);

        this._survivalHUDApp = window.Vue.createApp(SurvivalHUDComponent);
        this._survivalHUDApp.mount(uiContainer);
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        this.mountSurvivalHUD();
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        if (this._survivalHUDApp) {
            this._survivalHUDApp.unmount(); 
            this._survivalHUDApp = null;
            const el = document.getElementById('cm-survival-hud-root');
            if (el) el.remove();
        }
        _Scene_Map_terminate.call(this);
    };

})();