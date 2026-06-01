/*:
 * @target MZ
 * @plugindesc [v8.1.0] サバイバルコアエンジン (方案C・アクティブフェーズ管理版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 *
 * @param currentApVarId
 * @text 現在AP(行動力)変数ID
 * @type variable
 * @default 13
 *
 * @param maxApVarId
 * @text 最大AP変数ID
 * @type variable
 * @default 14
 *
 * @param phaseVarId
 * @text 現在フェーズ変数ID (0:昼, 1:夜)
 * @type variable
 * @default 15
 *
 * @param dayVarId
 * @text 経過日数変数ID
 * @type variable
 * @default 16
 *
 * @param msgFile
 * @text メッセージ定義ファイル
 * @desc 警告メッセージ等を格納するJSONファイル名 (data/dialogue/ 配下)
 * @type string
 * @default TimeMessages
 *
 * @help
 * ============================================================================
 * 🌌 厳密AP駆動・アクティブタイムサバイバルシステム (Active Phase System)
 *
 * 【アーキテクチャ仕様 (方案C)】
 * 1. 自然流失およびAP枯渇による自動的な昼夜切り替えを完全に排除。
 * 2. プレイヤーのアクティブな介入（HUDの休憩ボタン / マップ上のベッド）でフェーズ進行。
 * 3. 画面のフェードおよび日月アニメーションとの同期を保つため、
 * 状態遷移はカスタムイベント（CustomEvent）を介した二段階決済を採用。
 *
 * 【アニメーションライフサイクル】
 * Rest/Sleep要請 -> イベント発火(CM_TimeSurvival:RequestAnimation) 
 * -> UI側でGSAP遮蔽 -> 黒幕裏でコアデータ更新執行 -> UI側で遮蔽解除
 * ============================================================================
 */

