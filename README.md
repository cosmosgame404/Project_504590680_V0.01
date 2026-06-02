# Project_504590680_V0.01
项目全局技术白皮书 & AI 协同架构宪法 (Hybrid Architecture & AI-Native Protocol) 

版本: 12.10 (全能编辑器 V12.10 / AVG 纯血转型、沉浸式交互中枢、自主沙盒)
核心标签: `RPG Maker MZ`, `Vue 3`, `GSAP`, `No-Build ESM`, `AVG Engine`, `Character Hub`, `Pure Data Sandbox`, `Reference Binding`, `SSOT`, `Cache Buster`, `Technical Japanese`, `Native Render Loop`, `Noiseless UI`

============================================================================= 
0. AI 助手绝对开发规范与红线 (System Core Directives) 
============================================================================= 
1. [双语隔离原则]： 
   - 与用户交流、编辑器（HTML/JS/CSS）注释使用 中文。 
   - 游戏本体插件（CM_*.js）代码内部注释、JSDoc、Log 必须 100% 使用技术日语 (Technical Japanese)。 
2. [防截断原则]：必须输出 完整 代码文件。严禁省略号。单次对话仅输出一个完整文件。 
3. [零外部依赖]：禁止任何形式的远程 CDN 或 API。所有库与字体必须本地化引用。 
4. [唯一事实来源 (SSOT)]：全能编辑器产出的 JSON 文件是游戏运行的唯一依据。严禁游戏端硬编码初始状态，必须劫持原生 API 以服从 JSON。
5. [Vue3 生命周期安全]：凡涉及 Vue 实例的挂载与销毁，`unmount()` 必须针对应用实例（App Instance）执行，绝不可对组件代理（Proxy）执行，严防内存泄漏与空指针异常。
6. [统一作者命名]：所有向游戏本体输出的 JavaScript 插件，其元数据中的作者标签（`@author`）必须统一命名为 `Cosmos404`。
7. [严禁代码注释图标]：JavaScript 插件内部的所有文本注释、JSDoc 声明、日志输出等（包括文件头部的说明框、行内注释段落等），严禁包含任何 Emoji 或图形小图标（例如 “🌌”、“🎨”、“🛠️” 等）。必须保持纯文本的技术洁净度，确保在所有终端和编辑器下无乱码、无视觉杂噪。

============================================================================= 
1. 架构范式：唯一事实来源与复合沙盒 (SSOT & Composite Sandbox) 
============================================================================= 
模块化容器: 编辑器采用原生 `<script type="module">` 引入，严格区分业务工作台与无状态组件。

唯一事实来源与生命周期劫持 (SSOT & Lifecycle Hijack): 
在 RM 引擎的极早期 `Scene_Boot.prototype.create` 阶段，必须通过带时间戳的 Fetch (Cache Buster: `?t=Date.now()`) 强行阻塞加载全能编辑器的 JSON。对于多层级子文件夹，必须执行 `encodeURIComponent` 防止 URI 解析丢失导致的静默 404。

复合沙盒 (Composite Sandbox): 
在编辑器中，通过在同一视口（分辨率可能变动）内叠加多个 Component，并严格利用 `pointer-events: none` 进行物理防干扰隔离，实现多维度组件的同屏协作预览。 

============================================================================= 
2. 混合渲染与视觉设计系统 (Hybrid Rendering & Design Tokens) 
============================================================================= 
神圣三位一体 (The Holy Trinity): 
- 大脑 (Data/Logic): `CM_DialogueSystem_Core.js` 处理纯粹数据，绝不触碰 DOM。 
- 骨骼 (WebGL/PIXI): `CM_DialogueSystem_Effects.js` 渲染于 Canvas，处理 environment 光、地图、立绘、底层特效图 (`<Pic>`)。 
- 皮肤 (DOM/Vue3): `CM_Vue_*.js` 处理对话框、生存属性、角色交互枢纽 (Character Hub)、物品分类矩阵与仓库。

无噪点纯净 UI 规范 (Noiseless UI Design):
彻底排斥花哨的 CSS 呼吸灯、过度的 Drop-shadow 模糊光晕以及冗杂的半透明嵌套。所有的节点标签、UI 提示框必须采用“黑底白字”的高对比度实色块 (Solid Blocks)。通过极致的留白与清晰的边界线（Crisp Edges）契合赛璐璐 (Cel-shaded) 审美。

GSAP 与 Transform 矩阵防塌陷原则 (Matrix Collapse Prevention):
在操控 DOM 动画时，如果在 CSS 中硬编码 `scale(0)` 或 `display: none`，会导致 `translate` 等空间矩阵坐标瞬间丢失。必须保持 CSS 的空间属性完整，将生命周期的起始状态通过 `gsap.fromTo` 完全委派给 GSAP 引擎处理。

============================================================================= 
3. 物品架构：大统一动作模型与空间物理交互 (Unified Action & Spatial D&D)
============================================================================= 
大统一动作载体 (Grand Unified Action): 武器与道具抽象为同一结构。统一通过 API `executeActionByUid()` 进行原子化结算。

相对靶点注入 (Relativistic Target Resolution): `applyItemEffects(baseId, subject)` 函数不再依赖 RM 原生队伍寻找目标。根据物品的 `targetType` (self/enemy)，相对判定施法者（Subject）的阵营并实行降维打击。

============================================================================= 
4. 角色驱动与沉浸式交互系统 (Character-Driven & Immersive Interaction Hub)
============================================================================= 
全面向 AVG/Galgame 纯血转型，废弃所有基于回合制/行为树的传统战斗逻辑 (`actionPatterns`)，专注剧情分支与角色关系。

