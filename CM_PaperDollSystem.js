/*:
 * @target MZ
 * @plugindesc [v6.7] ネイティブレイヤー・ペーパードール (パフォーマンス最適化・GC軽減・分離アーキテクチャ版)
 * @author Coding Assistant
 * @base CM_CoreEngine
 * * @help
 * ============================================================================
 * アーキテクチャ更新 (v6.7 パフォーマンス改善 & 初期装備対応):
 * 1. 【スプライトプーリング】: レンダリング時の再構築(removeChildren)を廃止し、
 * オブジェクトプールによるテクスチャスワップに移行。GCプレッシャーを大幅軽減。
 * 2. 【ダーティフラグ・パターン】: 毎フレームの JS 文字列評価(evalCondition)を廃止。
 * HP変動、スイッチ・変数操作、ダメージ時にのみ表情条件を再計算するよう最適化。
 * 3. 【初期デフォルト装備】: エディタ V10.6 で設定された defaultEquips に対応。
 * ============================================================================
 * * @command OpenEquipMenu
 * @text 服装メニューを開く(Open Wardrobe)
 * @desc ペーパードール専用の着せ替え(クローゼット)UIを呼び出します。
 * * @command GainEquipment
 * @text 服装の取得(Gain Clothing)
 * @desc 指定した服装を専用インベントリに追加します。
 * @arg equipId
 * @text 服装ID
 * @desc 数値(例: 001) または 完全なID(例: cloth_001)
 * @type string
 * * @command LoseEquipment
 * @text 服装の破棄(Lose Clothing)
 * @desc インベントリから指定した服装を削除します。着用中の場合は自動で解除されます。
 * @arg equipId
 * @text 服装ID
 * @desc 数値(例: 001) または 完全なID(例: cloth_001)
 * @type string
 */

