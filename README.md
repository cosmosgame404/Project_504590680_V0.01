# Project_Mushoku_Tensei_V0.01
🌌 项目全局技术白皮书 & AI 协同架构宪法 (Hybrid Architecture & AI-Native Protocol) 

版本: 12.3 (全能编辑器 V12.3 / 唯一事实来源、纯数据沙盒、指针绑定大统一版)
核心标签: `RPG Maker MZ`, `Vue 3`, `GSAP`, `No-Build ESM`, `Strict Turn-Battler`, `Pure Data Sandbox`, `Reference Binding`, `SSOT`, `Cache Buster`, `Technical Japanese`

============================================================================= 
⛔ 0. AI 助手绝对开发规范与红线 (System Core Directives) 
============================================================================= 
1. [双语隔离原则]： 
   - 与用户交流、编辑器（HTML/JS/CSS）注释使用 中文。 
   - 游戏本体插件（CM_*.js）代码内部注释、JSDoc、Log 必须 100% 使用技术日语 (Technical Japanese)。 
2. [防截断原则]：必须输出 完整 代码文件。严禁省略号。单次对话仅输出一个完整文件。 
3. [零外部依赖]：禁止任何形式的远程 CDN 或 API。所有库与字体必须本地化引用。 
4. [唯一事实来源 (SSOT)]：全能编辑器产出的 JSON 文件是游戏运行的唯一依据。严禁游戏端硬编码初始状态，必须劫持原生 API 以服从 JSON。
5. [Vue3 生命周期安全]：凡涉及 Vue 实例的挂载与销毁，`unmount()` 必须针对应用实例（App Instance）执行，绝不可对组件代理（Proxy）执行，严防内存泄漏与空指针异常。

============================================================================= 
🏗️ 1. 架构范式：唯一事实来源与复合沙盒 (SSOT & Composite Sandbox) 
============================================================================= 
模块化容器: 编辑器采用原生 <script type="module"> 引入，严格区分业务工作台与无状态组件。

唯一事实来源与生命周期劫持 (SSOT & Lifecycle Hijack): 
在 RM 引擎的极早期 `Scene_Boot.prototype.create` 阶段，必须通过带时间戳的 Fetch (Cache Buster: `?t=Date.now()`) 强行阻塞加载全能编辑器的 JSON。彻底废除 RM 原生的 `$dataClasses` 和 `$dataActors`。

复合沙盒 (Composite Sandbox): 
在编辑器中，通过在同一视口（分辨率可能变动）内叠加多个 Component，并严格利用 pointer-events: none 进行物理防干扰隔离，实现多维度组件的同屏协作预览。 

============================================================================= 
🎨 2. 混合渲染与视觉设计系统 (Hybrid Rendering & Design Tokens) 
============================================================================= 
神圣三位一体 (The Holy Trinity): 
- 大脑 (Data/Logic): CM_DialogueSystem_Core.js 处理纯粹数据，绝不触碰 DOM。 
- 骨骼 (WebGL/PIXI): CM_DialogueSystem_Effects.js 渲染于 Canvas，处理环境光、地图、立绘、底层特效图 (<Pic>)。 
- 皮肤 (DOM/Vue3): CM_Vue_*.js 处理对话框、生存属性、物品分类矩阵与仓库 (Pastel Pink UI)。 
🌟 破壁者 (Foreground Overlay): CM_Vue_ForegroundCG.js 独占 z-index: 99999，超越一切 UI。 

设计令牌与降级渲染 (Design Tokens & Hardware Acceleration):
大量使用高明度毛玻璃 (Glassmorphism)。但在 Vue 驱动的 GSAP 动画期间，严禁动态补间 `filter: blur`。必须强制开启 `transform: translateZ(0)` 将状态条等元素隔离到独立 GPU 渲染层，仅通过 `x` 和 `opacity` 进行过渡，严防 WebGL 背景重绘导致的帧率雪崩。

============================================================================= 
🎒 3. 物品架构：大统一动作模型与空间物理交互 (Unified Action & Spatial D&D)
============================================================================= 
实例驱动 (Instance-Driven): 废弃 Count 堆叠。每个物品在获取时分配全局唯一的 UUID，承载独立的耐久度。

