/*:
 * @target MZ
 * @plugindesc [v1.0.3] ステータス・バフ表示 UI (GPUレンダリング最適化版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 * @base CM_StatusSystem
 * @orderAfter CM_StatusSystem
 *
 * @help
 * ============================================================================
 * 🌌 状態テキストレンダラー (Status Text Renderer)
 *
 * 【アーキテクチャ更新 (v1.0.3 - レンダリング最適化)】
 * 1. 【GPU パイプラインの最適化】:
 * GSAP アニメーション (onEnter/onLeave) から `filter: blur` を完全に排除。
 * 背景の `backdrop-filter` と 動的 `filter` が WebGL 上で重なることで発生
 * していた瞬間的なフレームドロップ(掉帧)を根本的に解決しました。
 * 座標(x)と不透明度(opacity)のみのハードウェアアクセラレーション描画へ移行。
 * ============================================================================
 */

(() => {
    "use strict";

    const CMS = window.CM_Status;
    const Core = window.CM_Core;
    if (!CMS) {
        console.error("[CM_StatusUI] 致命的エラー: CM_StatusSystem が見つかりません。順序を確認してください。");
        return;
    }

    //=============================================================================
    // 🌌 Vue 3 Component Definition
    //=============================================================================
    const StatusUIComponent = {
        template: `
            <div class="cm-status-container" :style="containerStyle">
                <transition-group 
                    @enter="onEnter" 
                    @leave="onLeave" 
                    :css="false">
                    <div v-for="(st, index) in activeStates" 
                         :key="st.id" 
                         class="cm-status-item"
                         :data-id="st.id">
                        <span class="cm-status-name">{{ st.name }}</span>
                        <div v-if="st.duration > 0 && (st.type === 'turn' || st.type === 'tick')" 
                             class="cm-status-duration">
                             {{ Math.ceil(st.duration) }}
                        </div>
                    </div>
                </transition-group>
            </div>
        `,
        setup() {
            const activeStates = window.Vue.computed(() => CMS.VueState.activeStates);

            const containerStyle = window.Vue.computed(() => {
                const layoutConfig = (Core && Core.UILayout && Core.UILayout.reactiveState && Core.UILayout.reactiveState.config) 
                                     ? Core.UILayout.reactiveState.config.buffListZone 
                                     : {};
                                     
                return {
                    position: 'absolute',
                    left: layoutConfig.left || '20px',
                    top: layoutConfig.top || '150px',
                    width: layoutConfig.width || '200px',
                    height: 'auto',
                    zIndex: layoutConfig.zIndex || 110,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    pointerEvents: 'none'
                };
            });

            // 🌟 修正: filter: blur を削除し、ハードウェアアクセラレーション(x, opacity)のみを使用
            const onEnter = (el, done) => {
                window.gsap.fromTo(el, 
                    { x: -30, opacity: 0 },
                    { x: 0, opacity: 1, duration: 0.35, ease: "power2.out", onComplete: done }
                );
            };

            // 🌟 修正: 退場時も同様に最適化
            const onLeave = (el, done) => {
                window.gsap.to(el, {
                    x: 30,
                    opacity: 0,
                    duration: 0.25,
                    ease: "power2.in",
                    onComplete: done
                });
            };

            return { activeStates, containerStyle, onEnter, onLeave };
        }
    };

    //=============================================================================
    // 🛠️ Mount Logic (Sandbox Integration)
    //=============================================================================
    Scene_Map.prototype.mountStatusUI = function() {
        let uiContainer = document.getElementById('cm-status-ui-root');
        if (uiContainer) uiContainer.remove();

        uiContainer = document.createElement('div');
        uiContainer.id = 'cm-status-ui-root';
        uiContainer.className = 'cm-sandbox-root'; 
        document.body.appendChild(uiContainer);

        this._statusApp = window.Vue.createApp(StatusUIComponent);
        this._statusApp.mount(uiContainer);
        
        CMS.syncVueState();
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        this.mountStatusUI();
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        if (this._statusApp) {
            this._statusApp.unmount();
            this._statusApp = null;
            const el = document.getElementById('cm-status-ui-root');
            if (el) el.remove();
        }
        _Scene_Map_terminate.call(this);
    };

    const _Scene_Battle_start = Scene_Battle.prototype.start;
    Scene_Battle.prototype.start = function() {
        _Scene_Battle_start.call(this);
        this.mountStatusUI = Scene_Map.prototype.mountStatusUI;
        this.mountStatusUI();
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        if (this._statusApp) {
            this._statusApp.unmount();
            this._statusApp = null;
            const el = document.getElementById('cm-status-ui-root');
            if (el) el.remove();
        }
        _Scene_Battle_terminate.call(this);
    };

    //=============================================================================
    // 🎨 CSS Glassmorphism Styles
    //=============================================================================
    if (!document.getElementById('cm-status-ui-styles')) {
        const style = document.createElement('style');
        style.id = 'cm-status-ui-styles';
        style.innerHTML = `
            .cm-status-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 12px;
                background: rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                border-left: 3px solid var(--cm-color-secondary, #00d2ff);
                border-radius: 4px;
                color: #fff;
                font-family: var(--cm-font-main, 'sans-serif');
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                min-height: 24px;
                /* ハードウェアアクセラレーションの強制 (Force GPU render layer) */
                transform: translateZ(0);
                will-change: transform, opacity;
            }
            .cm-status-name {
                font-size: 14px;
                font-weight: bold;
                letter-spacing: 1px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            }
            .cm-status-duration {
                font-size: 12px;
                color: var(--cm-color-secondary, #00d2ff);
                font-family: monospace;
                background: rgba(0,0,0,0.3);
                padding: 0 6px;
                border-radius: 10px;
                margin-left: 10px;
            }
        `;
        document.head.appendChild(style);
    }

})();