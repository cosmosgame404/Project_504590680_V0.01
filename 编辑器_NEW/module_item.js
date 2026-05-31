/**
 * 🌌 全能编辑器 V12.2 - 物品字典与大统一动作模型工作台 (module_item.js)
 * 架构更新：
 * 1. 深度联动状态管线，新增 grantedStates 字段，支持按概率为目标附加 Buff/Debuff。
 * 2. 深度联动剧本引擎，新增 dialogueScene 与 dialogueNodeId，支持使用物品时直接拉起演出节点。
 * 包含：跨目录图片管线 (File System Access API 转 Blob)。
 */

import { state, services } from './editor_main.js';

const { computed, reactive, ref } = window.Vue;

const FALLBACK_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5OTkiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiI+PC9yZWN0PjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ij48L2NpcmNsZT48cG9seWxpbmUgcG9pbnRzPSIyMSAxNSAxNiAxMCA1IDIxIj48L3BvbHlsaW5lPjwvc3ZnPg==';

const template = `
    <div class="flex-row" style="width: 100%; height: 100%; gap: 15px; padding: 15px; box-sizing: border-box;">
        
        <div class="card flex-column" style="width: 380px; flex-shrink: 0; overflow: hidden; background: var(--panel-bg);">
            <div class="p-15 flex-column" style="border-bottom: 1px solid var(--border); background: var(--panel-bg-light); gap: 10px;">
                <div class="flex-row justify-between align-center">
                    <span style="font-weight: bold; font-size: 16px;">🎒 物品字典 (Item DB)</span>
                    <button class="btn btn-secondary" @click="addItem">➕ 新建物品</button>
                </div>
                <div class="flex-row" style="gap: 10px;">
                    <input v-model="searchQuery" class="input flex-1" placeholder="🔍 搜索 ID 或 名称..." />
                    <button class="btn btn-ghost" 
                            :class="selectedItemId === '__settings__' ? 'btn-primary' : ''"
                            style="padding: 0 10px;" 
                            @click="selectedItemId = '__settings__'" title="分类与标签管理">
                        ⚙️ 设置
                    </button>
                </div>
            </div>

            <div class="flex-1 cm-custom-scroll" style="overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                
                <div v-for="cat in itemDb.settings.categories" :key="'group_'+cat.id" class="flex-column" style="gap: 5px;">
                    <div class="card p-10 flex-row justify-between align-center" 
                         style="background: var(--panel-bg-light); cursor: pointer; border-left: 3px solid var(--primary);"
                         @click="toggleGroup(cat.id)">
                        <span style="font-weight: bold; font-size: 14px;">📁 {{ cat.name }} <span class="text-muted">({{ groupedItems[cat.id]?.length || 0 }})</span></span>
                        <span class="text-muted">{{ expandedGroups[cat.id] ? '▼' : '◀' }}</span>
                    </div>
                    
                    <div v-show="expandedGroups[cat.id]" class="flex-column" style="gap: 5px; padding-left: 15px; border-left: 1px dashed var(--border); margin-left: 5px;">
                        <div v-for="item in groupedItems[cat.id]" :key="item.id" 
                             class="card p-10 flex-row align-center" 
                             style="cursor: pointer; transition: 0.2s;"
                             :style="selectedItemId === item.id ? 'background: rgba(255, 75, 139, 0.1); border-left: 3px solid var(--primary);' : 'background: rgba(0,0,0,0.2); border-left: 3px solid transparent;'"
                             @click="selectedItemId = item.id">
                            <img :src="getImageSrc(item.id)" style="width: 24px; height: 24px; margin-right: 10px; border-radius: 4px; object-fit: contain;" />
                            <div class="flex-column flex-1">
                                <span style="font-weight: bold; font-size: 13px; color: var(--text-main);">{{ item.name || '未命名' }}</span>
                                <span class="text-muted" style="font-size: 10px;">{{ item.id }}</span>
                            </div>
                        </div>
                        <div v-if="!groupedItems[cat.id] || groupedItems[cat.id].length === 0" class="text-muted" style="font-size: 12px; padding: 5px;">空分类</div>
                    </div>
                </div>

                <div v-if="groupedItems['unassigned'] && groupedItems['unassigned'].length > 0" class="flex-column" style="gap: 5px; margin-top: 5px;">
                    <div class="card p-10 flex-row justify-between align-center" 
                         style="background: rgba(255, 152, 0, 0.1); cursor: pointer; border-left: 3px solid var(--warning);"
                         @click="toggleGroup('unassigned')">
                        <span style="font-weight: bold; color: var(--warning); font-size: 14px;">⚠️ 未分类物品 <span class="text-muted">({{ groupedItems['unassigned'].length }})</span></span>
                        <span class="text-muted">{{ expandedGroups['unassigned'] ? '▼' : '◀' }}</span>
                    </div>
                    <div v-show="expandedGroups['unassigned']" class="flex-column" style="gap: 5px; padding-left: 15px; border-left: 1px dashed var(--border); margin-left: 5px;">
                        <div v-for="item in groupedItems['unassigned']" :key="item.id" 
                             class="card p-10 flex-row align-center" 
                             style="cursor: pointer; background: rgba(0,0,0,0.2);"
                             :style="selectedItemId === item.id ? 'border-left: 3px solid var(--warning);' : 'border-left: 3px solid transparent;'"
                             @click="selectedItemId = item.id">
                             <img :src="getImageSrc(item.id)" style="width: 24px; height: 24px; margin-right: 10px; object-fit: contain;" />
                             <span style="font-size: 13px;">{{ item.name }}</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <div class="card flex-1 flex-column" style="background: var(--panel-bg); overflow: hidden; position: relative;">
            
            <div v-if="!selectedItemId" class="flex-column align-center justify-center text-muted" style="height: 100%;">
                <span style="font-size: 48px; margin-bottom: 20px;">📦</span>
                <h3>请从左侧选择物品，或进入设置</h3>
            </div>

            <div v-else-if="selectedItemId === '__settings__'" class="flex-column flex-1" style="overflow-y: auto;">
                <div class="p-15" style="border-bottom: 1px solid var(--border); background: var(--panel-bg-light); position: sticky; top: 0; z-index: 10;">
                    <span style="font-size: 18px; font-weight: bold; color: var(--primary);">⚙️ 字典结构设置 (Categories & Tags)</span>
                </div>
                
                <div class="p-20 flex-column" style="gap: 20px;">
                    <div class="card p-15" style="background: rgba(0,0,0,0.15); border: 1px solid var(--border);">
                        <div class="flex-row justify-between align-center m-b-15">
                            <h4 class="text-secondary">📁 物品大类管理 (Categories)</h4>
                            <button class="btn btn-secondary" style="font-size: 12px; padding: 4px 10px;" @click="addCategory">➕ 新增分类</button>
                        </div>
                        <p class="text-muted m-b-15" style="font-size: 12px;">大类用于仓库分页与过滤，一个物品只能属于一个大类。</p>
                        <div class="flex-column" style="gap: 10px;">
                            <div v-for="(cat, idx) in itemDb.settings.categories" :key="'cat'+idx" class="flex-row align-center" style="gap: 10px;">
                                <input v-model="cat.id" class="input flex-1" placeholder="分类ID (如 cat_weapon)" />
                                <input v-model="cat.name" class="input flex-1" placeholder="显示名称 (如 ⚔️ 武器)" />
                                <button class="btn btn-ghost text-danger" @click="removeCategory(idx)">🗑️</button>
                            </div>
                        </div>
                    </div>

                    <div class="card p-15" style="background: rgba(0,0,0,0.15); border: 1px solid var(--border);">
                        <div class="flex-row justify-between align-center m-b-15">
                            <h4 class="text-secondary">🏷️ 多重属性标签管理 (Tags)</h4>
                            <button class="btn btn-secondary" style="font-size: 12px; padding: 4px 10px;" @click="addTag">➕ 新增标签</button>
                        </div>
                        <p class="text-muted m-b-15" style="font-size: 12px;">标签用于描述物品的特性，一个物品可挂载多个标签。</p>
                        <div class="flex-column" style="gap: 10px;">
                            <div v-for="(tag, idx) in itemDb.settings.tags" :key="'tag'+idx" class="flex-row align-center" style="gap: 10px;">
                                <input v-model="tag.id" class="input flex-1" placeholder="标签ID (如 tag_fire)" />
                                <input v-model="tag.name" class="input flex-1" placeholder="显示名称 (如 🔥 炎属性)" />
                                <button class="btn btn-ghost text-danger" @click="removeTag(idx)">🗑️</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else-if="currentItem" class="flex-column flex-1" style="overflow-y: auto;">
                <div class="p-15 flex-row justify-between align-center" style="border-bottom: 1px solid var(--border); background: var(--panel-bg-light); position: sticky; top: 0; z-index: 10;">
                    <div class="flex-row align-center" style="gap: 10px;">
                        <span style="font-size: 18px; font-weight: bold; color: var(--primary);">编辑实体</span>
                        <span class="text-muted" style="font-size: 13px;">| UUID生成模板</span>
                    </div>
                    <button class="btn btn-ghost text-danger" @click="removeItem(currentItem.id)">🗑️ 删除该物品</button>
                </div>

                <div class="p-20 flex-column" style="gap: 20px;">
                    
                    <div class="card p-15" style="background: rgba(0,0,0,0.15); border: 1px solid var(--border);">
                        <div class="flex-row justify-between align-center m-b-15">
                            <h4 class="text-secondary">📌 基础识别与分类</h4>
                            <img :src="getImageSrc(currentItem.id)" style="width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 4px; background: rgba(0,0,0,0.3); object-fit: contain;" />
                        </div>
                        <div class="flex-row" style="gap: 15px; margin-bottom: 15px;">
                            <div class="flex-column flex-1" style="gap: 5px;">
                                <label class="text-muted" style="font-size: 12px;">系统 ID (决定图片名 img/item/{id}.png)</label>
                                <input v-model="currentItem.id" class="input" placeholder="例如: item_001" />
                            </div>
                            <div class="flex-column flex-1" style="gap: 5px;">
                                <label class="text-muted" style="font-size: 12px;">显示名称</label>
                                <input v-model="currentItem.name" class="input" placeholder="例如: 破旧的木剑" />
                            </div>
                        </div>
                        <div class="flex-row" style="gap: 15px; align-items: center;">
                            <div class="flex-column" style="gap: 5px; width: 33%;">
                                <label class="text-primary" style="font-size: 12px; font-weight: bold;">📁 所属大类 (Category)</label>
                                <select v-model="currentItem.categoryId" class="select" style="border-color: var(--primary);">
                                    <option value="">-- 未分类 --</option>
                                    <option v-for="cat in itemDb.settings.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
                                </select>
                            </div>
                            <div class="flex-column flex-1" style="gap: 5px;">
                                <label class="text-muted" style="font-size: 12px;">物品描述 (Tooltip)</label>
                                <input v-model="currentItem.description" class="input" placeholder="一句话物品说明..." />
                            </div>
                        </div>
                    </div>

                    <div class="card p-15" style="background: rgba(0,0,0,0.15); border: 1px solid var(--border);">
                        <h4 class="m-b-15 text-secondary">🏷️ 多重属性标签挂载 (Tags)</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                            <button v-for="tag in itemDb.settings.tags" :key="tag.id"
                                    class="btn" 
                                    :class="(currentItem.tags || []).includes(tag.id) ? 'btn-primary' : 'btn-ghost'"
                                    style="border: 1px solid var(--border); border-radius: 20px; padding: 4px 12px; font-size: 13px;"
                                    @click="toggleTag(currentItem, tag.id)">
                                {{ tag.name }}
                            </button>
                        </div>
                        <div v-if="!itemDb.settings.tags || itemDb.settings.tags.length === 0" class="text-muted" style="font-size: 12px;">
                            尚未定义任何标签，请前往“字典设置”中添加。
                        </div>
                    </div>

                    <div class="card p-15" style="background: rgba(0, 242, 254, 0.05); border: 1px solid rgba(0, 242, 254, 0.3);">
                        <h4 class="m-b-15" style="color: var(--secondary);">⚙️ 大统一动作属性 (战斗与交互引擎)</h4>
                        
                        <div class="flex-row align-center m-b-15" style="gap: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                            <input type="checkbox" v-model="currentItem.isUsable" id="isUsableCheck" style="transform: scale(1.2);" />
                            <label for="isUsableCheck" style="font-weight: bold; cursor: pointer;">允许被主动/被动使用（快捷栏或战斗调用）</label>
                        </div>

                        <div v-if="currentItem.isUsable" class="flex-column" style="gap: 15px;">
                            <div class="flex-row" style="gap: 15px; border-bottom: 1px dashed var(--border); padding-bottom: 15px;">
                                <div class="flex-column flex-1" style="gap: 5px;">
                                    <label class="text-primary" style="font-size: 12px; font-weight: bold;">最大耐久度 (0=无限/剧情道具)</label>
                                    <input type="number" v-model.number="currentItem.maxDurability" class="input" min="0" />
                                </div>
                                <div v-if="currentItem.maxDurability > 0" class="flex-column flex-1 justify-center" style="gap: 5px;">
                                    <label class="text-muted" style="font-size: 12px;">耐久耗尽处理</label>
                                    <div class="flex-row align-center" style="gap: 8px; height: 32px;">
                                        <input type="checkbox" v-model="currentItem.keepOnBreak" id="keepOnBreakCheck" />
                                        <label for="keepOnBreakCheck" style="font-size: 13px; color: var(--warning); cursor: pointer;">保留破损残骸</label>
                                    </div>
                                </div>
                            </div>

                            <div class="flex-row" style="gap: 15px;">
                                <div class="flex-column flex-1" style="gap: 5px;">
                                    <label class="text-muted" style="font-size: 12px;">❤️ 动作消耗: HP (体力)</label>
                                    <input type="number" v-model.number="currentItem.costHP" class="input" min="0" />
                                </div>
                                <div class="flex-column flex-1" style="gap: 5px;">
                                    <label class="text-muted" style="font-size: 12px;">🔷 动作消耗: MP (魔力)</label>
                                    <input type="number" v-model.number="currentItem.costMP" class="input" min="0" />
                                </div>
                                <div class="flex-column flex-1" style="gap: 5px;">
                                    <label class="text-warning" style="font-size: 12px; font-weight: bold;">💛 动作消耗: SP (精力)</label>
                                    <input type="number" v-model.number="currentItem.costSP" class="input" min="0" />
                                </div>
                            </div>

                            <div class="flex-row" style="gap: 15px;">
                                <div class="flex-column flex-1" style="gap: 5px;">
                                    <label class="text-muted" style="font-size: 12px;">🎯 作用目标 (Target)</label>
                                    <select v-model="currentItem.targetType" class="select">
                                        <option value="enemy">单一敌人 (Enemy)</option>
                                        <option value="self">自身 (Self)</option>
                                    </select>
                                </div>
                                <div class="flex-column flex-1" style="gap: 5px;">
                                    <label style="color: #ffda3b; font-size: 12px; font-weight: bold;">💥 基准效能 (伤害/恢复值)</label>
                                    <input type="number" v-model.number="currentItem.effectValue" class="input" />
                                </div>
                            </div>
                            
                            <!-- 新增：剧本节点联动 -->
                            <div class="flex-column" style="gap: 5px; margin-top: 5px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.05);">
                                <label class="text-primary" style="font-size: 12px; font-weight: bold;">💬 联动剧本节点 (Dialogue Node)</label>
                                <div class="flex-row" style="gap: 10px;">
                                    <input v-model="currentItem.dialogueScene" class="input flex-1" placeholder="场景文件 (例如: ev_item_potion)" />
                                    <input v-model.number="currentItem.dialogueNodeId" type="number" class="input" style="width: 100px;" placeholder="节点 ID" />
                                </div>
                                <span class="text-muted" style="font-size: 11px;">结算时将拦截动作指令，并直接拉起 CM_DialogueSystem_Core 执行该演出节点。</span>
                            </div>
                        </div>
                    </div>

                    <!-- 状态联动区域 -->
                    <div v-if="currentItem.isUsable" class="card p-15" style="background: rgba(224, 108, 138, 0.1); border: 1px solid var(--primary);">
                        <div class="flex-row justify-between align-center m-b-10">
                            <h4 class="text-primary">✨ 附加状态 (Buff/Debuff)</h4>
                            <button class="btn btn-secondary" style="font-size: 12px; padding: 2px 8px;" @click="addGrantedState">➕ 添加状态</button>
                        </div>
                        <p class="text-muted m-b-10" style="font-size: 12px;">结算时，系统将根据“作用目标(Target)”的阵营自动分发以下状态。</p>
                        <div class="flex-column" style="gap: 8px;">
                            <div v-for="(st, idx) in currentItem.grantedStates" :key="'st'+idx" class="flex-row align-center" style="gap: 10px;">
                                <select v-model="st.id" class="select flex-1">
                                    <option value="">-- 选择附加的状态 --</option>
                                    <option v-for="sDef in statusList" :key="sDef.id" :value="sDef.id">{{ sDef.name }} ({{ sDef.id }})</option>
                                </select>
                                <div class="flex-row align-center" style="gap: 5px;">
                                    <input type="number" v-model.number="st.chance" class="input" style="width: 70px; text-align: center;" min="0" max="100" title="命中概率" />
                                    <span class="text-muted" style="font-size: 12px;">%</span>
                                </div>
                                <button class="btn btn-ghost text-danger" @click="removeGrantedState(idx)">❌</button>
                            </div>
                            <div v-if="!currentItem.grantedStates || currentItem.grantedStates.length === 0" class="text-muted" style="font-size: 12px;">
                                此物品未绑定任何状态。
                            </div>
                        </div>
                    </div>

                    <div v-if="currentItem.isUsable" class="card p-15" style="background: rgba(0,0,0,0.15); border: 1px solid var(--border);">
                        <div class="flex-row justify-between align-center m-b-10">
                            <h4 class="text-secondary">📜 附加宏指令脚本</h4>
                            <button class="btn btn-ghost" style="font-size: 12px; padding: 2px 8px;" @click="addEffectMacro">➕ 添加指令</button>
                        </div>
                        <div class="flex-column" style="gap: 8px;">
                            <div v-for="(eff, idx) in currentItem.effects" :key="'eff'+idx" class="flex-row align-center" style="gap: 10px;">
                                <input v-model="currentItem.effects[idx]" class="input flex-1" placeholder="例如: &lt;Anim: 1&gt;" style="font-family: monospace; color: #99ccff;" />
                                <button class="btn btn-ghost text-danger" @click="removeEffectMacro(idx)">❌</button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>
`;

