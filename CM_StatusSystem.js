/*:
 * @target MZ
 * @plugindesc [v1.3.0] ハイブリッドステータス・バフ管線 (SSOT + 純関数サンドボックス統合版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 * @orderAfter CM_CoreEngine
 *
 * @help
 * ============================================================================
 * 🌌 ステータスとパッシブの抽象化エンジン (Status & Condition Pipeline)
 *
 * 【アーキテクチャ更新 (v1.3.0 - サンドボックス対応の完全復元)】
 * 1. 【純関数パイプラインの統合】: 
 * CMS.addCmState などの純関数を復元し、CM_AutoBattler の純データエンティティ
 * (Plain Object) が状態異常を正常に受信できるよう修正しました。
 * 2. 【ネイティブバイパスの維持】: 
 * Game_Actor の paramBase ハイジャックはそのまま維持し、エディタで設定した
 * HP/MP の SSOT (唯一事実ソース) をゲーム内外で一貫させます。
 * 3. 【ダックタイピング・プロキシ】:
 * 大地マップ上でのネイティブオブジェクト (Game_BattlerBase) からの呼び出しは、
 * 全てプロキシを介して純関数管線へと自動ルーティングされます。
 * ============================================================================
 */

(() => {
    "use strict";

    window.CM_Status = window.CM_Status || {};
    const CMS = window.CM_Status;

    // パラメータマッピング定数 (Fast lookup array index)
    const PARAM_MAP = { 'MHP': 0, 'MMP': 1, 'ATK': 2, 'DEF': 3, 'MAT': 4, 'MDF': 5, 'AGI': 6, 'LUK': 7 };
    const REVERSE_PARAM_MAP = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'];

    //=============================================================================
    // 1. データパイプラインとマクロ事前コンパイル (Data & AOT Compilation)
    //=============================================================================
    CMS.Data = { items: [] };
    CMS._isFetchingData = false;

    CMS.VueState = (window.Vue || Vue).reactive({
        activeStates: [],
        enemyStates: []
    });

    CMS.compileMacros = function() {
        if (!this.Data || !this.Data.items) return;
        
        for (const def of this.Data.items) {
            def._cachedRates = [1, 1, 1, 1, 1, 1, 1, 1];
            def._cachedPlus = [0, 0, 0, 0, 0, 0, 0, 0];
            
            if (def.effects && def.effects.length > 0) {
                for (const macro of def.effects) {
                    let matchR = macro.match(/<Stat:\s*([A-Z]+)\s*,\s*\*(.+)>/i);
                    if (matchR && PARAM_MAP[matchR[1]] !== undefined) {
                        def._cachedRates[PARAM_MAP[matchR[1]]] *= Number(matchR[2]) || 1.0;
                    }
                    let matchP = macro.match(/<Stat:\s*([A-Z]+)\s*,\s*([+-]\d+)>/i);
                    if (matchP && PARAM_MAP[matchP[1]] !== undefined) {
                        def._cachedPlus[PARAM_MAP[matchP[1]]] += Number(matchP[2]) || 0;
                    }
                }
            }
        }
        console.log("[CM_StatusSystem] ⚡ マクロの AOT (事前コンパイル) キャッシュが完了しました。");
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        CMS._isFetchingData = true;
        fetch('data/StatusData.json')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.items) {
                    CMS.Data = data;
                    CMS.compileMacros(); 
                }
            })
            .catch(e => console.warn("[CM_StatusSystem] ⚠️ StatusData.json の読み込みに失敗しました:", e))
            .finally(() => { CMS._isFetchingData = false; });
        
        _Scene_Boot_start.call(this);
    };

    const _Scene_Boot_isReady = Scene_Boot.prototype.isReady;
    Scene_Boot.prototype.isReady = function() {
        if (!_Scene_Boot_isReady.call(this)) return false;
        return !CMS._isFetchingData; 
    };

    CMS.getStatusDef = function(stateId) {
        if (!this.Data || !this.Data.items) return null;
        return this.Data.items.find(s => s.id === stateId) || null;
    };

    CMS.syncVueState = function() {
        // 1. 味方 UI 同期 (Player)
        let playerEnt = null;
        if (window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE') {
            playerEnt = window.CM_AutoBattler.State.entities[0];
        } else if ($gameParty && $gameParty.leader()) {
            playerEnt = $gameParty.leader();
        }

        if (playerEnt && playerEnt._cmStates) {
            const uiStates = [];
            for (const st of playerEnt._cmStates) {
                const def = CMS.getStatusDef(st.id);
                if (def) uiStates.push({ id: st.id, name: def.name, description: def.description, duration: st.duration, type: def.durationType });
            }
            CMS.VueState.activeStates = uiStates;
        } else {
            CMS.VueState.activeStates = [];
        }
        
        // 2. 敵対者 UI 同期 (Enemy)
        let enemyEnt = null;
        if (window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE') {
            enemyEnt = window.CM_AutoBattler.State.entities[1];
        } else if ($gameTroop && $gameTroop.members().length > 0) {
            enemyEnt = $gameTroop.members()[0];
        }

        if (enemyEnt && enemyEnt._cmStates) {
            const enemyUiStates = [];
            for (const st of enemyEnt._cmStates) {
                const def = CMS.getStatusDef(st.id);
                if (def) enemyUiStates.push({ id: st.id, name: def.name, description: def.description, duration: st.duration, type: def.durationType });
            }
            CMS.VueState.enemyStates = enemyUiStates;
        } else {
            CMS.VueState.enemyStates = [];
        }
    };

    //=============================================================================
    // 2. 純関数パイプライン (Pure Function Pipeline for Sandbox Entities)
    //=============================================================================
    CMS.initStates = function(entity) {
        if (!entity) return;
        if (!entity._cmStates) entity._cmStates = [];
    };

    CMS.addCmState = function(entity, stateId) {
        if (!entity) return;
        this.initStates(entity);
        const def = CMS.getStatusDef(stateId);
        if (!def) return;

        let existing = entity._cmStates.find(s => s.id === stateId);
        if (existing) {
            if (def.durationType === 'turn' || def.durationType === 'tick') {
                existing.duration = def.durationValue;
            }
        } else {
            const newState = { id: stateId, duration: 0 };
            if (def.durationType === 'turn' || def.durationType === 'tick') {
                newState.duration = def.durationValue;
            }
            entity._cmStates.push(newState);
        }
        this.syncVueState();
    };

    CMS.removeCmState = function(entity, stateId) {
        if (!entity || !entity._cmStates) return;
        const idx = entity._cmStates.findIndex(s => s.id === stateId);
        if (idx > -1) {
            entity._cmStates.splice(idx, 1);
            this.syncVueState();
        }
    };

    CMS.hasCmState = function(entity, stateId) {
        if (!entity || !entity._cmStates) return false;
        return !!entity._cmStates.find(s => s.id === stateId);
    };

    CMS.updateCmStates = function(entity, type, amount = 1) {
        if (!entity || !entity._cmStates) return;
        let isChanged = false;
        for (let i = entity._cmStates.length - 1; i >= 0; i--) {
            const st = entity._cmStates[i];
            const def = CMS.getStatusDef(st.id);
            if (def && def.durationType === type) {
                st.duration -= amount;
                isChanged = true;
                if (st.duration <= 0) {
                    entity._cmStates.splice(i, 1);
                }
            }
        }
        if (isChanged) this.syncVueState();
    };

    CMS.checkConditionalStates = function(entity) {
        if (!entity || !CMS.Data || !CMS.Data.items) return;
        this.initStates(entity);
        let needsSync = false;

        const subject = entity; // 条件評価用コンテキスト

        for (const def of CMS.Data.items) {
            if (def.durationType === 'conditional' && def.triggerCondition) {
                const conditionString = def.triggerCondition.replace(/actor\./g, 'subject.');
                let isMet = false;
                try {
                    isMet = (window.CM_Core && window.CM_Core.evalCondition) ? window.CM_Core.evalCondition(conditionString) : eval(conditionString);
                } catch(e) {
                    isMet = false;
                }

                const hasState = this.hasCmState(entity, def.id);

                if (isMet && !hasState) {
                    entity._cmStates.push({ id: def.id, duration: 0 });
                    needsSync = true;
                } else if (!isMet && hasState) {
                    const idx = entity._cmStates.findIndex(s => s.id === def.id);
                    if (idx > -1) entity._cmStates.splice(idx, 1);
                    needsSync = true;
                }
            }
        }
        if (needsSync) this.syncVueState();
    };

    CMS.getParamRate = function(entity, paramId) {
        let rate = 1.0;
        if (!entity || !entity._cmStates) return rate;
        for (let i = 0; i < entity._cmStates.length; i++) {
            const def = CMS.getStatusDef(entity._cmStates[i].id);
            if (def && def._cachedRates) rate *= def._cachedRates[paramId]; 
        }
        return rate;
    };

    CMS.getParamPlus = function(entity, paramId) {
        let plus = 0;
        if (!entity || !entity._cmStates) return plus;
        for (let i = 0; i < entity._cmStates.length; i++) {
            const def = CMS.getStatusDef(entity._cmStates[i].id);
            if (def && def._cachedPlus) plus += def._cachedPlus[paramId]; 
        }
        return plus;
    };

    //=============================================================================
    // 3. ネイティブデータベースの完全バイパス (SSOT Integration Hooks)
    //=============================================================================
    const _Game_Actor_paramBase = Game_Actor.prototype.paramBase;
    Game_Actor.prototype.paramBase = function(paramId) {
        if (window.CM_Core && window.CM_Core.Database && window.CM_Core.Database.characters) {
            const charData = window.CM_Core.Database.characters.find(c => String(c.id) === String(this.actorId()));
            if (charData && charData.baseParams) {
                const key = REVERSE_PARAM_MAP[paramId];
                if (key && charData.baseParams[key] !== undefined) {
                    return Number(charData.baseParams[key]);
                }
            }
        }
        return _Game_Actor_paramBase.call(this, paramId);
    };

    const _Game_Actor_maxTp = Game_Actor.prototype.maxTp;
    Game_Actor.prototype.maxTp = function() {
        if (window.CM_Core && window.CM_Core.Database && window.CM_Core.Database.characters) {
            const charData = window.CM_Core.Database.characters.find(c => String(c.id) === String(this.actorId()));
            if (charData && charData.baseParams && charData.baseParams.msp !== undefined) {
                return Number(charData.baseParams.msp);
            }
        }
        return _Game_Actor_maxTp.call(this); 
    };

    const _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        if (window.CM_Core && window.CM_Core.Database && window.CM_Core.Database.characters) {
            const charData = window.CM_Core.Database.characters.find(c => String(c.id) === String(actorId));
            if (charData && charData.baseParams) {
                this._hp = charData.baseParams.hp !== undefined ? Number(charData.baseParams.hp) : this.mhp;
                this._mp = charData.baseParams.mp !== undefined ? Number(charData.baseParams.mp) : this.mmp;
                this._tp = charData.baseParams.sp !== undefined ? Number(charData.baseParams.sp) : 0;
            }
        }
    };

    //=============================================================================
    // 4. ネイティブプロキシ・システムフック (Native Proxy & Routing)
    //=============================================================================
    // ネイティブなオブジェクト (Game_BattlerBase) からの呼び出しを、純関数へとルーティングします。
    
    const _Game_BattlerBase_initMembers = Game_BattlerBase.prototype.initMembers;
    Game_BattlerBase.prototype.initMembers = function() {
        _Game_BattlerBase_initMembers.call(this);
        CMS.initStates(this);
    };

    Game_BattlerBase.prototype.addCmState = function(stateId) { CMS.addCmState(this, stateId); };
    Game_BattlerBase.prototype.removeCmState = function(stateId) { CMS.removeCmState(this, stateId); };
    Game_BattlerBase.prototype.hasCmState = function(stateId) { return CMS.hasCmState(this, stateId); };
    Game_BattlerBase.prototype.updateCmStates = function(type, amount = 1) { CMS.updateCmStates(this, type, amount); };
    Game_BattlerBase.prototype.checkConditionalStates = function() { CMS.checkConditionalStates(this); };

    const _Game_BattlerBase_setHp = Game_BattlerBase.prototype.setHp;
    Game_BattlerBase.prototype.setHp = function(hp) { _Game_BattlerBase_setHp.call(this, hp); this.checkConditionalStates(); };

    const _Game_BattlerBase_setMp = Game_BattlerBase.prototype.setMp;
    Game_BattlerBase.prototype.setMp = function(mp) { _Game_BattlerBase_setMp.call(this, mp); this.checkConditionalStates(); };

    const _Game_BattlerBase_setTp = Game_BattlerBase.prototype.setTp;
    Game_BattlerBase.prototype.setTp = function(tp) { _Game_BattlerBase_setTp.call(this, tp); this.checkConditionalStates(); };

    const _Game_BattlerBase_paramRate = Game_BattlerBase.prototype.paramRate;
    Game_BattlerBase.prototype.paramRate = function(paramId) {
        return _Game_BattlerBase_paramRate.call(this, paramId) * CMS.getParamRate(this, paramId);
    };

    const _Game_BattlerBase_paramPlus = Game_BattlerBase.prototype.paramPlus;
    Game_BattlerBase.prototype.paramPlus = function(paramId) {
        return _Game_BattlerBase_paramPlus.call(this, paramId) + CMS.getParamPlus(this, paramId);
    };

    //=============================================================================
    // 5. ターン・時間進行のフック (Turn & Time Hooks)
    //=============================================================================
    CMS.onTurnEnd = function() {
        if (window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE') {
            for (const ent of window.CM_AutoBattler.State.entities) {
                CMS.updateCmStates(ent, 'turn', 1);
            }
            return;
        }
        if ($gameParty && $gameParty.leader()) CMS.updateCmStates($gameParty.leader(), 'turn', 1);
        if ($gameTroop && $gameTroop.members().length > 0) CMS.updateCmStates($gameTroop.members()[0], 'turn', 1);
    };

    if (window.CM_TimeSurvival) {
        const _CMT_advanceTimeAndStats = window.CM_TimeSurvival.advanceTimeAndStats;
        window.CM_TimeSurvival.advanceTimeAndStats = function(ticks, costHP, costMP, costTP) {
            _CMT_advanceTimeAndStats.call(this, ticks, costHP, costMP, costTP);
            if (ticks > 0) {
                if (window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE') {
                    for (const ent of window.CM_AutoBattler.State.entities) {
                        CMS.updateCmStates(ent, 'tick', Math.round(ticks));
                    }
                } else if ($gameActors.actor(1)) {
                    CMS.updateCmStates($gameActors.actor(1), 'tick', Math.round(ticks));
                }
            }
        };
    }

    const _BattleManager_endTurn = BattleManager.endTurn;
    BattleManager.endTurn = function() {
        if (_BattleManager_endTurn) _BattleManager_endTurn.call(this);
        CMS.onTurnEnd();
    };

})();