动态生存与关系属性 (Dynamic Custom Props):
向所有实体 (含 NPC) 全面开放 `customProps`，实现“好感度 (Affinity)”、“心情值 (Mood)”等 AVG 核心变量的本地化定义，并通过 `bindVarId` 与原生 `Game_Variables` 实现双向实时同步。

交互枢纽 (Interactions Hub) 与两段式结算 (Two-Phase Commit):
探索地图节点不再直接绑定消耗，而是呼出全屏沉浸式的 Vue UI。选项严格遵循预检 (Pre-flight Check)。玩家点击有效选项后，底层优先确定并扣除资源 (AP/Time)，待 UI 退出动画完毕后，再无缝派发 Payload (Dialogue/Macro)。

多表情差分立绘 (Expressions Matrix):
立绘系统升维，采用“单次基准裁切 + 多态差分寻址”机制。确保角色在不同情绪状态（喜、怒、哀等）下的五官绝对对齐与平滑切换。

============================================================================= 
5. 游戏实机与编辑器坐标系 100% 映射对齐协议 (Absolute Sandbox Sync)
============================================================================= 
绝对沙盒同步容器 (.cm-sandbox-root): 针对 RM 窗口拉伸产生的 Canvas 黑边，动态计算 `--cm-scale-x/y` 与 `--cm-canvas-left/top`。所有 Vue UI 的根节点必须挂载此 Class，以确保 DOM 层与 WebGL 层的像素级对齐。

============================================================================= 
6. 状态与被动管线架构 (Status & Condition Pipeline)
=============================================================================
多维生命周期 (Multi-Dimensional Lifecycle):
- Turn (战斗回合): 引擎触发 `onTurnEnd()` 递减。
- Phase (二元相位): 联动时间生存系统，随着昼夜状态的主动更迭触发刷新或递减。
- Conditional (动态条件): 通过在底层脏数据 (Dirty Flag) 拦截器中触发 `checkConditionalStates()`，实时挂载/卸载被动。

=============================================================================
7. 主动二元相位与行动力管线架构 (Active Phase & AP Pipeline System)
=============================================================================
严格预检结算流 (Pre-flight Settle Flow):
所有消耗行动力(AP)的探索或交互事件，必须遵循“先校验、后扣除”原则。即使行动力扣除至 0 点，系统也进退自如，绝不触发强制自动天黑，将时间掌控权完全交还给玩家。

主动相位交替响应 (Active Phase Transition):
- 昼间过渡: 玩家可在 HUD 界面随时点击“休息”按钮，主动发起昼夜交替。阶段转为夜晚，并在上限范围内恢复 1 点 AP（不可突破上限）。
- 夜间过渡: 在夜晚点击 HUD “休息”将由对话系统文本节点实施高优先拦截，并呼出特定文本提示。玩家必须在地图中与“床”对象交互触发就寝，触发游戏天数(Day) +1，AP 一律全快恢复至最大上限。

去中心化沙盒自挂载 (Self-Mount Sandbox):
时间系统的 HUD 组件脱离外部布局编辑器配置。由组件本身在 `Scene_Map` 的 start 生命周期内自律创建 `.cm-sandbox-root` 并独立执行 `mount()`，其物理渲染坐标由内部 CSS 完全锁定于画布。

=============================================================================
8. 地图探索与时间管线异步解耦 (Explore & Time Pipeline Async Decoupling)
=============================================================================
动画请求拦截 (Animation Intercept): 
发生时间交替时，通过触发全局 `CM_TimeSurvival:RequestAnimation` 事件，探索地图系统将立刻隐去当前所有的交互节点 (POI)。

异步底图加载校验 (Async Bitmap Validation): 
幕后时间推移完成后，探索系统会在主循环中强制等待底层背景图对象 (`Bitmap.isReady()`) 完全读取并缓冲。

延迟重生机制 (Respawn Lifecycle): 
确认视觉底层完全就绪后，才基于最新时间状态 (Phase/Day) 重绘节点并执行 GSAP 进场动画。彻底解决由于异步加载造成的“底图黑屏期节点幽灵穿透”问题。

=============================================================================
9. 架构演进日志 (Changelog: Hybrid Architecture - Time & Exploration)
=============================================================================
[Core Engine] Time & Survival System (CM_TimeSurvivalSystem):
- 引入 SSOT (唯一事实来源) 星期推演逻辑。不再使用独立变量存储“星期”，通过 `sys.day` 动态模运算推演（1=周一 ~ 7=周日），从根源杜绝跨天数据不同步风险。内置星期多语言本地化字典纯净输出。

[Exploration] Point-and-Click Map (CM_ExploreSystem):
- 探索节点 (POI) 生命期管线升级，增加 `allowedDays` 过滤器数组（如 `[1, 5]` 代表仅周一和周五出现）。并在引擎轮询 Tick 中与现有昼夜条件无缝融合，实现精准动态渲染。

[UI / UX] HUD & Transition (CM_Vue_SurvivalHUD):
- 独立 Z-Index 突防：右上角新增绝对定位悬浮日历面板 (Days & Weekday)，严格遵守黑底白字高对比度赛璐璐规范。
- GSAP 3D 矩阵动画：在 `sleep` 昼夜交替过渡动画中，集成 GSAP `rotationX` 的 3D 翻页动效。动画执行与底层数据结算解耦，通过回调在全屏遮蔽态静默刷新数据，配合 `back.out` 缓动函数实现零塌陷的顺滑翻页演出。

[Editor] Omni-Editor Modules (module_map.js):
- 数据生产端闭环：地图 POI 配置面板新增“星期出现条件”复选框组件。双向绑定并生成标准化的 `allowedDays` 数组导出，完善引擎-编辑器数据链路。
