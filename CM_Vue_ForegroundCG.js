/*:
 * @target MZ
 * @plugindesc [v10.8.3] Vue3 フォアグラウンドCGシステム (最前面・UIオーバーライド層)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_DialogueSystem_Core
 * @orderAfter CM_DialogueSystem_Core
 * @orderAfter CM_Vue_DialogueHUD
 *
 * @help
 * ============================================================================
 * アーキテクチャ設計 (CM_Vue_ForegroundCG):
 * 本プラグインは Canvas(PIXI.js) のレンダリングレイヤー制限を突破し、
 * ゲーム画面の最前面（全てのUIやダイアログの更に上層）に画像をオーバーレイ
 * するための純粋な DOM(Vue3) ベースの画像制御モジュールです。
 * * 💡【利用シーン】
 * - 画面全体を覆う一枚絵 (イベントCG)
 * - 画面の端から差し込まれるカットイン (Cut-in)
 * - UIの更に上からかかる血飛沫などの全画面エフェクト
 * ============================================================================
 * * [利用可能な演出コマンド]
 * <CG: action, id, imageName, x, y, duration, waitFlag>
 * * 🟢 1. CGの表示 (Show)
 * 書式: <CG: show, ID, 画像名, X, Y, フェード時間(フレーム), ウェイト(true/false)>
 * 例1: <CG: show, 101, cg_memory_01, 0, 0, 60, true>
 * 例2: <CG: show, 102, cutin_attack, 300, 150, 20>
 * ※ 画像は img/pictures/ フォルダから読み込まれます(.png)。
 * * 🔴 2. CGの消去 (Hide)
 * 書式: <CG: hide, ID, フェード時間(フレーム), ウェイト(true/false)>
 * 例: <CG: hide, 101, 30, true>
 * * 🧹 3. 全CGの一括消去 (Clear)
 * 書式: <CG: clear, フェード時間(フレーム)>
 * 例: <CG: clear, 30>
 */

