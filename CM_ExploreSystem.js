/*:
 * @target MZ
 * @plugindesc [v11.0] AVG ポイントクリック探索システム (シネマティック・トランジション対応版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 * @base CM_TimeSurvivalSystem
 * 
 * @param GlobalMaskImage
 * @text グローバル遮罩(Mask)画像
 * @desc 探索中常に最前面(指定Z-Index)に表示されるオーバーレイ画像。(img/pictures/ 内)
 * @type file
 * @dir img/pictures/
 * @default 
 * 
 * @param GlobalMaskZIndex
 * @text グローバル遮罩 Z-Index
 * @desc 遮罩の深度層 (デフォルト: 30。背景は9、NPCは15、紙人形は40+)
 * @type number
 * @min 0
 * @max 9999
 * @default 30
 * 
 * @help
 * ============================================================================
 * アーキテクチャ更新 (v11.0 シネマティック演出の統合):
 * 1. 【純色カーテン・トランジション】: 場面転換時に右から左へスワイプする
 *    漆黒の帷幕（カーテン）アニメーションを実装。WebGL背景の切り替えを
 *    完全に覆い隠し、シームレスな画面遷移を実現します。
 * 2. 【Stagger(時差)ポップイン】: 背景の遷移完了後、POIノードが 0.08秒の
 *    時差を伴って、GSAPの `back.out` イージングで順番に弾け出ます。
 * 3. 【イベントロック】: トランジション中は操作が完全ロックされ、
 *    アニメーションの競合や誤操作を防止します。
 * ============================================================================
 *
 * @command StartExplore
 * @text 探索シーン開始
 * @arg filepath
 * @text シーンファイルパス
 * @desc data/room/ ディレクトリからの相対パスを指定。
 * @type string
 *
 * @command EndExplore
 * @text 探索シーン終了
 */

