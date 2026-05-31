/*:
 * @target MZ
 * @plugindesc [v7.2.0] サバイバルコアエンジン (12刻数・MessageLog動的連携版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 *
 * @param tickVarId
 * @text 現在刻数変数ID (0-23)
 * @type variable
 * @default 13
 *
 * @param dayVarId
 * @text 経過日数変数ID
 * @type variable
 * @default 14
 *
 * @param msgFile
 * @text メッセージ定義ファイル
 * @desc 時間進行時のログを格納するJSONファイル名 (data/dialogue/ 配下)
 * @type string
 * @default TimeMessages
 *
 * @param nodeDay
 * @text 昼フェーズノードID
 * @desc 昼に切り替わった際に読み込むノードID
 * @type number
 * @default 1
 *
 * @param nodeNight
 * @text 夜フェーズノードID
 * @desc 夜に切り替わった際に読み込むノードID
 * @type number
 * @default 2
 *
 * @param nodeNewDay
 * @text 新日ノードID
 * @desc 日付が更新された際に読み込むノードID。{day} で日数を動的置換可能。
 * @type number
 * @default 3
 *
 * @help
 * ============================================================================
 * 🌌 12刻数・昼夜切替システム (Tick-Based Day/Night Cycle)
 *
 * 【アーキテクチャ仕様】
 * 1. 1フェーズ（昼/夜） = 12刻数。
 * 2. 1日（24刻数） = 昼(0-11) + 夜(12-23)。
 * 3. 時間は自然流失せず、プレイヤーの行動（Explore/Item使用）でのみ進行します。
 *
 * 【MessageLog 連携 (V7.2)】
 * フェーズ変更時、および日付変更時に CM_Vue_MessageLog の pushNode API を
 * 経由して、非同期でログを画面にレンダリングします。
 * 新日ノードでは {day} 構文を用いることで、現在の日数を埋め込むことが可能です。
 * ============================================================================
 */