(() => {
    "use strict";

    window.CM_PaperDoll = window.CM_PaperDoll || {};
    const CMP = window.CM_PaperDoll;

    //=============================================================================
    // Vue UI テンプレート定数 (コードの可読性を高めるための分離)
    //=============================================================================
    const UI_CSS = `
        #cm-paperdoll-vue-root { 
            position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; 
            z-index: 9000; pointer-events: none; overflow: hidden;
        }
        .pd-overlay { 
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
            background: linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 60%); 
            pointer-events: auto; 
        }
        .pd-panel {
            position: absolute; left: 40px; top: 40px; bottom: 40px; width: 700px;
            padding: 35px; display: flex; flex-direction: column; pointer-events: auto;
            box-sizing: border-box; background: rgba(20, 15, 25, 0.85); 
            backdrop-filter: blur(12px); border-radius: 24px;
            box-shadow: 12px 12px 0 rgba(224, 108, 138, 0.4); 
            border: 2px solid var(--cm-color-primary, #e06c8a);
        }
        .pd-header { position: relative; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }
        .pd-title-wrapper { position: relative; }
        .pd-title-bg {
            font-family: var(--cm-font-bold, sans-serif); font-size: 52px; font-weight: 900; 
            color: rgba(255, 255, 255, 0.05); letter-spacing: 4px; line-height: 1;
            position: absolute; top: -15px; left: -5px; user-select: none;
        }
        .pd-title-fg {
            font-family: var(--cm-font-bold, sans-serif); font-size: 32px; font-weight: 900; 
            color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.8); position: relative; z-index: 1;
        }
        .pd-close-btn { 
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); 
            color: #fff; font-size: 24px; width: 44px; height: 44px; border-radius: 50%;
            display: flex; justify-content: center; align-items: center;
            cursor: pointer; transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); outline: none;
        }
        .pd-close-btn:hover { 
            background: var(--cm-color-primary, #e06c8a); color: #fff; 
            border-color: var(--cm-color-primary, #e06c8a); transform: scale(1.1) rotate(90deg); 
        }
        .pd-content { display: flex; gap: 30px; flex: 1; height: calc(100% - 80px); }
        .pd-slots { width: 220px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 10px; }
        .pd-slot-btn { 
            padding: 16px 20px; cursor: pointer; color: #fff; border-radius: 16px;
            background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05);
            display: flex; flex-direction: column; transition: all 0.3s ease;
        }
        .pd-slot-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); transform: translateX(4px); }
        .pd-slot-btn.active { 
            background: var(--cm-color-secondary, #00f2fe); border-color: var(--cm-color-secondary, #00f2fe);
            color: #000; box-shadow: 0 4px 15px rgba(0, 242, 254, 0.4); transform: translateX(8px);
        }
        .pd-slot-title { font-family: var(--cm-font-bold, sans-serif); font-size: 16px; font-weight: 900; }
        .pd-slot-equip { 
            font-family: sans-serif; font-size: 13px; margin-top: 6px; 
            color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pd-slot-btn.active .pd-slot-equip { color: rgba(0,0,0,0.7); font-weight: bold; }
        .pd-inventory { 
            flex: 1; display: grid; grid-template-columns: repeat(2, 1fr); 
            grid-auto-rows: max-content; gap: 16px; overflow-y: auto; padding-right: 10px; align-content: start;
        }
        .pd-item-card { 
            position: relative; padding: 16px; cursor: pointer; border-radius: 16px;
            background: rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.05);
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            text-align: center; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            min-height: 80px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        }
        .pd-item-card:hover { 
            border-color: var(--cm-color-primary, #e06c8a); background: rgba(224, 108, 138, 0.1);
            transform: translateY(-4px); box-shadow: 0 8px 15px rgba(0,0,0,0.3);
        }
        .pd-item-card.action-unequip { border-style: dashed; border-color: rgba(255, 255, 255, 0.3); }
        .pd-item-card.action-unequip:hover { border-color: #ffeb3b; background: rgba(255, 235, 59, 0.1); }
        .pd-item-name { font-family: var(--cm-font-bold, sans-serif); font-size: 15px; font-weight: 900; color: #fff; margin-bottom: 4px; }
        .pd-item-memo { font-size: 12px; color: var(--cm-color-primary, #e06c8a); }
        .pd-empty-msg {
            grid-column: span 2; font-family: var(--cm-font-bold, sans-serif); font-size: 15px; color: #888;
            text-align: center; margin-top: 60px; background: rgba(0,0,0,0.2); padding: 30px; border-radius: 16px;
        }
    `;

    const UI_HTML = `
        <div v-show="isMenuOpen">
            <div class="pd-overlay" @click="closeMenu"></div>
            <div class="pd-panel">
                <div class="pd-header">
                    <div class="pd-title-wrapper">
                        <div class="pd-title-bg">WARDROBE</div>
                        <div class="pd-title-fg">{{ t('wardrobe.title') }}</div>
                    </div>
                    <button class="pd-close-btn" @click="closeMenu">×</button>
                </div>
                <div class="pd-content">
                    <div class="pd-slots cm-scrollable">
                        <div v-for="(slot, index) in sortedSlots" :key="slot.id" 
                             class="pd-slot-btn" :class="{ active: currentSlotId === slot.id }"
                             @click="selectSlot(slot.id)">
                            <div class="pd-slot-title">{{ t(slot.name) }}</div>
                            <div class="pd-slot-equip">{{ t(getEquipNameForSlot(slot.id)) }}</div>
                        </div>
                    </div>
                    <div class="pd-inventory cm-scrollable">
                        <transition-group @enter="onItemEnter" @leave="onItemLeave" css="false">
                            <div v-if="currentEquippedItem && canUnequipCurrent" 
                                 key="unequip-btn" data-index="0"
                                 class="pd-item-card action-unequip" @click="unequipCurrent">
                                <div class="pd-item-name" style="color:#ccc;">{{ t('wardrobe.unequip') }}</div>
                            </div>
                            <div v-for="(item, index) in availableItems" :key="item.id" 
                                 :data-index="index + 1"
                                 class="pd-item-card" @click="equipItem(item.id)">
                                <div class="pd-item-name">{{ t(item.name) }}</div>
                                <div class="pd-item-memo" v-if="item.memo">{{ t(item.memo) }}</div>
                            </div>
                        </transition-group>
                        <div v-if="availableItems.length === 0 && (!currentEquippedItem || !canUnequipCurrent)" class="pd-empty-msg">
                            {{ t('wardrobe.empty') }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    //=============================================================================
    // ステート管理と初期化 (State & Initialization)
    //=============================================================================
    CMP.Data = null;
    CMP.State = { 
        needsRefresh: false,        // 装備やベースボディの変更時にtrue
        needsExpUpdate: true,       // スイッチ、変数、HP変動時にtrue (Dirty Flag)
        currentExpressionImage: "" 
    };

    CMP.registerProviders = function() {
        if (window.CM_Core && typeof window.CM_Core.registerRef === 'function') {
            window.CM_Core.registerRef('equip', function(id, prop) {
                if (!CMP.Data || !CMP.Data.items) return "";
                const item = CMP.Data.items.find(x => x.id === String(id).trim());
                if (!item) return "";
                const p = String(prop).trim().toLowerCase();
                if (p === 'name') return item.name || "";
                if (p === 'memo') return item.memo || "";
                return "";
            });
        }
    };

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() { 
        _Scene_Boot_start.call(this); 
        CMP.loadData().then(() => { CMP.initVueApp(); });
    };

    CMP.loadData = async function() {
        try { 
            const res = await fetch('data/Equipment/EquipmentData.json'); 
            if (res.ok) { 
                CMP.Data = await res.json(); 
                CMP.registerProviders();
            } 
        } catch(e) { console.error("[CM_PaperDoll] EquipmentData.json の取得に失敗:", e); }
    };

    // 初期化フック
    const _Game_Party_initialize = Game_Party.prototype.initialize;
    Game_Party.prototype.initialize = function() { 
        _Game_Party_initialize.call(this); 
        this._pdInventory = []; 
    };

    const _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) { 
        _Game_Actor_setup.call(this, actorId); 
        this._pdEquips = {}; 
    };

    // V10.6 エディタ連携: 新規ゲーム開始時に初期装備を反映する
    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _DataManager_setupNewGame.call(this);
        if (CMP.Data && CMP.Data.settings && CMP.Data.settings.defaultEquips) {
            const leader = $gameParty.leader();
            if (leader) {
                for (const slotId in CMP.Data.settings.defaultEquips) {
                    const equipId = CMP.Data.settings.defaultEquips[slotId];
                    if (equipId) {
                        leader._pdEquips[slotId] = equipId;
                        if (!$gameParty._pdInventory.includes(equipId)) {
                            $gameParty._pdInventory.push(equipId);
                        }
                    }
                }
            }
        }
    };

    CMP.formatEquipId = function(rawId) {
        let id = String(rawId).trim();
        return (id && !id.startsWith('cloth_')) ? 'cloth_' + id : id;
    };

    //=============================================================================
    // パフォーマンス最適化のためのダーティフラグ注入 (Dirty Flag Interceptors)
    //=============================================================================
    const _Game_Switches_setValue = Game_Switches.prototype.setValue;
    Game_Switches.prototype.setValue = function(switchId, value) {
        if (this.value(switchId) !== value) {
            _Game_Switches_setValue.call(this, switchId, value);
            CMP.State.needsExpUpdate = true; // 状態が変化した時のみフラグを立てる
        } else {
            _Game_Switches_setValue.call(this, switchId, value);
        }
    };

    const _Game_Variables_setValue = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function(variableId, value) {
        if (this.value(variableId) !== value) {
            _Game_Variables_setValue.call(this, variableId, value);
            CMP.State.needsExpUpdate = true;
        } else {
            _Game_Variables_setValue.call(this, variableId, value);
        }
    };

    const _Game_BattlerBase_setHp = Game_BattlerBase.prototype.setHp;
    Game_BattlerBase.prototype.setHp = function(hp) {
        if (this._hp !== hp) {
            _Game_BattlerBase_setHp.call(this, hp);
            if (this.isActor() && this === $gameParty.leader()) {
                CMP.State.needsExpUpdate = true; // リーダーのHP変動時
            }
        } else {
            _Game_BattlerBase_setHp.call(this, hp);
        }
    };

    //=============================================================================
    // プラグインコマンド
    //=============================================================================
    PluginManager.registerCommand("CM_PaperDollSystem", "OpenEquipMenu", () => { 
        if (CMP.Data && CMP.VueAppInstance) CMP.VueAppInstance.openMenu();
    });

    PluginManager.registerCommand("CM_PaperDollSystem", "GainEquipment", args => {
        const equipId = CMP.formatEquipId(args.equipId);
        if (equipId && $gameParty && $gameParty._pdInventory) {
            if (!$gameParty._pdInventory.includes(equipId)) $gameParty._pdInventory.push(equipId);
        }
    });

    PluginManager.registerCommand("CM_PaperDollSystem", "LoseEquipment", args => {
        const equipId = CMP.formatEquipId(args.equipId);
        if (equipId && $gameParty && $gameParty._pdInventory) {
            $gameParty._pdInventory = $gameParty._pdInventory.filter(id => id !== equipId);
            const leader = $gameParty.leader();
            if (leader && leader._pdEquips) {
                let unequipped = false;
                for (let slotId in leader._pdEquips) {
                    if (leader._pdEquips[slotId] === equipId) {
                        delete leader._pdEquips[slotId];
                        unequipped = true;
                    }
                }
                if (unequipped) CMP.State.needsRefresh = true;
            }
        }
    });

    //=============================================================================
    // 表情・条件評価ロジック
    //=============================================================================
    CMP.evalCondition = function(cond) {
        if (!cond || cond.trim() === "") return true;
        if (window.CM_Core && typeof window.CM_Core.evalCondition === 'function') {
            return window.CM_Core.evalCondition(cond);
        }
        return false;
    };

    CMP.getCurrentExpression = function() {
        if (!CMP.Data || !CMP.Data.expressions || CMP.Data.expressions.length === 0) return "";
        let isDamaged = this._paperDoll && this._paperDoll._damageTimer > 0;
        if (isDamaged) {
            let dmgExp = CMP.Data.expressions.find(e => e.type === 'damage');
            if (dmgExp && dmgExp.image) return dmgExp.image;
        }
        let validExps = CMP.Data.expressions.filter(e => e.type === 'condition');
        for (let exp of validExps) {
            if (CMP.evalCondition(exp.condition)) return exp.image;
        }
        let defExp = CMP.Data.expressions.find(e => e.type === 'default');
        if (defExp && defExp.image) return defExp.image;
        return "";
    };

    //=============================================================================
    // PIXI.js レンダリングパイプライン (スプライトプーリング最適化)
    //=============================================================================
    const _Spriteset_Base_createAnimationSprite = Spriteset_Base.prototype.createAnimationSprite;
    Spriteset_Base.prototype.createAnimationSprite = function(targets, animation, mirror, delay) {
        _Spriteset_Base_createAnimationSprite.call(this, targets, animation, mirror, delay);
        const sprite = this._animationSprites[this._animationSprites.length - 1];
        if (sprite) {
            if (sprite.parent) sprite.parent.removeChild(sprite);
            let targetZIndex = 999;
            const match = animation.name.match(/\[z:(\d+)\]/i);
            if (match) targetZIndex = Number(match[1]);

            if (this._pictureContainer) {
                this._pictureContainer.addChild(sprite);
                this._pictureContainer.sortableChildren = true;
                sprite.zIndex = targetZIndex;
            } else if (this._baseSprite) {
                this._baseSprite.addChild(sprite);
                this._baseSprite.sortableChildren = true;
                sprite.zIndex = targetZIndex;
            }
        }
    };

    Spriteset_Base.prototype.createPaperDoll = function() {
        if (!CMP.Data) return;
        this._paperDoll = new PIXI.Container();
        this._paperDoll.sortableChildren = true; 
        
        // スプライトプールの初期化 (Initialize sprite pool to reduce GC)
        this._pdLayerSprites = {};
        
        this._paperDoll.setBlendColor = function(color) { 
            for (const child of this.children) { 
                if (child && typeof child.setBlendColor === 'function') child.setBlendColor(color); 
            } 
        };
        this._paperDoll.getBlendColor = function() { return [0, 0, 0, 0]; };
        
        this._paperDoll.x = CMP.Data.settings.portraitX || 0;
        this._paperDoll.y = CMP.Data.settings.portraitY || 0;

        this._paperDollAnimTarget = new Sprite();
        const animX = CMP.Data.settings.animX !== undefined ? CMP.Data.settings.animX : 640;
        const animY = CMP.Data.settings.animY !== undefined ? CMP.Data.settings.animY : 360;
        this._paperDollAnimTarget.x = animX - this._paperDoll.x;
        this._paperDollAnimTarget.y = animY - this._paperDoll.y;
        this._paperDollAnimTarget.anchor.x = 0.5;
        this._paperDollAnimTarget.anchor.y = 0.5;
        this._paperDollAnimTarget.zIndex = 9999;
        this._paperDoll.addChild(this._paperDollAnimTarget);
        
        let targetLayer = this._battleField ? this._battleField : this._baseSprite; 
        if (targetLayer) {
            targetLayer.sortableChildren = true;
            targetLayer.addChild(this._paperDoll);
        }
        
        CMP.State.needsRefresh = true;
        CMP.State.needsExpUpdate = true;
    };

    Spriteset_Base.prototype.refreshPaperDoll = function() {
        if (!this._paperDoll || !CMP.Data) return;
        
        const globalZ = CMP.Data.settings.baseBodyZIndex !== undefined ? Number(CMP.Data.settings.baseBodyZIndex) : 20;
        this._paperDoll.zIndex = globalZ;

        // 使用されるレイヤーキーを記録 (Track used layer keys)
        const usedKeys = new Set();

        const getSprite = (key, zIndex) => {
            usedKeys.add(key);
            if (!this._pdLayerSprites[key]) {
                const s = new Sprite();
                this._paperDoll.addChild(s);
                this._pdLayerSprites[key] = s;
            }
            this._pdLayerSprites[key].zIndex = zIndex;
            this._pdLayerSprites[key].visible = true;
            return this._pdLayerSprites[key];
        };

        // 1. 素体レイヤー (Base Body)
        if (CMP.Data.settings.baseBodyImage) {
            const spr = getSprite('baseBody', 0);
            spr.bitmap = ImageManager.loadBitmap('img/Equipment/', CMP.Data.settings.baseBodyImage);
        }

        // 2. 装備レイヤー (Equipments)
        const leader = $gameParty.leader();
        if (leader && leader._pdEquips) {
            for (let slotId in leader._pdEquips) {
                const itemId = leader._pdEquips[slotId];
                const itemDef = CMP.Data.items.find(i => i.id === itemId);
                const slotDef = CMP.Data.slots.find(s => s.id === slotId);
                if (itemDef && itemDef.image) {
                    const z = (slotDef && slotDef.zIndex !== undefined) ? Number(slotDef.zIndex) : 10;
                    const spr = getSprite(`slot_${slotId}`, z);
                    spr.bitmap = ImageManager.loadBitmap('img/Equipment/', itemDef.image);
                }
            }
        }

        // 3. 表情レイヤー (Expression)
        if (CMP.State.currentExpressionImage) {
            const z = CMP.Data.settings.expressionZIndex !== undefined ? Number(CMP.Data.settings.expressionZIndex) : 999;
            const spr = getSprite('expression', z);
            spr.bitmap = ImageManager.loadBitmap('img/Equipment/', CMP.State.currentExpressionImage);
        }

        // 未使用のスプライトを非表示にする (Hide unused sprites)
        for (let key in this._pdLayerSprites) {
            if (!usedKeys.has(key)) {
                this._pdLayerSprites[key].visible = false;
            }
        }
    };

    const _Spriteset_Battle_createActors = Spriteset_Battle.prototype.createActors; 
    Spriteset_Battle.prototype.createActors = function() { _Spriteset_Battle_createActors.call(this); this.createPaperDoll(); };
    const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer; 
    Spriteset_Map.prototype.createLowerLayer = function() { _Spriteset_Map_createLowerLayer.call(this); this.createPaperDoll(); };

    const _Spriteset_Battle_findTargetSprite = Spriteset_Battle.prototype.findTargetSprite;
    Spriteset_Battle.prototype.findTargetSprite = function(target) {
        if (target === $gameParty.leader() && this._paperDollAnimTarget) return this._paperDollAnimTarget;
        return _Spriteset_Battle_findTargetSprite ? _Spriteset_Battle_findTargetSprite.call(this, target) : null;
    };

    const _Spriteset_Map_findTargetSprite = Spriteset_Map.prototype.findTargetSprite;
    Spriteset_Map.prototype.findTargetSprite = function(target) {
        if (target === $gamePlayer && this._paperDollAnimTarget) return this._paperDollAnimTarget;
        return _Spriteset_Map_findTargetSprite ? _Spriteset_Map_findTargetSprite.call(this, target) : null;
    };

    Game_Actor.prototype.performDamage = function() { 
        SoundManager.playActorDamage(); 
        if (SceneManager._scene && SceneManager._scene._spriteset && SceneManager._scene._spriteset._paperDoll) { 
            SceneManager._scene._spriteset._paperDoll._damageTimer = 24; 
        } 
    };

    const _Spriteset_Base_update = Spriteset_Base.prototype.update;
    Spriteset_Base.prototype.update = function() {
        _Spriteset_Base_update.call(this);
        
        if (this._paperDoll && CMP.Data) {
            
            // 視覚シールドのバイパス制御
            const dlgState = window.CM_Dialogue ? window.CM_Dialogue.State : null;
            const isEasyMode = dlgState ? dlgState.isEasyMode : false;
            const hideForDialogue = dlgState ? ((dlgState.isActive || dlgState.isLoadingAsync) && !isEasyMode) : false;
            const isPlayerTransparent = $gamePlayer ? $gamePlayer.isTransparent() : false;
            this._paperDoll.visible = !hideForDialogue && !isPlayerTransparent;

            const leader = $gameParty.leader();
            if (leader) {
                // ダメージ状態の変化を検知して表情のダーティフラグを操作する
                const isDamaged = this._paperDoll._damageTimer > 0;
                if (this._paperDoll._wasDamaged !== isDamaged) {
                    CMP.State.needsExpUpdate = true;
                    this._paperDoll._wasDamaged = isDamaged;
                }

                // 必要な時のみ表情条件の再評価を行う (Avoid per-frame eval)
                if (CMP.State.needsExpUpdate) {
                    let targetExp = CMP.getCurrentExpression.call(this);
                    if (CMP.State.currentExpressionImage !== targetExp) {
                        CMP.State.currentExpressionImage = targetExp;
                        CMP.State.needsRefresh = true; 
                    }
                    CMP.State.needsExpUpdate = false;
                }
            }

            if (CMP.State.needsRefresh) { 
                this.refreshPaperDoll(); 
                CMP.State.needsRefresh = false; 
            }

            // ダメージシェイクエフェクト
            if (this._paperDoll._damageTimer > 0) {
                this._paperDoll._damageTimer--; 
                const t = this._paperDoll._damageTimer;
                this._paperDoll.x = (CMP.Data.settings.portraitX || 0) + (t > 0 ? (t % 8 < 4 ? 15 : -15) : 0);
                if (this._paperDoll.setBlendColor) this._paperDoll.setBlendColor(t > 12 ? [255, 0, 0, 180] : [0, 0, 0, 0]);
            }
        }
    };

    const _Game_Player_canMove = Game_Player.prototype.canMove; 
    Game_Player.prototype.canMove = function() { 
        if (CMP.VueAppInstance && CMP.VueAppInstance.isMenuOpen) return false;
        return _Game_Player_canMove.call(this); 
    };

    //=============================================================================
    // Vue3 + GSAP 統合 UI
    //=============================================================================
    CMP.initVueApp = function() {
        if (document.getElementById('cm-paperdoll-vue-root')) return;

        const style = document.createElement('style');
        style.innerHTML = UI_CSS;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'cm-paperdoll-vue-root';
        root.innerHTML = UI_HTML;
        document.body.appendChild(root);

        const { createApp, reactive, computed, watch, nextTick } = window.Vue || Vue;

        const app = createApp({
            setup() {
                const Core = window.CM_Core;
                
                const t = (path, fallback) => {
                    if (!path) return "";
                    if (Core && Core.I18n && Core.I18n.reactiveState) {
                        const _trigger = Core.I18n.reactiveState.lang; 
                    }
                    const res = Core ? Core.I18n.translate(path) : path;
                    if (res === path) {
                        if (fallback !== undefined) return fallback;
                        if (path.includes('.')) return path.split('.').pop();
                    }
                    return res;
                };

                const state = reactive({
                    isMenuOpen: false, currentSlotId: null, inventoryIds: [], equippedIds: {}
                });

                const sortedSlots = computed(() => {
                    if (!CMP.Data || !CMP.Data.slots) return [];
                    return [...CMP.Data.slots].sort((a, b) => a.order - b.order);
                });

                const currentEquippedItem = computed(() => {
                    if (!state.currentSlotId) return null;
                    const eId = state.equippedIds[state.currentSlotId];
                    return CMP.Data.items.find(i => i.id === eId) || null;
                });

                const canUnequipCurrent = computed(() => {
                    if (!currentEquippedItem.value) return false;
                    const cond = currentEquippedItem.value.lockedCondition;
                    if (cond) {
                        if (Core && typeof Core.evalCondition === 'function') return Core.evalCondition(cond);
                        return false;
                    }
                    return true;
                });

                const availableItems = computed(() => {
                    if (!state.currentSlotId || !CMP.Data) return [];
                    const currentEId = state.equippedIds[state.currentSlotId];
                    return CMP.Data.items.filter(i => 
                        i.slotId === state.currentSlotId && 
                        state.inventoryIds.includes(i.id) && 
                        i.id !== currentEId
                    );
                });

                const getEquipNameForSlot = (slotId) => {
                    const eId = state.equippedIds[slotId];
                    if (!eId) return 'wardrobe.noWear';
                    const item = CMP.Data.items.find(i => i.id === eId);
                    return item ? item.name : 'wardrobe.noWear';
                };

                const openMenu = () => {
                    if (!CMP.Data) return;
                    const leader = $gameParty.leader();
                    state.inventoryIds = [...$gameParty._pdInventory];
                    state.equippedIds = leader ? { ...leader._pdEquips } : {};
                    if (sortedSlots.value.length > 0) state.currentSlotId = sortedSlots.value[0].id;
                    state.isMenuOpen = true;

                    nextTick(() => {
                        gsap.fromTo(".pd-panel", { x: -50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: "power3.out" });
                        gsap.fromTo(".pd-overlay", { opacity: 0 }, { opacity: 1, duration: 0.4 });
                    });
                };

                const closeMenu = () => {
                    gsap.to(".pd-panel", { x: -30, opacity: 0, duration: 0.3, ease: "power2.in" });
                    gsap.to(".pd-overlay", { opacity: 0, duration: 0.3, onComplete: () => { state.isMenuOpen = false; } });
                    SoundManager.playCancel();
                };

                const selectSlot = (slotId) => {
                    if (state.currentSlotId !== slotId) { state.currentSlotId = slotId; SoundManager.playCursor(); }
                };

                const flushEquipsToGame = () => {
                    const leader = $gameParty.leader();
                    if (leader) {
                        leader._pdEquips = { ...state.equippedIds };
                        CMP.State.needsRefresh = true;
                    }
                };

                const equipItem = (itemId) => { state.equippedIds[state.currentSlotId] = itemId; SoundManager.playEquip(); flushEquipsToGame(); };
                const unequipCurrent = () => { delete state.equippedIds[state.currentSlotId]; SoundManager.playEquip(); flushEquipsToGame(); };

                const onItemEnter = (el, done) => {
                    const idx = parseInt(el.dataset.index) || 0;
                    gsap.fromTo(el, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, delay: idx * 0.05, ease: "power3.out", onComplete: done });
                };
                const onItemLeave = (el, done) => { gsap.to(el, { opacity: 0, scale: 0.95, duration: 0.2, ease: "power2.in", onComplete: done }); };

                return {
                    t, isMenuOpen: computed(() => state.isMenuOpen), currentSlotId: computed(() => state.currentSlotId),
                    sortedSlots, currentEquippedItem, canUnequipCurrent, availableItems, getEquipNameForSlot,
                    openMenu, closeMenu, selectSlot, equipItem, unequipCurrent, onItemEnter, onItemLeave
                };
            }
        });

        CMP.VueAppInstance = app.mount(root);
    };

})();