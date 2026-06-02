/*:
 * @target MZ
 * @plugindesc [v8.5.5] サイバーポップ・タイトル＆UI (3言語対応最適化版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 * @orderAfter CM_CoreEngine
 *
 * @param studioName
 * @text スタジオ名
 * @default PROJECT KAWAII
 *
 * @param studioText
 * @text スタジオサブテキスト
 * @default PRESENTS
 *
 * @param gameTitle
 * @text ゲームタイトル
 * @default 赛博魅惑
 *
 * @param gameSubTitle
 * @text ゲームサブタイトル
 * @default CYBER Seduction
 *
 * @param titleBgImage
 * @text 背景画像
 * @type file
 * @dir img/titles1/
 * @default
 *
 * @help
 * ============================================================================
 * アーキテクチャ更新 (v8.5.5):
 * 1. 言語サポートの最適化: 繁体字および韓国語のフォールバックを削除。
 * 日・英・簡体字の3言語のみのサポートへ完全移行。
 * 2. セーブデータカード縮小および24時間表示機能はv8.5.4を継承。
 * ============================================================================
 */

(() => {
    "use strict";

    window.CM_Anime = window.CM_Anime || {};
    const params = PluginManager.parameters('CM_TitleAnime');
    const Core = window.CM_Core;
    
    CM_Anime.hasSplashed = false;

    //=============================================================================
    // 1. グローバルCSS注入
    //=============================================================================
    CM_Anime.injectGlobalCSS = function() {
        if (document.getElementById('cm-title-anime-css')) return;
        const style = document.createElement('style');
        style.id = 'cm-title-anime-css';
        style.innerHTML = `
            :root { 
                --cp-pink: #ff007f;      
                --cp-black: #111111;     
                --cp-white: #ffffff;     
                --cp-grey: #2a2a2a;      
            }

            #cm-title-vue-root { 
                position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; 
                z-index: 9000; overflow: hidden; pointer-events: none; 
                font-family: var(--cm-font-bold, sans-serif); 
                -webkit-font-smoothing: antialiased; 
            }

            .cm-ui-layer { 
                position: absolute; pointer-events: auto; background-color: var(--cp-white); overflow: hidden;
            }

            .cm-sandbox-root { 
                position: absolute; transform-origin: top left; pointer-events: none; 
                z-index: 10; will-change: transform;
                width: var(--cm-game-width, 1920px);
                height: var(--cm-game-height, 1080px);
                transform: scale(var(--cm-scale, 1)) translateZ(0);
                left: var(--cm-canvas-left, 0px);
                top: var(--cm-canvas-top, 0px);
            }
            .cm-sandbox-root > * { pointer-events: auto; }

            .cm-bg-base { 
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
                background-image: radial-gradient(rgba(0,0,0,0.1) 15%, transparent 16%), radial-gradient(rgba(0,0,0,0.1) 15%, transparent 16%);
                background-size: 24px 24px; background-position: 0 0, 12px 12px;
                z-index: 1; pointer-events: none; 
            }
            
            .cm-bg-custom { 
                position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
                background-size: 100% 100%; background-position: center; z-index: 2; pointer-events: none; 
            }

            .cm-splash-screen {
                position: absolute; width: 100%; height: 100%; 
                background: rgba(17, 17, 17, 0.7); backdrop-filter: blur(12px);
                z-index: 99999; display: flex; flex-direction: column; justify-content: center; 
                align-items: center; pointer-events: auto;
            }
            .cm-splash-title { color: var(--cp-white); font-size: 70px; font-weight: 900; letter-spacing: 15px; margin: 0; transform: translateZ(0); backface-visibility: hidden; }
            .cm-splash-sub { color: var(--cp-pink); font-size: 24px; font-weight: bold; letter-spacing: 8px; margin-top: 10px; transform: translateZ(0); backface-visibility: hidden; }

            .anim-title-right-wrap, .anim-title-left-wrap { will-change: transform, opacity; }
            .anim-title-logo-wrap { position: absolute; top: 8%; left: 5%; z-index: 20; pointer-events: none; will-change: transform, opacity; }
            
            .anim-file-header-wrap, .anim-opt-header-wrap { position: absolute; top: 40px; left: 8%; z-index: 10; will-change: transform, opacity; }
            .anim-file-back-wrap, .anim-opt-back-wrap { position: absolute; bottom: 40px; right: 40px; z-index: 10000; will-change: transform, opacity; }
            .anim-file-slot-wrap, .anim-opt-section-wrap { will-change: transform, opacity; }

            /* メインメニュー */
            .cp-menu-main { position: absolute; bottom: 10%; right: 40px; z-index: 10; display: flex; flex-direction: column; gap: 20px; align-items: flex-end; }
            .cp-btn-main { 
                background: var(--cp-white); color: var(--cp-black); 
                border: 5px solid var(--cp-black);
                padding: 20px 60px; cursor: pointer; 
                transform: skewX(-15deg) translateZ(0); 
                display: flex; align-items: center; justify-content: center; width: 480px;
                box-shadow: -10px 10px 0 var(--cp-black); transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease; position: relative;
                flex-shrink: 0; white-space: nowrap; backface-visibility: hidden;
            }
            .cp-btn-main.highlight { background: var(--cp-black); color: var(--cp-white); z-index: 2; box-shadow: -10px 10px 0 var(--cp-pink);}
            .cp-btn-main:hover { background: var(--cp-pink) !important; color: var(--cp-white) !important; transform: skewX(-15deg) translate(-20px, -5px) translateZ(0) !important; box-shadow: -15px 15px 0 var(--cp-black) !important; z-index: 3; }
            
            /* サブメニュー */
            .cp-menu-sub { position: absolute; bottom: 10%; left: 40px; z-index: 10; display: flex; flex-direction: column; gap: 15px; align-items: flex-start;}
            .cp-btn-sub {
                background: var(--cp-black); border: 5px solid var(--cp-black); color: var(--cp-white);
                padding: 15px 50px; cursor: pointer;
                transform: skewX(-15deg) translateZ(0); 
                box-shadow: 8px 8px 0 var(--cp-pink);
                display: flex; align-items: center; justify-content: center; transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease; width: 320px; position: relative;
                flex-shrink: 0; white-space: nowrap; backface-visibility: hidden;
            }
            .cp-btn-sub:hover { background: var(--cp-white) !important; color: var(--cp-black) !important; transform: skewX(-15deg) translate(20px, -5px) translateZ(0) !important; box-shadow: 15px 15px 0 var(--cp-black) !important; }
            
            .cp-btn-inner { display: flex; align-items: center; justify-content: center; transform: skewX(15deg) translateZ(0); width: 100%; backface-visibility: hidden; }

            .cp-btn-text { display: flex; flex-direction: column; line-height: 1.1; text-align: center; }
            .cp-btn-text .zh { font-size: 32px; font-weight: 900; letter-spacing: 2px; }
            .cp-btn-text .en { font-size: 16px; font-weight: bold; color: inherit; opacity: 0.8; letter-spacing: 1px; }
            .cp-menu-sub .cp-btn-text .zh { font-size: 26px; }
            .cp-menu-sub .cp-btn-text .en { font-size: 14px; }
            
            .cp-logo-main {
                font-family: var(--cm-font-bold, sans-serif); font-size: 130px; font-weight: 900; color: var(--cp-white);
                margin: 0; line-height: 1; letter-spacing: 5px; -webkit-text-stroke: 5px var(--cp-black);
                text-shadow: 10px 10px 0 var(--cp-pink), 20px 20px 0 var(--cp-black); position: relative; 
                transform: rotate(-5deg) skewX(-10deg) translateZ(0); backface-visibility: hidden;
            }
            .cp-logo-sub {
                font-size: 26px; color: var(--cp-white); background: var(--cp-black);
                padding: 5px 25px; border-radius: 40px; display: inline-block; margin-top: 30px; margin-left: 20px; 
                border: 3px solid var(--cp-pink); box-shadow: 5px 5px 0 var(--cp-black); font-weight: 900; letter-spacing: 3px;
                transform: rotate(-5deg) skewX(-10deg) translateZ(0); backface-visibility: hidden;
            }

            .lang-menu {
                display: flex; position: absolute; left: 100%; top: -10px; margin-left: 30px; margin-right: 0;
                background: var(--cp-white); border: 4px solid var(--cp-black); box-shadow: 6px 6px 0 var(--cp-pink);
                flex-direction: column; min-width: 160px; z-index: 100; transform: skewX(-15deg) translateZ(0);
                backface-visibility: hidden;
            }
            .lang-item { padding: 12px 25px; font-size: 18px; color: var(--cp-black); font-weight: 900; cursor: pointer; border-bottom: 2px solid var(--cp-black); transition: 0.1s; text-align: center;}
            .lang-item span { display: inline-block; transform: skewX(15deg) translateZ(0); backface-visibility: hidden; }

            .cm-btn-back { 
                background: var(--cp-white); border: 5px solid var(--cp-black); color: var(--cp-black); 
                font-size: 28px; font-weight: 900; padding: 15px 70px 15px 50px; cursor: pointer; 
                transform: skewX(-15deg) translateZ(0); box-shadow: 10px 10px 0 var(--cp-black); 
                transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease; outline: none; display: block;
                flex-shrink: 0; white-space: nowrap; backface-visibility: hidden; position: relative;
            }
            .cm-btn-back:hover { background: var(--cp-pink) !important; color: var(--cp-white) !important; transform: skewX(-15deg) translate(-10px, -5px) translateZ(0) !important; box-shadow: 15px 15px 0 var(--cp-black) !important; }
            
            .screen-header { 
                font-size: 80px; color: var(--cp-white); -webkit-text-stroke: 4px var(--cp-black); text-shadow: 10px 10px 0 var(--cp-pink); 
                transform: skewX(-10deg) translateZ(0); font-weight: 900; letter-spacing: 5px; 
                backface-visibility: hidden; position: relative; display: inline-block;
            }

            .opt-container { 
                position: absolute; top: 180px; left: 50%; transform: translateX(-50%) translateZ(0); width: 1000px; height: 65%; 
                z-index: 10; display: flex; flex-direction: column; gap: 40px; overflow-x: hidden; overflow-y: auto; 
                padding: 10px 20px 40px 20px; box-sizing: border-box; backface-visibility: hidden;
            }
            .opt-section { background: var(--cp-white); border: 5px solid var(--cp-black); padding: 40px 50px; box-shadow: 12px 12px 0 var(--cp-black); transform: skewX(-3deg) translateZ(0); backface-visibility: hidden; }
            .opt-section-inner { transform: skewX(3deg) translateZ(0); backface-visibility: hidden; }
            .opt-section-title { display: inline-block; font-size: 32px; color: var(--cp-white); background: var(--cp-black); font-weight: 900; margin-bottom: 35px; padding: 5px 25px; border: 3px solid var(--cp-black); box-shadow: 5px 5px 0 var(--cp-pink); }
            .opt-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
            .opt-label { font-size: 26px; color: var(--cp-black); font-weight: 900; width: 35%;}
            .opt-slider { -webkit-appearance: none; width: 50%; height: 24px; background: var(--cp-black); outline: none; border: 3px solid var(--cp-black); box-shadow: 4px 4px 0 var(--cp-grey);}
            .opt-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 35px; height: 45px; background: var(--cp-white); cursor: pointer; border: 4px solid var(--cp-black); box-shadow: 4px 4px 0 var(--cp-black); transition: 0.15s; }
            .opt-slider::-webkit-slider-thumb:hover { background: var(--cp-pink); transform: scale(1.1) translateZ(0); }
            .opt-val { font-size: 26px; color: var(--cp-black); width: 15%; text-align: right; font-weight: 900; white-space: nowrap; }
            .opt-switch { position: relative; display: inline-block; width: 90px; height: 46px; } 
            .opt-switch input { opacity: 0; width: 0; height: 0; }
            .opt-slider-btn { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--cp-black); transition: .2s; border: 4px solid var(--cp-black); box-shadow: 4px 4px 0 var(--cp-grey);}
            .opt-slider-btn:before { position: absolute; content: ""; height: 28px; width: 28px; left: 5px; bottom: 5px; background-color: var(--cp-white); transition: .2s; border: 3px solid var(--cp-black); }
            input:checked + .opt-slider-btn { background-color: var(--cp-white); box-shadow: 4px 4px 0 var(--cp-pink); } 
            input:checked + .opt-slider-btn:before { transform: translateX(40px) translateZ(0); background-color: var(--cp-black); }

            /* 3行4列 12スロット完全固定グリッドレイアウト */
            .save-grid-wrapper { 
                position: absolute; top: 180px; left: 50%; transform: translateX(-50%) translateZ(0); 
                width: 1500px; 
                z-index: 10; padding: 10px 20px; 
                box-sizing: border-box; 
                overflow: hidden; 
                backface-visibility: hidden;
            }
            .save-grid { 
                display: grid; 
                grid-template-columns: repeat(4, 1fr); 
                grid-template-rows: repeat(3, 1fr); 
                gap: 25px; 
            }
            
            .save-slot { 
                background: var(--cp-white); border: 5px solid var(--cp-black); padding: 20px; 
                cursor: pointer; box-shadow: 8px 8px 0 var(--cp-black); 
                transition: transform 0.15s, box-shadow 0.15s, background 0.15s; 
                transform: skewX(-3deg) translateZ(0); 
                height: 160px; 
                display: flex; flex-direction: column; justify-content: flex-start; position: relative; 
            }
            .save-slot:hover { 
                transform: skewX(-3deg) translate(-8px, -8px) translateZ(0); 
                box-shadow: 16px 16px 0 var(--cp-pink); background: var(--cp-black); 
            }
            .save-slot.empty { opacity: 0.8; background: #e0e0e0; }
            .save-slot.empty:hover { opacity: 1; background: var(--cp-black); }

            .slot-id { 
                font-size: 26px; font-weight: 900; color: var(--cp-black); 
                border-bottom: 4px solid var(--cp-black); padding-bottom: 8px; margin-bottom: 12px; 
                transition: color 0.15s, border-color 0.15s; text-align: left; transform: skewX(3deg);
            }
            .save-slot:hover .slot-id { color: var(--cp-pink); border-bottom-color: var(--cp-pink); }
            
            .slot-data { display: flex; flex-direction: column; gap: 5px; text-align: left; transform: skewX(3deg);}
            
            .slot-time { font-size: 19px; font-weight: bold; color: var(--cp-black); transition: color 0.15s; }
            .slot-date { font-size: 17px; font-weight: bold; color: #666; transition: color 0.15s; }
            
            .save-slot:hover .slot-time, .save-slot:hover .slot-date { color: var(--cp-white); }
            
            .slot-empty { 
                font-size: 24px; font-weight: 900; color: #888; text-align: center; 
                margin-top: auto; margin-bottom: auto; transform: skewX(3deg); transition: color 0.15s;
            }
            .save-slot:hover .slot-empty { color: var(--cp-white); }
        `;
        document.head.appendChild(style);
    };

    //=============================================================================
    // 2. Vue3 SPA ルートの構築
    //=============================================================================
    CM_Anime.initVueApp = function() {
        if (document.getElementById('cm-title-vue-root')) return;
        CM_Anime.injectGlobalCSS();

        const root = document.createElement('div');
        root.id = 'cm-title-vue-root';
        
        root.innerHTML = `
            <div class="cm-ui-layer" v-show="isVisible" :style="{ left: state.canvasLeft+'px', top: state.canvasTop+'px', width: state.canvasWidth+'px', height: state.canvasHeight+'px', backgroundColor: (state.activeScene === 'file' || state.activeScene === 'options') ? 'transparent' : 'var(--cp-white)' }">
                <div class="cm-bg-base"></div>
                <div class="cm-bg-custom" :style="customBgStyle"></div>
                
                <transition @enter="onSplashEnter" @leave="onSplashLeave" css="false">
                    <div class="cm-splash-screen" v-show="state.activeScene === 'splash'">
                        <div class="anim-splash-wrap"><h1 class="cm-splash-title">${params.studioName}</h1></div>
                        <div class="anim-splash-wrap"><div class="cm-splash-sub">${params.studioText}</div></div>
                    </div>
                </transition>

                <div class="cm-sandbox-root" :style="sandboxStyle">
                    <transition @enter="onTitleEnter" @leave="onTitleLeave" css="false">
                        <div v-show="state.activeScene === 'title'" style="width:100%; height:100%; position:absolute;">
                            
                            <div class="cp-menu-sub">
                                <div class="anim-title-left-wrap lang-dropdown-wrapper" @click="state.langMenuOpen = !state.langMenuOpen" v-click-outside="() => state.langMenuOpen = false">
                                    <div class="cp-btn-sub">
                                        <div class="cp-btn-inner"><div class="cp-btn-text"><span class="zh">{{ t('title.langName') }}</span><span class="en">Language</span></div></div>
                                    </div>
                                    <transition @enter="onMenuEnter" @leave="onMenuLeave" css="false">
                                        <div class="lang-menu" v-show="state.langMenuOpen">
                                            <div class="lang-item" v-for="(langData, key) in availLangs" :key="key" @click.stop="switchLang(key)">
                                                <span>{{ getLangDisplayName(key) }}</span>
                                            </div>
                                        </div>
                                    </transition>
                                </div>
                                <div class="anim-title-left-wrap">
                                    <div class="cp-btn-sub" @click="cmdOptions">
                                        <div class="cp-btn-inner"><div class="cp-btn-text"><span class="zh">{{ t('title.options') }}</span><span class="en">Config</span></div></div>
                                    </div>
                                </div>
                            </div>

                            <div class="cp-menu-main">
                                <div class="anim-title-right-wrap" style="transform: translateX(-30px);">
                                    <div class="cp-btn-main highlight" @click="cmdNewGame">
                                        <div class="cp-btn-inner"><div class="cp-btn-text"><span class="zh">{{ t('title.newGame') }}</span><span class="en">Start Game</span></div></div>
                                    </div>
                                </div>
                                <div class="anim-title-right-wrap">
                                    <div class="cp-btn-main" :class="{disabled: !state.hasSave}" @click="state.hasSave ? cmdLoadGame() : null">
                                        <div class="cp-btn-inner"><div class="cp-btn-text"><span class="zh">{{ t('title.continue') }}</span><span class="en">Load</span></div></div>
                                    </div>
                                </div>
                                <div class="anim-title-right-wrap">
                                    <div class="cp-btn-main" @click="cmdExit">
                                        <div class="cp-btn-inner"><div class="cp-btn-text"><span class="zh">{{ t('title.exit') }}</span><span class="en">Exit</span></div></div>
                                    </div>
                                </div>
                            </div>

                            <div class="anim-title-logo-wrap">
                                <h1 class="cp-logo-main">${params.gameTitle}</h1>
                                <div class="cp-logo-sub">${params.gameSubTitle}</div>
                            </div>
                        </div>
                    </transition>

                    <transition @enter="onOptionsEnter" @leave="onOptionsLeave" css="false">
                        <div v-show="state.activeScene === 'options'" style="width:100%; height:100%; position:absolute;">
                            <div class="anim-opt-header-wrap">
                                <div class="screen-header">{{ t('title.options') }}</div>
                            </div>
                            <div class="opt-container">
                                <div class="anim-opt-section-wrap">
                                    <div class="opt-section">
                                        <div class="opt-section-inner">
                                            <div class="opt-section-title">{{ t('title.audioSettings') }}</div>
                                            <div class="opt-row"><div class="opt-label">{{ t('title.bgmVol') }}</div><input type="range" class="opt-slider" min="0" max="100" v-model.number="config.bgmVolume" @change="playCursor"><div class="opt-val">{{ config.bgmVolume }}</div></div>
                                            <div class="opt-row"><div class="opt-label">{{ t('title.seVol') }}</div><input type="range" class="opt-slider" min="0" max="100" v-model.number="config.seVolume" @change="playCursor"><div class="opt-val">{{ config.seVolume }}</div></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="anim-opt-section-wrap">
                                    <div class="opt-section">
                                        <div class="opt-section-inner">
                                            <div class="opt-section-title">{{ t('title.gameSettings') }}</div>
                                            <div class="opt-row"><div class="opt-label">{{ t('title.alwaysDash') }}</div><label class="opt-switch"><input type="checkbox" v-model="config.alwaysDash" @change="playCursor"><span class="opt-slider-btn"></span></label></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="anim-opt-back-wrap">
                                <button class="cm-btn-back" @click="cmdBackToMenu"><span>{{ t('title.back') }}</span></button>
                            </div>
                        </div>
                    </transition>

                    <transition @enter="onFileEnter" @leave="onFileLeave" css="false">
                        <div v-show="state.activeScene === 'file'" style="width:100%; height:100%; position:absolute;">
                            <div class="anim-file-header-wrap">
                                <div class="screen-header">{{ state.fileMode === 'save' ? t('title.saveTitle') : t('title.loadTitle') }}</div>
                            </div>
                            <div class="save-grid-wrapper">
                                <div class="save-grid">
                                    <div v-for="slot in state.savefiles" :key="slot.id" class="anim-file-slot-wrap">
                                        <div class="save-slot" :class="{empty: !slot.info}" @click="onFileSlotClick(slot)">
                                            <div class="slot-id">DATA {{ slot.id < 10 ? '0'+slot.id : slot.id }}</div>
                                            <div class="slot-data" v-if="slot.info">
                                                <div class="slot-time">⏳ {{ slot.info.playtime }}</div>
                                                <div class="slot-date">{{ formatDate(slot.info.timestamp) }}</div>
                                            </div>
                                            <div class="slot-empty" v-else>{{ t('title.emptySlot') }}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="anim-file-back-wrap">
                                <button class="cm-btn-back" @click="cmdBackToMenu"><span>{{ t('title.back') }}</span></button>
                            </div>
                        </div>
                    </transition>

                </div>
            </div>
        `;
        document.body.appendChild(root);

        const { createApp, reactive, computed, watch, onMounted, onUnmounted, ref } = window.Vue || Vue;

        const app = createApp({
            directives: {
                'click-outside': {
                    mounted(el, binding) {
                        el.clickOutsideEvent = function(event) {
                            if (!(el == event.target || el.contains(event.target))) binding.value(event);
                        };
                        document.body.addEventListener('click', el.clickOutsideEvent);
                    },
                    unmounted(el) { document.body.removeEventListener('click', el.clickOutsideEvent); }
                }
            },
            setup() {
                const state = reactive({
                    inTitleScene: false, 
                    activeScene: null,  
                    fileMode: 'load',   
                    langMenuOpen: false,
                    hasSave: false,
                    savefiles: [],
                    canvasWidth: 1920,
                    canvasHeight: 1080,
                    canvasLeft: 0,
                    canvasTop: 0,
                    gameWidth: 1920,
                    gameHeight: 1080
                });

                let isLock = false;

                const config = reactive({
                    bgmVolume: ConfigManager.bgmVolume,
                    bgsVolume: ConfigManager.bgsVolume,
                    meVolume: ConfigManager.meVolume,
                    seVolume: ConfigManager.seVolume,
                    alwaysDash: ConfigManager.alwaysDash,
                    commandRemember: ConfigManager.commandRemember
                });

                watch(config, (newVal) => {
                    ConfigManager.bgmVolume = newVal.bgmVolume;
                    ConfigManager.bgsVolume = newVal.bgsVolume;
                    ConfigManager.meVolume = newVal.meVolume;
                    ConfigManager.seVolume = newVal.seVolume;
                    ConfigManager.alwaysDash = newVal.alwaysDash;
                    ConfigManager.commandRemember = newVal.commandRemember;
                    ConfigManager.save();
                }, { deep: true });

                const playCursor = () => SoundManager.playCursor();

                const t = (path) => {
                    if (Core && Core.I18n && Core.I18n.reactiveState) {
                        const _trigger = Core.I18n.reactiveState.lang; 
                        return Core.I18n.translate(path);
                    }
                    return path;
                };

                const availLangs = computed(() => {
                    if (Core && Core.I18n && Core.I18n.reactiveState) {
                        const _trigger = Core.I18n.reactiveState.ready; 
                    }
                    return (Core && Core.I18n && Core.I18n.data) ? Core.I18n.data : {};
                });

                const getLangDisplayName = (key) => {
                    if (Core && Core.I18n && Core.I18n.data && Core.I18n.data[key]) {
                        const dict = Core.I18n.data[key];
                        if (dict.title && dict.title.langName) return dict.title.langName;
                    }
                    // 韓国語(ko)のフォールバック設定を削除、日・英・中の3言語へ最適化
                    const fallbacks = { ja: '日本語', zh: '中文', en: 'English' };
                    return fallbacks[key] || key.toUpperCase();
                };

                const switchLang = (key) => {
                    SoundManager.playOk();
                    Core.I18n.changeLanguage(key);
                    ConfigManager.save();
                    state.langMenuOpen = false;
                };
                
                const formatDate = (timestamp) => {
                    if (!timestamp) return '';
                    const d = new Date(timestamp);
                    const year = d.getFullYear();
                    const month = d.getMonth() + 1;
                    const date = d.getDate();
                    const hours = String(d.getHours()).padStart(2, '0');
                    const minutes = String(d.getMinutes()).padStart(2, '0');
                    return `${year}/${month}/${date} ${hours}:${minutes}`;
                };

                const updateCanvasMetrics = () => {
                    const canvas = document.getElementById('GameCanvas');
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        state.canvasWidth = Math.max(rect.width, 1);
                        state.canvasHeight = Math.max(rect.height, 1);
                        state.canvasLeft = rect.left || 0;
                        state.canvasTop = rect.top || 0;
                        
                        if (typeof Graphics !== 'undefined') {
                            state.gameWidth = Math.max(canvas.width || Graphics.width || Graphics.boxWidth || 1920, 1);
                            state.gameHeight = Math.max(canvas.height || Graphics.height || Graphics.boxHeight || 1080, 1);
                        }
                    }
                };

                onMounted(() => {
                    window.addEventListener('resize', updateCanvasMetrics);
                    updateCanvasMetrics();
                    setTimeout(updateCanvasMetrics, 50);
                    setTimeout(updateCanvasMetrics, 200);
                });
                onUnmounted(() => window.removeEventListener('resize', updateCanvasMetrics));

                const isVisible = computed(() => {
                    if (state.inTitleScene) return true;
                    return state.activeScene !== null;
                });

                const sandboxStyle = computed(() => {
                    const gw = state.gameWidth;
                    const gh = state.gameHeight;
                    const cw = state.canvasWidth;
                    const ch = state.canvasHeight;
                    const scale = Math.min(cw / gw, ch / gh) || 1;
                    
                    return {
                        '--cm-game-width': `${gw}px`,
                        '--cm-game-height': `${gh}px`,
                        '--cm-scale': scale,
                        '--cm-canvas-left': `${(cw - gw * scale) / 2}px`,
                        '--cm-canvas-top': `${(ch - gh * scale) / 2}px`
                    };
                });

                const customBgStyle = computed(() => {
                    let bgImg = '';
                    if (SceneManager._backgroundBitmap && (state.activeScene === 'file' || state.activeScene === 'options')) {
                        bgImg = `url('${SceneManager._backgroundBitmap.canvas.toDataURL()}')`;
                    } else if (params.titleBgImage) {
                        bgImg = `url('img/titles1/${params.titleBgImage}.png')`;
                    }
                    return { 
                        backgroundImage: bgImg,
                        filter: (state.activeScene === 'file' || state.activeScene === 'options') ? 'grayscale(50%) brightness(0.5) contrast(1.2)' : 'none'
                    };
                });

                const cmdNewGame = () => {
                    if (isLock) return; isLock = true;
                    SoundManager.playOk();
                    state.activeScene = null; 
                    setTimeout(() => { DataManager.setupNewGame(); SceneManager.goto(Scene_Map); isLock = false; }, 300); 
                };

                const cmdLoadGame = () => { 
                    if (isLock) return; isLock = true;
                    SoundManager.playOk(); 
                    if (state.inTitleScene) {
                        state.fileMode = 'load';
                        refreshSavefiles();
                        state.activeScene = 'file'; 
                        setTimeout(() => { isLock = false; }, 300);
                    } else {
                        state.activeScene = null;
                        setTimeout(() => { SceneManager.push(Scene_Load); isLock = false; }, 250);
                    }
                };

                const cmdOptions = () => { 
                    if (isLock) return; isLock = true;
                    SoundManager.playOk(); 
                    if (state.inTitleScene) { state.activeScene = 'options'; setTimeout(() => { isLock = false; }, 300); }
                    else { state.activeScene = null; setTimeout(() => { SceneManager.push(Scene_Options); isLock = false; }, 250); }
                };

                const cmdExit = () => { SoundManager.playCancel(); SceneManager.exit(); };
                
                const cmdBackToMenu = () => { 
                    if (isLock) return; isLock = true;
                    SoundManager.playCancel(); 
                    if (state.activeScene === 'options') ConfigManager.save();
                    if (state.inTitleScene) { state.activeScene = 'title'; setTimeout(() => { isLock = false; }, 300); }
                    else { state.activeScene = null; setTimeout(() => { SceneManager.pop(); isLock = false; }, 250); }
                };

                const refreshSavefiles = () => {
                    const max = 12; 
                    const arr = [];
                    for(let i=1; i<=max; i++) arr.push({ id: i, info: DataManager.savefileInfo(i) });
                    state.savefiles = arr;
                };

                const onFileSlotClick = (slot) => {
                    if (isLock) return;
                    if (state.fileMode === 'save') { 
                        SoundManager.playSave(); $gameSystem.onBeforeSave(); 
                        DataManager.saveGame(slot.id).then(() => refreshSavefiles()); 
                    } else { 
                        if (slot.info) { 
                            isLock = true;
                            SoundManager.playLoad(); 
                            state.activeScene = null;
                            setTimeout(() => {
                                DataManager.loadGame(slot.id).then(() => { 
                                    SceneManager.goto(Scene_Map); $gameSystem.onAfterLoad(); 
                                    isLock = false;
                                }).catch(() => { SoundManager.playBuzzer(); isLock = false; }); 
                            }, 300);
                        } else { SoundManager.playBuzzer(); } 
                    }
                };
                
                const onSplashEnter = (el, done) => {
                    gsap.set(el, { opacity: 1, scale: 1 });
                    const tl = gsap.timeline({ onComplete: () => {
                        gsap.delayedCall(1.0, () => state.activeScene = 'title'); 
                        CM_Anime.hasSplashed = true;
                        done();
                    }});
                    tl.fromTo(el.querySelectorAll('.anim-splash-wrap'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.2, ease: "power3.out" });
                };
                const onSplashLeave = (el, done) => gsap.to(el, { opacity: 0, duration: 0.4, ease: "power2.inOut", onComplete: done });

                const onTitleEnter = (el, done) => {
                    gsap.set(el, { opacity: 1, scale: 1 });
                    const tl = gsap.timeline({ onComplete: () => {
                        gsap.set(el.querySelectorAll(".anim-title-right-wrap, .anim-title-left-wrap, .anim-title-logo-wrap"), { clearProps: "transform,opacity" });
                        done();
                    }});
                    tl.fromTo(el.querySelectorAll(".anim-title-left-wrap"), { x: -300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: "back.out(1.2)" }, 0.1);
                    tl.fromTo(el.querySelectorAll(".anim-title-right-wrap"), { x: 300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: "back.out(1.2)" }, 0.15);
                    tl.fromTo(el.querySelector(".anim-title-logo-wrap"), { scale: 1.5, opacity: 0, rotation: 5 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: "power3.out" }, 0.2);
                };
                const onTitleLeave = (el, done) => {
                    const tl = gsap.timeline({ onComplete: done });
                    tl.to(el.querySelectorAll(".anim-title-left-wrap"), { x: -250, opacity: 0, duration: 0.25, stagger: 0.03, ease: "power2.in" }, 0);
                    tl.to(el.querySelectorAll(".anim-title-right-wrap"), { x: 250, opacity: 0, duration: 0.25, stagger: 0.03, ease: "power2.in" }, 0);
                    tl.to(el.querySelector(".anim-title-logo-wrap"), { scale: 1.3, opacity: 0, duration: 0.25, ease: "power2.in" }, 0);
                };

                const onMenuEnter = (el, done) => {
                    gsap.set(el, { opacity: 1, scale: 1 });
                    gsap.fromTo(el, { opacity: 0, y: -15 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out", onComplete: () => { gsap.set(el, { clearProps: "transform,opacity" }); done(); } });
                };
                const onMenuLeave = (el, done) => gsap.to(el, { opacity: 0, y: -15, duration: 0.15, onComplete: done });

                const onFileEnter = (el, done) => {
                    gsap.set(el, { opacity: 1, scale: 1 }); 
                    const tl = gsap.timeline({ onComplete: () => {
                        gsap.set(el.querySelectorAll(".anim-file-header-wrap, .anim-file-slot-wrap, .anim-file-back-wrap"), { clearProps: "transform,opacity" });
                        done();
                    }});
                    tl.fromTo(el.querySelector(".anim-file-header-wrap"), { x: -100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" });
                    tl.fromTo(el.querySelectorAll(".anim-file-slot-wrap"), { y: 60, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.4, stagger: 0.05, ease: "power3.out" }, "-=0.2");
                    tl.fromTo(el.querySelector(".anim-file-back-wrap"), { x: 100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, "-=0.2");
                };
                const onFileLeave = (el, done) => gsap.to(el, { scale: 0.95, opacity: 0, duration: 0.2, onComplete: done });

                const onOptionsEnter = (el, done) => {
                    gsap.set(el, { opacity: 1, scale: 1 }); 
                    const tl = gsap.timeline({ onComplete: () => {
                        gsap.set(el.querySelectorAll(".anim-opt-header-wrap, .anim-opt-section-wrap, .anim-opt-back-wrap"), { clearProps: "transform,opacity" });
                        done();
                    }});
                    tl.fromTo(el.querySelector(".anim-opt-header-wrap"), { x: -100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" });
                    tl.fromTo(el.querySelectorAll(".anim-opt-section-wrap"), { y: 40, scale: 0.95, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.4, stagger: 0.15, ease: "power3.out" }, "-=0.2");
                    tl.fromTo(el.querySelector(".anim-opt-back-wrap"), { x: 100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, "-=0.2");
                };
                const onOptionsLeave = (el, done) => gsap.to(el, { scale: 0.95, opacity: 0, duration: 0.2, onComplete: done });

                return { 
                    state, isVisible, config, t, availLangs, switchLang, sandboxStyle, customBgStyle, getLangDisplayName,
                    cmdNewGame, cmdLoadGame, cmdOptions, cmdExit, cmdBackToMenu, onFileSlotClick, refreshSavefiles, playCursor, formatDate,
                    onSplashEnter, onSplashLeave, onTitleEnter, onTitleLeave, onMenuEnter, onMenuLeave,
                    onFileEnter, onFileLeave, onOptionsEnter, onOptionsLeave
                };
            }
        });

        CM_Anime.VueApp = app.mount(root);
    };

    //=============================================================================
    // 3. ライフサイクルインターセプト (Scene_Base, Window_Base 置換)
    //=============================================================================
    const _DataManager_maxSavefiles = DataManager.maxSavefiles;
    DataManager.maxSavefiles = function() {
        return 12;
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() { _Scene_Boot_start.call(this); CM_Anime.initVueApp(); };

    const _Scene_Title_create = Scene_Title.prototype.create;
    Scene_Title.prototype.create = function() { Scene_Base.prototype.create.call(this); };
    
    Scene_Title.prototype.isBusy = function() { return Scene_Base.prototype.isBusy.call(this); };
    Scene_Title.prototype.update = function() { Scene_Base.prototype.update.call(this); };
    
    Scene_Title.prototype.start = function() {
        Scene_Base.prototype.start.call(this); 
        SceneManager.clearStack(); this.playTitleMusic();
        if (CM_Anime.VueApp) {
            CM_Anime.VueApp.state.inTitleScene = true; 
            CM_Anime.VueApp.state.hasSave = DataManager.isAnySavefileExists();
            CM_Anime.VueApp.state.activeScene = !CM_Anime.hasSplashed ? 'splash' : 'title';
        }
    };
    
    Scene_Title.prototype.terminate = function() { 
        Scene_Base.prototype.terminate.call(this); 
        if (CM_Anime.VueApp) {
            CM_Anime.VueApp.state.inTitleScene = false; 
        }
        if (typeof gsap !== 'undefined') {
            gsap.killTweensOf("*");
        }
    };

    const _Scene_File_create = Scene_File.prototype.create;
    Scene_File.prototype.create = function() { Scene_MenuBase.prototype.create.call(this); };
    Scene_File.prototype.start = function() { 
        Scene_MenuBase.prototype.start.call(this); 
        if (CM_Anime.VueApp) { CM_Anime.VueApp.state.fileMode = this.mode(); CM_Anime.VueApp.refreshSavefiles(); CM_Anime.VueApp.state.activeScene = 'file'; }
    };
    Scene_File.prototype.update = function() { Scene_MenuBase.prototype.update.call(this); };
    Scene_File.prototype.terminate = function() { Scene_MenuBase.prototype.terminate.call(this); };

    const _Scene_Options_create = Scene_Options.prototype.create;
    Scene_Options.prototype.create = function() { Scene_MenuBase.prototype.create.call(this); };
    Scene_Options.prototype.start = function() { 
        Scene_MenuBase.prototype.start.call(this); 
        if (CM_Anime.VueApp) {
            CM_Anime.VueApp.config.bgmVolume = ConfigManager.bgmVolume;
            CM_Anime.VueApp.config.bgsVolume = ConfigManager.bgsVolume;
            CM_Anime.VueApp.config.meVolume = ConfigManager.meVolume;
            CM_Anime.VueApp.config.seVolume = ConfigManager.seVolume;
            CM_Anime.VueApp.config.alwaysDash = ConfigManager.alwaysDash;
            CM_Anime.VueApp.config.commandRemember = ConfigManager.commandRemember;
            CM_Anime.VueApp.state.activeScene = 'options';
        }
    };
    Scene_Options.prototype.update = function() { Scene_MenuBase.prototype.update.call(this); };
    Scene_Options.prototype.terminate = function() { Scene_MenuBase.prototype.terminate.call(this); };

})();