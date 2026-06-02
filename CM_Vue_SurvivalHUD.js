/*:
 * @target MZ
 * @plugindesc [v8.5.0] サバイバルHUD & トランジション (統合型UI・座標左上固定・SSOT拡張版)
 * @author Cosmos404
 * @base CM_CoreEngine
 * @base CM_TimeSurvivalSystem
 * @orderAfter CM_TimeSurvivalSystem
 *
 * @help
 * ============================================================================
 * Survival HUD & Transition UI - Unified Architecture
 * * 【アーキテクチャ仕様 (v8.5.0 統合更新)】
 * 1. 統合座標系: 全てのHUD要素(日付、マップ名、所持金、AP)を左上(top/left)の
 * 統合コンテナに集約し、Flexboxによる垂直レイアウトへ再構築。
 * 2. ノイズレスUI原則: 全ノードの配色を黒背景(#1a1a1a)・白文字・白ボーダーの
 * 高コントラストソリッドブロックへ統一。視覚的ノイズを徹底排除。
 * 3. ネイティブデータ層との疎結合: マップ名(displayName)および所持金(gold)を
 * SSOTの同期サイクル内で安全に取得し、ライフサイクルを汚染せずに描画。
 * ============================================================================
 */

(() => {
    "use strict";

    //=============================================================================
    // CSS Injection (統合コンテナ・左上完全固定)
    //=============================================================================
    if (!document.getElementById('cm-survival-hud-styles')) {
        const style = document.createElement('style');
        style.id = 'cm-survival-hud-styles';
        style.innerHTML = `
            #cm-survival-hud-root {
                pointer-events: none;
            }

            /* 左上統合コンテナ */
            .cm-hud-unified-container {
                position: absolute;
                top: 24px;
                left: 24px;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 12px;
                z-index: 100;
                pointer-events: none;
                font-family: var(--cm-font-main, sans-serif);
                perspective: 1200px;
            }

            /* 共通ソリッドブロック (ノイズレスUI原則適用) */
            .cm-unified-block {
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
                pointer-events: auto;
            }

            /* 日付専用プロパティ (3Dフリップマトリクス維持) */
            .cm-date-block {
                transform-origin: center center;
                transform-style: preserve-3d;
                will-change: transform;
            }

            /* テキスト区切り用セパレータ */
            .cm-text-separator {
                opacity: 0.6;
                font-weight: normal;
                margin: 0 4px;
            }

            .cm-hud-phase-icon {
                font-size: 22px;
                line-height: 1;
            }

            /* 休息ボタン (共通ブロック内包・黒底白枠) */
            .cm-hud-btn-rest {
                background-color: #1a1a1a; 
                color: #ffffff;
                border: 2px solid #ffffff;
                margin-left: 12px;
                padding: 4px 20px;
                font-weight: 800;
                font-size: 18px;
                cursor: pointer;
                transition: transform 0.1s ease, border-color 0.1s ease, color 0.1s ease;
                outline: none;
            }

            .cm-hud-btn-rest:active {
                transform: translate(2px, 2px);
            }

            .cm-hud-btn-rest.is-night-phase {
                color: #777777; 
                border-color: #777777;
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
                <div class="cm-hud-unified-container" v-show="isVisible">
                    
                    <div class="cm-unified-block cm-date-block" ref="dateBlockRef">
                        <span class="cm-date-day">{{ currentDay }} Days</span>
                        <span class="cm-text-separator">|</span>
                        <span class="cm-date-weekday">{{ currentWeekday }}</span>
                    </div>

                    <div class="cm-unified-block cm-info-block" v-show="!isAnimating">
                        <span class="cm-info-map">{{ currentMapName }}</span>
                        <span class="cm-text-separator">|</span>
                        <span class="cm-info-gold">{{ currentGold }} G</span>
                    </div>

                    <div class="cm-unified-block cm-ap-block" v-show="!isAnimating">
                        <span class="cm-hud-phase-icon">{{ phaseIcon }}</span>
                        <span>AP: {{ currentAp }} / {{ maxAp }}</span>
                        <button 
                            class="cm-hud-btn-rest" 
                            :class="{ 'is-night-phase': phase === 1 }"
                            @click="handleRestAction">
                            休息
                        </button>
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

            // DOM参照
            const overlayRef = ref(null);
            const sunRef = ref(null);
            const moonRef = ref(null);
            const dateBlockRef = ref(null);

            // コアデータステート
            const currentAp = ref(3);
            const maxAp = ref(3);
            const phase = ref(0);
            const currentDay = ref(1);
            const currentWeekday = ref("");
            
            // 新規拡張ステート (ネイティブデータ層からの非侵襲的抽出)
            const currentMapName = ref("");
            const currentGold = ref(0);

            // UI制御ステート
            const isVisible = ref(true);
            const isAnimating = ref(false);

            const phaseIcon = computed(() => phase.value === 0 ? "☀" : "🌙");

            /**
             * SSOTおよびネイティブゲームインスタンスからのリアルタイム同期
             */
            const syncData = () => {
                // サバイバル基盤データの同期
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

                // マップ名および所持金の同期 (ゲーム進行中のみ取得)
                if ($gameMap) {
                    currentMapName.value = $gameMap.displayName() || "???";
                }
                if ($gameParty) {
                    currentGold.value = $gameParty.gold() || 0;
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

            /**
             * GSAP タイムライン制御 (Matrix Collapse Prevention & 3D Flip)
             */
            const playTransition = (detail) => {
                if (!window.gsap) {
                    if (detail.onOpaque) detail.onOpaque();
                    return;
                }

                isAnimating.value = true;
                const tl = gsap.timeline();

                // 就寝時(夜->昼): トランジション開始と同時にカレンダーのフリップアウトを開始
                if (detail.type === "sleep" && dateBlockRef.value) {
                    tl.to(dateBlockRef.value, { rotationX: -90, duration: 0.3, ease: "power1.in" }, 0);
                }

                // 暗幕レイヤーのフェードイン
                tl.to(overlayRef.value, { autoAlpha: 1, duration: 0.6, ease: "power2.out" }, 0);

                // 遮蔽完了タイミングでのデータ整合性コミット
                tl.call(() => {
                    if (detail.onOpaque) detail.onOpaque();
                    syncData(); 
                });

                // シンボル演出 (セルルック運動)
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

                // クリーンアップとフェードアウト
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
                currentAp, maxAp, phase, currentDay, currentWeekday, 
                currentMapName, currentGold,
                phaseIcon, isVisible, isAnimating, handleRestAction 
            };
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