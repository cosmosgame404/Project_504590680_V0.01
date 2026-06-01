/*:
 * @target MZ
 * @plugindesc [v4.0.1] Vue Character Hub (全画面没入型・キャラクター対話ハブUI)
 * @author Cosmos404
 * @base CM_CoreEngine
 * * @help
 * ============================================================================
 * アーキテクチャ仕様 (CM_Vue_CharacterHub)
 * 1. [没入型フルスクリーン]: 探索マップの上にオーバーレイ展開され、
 * 左側面に大型立ち絵、右側面に動的プロパティおよびインタラクションリストを
 * 配置するモダンAVG/GalgameスタイルのUIコンポーネント。
 * 2. [事前条件検証 (Pre-flight Check)]: 各インタラクションの costAp, costTime,
 * condition をリアルタイムに評価し、実行不可能な項目はUIレベルでロックアウト。
 * 3. [二段階決済 (Two-Phase Commit)]: アクション実行時、まずコアシステムの
 * リソース(AP等)を消費確定させ、UI閉鎖アニメーション完了後にペイロード
 * (Dialogue/Macro) を発火させる。
 * 4. [SSOT動的バインディング]: bindVarIdが設定されているプロパティは、
 * 常に最新の $gameVariables の数値をリアルタイムに参照します。
 * * [呼び出しAPI]:
 * マップノードのスクリプトから以下を呼び出します。
 * CM_CharacterHub.open(キャラクターID);
 * 例: CM_CharacterHub.open(3);
 * ============================================================================
 */