(() => {
    "use strict";

    const CM = window.CM_Dialogue;
    if (!CM || !CM.CommandDispatcher) {
        console.error("[CM_Vue_ForegroundCG] 致命的エラー: CM_DialogueSystem_Core.js が見つかりません。");
        return;
    }

    //=========================================================================
    // 1. スタイルシートの動的注入 (CSS Injection)
    //=========================================================================
    const injectCGStyles = function() {
        if (document.getElementById('cm-vue-cg-style')) return;
        const style = document.createElement('style');
        style.id = 'cm-vue-cg-style';
        style.innerHTML = `
            #cm-vue-cg-root { 
                position: absolute; 
                top: 0; left: 0; 
                width: 100vw; height: 100vh; 
                z-index: 8000; 
                pointer-events: none; /* 下層へのクリックを透過 */
                overflow: hidden; 
            }
            .cm-cg-container {
                position: relative;
                width: 1280px; height: 720px;
                transform-origin: 0 0; /* PIXIの標準アンカーと一致させる */
            }
            .cm-cg-image {
                position: absolute;
                will-change: opacity, transform;
                /* デフォルトのレンダリング補間を最適化 */
                image-rendering: -webkit-optimize-contrast;
            }
        `;
        document.head.appendChild(style);
    };

    //=========================================================================
    // 2. Vue3 アプリケーションの初期化 (Vue Application Setup)
    //=========================================================================
    let CgState = null; // Vueリアクティブステートの参照保持用

    const initVueCGApp = function() {
        if (document.getElementById('cm-vue-cg-root')) return;
        
        const root = document.createElement('div');
        root.id = 'cm-vue-cg-root';
        root.innerHTML = `
            <div class="cm-cg-container" :style="containerStyle">
                <img v-for="cg in cgList" :key="cg.id" 
                     :id="'cm-cg-img-' + cg.id"
                     :src="'img/pictures/' + cg.name + '.png'"
                     class="cm-cg-image"
                     :style="{ 
                         left: cg.x + 'px', 
                         top: cg.y + 'px', 
                         zIndex: cg.zIndex,
                         opacity: cg.initialOpacity
                     }" 
                />
            </div>
        `;
        document.body.appendChild(root);

        const { createApp, reactive, computed, onMounted } = window.Vue || Vue;

        CM.VueCgApp = createApp({
            setup() {
                // リアクティブステート
                const state = reactive({
                    cgMap: {}, // { id: { id, name, x, y, zIndex, initialOpacity } }
                    scale: 1.0
                });
                
                CgState = state; // グローバル参照をキャッシュ

                const cgList = computed(() => Object.values(state.cgMap));

                const containerStyle = computed(() => ({
                    transform: `scale(${state.scale})`
                }));

                const updateLayout = () => {
                    // MZの実機解像度に合わせたスケーリング計算
                    state.scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
                    
                    // 中央揃えのためのオフセット計算（標準のMZ Canvasセンタリング挙動を模倣）
                    const marginW = (window.innerWidth - 1280 * state.scale) / 2;
                    const marginH = (window.innerHeight - 720 * state.scale) / 2;
                    
                    const container = root.querySelector('.cm-cg-container');
                    if (container) {
                        container.style.marginLeft = marginW + 'px';
                        container.style.marginTop = marginH + 'px';
                    }
                };

                onMounted(() => { 
                    updateLayout();
                    window.addEventListener('resize', updateLayout);
                });
                
                return { state, cgList, containerStyle };
            }
        }).mount(root);
    };

    //=========================================================================
    // 3. コマンド登録 (Command Registration)
    //=========================================================================
    CM.CommandDispatcher.register('cg', args => {
        if (!CgState) return;

        const p = args.split(/[,，\s]+/).filter(Boolean); 
        if (p.length < 1) return;

        const action = p[0].toLowerCase();
        
        // --- 🧹 一括クリア (Clear) ---
        if (action === 'clear') {
            const duration = parseInt(p[1] || 0);
            const ids = Object.keys(CgState.cgMap);
            
            ids.forEach(id => {
                const el = document.getElementById(`cm-cg-img-${id}`);
                if (el) {
                    gsap.to(el, {
                        opacity: 0,
                        duration: duration / 60,
                        onComplete: () => { delete CgState.cgMap[id]; }
                    });
                } else {
                    delete CgState.cgMap[id];
                }
            });
            return;
        }

        const cgId = parseInt(p[1]);
        if (isNaN(cgId)) return;

        // --- 🟢 表示 (Show) ---
        if (action === 'show') {
            if (p.length < 3) return;
            const imgName = p[2];
            const px = parseInt(p[3] || 0);
            const py = parseInt(p[4] || 0);
            const duration = parseInt(p[5] || 0);
            const wait = (p[6] && p[6].toLowerCase() === 'true');

            // データ登録 (DOMレンダリングをトリガー)
            CgState.cgMap[cgId] = {
                id: cgId,
                name: imgName,
                x: px,
                y: py,
                zIndex: cgId, // IDをそのままZ-Indexとして流用
                initialOpacity: duration > 0 ? 0 : 1 // フェードインの場合は初期透明度0
            };

            // DOMが生成された後の次のティックでアニメーションを実行
            if (window.Vue) {
                window.Vue.nextTick(() => {
                    const el = document.getElementById(`cm-cg-img-${cgId}`);
                    if (el && duration > 0) {
                        gsap.to(el, { opacity: 1, duration: duration / 60, ease: "power1.inOut" });
                    }
                });
            }

            if (wait) CM.State.waitFrames = Math.max(CM.State.waitFrames, duration);
        } 
        // --- 🔴 消去 (Hide) ---
        else if (action === 'hide') {
            const duration = parseInt(p[2] || 0);
            const wait = (p[3] && p[3].toLowerCase() === 'true');

            if (CgState.cgMap[cgId]) {
                const el = document.getElementById(`cm-cg-img-${cgId}`);
                if (el && duration > 0) {
                    gsap.to(el, {
                        opacity: 0,
                        duration: duration / 60,
                        ease: "power1.inOut",
                        onComplete: () => { delete CgState.cgMap[cgId]; } // フェード終了後にデータを削除
                    });
                } else {
                    delete CgState.cgMap[cgId]; // 即時削除
                }
            }

            if (wait) CM.State.waitFrames = Math.max(CM.State.waitFrames, duration);
        }
    });

    //=========================================================================
    // 4. フックの登録 (Hook Registration)
    //=========================================================================
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        injectCGStyles();
        initVueCGApp();
    };

    // 対話システムクリーンアップ時のフック
    // （シームレスな体験を維持するため、明示的なクリア以外ではCGを残す仕様も可能だが、
    //  デフォルトではメモリ解放のためシーン遷移等で一掃する設計とする）
    if (CM.CleanupHooks) {
        CM.CleanupHooks.push(() => {
            if (CgState) {
                // DOM上の要素のトゥイーンをキルし、ステートをクリア
                Object.keys(CgState.cgMap).forEach(id => {
                    const el = document.getElementById(`cm-cg-img-${id}`);
                    if (el) gsap.killTweensOf(el);
                });
                CgState.cgMap = {};
            }
        });
    }

})();