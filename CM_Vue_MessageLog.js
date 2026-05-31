/*:
 * @target MZ
 * @plugindesc [v3.3.0] Vue3 カプセル型メッセージログ (GPU層集約・持続型・CSSアニメーション版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 * @orderAfter CM_CoreEngine
 *
 * @help
 * ============================================================================
 * ハイブリッドレンダリング - メッセージログ・コア (v3.3.0)
 *
 * 【アーキテクチャ更新】
 * 1. GPUレイヤーの降次元集約 (Layer Consolidation):
 *    各メッセージノードから translateZ(0) を剥離し、親コンテナへ統合。
 *    VRAMの枯渇と複合レイヤー爆発 (Composite Layer Explosion) を根絶。
 * 2. ゼロJSアニメーション (Zero-JS Animation):
 *    GSAPによるDOMフックを廃止し、VueネイティブのCSSトランジションへ移行。
 *    ガベージコレクション(GC)の負荷を最小化。
 * 3. 持続型キュー (Persistent Queue):
 *    時限式のDOM破棄を廃止し、最大50件のメッセージ履歴を保持可能に変更。
 * ============================================================================
 *
 * @command PushMessage
 * @text メッセージ送信
 * @arg text
 * @text テキスト/辞書キー
 * @type string
 * @arg side
 * @text 陣営
 * @type select
 * @option system
 * @option player
 * @option enemy
 * @default system
 */

