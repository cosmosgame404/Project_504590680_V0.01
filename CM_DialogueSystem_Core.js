/*:
 * @target MZ
 * @plugindesc [v10.9.0] ハイブリッドAVGダイアログ・コア (純粋データエンジン・UI完全分離版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 * @orderAfter CM_CoreEngine
 *
 * @param NpcZIndex
 * @text NPC立絵 Z-Index
 * @desc 【廃止予定】この設定は CM_DialogueSystem_Effects へ移行されます。
 * @type number
 * @min 0
 * @max 9999
 * @default 15
 *
 * @param SeAdvance
 * @text テキスト送り/開くSE
 * @desc テキストの読み進め、またはUI/ログを開く際に再生されるSE。(空欄で無効化)
 * @type file
 * @dir audio/se/
 * @default Cursor1
 *
 * @param SeChoice
 * @text 選択肢決定SE
 * @desc 選択肢をクリックして決定した際に再生されるSE。(空欄で無効化)
 * @type file
 * @dir audio/se/
 * @default Decision1
 *
 * @param SeCancel
 * @text キャンセル/閉じるSE
 * @desc ログを閉じる、またはUIを非表示にする際に再生されるSE。(空欄で無効化)
 * @type file
 * @dir audio/se/
 * @default Cancel1
 *
 * @param DefaultTransDelay
 * @text トランジション遅延(フレーム)
 * @desc <Trans> 実行時、暗転を保持する最小フレーム数 (デフォルト: 60フレーム = 1秒)
 * @type number
 * @default 60
 *
 * @help
 * ============================================================================
 * アーキテクチャ更新 (v10.9.0 コンテキスト連動型 UI & トランジション):
 * 1. 【自動フェード抑止】: AutoBattler 戦闘中 (isBattle === true) にダイアログが
 * 呼び出された場合、戦闘のテンポを阻害する暗転(fadeOpacity)を自動的にスキップします。
 * 2. 【モードの純化】: 探索用の簡易モード(Easy Mode)をコアエンジンから完全に削除。
 * 純粋な Galgame/AVG 向けのダイアログ進行システムとして再構築されました。
 * ============================================================================
 *
 * @command StartDialogue
 * @text ダイアログの開始
 * @desc 指定したノードからダイアログシーンを再生します。
 *
 * @arg filepath
 * @text ファイルパス
 * @type string
 * @default DialogueData
 *
 * @arg startNodeId
 * @text 開始ノードID (文字列/数値の両方を許容)
 * @type string
 * @default 1001
 */