大统一动作载体 (Grand Unified Action): 武器与道具抽象为同一结构。统一通过 API `executeActionByUid()` 进行原子化结算（校验耐久 -> 扣减属性 -> 调用 `applyItemEffects` -> 结算破损）。

相对靶点注入 (Relativistic Target Resolution): `applyItemEffects(baseId, subject)` 函数不再依赖 RM 原生队伍寻找目标。根据物品的 targetType (self/enemy)，相对判定施法者（Subject）的阵营并实行降维打击。

============================================================================= 
⚔️ 4. 全自动纯数据沙盒战斗引擎 (Strict Turn-Based Pure Data Sandbox)
============================================================================= 
纯数据对象与引用绑定 (Pure Data Object & Reference Binding):
彻底抛弃 `$gameTroop` 实例。战斗引擎在内存中构建极其轻量的字典对象 (`playerEntity`, `enemyEntity`) 形成闭环沙盒。
为了与底层 Native UI 同步，沙盒玩家对象的状态数组必须与原生系统进行指针绑定 (`playerEntity._cmStates = leader._cmStates`)，实现 O(1) 零延迟的双向数据同步。

动态属性 Getter (Dynamic Property Getters):
沙盒对象的战斗属性（mhp, atk, def）严禁使用静态数值复制。必须利用 `Object.defineProperty` 挂载 Getter 函数，每次读取时实时从状态管线 (`CM_StatusSystem`) 中调取 Rates (乘区) 与 Plus (固定值) 加成，保证一切 Buff/Debuff 精准生效。

静默自动攻击与极简视觉 (Silent Auto-Attack & UI): 
玩家回合自动读取 `_cmActiveWeaponIdx` 并发动。废除文字横幅（Banner）干扰。采用实体突进 (Lunge GSAP)、PIXI 变色震动、CSS Text-Shadow 抛物线跳字完成全部打击反馈。

============================================================================= 
🌍 5. 游戏实机与编辑器坐标系 100% 映射对齐协议 (Absolute Sandbox Sync)
============================================================================= 
绝对沙盒同步容器 (.cm-sandbox-root): 针对 RM 窗口拉伸产生的 Canvas 黑边，动态计算 `--cm-scale-x/y` 与 `--cm-canvas-left/top`。所有 Vue UI 的根节点必须挂载此 Class，以确保 DOM 层与 WebGL 层的像素级对齐。

============================================================================= 
🧠 6. 状态与被动管线架构 (Status & Condition Pipeline)
=============================================================================
原生属性拦截 (Native Bypass):
重写 `Game_Actor.prototype.paramBase` 和 `Game_Actor.prototype.setup`。一旦系统尝试查询原生数据库，强制拦截并返回编辑器 JSON (`window.CM_Core.Database.characters`) 中的数值。

多维生命周期 (Multi-Dimensional Lifecycle):
- Turn (战斗回合): 战斗引擎触发 `onTurnEnd()` 递减。
- Tick (时间刻度): 联动时间生存系统，随着探索时间递减。
- Conditional (动态条件): 引擎核心。通过在 `setHp` / `setMp` 等底层脏数据 (Dirty Flag) 拦截器中触发 `checkConditionalStates()`，实时 `eval` 条件表达式自动挂载/卸载被动，无需事件干预。

AOT 宏预编译 (Ahead-of-Time Macro Compilation):
严禁在高频 Getter 中进行正则匹配。状态修饰宏（如 `<Stat: ATK, *1.5>`）必须在 Boot 阶段一次性编译为定长数组缓存 (`_cachedRates`, `_cachedPlus`)，计算时仅允许 O(1) 的数组索引访问。

=============================================================================
⏳ 7. 时间生存与行动点架构 (Tick & Phase Survival System)
=============================================================================
行动点驱动 (AP-Driven Ticks): 时间不再自然流逝，全部由探索/动作（Tick）驱动。
二元相位 (Binary Phase): 12刻度=1相位。0~11固定为☀️昼，12~23固定为🌙夜。累计24刻度为新日。跨昼夜与跨天时，非同期派发 MessageLog 事件完成 UI 解耦渲染。
