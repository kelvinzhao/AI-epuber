import { useParams, Link } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { get, set } from "idb-keyval";
import ePub from "epubjs";
import AISummary from "../components/AISummary";
import AIChat from "../components/AIChat";
//import { UnknownDiagramError } from "mermaid";

export default function Reader() {
  // =======================
  // 1. 状态与引用声明
  // =======================
  const { id } = useParams();
  const [bookFile, setBookFile] = useState(null);
  const [book, setBook] = useState(null);
  const [toc, setToc] = useState([]);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const viewerRef = useRef(null);
  const [progressRestored, setProgressRestored] = useState(false);
  const [highlightPopup, setHighlightPopup] = useState(null);
  const [highlightColor, setHighlightColor] = useState("#ffe066");
  const [highlightComment, setHighlightComment] = useState("");
  const [highlightsMap, setHighlightsMap] = useState(new Map());
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);
  const [tocList, setTocList] = useState([]);
  const [spineItems, setSpineItems] = useState([]);
  const [editingHighlight, setEditingHighlight] = useState(null);
  const [editColor, setEditColor] = useState("#ffe066");
  const [editComment, setEditComment] = useState("");
  const highlightsListRef = useRef(null);
  const highlightRefs = useRef({});  // 存储每个高亮元素的ref
  const [currentChapterContent, setCurrentChapterContent] = useState("");
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const popupRef = useRef(null);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'highlights' | 'chat'
  const [metadata, setMetadata] = useState({ title: "", creator: "" });
  const [highlightToDelete, setHighlightToDelete] = useState(null);
  const [theme, setTheme] = useState('light');
  const bookInstance = useRef(null);
  const renderedRef = useRef(false);
  const [pendingCfi, setPendingCfi] = useState(null);
  const sessionStartRef = useRef(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  // 聊天记录提升到Reader
  const [chatMessages, setChatMessages] = useState([]);

  // 1. 封装注入样式的函数（提前到 hooks 区域最前面）
  const injectThemeStyleToIframe = useCallback((theme) => {
    const iframe = viewerRef.current?.querySelector('iframe');
    if (iframe?.contentDocument?.head) {
      // 先移除旧的 style
      const oldStyle = iframe.contentDocument.getElementById('theme-style');
      if (oldStyle) oldStyle.remove();

      const style = iframe.contentDocument.createElement('style');
      style.id = 'theme-style';
      style.textContent = theme === 'dark'
        ? `
          body, b, p, span, pre, i, h1, h2, h3, h4, h5, h6 {
            color: #bdbdbd !important; /* 夜间灰色 */
            line-height: 250% !important;
            background: #23272f !important;
          }
        `
        : `
          body, b, p, span, pre, i, h1, h2, h3, h4, h5, h6 {
            color:rgb(71, 66, 50) !important; /* 白天黑色 */
            line-height: 250% !important;
            background:rgb(255, 255, 255) !important;
          }
        `;
      iframe.contentDocument.head.appendChild(style);
    }
  }, [viewerRef]);

  // 切换主题时存储到本地
  const setThemeAndStore = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('reader_theme', newTheme);
  };

  // 初始化时读取本地存储的主题
  useEffect(() => {
    const savedTheme = localStorage.getItem('reader_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }
  }, []);

  // 高亮排序列表（必须放在所有 useEffect/useCallback 之前）
  const sortedHighlights = useMemo(() => {
    return Array.from(highlightsMap.values()).sort((a, b) => a.id - b.id);
  }, [highlightsMap]);

  // 处理高亮点击（必须在 addHighlight 之前）
  const handleHighlightClick = useCallback(async(cfiRange) => {
    // 直接从 IndexedDB 获取最新数据
    const highlights = await get(`highlights_${id}`);
    const highlight = highlights?.find(h => h.cfiRange === cfiRange);
    if (!highlight) {
      console.error("未找到高亮");
      return;
    }
    setActiveTab('highlights');
    requestAnimationFrame(() => {
      const element = highlightRefs.current[highlight.id];
      if (element && highlightsListRef.current) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-focus-animation');
        setTimeout(() => element.classList.remove('highlight-focus-animation'), 1000);
      }
    });
  }, [highlightsMap, setActiveTab]);

  // 高亮色数组和透明度按 theme 区分
  const highlightColors = theme === 'dark'
    ? [
        //'rgba(255,224,102,0.5)', 'rgba(178,242,255,0.5)', 'rgba(255,214,224,0.5)', 'rgba(211,249,216,0.5)', 'rgba(255,216,168,0.5)'
        '#ffe066', '#b2f2ff', '#ffd6e0', '#d3f9d8', '#ffd8a8'
      ]
    : [
        '#ffe066', '#b2f2ff', '#ffd6e0', '#d3f9d8', '#ffd8a8'
      ];

  // 统一的高亮添加函数，colorIndex 必须传递
  const addHighlight = useCallback((cfiRange, colorIndex) => {
    if (!book?.rendition?.annotations) return;
    try {
      book.rendition.annotations.remove(cfiRange, "highlight");
      book.rendition.annotations.add(
        "highlight",
        cfiRange,
        undefined,
        (e) => {
          e.preventDefault();
          handleHighlightClick(cfiRange);
        },
        undefined,
        {
          "fill": highlightColors[colorIndex] || highlightColors[0],
          //"opacity": "1",
        }
      );
    } catch (e) {
      console.error("添加高亮失败:", e);
    }
  }, [book, handleHighlightClick, highlightColors]);

  // =======================
  // 2. 所有 useEffect/useCallback/useMemo
  // =======================
  // 主题色全部交由 CSS 控制，JS 只切换 className

  // =======================
  // 工具函数
  // =======================
  const isCfiInSection = useCallback((cfiRange, section) => {
    if (!cfiRange?.startsWith("epubcfi(")) return false;
    const base = "epubcfi(" + section.cfiBase;
    return cfiRange.startsWith(base);
  }, []);

  const checkPopupPosition = useCallback((x, y, width, height) => {
    // 获取视窗大小
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 确保不超出右边界和下边界
    const newX = Math.min(x, viewportWidth - width);
    const newY = Math.min(y, viewportHeight - height);
    
    // 确保不超出左边界和上边界
    const finalX = Math.max(0, newX);
    const finalY = Math.max(0, newY);
    
    return { x: finalX, y: finalY };
  }, []);

  // =======================
  // 处理文本选择和高亮
  // =======================
  const handleMouseUp = useCallback((e) => {
    const iframe = viewerRef.current?.querySelector("iframe");
    if (!iframe) return;
    const iframeWindow = iframe.contentWindow;
    const selection = iframeWindow.getSelection();
    // 如果没有选中文字且当前有弹框，则关闭弹框
    if (!selection || selection.isCollapsed) {
      //console.log("没选文字");
      setHighlightPopup(prev => {
        if (prev) {
          //console.log("关闭弹框");
          setHighlightComment("");
          return null;
        }
        return prev;
      });
      return;
    }
    
    
    const selectedText = selection.toString().trim();
    if (selectedText.length === 0) {
      if (highlightPopup) {
        setHighlightPopup(null);
        setHighlightComment("");
      }
      return;
    }
    

    // 只允许在同一章节内高亮
    const anchorDoc = selection.anchorNode?.ownerDocument;
    const focusDoc = selection.focusNode?.ownerDocument;
    if (anchorDoc !== focusDoc) {
      alert("请只在同一章节内高亮！");
      return;
    }

    const range = selection.getRangeAt(0);
    const contentsList = book.rendition.getContents();
    let matchedContents = null;
    for (let contents of contentsList) {
      if (contents.document === iframeWindow.document) {
        matchedContents = contents;
        break;
      }
    }

    // 校验并生成 CFI
    const cfiRange = matchedContents?.cfiFromRange?.(range);
    if (!cfiRange || typeof cfiRange !== "string" || !cfiRange.startsWith("epubcfi(")) {
      alert("无法生成有效的高亮范围，请重新选择文本！");
      return;
    }

    // 计算弹窗位置
    const rect = range.getBoundingClientRect();
    const iframeRect = iframe.getBoundingClientRect();
    const popupWidth = 300; // 弹框的预估宽度
    const popupHeight = 200; // 弹框的预估高度
    const x = iframeRect.left + rect.right + 10;
    const y = iframeRect.top + rect.top;
    
    const adjustedPosition = checkPopupPosition(x, y, popupWidth, popupHeight);
    setPopupPosition(adjustedPosition);
    setHighlightPopup({ cfiRange, text: selectedText });
  }, [book, checkPopupPosition]);

  // =======================
  // 章节渲染事件处理
  // =======================
  const onRendered = useCallback((section) => {
    //console.log("rendered事件触发 当前章节:", section);
    
    // 绑定 mouseup 事件
    const iframe = viewerRef.current?.querySelector("iframe");
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.document.removeEventListener("mouseup", handleMouseUp);
      iframe.contentWindow.document.addEventListener("mouseup", handleMouseUp, { passive: true });
    }
    
    // 重新渲染高亮
    if (book?.rendition?.annotations) {
      Array.from(highlightsMap.values()).forEach((h) => {
        if (isCfiInSection(h.cfiRange, section)) {
          // 兼容历史数据：优先 colorIndex，无则根据 color 查找
          let colorIndex = typeof h.colorIndex === 'number' ? h.colorIndex : highlightColors.findIndex(c => c === h.color);
          if (colorIndex === -1) colorIndex = 0;
          addHighlight(h.cfiRange, colorIndex);
        }
      });
    }
    injectThemeStyleToIframe(theme);
  }, [highlightsMap, book, handleMouseUp, isCfiInSection, addHighlight, highlightColors, injectThemeStyleToIframe, theme]);

  // =======================
  // 高亮操作函数
  // =======================
  const saveHighlights = useCallback(async (newMap) => {
    const highlightArray = Array.from(newMap.values());
    await set(`highlights_${id}`, highlightArray);
    setHighlightsMap(newMap);
    return newMap;
  }, [id]);

  // 删除高亮
  const deleteHighlight = useCallback(async (highlightId) => {
    try {
      const newMap = new Map(highlightsMap);
      const highlight = newMap.get(highlightId);
      
      if (highlight) {
        // 从 Map 中删除
        newMap.delete(highlightId);
        
        // 从渲染中移除
        if (book?.rendition?.annotations) {
          try {
            book.rendition.annotations.remove(highlight.cfiRange, "highlight");
          } catch (e) {
            console.error("强制移除高亮失败:", e);
          }
        }
        
        // 保存更新
        await saveHighlights(newMap);
      }
    } catch (error) {
      console.error("删除高亮失败:", error);
    }
  }, [book, highlightsMap, saveHighlights]);

  // 修改 handleHighlightSubmit 以适配夜间色
  const handleHighlightSubmit = useCallback(async(color, comment, isEdit = false) => {
    let colorIndex = isEdit && editingHighlight
      ? (typeof editingHighlight.colorIndex === 'number' ? editingHighlight.colorIndex : 0)
      : highlightColors.findIndex(c => c === highlightColor);
    if (colorIndex === -1) colorIndex = 0;
    if (isEdit && editingHighlight) {
      const newMap = new Map(highlightsMap);
      const updatedHighlight = {
        ...editingHighlight,
        colorIndex,
        comment
      };
      newMap.set(editingHighlight.id, updatedHighlight);
      saveHighlights(newMap);
      setEditingHighlight(null);
      addHighlight(editingHighlight.cfiRange, colorIndex);
    } else if (highlightPopup) {
      const newHighlight = {
        id: Date.now(),
        cfiRange: highlightPopup.cfiRange,
        text: highlightPopup.text,
        colorIndex,
        comment,
        bookId: id
      };
      const newMap = new Map(highlightsMap);
      newMap.set(newHighlight.id, newHighlight);
      const savedMap = await saveHighlights(newMap);
      addHighlight(newHighlight.cfiRange, colorIndex);
      setHighlightPopup(null);
    setHighlightComment("");
    }
  }, [book, highlightPopup, editingHighlight, highlightsMap, id, saveHighlights, addHighlight, highlightColors, editColor, highlightColor]);

  // =======================
  // 2. 获取书籍文件
  // =======================
  useEffect(() => {
    setLoading(true);
    get("bookshelf").then((books) => {
      const book = books?.find((b) => b.id === Number(id));
      if (book && book.file) {
        setBookFile(book.file);
      } else {
        setBookFile(null);
      }
      setLoading(false);
    });
  }, [id]);

  // =======================
  // 3. 初始化 epub.js 实例
  // =======================
  useEffect(() => {
    if (bookFile && !bookInstance.current) {
      const blob = new Blob([bookFile], { type: "application/epub+zip" });
      try {
        const _book = ePub(blob);
        bookInstance.current = _book;
        setBook(_book);
        
        // 获取书籍元数据
        _book.loaded.metadata.then(meta => {
          setMetadata({
            title: meta.title || "未知书名",
            creator: meta.creator || "未知作者"
          });
        });

        _book.loaded.navigation.then(nav => {
          setToc(nav.toc);
        });
      } catch (e) {
        setBook(null);
        setToc([]);
        setCurrentChapter(null);
      }
    }
    return () => {
      if (bookInstance.current) {
        bookInstance.current.destroy();
        bookInstance.current = null;
      }
    };
  }, [bookFile]);

  // =======================
  // 4. 渲染 epub 到阅读区域（只初始化一次）
  // =======================
  useEffect(() => {
    renderedRef.current = false;
  }, [bookFile]);
  useEffect(() => {
    if (book && viewerRef.current && !renderedRef.current) {
      viewerRef.current.innerHTML = "";
      book.renderTo(viewerRef.current, { 
        width: "100%", 
        height:"100%", 
        flow: "scrolled-continuous",
      });
      renderedRef.current = true;
    }
  }, [book]);

  // =======================
  // 5. 恢复阅读进度（仅执行一次）
  // =======================
  useEffect(() => {
    if (book && toc.length > 0 && !progressRestored) {
      get(`progress_${id}`).then(progress => {
        if (progress && progress.cfi) {
          // 用spine.get(cfi)获取章节href
          let href = toc[0].href;
          try {
            const spineItem = book.spine.get(progress.cfi);
            if (spineItem && spineItem.href) {
              href = spineItem.href;
            }
          } catch (e) {}
          book.rendition.display(href);
          console.log("href:", href);
          setPendingCfi(progress.cfi);
        } else if (toc.length > 0) {
          book.rendition.display(toc[0].href);
        }
        setProgressRestored(true);
      });
    }
  }, [book, toc, id, progressRestored]);

  // 监听rendered事件，渲染完后再跳转到pendingCfi
  useEffect(() => {
    if (!book) return;
    const onRendered = (section) => {
      if (pendingCfi) {
        book.rendition.display(pendingCfi, { offset: 0 });
        setPendingCfi(null); // 只跳转一次
      }
    };
    book.rendition.on('rendered', onRendered);
    return () => {
      if (book && book.rendition && typeof book.rendition.off === "function") {
        book.rendition.off('rendered', onRendered);
      }
    };
  }, [book, pendingCfi]);

  // =======================
  // 6. 监听 relocated 事件，自动保存当前位置和进度
  // =======================
  useEffect(() => {
    if (!book) return;
    const onRelocated = (location) => {
      setCurrentChapter(location.start.href);
      set(`progress_${id}`, {
        chapter: location.start.href,
        cfi: location.start.cfi
      });
      // 计算进度并更新书架
      const idx = spineItems.findIndex(item => item.href === location.start.href);
      let percent = 0;
      if (idx >= 0 && spineItems.length > 0) {
        percent = Math.round(((idx + 1) / spineItems.length) * 100);
      }
      get("bookshelf").then(books => {
        const newBooks = books.map(b =>
          b.id === Number(id)
            ? { ...b, progress: `${percent}%`, lastReadAt: new Date().toISOString() }
            : b
        );
        set("bookshelf", newBooks);
      });
    };
    if (book.rendition) {
      book.rendition.on("relocated", onRelocated);
    }
    return () => {
      try {
        if (book && book.rendition && typeof book.rendition.off === "function") {
          book.rendition.off("relocated", onRelocated);
        }
      } catch (e) {}
    };
  }, [book, spineItems, id]);

  // =======================
  // 7. 章节切换（上一章/下一章）
  // =======================
  const handlePrev = () => {
    const idx = spineItems.findIndex(item => item.href === currentChapter);
    if (idx > 0) {
      book.rendition.display(spineItems[idx - 1].href);
    }
  };
  const handleNext = () => {
    const idx = spineItems.findIndex(item => item.href === currentChapter);
    if (idx < spineItems.length - 1) {
      book.rendition.display(spineItems[idx + 1].href);
    }
  };

  // =======================
  // 8. 
  // =======================
  useEffect(() => {
    if (!book || !highlightsLoaded) return;

    book.rendition.on("rendered", onRendered);

    return () => {
      if (book && book.rendition && typeof book.rendition.off === "function") {
        book.rendition.off("rendered", onRendered);
      }
      
    };
  }, [book, highlightsMap, highlightsLoaded, onRendered]);

  // =======================
  // 9. 加载高亮数据
  // =======================
  useEffect(() => {
    if (!book) return;
    get(`highlights_${id}`).then(data => {
      if (data) {
        // 将数组转换为 Map
        const map = new Map(data.map(h => [h.id, h]));
        setHighlightsMap(map);
      }
      setHighlightsLoaded(true);
    });
  }, [book, id]);

  // =======================
  // 10. 目录拍平工具函数
  // =======================
  function flattenToc(toc, arr = []) {
    toc.forEach(item => {
      arr.push(item);
      if (item.subitems && item.subitems.length > 0) {
        flattenToc(item.subitems, arr);
      }
    });
    return arr;
  }

  // =======================
  // 11. 初始化目录和 spineItems
  // =======================
  useEffect(() => {
    if (book) {
      book.loaded.navigation.then(nav => {
        setToc(nav.toc);
        setTocList(flattenToc(nav.toc));
      });
      setSpineItems(book.spine.spineItems);
    }
  }, [book]);

  // 高亮数据变化时自动滚动
  useEffect(() => {
    if (highlightsListRef.current) {
      highlightsListRef.current.scrollTop = highlightsListRef.current.scrollHeight;
    }
  }, [sortedHighlights]);

  // =======================
  // 12. 监听章节变化并获取内容
  // =======================
  useEffect(() => {
    if (!book || !currentChapter) return;
    
    const getChapterContent = async () => {
      const section = book.spine.get(currentChapter);
      if (section) {
        const content = await section.load();
        const text = content.textContent || "";
        setCurrentChapterContent(text);
      }
    };
    
    getChapterContent();
  }, [book, currentChapter]);

  // =======================
  // 13. 处理全局点击事件
  // =======================
  useEffect(() => {
    const handleGlobalMouseDown = (e) => {
      // 如果弹框存在，且点击不在弹框内，则关闭弹框
      if (highlightPopup) {
        const popupElement = document.querySelector('.highlight-popup');
        if (popupElement && !popupElement.contains(e.target)) {
          setHighlightPopup(null);
          setHighlightComment("");
        }
      }
    };

    document.addEventListener('mousedown', handleGlobalMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown);
    };
  }, [highlightPopup]);

  // =======================
  // 14. 设置全局样式
  // =======================
  useEffect(() => {
    injectThemeStyleToIframe(theme);
  }, [book, theme, injectThemeStyleToIframe]);

  // =======================
  // 进入阅读页时记录开始时间
  // =======================
  useEffect(() => {
    sessionStartRef.current = Date.now();
    return () => {
      handleSessionEnd();
    };
    // eslint-disable-next-line
  }, [id]); // 切换书本时也重新计时

  // 离开页面或切换书本时，统计本次阅读时长
  const handleSessionEnd = async () => {
    const start = sessionStartRef.current;
    if (!start) return;
    const end = Date.now();
    const minutes = Math.floor((end - start) / 60000);
    if (minutes <= 0) return;

    // 1. 处理每日阅读时长
    const today = new Date();
    const dateStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    let daily = (await get('reading_daily_minutes')) || {};
    daily[dateStr] = (daily[dateStr] || 0) + minutes;

    // 保证只保留最近90天
    const allDates = Object.keys(daily).sort();
    if (allDates.length > 90) {
      for (let i = 0; i < allDates.length - 90; i++) {
        delete daily[allDates[i]];
      }
    }
    await set('reading_daily_minutes', daily);

    // 2. 处理总时长
    let total = (await get('reading_total_minutes')) || 0;
    total += minutes;
    await set('reading_total_minutes', total);

    sessionStartRef.current = null;
  };

  // 页面关闭时也要统计
  useEffect(() => {
    const onUnload = () => handleSessionEnd();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
    // eslint-disable-next-line
  }, []);

  // 添加菜单关闭的全局事件监听
  useEffect(() => {
    const handleGlobalClick = (event) => {
      if (openMenuId) {
        const menu = document.getElementById(`highlight-menu-${openMenuId}`);
        const handle = document.querySelector(`[data-highlight-id="${openMenuId}"]`);
        if (menu && !menu.contains(event.target) && !handle?.contains(event.target)) {
          menu.remove();
          setOpenMenuId(null);
        }
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [openMenuId]);

  // =======================
  // 3. 所有条件 return 必须在所有 Hook 之后
  // =======================
  if (loading) return <div>加载中...</div>;
  if (!bookFile) return <div>未找到该书籍或文件数据异常。</div>;

  // =======================
  // 4. 正常 return 渲染
  // =======================
  return (
    <div className={`w-full h-screen min-h-0 bg-gray-50 flex flex-col theme-${theme}`}> 
      <div className="flex flex-1 flex-col md:flex-row gap-6 py-6 px-2 md:px-8 h-full min-h-0">
        {/* 阅读区卡片 */}
        <div className={`flex-1 rounded-xl shadow p-6 mb-4 md:mb-0 flex flex-col min-w-0 h-full ${theme === 'dark' ? 'bg-[#23272f]' : 'bg-white'}`}>
        {/* 顶部导航 */}
          <div className="flex items-center mb-4">
          <Link to="/" className="p-2 hover:bg-gray-100 rounded-full mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold py-2">{metadata.title}</h1>
              <p className="text-sm creator-text">{metadata.creator}</p>
          </div>
            {/* 主题切换按钮 */}
            <div className="flex gap-2 ml-4">
              <button
                className={`p-1 rounded-full border ${theme === 'light' ? 'bg-yellow-100 border-yellow-300 ring-2 ring-yellow-300' : 'bg-white border-gray-200'} hover:bg-yellow-200 transition`}
                title="日间模式"
                onClick={() => setThemeAndStore('light')}
                style={{ outline: theme === 'light' ? '2px solid #ffe066' : 'none' }}
              >
                <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="5" stroke="currentColor" fill="currentColor" fillOpacity="0.7" />
                  <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </button>
              <button
                className={`p-1 rounded-full border ${theme === 'dark' ? 'bg-gray-800 border-gray-700 ring-2 ring-blue-400' : 'bg-white border-gray-200'} hover:bg-gray-700 hover:bg-opacity-20 transition`}
                title="夜间模式"
                onClick={() => setThemeAndStore('dark')}
                style={{ outline: theme === 'dark' ? '2px solid #60a5fa' : 'none' }}
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                </svg>
              </button>
        </div>
          </div>
        {/* 章节列表 */}
          <div className="mb-4">
          <select
            value={currentChapter || ""}
            onChange={e => book && book.rendition.display(e.target.value)}
              className="w-full border rounded px-2 py-1 chapter-select"
          >
            {spineItems.map((item, idx) => {
              const tocItem = tocList.find(t => t.href === item.href);
              let label = tocItem?.label;
              if (!label || label.trim() === "") {
                label = `第${idx + 1}章`;
              }
              return (
                <option key={item.href} value={item.href}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
        {/* 阅读区域 */}
          <div className="flex-1 relative min-h-0 read-area-bg flex items-stretch h-0">
          {/* 上一章按钮 */}
          <button 
            onClick={handlePrev}
              className="w-10 h-full flex items-center justify-center nav-btn rounded-l-lg hover:bg-gray-100 p-0 m-0"
              style={{padding:0,margin:0}}
          >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {/* 阅读内容区域 */}
          <div
            ref={viewerRef}
              className="flex-1 custom-scrollbar read-content-bg"
            style={{
              height: "100%",
                minHeight: 0,
              overflowY: "auto",
                overflowX: "hidden"
            }}
          />
          {/* 下一章按钮 */}
          <button 
            onClick={handleNext}
              className="w-10 h-full flex items-center justify-center nav-btn rounded-r-lg hover:bg-gray-100 p-0 m-0"
              style={{padding:0,margin:0}}
          >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
        {/* 工具区卡片 */}
        <div className={`w-full md:w-[380px] flex-shrink-0 rounded-xl shadow p-6 flex flex-col min-w-0 h-full ${theme === 'dark' ? 'bg-[#23272f]' : 'bg-white'}`}>
        {/* Tab 切换 */}
          <div className="flex border-b right-tool-tab-bar h-14 items-center">
          <button
              className={`flex-1 h-full flex items-center justify-center text-center right-tool-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            AI摘要
          </button>
          <button
              className={`flex-1 h-full flex items-center justify-center text-center right-tool-tab-btn ${activeTab === 'highlights' ? 'active' : ''}`}
            onClick={() => setActiveTab('highlights')}
          >
            高亮标注
          </button>
            <button
              className={`flex-1 h-full flex items-center justify-center text-center right-tool-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              AI对话
          </button>
        </div>
        {/* Tab 内容区域 */}
          <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'summary' ? (
              <div className="custom-scrollbar h-full flex flex-col">
              <AISummary
                bookId={id}
                chapterId={currentChapter}
                chapterContent={currentChapterContent}
                  theme={theme}
                  title={metadata.title}
                />
              </div>
            ) : activeTab === 'chat' ? (
              <div className="custom-scrollbar h-full flex flex-col">
                <AIChat
                  bookId={id}
                  chapterId={currentChapter}
                  theme={theme}
                  title={metadata.title}
                  author={metadata.creator}
                  chatMessages={chatMessages}
                  setChatMessages={setChatMessages}
              />
            </div>
          ) : (
              <div className="custom-scrollbar h-full flex flex-col">
                <div className="p-2 overflow-auto highlight-list-bg" ref={highlightsListRef}>
              {sortedHighlights.length === 0 ? (
                <div className="text-gray-400">暂无高亮</div>
              ) : (
                    sortedHighlights.map((h, idx) => (
                  <div 
                    key={h.id} 
                    ref={el => highlightRefs.current[h.id] = el}
                        className="mb-3 p-2 rounded relative highlight-item-bg group cursor-pointer"
                        style={{ 
                          background: highlightColors[typeof h.colorIndex === 'number' ? h.colorIndex : 0] + (theme === 'dark' ? 50 : 90),
                        }}
                        onClick={async () => {
                          if (!book) return;
                          try {
                            await book.rendition.display(h.cfiRange);
                            const waitForLoad = new Promise(resolve => {
                              const checkLoad = () => {
                                const iframe = viewerRef.current?.querySelector("iframe");
                                if (iframe?.contentDocument?.readyState === 'complete') {
                                  resolve();
                                } else {
                                  requestAnimationFrame(checkLoad);
                                }
                              };
                              checkLoad();
                            });
                            await waitForLoad;
                            await book.rendition.display(h.cfiRange);
                          } catch (e) {
                            console.error("跳转失败:", e);
                          }
                        }}
                  >
                    <style>{`
                      .highlight-focus-animation {
                            animation: highlightFocus 0.7s ease;
                      }
                      @keyframes highlightFocus {
                            0% { background: ${highlightColors[typeof h.colorIndex === 'number' ? h.colorIndex : 0]}, opacity: 0; }
                            30% { background: rgba(0,0,0,0.5); }
                            100% { background: ${highlightColors[typeof h.colorIndex === 'number' ? h.colorIndex : 0]}, opacity: 0; }
                          }
                          .menu-handle {
                            opacity: 0;
                            transition: opacity 0.2s ease;
                            position: absolute;
                            right: 8px;
                            top: 50%;
                            transform: translateY(-50%);
                            width: 24px;
                            height: 24px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 4px;
                          }
                          .menu-handle:hover {
                            background-color: rgba(0, 0, 0, 0.05);
                          }
                          .group:hover .menu-handle {
                            opacity: 1;
                          }
                          .highlight-menu {
                            position: fixed;
                            background: ${theme === 'dark' ? '#374151' : 'white'};
                            border: 1px solid ${theme === 'dark' ? '#4B5563' : '#E5E7EB'};
                            border-radius: 6px;
                            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                            z-index: 9999;
                            min-width: 100px;
                            overflow: hidden;
                          }
                          .menu-item {
                            padding: 8px 12px;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            cursor: pointer;
                            transition: background-color 0.2s;
                            font-size: 14px;
                          }
                          .menu-item:hover {
                            background-color: ${theme === 'dark' ? '#4B5563' : '#F3F4F6'};
                          }
                          .menu-item.delete {
                            color: #EF4444;
                          }
                          .menu-item.delete:hover {
                            background-color: #FEE2E2;
                      }
                    `}</style>
                        {/* 文本内容区域 */}
                        <div className="text-sm select-text pr-8" onMouseDown={e => e.stopPropagation()}>
                          {h.text}
                        </div>
                        {h.comment && (
                          <div 
                            className="text-xs mt-1 highlight-comment-text select-text pr-8" 
                            onMouseDown={e => e.stopPropagation()}
                          >
                            批注：{h.comment}
                          </div>
                        )}
                        {/* 菜单把手 */}
                        <div 
                          className="menu-handle"
                          data-highlight-id={h.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            
                            // 如果有其他打开的菜单，先关闭
                            if (openMenuId && openMenuId !== h.id) {
                              const oldMenu = document.getElementById(`highlight-menu-${openMenuId}`);
                              if (oldMenu) {
                                oldMenu.remove();
                              }
                            }

                            const menuId = `highlight-menu-${h.id}`;
                            const existingMenu = document.getElementById(menuId);
                            
                            if (existingMenu) {
                              existingMenu.remove();
                              setOpenMenuId(null);
                            } else {
                              const menu = document.createElement('div');
                              menu.id = menuId;
                              menu.className = 'highlight-menu';
                              
                              // 计算菜单位置
                              const handleRect = e.currentTarget.getBoundingClientRect();
                              const menuTop = handleRect.top;
                              const menuLeft = handleRect.left - 100; // 菜单宽度为100px
                              
                              menu.style.position = 'fixed';
                              menu.style.top = `${menuTop}px`;
                              menu.style.left = `${menuLeft}px`;
                              
                              menu.innerHTML = `
                                <div class="menu-item" data-action="edit">
                                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  编辑
                                </div>
                                <div class="menu-item delete" data-action="delete">
                                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  删除
                                </div>
                              `;
                              
                              menu.addEventListener('click', (menuEvent) => {
                                menuEvent.stopPropagation();
                                const action = menuEvent.target.closest('.menu-item')?.dataset.action;
                                if (action === 'edit') {
                          setEditingHighlight({
                            ...h,
                            centered: true
                          });
                                  setEditColor(highlightColors[typeof h.colorIndex === 'number' ? h.colorIndex : 0]);
                          setEditComment(h.comment || "");
                                } else if (action === 'delete') {
                                  setHighlightToDelete(h.id);
                                }
                                menu.remove();
                                setOpenMenuId(null);
                              });
                              
                              document.body.appendChild(menu);
                              setOpenMenuId(h.id);
                            }
                          }}
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                    </div>
                  </div>
                ))
              )}
                </div>
            </div>
          )}
        </div>
      </div>
      </div>
      {/* 删除确认对话框 */}
      {highlightToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="rounded-lg p-6 shadow-xl max-w-sm w-full mx-4 popup-bg">
            <h3 className="text-lg font-semibold mb-4">确认删除</h3>
            <p className="mb-6 popup-desc-text">确定要删除这条高亮标注吗？此操作不可恢复。</p>
            <div className="flex justify-end gap-4">
              <button
                className="px-4 py-2 rounded popup-cancel-btn"
                onClick={() => setHighlightToDelete(null)}
              >
                取消
              </button>
              <button
                className="px-4 py-2 rounded popup-confirm-btn"
                onClick={async () => {
                  await deleteHighlight(highlightToDelete);
                  setHighlightToDelete(null);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 统一的高亮弹框 */}
      {(highlightPopup || editingHighlight) && (
        <div 
          ref={popupRef}
          className="fixed z-50 border-2 rounded shadow-xl p-4 cursor-move highlight-popup popup-bg"
          style={{
            left: editingHighlight?.centered ? '50%' : popupPosition.x,
            top: editingHighlight?.centered ? '33%' : popupPosition.y,
            transform: editingHighlight?.centered ? 'translate(-50%, -50%)' : 'none',
            userSelect: 'none',
            width: '300px'
          }}
          onMouseDown={(e) => {
            // 如果点击的是功能性组件，不触发拖拽
            if (
              e.target.tagName.toLowerCase() === 'textarea' || 
              e.target.tagName.toLowerCase() === 'button' ||
              e.target.closest('button') // 处理按钮内的svg图标
            ) {
              return;
            }
            
            e.stopPropagation();
            const popupElement = popupRef.current;
            const popupRect = popupElement.getBoundingClientRect();
            const currentX = editingHighlight 
              ? popupRect.left 
              : popupPosition.x;
            const currentY = editingHighlight
              ? popupRect.top
              : popupPosition.y;
            const startX = e.pageX - currentX;
            const startY = e.pageY - currentY;
            const handleMouseMove = (moveEvent) => {
              const newPosition = checkPopupPosition(
                moveEvent.pageX - startX,
                moveEvent.pageY - startY,
                popupRect.width,
                popupRect.height
              );
              setPopupPosition(newPosition);
              if (editingHighlight) {
                setEditingHighlight(prev => ({
                  ...prev,
                  centered: false
                }));
              }
            };
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div className="flex gap-2 my-2">
            {highlightColors.map((color, idx) => (
              <button
                key={color}
                style={{
                  background: color,
                  width: 32,
                  height: 32,
                  border: ((editingHighlight ? (typeof editingHighlight.colorIndex === 'number' ? editingHighlight.colorIndex : 0) : highlightColors.findIndex(c => c === highlightColor)) === idx)
                    ? (theme === 'dark' ? '2px solid #fff' : '2px solid #333')
                    : (theme === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb'),
                  borderRadius: 4,
                  cursor: "pointer"
                }}
                onClick={() => editingHighlight 
                  ? setEditingHighlight({ ...editingHighlight, colorIndex: idx })
                  : setHighlightColor(color)
                }
              />
            ))}
          </div>
          <div className="mt-2">
            <textarea
              value={editingHighlight ? editComment : highlightComment}
              onChange={e => {
                if (e.target.value.length <= 300) {
                  editingHighlight 
                    ? setEditComment(e.target.value)
                    : setHighlightComment(e.target.value);
                }
              }}
              rows={3}
              className="custom-scrollbar border rounded px-2 py-1 w-full popup-textarea outline-none"
              maxLength={300}
              placeholder="请输入批注（可选）"
            />
            <div className="text-xs text-right popup-textarea-count">
              {(editingHighlight ? editComment : highlightComment).length}/300
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="px-2 py-1 rounded popup-confirm-btn"
              onClick={() => handleHighlightSubmit(
                editingHighlight ? editColor : highlightColor,
                editingHighlight ? editComment : highlightComment,
                !!editingHighlight
              )}
            >确认</button>
            <button 
              className="px-2 py-1 rounded popup-cancel-btn"
              onClick={() => {
                if (editingHighlight) {
                  setEditingHighlight(null);
                  setEditColor('#ffe066');
                  setEditComment("");
                } else {
                  setHighlightPopup(null);
                  setHighlightComment("");
                }
              }}
            >取消</button>
          </div>
        </div>
      )}
    </div>
  );
}