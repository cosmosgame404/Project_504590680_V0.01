/*:
 * @target MZ
 * @plugindesc [v12.3.0] ハイブリッドアイテム＆四次元倉庫システム (サンドボックス安全互換版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_CoreEngine
 * @orderAfter CM_CoreEngine
 *
 * @param WeaponCategoryId
 * @text 武器カテゴリID (Weapon Category ID)
 * @desc 武器として判定されるカテゴリのID（デフォルト: weapon）
 * @type string
 * @default weapon
 *
 * @param ItemCategoryId
 * @text 道具カテゴリID (Item Category ID)
 * @desc 道具として判定されるカテゴリのID（デフォルト: item）
 * @type string
 * @default item
 *
 * @param DefaultWeaponSlots
 * @text デフォルト武器スロット数
 * @desc 初期状態で解放されている武器スロットの数（デフォルト: 3）
 * @type number
 * @min 1
 * @default 3
 *
 * @param DefaultItemSlots
 * @text デフォルト道具スロット数
 * @desc 初期状態で解放されている道具スロットの数（デフォルト: 3）
 * @type number
 * @min 1
 * @default 3
 *
 * @help
 * ============================================================================
 * アーキテクチャ設計 (v12.3.0 サンドボックス・ダックタイピング対応):
 * 1. 【安全な陣営判定 (Safe Duck Typing)】:
 * applyItemEffects 内の陣営判定 (isEnemy) が、ネイティブ関数 (isEnemy()) と
 * 純データプロパティ (isEnemy: true) の両方を安全に処理できるよう修正しました。
 * TypeError の発生を完全に根絶。
 * 2. 【コンテキスト注入 (Context Injection)】:
 * AutoBattler から明示的に targetEntity が渡された場合、ネイティブの
 * $gameTroop や $gameParty に依存せず、直接純データオブジェクトへ決済を適用します。
 * ============================================================================
 *
 * @command GainItem
 * @text アイテムの取得 (Gain Instance)
 * @desc アイテムテンプレートからインスタンスを生成し、インベントリへ追加します。
 * @arg baseId
 * @text テンプレートID (baseId)
 * @type string
 * @default item_001
 * @arg amount
 * @text 生成数量
 * @type number
 * @min 1
 * @default 1
 *
 * @command LoseItem
 * @text アイテムの喪失 (Lose Instance)
 * @desc 指定IDのアイテムインスタンスを優先度に基づき削除します。
 * @arg baseId
 * @text テンプレートID (baseId)
 * @type string
 * @default item_001
 * @arg amount
 * @text 削除数量
 * @type number
 * @min 1
 * @default 1
 *
 * @command OpenStorage
 * @text 倉庫メニューを開く (Open Storage)
 * @desc 倉庫UIを開きます。
 */