(() => {
    "use strict";

    window.CM_TimeSurvival = window.CM_TimeSurvival || {};
    const CMT = window.CM_TimeSurvival;

    const pluginName = "CM_TimeSurvivalSystem";
    const parameters = PluginManager.parameters(pluginName);

    CMT.Params = {
        tickVarId: Number(parameters['tickVarId'] || 13),
        dayVarId: Number(parameters['dayVarId'] || 14),
        msgFile: String(parameters['msgFile'] || 'TimeMessages'),
        nodeDay: Number(parameters['nodeDay'] || 1),
        nodeNight: Number(parameters['nodeNight'] || 2),
        nodeNewDay: Number(parameters['nodeNewDay'] || 3)
    };

    const TICKS_PER_PHASE = 12;
    const TICKS_PER_DAY = 24;

    CMT.Data = { settings: {}, dict: {} };

    //=============================================================================
    // 1. 初期化 (Initialization)
    //=============================================================================
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._cmSurvival = {
            totalTicks: 0,
            day: 1
        };
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = async function() { 
        _Scene_Boot_start.call(this); 
        try {
            const res = await fetch('data/TimeSurvivalData.json');
            if (res.ok) CMT.Data = await res.json();
        } catch(e) { 
            // 設定ファイルが存在しない場合はデフォルトで進行
        }
    };

    CMT.syncVariables = function() {
        const sys = $gameSystem._cmSurvival;
        if (!sys || !$gameVariables) return;
        $gameVariables.setValue(CMT.Params.tickVarId, sys.totalTicks % TICKS_PER_DAY);
        $gameVariables.setValue(CMT.Params.dayVarId, sys.day);
    };

    //=============================================================================
    // 2. 刻数演算とフェーズ決済 (Tick Arithmetic & Phase Settlement)
    //=============================================================================
    CMT.advanceTimeAndStats = function(ticks, costHP = 0, costMP = 0, costTP = 0) {
        const sys = $gameSystem._cmSurvival;
        const actor = $gameActors.actor(1);
        if (!sys || !actor) return;

        const oldTotalTicks = sys.totalTicks;
        const oldPhase = Math.floor((oldTotalTicks % TICKS_PER_DAY) / TICKS_PER_PHASE);
        const oldDay = sys.day;

        if (costHP !== 0) actor.gainHp(-Math.round(costHP));
        if (costMP !== 0) actor.gainMp(-Math.round(costMP));
        if (costTP !== 0) actor.gainTp(-Math.round(costTP));

        if (ticks > 0) {
            sys.totalTicks += Math.round(ticks);
            
            const newDay = Math.floor(sys.totalTicks / TICKS_PER_DAY) + 1;
            const newPhase = Math.floor((sys.totalTicks % TICKS_PER_DAY) / TICKS_PER_PHASE);

            if (newPhase !== oldPhase || newDay !== oldDay) {
                this.onPhaseChange(newPhase);
            }

            if (newDay > oldDay) {
                sys.day = newDay;
                this.onDayChange(newDay);
                if (window.CM_Explore && window.CM_Explore.onNewDay) {
                    window.CM_Explore.onNewDay();
                }
            }
        }

        CMT.checkLimitsAndClamp(actor);
        CMT.syncVariables();

        if (ticks > 0 && window.CM_Explore && typeof window.CM_Explore.checkTimeEvents === 'function') {
            window.CM_Explore.checkTimeEvents();
        }
    };

    /**
     * 昼夜が切り替わった際のUI連携 (MessageLog経由で通知)
     * @param {number} phase 0:昼, 1:夜
     */
    CMT.onPhaseChange = function(phase) {
        if (window.CM_Message && typeof window.CM_Message.pushNode === 'function') {
            const nodeId = phase === 0 ? CMT.Params.nodeDay : CMT.Params.nodeNight;
            window.CM_Message.pushNode(CMT.Params.msgFile, nodeId, 'system');
        }
    };

    /**
     * 日付が変更された際のUI連携 (コンテキストを注入)
     * @param {number} day 新しい日付
     */
    CMT.onDayChange = function(day) {
        if (window.CM_Message && typeof window.CM_Message.pushNode === 'function') {
            window.CM_Message.pushNode(CMT.Params.msgFile, CMT.Params.nodeNewDay, 'system', { day: day });
        }
    };

    //=============================================================================
    // 3. 判定ロジックの拡張 (Logic Extensions)
    //=============================================================================
    CMT.isTimeMatch = function(condStr) {
        if (!condStr || condStr.trim() === "") return true;
        const sys = $gameSystem._cmSurvival;
        if (!sys) return true;
        
        const currentTickInDay = sys.totalTicks % TICKS_PER_DAY;
        const currentPhase = Math.floor(currentTickInDay / TICKS_PER_PHASE);

        if (condStr.toLowerCase() === "day") return currentPhase === 0;
        if (condStr.toLowerCase() === "night") return currentPhase === 1;

        let parts = condStr.split('-');
        if (parts.length === 2) {
            let start = parseInt(parts[0]), end = parseInt(parts[1]);
            if (start < end) { 
                return (currentTickInDay >= start && currentTickInDay < end); 
            } else { 
                return (currentTickInDay >= start || currentTickInDay < end); 
            }
        }
        
        return true;
    };

    //=============================================================================
    // 4. プラグインコマンド (Plugin Commands)
    //=============================================================================
    PluginManager.registerCommand(pluginName, "AddTicks", args => {
        CMT.advanceTimeAndStats(Number(args.ticks), 0, 0, 0);
    });
    
    PluginManager.registerCommand(pluginName, "ChangeSurvivalStats", args => {
        CMT.advanceTimeAndStats(0, Number(args.hpCost), Number(args.mpCost), Number(args.tpCost));
    });

    //=============================================================================
    // 5. 既存機能の継承 (State Clamping & Death Hijack)
    //=============================================================================
    CMT.checkLimitsAndClamp = function(actor) {
        if (actor.mp < 0) actor.setMp(0);
        if (actor.hp <= 0) {
            actor.setHp(0); 
            return true;
        }
        return false;
    };
    
    Game_Party.prototype.isAllDead = function() { return false; };

})();