(() => {
    "use strict";

    window.CM_Dialogue = window.CM_Dialogue || {};
    const CM = window.CM_Dialogue;

    CM.Param = {
        npcZIndex: Number(PluginManager.parameters("CM_DialogueSystem_Core")['NpcZIndex'] || 15),
        seAdvance: PluginManager.parameters("CM_DialogueSystem_Core")['SeAdvance'] || '',
        seChoice: PluginManager.parameters("CM_DialogueSystem_Core")['SeChoice'] || '',
        seCancel: PluginManager.parameters("CM_DialogueSystem_Core")['SeCancel'] || '',
        defaultTransDelay: Number(PluginManager.parameters("CM_DialogueSystem_Core")['DefaultTransDelay'] || 60)
    };

    // =========================================================================
    // [1] 堅牢な字句解析器 (Robust Lexical Parser)
    // =========================================================================
    CM.LexicalParser = class {
        static escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/[&<>'"]/g, tag => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
            }[tag] || tag));
        }

        static parseMacro(line) {
            line = line.trim();
            let start = line.indexOf('<');
            let end = line.lastIndexOf('>');
            
            if (start === -1 || end === -1 || start >= end) return null;

            let content = line.substring(start + 1, end).trim();
            let colonIdx = content.indexOf(':');
            if (colonIdx === -1) colonIdx = content.indexOf('：');

            if (colonIdx !== -1) {
                let args = content.substring(colonIdx + 1).trim();
                args = args.replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 
                return { command: content.substring(0, colonIdx).trim().toLowerCase(), args: args };
            }
            return { command: content.toLowerCase(), args: "" };
        }

        static extractInlineMacros(text) {
            if (!text) return { cleanText: "", macros: [] };
            let cleanText = "";
            let macros = [];
            
            const regex = /<(Trans|BG|BGM|Weather|Pic|Leave|Bump|Switch|Var|Eval|Cinema|Wait|JumpIf|JumpFile|Coroutine|PicAnim|PopNode|Close|AnimDoll)([:：>])/gi;
            
            let match;
            let lastIndex = 0;
            
            while ((match = regex.exec(text)) !== null) {
                let startIdx = match.index;
                cleanText += text.substring(lastIndex, startIdx);
                
                let cmd = match[1].toLowerCase();
                let separator = match[2];
                
                if (separator === '>') {
                    macros.push({ command: cmd, args: "" });
                    lastIndex = regex.lastIndex;
                } else {
                    let contentStart = regex.lastIndex;
                    let nextMatchIdx = text.substring(contentStart).search(/<(Trans|BG|BGM|Weather|Pic|Leave|Bump|Switch|Var|Eval|Cinema|Wait|JumpIf|JumpFile|Coroutine|PicAnim|PopNode|Close|AnimDoll)[:：>]/i);
                    let searchEnd = nextMatchIdx !== -1 ? contentStart + nextMatchIdx : text.length;
                    
                    let chunk = text.substring(contentStart, searchEnd);
                    let endIdxOffset = chunk.lastIndexOf('>');
                    
                    if (endIdxOffset !== -1) {
                        let args = chunk.substring(0, endIdxOffset).trim();
                        args = args.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                        macros.push({ command: cmd, args: args });
                        lastIndex = contentStart + endIdxOffset + 1;
                        regex.lastIndex = lastIndex; 
                    } else {
                        cleanText += match[0];
                        lastIndex = regex.lastIndex;
                    }
                }
            }
            cleanText += text.substring(lastIndex);
            return { cleanText, macros };
        }
    };

    // =========================================================================
    // [2] コアステート管理 (Core State Management - Single Source of Truth)
    // =========================================================================
    CM.State = {
        sessionId: 0, 
        isActive: false, 
        phase: 0, 
        watchdogTimer: 0,
        currentNode: null, charData: { version: "1.0.0", actors: [] }, dialogues: [],
        centerChar: null, 
        waitFrames: 0, waitForAnim: false, 
        transPhase: 0, transTimer: 0, transMap: null, deferredEvents: [], isWaitingForMapLoad: false,
        isLoadingAsync: false, playedTypewriter: false, autoAdvanceTimer: 0, autoTimer: 0,
        coroutines: [], nodeCache: {},
        forcedJumpId: null,
        forcedJumpFile: null
    };

    // HUD(View)が監視・バインドするためのリアクティブモデル
    CM.UI = (window.Vue || Vue).reactive({
        isActive: false, uiOpacity: 0, fadeOpacity: 0, isTyping: false, speakerName: '',
        choices: [], logList: [], isLogOpen: false, isHidden: false, isCinematic: false,
        isTextEmpty: false,
        isMap: false,
        isChoiceClicked: false,
        isAutoMode: false
    });

    // モジュール間通信用フック (Decoupling Hooks)
    CM.EffectUpdateHooks = [];
    CM.CleanupHooks = [];
    CM.TransRecoveryHooks = [];
    CM.ExitAnimationHooks = []; 
    CM.TransHooks = []; 
    CM.PortraitRenderHooks = []; 

    //=============================================================================
    // [3] 動的パス解決とフォールバック (I18n Path Resolver)
    //=============================================================================
    CM.fetchJsonWithFallback = async function(subPath) {
        const lang = (window.ConfigManager && ConfigManager.currentLang) ? ConfigManager.currentLang : 'ja';
        const basePath = 'data/dialogue';

        let url = `${basePath}/${lang}/${subPath}`;
        try { let res = await fetch(url); if (res.ok) return await res.json(); } catch (e) {}

        if (lang !== 'ja') {
            url = `${basePath}/ja/${subPath}`;
            try { let res = await fetch(url); if (res.ok) return await res.json(); } catch (e) { }
        }

        url = `${basePath}/${subPath}`;
        try { let res = await fetch(url); if (res.ok) return await res.json(); } catch (e) { return null; }
        return null;
    };

    CM.playSystemSe = function(seName) { if (seName && seName.trim() !== '') AudioManager.playSe({ name: seName, volume: 90, pitch: 100, pan: 0 }); };
    
    CM.evalCondition = function(cond) {
        if (!cond || cond.trim() === "") return true;
        cond = String(cond).replace(/&lt;/g, '<').replace(/&gt;/g, '>'); 
        if (window.CM_Core && typeof window.CM_Core.evalCondition === 'function') return window.CM_Core.evalCondition(cond);
        return false;
    };

    CM.registerProviders = function() {
        if (window.CM_Core && typeof window.CM_Core.registerRef === 'function') {
            window.CM_Core.registerRef('char', function(id, prop) {
                const c = CM.State.charData.actors.find(x => x.id == id); if (!c) return "";
                const p = prop.toLowerCase();
                if (p === 'name') return c.name || ""; if (p === 'nick') return c.nickname || c.name || ""; if (p === 'title') return c.title || "";
                return "";
            });
        }
    };

    CM.loadData = async function() { 
        const loadedData = await CM.fetchJsonWithFallback('CharacterData.json'); 
        if (loadedData && loadedData.actors) { 
            CM.State.charData = loadedData; 
            CM.registerProviders(); 
        } 
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() { _Scene_Boot_start.call(this); CM.loadData(); };

    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        _Scene_Map_onMapLoaded.call(this);
        CM.UI.isMap = true;
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        _Scene_Map_terminate.call(this);
        CM.UI.isMap = false;
    };

    const _Scene_Base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _Scene_Base_update.call(this);
        if (CM.State.isActive) {
            CM.updateCoroutines(); 
            CM.updateTimers(); 
            CM.EffectUpdateHooks.forEach(hook => hook());

            if (CM.UI.isActive) {
                if (CM.UI.isHidden) {
                    if (Input.isTriggered('ok') || TouchInput.isCancelled()) { CM.UI.isHidden = false; CM.playSystemSe(CM.Param.seAdvance); }
                } else {
                    // HUDモジュールへの委譲呼び出し (Safe Call)
                    if (!CM.UI.isLogOpen && TouchInput.wheelY < -15 && typeof CM.toggleLog === 'function') CM.toggleLog();
                    else if (CM.UI.isLogOpen && (Input.isTriggered('cancel') || TouchInput.isCancelled()) && typeof CM.toggleLog === 'function') CM.toggleLog();
                    
                    if (Input.isTriggered('ok') && !CM.UI.isLogOpen && !CM.UI.isCinematic) {
                        CM.UI.isAutoMode = false;
                        CM.advanceDialogue(); 
                    }
                }
            }
        }
    };

    const _Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === 'cm_dialogue') {
            if (CM.State.isActive || CM.State.isLoadingAsync) return true; 
            this._waitMode = ''; 
            return false;
        }
        return _Game_Interpreter_updateWaitMode.call(this);
    };

    // 【互換性パッチ】プラグインコマンドの型安全バイパス
    PluginManager.registerCommand("CM_DialogueSystem_Core", "StartDialogue", async function(args) {
        this.setWaitMode('cm_dialogue');
        const startId = args.startNodeId;
        let filepath = args.filepath ? args.filepath.trim() : "DialogueData";
        if (!filepath.endsWith('.json')) filepath += '.json';

        // 🌟 バトルコンテキストの嗅覚 (Context-Aware Transition Skip)
        const isBattle = window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE';
        const skipFade = isBattle;

        if (startId) {
            CM.State.isLoadingAsync = true; CM.UI.logList = []; CM.UI.isHidden = false;
            CM.UI.isChoiceClicked = false;
            CM.UI.isAutoMode = false;

            if (!skipFade && typeof gsap !== 'undefined') {
                gsap.to(CM.UI, { fadeOpacity: 1, duration: 0.4 });
                await new Promise(r => setTimeout(r, 400)); 
            }

            const loadedData = await CM.fetchJsonWithFallback(filepath);

            if (loadedData) {
                CM.State.dialogues = Array.isArray(loadedData) ? loadedData : (loadedData.nodes || []);
                CM.playNode(startId); 
                setTimeout(() => { 
                    if (!skipFade && typeof gsap !== 'undefined') gsap.to(CM.UI, { fadeOpacity: 0, duration: 0.15 }); 
                    CM.State.isLoadingAsync = false; 
                }, 150);
            } else { 
                console.error(`[CM_Dialogue] エラー: ファイル [${filepath}] の読み込みに失敗しました。`);
                if (!skipFade && typeof gsap !== 'undefined') gsap.to(CM.UI, { fadeOpacity: 0, duration: 0.3 }); 
                CM.State.isLoadingAsync = false; this._waitMode = '';
            }
        } else { CM.State.isLoadingAsync = false; }
    });

    CM.SpritePool = {
        _pool: [],
        get: function() { const spr = this._pool.length > 0 ? this._pool.pop() : new Sprite(); delete spr.update; spr.anchor.set(0, 0); return spr; },
        release: function(sprite) { if (!sprite) return; if (sprite.parent) sprite.parent.removeChild(sprite); sprite.bitmap = null; sprite.x = 0; sprite.y = 0; sprite.opacity = 255; sprite.scale.set(1, 1); sprite.rotation = 0; sprite.tint = 0xFFFFFF; sprite.anchor.set(0, 0); delete sprite.update; this._pool.push(sprite); }
    };

    //=============================================================================
    // [4] テキスト処理とノード進行 (Text Processing & Node Routing)
    //=============================================================================
    CM.convertColor = function(text) {
        if(!text) return ''; 
        const colors = ['#ffffff','#20a0d6','#ff784c','#66cc40','#99ccff','#ccc0ff','#ffffa0','#808080','#c0c0c0','#2080cc','#ff3810','#00a010','#3e9ade','#a098ff','#ffcc20','#000000'];
        return text.replace(/\\C\[0\]/gi, '</span>').replace(/\\C\[(\d+)\]/gi, (m, p1) => { const idx = parseInt(p1); return (idx > 0 && idx < colors.length) ? `<span style="color: ${colors[idx]};">` : m; }).replace(/\\n|\n/g, '<br/>');
    };

    CM.processTextTags = function(text, speakerId) {
        if(!text) return '';
        let res = text;
        res = res.replace(/\\Ref\[\s*([^,\]]+)\s*,\s*([^,\]]+)\s*,\s*([^,\]]+)\s*\]/gi, (m, type, id, prop) => {
            if (window.CM_Core && typeof window.CM_Core.resolveRef === 'function') { 
                const r = window.CM_Core.resolveRef(type.trim(), id.trim(), prop.trim()); 
                return r !== "" ? CM.LexicalParser.escapeHtml(r) : m; 
            } 
            return m;
        });
        res = res.replace(/\\Name\[([^\]]+)\]/gi, (m, p1) => { 
            if (window.CM_Core && window.CM_Core.resolveRef) { const r = window.CM_Core.resolveRef('char', p1.trim(), 'name'); if (r) return CM.LexicalParser.escapeHtml(r); } 
            const c = CM.State.charData.actors.find(x => x.id == p1); return c ? CM.LexicalParser.escapeHtml(c.name) : m; 
        });
        res = res.replace(/\\Nick\[([^\]]+)\]/gi, (m, p1) => { 
            if (window.CM_Core && window.CM_Core.resolveRef) { const r = window.CM_Core.resolveRef('char', p1.trim(), 'nick'); if (r) return CM.LexicalParser.escapeHtml(r); } 
            const c = CM.State.charData.actors.find(x => x.id == p1); return c ? CM.LexicalParser.escapeHtml(c.nickname || c.name) : m; 
        });
        res = res.replace(/\\SpeakerName/gi, (m) => { 
            if (window.CM_Core && window.CM_Core.resolveRef && speakerId) { const r = window.CM_Core.resolveRef('char', speakerId, 'name'); if (r) return CM.LexicalParser.escapeHtml(r); } 
            const c = CM.State.charData.actors.find(x => x.id == speakerId); return c ? CM.LexicalParser.escapeHtml(c.name) : m; 
        });
        return CM.convertColor(res);
    };

    CM.advanceDialogue = function() {
        if (CM.UI.isLogOpen || !CM.State.isActive || !CM.State.currentNode) return;
        if (CM.State.transPhase !== 0 || CM.State.isWaitingForMapLoad || CM.UI.choices.length > 0) return;

        if (CM.State.phase === 2 && CM.UI.isTyping) { 
            if (typeof CM.skipTyping === 'function') CM.skipTyping(); 
            return; 
        }

        if (CM.State.phase === 3) {
            if (!CM.UI.isCinematic) CM.playSystemSe(CM.Param.seAdvance);
            CM.doNextNode(); 
        }
    };

    CM.doNextNode = function(forcedNextId = null) {
        CM.State.phase = 0;
        const nextId = forcedNextId !== null ? forcedNextId : (CM.State.currentNode ? CM.State.currentNode.nextId : 0);
        if (nextId) CM.playNode(nextId); 
        else CM.endDialogue(); 
    };

    CM.jumpToFileAsync = async function(filename, nodeId) {
        CM.State.isLoadingAsync = true;
        let filepath = filename.trim();
        if (!filepath.endsWith('.json')) filepath += '.json';
        
        try {
            const loadedData = await CM.fetchJsonWithFallback(filepath);
            if (loadedData) {
                CM.State.dialogues = Array.isArray(loadedData) ? loadedData : (loadedData.nodes || []);
                CM.playNode(nodeId);
            } else {
                console.error(`[CM_Dialogue] 非同期ロード失敗: ターゲットファイル [${filepath}] が見つかりません。`);
                CM.endDialogue();
            }
        } catch(e) {
            console.error(`[CM_Dialogue] ファイルジャンプ例外 (I/O Error): ${filepath}`, e);
            CM.endDialogue();
        }
        CM.State.isLoadingAsync = false;
    };

    CM.playNode = function(nodeId) {
        const node = CM.State.dialogues.find(d => d.id == nodeId);
        
        if (!node) { 
            console.error(`[CM_Dialogue] 致命的エラー: ノードID [${nodeId}] が見つかりません。`);
            CM.endDialogue(); 
            return; 
        }

        CM.State.sessionId++;

        if (!CM.State.isActive) { 
            CM.State.isActive = true; CM.UI.isActive = true; $gameMessage.clear(); 
            const exploreUI = document.getElementById('cm-explore-container'); if (exploreUI) exploreUI.style.display = 'none';
        }

        const staticContainer = document.getElementById('cm-pure-text-container');
        if (staticContainer) staticContainer.innerHTML = ''; 

        CM.State.currentNode = node; 
        CM.State.playedTypewriter = false; CM.UI.isHidden = false;
        CM.State.waitFrames = 0; CM.State.waitForAnim = false;
        CM.State.forcedJumpId = null; 
        CM.State.forcedJumpFile = null;
        
        CM.UI.isChoiceClicked = false; 
        CM.UI.choices = []; 
        
        if (node.nodeType === 'event') {
            CM.State.phase = 4; 
            CM.UI.isTextEmpty = true;
            if (node.events && node.events.length > 0) {
                CM.executeEvents(node.events);
                
                if (CM.State.forcedJumpFile) {
                    const jumpData = CM.State.forcedJumpFile;
                    CM.State.forcedJumpFile = null;
                    CM.jumpToFileAsync(jumpData.file, jumpData.id);
                    return;
                }

                if (CM.State.forcedJumpId) {
                    const target = CM.State.forcedJumpId;
                    CM.State.forcedJumpId = null;
                    CM.doNextNode(target);
                    return; 
                }
            }
        } else {
            const parsed = CM.LexicalParser.extractInlineMacros(node.text || "");
            
            let combinedEvents = node.events ? [...node.events] : [];
            parsed.macros.forEach(m => combinedEvents.push(`<${m.command}: ${m.args}>`));
            
            if (combinedEvents.length > 0) {
                CM.executeEvents(combinedEvents);

                if (CM.State.forcedJumpFile) {
                    const jumpData = CM.State.forcedJumpFile;
                    CM.State.forcedJumpFile = null;
                    CM.jumpToFileAsync(jumpData.file, jumpData.id);
                    return;
                }

                if (CM.State.forcedJumpId) {
                    const target = CM.State.forcedJumpId;
                    CM.State.forcedJumpId = null;
                    CM.doNextNode(target);
                    return;
                }
            }

            let isCinema = false; let autoTime = 0;
            combinedEvents.forEach(line => {
                const cinMatch = line.match(/<Cinema(?:[ :：]+(\d+))?>/i);
                if (cinMatch) { isCinema = true; autoTime = parseInt(cinMatch[1] || 120); }
            });
            CM.UI.isCinematic = isCinema; CM.State.autoAdvanceTimer = autoTime;

            CM.renderNodeContent(node, parsed.cleanText); 

            CM.State.phase = 2; 
            
            const hasVisibleContent = !CM.UI.isTextEmpty || (node.choices && node.choices.length > 0);
            if (hasVisibleContent) {
                if (CM.UI.uiOpacity < 1 && typeof gsap !== 'undefined') gsap.to(CM.UI, { uiOpacity: 1, duration: 0.3 });
                else if (typeof gsap === 'undefined') CM.UI.uiOpacity = 1;
            } else {
                if (CM.UI.uiOpacity > 0 && typeof gsap !== 'undefined') gsap.to(CM.UI, { uiOpacity: 0, duration: 0.3 });
                else CM.UI.uiOpacity = 0;
            }

            if (typeof CM.playTypewriter === 'function') CM.playTypewriter();
            CM.State.watchdogTimer = 600;
        }
    };

    CM.renderNodeContent = function(node, cleanText, isDelayed = false) {
        const char = CM.State.charData.actors.find(c => c.id == node.speakerId);
        const processedText = CM.processTextTags(cleanText, node.speakerId);

        const plainText = processedText.replace(/<[^>]*>?/gm, '').trim();
        CM.UI.isTextEmpty = (plainText === '');

        let resolvedSpeakerName = '';
        if (char && window.CM_Core && window.CM_Core.resolveRef) { resolvedSpeakerName = window.CM_Core.resolveRef('char', char.id, 'name'); } 
        else if (char) { resolvedSpeakerName = char.name; }

        CM.UI.speakerName = CM.LexicalParser.escapeHtml(resolvedSpeakerName);
        
        if (!isDelayed && processedText.trim() !== '') { 
            CM.UI.logList.push({ speakerName: CM.UI.speakerName, isProtagonist: char ? !!char.isProtagonist : false, textHtml: processedText }); 
        }
        
        const staticContainer = document.getElementById('cm-pure-text-container');
        if (staticContainer) {
            staticContainer.innerHTML = (typeof CM.prepareTypewriter === 'function') 
                ? CM.prepareTypewriter(processedText) 
                : processedText;
        }
        
        if (node.choices && node.choices.length > 0) {
            node.choices.forEach(c => {
                if (c.condition && c.condition.trim() !== '' && !CM.evalCondition(c.condition)) return;
                const parsedChoice = CM.LexicalParser.extractInlineMacros(c.text);
                CM.UI.choices.push({ html: CM.processTextTags(parsedChoice.cleanText, node.speakerId), nextId: c.nextId });
            });
        }

        CM.PortraitRenderHooks.forEach(hook => hook(node, char));
    };

    //=============================================================================
    // [5] コマンドディスパッチャ (Command Dispatcher)
    //=============================================================================
    CM.CommandDispatcher = {
        _handlers: {},
        register: function(cmd, handler) { this._handlers[cmd.toLowerCase()] = handler; },
        
        dispatch: function(line) {
            let macro = CM.LexicalParser.parseMacro(line);
            
            if (!macro) {
                let colonIdx = line.indexOf(':'); 
                if (colonIdx === -1) colonIdx = line.indexOf('：');
                
                if (colonIdx !== -1) {
                    macro = { 
                        command: line.substring(0, colonIdx).trim().toLowerCase(), 
                        args: line.substring(colonIdx + 1).trim() 
                    };
                } else {
                    macro = { command: line.trim().toLowerCase(), args: "" };
                }
            }

            if (macro && this._handlers[macro.command]) { 
                this._handlers[macro.command](macro.args); 
                return true; 
            }
            return false;
        }
    };

    CM.CommandDispatcher.register('jumpif', args => {
        let targetId = 0, elseId = 0, condition = "";
        const parts = args.split(/[,，]/);
        if (parts.length >= 2) {
            targetId = parseInt(parts[0].trim());
            const part1 = parts[1].trim();
            if (parts.length >= 3 && /^\d+$/.test(part1)) {
                elseId = parseInt(part1);
                condition = parts.slice(2).join(',').trim();
            } else {
                condition = parts.slice(1).join(',').trim();
            }
        } else { return; }
        
        if (CM.evalCondition(condition)) { CM.State.forcedJumpId = targetId; } 
        else if (elseId > 0) { CM.State.forcedJumpId = elseId; }
    });

    CM.CommandDispatcher.register('jumpfile', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean);
        if (p.length < 2) return;
        
        const filename = p[0].trim();
        const targetId = parseInt(p[1].trim());
        
        if (p.length >= 3) {
            const condition = p.slice(2).join(',').trim();
            if (!CM.evalCondition(condition)) return; 
        }
        
        CM.State.forcedJumpFile = { file: filename, id: targetId };
    });

    CM.CommandDispatcher.register('cinema', args => { });
    CM.CommandDispatcher.register('close', args => { CM.endDialogue(); });
    
    CM.CommandDispatcher.register('coroutine', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length < 2) return;
        const action = p[0].toLowerCase(); const nodeId = parseInt(p[1]);
        if (action === 'start') {
            const interval = p.length > 2 ? parseInt(p[2]) : 60;
            CM.State.coroutines = CM.State.coroutines.filter(c => c.nodeId !== nodeId);
            CM.State.coroutines.push({ nodeId, interval, timer: interval });
        } else if (action === 'stop') { CM.State.coroutines = CM.State.coroutines.filter(c => c.nodeId !== nodeId); } 
        else if (action === 'clear') { CM.State.coroutines = []; }
    });

    CM.CommandDispatcher.register('popnode', async args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length === 0) return;
        let filename = null, nodeId = null;
        if (p.length === 1) { nodeId = parseInt(p[0]); } else { filename = p[0].trim(); nodeId = parseInt(p[1]); }

        let targetNode = null;
        if (!filename || filename.toLowerCase() === 'current') { targetNode = CM.State.dialogues.find(d => d.id == nodeId); } 
        else {
            if (!filename.endsWith('.json')) filename += '.json';
            if (!CM.State.nodeCache[filename]) {
                const loadedData = await CM.fetchJsonWithFallback(filename);
                if (loadedData) CM.State.nodeCache[filename] = loadedData;
            }
            if (CM.State.nodeCache[filename]) targetNode = CM.State.nodeCache[filename].find(d => d.id == nodeId);
        }

        if (targetNode && targetNode.text) {
            const parsed = CM.LexicalParser.extractInlineMacros(targetNode.text);
            const processedText = CM.processTextTags(parsed.cleanText, targetNode.speakerId);
            if (window.CM_Message && typeof window.CM_Message.push === 'function') window.CM_Message.push(processedText);
        }
    });

    CM.CommandDispatcher.register('switch', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if(p.length < 2 || !$gameSwitches) return;
        $gameSwitches.setValue(parseInt(p[0]), p[1].toLowerCase() === 'on' || p[1].toLowerCase() === 'true');
    });
    CM.CommandDispatcher.register('var', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if(p.length < 3 || !$gameVariables) return;
        const vId = parseInt(p[0]); const op = p[1]; const val = parseInt(p[2]); let cur = $gameVariables.value(vId);
        if(op === '=') cur = val; else if(op === '+') cur += val; else if(op === '-') cur -= val; else if(op === '*') cur *= val; else if(op === '/') cur /= val;
        $gameVariables.setValue(vId, cur);
    });
    CM.CommandDispatcher.register('eval', args => { 
        try { new Function(args)(); } catch(e) { console.error("[CM_Dialogue] Eval実行エラー:", args, e); } 
    });
    CM.CommandDispatcher.register('wait', args => { CM.State.waitFrames = Math.max(CM.State.waitFrames, parseInt(args)); });

    //=============================================================================
    // [6] イベントループとライフサイクル (Event Loop & Lifecycle)
    //=============================================================================
    CM.processEventLines = function(linesArray) { 
        for (let line of linesArray) {
            CM.CommandDispatcher.dispatch(line);
            if (CM.State.forcedJumpId || CM.State.forcedJumpFile) break; 
        }
    };

    CM.executeEvents = function(eventsStrArray) {
        if (!eventsStrArray || eventsStrArray.length === 0) return;
        
        let hasTrans = false, transMapId = 0, transX = 0, transY = 0;
        const immediateEvents = [], deferredEvents = []; 

        eventsStrArray.forEach(line => {
            const matchTrans = line.match(/<Trans(?:[ :：]+(\d+)[,，\s]+(\d+)[,，\s]+(\d+))?>/i);
            if (matchTrans) { 
                hasTrans = true; 
                if (matchTrans[1]) { transMapId = parseInt(matchTrans[1]); transX = parseInt(matchTrans[2]); transY = parseInt(matchTrans[3]); } 
                return; 
            }
            if (line.match(/<Wait|<JumpIf|<JumpFile|<Cinema|<Switch|<Var|<Eval|<Coroutine|<PopNode|<Close|<PicAnim|<Leave|<Bump|<AnimDoll/i)) immediateEvents.push(line);
            else deferredEvents.push(line);
        });

        CM.processEventLines(immediateEvents);

        if (CM.State.forcedJumpFile) {
            const jumpData = CM.State.forcedJumpFile;
            CM.State.forcedJumpFile = null;
            CM.jumpToFileAsync(jumpData.file, jumpData.id);
            return;
        }

        if (CM.State.forcedJumpId) {
            const targetId = CM.State.forcedJumpId;
            CM.State.forcedJumpId = null; 
            CM.doNextNode(targetId); 
            return; 
        }

        if (hasTrans) {
            if (typeof gsap !== 'undefined') gsap.to(CM.UI, { fadeOpacity: 1, duration: 0.4 });
            CM.State.waitFrames = Math.max(CM.State.waitFrames, CM.Param.defaultTransDelay); 
            CM.State.transPhase = 1; CM.State.transTimer = 25; CM.State.deferredEvents = deferredEvents;
            CM.State.transMap = transMapId > 0 ? { id: transMapId, x: transX, y: transY } : null;

            CM.State.centerChar = null;
            
            CM.TransHooks.forEach(hook => hook());
            
        } else {
            CM.processEventLines(deferredEvents);
        }
    };

    CM.updateCoroutines = function() {
        if (!CM.State.isActive) return;
        for (let i = 0; i < CM.State.coroutines.length; i++) {
            let c = CM.State.coroutines[i];
            c.timer--;
            if (c.timer <= 0) {
                c.timer = c.interval;
                const node = CM.State.dialogues.find(d => d.id == c.nodeId);
                if (node && node.events) CM.processEventLines(node.events); 
            }
        }
    };

    CM.updateTimers = function() {
        if (CM.State.forcedJumpFile !== null) {
            const jumpData = CM.State.forcedJumpFile;
            CM.State.forcedJumpFile = null;
            CM.jumpToFileAsync(jumpData.file, jumpData.id);
            return;
        }

        if (CM.State.forcedJumpId !== null) {
            const targetId = CM.State.forcedJumpId;
            CM.State.forcedJumpId = null;
            CM.doNextNode(targetId);
            return;
        }

        if (CM.State.watchdogTimer > 0) {
            CM.State.watchdogTimer--;
            if (CM.State.watchdogTimer <= 0) {
                if (CM.UI.isTyping && typeof CM.skipTyping === 'function') CM.skipTyping();
                CM.State.waitFrames = 0; CM.State.waitForAnim = false;
            }
        }

        if (CM.State.isWaitingForMapLoad) {
            if (!$gamePlayer.isTransferring() && SceneManager._scene instanceof Scene_Map && SceneManager._scene.isReady()) {
                CM.State.isWaitingForMapLoad = false; 
                CM.TransRecoveryHooks.forEach(hook => hook());
                if (typeof gsap !== 'undefined') gsap.to(CM.UI, { fadeOpacity: 0, duration: 0.4 }); 
                CM.State.transTimer = 25; 
            }
            return;
        }

        if (CM.State.transTimer > 0) {
            CM.State.transTimer--;
            if (CM.State.transTimer <= 0) {
                if (CM.State.transPhase === 1) {
                    CM.processEventLines(CM.State.deferredEvents);
                    
                    if (CM.State.forcedJumpFile) {
                        const jumpData = CM.State.forcedJumpFile;
                        CM.State.forcedJumpFile = null;
                        CM.State.transPhase = 0; 
                        CM.State.transTimer = 0;
                        if (typeof gsap !== 'undefined') gsap.to(CM.UI, { fadeOpacity: 0, duration: 0.1 });
                        CM.jumpToFileAsync(jumpData.file, jumpData.id);
                        return;
                    }

                    if (CM.State.forcedJumpId) {
                        const targetId = CM.State.forcedJumpId;
                        CM.State.forcedJumpId = null; 
                        CM.State.transPhase = 0; 
                        CM.State.transTimer = 0;
                        if (typeof gsap !== 'undefined') gsap.to(CM.UI, { fadeOpacity: 0, duration: 0.1 });
                        CM.doNextNode(targetId);
                        return;
                    }

                    if (CM.State.transMap) { 
                        $gamePlayer.reserveTransfer(CM.State.transMap.id, CM.State.transMap.x, CM.State.transMap.y, 2, 0); 
                        CM.State.isWaitingForMapLoad = true; 
                    }
                    CM.State.transPhase = 2;
                    if (!CM.State.isWaitingForMapLoad && typeof gsap !== 'undefined') { gsap.to(CM.UI, { fadeOpacity: 0, duration: 0.4 }); CM.State.transTimer = 25; }
                } else if (CM.State.transPhase === 2) { CM.State.transPhase = 0; }
            }
        }

        let isWaiting = (CM.State.transPhase !== 0 || CM.State.isWaitingForMapLoad || CM.State.waitForAnim || CM.State.waitFrames > 0);
        if (CM.State.waitFrames > 0) CM.State.waitFrames--;

        if (!isWaiting) {
            switch (CM.State.phase) {
                case 1: 
                    break;
                case 2: 
                    if (!CM.UI.isTyping) {
                        CM.State.watchdogTimer = 0;
                        CM.State.phase = 3; 
                        CM.State.autoTimer = 120;
                    }
                    break;
                case 3: 
                    if (CM.State.autoAdvanceTimer > 0 && CM.UI.choices.length === 0) {
                        CM.State.autoAdvanceTimer--;
                        if (CM.State.autoAdvanceTimer <= 0) CM.advanceDialogue();
                    } 
                    else if (CM.UI.isAutoMode && CM.UI.choices.length === 0) {
                        if (CM.State.autoTimer > 0) {
                            CM.State.autoTimer--;
                        } else {
                            CM.advanceDialogue();
                        }
                    }
                    break;
                case 4: 
                    CM.doNextNode();
                    break;
            }
        }
    };

    CM.endDialogue = async function() {
        if (!CM.State.isActive) { CM.State.isLoadingAsync = false; return; }
        
        const currentSession = ++CM.State.sessionId;
        
        CM.State.isActive = false; 
        CM.State.isLoadingAsync = true; 
        CM.State.coroutines = []; 
        
        // 🌟 バトルコンテキスト判定
        const isBattle = window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE';
        const skipFade = isBattle;

        CM.UI.isTextEmpty = true; 
        CM.UI.choices = [];

        if (CM.UI.uiOpacity > 0) {
            if (typeof gsap !== 'undefined') gsap.to(CM.UI, { uiOpacity: 0, duration: 0.3 });
            else CM.UI.uiOpacity = 0;
        }

        let exitPromises = [];

        CM.ExitAnimationHooks.forEach(hook => {
            const p = hook();
            if (p instanceof Promise) exitPromises.push(p);
        });

        if (!skipFade && typeof gsap !== 'undefined') {
            exitPromises.push(new Promise(resolve => {
                gsap.to(CM.UI, { fadeOpacity: 1, duration: 0.4, onComplete: resolve });
            }));
        }

        if (exitPromises.length > 0) {
            await Promise.all(exitPromises);
        }

        if (CM.State.sessionId !== currentSession) {
            return; 
        }

        CM.UI.isActive = false; 
        CM.UI.isLogOpen = false; 
        CM.UI.isHidden = false; 
        CM.UI.isCinematic = false;
        CM.UI.isAutoMode = false;
        CM.UI.logList = []; 
        CM.State.currentNode = null; 
        CM.State.centerChar = null; 
        CM.State.dialogues = [];
        CM.State.phase = 0;
        
        CM.UI.isChoiceClicked = false; 

        const staticContainer = document.getElementById('cm-pure-text-container'); 
        if (staticContainer) staticContainer.innerHTML = '';
        const exploreUI = document.getElementById('cm-explore-container'); 
        if (exploreUI) exploreUI.style.display = '';

        CM.CleanupHooks.forEach(hook => hook());

        if (!skipFade && typeof gsap !== 'undefined') {
            gsap.to(CM.UI, { fadeOpacity: 0, duration: 0.4 });
            setTimeout(() => { 
                if (CM.State.sessionId === currentSession) {
                    CM.State.isLoadingAsync = false; 
                }
            }, 400);
        } else {
            CM.State.isLoadingAsync = false;
        }
    };

    const _Game_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() { 
        if (CM.State.isActive || CM.State.isLoadingAsync) return false; 
        return _Game_Player_canMove.call(this); 
    };

})();