(() => {
    "use strict";

    window.CM_CharacterHub = window.CM_CharacterHub || {};

    // 1. 初期化とDOM注入 (Initialization & DOM Injection)
    // ライフサイクル同期のため、Scene_BootまでDOM操作を遅延させる
    CM_CharacterHub.initUI = function() {
        if (document.getElementById("cm-vue-character-hub-root")) return;

        // CSSスタイルの注入 (CSS Injection)
        const style = document.createElement("style");
        style.id = "cm-character-hub-styles";
        style.innerHTML = `
            #cm-vue-character-hub-root {
                position: absolute;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                pointer-events: none;
                z-index: 8500;
            }

            .cm-hub-overlay {
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: rgba(10, 12, 18, 0.85);
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
                pointer-events: auto;
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: stretch;
                overflow: hidden;
            }

            .cm-hub-left {
                flex: 1.2;
                position: relative;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding-bottom: 5vh;
            }

            .cm-hub-portrait {
                max-width: 100%;
                max-height: 95vh;
                object-fit: contain;
                filter: drop-shadow(0 0 30px rgba(0,0,0,0.5));
                will-change: transform, opacity;
            }

            .cm-hub-right {
                flex: 1;
                max-width: 600px;
                display: flex;
                flex-direction: column;
                padding: 50px 50px 50px 0;
                color: #fff;
                will-change: transform, opacity;
            }

            .cm-hub-header {
                display: flex;
                flex-direction: column;
                margin-bottom: 40px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 20px;
            }

            .cm-hub-title {
                font-size: 16px;
                color: var(--secondary, #00f2fe);
                letter-spacing: 2px;
                text-transform: uppercase;
                margin-bottom: 5px;
            }

            .cm-hub-name {
                font-size: 48px;
                font-weight: 800;
                letter-spacing: 4px;
                text-shadow: 0 4px 15px rgba(0,0,0,0.5);
            }

            .cm-hub-props-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 20px;
                margin-bottom: 40px;
            }

            .cm-hub-prop-item {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .cm-hub-prop-meta {
                display: flex;
                justify-content: space-between;
                font-size: 14px;
                font-weight: bold;
                color: #ccc;
            }

            .cm-hub-prop-bar-bg {
                width: 100%;
                height: 8px;
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
                overflow: hidden;
            }

            .cm-hub-prop-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
                border-radius: 4px;
                transition: width 0.5s ease-out;
            }

            .cm-hub-interactions {
                display: flex;
                flex-direction: column;
                gap: 15px;
                flex: 1;
                overflow-y: auto;
                padding-right: 15px;
            }

            .cm-hub-btn {
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.1);
                border-left: 4px solid var(--primary, #4facfe);
                padding: 20px;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                transition: all 0.2s;
            }

            .cm-hub-btn:hover:not(.is-disabled) {
                background: rgba(255,255,255,0.1);
                border-color: rgba(255,255,255,0.3);
                transform: translateX(10px);
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            }

            .cm-hub-btn.is-disabled {
                opacity: 0.4;
                filter: grayscale(100%);
                cursor: not-allowed;
                border-left-color: #555;
            }

            .cm-hub-btn-left {
                display: flex;
                align-items: center;
                gap: 15px;
            }

            .cm-hub-btn-icon {
                font-size: 24px;
            }

            .cm-hub-btn-name {
                font-size: 18px;
                font-weight: bold;
                letter-spacing: 1px;
            }

            .cm-hub-btn-cost {
                display: flex;
                gap: 15px;
                font-size: 14px;
                font-weight: bold;
            }

            .cost-ap { color: var(--cm-color-primary, #e06c8a); }
            .cost-time { color: var(--cm-color-warning, #ffeb3b); }

            .cm-hub-close {
                position: absolute;
                top: 40px;
                right: 50px;
                width: 50px;
                height: 50px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 50%;
                display: flex;
                justify-content: center;
                align-items: center;
                font-size: 20px;
                color: #fff;
                cursor: pointer;
                transition: all 0.2s;
                z-index: 10;
            }

            .cm-hub-close:hover {
                background: rgba(255,255,255,0.2);
                transform: rotate(90deg);
            }
        `;
        document.head.appendChild(style);

        const rootElement = document.createElement("div");
        rootElement.id = "cm-vue-character-hub-root";
        document.body.appendChild(rootElement);

        const app = Vue.createApp(CharacterHubApp);
        window.CM_CharacterHub_Vue = app.mount("#cm-vue-character-hub-root");
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        CM_CharacterHub.initUI();
    };

    // 2. 外部APIの露出 (Global API Exposure)
    CM_CharacterHub.open = function(actorId) {
        if (window.CM_CharacterHub_Vue) {
            window.CM_CharacterHub_Vue.openHub(actorId);
        } else {
            console.error("[CM_CharacterHub] Vueコンポーネントが初期化されていません。");
        }
    };

    // 3. Vue 3 コンポーネント定義 (Vue 3 Component Definition)
    const CharacterHubApp = {
        data() {
            return {
                isVisible: false,
                actor: null,
                charDataCache: [],
                currentAp: 0,
                isProcessing: false
            };
        },
        computed: {
            portraitSrc() {
                if (!this.actor) return '';
                const p = this.actor.portrait;
                let imgName = `npc_${this.actor.id}`;
                if (p && p.useOverride && p.overrideName) {
                    imgName = p.overrideName;
                } else if (p && p.default) {
                    imgName = p.default;
                }
                return `img/npc/${imgName}.png`;
            }
        },
        methods: {
            async fetchCharacterData() {
                try {
                    // タイムスタンプ付与による厳密なキャッシュバイパス
                    const res = await fetch(`data/dialogue/CharacterData.json?t=${Date.now()}`);
                    if (res.ok) {
                        const data = await res.json();
                        this.charDataCache = data.actors || data;
                    }
                } catch (e) {
                    console.error("[CM_Vue_CharacterHub] CharacterData.json のロードに失敗:", e);
                }
            },
            getPropValue(prop) {
                // bindVarIdが有効な場合、ゲームのネイティブ変数空間から最新状態を取得する
                if (prop.bindVarId && prop.bindVarId > 0 && window.$gameVariables) {
                    return window.$gameVariables.value(prop.bindVarId);
                }
                return prop.value || 0;
            },
            getPropPercentage(prop) {
                const max = 100; // UIプログレスバーの基底最大値 (上限100)
                const v = Number(this.getPropValue(prop)) || 0;
                return Math.min(Math.max((v / max) * 100, 0), 100);
            },
            refreshCurrentStatus() {
                if (window.$gameSystem && window.$gameSystem._cmSurvival) {
                    this.currentAp = window.$gameSystem._cmSurvival.ap || 0;
                } else {
                    this.currentAp = 0;
                }
            },
            evalCondition(cond) {
                if (!cond || cond.trim() === "") return true;
                
                const context = {
                    actor: this.actor,
                    v: window.$gameVariables ? window.$gameVariables._data : {}
                };

                try {
                    if (window.CM_Core && typeof window.CM_Core.evalCondition === 'function') {
                        return window.CM_Core.evalCondition(cond, context);
                    }
                    const func = new Function('actor', 'v', `return !!(${cond});`);
                    return func(context.actor, context.v);
                } catch (e) {
                    console.warn(`[CM_Vue_CharacterHub] 条件評価エラー (Condition Eval Error): ${cond}`, e);
                    return false;
                }
            },
            canExecute(interaction) {
                const costAp = Number(interaction.costAp) || 0;
                if (this.currentAp < costAp) return false;
                
                if (interaction.condition && !this.evalCondition(interaction.condition)) {
                    return false;
                }
                return true;
            },
            async openHub(actorId) {
                if (this.isVisible) return;
                
                // 毎回最新のデータをフェッチしてSSOTの整合性を担保
                await this.fetchCharacterData();
                
                const targetActor = this.charDataCache.find(a => String(a.id) === String(actorId));
                if (!targetActor) {
                    console.warn(`[CM_Vue_CharacterHub] 該当するエンティティが見つかりません (Actor not found): ${actorId}`);
                    return;
                }
                
                this.actor = targetActor;
                this.refreshCurrentStatus();
                this.isProcessing = false;
                this.isVisible = true;

                this.$nextTick(() => {
                    if (!window.gsap) return;
                    const tl = gsap.timeline();
                    
                    tl.fromTo(this.$refs.overlay, 
                        { opacity: 0 }, 
                        { opacity: 1, duration: 0.4, ease: "power2.out" }
                    )
                    .fromTo(this.$refs.portrait,
                        { x: -100, opacity: 0, scale: 0.95 },
                        { x: 0, opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.2)" },
                        "-=0.2"
                    )
                    .fromTo(this.$refs.rightPanel,
                        { x: 50, opacity: 0 },
                        { x: 0, opacity: 1, duration: 0.5, ease: "power2.out" },
                        "-=0.4"
                    );
                });
            },
            closeHub() {
                if (!this.isVisible || this.isProcessing) return;
                
                if (window.gsap) {
                    gsap.to(this.$refs.overlay, {
                        opacity: 0,
                        duration: 0.3,
                        ease: "power2.in",
                        onComplete: () => {
                            this.isVisible = false;
                            this.actor = null;
                        }
                    });
                } else {
                    this.isVisible = false;
                    this.actor = null;
                }
            },
            handleInteraction(interaction) {
                if (this.isProcessing) return;
                if (!this.canExecute(interaction)) {
                    if (window.SoundManager) window.SoundManager.playBuzzer();
                    return;
                }

                if (window.SoundManager) window.SoundManager.playOk();
                this.isProcessing = true;

                // 1. コストの確定 (Settle Costs)
                const costAp = Number(interaction.costAp) || 0;
                const costTime = Number(interaction.costTime) || 0;
                
                if (window.CM_TimeSurvival) {
                    if (costAp > 0) window.CM_TimeSurvival.consume(costAp);
                    if (costTime > 0) window.CM_TimeSurvival.advanceTimeAndStats(costTime, 0, 0, 0);
                }

                // 2. UIの隠蔽とペイロード実行 (Hide UI & Execute Payload)
                if (window.gsap) {
                    gsap.to(this.$refs.overlay, {
                        opacity: 0,
                        duration: 0.4,
                        ease: "power2.in",
                        onComplete: () => {
                            this.isVisible = false;
                            this.actor = null;
                            this.dispatchPayload(interaction);
                        }
                    });
                } else {
                    this.isVisible = false;
                    this.actor = null;
                    this.dispatchPayload(interaction);
                }
            },
            dispatchPayload(interaction) {
                // ExploreSystemのイベントパイプラインへ注入
                if (window.CM_Explore && typeof window.CM_Explore.processEvent === 'function') {
                    window.CM_Explore.processEvent({
                        actionType: interaction.actionType,
                        arg1: interaction.arg1,
                        arg2: interaction.arg2,
                        macros: interaction.macros,
                        _isTimeEvent: false 
                    });
                }
            }
        },
        template: `
            <div v-if="isVisible" class="cm-hub-overlay" ref="overlay">
                
                <div class="cm-hub-close" @click="closeHub">✕</div>

                <div class="cm-hub-left">
                    <img :src="portraitSrc" class="cm-hub-portrait" ref="portrait">
                </div>

                <div class="cm-hub-right" ref="rightPanel">
                    
                    <div class="cm-hub-header">
                        <div class="cm-hub-title">{{ actor.title || 'UNKNOWN ENTITY' }}</div>
                        <div class="cm-hub-name">{{ actor.name }}</div>
                    </div>

                    <div class="cm-hub-props-grid" v-if="actor.customProps && actor.customProps.length > 0">
                        <div class="cm-hub-prop-item" v-for="(prop, index) in actor.customProps" :key="index">
                            <div class="cm-hub-prop-meta">
                                <span>{{ prop.name }}</span>
                                <span>{{ getPropValue(prop) }}</span>
                            </div>
                            <div class="cm-hub-prop-bar-bg">
                                <div class="cm-hub-prop-bar-fill" :style="{ width: getPropPercentage(prop) + '%' }"></div>
                            </div>
                        </div>
                    </div>

                    <div class="cm-hub-interactions cm-custom-scroll">
                        <div v-for="(act, idx) in actor.interactions" :key="idx"
                             class="cm-hub-btn"
                             :class="{ 'is-disabled': !canExecute(act) }"
                             @click="handleInteraction(act)">
                            
                            <div class="cm-hub-btn-left">
                                <span class="cm-hub-btn-icon" v-if="act.icon">{{ act.icon }}</span>
                                <span class="cm-hub-btn-name">{{ act.name }}</span>
                            </div>

                            <div class="cm-hub-btn-cost">
                                <span class="cost-ap" v-if="act.costAp > 0">AP -{{ act.costAp }}</span>
                                <span class="cost-time" v-if="act.costTime > 0">{{ act.costTime }} MIN</span>
                            </div>
                            
                        </div>
                    </div>

                </div>
            </div>
        `
    };

})();