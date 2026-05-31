/*:
 * @target MZ
 * @plugindesc [v11.1.1] ハイブリッドAVGダイアログ - 拡張演出モジュール (入場座標の最適化版)
 * @author Coding Assistant (Architecture Architect)
 * @base CM_DialogueSystem_Core
 * @orderAfter CM_DialogueSystem_Core
 *
 * @param NpcZIndex
 * @text NPC立絵ベース Z-Index
 * @desc 画面に表示されるNPC立絵の基本深度層（デフォルト: 15）。話しているキャラは自動的に+1されます。
 * @type number
 * @min 0
 * @max 9999
 * @default 15
 *
 * @help
 * ============================================================================
 * アーキテクチャ設計 (拡張演出モジュール):
 * 本プラグインは CM_DialogueSystem_Core から分離された PIXI.js 依存の
 * 視覚・聴覚エフェクト、および【NPC立絵の物理レンダリング】を統合管理します。
 *
 * 【v11.1.1 アーキテクチャ更新: 入場座標のスマート化】
 * 1. 新規NPC登場時、画面端(x=0)から飛んでくる視覚バグを修正。
 * 2. 新規キャラは自身の最終ターゲット座標で直接フェードイン＆着地し、
 * 既存キャラのみが横へスライドして場所を譲るという、自然な群像劇演出を実装。
 * ============================================================================
 */

