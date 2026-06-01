# Project_5045906809965615431_V0.01
项目全局技术白皮书 & AI 协同架构宪法 (Hybrid Architecture & AI-Native Protocol) 

版本: 12.9 (全能编辑器 V12.9 / 规范升级、代码去噪、自主沙盒マウント版)
核心标签: `RPG Maker MZ`, `Vue 3`, `GSAP`, `No-Build ESM`, `Strict Turn-Battler`, `Pure Data Sandbox`, `Reference Binding`, `SSOT`, `Cache Buster`, `Technical Japanese`, `Native Render Loop`, `Noiseless UI`

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
模块化容器: 编辑器采用原生 <script type="module"> 引入，严格区分业务工作台与无状态组件。

唯一事实来源与生命周期劫持 (SSOT & Lifecycle Hijack): 
在 RM 引擎的极早期 `Scene_Boot.prototype.create` 阶段，必须通过带时间戳的 Fetch (Cache Buster: `?t=Date.now()`) 强行阻塞加载全能编辑器的 JSON。对于多层级子文件夹，必须执行 `encodeURIComponent` 防止 URI 解析丢失导致的静默 404。

复合沙盒 (Composite Sandbox): 
在编辑器中，通过在同一视口（分辨率可能变动）内叠加多个 Component，并严格利用 pointer-events: none 进行物理防干扰隔离，实现多维度组件的同屏协作预览。 

============================================================================= 
2. 混合渲染与视觉设计系统 (Hybrid Rendering & Design Tokens) 
============================================================================= 
神圣三位一体 (The Holy Trinity): 
- 大脑 (Data/Logic): CM_DialogueSystem_Core.js 处理纯粹数据，绝不触碰 DOM。 
- 骨骼 (WebGL/PIXI): CM_DialogueSystem_Effects.js 渲染于 Canvas，处理 environment 光、地图、立绘、底层特效图 (<Pic>)。 
- 皮肤 (DOM/Vue3): CM_Vue_*.js 处理对话框、生存属性、物品分类矩阵与仓库。

无噪点纯净 UI 规范 (Noiseless UI Design):
彻底排斥花哨的 CSS 呼吸灯、过度的 Drop-shadow 模糊光晕以及冗杂的半透明嵌套。所有的节点标签、UI 提示框必须采用“黑底白字”的高对比度实色块 (Solid Blocks)。通过极致的留白与清晰的边界线（Crisp Edges）契合赛璐璐 (Cel-shaded) 审美。

GSAP 与 Transform 矩阵防塌陷原则 (Matrix Collapse Prevention):
在操控 DOM 动画时，如果在 CSS 中硬编码 `scale(0)` 或 `display: none`，会导致 `translate` 等空间矩阵坐标瞬间丢失。必须保持 CSS 的空间属性完整，将生命周期的起始状态通过 `gsap.fromTo` 完全委派给 GSAP 引擎处理。

============================================================================= 
3. 物品架构：大统一动作模型与空间物理交互 (Unified Action & Spatial D&D)
============================================================================= 
大统一动作载体 (Grand Unified Action): 武器与道具抽象为同一结构。统一通过 API `executeActionByUid()` 进行原子化结算。

相对靶点注入 (Relativistic Target Resolution): `applyItemEffects(baseId, subject)` 函数不再依赖 RM 原生队伍寻找目标。根据物品的 targetType (self/enemy)，相对判定施法者（Subject）的阵营并实行降维打击。

============================================================================= 
4. 全自动纯数据沙盒战斗引擎 (Strict Turn-Based Pure Data Sandbox)
============================================================================= 
纯数据对象与引用绑定 (Pure Data Object & Reference Binding):
彻底抛弃 `$gameTroop` 实例。沙盒玩家对象的状态数组必须与原生系统进行指针绑定 (`playerEntity._cmStates = leader._cmStates`)，实现 O(1) 零延迟的双向数据同步。

动态属性 Getter (Dynamic Property Getters):
沙盒对象的战斗属性必须利用 `Object.defineProperty` 挂载 Getter 函数，每次读取时实时从状态管线 (`CM_StatusSystem`) 中调取 Rates 与 Plus。

============================================================================= 
5. 游戏实机与编辑器坐标系 100% 映射对齐协议 (Absolute Sandbox Sync)
============================================================================= 
绝对沙盒同步容器 (.cm-sandbox-root): 针对 RM 窗口拉伸产生的 Canvas 黑边，动态计算 `--cm-scale-x/y` 与 `--cm-canvas-left/top`。所有 Vue UI 的根节点必须挂载此 Class，以确保 DOM 层与 WebGL 层的像素级对齐。

============================================================================= 
6. 状态与被动管线架构 (Status & Condition Pipeline)
=============================================================================
多维生命周期 (Multi-Dimensional Lifecycle):
- Turn (战斗回合): 战斗引擎触发 `onTurnEnd()` 递减。
- Phase (二元相位): 联动时间生存系统，随着昼夜状态的主动更迭触发刷新或递减。
- Conditional (动态条件): 通过在底层脏数据 (Dirty Flag) 拦截器中触发 `checkConditionalStates()`，实时挂载/卸载被动。

=============================================================================
7. 主动二元相位与行动力管线架构 (Active Phase & AP Pipeline System)
=============================================================================
严格预检结算流 (Pre-flight Settle Flow):
所有消耗行动力(AP)的探索或交互事件，必须遵循“先校验、后扣除”原则。即使行动力扣除至 0 点，系统也进退自如，绝不触发强制自动天黑，将时间掌控权完全交还给玩家。

主动相位交替响应 (Active Phase Transition):
- 昼间过渡: 玩家可在 HUD 界面随时点击“休息”按钮，主动发起昼夜交替。阶段转为夜晚，并在上限范围内恢复 1 点 AP（不可突破上限）。
- 夜间过渡: 在夜晚点击 HUD “休息”将由对话系统文本节点（如 ID:99）实施高优先拦截，并呼出特定文本提示。玩家必须在地图中与“床”对象交互触发就寝，触发游戏天数(Day) +1，AP 一律全快恢复至最大上限。

去中心化沙盒自挂载 (Self-Mount Sandbox):
时间系统的 HUD 组件彻底脱离外部布局编辑器配置（不再接收 `Core.UILayout` 的位置数据）。由组件本身在 `Scene_Map` 的 start 生命周期内自律创建 `.cm-sandbox-root` 并独立执行 `mount()`，其物理渲染坐标由内部 CSS 完全锁定于画布的正上方中央。

GSAP 内部集成动画 (Internal GSAP Transition):
交替动画完全收束在 `CM_Vue_SurvivalHUD` 组件内部，不再依赖可能被废弃的 `CM_Vue_ForegroundCG`。通过全局自定义事件通信触发，利用 GSAP 驱动无噪点的纯色块暗幕遮罩与日月符号在物理画布上层的垂直空间矩阵运动。
