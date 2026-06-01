/*:
 * @target MZ
 * @plugindesc [v8.0.3] ハイブリッド・コアエンジン (動的解像度サンドボックス・完全同期版)
 * @author Coding Assistant (Architecture Architect)
 *
 * @param primaryColor
 * @text プライマリカラー
 * @type string
 * @default #ff4b8b
 *
 * @param secondaryColor
 * @text セカンダリカラー
 * @type string
 * @default #00d2ff
 *
 * @param warningColor
 * @text 警告カラー
 * @type string
 * @default #ffda3b
 *
 * @param dangerColor
 * @text 危険カラー
 * @type string
 * @default #ff3b5b
 *
 * @help
 * ============================================================================
 * 混合レンダリング (Vue3 + Canvas) 基盤アーキテクチャ。
 *
 * [v8.0.3 アーキテクチャ更新: Canvasバインディングの最適化]
 * 1. 【DOM ID修正】: RMMZ ネイティブの 'gameCanvas' への正確なバインディング。
 * 2. 【ResizeObserver同期】: Graphics クラスのフックに依存せず、ブラウザネイティブの
 * ResizeObserver を用いて Canvas の物理的変形を 100% キャッチし、
 * UIサンドボックスをピクセルパーフェクトで追従させます。
 * * [变更记录]
 * - 移除了纸娃娃系统相关的 DOM 点击拦截 (#cm-paperdoll-vue-root 等)
 * ============================================================================
 */