(() => {
    "use strict";

    const Core = window.CM_Core;
    if (!Core) {
        console.error("[CM_Vue_MessageLog] 依存関係エラー: CM_CoreEngine.js が見つかりません。");
        return;
    }

    window.CM_Message = window.CM_Message || {};
    const CMM = window.CM_Message;

    CMM.State = {
        messageIdCounter: 0,
        nodeCache: {} 
    };

    //=============================================================================
    // 1. 構文解析・事前コンパイルエンジン (AOT Parsing & Template Engine)
    //=============================================================================
    
    CMM.convertColor = function(text) {
        if (!text) return ''; 
        const colors = [
            '#ffffff', '#20a0d6', '#ff784c', '#66cc40', '#99ccff', '#ccc0ff', '#ffffa0', '#808080',
            '#c0c0c0', '#2080cc', '#ff3810', '#00a010', '#3e9ade', '#a098ff', '#ffcc20', '#000000',
            '#84aaff', '#ffff40', '#ff3810', '#201010', '#e0a040', '#f0d0b0', '#a0a0ff', '#80ffff'
        ];
        
        let str = String(text).replace(/\\\\/g, '\x1b').replace(/\\/g, '\x1b');
        str = '<span class="msg-color-base">' + str + '</span>';
        str = str.replace(/\x1bC\[0\]/gi, '</span><span class="msg-color-base">');
        
        str = str.replace(/\x1bC\[(\d+)\]/gi, (m, p1) => {
            const idx = parseInt(p1);
            const color = (idx >= 0 && idx < colors.length) ? colors[idx] : '#ffffff';
            return `</span><span style="color: ${color};">`;
        });
        
        return str.replace(/\n/g, '<br/>');
    };

    CMM.resolveText = function(payload, context = {}) {
        if (!payload) return "";
        let resStr = "";
        
        if (typeof payload === 'object' && !Array.isArray(payload)) {
            const lang = (Core.I18n && Core.I18n.reactiveState) ? Core.I18n.reactiveState.lang : 'ja';
            resStr = payload[lang] || payload['ja'] || Object.values(payload)[0] || "";
        } else {
            const translated = Core.I18n.translate(String(payload));
            resStr = translated !== payload ? translated : payload;
        }

        resStr = resStr.replace(/\{([^{}]+)\}/g, (match, key) => {
            const val = context[key.trim()];
            return val !== undefined ? val : match;
        });

        resStr = resStr.replace(/\\Ref\[\s*([^,\]]+)\s*,\s*([^,\]]+)\s*,\s*([^,\]]+)\s*\]/gi, (m, type, id, prop) => {
            if (Core && typeof Core.resolveRef === 'function') { 
                const r = Core.resolveRef(type.trim(), id.trim(), prop.trim()); 
                return r !== "" ? r : m; 
            } 
            return m;
        });

        return CMM.convertColor(resStr);
    };

    //=============================================================================
    // 2. CSSインジェクション (Layer Consolidation & Pure CSS Animation)
    //=============================================================================
    const injectStyles = () => {
        if (document.getElementById('cm-message-log-style')) return;

        const style = document.createElement('style');
        style.id = 'cm-message-log-style';
        style.innerHTML = `
            #cm-vue-message-app {
                position: absolute; top: 0; left: 0; width: 100vw; height: 100vh;
                pointer-events: none; overflow: hidden;
                display: flex; justify-content: center; align-items: center;
                z-index: 9500;
            }
            #cm-message-wrapper {
                position: relative; width: 1280px; height: 720px;
                transform-origin: center; pointer-events: none;
            }
            .log-panel-container {
                position: absolute;
                background: transparent; box-sizing: border-box;
                overflow: hidden; display: flex; flex-direction: column;
                justify-content: flex-end; padding: 10px 20px;
                
                /* [GPU層集約] 親コンテナでのみハードウェアアクセラレーションを有効化 */
                transform: translateZ(0);
                will-change: transform;
            }
            .cm-msg-capsule {
                display: inline-flex; align-items: center;
                margin-top: 6px; padding: 6px 16px;
                border-radius: 20px;
                background: rgba(30, 30, 40, 0.85); 
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                max-width: 95%; align-self: flex-start;
                border: 1px solid rgba(255, 255, 255, 0.08);
                
                /* [重要] 子要素からの will-change および translateZ の除去 */
            }
            
            .side-player { border-left: 4px solid var(--cm-color-secondary, #00d2ff); }
            .side-enemy { border-left: 4px solid var(--cm-color-danger, #ff3b5b); }
            .side-system { border-left: 4px solid #a0a0a0; }
            
            .msg-content {
                color: #ffffff; font-size: 14px; line-height: 1.4;
                font-family: var(--cm-font-bold, sans-serif);
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
            }
            .msg-color-base { color: #ffffff; }
            .log-list-wrapper { display: flex; flex-direction: column; width: 100%; }

            /* Vue3 ネイティブCSSトランジション */
            .msg-list-move,
            .msg-list-enter-active,
            .msg-list-leave-active {
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            }
            .msg-list-enter-from {
                opacity: 0;
                transform: translateX(-30px);
            }
            .msg-list-leave-to {
                opacity: 0;
                transform: translateY(-20px);
            }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.id = 'cm-vue-message-app';
        container.innerHTML = `
            <div id="cm-message-wrapper" :style="{ zIndex: layout.messageLog.zIndex }">
                <div class="log-panel-container" :style="layout.messageLog">
                    <!-- JSフックを完全廃止し、純粋なCSSステートマシンへ委譲 -->
                    <transition-group name="msg-list" tag="div" class="log-list-wrapper">
                        <div v-for="msg in messages" :key="msg.id" :class="['cm-msg-capsule', 'side-' + msg.side]">
                            <div class="msg-content" v-html="msg.html"></div>
                        </div>
                    </transition-group>
                </div>
            </div>
        `;
        document.body.appendChild(container);
    };

    //=============================================================================
    // 3. Vue3 コア初期化
    //=============================================================================
    const initVueApp = () => {
        if (!window.Vue || CMM.VueState) return;
        const { createApp, reactive, computed } = Vue;
        const state = reactive({ messages: [] });
        CMM.VueState = state;

        createApp({
            setup() {
                const layout = computed(() => (Core.UILayout && Core.UILayout.reactiveState) ? Core.UILayout.reactiveState.config : Core.UILayout.defaults);
                return { messages: state.messages, layout };
            }
        }).mount('#cm-vue-message-app');
    };

    //=============================================================================
    // 4. パブリックAPI (AOT解析・キュー永続化)
    //=============================================================================
    
    CMM.push = function(text, side = 'system', context = {}) {
        if (!CMM.VueState) return;
        const id = ++CMM.State.messageIdCounter;
        
        // 挿入時にAOT(事前解析)を実行し、Vueのリアクティブトラッシングを防ぐ
        const resolvedHtml = CMM.resolveText(text, context);
        CMM.VueState.messages.push({ id, html: resolvedHtml, side });
        
        // 履歴を保持するため、キューの上限を50件に拡張
        if (CMM.VueState.messages.length > 50) CMM.VueState.messages.shift();
    };

    CMM.pushNode = async function(filepath, nodeId, side = 'system', context = {}) {
        let path = filepath.trim();
        if (!path.endsWith('.json')) path += '.json';
        
        if (!CMM.State.nodeCache[path]) {
            try {
                const lang = (Core.I18n && Core.I18n.reactiveState) ? Core.I18n.reactiveState.lang : 'ja';
                let res = await fetch(`data/dialogue/${lang}/${path}`);
                if (!res.ok) res = await fetch(`data/dialogue/${path}`);
                if (res.ok) CMM.State.nodeCache[path] = await res.json();
            } catch (e) { return; }
        }

        const nodes = CMM.State.nodeCache[path];
        if (nodes) {
            const node = nodes.find(d => d.id === Number(nodeId));
            if (node && node.text) CMM.push(node.text, side, context);
        }
    };

    //=============================================================================
    // 5. 業務ロジック・フック (イベント蓄積器)
    //=============================================================================
    
    CMM.Accumulator = { hp: 0, mp: 0, timer: null };
    CMM.flushAccumulator = function() {
        if (CMM.Accumulator.hp !== 0) {
            const side = CMM.Accumulator.hp > 0 ? 'player' : 'enemy';
            CMM.push(`\\C[10]HP ${CMM.Accumulator.hp > 0 ? "+" : ""}${Math.round(CMM.Accumulator.hp)}\\C[0]`, side);
        }
        if (CMM.Accumulator.mp !== 0) {
            CMM.push(`\\C[4]MP ${CMM.Accumulator.mp > 0 ? "+" : ""}${Math.round(CMM.Accumulator.mp)}\\C[0]`, 'player');
        }
        CMM.Accumulator.hp = 0; CMM.Accumulator.mp = 0; CMM.Accumulator.timer = null;
    };

    const _Game_Actor_gainHp = Game_Actor.prototype.gainHp;
    Game_Actor.prototype.gainHp = function(value) {
        _Game_Actor_gainHp.call(this, value);
        if (this.actorId() === 1 && value !== 0) {
            CMM.Accumulator.hp += value;
            if (!CMM.Accumulator.timer) CMM.Accumulator.timer = setTimeout(CMM.flushAccumulator, 150);
        }
    };

    const _Game_Actor_gainMp = Game_Actor.prototype.gainMp;
    Game_Actor.prototype.gainMp = function(value) {
        _Game_Actor_gainMp.call(this, value);
        if (this.actorId() === 1 && value !== 0) {
            CMM.Accumulator.mp += value;
            if (!CMM.Accumulator.timer) CMM.Accumulator.timer = setTimeout(CMM.flushAccumulator, 150);
        }
    };

    const _Game_Party_gainItem = Game_Party.prototype.gainItem;
    Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
        _Game_Party_gainItem.call(this, item, amount, includeEquip);
        if (item && amount !== 0) {
            const itemName = CMM.resolveText(item.name);
            CMM.push(`\\C[3]${itemName} ${amount > 0 ? "+" : ""}${amount}\\C[0]`, 'system');
        }
    };

    const _Game_Party_gainGold = Game_Party.prototype.gainGold;
    Game_Party.prototype.gainGold = function(amount) {
        _Game_Party_gainGold.call(this, amount);
        if (amount !== 0) CMM.push(`\\C[14]Gold ${amount > 0 ? "+" : ""}${amount} G\\C[0]`, 'system');
    };

    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        const wasTransferring = this.isTransferring();
        _Game_Player_performTransfer.call(this);
        if (wasTransferring && !this.isTransferring() && $dataMap && $dataMap.displayName) {
            CMM.push(`\\C[6]Entered: ${CMM.resolveText($dataMap.displayName)}\\C[0]`, 'system');
        }
    };

    PluginManager.registerCommand("CM_Vue_MessageLog", "PushMessage", args => {
        CMM.push(args.text, args.side || 'system');
    });

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        injectStyles();
        initVueApp();
        const updateLayout = () => {
            const wrapper = document.getElementById('cm-message-wrapper');
            if (wrapper) {
                const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
                wrapper.style.transform = `scale(${scale})`;
            }
        };
        window.addEventListener('resize', updateLayout);
        setTimeout(updateLayout, 100);
    };

})();