(() => {
    "use strict";
   
    window.CM_Explore = window.CM_Explore || {};
    const CME = window.CM_Explore;
   
    CME.Param = {
        globalMaskImage: PluginManager.parameters("CM_ExploreSystem")['GlobalMaskImage'] || "",
        globalMaskZ: Number(PluginManager.parameters("CM_ExploreSystem")['GlobalMaskZIndex'] || 30)
    };
   
    CME.State = { 
        isActive: false, data: [], currentScene: null, tick: 0, 
        characters: [], equipment: null, isEventRunning: false,
        pendingCosts: null,
        isInteractionLocked: false 
    };
    CME.EventQueue = []; 
    CME._sceneCache = {}; 
    CME.GlobalEvents = []; 
   
    //=============================================================================
    // 1. 初期化とステートマシンの構築
    //=============================================================================
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._cmEventTriggers = {}; 
        this._cmPoiStates = {}; 
    };
   
    CME.registerProviders = function() {
        if (window.CM_Core && typeof window.CM_Core.registerRef === 'function') {
            window.CM_Core.registerRef('map', function(id, prop) {
                const sceneId = String(id).trim();
                if (CME.State.currentScene && CME.State.currentScene.id === sceneId) {
                    return CME.State.currentScene.name || sceneId;
                }
                if (CME._sceneCache && CME._sceneCache[sceneId]) {
                    return CME._sceneCache[sceneId].name || sceneId;
                }
                return sceneId;
            });
        }
    };
   
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() { 
        _Scene_Boot_start.call(this); 
        CME.initUI(); 
        CME.registerProviders();
        
        fetch('data/GlobalEvents.json')
            .then(res => res.ok ? res.json() : [])
            .then(data => { CME.GlobalEvents = data; })
            .catch(e => { 
                console.warn("[CM_Explore] ⚠️ GlobalEvents.json のフェッチに失敗しました:", e); 
                CME.GlobalEvents = []; 
            });
    };
   
    CME.getLocalizedText = function(data) {
        if (!data) return "";
        let textStr = "";
        
        if (typeof data === 'string') {
            textStr = data.trim();
        } else {
            const lang = ConfigManager.currentLang || 'ja';
            textStr = data[lang] || data['zh'] || Object.values(data)[0] || "";
        }
        
        if (window.CM_Core && window.CM_Core.I18n && typeof window.CM_Core.I18n.translate === 'function') {
            return window.CM_Core.I18n.translate(textStr);
        }
        return textStr;
    };
   
    //=============================================================================
    // 2. アイテムD&D インタラクション API
    //=============================================================================
    CME.getPoiAcceptedItems = function(poiId) {
        if (!CME.State.currentScene || !CME.State.currentScene.points) return [];
        const p = CME.State.currentScene.points.find(x => x.id === poiId);
        if (!p || !p.itemInteractions) return [];
        return p.itemInteractions.map(i => i.itemId);
    };
   
    CME.handleItemInteraction = function(poiId, itemDef) {
        if (!CME.State.currentScene || !CME.State.currentScene.points) return { success: false };
        const p = CME.State.currentScene.points.find(x => x.id === poiId);
        if (!p) return { success: false };
   
        CME.State.isInteractionLocked = true;
        setTimeout(() => { CME.State.isInteractionLocked = false; }, 300);
   
        if (p.itemInteractions && p.itemInteractions.length > 0) {
            const interaction = p.itemInteractions.find(i => i.itemId === itemDef.id);
            if (interaction) {
                if (interaction.condition && !CME.evaluateCondition(interaction.condition)) {
                    return { success: false };
                }
                
                if (interaction.events && interaction.events.length > 0) {
                    if (window.CM_Dialogue) {
                        window.CM_Dialogue.executeEvents(interaction.events);
                    }
                } 
                else if (interaction.actions && interaction.actions.length > 0) {
                    interaction.actions.forEach(act => CME.enqueueEvent(act));
                }
                
                return { success: true, consume: interaction.consume !== false };
            }
        }
        return { success: false };
    };
   
    //=============================================================================
    // 3. UI/CSS 管線 (シネマティック・トランジション対応)
    //=============================================================================
    CME.initUI = function() {
        if (document.getElementById('cm-explore-container')) return;
        const style = document.createElement('style');
        style.innerHTML = `
        #cm-explore-container { display: none; background: transparent; z-index: 8000 !important; }
        #cm-explore-container.active { display: block; }
        #cm-explore-points { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
        
        /* 🌟 シネマティック純色カーテン */
        #cm-scene-transition-curtain {
            position: absolute; top: 0; left: 100%; width: 100%; height: 100%;
            background: #0a0a0f; z-index: 9999; pointer-events: none;
            box-shadow: 0 0 80px rgba(0, 0, 0, 0.9);
        }
        
        .poi-btn { position: absolute; width: 50px; height: 50px; cursor: pointer; pointer-events: auto; display: flex; justify-content: center; align-items: center; transition: box-shadow 0.2s, background 0.2s; will-change: transform, opacity; }
        .poi-btn::before { content: ""; position: absolute; width: 100%; height: 100%; background: rgba(0, 242, 254, 0.4); border: 2px solid #00f2fe; border-radius: 50%; box-shadow: 0 0 15px rgba(0, 242, 254, 0.8); transition: all 0.3s; z-index: -1; animation: poiPulse 2s infinite; }
        .poi-btn:hover { z-index: 999 !important; }
        .poi-btn:hover::before { transform: scale(1.3); background: rgba(224, 108, 138, 0.6); border-color: #e06c8a; box-shadow: 0 0 25px #e06c8a; animation: none; }
        @keyframes poiPulse { 0% { box-shadow: 0 0 10px rgba(0,242,254,0.5); } 50% { box-shadow: 0 0 25px rgba(0,242,254,1); } 100% { box-shadow: 0 0 10px rgba(0,242,254,0.5); } }
        .poi-icon { font-size: 26px; text-shadow: 0 2px 5px rgba(0,0,0,0.8); transition: transform 0.2s; }
        .poi-btn:hover .poi-icon { transform: scale(1.1); }
        .poi-btn.icon-hidden::before, .poi-btn.icon-hidden .poi-icon { display: none; }
        
        .poi-npc { border-radius: 8px !important; border: 2px solid #e06c8a !important; box-shadow: 0 0 15px rgba(224, 108, 138, 0.8) !important; background-color: rgba(0,0,0,0.8); width: 60px; height: 60px;}
        .poi-npc::before { display: none !important; }
        .poi-npc:hover { box-shadow: 0 0 25px #e06c8a !important; }

        .poi-label { position: absolute; top: -35px; background: rgba(0,0,0,0.8); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 14px; white-space: nowrap; pointer-events: none; border: 1px solid rgba(224,108,138,0.5); font-weight: bold; text-shadow: 0 1px 3px #000; box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 101; }
        
        .poi-tooltip { position: absolute; top: -45px; background: var(--cm-bg-glass, rgba(10,15,25,0.85)); color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: bold; font-family: var(--cm-font-bold, sans-serif); white-space: nowrap; pointer-events: none; border: 1px solid rgba(0, 242, 254, 0.5); opacity: 0; transform: translateY(10px); transition: all 0.2s ease-out; box-shadow: 0 5px 15px rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 100; letter-spacing: 1px;}
        .poi-btn:hover .poi-tooltip { opacity: 1; transform: translateY(0); }
        
        .tooltip-cost { display: inline-flex; gap: 12px; margin-left: 10px; padding-left: 10px; border-left: 1px solid rgba(255,255,255,0.3); }
        .cost-item { font-size: 12px; }
        `;
        document.head.appendChild(style);
        
        const container = document.createElement('div'); 
        container.id = 'cm-explore-container';
        container.className = 'cm-sandbox-root';
        container.innerHTML = `
            <div id="cm-explore-points"></div>
            <div id="cm-scene-transition-curtain"></div>
        `;
        document.body.appendChild(container);
    };
   
    //=============================================================================
    // 4. POIライフサイクル
    //=============================================================================
    CME.isPoiAvailable = function(p) {
        if (!$gameSystem._cmPoiStates) return true;
        const stateKey = `${CME.State.currentScene.id}_${p.id}`;
        const state = $gameSystem._cmPoiStates[stateKey];
        if (!state) return true;
   
        if (state.mode === 'once') return false;
        
        if (state.mode === 'daily') {
            const sys = $gameSystem._cmSurvival;
            if (!sys) return true;
            return sys.day > state.lastDay; 
        }
        
        if (state.mode === 'cooldown') {
            const sys = $gameSystem._cmSurvival;
            if (!sys) return true;
            const cd = p.cooldownTime !== undefined ? Number(p.cooldownTime) : 60;
            return sys.totalMinutes >= (state.lastMin + cd); 
        }
        
        return true;
    };
   
    //=============================================================================
    // 5. 大統一Z-Index: マップレンダリングパッチ
    //=============================================================================
    const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function() {
        _Spriteset_Map_createLowerLayer.call(this);
        
        if (this._baseSprite) {
            this._baseSprite.sortableChildren = true;
            
            this._exploreBgSprite = new Sprite();
            this._exploreBgSprite.zIndex = 9;
            this._baseSprite.addChild(this._exploreBgSprite);
   
            this._exploreMaskSprite = new Sprite();
            this._exploreMaskSprite.zIndex = CME.Param.globalMaskZ;
            this._exploreMaskSprite.opacity = 0;
            this._baseSprite.addChild(this._exploreMaskSprite);
        }
    };
   
    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);
        
        // --- 背景の更新 ---
        if (CME.State.isActive && CME.State.currentScene && this._exploreBgSprite) {
            let targetBg = CME.State.currentScene.bgImage; 
   
            if (window.CM_TimeSurvival && CME.State.currentScene.timeBgs) {
                for (let i = 0; i < CME.State.currentScene.timeBgs.length; i++) {
                    let tb = CME.State.currentScene.timeBgs[i];
                    if (tb.timeCond && tb.timeCond.trim() !== "" && tb.bgImage && tb.bgImage.trim() !== "") {
                        if (window.CM_TimeSurvival.isTimeMatch(tb.timeCond)) {
                            targetBg = tb.bgImage;
                            break; 
                        }
                    }
                }
            }
   
            if (this._exploreBgSprite._bgName !== targetBg || this._exploreBgSprite._sceneId !== CME.State.currentScene.id) {
                if (targetBg && targetBg.trim() !== "") {
                    this._exploreBgSprite.bitmap = ImageManager.loadBitmap('img/room/', targetBg.trim());
                } else {
                    this._exploreBgSprite.bitmap = null;
                }
                this._exploreBgSprite._sceneId = CME.State.currentScene.id;
                this._exploreBgSprite._bgName = targetBg;
            }
            this._exploreBgSprite.visible = true;
        } else if (this._exploreBgSprite) {
            this._exploreBgSprite.visible = false;
            this._exploreBgSprite._sceneId = null;
            this._exploreBgSprite._bgName = null;
        }
   
        // --- グローバル遮罩(Mask)の更新 ---
        if (this._exploreMaskSprite) {
            let maskImg = CME.Param.globalMaskImage;
            
            if (CME.State.isActive && CME.State.currentScene && CME.State.currentScene.maskImage !== undefined) {
                maskImg = CME.State.currentScene.maskImage;
            }
   
            if (maskImg && maskImg.trim() !== "") {
                if (this._exploreMaskSprite._imageName !== maskImg) {
                    this._exploreMaskSprite.bitmap = ImageManager.loadPicture(maskImg.trim());
                    this._exploreMaskSprite._imageName = maskImg;
                }
                
                if (CME.State.currentScene && CME.State.currentScene.maskZIndex !== undefined) {
                    this._exploreMaskSprite.zIndex = Number(CME.State.currentScene.maskZIndex);
                } else {
                    this._exploreMaskSprite.zIndex = CME.Param.globalMaskZ;
                }
   
                const isCinematic = window.CM_Dialogue && window.CM_Dialogue.UI && window.CM_Dialogue.UI.isCinematic;
                const targetOpacity = isCinematic ? 0 : 255;
                this._exploreMaskSprite.opacity += (targetOpacity - this._exploreMaskSprite.opacity) * 0.1;
                
                this._exploreMaskSprite.visible = true;
            } else {
                this._exploreMaskSprite.visible = false;
                this._exploreMaskSprite._imageName = null;
                this._exploreMaskSprite.opacity = 0;
            }
        }
    };
   
    //=============================================================================
    // 6. イベントスケジューリング
    //=============================================================================
    CME.onNewDay = function() {
        if ($gameSystem) $gameSystem._cmEventTriggers = {};
    };
   
    CME.enqueueEvent = function(ev) {
        if (ev.isPriority) CME.EventQueue.unshift(ev); 
        else CME.EventQueue.push(ev);
    };
   
    CME.checkTimeEvents = function() {
        if (!CME.State.currentScene) return;
        const sys = $gameSystem._cmSurvival;
        const currentDay = sys ? sys.day : 1;
        let pending = [];
   
        if (CME.GlobalEvents && Array.isArray(CME.GlobalEvents)) {
            CME.GlobalEvents.forEach((te) => {
                let evt = { ...te };
                evt.id = `ge_${te.id}`;
                evt._isTimeEvent = true;
                if (CME.isValidToTrigger(evt, currentDay)) pending.push(evt);
            });
        }
   
        const sceneEvents = CME.State.currentScene.timeEvents || [];
        sceneEvents.forEach((te, i) => {
            let evt = { ...te };
            evt.id = te.id || `te_scene_${CME.State.currentScene.id}_${i}`;
            evt._isTimeEvent = true;
            if (CME.isValidToTrigger(evt, currentDay)) pending.push(evt);
        });
   
        pending.forEach(te => CME.enqueueEvent(te));
    };
   
    CME.isValidToTrigger = function(te, currentDay) {
        if (!$gameSystem._cmEventTriggers) $gameSystem._cmEventTriggers = {};
        if ($gameSystem._cmEventTriggers[te.id] === currentDay) return false; 
   
        if (te.days && te.days.length > 0) {
            const d = window.CM_TimeSurvival ? window.CM_TimeSurvival.getDayOfWeek() : 1;
            if (!te.days.includes(d)) return false; 
        }
   
        if (te.timeCond && te.timeCond.trim() !== "" && window.CM_TimeSurvival) {
            if (!window.CM_TimeSurvival.isTimeMatch(te.timeCond)) return false; 
        }
   
        if (te.condition && te.condition.trim() !== "") {
            if (!CME.evaluateCondition(te.condition)) return false;
        }
        return true;
    };
   
    CME.processEvent = async function(ev) {
        if (ev._isTimeEvent) {
            if (!$gameSystem._cmEventTriggers) $gameSystem._cmEventTriggers = {};
            $gameSystem._cmEventTriggers[ev.id] = $gameSystem._cmSurvival ? $gameSystem._cmSurvival.day : 1;
        }
   
        console.log(`[CM_Explore] ⚙️ イベント処理中:`, ev.actionType, ev.arg1);
        CME.State.isEventRunning = true; 
   
        if (ev.actionType === 'macro') {
            if (window.CM_Dialogue && Array.isArray(ev.macros)) {
                window.CM_Dialogue.executeEvents(ev.macros);
            }
            CME.State.isEventRunning = false;
        }
        else if (ev.actionType === 'dialogue' || ev.actionType === 'dialogue_pop') {
            if (window.CM_Dialogue) {
                const CMD = window.CM_Dialogue; 
                CMD.State.isLoadingAsync = true; 
   
                const isEasy = (ev.actionType === 'dialogue_pop');
                CMD.State.isEasyMode = isEasy;
                CMD.UI.isEasyMode = isEasy;
   
                let filepath = ev.arg1 ? ev.arg1.trim() : "DialogueData"; 
                if (!filepath.endsWith('.json')) filepath += '.json';
                
                try { 
                    let loadedData = null;
                    if (typeof CMD.fetchJsonWithFallback === 'function') {
                        loadedData = await CMD.fetchJsonWithFallback(filepath);
                    } else {
                        const res = await fetch(`data/dialogue/${filepath}`); 
                        if (res.ok) loadedData = await res.json();
                    }
   
                    if (loadedData) { 
                        const fadeScreen = document.getElementById('cm-fade-screen');
                        
                        if (!isEasy) {
                            if (fadeScreen) fadeScreen.style.opacity = 1;
                            await new Promise(r => setTimeout(r, 400)); 
                        }
                        
                        CMD.State.dialogues = loadedData;
                        CMD.playNode(Number(ev.arg2)); 
   
                        const checkInt = setInterval(() => {
                            if (!CMD.State.isActive) {
                                clearInterval(checkInt);
                                CME.State.isEventRunning = false;
                            }
                        }, 100);
   
                        setTimeout(() => { 
                            if (!isEasy && fadeScreen) fadeScreen.style.opacity = 0; 
                            CMD.State.isLoadingAsync = false; 
                        }, 150); 
                    } else {
                        CMD.State.isLoadingAsync = false;
                        CME.State.isEventRunning = false;
                    }
                } catch(e) { 
                    console.error("[CM_Explore] ❌ ダイアログ読み込みエラー:", e); 
                    CMD.State.isLoadingAsync = false; 
                    CME.State.isEventRunning = false;
                }
            } else {
                CME.State.isEventRunning = false;
            }
        } 
        else if (ev.actionType === 'transfer') { 
            CME.loadAndStart(ev.arg1); 
        } 
        else if (ev.actionType === 'script') { 
            try { new Function(ev.arg1)(); } catch (e) { console.error("[CM_Explore] ❌ Script Error:", e); } 
            CME.State.isEventRunning = false;
        } 
        else if (ev.actionType === 'switch') {
            if ($gameSwitches) $gameSwitches.setValue(Number(ev.arg1), true);
            CME.State.isEventRunning = false;
        } 
        else {
            CME.State.isEventRunning = false;
        }
    };
   
    //=============================================================================
    // 7. アクション実行
    //=============================================================================
    CME.executeAction = async function(p, el) {
        if (window.CM_TimeSurvival) {
            const ct = Number(p.costTime) || 0;
            const cHP = Number(p.costEnergy) || 0; 
            const cMP = Number(p.costSatiety) || 0; 
   
            if (ct > 0 || cHP > 0 || cMP > 0) {
                console.log(`[CM_Explore] ⏳ リソース消費を保留(Suspend)し、イベント完了後に決済します。`);
                CME.State.pendingCosts = { ct, cHP, cMP };
            }
        }
   
        if (window.CM_SurvivalHUD_VueState) {
            window.CM_SurvivalHUD_VueState.isActionRunning = true;
        }
   
        const mode = p.refreshMode || 'always';
        if (mode !== 'always' && $gameSystem._cmPoiStates) {
            const stateKey = `${CME.State.currentScene.id}_${p.id}`;
            const sys = $gameSystem._cmSurvival;
            if (mode === 'once') {
                $gameSystem._cmPoiStates[stateKey] = { mode: 'once' };
            } else if (mode === 'daily') {
                $gameSystem._cmPoiStates[stateKey] = { mode: 'daily', lastDay: sys ? sys.day : 1 };
            } else if (mode === 'cooldown') {
                $gameSystem._cmPoiStates[stateKey] = { mode: 'cooldown', lastMin: sys ? sys.totalMinutes : 0 };
            }
            if (el) el.style.display = 'none';
        }
   
        let actionsToRun = [];
        if (p.actions && p.actions.length > 0) {
            actionsToRun = p.actions;
        } else if (p.actionType) {
            actionsToRun = [{
                condition: p.condition || "",
                actionType: p.actionType,
                arg1: p.arg1,
                arg2: p.arg2
            }];
        }
   
        actionsToRun.forEach(act => {
            if (CME.evaluateCondition(act.condition)) {
                CME.enqueueEvent(act);
            }
        });
    };
   
    //=============================================================================
    // 8. シネマティック・トランジション & レンダリング
    //=============================================================================
    PluginManager.registerCommand("CM_ExploreSystem", "StartExplore", function(args) { CME.loadAndStart(args.filepath); });
    PluginManager.registerCommand("CM_ExploreSystem", "EndExplore", args => CME.end());
   
    CME.loadAndStart = async function(filepath) {
        if (!filepath) return;
        let path = filepath.trim();
        if (!path.endsWith('.json')) path += '.json';
   
        try { 
            const res = await fetch(`data/room/${path}`); 
            if (res.ok) { 
                const loadedData = await res.json(); 
                const newSceneData = Array.isArray(loadedData) ? loadedData[0] : loadedData; 
   
                try {
                    if (window.CM_Dialogue && typeof window.CM_Dialogue.fetchJsonWithFallback === 'function') {
                        const charData = await window.CM_Dialogue.fetchJsonWithFallback('CharacterData.json');
                        CME.State.characters = charData || [];
                    } else {
                        const cRes = await fetch('data/dialogue/CharacterData.json');
                        if (cRes.ok) CME.State.characters = await cRes.json();
                    }
                } catch(ce) { CME.State.characters = []; }
   
                try {
                    const eRes = await fetch('data/Equipment/EquipmentData.json');
                    if (eRes.ok) CME.State.equipment = await eRes.json();
                } catch(ee) { CME.State.equipment = null; }
   
                // 🌟 新アーキテクチャ: トランジション演出の実行
                CME.executeSceneTransition(newSceneData);
            } else {
                console.error("[CM_Explore] シーンファイルが見つかりません:", path);
            }
        } catch(e) { console.error("[CM_Explore] 探索データの読み込みエラー:", e); }
    };
    
    CME.executeSceneTransition = function(newSceneData) {
        CME.State.isEventRunning = true; 
        const curtain = document.getElementById('cm-scene-transition-curtain');
        const container = document.getElementById('cm-explore-container');
        
        if (CME.State.isActive && window.gsap) {
            gsap.to('.poi-btn', { scale: 0, opacity: 0, duration: 0.2 });
        }
        
        container.classList.add('active');

        if (window.gsap && curtain) {
            // 帷幕が右から左へ覆う
            gsap.fromTo(curtain, { left: '100%' }, { left: '0%', duration: 0.45, ease: "power2.inOut", onComplete: () => {
                
                // 画面が真っ暗になった瞬間にデータ(背景)をスワップ
                CME.State.currentScene = newSceneData;
                CME.State.isActive = true;
                if (newSceneData.id) CME._sceneCache[newSceneData.id] = newSceneData;
                
                if (newSceneData.bgm && newSceneData.bgm.trim() !== "") {
                    AudioManager.playBgm({ name: newSceneData.bgm.trim(), volume: 100, pitch: 100, pan: 0 });
                }
                
                // POIを非表示状態で事前レンダリング
                CME.renderPoints(true);
                CME.checkTimeEvents();
                
                if (window.CM_SurvivalHUD_VueState) {
                    window.CM_SurvivalHUD_VueState.sceneName = CME.getLocalizedText(newSceneData.name);
                    window.CM_SurvivalHUD_VueState.isActionRunning = false; 
                    CME.State.pendingCosts = null;
                }

                // 帷幕が左へ抜け、新背景を露出させる
                gsap.to(curtain, { left: '-100%', duration: 0.45, ease: "power2.inOut", delay: 0.1, onComplete: () => {
                    const points = document.querySelectorAll('.poi-btn');
                    if (points.length > 0) {
                        // Stagger ポップイン演出
                        gsap.to(points, { 
                            scale: 1, opacity: 1, duration: 0.5, stagger: 0.08, 
                            ease: "back.out(1.5)", 
                            onComplete: () => { CME.State.isEventRunning = false; }
                        });
                    } else {
                        CME.State.isEventRunning = false;
                    }
                }});
            }});
        } else {
            // GSAP未定義時のフォールバック
            CME.State.currentScene = newSceneData;
            CME.State.isActive = true;
            if (newSceneData.id) CME._sceneCache[newSceneData.id] = newSceneData;
            CME.renderPoints(false);
            CME.checkTimeEvents();
            CME.State.isEventRunning = false;
        }
    };
   
    CME.end = function() { 
        CME.State.isEventRunning = true;
        if (window.gsap) {
            gsap.to('.poi-btn', { scale: 0, opacity: 0, duration: 0.3, onComplete: () => {
                CME.State.isActive = false; 
                CME.State.currentScene = null; 
                CME.State.isEventRunning = false;
                const container = document.getElementById('cm-explore-container'); 
                if (container) container.classList.remove('active'); 
                document.getElementById('cm-explore-points').innerHTML = ''; 
                if (window.CM_SurvivalHUD_VueState) window.CM_SurvivalHUD_VueState.sceneName = "";
            }});
        } else {
            CME.State.isActive = false; 
            CME.State.currentScene = null; 
            CME.State.isEventRunning = false;
            const container = document.getElementById('cm-explore-container'); 
            if (container) container.classList.remove('active'); 
            document.getElementById('cm-explore-points').innerHTML = ''; 
        }
    };
   
    CME.renderPoints = function(isHiddenInitial = false) {
        const pointsContainer = document.getElementById('cm-explore-points'); 
        pointsContainer.innerHTML = '';
        if (!CME.State.currentScene || !CME.State.currentScene.points) return;
        
        const eqSettings = CME.State.equipment ? CME.State.equipment.settings : {};
        const bgSize = eqSettings.npcAvatarSize || '100% 200%';
        const bgPos = eqSettings.npcAvatarPos || 'center top';
   
        const tHP = window.CM_Core && window.CM_Core.I18n ? window.CM_Core.I18n.translate('hud.hp') : "HP";
        const tMP = window.CM_Core && window.CM_Core.I18n ? window.CM_Core.I18n.translate('hud.mp') : "MP";
   
        CME.State.currentScene.points.forEach(p => {
            if (!CME.isPoiAvailable(p)) return;
            if (window.CM_TimeSurvival && !window.CM_TimeSurvival.isTimeMatch(p.timeCond)) return;
   
            const btn = document.createElement('div'); btn.className = `poi-btn icon-${p.icon}`; btn.id = p.id;
            
            let px = p.x;
            let py = p.y;
            if (px > 100 || px < -100 || py > 100 || py < -100) {
                px = Number(((px / 1280) * 100).toFixed(2));
                py = Number(((py / 720) * 100).toFixed(2));
            }
            
            // GSAPによる演出のため初期状態をインラインセット
            btn.style.left = `${px}%`; 
            btn.style.top = `${py}%`; 
            btn.style.zIndex = p.zIndex !== undefined ? p.zIndex : 10;
            btn.style.opacity = isHiddenInitial ? '0' : '1';
            btn.style.transform = isHiddenInitial ? 'translate(-50%, -50%) scale(0)' : 'translate(-50%, -50%) scale(1)';
            
            let symbol = p.icon === "search" ? "🔍" : (p.icon === "door" ? "🚪" : (p.icon === "talk" ? "💬" : (p.icon === "use" ? "✋" : "")));
            
            let pName = CME.getLocalizedText(p.name);
            let costHtml = '';
            let hasCost = false;
            
            if (p.costTime || p.costEnergy || p.costSatiety) {
                costHtml += '<div class="tooltip-cost">';
                if (p.costTime) { costHtml += `<span class="cost-item" style="color:var(--cm-color-warning, #ffeb3b);">${p.costTime} MIN</span>`; hasCost = true; }
                if (p.costEnergy) { costHtml += `<span class="cost-item" style="color:var(--cm-color-primary, #e06c8a);">${tHP} -${p.costEnergy}</span>`; hasCost = true; }
                if (p.costSatiety) { costHtml += `<span class="cost-item" style="color:var(--cm-color-secondary, #00f2fe);">${tMP} -${p.costSatiety}</span>`; hasCost = true; }
                costHtml += '</div>';
            }
   
            let isNpcMode = false;
            if (p.charId && CME.State.characters) {
                const charIdStr = String(p.charId).trim();
                const c = CME.State.characters.find(x => String(x.id).trim() === charIdStr);
                if (c) {
                    isNpcMode = true;
                    const cTitle = CME.getLocalizedText(c.title);
                    const cName = CME.getLocalizedText(c.name);
                    
                    const titleStr = cTitle ? `<span style="color:var(--cm-color-secondary, #00f2fe);font-size:12px;">[${cTitle}]</span> ` : '';
                    const charNameHtml = `${titleStr}<b style="color:var(--cm-color-primary, #e06c8a);font-size:15px;">${cName}</b>`;
                    
                    btn.classList.add('poi-npc');
                    const bgImg = c.defaultPortrait ? `url(img/pictures/${c.defaultPortrait}.png)` : 'none';
                    let avatarHtml = `<div style="width:100%; height:100%; border-radius:6px; background: ${bgImg} ${bgPos} / ${bgSize}; ${!c.defaultPortrait ? 'display:flex;justify-content:center;align-items:center;font-size:24px;color:#fff;' : ''}">${c.defaultPortrait ? '' : '👤'}</div>`;
                    let labelHtml = `<div class="poi-label">${charNameHtml}</div>`;
                    
                    btn.innerHTML = avatarHtml + labelHtml;
                    if (p.showTooltip && (pName || hasCost)) {
                        btn.innerHTML += `<div class="poi-tooltip">${pName || ''}${costHtml}</div>`;
                    }
                }
            }
   
            if (!isNpcMode) {
                btn.innerHTML = `<div class="poi-icon">${symbol}</div><div class="poi-tooltip">${pName || ''}${costHtml}</div>`;
            }
            
            btn.onmousedown = (e) => { 
                e.stopPropagation(); 
                if (CME.State.isInteractionLocked) return; 
                if (window.CM_Dialogue && window.CM_Dialogue.State.isActive) return; 
                if (CME.State.isEventRunning || CME.EventQueue.length > 0) return; 
                SoundManager.playOk(); 
                CME.executeAction(p, btn); 
            };
            
            if (!CME.evaluateCondition(p.condition)) btn.style.display = 'none';
            pointsContainer.appendChild(btn);
        });
    };
   
    CME.evaluateCondition = function(cond) { 
        if (!cond || cond.trim() === "") return true; 
        if (window.CM_Core && typeof window.CM_Core.evalCondition === 'function') {
            return window.CM_Core.evalCondition(cond);
        }
        return false;
    };
   
    const _Game_Player_canMove = Game_Player.prototype.canMove; 
    Game_Player.prototype.canMove = function() { 
        return CME.State.isActive ? false : _Game_Player_canMove.call(this); 
    };
    
    const _Scene_Map_update = Scene_Map.prototype.update; 
    Scene_Map.prototype.update = function() { 
        _Scene_Map_update.call(this); 
        if (CME.State.isActive) CME.update(); 
    };
    
    CME.update = function() { 
        if (window.CM_Dialogue && window.CM_Dialogue.State.isActive) return; 
        if (CME.State.isEventRunning) return; 
   
        if (CME.EventQueue.length > 0) {
            const ev = CME.EventQueue.shift();
            CME.processEvent(ev);
            return;
        }
   
        if (CME.State.pendingCosts) {
            if (window.CM_TimeSurvival) {
                console.log(`[CM_Explore] 💰 保留中のリソース消費を決済します。`);
                window.CM_TimeSurvival.advanceTimeAndStats(
                    CME.State.pendingCosts.ct, 
                    CME.State.pendingCosts.cHP, 
                    CME.State.pendingCosts.cMP, 
                    0
                );
            }
            CME.State.pendingCosts = null;
        }
   
        if (window.CM_SurvivalHUD_VueState && window.CM_SurvivalHUD_VueState.isActionRunning) {
            window.CM_SurvivalHUD_VueState.isActionRunning = false;
        }
   
        CME.State.tick++; 
        if (CME.State.tick >= 30) { 
            CME.State.tick = 0; 
            if (CME.State.currentScene && CME.State.currentScene.points) { 
                CME.State.currentScene.points.forEach(p => { 
                    const el = document.getElementById(p.id); 
                    if (el) {
                        const isAvailable = CME.isPoiAvailable(p);
                        const isTimeOk = window.CM_TimeSurvival ? window.CM_TimeSurvival.isTimeMatch(p.timeCond) : true;
                        el.style.display = (CME.evaluateCondition(p.condition) && isTimeOk && isAvailable) ? 'flex' : 'none'; 
                    }
                }); 
            } 
        } 
    };
})();