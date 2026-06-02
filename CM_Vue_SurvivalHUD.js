/*:
 * @target MZ
 * @plugindesc [v8.4.0] サバイバルHUD & トランジション (独立サンドボックス自己マウント・曜日カレンダー実装版)
 * @author Cosmos404
 * @base CM_CoreEngine
 * @base CM_TimeSurvivalSystem
 * @orderAfter CM_TimeSurvivalSystem
 * * @help
 * ============================================================================
 * Survival HUD & Transition UI - Self Mounting Architecture
 * * 【アーキテクチャ仕様 (v8.4.0)】
 * 1. 独立ライフサイクル: Scene_Map 開始時に自律的に .cm-sandbox-root を構築。
 * 2. 座標系の固定化: プラグイン内部のCSSにて、画面上部中央と右上に完全固定。
 * 3. 3Dフリップカレンダー: GSAPによるトランジションに連動し、データ同期(SSOT)
 * とDOM更新のタイミングを厳密に制御したX軸回転アニメーションを実装。
 * ============================================================================
 */

(() => {
    "use strict";

    //=============================================================================
    // CSS Injection (トップセンター固定 & 右上カレンダー)
    //=============================================================================
    if (!document.getElementById('cm-survival-hud-styles')) {
        const style = document.createElement('style');
        style.id = 'cm-survival-hud-styles';
        style.innerHTML = `
            #cm-survival-hud-root {
                pointer-events: none;
            }

            .cm-survival-hud-panel {
                position: absolute;
                top: 24px;
                left: 50%;
                transform: translateX(-50%) translateZ(0);
                display: flex;
                align-items: center;
                gap: 16px;
                font-family: var(--cm-font-main, sans-serif);
                pointer-events: auto; 
                z-index: 100;
                will-change: transform;
            }
            
            .cm-ap-display-block {
                background-color: #ffffff;
                color: #1a1a1a;
                border: 3px solid #1a1a1a;
                padding: 8px 16px;
                font-weight: 800;
                font-size: 20px;
                letter-spacing: 1px;
                box-shadow: 4px 4px 0px #1a1a1a; 
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .cm-hud-phase-icon {
                font-size: 22px;
                line-height: 1;
            }

            .cm-hud-btn-rest {
                background-color: #FFD54F; 
                color: #1a1a1a;
                border: 3px solid #1a1a1a;
                padding: 8px 24px;
                font-weight: 800;
                font-size: 18px;
                cursor: pointer;
                box-shadow: 4px 4px 0px #1a1a1a;
                transition: transform 0.1s ease, box-shadow 0.1s ease;
                outline: none;
            }

            .cm-hud-btn-rest:active {
                transform: translate(4px, 4px);
                box-shadow: 0px 0px 0px #1a1a1a;
            }

            .cm-hud-btn-rest.is-night-phase {
                background-color: #9E9E9E; 
            }

            /* 右上カレンダー (3Dフリップ対応・トランジション暗幕貫通) */
            .cm-survival-date-panel {
                position: absolute;
                top: 24px;
                right: 32px;
                z-index: 10000; 
                pointer-events: none;
                perspective: 1200px;
                font-family: var(--cm-font-main, sans-serif);
            }

            .cm-date-display-block {
                background-color: #1a1a1a;
                color: #ffffff;
                border: 3px solid #ffffff;
                padding: 8px 20px;
                font-weight: 800;
                font-size: 20px;
                letter-spacing: 1px;
                box-shadow: 4px 4px 0px #1a1a1a;
                display: flex;
                align-items: center;
                gap: 12px;
                transform-origin: center center;
                transform-style: preserve-3d;
                will-change: transform;
            }

            .cm-date-separator {
                opacity: 0.6;
                font-weight: normal;
            }

            /* フルスクリーン暗幕・日月アニメーションレイヤー */
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
                font-size: 120px;
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
                <div class="cm-survival-hud-panel" v-show="isVisible && !isAnimating">
                    <div class="cm-ap-display-block">
                        <span class="cm-hud-phase-icon">{{ phaseIcon }}</span>
                        <span>AP: {{ currentAp }} / {{ maxAp }}</span>
                    </div>
                    
                    <button 
                        class="cm-hud-btn-rest" 
                        :class="{ 'is-night-phase': phase === 1 }"
                        @click="handleRestAction">
                        休息
                    </button>
                </div>

                <div class="cm-survival-date-panel" v-show="isVisible">
                    <div class="cm-date-display-block" ref="dateBlockRef">
                        <span class="cm-date-day">{{ currentDay }} Days</span>
                        <span class="cm-date-separator">|</span>
                        <span class="cm-date-weekday">{{ currentWeekday }}</span>
                    </div>
                </div>

                <div class="cm-hud-transition-overlay" ref="overlayRef">
                    <div class="cm-hud-anim-large-icon" ref="sunRef">☀</div>
                    <div class="cm-hud-anim-large-icon" ref="moonRef">🌙</div>
                </div>
            </div>
        `,
        setup() {
            const { ref, computed, onMounted, onUnmounted } = window.Vue || Vue;

            // DOMリファレンス
            const overlayRef = ref(null);
            const sunRef = ref(null);
            const moonRef = ref(null);
            const dateBlockRef = ref(null);

            // コアデータ同期ステート
            const currentAp = ref(3);
            const maxAp = ref(3);
            const phase = ref(0);
            const currentDay = ref(1);
            const currentWeekday = ref("");
            const isVisible = ref(true);
            const isAnimating = ref(false);

            const phaseIcon = computed(() => phase.value === 0 ? "☀" : "🌙");

            // SSOT 唯一の事実のソースからのリアルタイムサンプリング
            const syncData = () => {
                const sys = $gameSystem && $gameSystem._cmSurvival;
                if (sys) {
                    currentAp.value = sys.ap;
                    maxAp.value = sys.maxAp;
                    phase.value = sys.phase;
                }
                
                // カレンダーデータの同期
                if (window.CM_TimeSurvival && typeof window.CM_TimeSurvival.getTotalDays === 'function') {
                    currentDay.value = window.CM_TimeSurvival.getTotalDays();
                    currentWeekday.value = window.CM_TimeSurvival.getWeekdayText(window.CM_TimeSurvival.getDayOfWeek());
                }
                
                // Scene_Map 以外でのHUD描画を安全にクランプ
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

            // GSAP タイムライン制御 (Matrix Collapse Prevention & 3D Flip)
            const playTransition = (detail) => {
                if (!window.gsap) {
                    if (detail.onOpaque) detail.onOpaque();
                    return;
                }

                isAnimating.value = true;
                const tl = gsap.timeline();

                // 0. 就寝時(夜->昼)はトランジション開始と同時にカレンダーのフリップアウトを開始
                if (detail.type === "sleep" && dateBlockRef.value) {
                    tl.to(dateBlockRef.value, { rotationX: -90, duration: 0.3, ease: "power1.in" }, 0);
                }

                // 1. ソリッドな暗幕のフェードイン
                tl.to(overlayRef.value, { autoAlpha: 1, duration: 0.6, ease: "power2.out" }, 0);

                // 2. 遮蔽完了タイミングでのデータ整合性コミット
                tl.call(() => {
                    if (detail.onOpaque) detail.onOpaque();
                    syncData(); // フリップの裏側(不可視状態)で安全にVueのDOMデータを最新化
                });

                // 3. セルルック演出（Y軸の直線運動による降下/上昇とカレンダーフリップイン）
                if (detail.type === "rest") {
                    tl.fromTo(sunRef.value, 
                        { y: 0, autoAlpha: 1, scale: 1 }, 
                        { y: 120, autoAlpha: 0, scale: 0.8, duration: 0.8, ease: "back.in(1.5)" }
                    );
                    tl.fromTo(moonRef.value, 
                        { y: -120, autoAlpha: 0, scale: 0.8 }, 
                        { y: 0, autoAlpha: 1, scale: 1, duration: 0.8, ease: "back.out(1.5)" }, 
                        "-=0.4"
                    );
                } else if (detail.type === "sleep") {
                    tl.fromTo(moonRef.value, 
                        { y: 0, autoAlpha: 1, scale: 1 }, 
                        { y: 120, autoAlpha: 0, scale: 0.8, duration: 0.8, ease: "back.in(1.5)" }
                    );
                    tl.fromTo(sunRef.value, 
                        { y: -120, autoAlpha: 0, scale: 0.8 }, 
                        { y: 0, autoAlpha: 1, scale: 1, duration: 0.8, ease: "back.out(1.5)" }, 
                        "-=0.4"
                    );
                    
                    // 新しい日付データでカレンダーを正面へフリップイン
                    if (dateBlockRef.value) {
                        tl.to(dateBlockRef.value, { rotationX: 0, duration: 0.6, ease: "back.out(1.5)" }, "-=0.4");
                    }
                }

                tl.to({}, { duration: 0.4 }); 

                // 4. 残像クリーンアップとフェードアウト
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
                syncData(); // 初回即時同期
                syncInterval = setInterval(syncData, 100);
                document.addEventListener("CM_TimeSurvival:RequestAnimation", onAnimationRequest);
            });

            onUnmounted(() => {
                if (syncInterval) clearInterval(syncInterval);
                document.removeEventListener("CM_TimeSurvival:RequestAnimation", onAnimationRequest);
            });

            return { overlayRef, sunRef, moonRef, dateBlockRef, currentAp, maxAp, phase, currentDay, currentWeekday, phaseIcon, isVisible, isAnimating, handleRestAction };
        }
    };

    //=============================================================================
    // 自己マウント・ライフサイクル・ハイジャック (Self-Mount Lifecycle Hooks)
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