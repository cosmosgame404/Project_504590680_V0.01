/*:
 * @target MZ
 * @plugindesc [v1.1.1] リアルタイム・パフォーマンスプロファイラ (真・FPS計算対応版)
 * @author Coding Assistant (Architecture Architect)
 * @help
 * ============================================================================
 * 🌌 リアルタイム・パフォーマンスプロファイラ (Real-time Performance Profiler)
 *
 * 【v1.1.1 アーキテクチャ更新】
 * 1. 【独立FPS算出エンジンの実装】:
 * MZネイティブの隠蔽されたFPSメーターに依存せず、1000msのローリングタイム
 * ウィンドウ(Rolling Time Window)を用いて、実際の `Logic FPS` をプラグイン内で
 * 独自かつ正確に算出・描画するよう修正しました。
 * ============================================================================
 */

(() => {
    "use strict";

    window.CM_Perf = window.CM_Perf || {};
    const CMP = window.CM_Perf;

    CMP.State = {
        isVisible: true, 
        frameTimes: [],
        frameStamps: [], // 🌟 新規: 1秒間の実行フレーム数をカウントするためのタイムスタンプ配列
        lastUpdate: 0,
        maxSamples: 60
    };

    //=============================================================================
    // 1. DOM UI の構築 (Independent DOM Construction)
    //=============================================================================
    CMP.initUI = function() {
        if (document.getElementById('cm-perf-monitor')) return;

        const style = document.createElement('style');
        style.innerHTML = `
            #cm-perf-monitor {
                position: absolute; top: 10px; right: 10px; width: 230px;
                background: rgba(15, 20, 25, 0.9); border: 1px solid rgba(0, 210, 255, 0.5);
                border-radius: 8px; padding: 12px; color: #fff; z-index: 999999;
                font-family: monospace; font-size: 13px; pointer-events: none;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.8);
                transform: translateZ(0); will-change: opacity;
                display: flex; 
                flex-direction: column; gap: 8px;
                backdrop-filter: blur(4px);
            }
            .cm-perf-row { display: flex; justify-content: space-between; align-items: baseline; }
            .cm-perf-label { color: #88aaff; font-weight: bold; }
            .cm-perf-value { font-weight: bold; font-size: 15px; }
            .cm-perf-title { text-align: center; font-size: 11px; color: #5577aa; border-bottom: 1px solid #334466; padding-bottom: 4px; margin-bottom: 4px; }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.id = 'cm-perf-monitor';
        container.innerHTML = `
            <div class="cm-perf-title">PROFILER ENGINE V1.1.1</div>
            <div class="cm-perf-row"><span class="cm-perf-label">Frame Time:</span><span id="cm-perf-ms" class="cm-perf-value" style="color: #4caf50;">0.00 ms</span></div>
            <div class="cm-perf-row"><span class="cm-perf-label">Logic FPS:</span><span id="cm-perf-fps" class="cm-perf-value" style="color: #ffda3b;">0 FPS</span></div>
            <div class="cm-perf-row"><span class="cm-perf-label">Theo. Limit:</span><span id="cm-perf-max" class="cm-perf-value" style="color: #00d2ff;">∞ FPS</span></div>
            <div class="cm-perf-row"><span class="cm-perf-label">JS Memory:</span><span id="cm-perf-mem" class="cm-perf-value" style="color: #e06c8a;">0 MB</span></div>
            <div class="cm-perf-row" style="border-top: 1px dashed #334466; padding-top: 6px;"><span class="cm-perf-label">Scene Nodes:</span><span id="cm-perf-nodes" class="cm-perf-value" style="color: #b388ff;">0</span></div>
        `;
        document.body.appendChild(container);
        
        console.log("[CM_Perf] リアルタイム・パフォーマンスプロファイラがDOMにマウントされました。");
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        CMP.initUI();
    };

    //=============================================================================
    // 2. シーングラフ再帰解析 (Recursive Scene Graph Parsing)
    //=============================================================================
    CMP.countPixiObjects = function(container) {
        if (!container) return 0;
        let count = 1; 
        if (container.children && container.children.length > 0) {
            for (let i = 0; i < container.children.length; i++) {
                count += CMP.countPixiObjects(container.children[i]);
            }
        }
        return count;
    };

    //=============================================================================
    // 3. メインループのインターセプト (Main Loop Interception)
    //=============================================================================
    const _SceneManager_updateMain = SceneManager.updateMain;
    SceneManager.updateMain = function() {
        if (!CMP.State.isVisible) {
            _SceneManager_updateMain.call(this);
            return;
        }

        const startMark = performance.now();
        _SceneManager_updateMain.call(this);
        const endMark = performance.now();
        
        // フレーム処理時間の記録
        const costMs = endMark - startMark;
        CMP.State.frameTimes.push(costMs);
        if (CMP.State.frameTimes.length > CMP.State.maxSamples) {
            CMP.State.frameTimes.shift();
        }

        // 🌟 独立FPS算出のためのタイムスタンプ記録 (Rolling Window: 1000ms)
        const now = performance.now();
        CMP.State.frameStamps.push(now);
        while (CMP.State.frameStamps.length > 0 && CMP.State.frameStamps[0] <= now - 1000) {
            CMP.State.frameStamps.shift();
        }

        // DOMの更新頻度制御
        if (now - CMP.State.lastUpdate >= 300) { 
            CMP.updateDOM();
            CMP.State.lastUpdate = now;
        }
    };

    CMP.updateDOM = function() {
        const elMs = document.getElementById('cm-perf-ms');
        const elFps = document.getElementById('cm-perf-fps');
        const elMax = document.getElementById('cm-perf-max');
        const elMem = document.getElementById('cm-perf-mem');
        const elNodes = document.getElementById('cm-perf-nodes');
        if (!elMs) return;

        // 平均フレーム時間の算出
        let total = 0;
        for (let i = 0; i < CMP.State.frameTimes.length; i++) {
            total += CMP.State.frameTimes[i];
        }
        const avgMs = CMP.State.frameTimes.length > 0 ? total / CMP.State.frameTimes.length : 0;

        // 🌟 MZネイティブに依存しない真のLogic FPS算出
        const actualFps = CMP.State.frameStamps.length;
        
        let theoLimit = avgMs > 0 ? Math.floor(1000 / avgMs) : 9999;
        
        let memMb = 0;
        if (window.performance && window.performance.memory) {
            memMb = (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
        }

        let nodeCount = 0;
        if (SceneManager._scene) {
            nodeCount = CMP.countPixiObjects(SceneManager._scene);
        }

        // カラーリング閾値
        elMs.style.color = avgMs > 16 ? '#ff3b5b' : (avgMs > 10 ? '#ffda3b' : '#4caf50');
        elMax.style.color = theoLimit < 60 ? '#ff3b5b' : '#00d2ff';
        elNodes.style.color = nodeCount > 2000 ? '#ff3b5b' : (nodeCount > 1000 ? '#ffda3b' : '#b388ff');

        elMs.textContent = avgMs.toFixed(2) + ' ms';
        elFps.textContent = actualFps + ' FPS';
        elMax.textContent = theoLimit + ' FPS';
        elMem.textContent = memMb > 0 ? memMb + ' MB' : 'N/A';
        elNodes.textContent = nodeCount;
    };

})();