(() => {
    "use strict";

    const pluginName = "CM_ItemSystem";
    const params = PluginManager.parameters(pluginName);
    const CAT_WEAPON = params['WeaponCategoryId'] || 'weapon';
    const CAT_ITEM = params['ItemCategoryId'] || 'item';
    const DEF_WEAPON_SLOTS = Number(params['DefaultWeaponSlots'] || 3);
    const DEF_ITEM_SLOTS = Number(params['DefaultItemSlots'] || 3);

    window.CM_Item = window.CM_Item || {};
    const CMI = window.CM_Item;

    CMI.Data = null; 
    CMI._isFetchingData = false; 
    CMI.VueAppInstance = null;
    CMI.State = { isStorageOpen: false };
    CMI._vueSyncCallback = null;

    CMI.requestSync = function() {
        if (this._vueSyncCallback) this._vueSyncCallback();
    };

    //=============================================================================
    // 1. 初期化とデータロード (Boot Blocker & Sync JSON Fetching)
    //=============================================================================
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        CMI._isFetchingData = true;
        fetch('data/ItemData.json')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) {
                    CMI.Data = data;
                    console.log("[CM_ItemSystem] ItemData.json のロードに成功しました。");
                }
            })
            .catch(e => console.warn("[CM_ItemSystem] ItemData.json のロードに失敗:", e))
            .finally(() => { CMI._isFetchingData = false; });
        
        _Scene_Boot_start.call(this);
    };

    const _Scene_Boot_isReady = Scene_Boot.prototype.isReady;
    Scene_Boot.prototype.isReady = function() {
        if (!_Scene_Boot_isReady.call(this)) return false;
        return !CMI._isFetchingData; 
    };

    CMI.getDb = function() {
        if (CMI.Data) return CMI.Data; 
        return (window.CM_EditorState && window.CM_EditorState.db && window.CM_EditorState.db.itemDb) 
               ? window.CM_EditorState.db.itemDb 
               : { settings: { categories: [], tags: [] }, items: [] };
    };

    CMI.getItemDef = function(baseId) {
        if (!baseId) return null;
        const db = this.getDb();
        return db.items.find(i => i.id === baseId) || null;
    };

    //=============================================================================
    // 2. インスタンス生成器 (UUID Generator)
    //=============================================================================
    const generateUid = (baseId) => {
        const timestamp = Date.now();
        const salt = Math.random().toString(36).substr(2, 5);
        return `${baseId}_${timestamp}_${salt}`;
    };

    //=============================================================================
    // 3. ゲームオブジェクト拡張 (Game Object Extensions)
    //=============================================================================
    const _Game_Party_initialize = Game_Party.prototype.initialize;
    Game_Party.prototype.initialize = function() {
        _Game_Party_initialize.call(this);
        this._cmWeaponSlots = new Array(DEF_WEAPON_SLOTS).fill(null);
        this._cmItemSlots = new Array(DEF_ITEM_SLOTS).fill(null);
        this._cmStorage = []; 
        this._cmActiveWeaponIdx = 0;
    };

    const verifyInit = () => {
        if (!$gameParty) return false;
        if (!$gameParty._cmWeaponSlots) {
            $gameParty._cmWeaponSlots = new Array(DEF_WEAPON_SLOTS).fill(null);
            $gameParty._cmItemSlots = new Array(DEF_ITEM_SLOTS).fill(null);
            $gameParty._cmStorage = [];
            $gameParty._cmActiveWeaponIdx = 0;
        }
        return true;
    };

    //=============================================================================
    // 4. グローバルAPI (Global Core API)
    //=============================================================================
    CMI.gainItem = function(baseId, amount = 1) {
        if (!verifyInit()) return false;
        const def = this.getItemDef(baseId);
        if (!def) return false;

        let gained = 0;
        for (let i = 0; i < amount; i++) {
            const instance = {
                uid: generateUid(baseId),
                baseId: baseId,
                durability: def.maxDurability || 0
            };
            $gameParty._cmStorage.push(instance);
            gained++;
        }
        
        if (gained > 0) {
            AudioManager.playSe({ name: "Item3", volume: 90, pitch: 100, pan: 0 });
            if (window.CM_Dialogue && window.CM_Dialogue.services) {
                window.CM_Dialogue.services.showToast(`[${def.name}] を獲得しました。`);
            }
            this.requestSync(); 
        }
        return true;
    };

    CMI.hasItem = function(baseId, excludeBroken = true) {
        if (!verifyInit()) return 0;
        let count = 0;
        const checkInstance = (inst) => {
            if (!inst || inst.baseId !== baseId) return;
            if (excludeBroken && inst.durability === 0 && CMI.getItemDef(baseId).maxDurability > 0) return;
            count++;
        };
        $gameParty._cmWeaponSlots.forEach(checkInstance);
        $gameParty._cmItemSlots.forEach(checkInstance);
        $gameParty._cmStorage.forEach(checkInstance);
        return count;
    };

    CMI.loseItem = function(baseId, amount = 1) {
        if (!verifyInit()) return false;
        let removed = 0;
        let candidates = [];
        
        $gameParty._cmWeaponSlots.forEach((inst, idx) => { if(inst && inst.baseId === baseId) candidates.push({loc: 'weapon', idx, inst}); });
        $gameParty._cmItemSlots.forEach((inst, idx) => { if(inst && inst.baseId === baseId) candidates.push({loc: 'item', idx, inst}); });
        $gameParty._cmStorage.forEach((inst, idx) => { if(inst && inst.baseId === baseId) candidates.push({loc: 'storage', idx, inst}); });

        candidates.sort((a, b) => a.inst.durability - b.inst.durability);

        for (let i = 0; i < amount && i < candidates.length; i++) {
            const target = candidates[i];
            if (target.loc === 'weapon') {
                $gameParty._cmWeaponSlots[target.idx] = null;
            } else if (target.loc === 'item') {
                $gameParty._cmItemSlots[target.idx] = null;
            } else {
                const sIdx = $gameParty._cmStorage.findIndex(s => s.uid === target.inst.uid);
                if (sIdx > -1) $gameParty._cmStorage.splice(sIdx, 1);
            }
            removed++;
        }

        if (removed > 0) this.requestSync();
        return removed > 0;
    };

    CMI.findInstanceByUid = function(uid) {
        if (!verifyInit()) return null;
        for (let i = 0; i < $gameParty._cmWeaponSlots.length; i++) {
            if ($gameParty._cmWeaponSlots[i] && $gameParty._cmWeaponSlots[i].uid === uid) {
                return { loc: 'weapon', idx: i, inst: $gameParty._cmWeaponSlots[i] };
            }
        }
        for (let i = 0; i < $gameParty._cmItemSlots.length; i++) {
            if ($gameParty._cmItemSlots[i] && $gameParty._cmItemSlots[i].uid === uid) {
                return { loc: 'item', idx: i, inst: $gameParty._cmItemSlots[i] };
            }
        }
        for (let i = 0; i < $gameParty._cmStorage.length; i++) {
            if ($gameParty._cmStorage[i].uid === uid) {
                return { loc: 'storage', idx: i, inst: $gameParty._cmStorage[i] };
            }
        }
        return null;
    };

    CMI.getActiveWeaponUid = function() {
        if (!verifyInit()) return null;
        const idx = $gameParty._cmActiveWeaponIdx;
        const inst = $gameParty._cmWeaponSlots[idx];
        return inst ? inst.uid : null;
    };

    //=============================================================================
    // 5. 大統一アクション決済管線 (Grand Unified Action Pipeline)
    //=============================================================================

    /**
     * 🌟 大統一動作効果決済器 (安全なダックタイピングとコンテキスト解決)
     * @param {string} baseId - 物品字典 ID
     * @param {Object|Game_BattlerBase} subject - 施法者实例（プレイヤー/エネミー）
     * @param {Object|Game_BattlerBase} targetEntity - (Optional) サンドボックスからの明示的ターゲット
     */
    CMI.applyItemEffects = function(baseId, subject, targetEntity = null) {
        const def = this.getItemDef(baseId);
        if (!def) return false;

        // 1. 安全な陣営判定 (Safe Duck Typing)
        // ネイティブの関数呼び出しと純データオブジェクトのブール値を両方サポート
        const isEnemySubject = typeof subject.isEnemy === 'function' ? subject.isEnemy() : !!subject.isEnemy;

        // 2. ターゲット解決 (Relativistic Target Resolution)
        let actionTarget = subject;

        if (def.targetType === 'enemy') {
            if (targetEntity) {
                // サンドボックス(AutoBattler)から明示的にターゲットが注入された場合
                actionTarget = targetEntity;
            } else if (window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE') {
                // UIからの直接使用だが、戦闘フェーズ中の場合
                actionTarget = isEnemySubject ? window.CM_AutoBattler.State.entities[0] : window.CM_AutoBattler.State.entities[1];
            } else {
                // 通常のマップ上やネイティブ戦闘時のフォールバック
                actionTarget = isEnemySubject ? $gameParty.leader() : ($gameTroop.members().length > 0 ? $gameTroop.members()[0] : null);
            }
        } else if (def.targetType === 'self') {
            actionTarget = subject;
        }

        // 3. 状態分発管線 (State Distribution)
        if (def.grantedStates && def.grantedStates.length > 0 && actionTarget) {
            for (const st of def.grantedStates) {
                if (Math.random() * 100 <= (st.chance !== undefined ? st.chance : 100)) {
                    // ダックタイピングによるメソッド呼び出しの安全な解決
                    if (typeof actionTarget.addCmState === 'function') {
                        actionTarget.addCmState(st.id);
                    } else if (window.CM_Status && typeof window.CM_Status.addCmState === 'function') {
                        window.CM_Status.addCmState(actionTarget, st.id);
                    }
                }
            }
        }

        // 4. 宏実行 (Macro Execution)
        if (def.effects && def.effects.length > 0 && window.CM_Macro) {
            def.effects.forEach(macroStr => window.CM_Macro.execute(macroStr));
        }

        // 5. 劇本非同期フック連動 (Async Dialogue Hook)
        if (def.dialogueScene && def.dialogueNodeId !== null && window.CM_Dialogue) {
            if (typeof window.CM_Dialogue.jumpToFileAsync === 'function') {
                window.CM_Dialogue.jumpToFileAsync(def.dialogueScene, def.dialogueNodeId);
            }
        }
    };

    /**
     * 玩家專用の快捷欄物品使用入口 (UUID 管線)
     */
    CMI.executeActionByUid = function(uid) {
        const targetInfo = this.findInstanceByUid(uid);
        if (!targetInfo) return false;

        const inst = targetInfo.inst;
        const def = this.getItemDef(inst.baseId);
        if (!def || !def.isUsable) {
            AudioManager.playSe({ name: "Buzzer1", volume: 90, pitch: 100, pan: 0 });
            return false;
        }

        if (def.maxDurability > 0 && inst.durability <= 0) {
            AudioManager.playSe({ name: "Buzzer1", volume: 90, pitch: 100, pan: 0 });
            return false;
        }

        // 1. サンドボックスとのコンテキスト統合 (Sandbox Context Resolution)
        let subject = $gameParty.leader();
        let targetEntity = null;
        let isSandbox = false;

        if (window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE') {
            subject = window.CM_AutoBattler.State.entities[0];
            targetEntity = window.CM_AutoBattler.State.entities[1];
            isSandbox = true;
        }
        
        // 状態異常・行動不能検証 (Incapacitated validation)
        if (!isSandbox && subject.isRestricted()) {
            AudioManager.playSe({ name: "Buzzer1", volume: 90, pitch: 100, pan: 0 });
            if (window.CM_Dialogue && window.CM_Dialogue.services) {
                window.CM_Dialogue.services.showToast("行動不能な状態です。");
            }
            return false;
        }

        // 成本消耗 (Cost Resolution)
        if (def.costHP > 0 || def.costMP > 0 || def.costSP > 0) {
            if (subject.hp < def.costHP || subject.mp < def.costMP) {
                AudioManager.playSe({ name: "Buzzer1", volume: 90, pitch: 100, pan: 0 });
                if (window.CM_Dialogue && window.CM_Dialogue.services) {
                    window.CM_Dialogue.services.showToast("HPまたはMPが不足しています。");
                }
                return false;
            }
            
            if (isSandbox) {
                // サンドボックス内の直接減算とネイティブUIへの同期
                subject.hp -= def.costHP;
                subject.mp -= def.costMP;
                subject.sp -= (def.costSP || 0);
                $gameParty.leader().setHp(subject.hp);
                $gameParty.leader().setMp(subject.mp);
                $gameParty.leader().setTp(subject.sp);
            } else if (window.CM_TimeSurvival && window.CM_TimeSurvival.advanceTimeAndStats) {
                window.CM_TimeSurvival.advanceTimeAndStats(0, def.costHP, def.costMP, def.costSP || 0);
            } else {
                subject.gainHp(-def.costHP);
                subject.gainMp(-def.costMP);
            }
        }

        // ======= 核心调用：統一効果決済 API =======
        this.applyItemEffects(inst.baseId, subject, targetEntity);

        AudioManager.playSe({ name: "Heal3", volume: 90, pitch: 100, pan: 0 });

        // 耐久度決済 (Durability Processing)
        if (def.maxDurability > 0) {
            inst.durability -= 1;
            if (inst.durability <= 0 && !def.keepOnBreak) {
                if (targetInfo.loc === 'weapon') {
                    $gameParty._cmWeaponSlots[targetInfo.idx] = null;
                } else if (targetInfo.loc === 'item') {
                    $gameParty._cmItemSlots[targetInfo.idx] = null;
                } else {
                    $gameParty._cmStorage.splice(targetInfo.idx, 1);
                }
            }
        }

        this.requestSync(); 
        return true;
    };

    //=============================================================================
    // 6. プラグインコマンド (Plugin Commands)
    //=============================================================================
    PluginManager.registerCommand(pluginName, "GainItem", args => {
        CMI.gainItem(args.baseId, Number(args.amount) || 1);
    });
    PluginManager.registerCommand(pluginName, "LoseItem", args => {
        CMI.loseItem(args.baseId, Number(args.amount) || 1);
    });
    PluginManager.registerCommand(pluginName, "OpenStorage", args => {
        CMI.State.isStorageOpen = true;
        CMI.requestSync(); 
    });

    //=============================================================================
    // 7. Vue3 UI マウント (Spatial Drag & Drop Interface & GPU Optimized)
    //=============================================================================
    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        CMI.mountVueUI();
        setTimeout(() => CMI.requestSync(), 50); 
    };

    CMI.mountVueUI = function() {
        if (document.getElementById('cm-item-container')) return;
        
        const style = document.createElement('style');
        style.innerHTML = `
            .cm-gpu-accelerated {
                transform: translateZ(0);
                will-change: transform, opacity;
                backface-visibility: hidden;
            }
            .cm-dnd-zone { transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), border-color 0.2s, box-shadow 0.2s; }
            .cm-dnd-zone.is-dragover { transform: scale(1.05); filter: brightness(1.2); }
            
            .cm-slot-weapon { background: #1a1a1a; border: 2px solid #ff4b8b; }
            .cm-slot-weapon.is-active { box-shadow: 0 0 20px rgba(255, 75, 139, 0.8); background: rgba(255, 75, 139, 0.2); }
            .cm-slot-weapon.is-dragover { border-color: #ffda3b; box-shadow: 0 0 15px rgba(255,218,59,0.5); }
            
            .cm-slot-item { background: #1a1a1a; border: 2px solid #00d2ff; }
            .cm-slot-item:active { transform: scale(0.95); }
            .cm-slot-item.is-dragover { border-color: #ffda3b; box-shadow: 0 0 15px rgba(255,218,59,0.5); }
            
            .cm-use-zone { background: rgba(76, 175, 80, 0.1); border: 2px dashed rgba(76, 175, 80, 0.5); }
            .cm-use-zone.is-dragover { background: rgba(76, 175, 80, 0.3); border-color: #4caf50; box-shadow: 0 0 20px rgba(76,175,80,0.6); }
            
            .cm-discard-zone { background: rgba(244, 67, 54, 0.1); border: 2px dashed rgba(244, 67, 54, 0.5); }
            .cm-discard-zone.is-dragover { background: rgba(244, 67, 54, 0.3); border-color: #f44336; box-shadow: 0 0 20px rgba(244,67,54,0.6); }
            
            .cm-storage-zone { background: rgba(255, 255, 255, 0.05); border: 2px solid rgba(255, 255, 255, 0.2); }
            .cm-storage-zone.is-dragover { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.8); }
            
            .cm-item-draggable { cursor: grab; transition: transform 0.1s; }
            .cm-item-draggable:active { cursor: grabbing; transform: scale(0.95); }

            .cm-hud-tooltip {
                position: absolute; left: 0; right: 0; bottom: 70px; 
                background: rgba(20, 15, 25, 0.95); border: 1px solid rgba(255, 255, 255, 0.3);
                padding: 10px; border-radius: 8px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                backdrop-filter: blur(8px); text-align: center; pointer-events: none;
                opacity: 0; transition: opacity 0.2s, transform 0.2s; transform: translateY(10px);
            }
            .cm-hud-tooltip.is-visible { opacity: 1; transform: translateY(0); }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'cm-item-container';
        root.className = 'cm-gpu-accelerated'; 
        root.style.position = 'absolute';
        root.style.top = '0';
        root.style.left = '0';
        root.style.width = '100vw';
        root.style.height = '100vh';
        root.style.pointerEvents = 'none';
        root.style.zIndex = '9500'; 
        document.body.appendChild(root);

        const { createApp, ref, computed, reactive, onMounted, onUnmounted } = window.Vue;

        const app = createApp({
            setup() {
                const db = computed(() => CMI.getDb());
                const categories = computed(() => {
                    const cats = [...(db.value.settings.categories || [])];
                    cats.unshift({ id: 'all', name: '全般' });
                    return cats;
                });

                const activeCategory = ref('all');
                const weaponSlots = ref([]);
                const itemSlots = ref([]);
                const storage = ref([]);
                const isStorageOpen = ref(false);
                const activeWeaponIdx = ref(0);

                const isCombatActive = () => {
                    return window.CM_AutoBattler && window.CM_AutoBattler.State.phase !== 'INACTIVE';
                };

                onMounted(() => {
                    CMI._vueSyncCallback = () => {
                        verifyInit();
                        weaponSlots.value = $gameParty._cmWeaponSlots.map(i => i ? {...i} : null);
                        itemSlots.value = $gameParty._cmItemSlots.map(i => i ? {...i} : null);
                        storage.value = $gameParty._cmStorage.map(i => ({...i}));
                        isStorageOpen.value = CMI.State.isStorageOpen;
                        activeWeaponIdx.value = $gameParty._cmActiveWeaponIdx;
                    };
                });

                onUnmounted(() => { CMI._vueSyncCallback = null; });

                const toggleStorage = () => {
                    if (isCombatActive()) {
                        AudioManager.playSe({ name: "Buzzer1", volume: 90, pitch: 100, pan: 0 });
                        if (window.CM_Dialogue && window.CM_Dialogue.services) window.CM_Dialogue.services.showToast("戦闘中は開けません。");
                        return;
                    }
                    CMI.State.isStorageOpen = !CMI.State.isStorageOpen;
                    CMI.requestSync();
                    if (CMI.State.isStorageOpen) AudioManager.playSe({ name: "Equip1", volume: 90, pitch: 100, pan: 0 });
                    else SoundManager.playCancel();
                };

                const closeStorage = () => {
                    CMI.State.isStorageOpen = false;
                    CMI.requestSync(); 
                    SoundManager.playCancel();
                };

                const getDef = (baseId) => CMI.getItemDef(baseId);

                const filteredStorage = computed(() => {
                    if (activeCategory.value === 'all') return storage.value;
                    return storage.value.filter(inst => {
                        const def = getDef(inst.baseId);
                        return def && def.categoryId === activeCategory.value;
                    });
                });

                const isHudVisible = computed(() => {
                    if (window.CM_Dialogue && window.CM_Dialogue.State && window.CM_Dialogue.State.isActive) return false;
                    if (isStorageOpen.value) return false;
                    return true;
                });

                const hoverState = reactive({ active: false, def: null, inst: null });
                
                const showTooltip = (inst) => {
                    if (!inst) return;
                    hoverState.def = getDef(inst.baseId);
                    hoverState.inst = inst;
                    hoverState.active = true;
                };
                
                const hideTooltip = () => { hoverState.active = false; };

                const handleImageError = (e) => { 
                    const target = e.target;
                    if (target.dataset.error) return;
                    target.dataset.error = 'true';
                    target.src = 'img/item/item_def.png'; 
                };

                // クリックアクション制御 (Click Actions)
                const onClickWeapon = (idx) => {
                    if ($gameParty._cmActiveWeaponIdx !== idx) {
                        $gameParty._cmActiveWeaponIdx = idx;
                        AudioManager.playSe({ name: "Equip2", volume: 90, pitch: 100, pan: 0 });
                        CMI.requestSync();
                    }
                };

                const onClickItem = (inst) => {
                    if (!inst) return;
                    CMI.executeActionByUid(inst.uid);
                };

                // 空間ドラッグ＆ドロップ検証エンジン (Spatial D&D Validation Engine)
                const dragState = reactive({ active: false, uid: null, source: null, sourceIdx: -1, hoverZone: null });

                const onDragStart = (e, uid, source, idx) => {
                    if (isCombatActive()) { e.preventDefault(); return; }
                    hideTooltip();
                    dragState.active = true;
                    dragState.uid = uid;
                    dragState.source = source;
                    dragState.sourceIdx = idx;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', uid);
                };

                const onDragEnd = () => {
                    dragState.active = false;
                    dragState.uid = null;
                    dragState.hoverZone = null;
                };

                const onDragEnter = (zone) => { dragState.hoverZone = zone; };
                const onDragLeave = (zone) => { if (dragState.hoverZone === zone) dragState.hoverZone = null; };

                // 武器スロットへのドロップ (Drop on Weapon Slot)
                const onDropWeapon = (e, targetIdx) => {
                    if (!dragState.active || !dragState.uid) return;
                    const instInfo = CMI.findInstanceByUid(dragState.uid);
                    if (!instInfo) return;

                    const def = getDef(instInfo.inst.baseId);
                    if (!def || def.categoryId !== CAT_WEAPON) {
                        AudioManager.playSe({ name: "Buzzer1", volume: 90, pitch: 100, pan: 0 });
                        dragState.hoverZone = null;
                        return;
                    }

                    const inst = instInfo.inst;
                    const targetInst = $gameParty._cmWeaponSlots[targetIdx];

                    if (instInfo.loc === 'storage') {
                        $gameParty._cmWeaponSlots[targetIdx] = inst;
                        $gameParty._cmStorage.splice(instInfo.idx, 1);
                        if (targetInst) $gameParty._cmStorage.push(targetInst); 
                        AudioManager.playSe({ name: "Equip1", volume: 90, pitch: 100, pan: 0 });
                    } else if (instInfo.loc === 'weapon') {
                        $gameParty._cmWeaponSlots[instInfo.idx] = targetInst;
                        $gameParty._cmWeaponSlots[targetIdx] = inst;
                        AudioManager.playSe({ name: "Equip1", volume: 90, pitch: 100, pan: 0 });
                    }
                    dragState.hoverZone = null;
                    CMI.requestSync(); 
                };

                // 道具スロットへのドロップ (Drop on Item Slot)
                const onDropItem = (e, targetIdx) => {
                    if (!dragState.active || !dragState.uid) return;
                    const instInfo = CMI.findInstanceByUid(dragState.uid);
                    if (!instInfo) return;

                    const def = getDef(instInfo.inst.baseId);
                    if (!def || def.categoryId !== CAT_ITEM) {
                        AudioManager.playSe({ name: "Buzzer1", volume: 90, pitch: 100, pan: 0 });
                        dragState.hoverZone = null;
                        return;
                    }

                    const inst = instInfo.inst;
                    const targetInst = $gameParty._cmItemSlots[targetIdx];

                    if (instInfo.loc === 'storage') {
                        $gameParty._cmItemSlots[targetIdx] = inst;
                        $gameParty._cmStorage.splice(instInfo.idx, 1);
                        if (targetInst) $gameParty._cmStorage.push(targetInst); 
                        AudioManager.playSe({ name: "Equip1", volume: 90, pitch: 100, pan: 0 });
                    } else if (instInfo.loc === 'item') {
                        $gameParty._cmItemSlots[instInfo.idx] = targetInst;
                        $gameParty._cmItemSlots[targetIdx] = inst;
                        AudioManager.playSe({ name: "Equip1", volume: 90, pitch: 100, pan: 0 });
                    }
                    dragState.hoverZone = null;
                    CMI.requestSync(); 
                };

                // 倉庫へのドロップ (Drop on Storage)
                const onDropStorage = (e) => {
                    if (!dragState.active || !dragState.uid) return;
                    if (dragState.source === 'weapon' || dragState.source === 'item') {
                        const instInfo = CMI.findInstanceByUid(dragState.uid);
                        if (instInfo && (instInfo.loc === 'weapon' || instInfo.loc === 'item')) {
                            $gameParty._cmStorage.push(instInfo.inst);
                            if (instInfo.loc === 'weapon') $gameParty._cmWeaponSlots[instInfo.idx] = null;
                            if (instInfo.loc === 'item') $gameParty._cmItemSlots[instInfo.idx] = null;
                            AudioManager.playSe({ name: "Equip1", volume: 90, pitch: 100, pan: 0 });
                        }
                    }
                    dragState.hoverZone = null;
                    CMI.requestSync(); 
                };

                // 使用・破棄ゾーンへのドロップ
                const onDropUse = (e) => {
                    if (!dragState.active || !dragState.uid) return;
                    const instInfo = CMI.findInstanceByUid(dragState.uid);
                    if (instInfo) CMI.executeActionByUid(dragState.uid);
                    dragState.hoverZone = null;
                };

                const onDropDiscard = (e) => {
                    if (!dragState.active || !dragState.uid) return;
                    const instInfo = CMI.findInstanceByUid(dragState.uid);
                    if (!instInfo) return;
                    
                    const def = getDef(instInfo.inst.baseId);
                    if (window.confirm(`[${def.name}] を破棄しますか？`)) {
                        if (instInfo.loc === 'weapon') $gameParty._cmWeaponSlots[instInfo.idx] = null;
                        else if (instInfo.loc === 'item') $gameParty._cmItemSlots[instInfo.idx] = null;
                        else $gameParty._cmStorage.splice(instInfo.idx, 1);
                        AudioManager.playSe({ name: "Wind1", volume: 90, pitch: 100, pan: 0 });
                        CMI.requestSync(); 
                    }
                    dragState.hoverZone = null;
                };

                const barStyle = computed(() => {
                    let c = { left: "350px", bottom: "140px" };
                    if (window.CM_Core && window.CM_Core.UILayout && window.CM_Core.UILayout.reactiveState) {
                        c = window.CM_Core.UILayout.reactiveState.config.quickItemBar || c;
                    }
                    let style = {};
                    if (c.left && c.left !== 'auto') style.left = c.left;
                    if (c.right && c.right !== 'auto') style.right = c.right;
                    if (c.top && c.top !== 'auto') style.top = c.top;
                    if (c.bottom && c.bottom !== 'auto') style.bottom = c.bottom;
                    const scale = document.documentElement.style.getPropertyValue('--cm-scale-x') || 1;
                    style.transform = `translateZ(0) scale(${scale})`;
                    style.transformOrigin = (style.left ? 'left ' : 'right ') + (style.top ? 'top' : 'bottom');
                    return style;
                });

                return { 
                    categories, activeCategory, weaponSlots, itemSlots, storage, filteredStorage, 
                    isStorageOpen, activeWeaponIdx, toggleStorage, closeStorage, getDef, 
                    hoverState, showTooltip, hideTooltip, handleImageError, barStyle, isHudVisible,
                    dragState, onDragStart, onDragEnd, onDragEnter, onDragLeave,
                    onClickWeapon, onClickItem,
                    onDropWeapon, onDropItem, onDropStorage, onDropUse, onDropDiscard
                };
            },
            template: `
                <div style="width: 100%; height: 100%; position: relative;">
                    
                    <div v-show="isHudVisible" :style="barStyle" class="cm-gpu-accelerated" style="position: absolute; pointer-events: auto; z-index: 9500;">
                        
                        <div class="cm-hud-tooltip" :class="{'is-visible': hoverState.active && hoverState.def}">
                            <div v-if="hoverState.def" style="font-weight: bold; font-size: 14px; color: #ffda3b;">{{ hoverState.def.name }}</div>
                            <div v-if="hoverState.def" style="font-size: 12px; color: #ccc;">{{ hoverState.def.description }}</div>
                        </div>

                        <div style="display: flex; gap: 20px;">
                            <div style="display: flex; gap: 8px;">
                                <div v-for="(inst, idx) in weaponSlots" :key="'hud_w_'+idx" 
                                     class="cm-dnd-zone cm-slot-weapon" :class="{'is-active': activeWeaponIdx === idx}"
                                     @click="onClickWeapon(idx)"
                                     @mouseenter="showTooltip(inst)" @mouseleave="hideTooltip"
                                     style="width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative; cursor: pointer;">
                                    <template v-if="inst">
                                        <img :src="'img/item/' + inst.baseId + '.png'" @error="handleImageError"
                                             :style="{ filter: inst.durability <= 0 && getDef(inst.baseId).maxDurability > 0 ? 'grayscale(100%) opacity(0.5)' : 'none' }"
                                             style="width: 36px; height: 36px; object-fit: contain;" />
                                        <div v-if="getDef(inst.baseId).maxDurability > 0" 
                                             style="position: absolute; bottom: -4px; right: -4px; background: #222; border: 1px solid #ff4b8b; color: #fff; font-size: 9px; font-weight: bold; padding: 1px 4px; border-radius: 6px;">
                                            {{ inst.durability }}
                                        </div>
                                    </template>
                                </div>
                            </div>

                            <div style="width: 2px; background: rgba(255,255,255,0.2); border-radius: 1px;"></div>

                            <div style="display: flex; gap: 8px;">
                                <div v-for="(inst, idx) in itemSlots" :key="'hud_i_'+idx" 
                                     class="cm-dnd-zone cm-slot-item"
                                     @click="onClickItem(inst)"
                                     @mouseenter="showTooltip(inst)" @mouseleave="hideTooltip"
                                     style="width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative; cursor: pointer;">
                                    <template v-if="inst">
                                        <img :src="'img/item/' + inst.baseId + '.png'" @error="handleImageError"
                                             :style="{ filter: inst.durability <= 0 && getDef(inst.baseId).maxDurability > 0 ? 'grayscale(100%) opacity(0.5)' : 'none' }"
                                             style="width: 36px; height: 36px; object-fit: contain;" />
                                        <div v-if="getDef(inst.baseId).maxDurability > 0" 
                                             style="position: absolute; bottom: -4px; right: -4px; background: #222; border: 1px solid #00d2ff; color: #fff; font-size: 9px; font-weight: bold; padding: 1px 4px; border-radius: 6px;">
                                            {{ inst.durability }}
                                        </div>
                                    </template>
                                </div>
                            </div>
                            
                            <div @click="toggleStorage"
                                 style="width: 50px; height: 50px; background: rgba(255, 255, 255, 0.1); border: 2px dashed rgba(255, 255, 255, 0.5); 
                                        border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s;">
                                <span style="font-size: 24px;">🎒</span>
                            </div>
                        </div>
                    </div>

                    <transition name="cm-fade">
                        <div v-if="isStorageOpen" @click.self="closeStorage" class="cm-gpu-accelerated"
                             style="position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.7); 
                                    z-index: 9800; display: flex; align-items: center; justify-content: center; pointer-events: auto; backdrop-filter: blur(8px);">
                            
                            <div style="width: 900px; height: 85%; background: rgba(25, 20, 30, 0.95); border: 1px solid rgba(255, 255, 255, 0.2); 
                                        border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.8); overflow: hidden;">
                                
                                <div style="padding: 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0,0,0,0.3); display: flex; align-items: center; gap: 30px;">
                                    
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <span style="color: #ff4b8b; font-weight: bold; font-size: 14px; writing-mode: vertical-lr;">武器</span>
                                        <div v-for="(inst, idx) in weaponSlots" :key="'store_w_'+idx"
                                             class="cm-dnd-zone cm-slot-weapon" :class="{ 'is-dragover': dragState.hoverZone === 'weapon_'+idx }"
                                             @dragover.prevent @drop="onDropWeapon($event, idx)"
                                             @dragenter="onDragEnter('weapon_'+idx)" @dragleave="onDragLeave('weapon_'+idx)"
                                             style="width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative;">
                                            <template v-if="inst">
                                                <img :src="'img/item/' + inst.baseId + '.png'" @error="handleImageError"
                                                     draggable="true" @dragstart="onDragStart($event, inst.uid, 'weapon', idx)" @dragend="onDragEnd"
                                                     class="cm-item-draggable"
                                                     style="width: 40px; height: 40px; object-fit: contain;" />
                                            </template>
                                        </div>
                                    </div>

                                    <div style="width: 2px; height: 50px; background: rgba(255,255,255,0.1);"></div>

                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <span style="color: #00d2ff; font-weight: bold; font-size: 14px; writing-mode: vertical-lr;">道具</span>
                                        <div v-for="(inst, idx) in itemSlots" :key="'store_i_'+idx"
                                             class="cm-dnd-zone cm-slot-item" :class="{ 'is-dragover': dragState.hoverZone === 'item_'+idx }"
                                             @dragover.prevent @drop="onDropItem($event, idx)"
                                             @dragenter="onDragEnter('item_'+idx)" @dragleave="onDragLeave('item_'+idx)"
                                             style="width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative;">
                                            <template v-if="inst">
                                                <img :src="'img/item/' + inst.baseId + '.png'" @error="handleImageError"
                                                     draggable="true" @dragstart="onDragStart($event, inst.uid, 'item', idx)" @dragend="onDragEnd"
                                                     class="cm-item-draggable"
                                                     style="width: 40px; height: 40px; object-fit: contain;" />
                                            </template>
                                        </div>
                                    </div>

                                    <button @click="closeStorage" style="margin-left: auto; background: none; border: none; color: #fff; font-size: 28px; cursor: pointer; opacity: 0.7;">✕</button>
                                </div>

                                <div style="flex: 1; display: flex; overflow: hidden; padding: 20px; gap: 20px;">
                                    
                                    <div class="cm-dnd-zone cm-storage-zone"
                                         :class="{ 'is-dragover': dragState.hoverZone === 'storage' }"
                                         @dragover.prevent @drop="onDropStorage"
                                         @dragenter="onDragEnter('storage')" @dragleave="onDragLeave('storage')"
                                         style="flex: 1; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden;">
                                        
                                        <div style="padding: 15px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; gap: 10px; overflow-x: auto;">
                                            <button v-for="cat in categories" :key="cat.id" @click="activeCategory = cat.id"
                                                    :style="{ background: activeCategory === cat.id ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0,0,0,0.4)' }"
                                                    style="border: 1px solid rgba(255, 255, 255, 0.3); color: #fff; padding: 6px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; transition: 0.2s;">
                                                {{ cat.name }}
                                            </button>
                                        </div>

                                        <div style="flex: 1; padding: 15px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 15px; align-content: start;">
                                            <div v-for="(inst, idx) in filteredStorage" :key="inst.uid"
                                                 style="aspect-ratio: 1; background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.15); 
                                                        border-radius: 8px; position: relative; display: flex; align-items: center; justify-content: center;">
                                                <img :src="'img/item/' + inst.baseId + '.png'" @error="handleImageError"
                                                     draggable="true" @dragstart="onDragStart($event, inst.uid, 'storage', idx)" @dragend="onDragEnd"
                                                     class="cm-item-draggable"
                                                     style="width: 44px; height: 44px; object-fit: contain;" />
                                                <div v-if="getDef(inst.baseId).maxDurability > 0" 
                                                     style="position: absolute; bottom: -4px; right: -4px; background: rgba(0,0,0,0.9); border: 1px solid #777; color: #fff; font-size: 10px; font-weight: bold; padding: 1px 4px; border-radius: 4px;">
                                                    {{ inst.durability }}
                                                </div>
                                            </div>
                                            <div v-if="filteredStorage.length === 0" style="grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.5); padding: 60px 0; font-size: 14px;">
                                                このカテゴリにはアイテムがありません。
                                            </div>
                                        </div>
                                    </div>

                                    <div style="width: 160px; display: flex; flex-direction: column; gap: 20px;">
                                        <div class="cm-dnd-zone cm-use-zone"
                                             :class="{ 'is-dragover': dragState.hoverZone === 'use' }"
                                             @dragover.prevent @drop="onDropUse"
                                             @dragenter="onDragEnter('use')" @dragleave="onDragLeave('use')"
                                             style="flex: 1; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px;">
                                            <span style="font-size: 40px;">🟢</span>
                                            <span style="color: #4caf50; font-weight: bold; font-size: 16px; letter-spacing: 2px;">使用</span>
                                        </div>
                                        
                                        <div class="cm-dnd-zone cm-discard-zone"
                                             :class="{ 'is-dragover': dragState.hoverZone === 'discard' }"
                                             @dragover.prevent @drop="onDropDiscard"
                                             @dragenter="onDragEnter('discard')" @dragleave="onDragLeave('discard')"
                                             style="flex: 1; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px;">
                                            <span style="font-size: 40px;">🔴</span>
                                            <span style="color: #f44336; font-weight: bold; font-size: 16px; letter-spacing: 2px;">破棄</span>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </transition>
                </div>
            `
        });

        CMI.VueAppInstance = app.mount(root);
    };

})();