(() => {
    "use strict";

    if (!window.CM_Dialogue || !window.CM_Dialogue.CommandDispatcher) {
        console.warn("[CM_Effects] 致命的エラー: CM_DialogueSystem_Core が読み込まれていません。");
        return;
    }

    const CM = window.CM_Dialogue;
    const CMEffects = {};

    CMEffects.Param = {
        npcZIndex: Number(PluginManager.parameters("CM_DialogueSystem_Effects")['NpcZIndex'] || 15)
    };

    CMEffects.State = {
        customPicsData: {}
    };

    CMEffects.customPics = {};
    CMEffects.dummySprites = [];
    
    // アクティブなNPCのキュー (最大3人)
    CMEffects.activePortraits = [];

    window.__DEBUG_CMEFFECTS = CMEffects;

    CMEffects.getBaseSprite = function() {
        if (SceneManager._scene && SceneManager._scene._spriteset) {
            return SceneManager._scene._spriteset._baseSprite;
        }
        return null;
    };

    CMEffects.createNativeLayers = function() {
        const baseSprite = CMEffects.getBaseSprite();
        if (baseSprite) baseSprite.sortableChildren = true;
    };

    // 🌟 ターゲット座標の計算ロジックを分離
    CMEffects.getTargetPositions = function(count) {
        const w = Graphics.width;
        if (count === 1) return [w * 0.5];
        if (count === 2) return [w * 0.25, w * 0.75]; 
        if (count === 3) return [w * 0.15, w * 0.5, w * 0.85]; 
        return [];
    };

    // 人数に応じた動的スライド再配置
    CMEffects.rearrangePortraits = function() {
        const positions = CMEffects.getTargetPositions(CMEffects.activePortraits.length);
        
        CMEffects.activePortraits.forEach((item, index) => {
            const targetX = positions[index];
            if (item.sprite.x !== targetX) {
                // 既存キャラのみが新しい座標へ滑らかに移動する
                gsap.to(item.sprite, { x: targetX, duration: 0.5, ease: "power2.out" });
            }
        });
    };

    //=============================================================================
    // 1. コマンド登録
    //=============================================================================

    const playAudio = (type, args) => { if(args.match(/none|clear/i)) AudioManager['stop'+type](); else AudioManager['play'+type]({ name: args, volume: 90, pitch: 100, pan: 0 }); };
    CM.CommandDispatcher.register('bgm', args => playAudio('Bgm', args)); 
    CM.CommandDispatcher.register('se', args => playAudio('Se', args)); 
    CM.CommandDispatcher.register('bgs', args => playAudio('Bgs', args)); 
    CM.CommandDispatcher.register('me', args => playAudio('Me', args)); 

    CM.CommandDispatcher.register('tint', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length < 5) return;
        $gameScreen.startTint([parseInt(p[0]), parseInt(p[1]), parseInt(p[2]), parseInt(p[3])], parseInt(p[4]));
        if (p[5] && p[5].toLowerCase() === 'true') CM.State.waitFrames = Math.max(CM.State.waitFrames, parseInt(p[4]));
    });

    CM.CommandDispatcher.register('flash', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length < 5) return;
        $gameScreen.startFlash([parseInt(p[0]), parseInt(p[1]), parseInt(p[2]), parseInt(p[3])], parseInt(p[4]));
        if (p[5] && p[5].toLowerCase() === 'true') CM.State.waitFrames = Math.max(CM.State.waitFrames, parseInt(p[4]));
    });

    CM.CommandDispatcher.register('weather', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length < 3) return;
        $gameScreen.changeWeather(p[0].toLowerCase(), parseInt(p[1]), parseInt(p[2]));
        if (p[3] && p[3].toLowerCase() === 'true') CM.State.waitFrames = Math.max(CM.State.waitFrames, parseInt(p[2]));
    });

    CM.CommandDispatcher.register('shake', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean);
        const power = p[0] ? parseInt(p[0]) : 5;
        const speed = p[1] ? parseInt(p[1]) : 5;
        const duration = p[2] ? parseInt(p[2]) : 60;
        const isWait = p[3] && p[3].toLowerCase() === 'true';
        $gameScreen.startShake(power, speed, duration);
        if (isWait) CM.State.waitFrames = Math.max(CM.State.waitFrames, duration);
    });

    CM.CommandDispatcher.register('leave', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean);
        
        if (p.length > 0) {
            const targetId = parseInt(p[0]);
            const index = CMEffects.activePortraits.findIndex(item => item.id === targetId);
            if (index !== -1) {
                const removed = CMEffects.activePortraits.splice(index, 1)[0];
                gsap.to(removed.sprite, { 
                    opacity: 0, y: Graphics.height + 30, duration: 0.5, 
                    onComplete: () => { 
                        removed.sprite.bitmap = null; 
                        if (removed.sprite.parent) removed.sprite.parent.removeChild(removed.sprite);
                    } 
                });
                CMEffects.rearrangePortraits(); 
            }
        } else {
            CMEffects.activePortraits.forEach(item => {
                gsap.to(item.sprite, { 
                    opacity: 0, y: Graphics.height + 30, duration: 0.5, 
                    onComplete: () => { 
                        item.sprite.bitmap = null; 
                        if (item.sprite.parent) item.sprite.parent.removeChild(item.sprite);
                    } 
                });
            });
            CMEffects.activePortraits = [];
        }
    });

    CM.CommandDispatcher.register('pic', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length < 3) return;
        const pId = parseInt(p[0]), action = p[1].toLowerCase(), pName = p[2];
        const px = parseInt(p[3]||0), py = parseInt(p[4]||0), duration = parseInt(p[5]||0);
        const wait = (p[6]&&p[6].toLowerCase()==='true');
        const isPersistent = (p[7] && p[7].toLowerCase() === 'persistent');
        
        const baseSprite = CMEffects.getBaseSprite();
        if (!baseSprite) return;

        if (action === 'show') {
            CMEffects.State.customPicsData[pId] = { name: pName, x: px, y: py, isPersistent: isPersistent };
            let img = CMEffects.customPics[pId]; 
            if (!img) { 
                img = CM.SpritePool.get(); CMEffects.customPics[pId] = img; img.zIndex = pId; baseSprite.addChild(img); 
            }
            img._isPersistent = isPersistent; img.visible = true; img.bitmap = ImageManager.loadPicture(pName); 
            img.x = px; img.y = py;
            if (duration > 0) { img.opacity = 0; gsap.to(img, { opacity: 255, duration: duration / 60 }); } else { img.opacity = 255; }
            if (wait) CM.State.waitFrames = Math.max(CM.State.waitFrames, duration);
            
        } else if (action === 'hide') {
            delete CMEffects.State.customPicsData[pId];
            if (CMEffects.customPics[pId]) {
                const img = CMEffects.customPics[pId];
                if (duration > 0) {
                    gsap.to(img, { opacity: 0, duration: duration / 60, onComplete: () => { 
                        img.visible = false; img._isPersistent = false; CM.SpritePool.release(img); delete CMEffects.customPics[pId]; 
                    }});
                } else { 
                    img.visible = false; img._isPersistent = false; CM.SpritePool.release(img); delete CMEffects.customPics[pId]; 
                }
                if (wait) CM.State.waitFrames = Math.max(CM.State.waitFrames, duration);
            } 
        }
    });

    CM.CommandDispatcher.register('anim', args => {
        const baseSprite = CMEffects.getBaseSprite(); if (!baseSprite) return;
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length < 1) return;
        
        const animId = parseInt(p[0]);
        let anchorX = Graphics.width / 2; let anchorY = Graphics.height / 2;
        let side = 'left'; let argX = null; let argY = null; let argWait = null;

        if (p.length >= 2) {
            const p1Str = String(p[1]).toLowerCase();
            if (p1Str === 'left' || p1Str === 'right' || p1Str === 'enemy' || p1Str === 'self') { side = p1Str; argX = p[2]; argY = p[3]; argWait = p[4]; } 
            else { argX = p[1]; argY = p[2]; argWait = p[3]; }
        }

        const ax = argX ? parseInt(argX) : anchorX;
        const ay = argY ? parseInt(argY) : anchorY;
        const wait = (argWait && String(argWait).toLowerCase() === 'true');
        
        if (wait) CM.State.waitForAnim = true; 
        
        const dummyTarget = CM.SpritePool.get(); dummyTarget.x = ax; dummyTarget.y = ay; dummyTarget.zIndex = 9999; 
        baseSprite.addChild(dummyTarget);
        
        const animSprite = new Sprite_Animation();
        animSprite.setup([dummyTarget], $dataAnimations[animId], false, 0, null);
        animSprite.zIndex = 9999;
        baseSprite.addChild(animSprite);
        CMEffects.dummySprites.push({ sprite: dummyTarget, animSprite: animSprite });
    });

    CM.CommandDispatcher.register('animdoll', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length < 1) return;
        if ($gameTemp && $gamePlayer) $gameTemp.requestAnimation([$gamePlayer], parseInt(p[0]));
    });

    CM.CommandDispatcher.register('picanim', args => {
        const p = args.split(/[,，\s]+/).filter(Boolean); if (p.length < 2) return;
        const action = p[0].toLowerCase(), pId = parseInt(p[1]), type = p[2] ? p[2].toLowerCase() : 'normal';
        const img = CMEffects.customPics[pId]; if (!img) return; 
        const baseData = CMEffects.State.customPicsData[pId]; const originalX = baseData ? baseData.x : img.x;

        if (action === 'shake') {
            let intensity = 10, repeats = 5; 
            if (type === 'heavy') { intensity = 20; repeats = 9; } else if (type === 'light') { intensity = 5; repeats = 3; }
            gsap.killTweensOf(img, "x"); img.x = originalX;
            gsap.fromTo(img, { x: originalX - intensity }, { x: originalX + intensity, duration: 0.05, yoyo: true, repeat: repeats, ease: "sine.inOut", onComplete: () => { img.x = originalX; }});
        } else if (action === 'stop') {
            gsap.killTweensOf(img, "x"); img.x = originalX;
        }
    });

    //=============================================================================
    // 2. モジュール間フック受容
    //=============================================================================

    if (CM.PortraitRenderHooks) {
        CM.PortraitRenderHooks.push((node, char) => {
            if (!CM.State.isActive) return;
            CMEffects.createNativeLayers();

            const baseSprite = CMEffects.getBaseSprite();
            if (!baseSprite) return;

            if (!char || char.isProtagonist) {
                CMEffects.activePortraits.forEach(p => p.sprite.zIndex = CMEffects.Param.npcZIndex);
                return; 
            }
            
            if (CM.UI.isCinematic) {
                CMEffects.activePortraits.forEach(item => {
                    gsap.to(item.sprite, { opacity: 0, duration: 0.3, onComplete: () => { 
                        item.sprite.bitmap = null; 
                        if (item.sprite.parent) item.sprite.parent.removeChild(item.sprite);
                    }});
                });
                CMEffects.activePortraits = [];
                return;
            }

            CMEffects.activePortraits.forEach(p => p.sprite.zIndex = CMEffects.Param.npcZIndex);

            let existing = CMEffects.activePortraits.find(p => p.id === char.id);
            const groundY = Graphics.height;

            if (existing) {
                existing.sprite.zIndex = CMEffects.Param.npcZIndex + 1; 
                let spr = existing.sprite;
                
                gsap.killTweensOf(spr, "y");
                spr.y = groundY; 
                gsap.to(spr, { 
                    y: groundY - 25, 
                    duration: 0.15, 
                    yoyo: true, 
                    repeat: 1, 
                    ease: "sine.inOut" 
                });

            } else {
                if (CMEffects.activePortraits.length >= 3) {
                    let oldest = CMEffects.activePortraits.shift(); 
                    let spr = oldest.sprite;
                    gsap.to(spr, { 
                        opacity: 0, y: groundY + 30, duration: 0.4, 
                        onComplete: () => {
                            spr.bitmap = null;
                            if (spr.parent) spr.parent.removeChild(spr);
                        }
                    });
                }

                let newSpr = new Sprite();
                newSpr.anchor.set(0.5, 1);
                newSpr.zIndex = CMEffects.Param.npcZIndex + 1; 
                
                baseSprite.addChild(newSpr);

                let imgName = (char.portrait && char.portrait.useOverride && char.portrait.overrideName) 
                    ? char.portrait.overrideName 
                    : `npc_${char.id}`;
                    
                newSpr.bitmap = node.customPortrait ? ImageManager.loadPicture(node.customPortrait) : ImageManager.loadBitmap('img/npc/', imgName);
                
                // 🌟 先に配列へ追加し、自分が何番目になるかを確定させる[cite: 9]
                CMEffects.activePortraits.push({ id: char.id, sprite: newSpr });

                // 🌟 新規キャラは「最初から自分のターゲット座標」に出現させる
                const positions = CMEffects.getTargetPositions(CMEffects.activePortraits.length);
                const targetX = positions[CMEffects.activePortraits.length - 1];

                newSpr.x = targetX;
                newSpr.y = groundY + 30;
                newSpr.opacity = 0;

                // 既存キャラだけがスライド移動する
                CMEffects.rearrangePortraits();
                
                // 新規キャラは真下からフェードイン＆着地
                gsap.to(newSpr, { opacity: 255, duration: 0.4 });
                gsap.to(newSpr, { 
                    y: groundY - 15, 
                    duration: 0.2, 
                    yoyo: true, 
                    repeat: 1, 
                    ease: "power2.out", 
                    onComplete: () => { newSpr.y = groundY; } 
                });
            }
        });
    }

    const _Scene_Base_update_effects = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _Scene_Base_update_effects.call(this);

        let isAnimPlaying = false;
        for (let i = CMEffects.dummySprites.length - 1; i >= 0; i--) {
            let d = CMEffects.dummySprites[i];
            if (d.animSprite && d.animSprite.isPlaying()) {
                isAnimPlaying = true;
            } else { 
                CM.SpritePool.release(d.sprite); 
                if (d.animSprite) { 
                    if (d.animSprite.parent) d.animSprite.parent.removeChild(d.animSprite); 
                    if (d.animSprite.destroy) d.animSprite.destroy({ children: true }); 
                } 
                CMEffects.dummySprites.splice(i, 1); 
            }
        }
        
        if (CM.State && CM.State.waitForAnim && !isAnimPlaying) {
            CM.State.waitForAnim = false;
        }
    };

    if (CM.TransHooks) {
        CM.TransHooks.push(() => {
            CMEffects.activePortraits.forEach(item => {
                gsap.to(item.sprite, { opacity: 0, duration: 0.2, onComplete: () => { item.sprite.bitmap = null; }});
            });
            CMEffects.activePortraits = [];
        });
    }

    if (CM.ExitAnimationHooks) {
        CM.ExitAnimationHooks.push(() => {
            return new Promise(resolve => {
                let promises = [];

                const picKeys = Object.keys(CMEffects.customPics);
                if (picKeys.length > 0) {
                    let p1 = new Promise(res => {
                        let completedCount = 0;
                        picKeys.forEach(pId => {
                            const img = CMEffects.customPics[pId];
                            if (img && !img._isPersistent) {
                                const baseData = CMEffects.State.customPicsData[pId];
                                const targetY = (baseData ? baseData.y : img.y) + 30; 
                                gsap.to(img, {
                                    opacity: 0, y: targetY, duration: 0.4, ease: "power2.inOut",
                                    onComplete: () => { img.visible = false; completedCount++; if (completedCount === picKeys.length) res(); }
                                });
                            } else {
                                completedCount++; if (completedCount === picKeys.length) res();
                            }
                        });
                    });
                    promises.push(p1);
                }

                if (CMEffects.activePortraits.length > 0) {
                    let p2 = new Promise(res => {
                        let count = 0;
                        CMEffects.activePortraits.forEach(item => {
                            gsap.to(item.sprite, { 
                                opacity: 0, y: Graphics.height + 30, duration: 0.4, ease: "power2.inOut",
                                onComplete: () => {
                                    count++;
                                    if (count === CMEffects.activePortraits.length) res();
                                }
                            });
                        });
                    });
                    promises.push(p2);
                }

                Promise.all(promises).then(resolve);
            });
        });
    }

    if (CM.TransRecoveryHooks) {
        CM.TransRecoveryHooks.push(() => {
            const baseSprite = CMEffects.getBaseSprite();
            if (!baseSprite) return;

            for (let pId in CMEffects.State.customPicsData) {
                const data = CMEffects.State.customPicsData[pId];
                let img = CMEffects.customPics[pId];
                if (!img) {
                    img = CM.SpritePool.get();
                    CMEffects.customPics[pId] = img;
                }
                img.zIndex = parseInt(pId);
                img._isPersistent = data.isPersistent; 
                if (img.parent !== baseSprite) baseSprite.addChild(img);
                img.bitmap = ImageManager.loadPicture(data.name);
                img.x = data.x; img.y = data.y;
                img.opacity = 255; img.visible = true;
            }
        });
    }

    if (CM.CleanupHooks) {
        CM.CleanupHooks.push(() => {
            CMEffects.dummySprites.forEach(d => { 
                CM.SpritePool.release(d.sprite); 
                if (d.animSprite) { 
                    if (d.animSprite.parent) d.animSprite.parent.removeChild(d.animSprite); 
                    if (d.animSprite.destroy) d.animSprite.destroy({ children: true }); 
                } 
            });
            CMEffects.dummySprites = [];

            const nextCustomPics = {};
            const nextCustomPicsData = {};

            for (let pId in CMEffects.customPics) {
                const img = CMEffects.customPics[pId];
                if (img) {
                    if (img._isPersistent) {
                        nextCustomPics[pId] = img;
                        nextCustomPicsData[pId] = CMEffects.State.customPicsData[pId];
                        continue; 
                    }
                    gsap.killTweensOf(img);
                    img.visible = false; 
                    CM.SpritePool.release(img);
                }
            }
            
            CMEffects.customPics = nextCustomPics;
            CMEffects.State.customPicsData = nextCustomPicsData;

            CMEffects.activePortraits.forEach(item => {
                gsap.killTweensOf(item.sprite);
                item.sprite.bitmap = null;
                if (item.sprite.parent) item.sprite.parent.removeChild(item.sprite);
            });
            CMEffects.activePortraits = [];
        });
    }

    CM.clearPersistentEffects = function() {
        for (let pId in CMEffects.customPics) {
            const img = CMEffects.customPics[pId];
            if (img && img._isPersistent) {
                gsap.killTweensOf(img);
                img.visible = false;
                img._isPersistent = false;
                CM.SpritePool.release(img);
            }
        }
        CMEffects.customPics = {};
        CMEffects.State.customPicsData = {};
    };

})();