export const ItemEditor = {
    name: 'ItemEditor',
    template,
    setup() {
        const itemDb = computed(() => {
            if (!state.db.itemDb) state.db.itemDb = {};
            const db = state.db.itemDb;
            if (!db.settings) db.settings = {};
            if (!db.settings.categories) db.settings.categories = [
                { id: 'cat_weapon', name: '⚔️ 武器 (Weapon)' },
                { id: 'cat_consumable', name: '🍖 消耗品 (Consumable)' },
                { id: 'cat_material', name: '📦 素材 (Material)' }
            ];
            if (!db.settings.tags) db.settings.tags = [
                { id: 'tag_physical', name: '✊ 物理' },
                { id: 'tag_fire', name: '🔥 炎属性' },
                { id: 'tag_recovery', name: '💖 恢复' }
            ];
            if (!db.items) db.items = [];
            
            // 数据热补丁：为旧物品补全新增字段
            db.items.forEach(item => {
                if (item.costSP === undefined) item.costSP = 0;
                if (item.grantedStates === undefined) item.grantedStates = [];
                if (item.dialogueScene === undefined) item.dialogueScene = "";
                if (item.dialogueNodeId === undefined) item.dialogueNodeId = null;
            });
            
            return db;
        });

        const statusList = computed(() => {
            return state.db.statusDb ? state.db.statusDb.items : [];
        });

        const selectedItemId = ref(null);
        const searchQuery = ref("");
        const expandedGroups = reactive({ unassigned: true });

        // 🛡️ 核心修复：基于 File System Access API 的内存图片缓存
        const imageCache = reactive({});
        
        const getImageSrc = (id) => {
            if (!id) return FALLBACK_SVG;
            if (imageCache[id]) {
                return imageCache[id] === 'error' ? FALLBACK_SVG : imageCache[id];
            }
            
            imageCache[id] = FALLBACK_SVG;
            
            if (state.dirHandle) {
                (async () => {
                    try {
                        const imgDir = await state.dirHandle.getDirectoryHandle('img');
                        const itemDir = await imgDir.getDirectoryHandle('item');
                        const fileHandle = await itemDir.getFileHandle(`${id}.png`);
                        const file = await fileHandle.getFile();
                        imageCache[id] = URL.createObjectURL(file);
                    } catch (e) {
                        try {
                            const imgDir = await state.dirHandle.getDirectoryHandle('img');
                            const itemDir = await imgDir.getDirectoryHandle('item');
                            const fileHandle = await itemDir.getFileHandle(`item_def.png`);
                            const file = await fileHandle.getFile();
                            imageCache[id] = URL.createObjectURL(file);
                        } catch (e2) {
                            imageCache[id] = 'error';
                        }
                    }
                })();
            }
            return FALLBACK_SVG;
        };

        itemDb.value.settings.categories.forEach(c => expandedGroups[c.id] = true);
        const toggleGroup = (id) => expandedGroups[id] = !expandedGroups[id];

        const filteredItems = computed(() => {
            const query = searchQuery.value.trim().toLowerCase();
            if (!query) return itemDb.value.items;
            return itemDb.value.items.filter(i => 
                (i.name && i.name.toLowerCase().includes(query)) || 
                (i.id && i.id.toLowerCase().includes(query))
            );
        });

        const groupedItems = computed(() => {
            const groups = { unassigned: [] };
            itemDb.value.settings.categories.forEach(c => { groups[c.id] = []; });
            
            filteredItems.value.forEach(item => {
                if (item.categoryId && groups[item.categoryId]) {
                    groups[item.categoryId].push(item);
                } else {
                    groups.unassigned.push(item);
                }
            });
            return groups;
        });

        const currentItem = computed(() => itemDb.value.items.find(i => i.id === selectedItemId.value));

        const generateId = (prefix, arr) => {
            let max = 0;
            arr.forEach(obj => {
                const match = obj.id && obj.id.match(new RegExp(`^${prefix}(\\d+)$`));
                if (match) max = Math.max(max, parseInt(match[1]));
            });
            return `${prefix}${String(max + 1).padStart(3, '0')}`;
        };

        const addItem = () => {
            const newItem = {
                id: generateId('item_', itemDb.value.items),
                name: '新实体模板',
                description: '',
                categoryId: '', 
                tags: [],
                isUsable: true,
                maxDurability: 0,
                keepOnBreak: false,
                costHP: 0,
                costMP: 0,
                costSP: 0, 
                effectValue: 0,
                targetType: 'enemy',
                dialogueScene: '', 
                dialogueNodeId: null, 
                grantedStates: [], 
                effects: []
            };
            itemDb.value.items.push(newItem);
            selectedItemId.value = newItem.id;
            expandedGroups['unassigned'] = true; 
        };

        const removeItem = (id) => {
            if(!confirm(`确定要删除物品定义 [${id}] 吗？`)) return;
            const idx = itemDb.value.items.findIndex(i => i.id === id);
            if (idx > -1) {
                itemDb.value.items.splice(idx, 1);
                if (selectedItemId.value === id) selectedItemId.value = null;
            }
        };

        const addCategory = () => itemDb.value.settings.categories.push({ id: generateId('cat_', itemDb.value.settings.categories), name: '新分类' });
        const removeCategory = (idx) => {
            const catId = itemDb.value.settings.categories[idx].id;
            itemDb.value.items.forEach(i => { if (i.categoryId === catId) i.categoryId = ''; });
            itemDb.value.settings.categories.splice(idx, 1);
        };
        const addTag = () => itemDb.value.settings.tags.push({ id: generateId('tag_', itemDb.value.settings.tags), name: '新标签' });
        const removeTag = (idx) => {
            const tagId = itemDb.value.settings.tags[idx].id;
            itemDb.value.items.forEach(i => {
                if (i.tags) {
                    const tIdx = i.tags.indexOf(tagId);
                    if (tIdx > -1) i.tags.splice(tIdx, 1);
                }
            });
            itemDb.value.settings.tags.splice(idx, 1);
        };

        const toggleTag = (item, tagId) => {
            if (!item.tags) item.tags = [];
            const idx = item.tags.indexOf(tagId);
            if (idx > -1) item.tags.splice(idx, 1);
            else item.tags.push(tagId);
        };

        const addEffectMacro = () => {
            if (!currentItem.value.effects) currentItem.value.effects = [];
            currentItem.value.effects.push("");
        };
        const removeEffectMacro = (idx) => currentItem.value.effects.splice(idx, 1);

        const addGrantedState = () => {
            if (!currentItem.value.grantedStates) currentItem.value.grantedStates = [];
            currentItem.value.grantedStates.push({ id: '', chance: 100 });
        };
        const removeGrantedState = (idx) => currentItem.value.grantedStates.splice(idx, 1);

        return { 
            itemDb, statusList, filteredItems, groupedItems, expandedGroups, toggleGroup,
            currentItem, selectedItemId, searchQuery, 
            addItem, removeItem, toggleTag, 
            addCategory, removeCategory, addTag, removeTag,
            addEffectMacro, removeEffectMacro, 
            addGrantedState, removeGrantedState, getImageSrc
        };
    }
};