(() => {
    "use strict";

    window.CM_Core = window.CM_Core || {};
    const Core = window.CM_Core;

    const pluginName = "CM_CoreEngine";
    const parameters = PluginManager.parameters(pluginName);

    const cPrimary = parameters['primaryColor'] || "#ff4b8b";
    const cSecondary = parameters['secondaryColor'] || "#00d2ff";
    const cWarning = parameters['warningColor'] || "#ffda3b";
    const cDanger = parameters['dangerColor'] || "#ff3b5b";

    //=============================================================================
    // 0. グローバル・データベース・マネージャ
    //=============================================================================
    Core.Database = { characters: null, _isLoaded: false };

    Core.Database.load = async function() {
        console.log("[CM_Core] 🔄 キャラクター・データベースをロード中...");
        try {
            const res = await fetch('data/dialogue/CharacterData.json');
            if (res.ok) {
                const data = await res.json();
                this.characters = Array.isArray(data) ? data : (data.actors || []);
                this._isLoaded = true;
            } else { throw new Error("CharacterData.json が見つかりません。"); }
        } catch (e) {
            console.error("[CM_Core] ❌ 全能エディタデータのロードに失敗:", e);
            this._isLoaded = true; 
        }
    };

    //=============================================================================
    // 1. 設定永続化 (ConfigManager)
    //=============================================================================
    ConfigManager.currentLang = 'ja';
    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _ConfigManager_makeData.call(this);
        config.currentLang = this.currentLang;
        return config;
    };
    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.currentLang = config.currentLang || 'ja';
    };

    //=============================================================================
    // 2. I18n翻訳エンジン
    //=============================================================================
    Core.I18n = { data: {}, reactiveState: null };
    Core.I18n.initReactivity = function() {
        if (window.Vue && !this.reactiveState) this.reactiveState = window.Vue.reactive({ lang: ConfigManager.currentLang, ready: false });
    };
    Core.I18n.load = async function() {
        this.initReactivity();
        const lang = ConfigManager.currentLang || 'ja';
        try {
            const baseRes = await fetch('data/Localization.json');
            if (baseRes.ok) {
                const baseData = await baseRes.json();
                for (const l in baseData) { this.data[l] = this.data[l] || {}; Object.assign(this.data[l], baseData[l]); }
            }
        } catch(e) {}
        try {
            const indexRes = await fetch('data/i18n/index.json');
            if (indexRes.ok) {
                const fileList = await indexRes.json();
                if (Array.isArray(fileList)) {
                    this.data[lang] = this.data[lang] || {};
                    const fetchPromises = fileList.map(fileName => fetch(`data/i18n/${lang}/${fileName}.json`).then(res => res.ok ? res.json() : {}).catch(() => ({})));
                    const results = await Promise.all(fetchPromises);
                    for (const fragment of results) Object.assign(this.data[lang], fragment);
                }
            }
        } catch(e) {}
        if (this.reactiveState) this.reactiveState.ready = true;
    };
    Core.I18n.translate = function(path) {
        if (!this.data || !this.data[ConfigManager.currentLang] || !path) return path;
        const langDict = this.data[ConfigManager.currentLang];
        if (langDict[path] !== undefined) return langDict[path];
        const result = path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : null), langDict);
        return result !== null ? result : path;
    };
    Core.I18n.changeLanguage = async function(lang) {
        ConfigManager.currentLang = lang;
        if (this.reactiveState) this.reactiveState.lang = lang; 
        Core.Fonts.update(lang);
        await this.load();
    };

    //=============================================================================
    // 3. UIレイアウト構成
    //=============================================================================
    Core.UILayout = {
        data: {}, reactiveState: null,
        defaults: {
            timeBox: { left: "20px", top: "20px", width: "320px", height: "50px", zIndex: 100 },
            leftPanel: { left: "20px", top: "85px", bottom: "20px", width: "320px", zIndex: 100 },
            topBar: { left: "360px", top: "20px", right: "240px", height: "50px", zIndex: 100 },
            statusBox: { right: "20px", bottom: "20px", width: "220px", height: "120px", zIndex: 100 },
            tpBox: { right: "20px", bottom: "160px", width: "220px", height: "45px", zIndex: 100 },
            messageLog: { left: "20px", top: "90px", bottom: "20px", width: "314px", zIndex: 105 }
        }
    };
    Core.UILayout.initReactivity = function() {
        if (window.Vue && !this.reactiveState) this.reactiveState = window.Vue.reactive({ config: JSON.parse(JSON.stringify(this.defaults)) });
    };
    Core.UILayout.load = async function() {
        this.initReactivity();
        try {
            const res = await fetch('data/UILayoutData.json');
            if (res.ok) Object.assign(this.reactiveState.config, await res.json());
        } catch(e) {}
    };

    //=============================================================================
    // 4. CSSデザインシステム
    //=============================================================================
    Core.Fonts = {};
    Core.Fonts.inject = function() {
        if (document.getElementById('cm-global-pipeline')) return;
        const style = document.createElement('style');
        style.id = 'cm-global-pipeline';
        
        // 修复：transform: scale 现在显式分离了 x 和 y 轴，确保与 Canvas 长宽比完美贴合
        style.innerHTML = `
            @font-face { font-family: 'CM_MiSans'; src: url('fonts/MiSans-Regular.woff2') format('woff2'); font-weight: normal; font-style: normal; }
            @font-face { font-family: 'CM_MiSans_Bold'; src: url('fonts/MiSans-Bold.woff2') format('woff2'); font-weight: bold; font-style: normal; }
            @font-face { font-family: 'CM_NotoSans'; src: url('fonts/NotoSansJP-Regular.ttf') format('truetype'); font-weight: normal; font-style: normal; }
            @font-face { font-family: 'CM_NotoSans_Bold'; src: url('fonts/NotoSansJP-Bold.ttf') format('truetype'); font-weight: bold; font-style: normal; }
            
            :root {
                --cm-font-main: 'CM_NotoSans', sans-serif;
                --cm-font-bold: 'CM_NotoSans_Bold', sans-serif;
                --cm-color-primary: ${cPrimary};     
                --cm-color-secondary: ${cSecondary}; 
                --cm-color-warning: ${cWarning};     
                --cm-color-danger: ${cDanger};       
                --cm-color-text-main: #333333;
                --cm-color-text-muted: #888888;
                --cm-color-text-inverse: #ffffff;
                --cm-bg-glass: rgba(255, 255, 255, 0.95);
                --cm-color-panel-border: rgba(0, 0, 0, 0.05);
                --cm-border-width: 0px;
                --cm-border-radius: 16px;
                --cm-shadow-diffuse: 0 4px 16px rgba(0, 0, 0, 0.08);
                --cm-base-width: 1280;
                --cm-base-height: 720;
                --cm-scale-x: 1;
                --cm-scale-y: 1;
                --cm-canvas-left: 0px;
                --cm-canvas-top: 0px;
            }
            
            .cm-sandbox-root {
                position: absolute;
                top: var(--cm-canvas-top, 0px) !important;
                left: var(--cm-canvas-left, 0px) !important;
                width: calc(var(--cm-base-width) * 1px) !important;
                height: calc(var(--cm-base-height) * 1px) !important;
                transform-origin: 0 0 !important;
                transform: scale(var(--cm-scale-x, 1), var(--cm-scale-y, 1)) !important;
                pointer-events: none;
                overflow: hidden;
                z-index: 9000;
            }

            .cm-base-panel, .cm-glass-panel {
                background: var(--cm-bg-glass);
                border: var(--cm-border-width) solid var(--cm-color-panel-border);
                border-radius: var(--cm-border-radius);
                color: var(--cm-color-text-main);
                box-shadow: var(--cm-shadow-diffuse);
                backdrop-filter: blur(10px);
                position: relative;
                overflow: hidden;
            }

            .cm-custom-scroll::-webkit-scrollbar { width: 6px; }
            .cm-custom-scroll::-webkit-scrollbar-track { background: transparent; }
            .cm-custom-scroll::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.15); border-radius: 6px; }
            .cm-custom-scroll::-webkit-scrollbar-thumb:hover { background: var(--cm-color-primary); }
            
            .cm-modal-overlay { 
                position: absolute; top: 0; left: 0; 
                width: calc(var(--cm-base-width) * 1px); 
                height: calc(var(--cm-base-height) * 1px); 
                background: rgba(0, 0, 0, 0.4); display: none; justify-content: center; 
                align-items: center; pointer-events: auto; z-index: 9999;
                backdrop-filter: blur(4px);
            }
            .cm-modal-overlay.active { display: flex; }
        `;
        document.head.appendChild(style);
    };
    Core.Fonts.update = function(lang) {
        const isJp = (lang === 'ja');
        document.documentElement.style.setProperty('--cm-font-main', isJp ? "'CM_NotoSans', sans-serif" : "'CM_MiSans', sans-serif");
        document.documentElement.style.setProperty('--cm-font-bold', isJp ? "'CM_NotoSans_Bold', sans-serif" : "'CM_MiSans_Bold', sans-serif");
    };
    Window_Base.prototype.standardFontFace = function() { return ConfigManager.currentLang === 'ja' ? 'CM_NotoSans, sans-serif' : 'CM_MiSans, sans-serif'; };

    //=============================================================================
    // 5. 条件式コンパイルキャッシュ
    //=============================================================================
    Core.ConditionCache = new Map();
    Core.MAX_CACHE_SIZE = 1000;
    Core.evalCondition = function(condStr) {
        if (!condStr || condStr.trim() === "") return true;
        const key = condStr.trim();
        if (!this.ConditionCache.has(key)) {
            if (this.ConditionCache.size >= this.MAX_CACHE_SIZE) this.ConditionCache.delete(this.ConditionCache.keys().next().value);
            try { this.ConditionCache.set(key, new Function('return !!(' + key + ');')); } catch (e) { this.ConditionCache.set(key, () => false); }
        }
        return this.ConditionCache.get(key)();
    };

    //=============================================================================
    // 6. 入力インターセプター
    //=============================================================================
    const _TouchInput_onWheel = TouchInput._onWheel;
    TouchInput._onWheel = function(event) {
        if (event.target.closest('.cm-custom-scroll')) return;
        _TouchInput_onWheel.call(this, event);
    };
    
    // 🌟 核心修改：在此处移除了纸娃娃相关DOM的选择器
    const isCmUI = (event) => event.target && event.target.closest && event.target.closest('.cm-ui-layer, #cm-dialogue-vue-root, .dlg-box, .dlg-choice-btn, #cm-title-vue-root, .cm-neo-panel, .cm-base-panel, .cm-glass-panel, .cm-sandbox-root');
    
    const _TouchInput_onMouseDown = TouchInput._onMouseDown;
    TouchInput._onMouseDown = function(event) { 
        if (isCmUI(event)) return; 
        _TouchInput_onMouseDown.call(this, event); 
    };

    //=============================================================================
    // 7. スケーリング同期 (動的解像度 + ResizeObserver 完全同期)
    //=============================================================================
    Core.updateScale = () => {
        // 修复 DOM ID: RM 的 canvas id 严格是小写 'gameCanvas'，或者是唯一的 canvas 标签
        const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas');
        if (!canvas) return; 

        const rect = canvas.getBoundingClientRect();
        
        // 获取当前 RM 的逻辑分辨率（不写死 1280x720，适配 System 设置）
        const baseW = Graphics.width || 1280;
        const baseH = Graphics.height || 720;
        
        document.documentElement.style.setProperty('--cm-base-width', baseW.toString());
        document.documentElement.style.setProperty('--cm-base-height', baseH.toString());

        const scaleX = rect.width / baseW;
        const scaleY = rect.height / baseH;
        document.documentElement.style.setProperty('--cm-scale-x', scaleX.toString());
        document.documentElement.style.setProperty('--cm-scale-y', scaleY.toString());
        
        document.documentElement.style.setProperty('--cm-canvas-left', rect.left + 'px');
        document.documentElement.style.setProperty('--cm-canvas-top', rect.top + 'px');
    };
    
    // ResizeObserver を使って Canvas の物理的変化を 100% 捕捉する (最強の防振対策)
    Core._canvasResizeObserver = null;
    Core.initScaleObserver = () => {
        const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas');
        if (canvas && typeof ResizeObserver !== 'undefined' && !Core._canvasResizeObserver) {
            Core._canvasResizeObserver = new ResizeObserver(() => {
                Core.updateScale();
            });
            Core._canvasResizeObserver.observe(canvas);
        }
        Core.updateScale(); 
    };

    // 既存の RMMZ スケーリング関数へのフック (保険)
    const _Graphics_updateRealScale = Graphics._updateRealScale;
    if (_Graphics_updateRealScale) {
        Graphics._updateRealScale = function() { 
            _Graphics_updateRealScale.call(this); 
            Core.updateScale(); 
        };
    }

    //=============================================================================
    // 8. ライフサイクル & 参照レジストリ
    //=============================================================================
    const _Scene_Boot_create = Scene_Boot.prototype.create;
    Scene_Boot.prototype.create = function() {
        _Scene_Boot_create.call(this);
        Promise.all([Core.I18n.load(), Core.UILayout.load(), Core.Database.load()]).then(() => {
            Core.I18n.changeLanguage(ConfigManager.currentLang);
        });
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        if (typeof window.gsap === "undefined") throw new Error("[CM_Core] GSAP required.");
        
        Core.Fonts.inject();
        _Scene_Boot_start.call(this);
        
        // DOM構築後に Observer を初期化 (少し遅延させて確実に取得)
        setTimeout(Core.initScaleObserver, 50);
        setTimeout(Core.initScaleObserver, 500); 
    };

    const _Scene_Boot_isReady = Scene_Boot.prototype.isReady;
    Scene_Boot.prototype.isReady = function() {
        if (!Core.Database._isLoaded) return false;
        return _Scene_Boot_isReady.call(this);
    };

    const _Scene_Base_initialize = Scene_Base.prototype.initialize;
    Scene_Base.prototype.initialize = function() {
        _Scene_Base_initialize.call(this);
        if (typeof window.gsap !== "undefined") this._cmGsapContext = gsap.context();
    };
    
    const _Scene_Base_terminate = Scene_Base.prototype.terminate;
    Scene_Base.prototype.terminate = function() {
        _Scene_Base_terminate.call(this);
        if (this._cmGsapContext) this._cmGsapContext.revert();
    };

    Core.ReferenceRegistry = new Map();
    Core.registerRef = function(type, callback) { if (typeof callback === 'function') this.ReferenceRegistry.set(type, callback); };
    Core.resolveRef = function(type, id, prop) {
        if (this.ReferenceRegistry.has(type)) {
            const resolver = this.ReferenceRegistry.get(type);
            try {
                const rawValue = resolver(id, prop);
                if (rawValue) return this.I18n.translate(String(rawValue));
            } catch (e) {}
        }
        return "";
    };

})();