(() => {
    "use strict";

    window.CM_TimeSurvival = window.CM_TimeSurvival || {};
    const CMT = window.CM_TimeSurvival;

    const pluginName = "CM_TimeSurvivalSystem";
    const parameters = PluginManager.parameters(pluginName);

    CMT.Params = {
        apVarId: Number(parameters['currentApVarId'] || 13),
        maxApVarId: Number(parameters['maxApVarId'] || 14),
        phaseVarId: Number(parameters['phaseVarId'] || 15),
        dayVarId: Number(parameters['dayVarId'] || 16),
        msgFile: String(parameters['msgFile'] || 'TimeMessages')
    };

    CMT.Data = { settings: {}, dict: {} };

    //=============================================================================
    // 1. 初期化とSSOTバインディング (Initialization & SSOT Binding)
    //=============================================================================
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        // SSOT: 唯一の事実の情報源としてゲームセーブデータ内にカプセル化
        this._cmSurvival = {
            ap: 3,
            maxAp: 3,
            phase: 0, // 0:昼(Day), 1:夜(Night)
            day: 1
        };
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = async function() { 
        _Scene_Boot_start.call(this); 
        try {
            const uri = encodeURIComponent('data/TimeSurvivalData.json');
            const res = await fetch(`${uri}?t=${Date.now()}`);
            if (res.ok) CMT.Data = await res.json();
        } catch(e) { 
            console.warn("[CM_TimeSurvival] Config not found, running on fallback sandbox.");
        }
    };

    /**
     * SSOTデータからRMの変数空間空間へ同期 (Sync to RM Variables)
     */
    CMT.syncVariables = function() {
        const sys = $gameSystem._cmSurvival;
        if (!sys || !$gameVariables) return;
        $gameVariables.setValue(CMT.Params.apVarId, sys.ap);
        $gameVariables.setValue(CMT.Params.maxApVarId, sys.maxAp);
        $gameVariables.setValue(CMT.Params.phaseVarId, sys.phase);
        $gameVariables.setValue(CMT.Params.dayVarId, sys.day);
    };

    //=============================================================================
    // 2. 判定と決済ロジック (Pre-flight Check & Settle)
    //=============================================================================
    
    /**
     * AP消費が可能か事前判定を行う
     * @param {number} cost 
     * @returns {boolean}
     */
    CMT.canConsume = function(cost) {
        const sys = $gameSystem._cmSurvival;
        return sys && sys.ap >= cost;
    };

    /**
     * AP消費を純粋に実行する（0になっても自動フェーズ遷移は行わない）
     * @param {number} cost 
     */
    CMT.consume = function(cost) {
        const sys = $gameSystem._cmSurvival;
        if (!sys) return;

        sys.ap -= cost;
        if (sys.ap < 0) sys.ap = 0;

        this.syncVariables();
        
        if (window.CM_Explore && typeof window.CM_Explore.checkTimeEvents === 'function') {
            window.CM_Explore.checkTimeEvents();
        }
    };

    /**
     * アイテムや料理によるAPの回復処理
     * @param {number} amount 
     */
    CMT.recover = function(amount) {
        const sys = $gameSystem._cmSurvival;
        if (!sys) return;

        sys.ap += amount;
        if (sys.ap > sys.maxAp) sys.ap = sys.maxAp;

        this.syncVariables();
    };

    /**
     * 現在のフェーズ状態を取得 (UIインターフェース用)
     * @returns {number} 0:昼, 1:夜
     */
    CMT.getPhase = function() {
        const sys = $gameSystem._cmSurvival;
        return sys ? sys.phase : 0;
    };

    //=============================================================================
    // 3. アクティブフェーズ遷移トランザクション (Active Phase Transitions)
    //=============================================================================

    /**
     * HUDボタンによる「昼から夜への休憩」要請のハンドリング
     */
    CMT.restAtDaytime = function() {
        const sys = $gameSystem._cmSurvival;
        if (!sys || sys.phase !== 0) return;

        // アニメーション再生をVue/GSAP側に要求 (黒幕フェード開始)
        this.dispatchTransitionAnimation({
            type: "rest",
            targetPhase: 1,
            onOpaque: () => this.executeDaytimeRest()
        });
    };

    /**
     * 昼間休憩のデータ層確定処理（画面が完全に遮蔽されたタイミングで実行）
     */
    CMT.executeDaytimeRest = function() {
        const sys = $gameSystem._cmSurvival;
        if (!sys) return;

        sys.phase = 1;
        sys.ap += 1;
        if (sys.ap > sys.maxAp) sys.ap = sys.maxAp;

        this.syncVariables();
        this.onPhaseSettled(1);
    };

    /**
     * マップオブジェクト（ベッド）による「夜から翌日への就寝」要請のハンドリング
     */
    CMT.sleepInBed = function() {
        const sys = $gameSystem._cmSurvival;
        if (!sys) return;

        // 就寝アニメーション再生要求 (黒幕フェード開始)
        this.dispatchTransitionAnimation({
            type: "sleep",
            targetPhase: 0,
            onOpaque: () => this.executeSleepInBed()
        });
    };

    /**
     * 就寝の数据層確定処理（画面が完全に遮蔽されたタイミングで実行）
     */
    CMT.executeSleepInBed = function() {
        const sys = $gameSystem._cmSurvival;
        if (!sys) return;

        sys.phase = 0;
        sys.day += 1;
        sys.ap = sys.maxAp; // 翌朝は一律で最大値まで全快

        this.syncVariables();
        this.onPhaseSettled(0);
        
        // 翌朝の共通ライフサイクルイベントの発火
        if (window.CM_Explore && typeof window.CM_Explore.onNewDay === 'function') {
            window.CM_Explore.onNewDay();
        }
    };

    //=============================================================================
    // 4. アニメーションブリッジと通知 (Animation Bridge & Notification)
    //=============================================================================

    /**
     * Vue UI層へGSAPアニメーションの実行を要求する
     * @param {Object} detail 
     */
    CMT.dispatchTransitionAnimation = function(detail) {
        // グローバルDOMイベントを介してVue側と疎結合で連携
        const event = new CustomEvent("CM_TimeSurvival:RequestAnimation", {
            detail: detail
        });
        document.dispatchEvent(event);
    };

    /**
     * 内部データ確定後のライフサイクル通知
     * @param {number} phase 
     */
    CMT.onPhaseSettled = function(phase) {
        if (window.CM_Explore && typeof window.CM_Explore.checkTimeEvents === 'function') {
            window.CM_Explore.checkTimeEvents();
        }
    };

    //=============================================================================
    // 5. プラグインコマンド実装 (Plugin Commands)
    //=============================================================================
    PluginManager.registerCommand(pluginName, "CheckAp", args => {
        const result = CMT.canConsume(Number(args.cost));
        $gameSwitches.setValue(Number(args.resultSwitchId), result);
    });

    PluginManager.registerCommand(pluginName, "ConsumeAp", args => {
        CMT.consume(Number(args.cost));
    });

    PluginManager.registerCommand(pluginName, "TriggerBedSleep", args => {
        CMT.sleepInBed();
    });

    PluginManager.registerCommand(pluginName, "RecoverAp", args => {
        CMT.recover(Number(args.amount));
    });

})();