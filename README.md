# AI-epuber 电子书智能阅读器

<p align="left">
  <a href="https://github.com/你的仓库/AI-epuber/stargazers" target="_blank"><img src="https://img.shields.io/github/stars/你的仓库/AI-epuber?style=social" alt="Stars"></a>
  <a href="https://github.com/你的仓库/AI-epuber/issues" target="_blank"><img src="https://img.shields.io/github/issues/你的仓库/AI-epuber" alt="Issues"></a>
  <a href="https://github.com/你的仓库/AI-epuber/pulls" target="_blank"><img src="https://img.shields.io/github/issues-pr/你的仓库/AI-epuber" alt="Pull Requests"></a>
  <img src="https://img.shields.io/github/license/你的仓库/AI-epuber" alt="License">
  <img src="https://img.shields.io/badge/node-%3E=18.0.0-green" alt="Node Version">
  <img src="https://img.shields.io/badge/react-18.x-blue" alt="React">
  <img src="https://img.shields.io/badge/vite-6.x-ff69b4" alt="Vite">
  <img src="https://img.shields.io/badge/tailwindcss-3.x-38bdf8" alt="TailwindCSS">
</p>

AI-epuber 是一个基于 React + Vite 的现代化电子书阅读与管理平台，支持高亮、批注、AI摘要、AI对话等智能功能，适合个人知识管理与深度阅读。

## 主要特性

- 📚 书架管理：导入/导出本地电子书，阅读进度自动保存
- 🖍️ 高亮与批注：支持多色高亮、批注、批量导出
- 🤖 AI摘要：对章节内容进行智能总结
- 💬 AI对话：与AI就当前章节内容进行问答、讨论
- 📌 高亮/AI消息固定与导出：支持固定重要AI对话、导出为 Markdown
- 🌙 日夜主题切换，界面美观
- ⚡ 极速响应，支持大文件电子书

## 安装与运行

1. **克隆项目**
   ```bash
   git clone https://github.com/kelvinzhao/AI-epuber
   cd AI-epuber
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **本地开发启动**
   ```bash
   npm run dev
   ```

4. **打包构建**
   ```bash
   npm run build
   ```

5. **预览生产包**
   ```bash
   npm run preview
   ```

## 目录结构

```
src/
  pages/         # 主要页面（书架、阅读器、设置等）
    Bookshelf.jsx
    Reader.jsx
    Settings.jsx
  components/    # 复用组件（AIChat、AISummary等）
  hooks/         # 自定义hooks
  assets/        # 静态资源
  App.jsx        # 应用入口
  main.jsx       # 入口挂载
public/          # 公共资源
```

## 技术栈

- React 18
- Vite 6
- TailwindCSS 3
- epub.js（电子书解析）
- idb-keyval（本地存储）
- React Router 7
- 其他：mermaid、file-saver、react-markdown 等

## 贡献与反馈

欢迎提 issue、PR 或建议！

---

> 本项目仅供学习与个人知识管理使用，禁止用于任何商业用途。
