# 记账本 PWA

由 SwiftUI 原生记账 App（/tmp/bookkeep/Bookkeeping）重写的纯静态 PWA，可直接部署到 GitHub Pages（把本目录内容推到仓库根目录或 docs/ 即可，无需构建工具）。

## 文件清单

```
pwa/
├── index.html          单页入口（含记一笔弹层、确认弹窗）
├── manifest.json       PWA manifest（名称"记账本"，主题色 #FF8C26）
├── sw.js               Service Worker（静态资源缓存，离线可用）
├── css/style.css       iOS 风格样式（支持深色模式）
├── js/
│   ├── util.js         常量、SF Symbol→emoji 映射、日期/金额格式化、种子分类
│   ├── db.js           IndexedDB 数据层（增删改查、备份导出/恢复导入）
│   ├── backup.js       GitHub 加密备份（WebCrypto AES-GCM + PBKDF2）
│   ├── app.js          页面渲染与交互（首页/统计/分类/设置）
│   └── sw-register.js  SW 注册
├── icons/              icon-192/512、apple-touch-icon（180）
└── README.md
```

## 功能清单

| 功能 | 状态 |
|---|---|
| 记一笔（支出/收入、金额、分类选择、备注、日期） | ✅ |
| 金额以「分」存储（避免浮点误差），数据模型与 Swift 端一致（Transaction/Category 同字段） | ✅ |
| 首页：月度汇总大数字卡（结余/支出/收入）+ 按日分组账单列表 | ✅ |
| 月份切换：‹ › 按钮 + 左右滑动手势 | ✅ |
| 统计页：月度环比、支出分类占比环形图（SVG）、每日支出柱状图、分类排行（支出/收入切换）、年度收支对比 | ✅ |
| 分类管理：内置 20 个分类（14 支出 + 6 收入，与 SeedData.swift 一致，SF Symbol 映射为 emoji）、自定义分类增删、内置分类不可删 | ✅ |
| 账单详情：查看/删除 | ✅ |
| 设置页 GitHub 加密备份：IndexedDB 全量 → JSON → AES-256-GCM（PBKDF2-SHA256 派生，10 万次迭代）→ GitHub Contents API 提交到私有仓库单文件（自动处理已有文件的 sha 更新） | ✅ |
| 恢复页：从 GitHub 下载 → 解密 → 清空回写（保留分类 id 引用完整性） | ✅ |
| token/仓库/路径/密码存 localStorage | ✅ |
| PWA：manifest + Service Worker + apple-touch-icon，iOS Safari 可添加到主屏幕 | ✅ |
| 深色模式跟随系统、safe-area 适配刘海屏 | ✅ |
| 附加：月度预算进度条（设置页配置） | ✅ |

## 与源 App 的对照（未实现项）

- ❌ **搜索**（首页 searchable：按备注/分类/金额搜索）
- ❌ **筛选**（TransactionFilterView：按类型/分类/金额区间筛选）
- ❌ **预算页完整功能**（BudgetView：仅实现了首页进度条展示 + 设置页设定月预算）
- ❌ **再记一笔**（复制上一笔快捷记账）
- ❌ **CSV 导出/导入**（BackupService 的 CSV 部分）；JSON 导出/导入由加密备份覆盖
- ❌ **iCloud 同步**（以 GitHub 备份替代）
- ❌ **统计页下拉刷新**（数据实时重算，无需刷新）
- ❌ **编辑已有账单**（仅支持删除后重记）
- ❌ **自动备份**（AutoBackupManager 的定时策略）

## 已知限制

1. **数据仅存于单个浏览器**：IndexedDB 不跨设备/浏览器共享，换浏览器或清除站点数据会丢失，务必定期点「备份到 GitHub」。
2. **Service Worker 在 http:// 下不注册**（file:// 也不行），需 https 或 localhost 部署才能离线使用；GitHub Pages 默认满足。
3. **密码丢失无法恢复备份**：AES-GCM 加密无后门，忘记密码等于备份作废。
4. **GitHub PAT 权限**：需目标私有仓库的 Contents 读写权限（fine-grained token 勾选 Contents: Read and write）。
5. 恢复操作会**清空并覆盖**本地全部数据（有二次确认）。
6. iOS Safari 添加到主屏幕后状态栏样式为 default，未做沉浸式顶图。

## 部署（父任务执行）

推送到 GitHub 仓库后，Settings → Pages → 选择分支根目录即可；无需任何构建步骤。
