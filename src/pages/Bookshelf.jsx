import React from "react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { get, set } from "idb-keyval";
import ePub from "epubjs";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function Bookshelf() {
  const [books, setBooks] = useState([]);
  const [bookToDelete, setBookToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = React.useRef();

  // 新增：阅读时长数据
  const [dailyMinutes, setDailyMinutes] = useState({});
  const [totalMinutes, setTotalMinutes] = useState(0);

  // 组件加载时读取本地书架和阅读时长
  useEffect(() => {
    get("bookshelf").then((data) => {
      if (Array.isArray(data)) setBooks(data);
      else setBooks([]);
    }).catch(err => {
      setBooks([]);
    });
    // 读取阅读时长数据
    get("reading_daily_minutes").then(data => {
      setDailyMinutes(data || {});
    });
    get("reading_total_minutes").then(data => {
      setTotalMinutes(data || 0);
    });
  }, []);

  const navigate = useNavigate();

  // 统计已读书籍数量
  const readCount = books.filter(book => book.progress === "100%").length;

  // 统计最近阅读书籍
  const lastReadBook = books.reduce((acc, book) => {
    if (!book.lastReadAt) return acc;
    if (!acc || new Date(book.lastReadAt) > new Date(acc.lastReadAt)) return book;
    return acc;
  }, null);

  // 上传文件
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith(".epub")) {
      alert("只支持epub格式文件！");
      return;
    }
    const blob = file;
    const book = ePub(blob);

    // 1. 先获取元数据
    book.loaded.metadata.then(meta => {
      // 2. 再获取封面id
      book.loaded.cover.then(coverId => {
        if (coverId) {
          // 3. 用 coverId 获取封面图片的url
          getCoverBase64(book, coverId).then(coverBase64 => {
            saveBook(meta, coverBase64);
          }).catch(() => {
            saveBook(meta, null);
          });
        } else {
          saveBook(meta, null);
        }
      });
    });

    function getCoverBase64(book, coverId) {
      return book.archive.getBlob(coverId)
        .then(blob => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result); // base64字符串
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        });
    }

    function saveBook(meta, coverBase64) {
      const newBook = {
        id: Date.now(),
        title: meta.title || file.name,
        author: meta.creator || "未知",
        cover: coverBase64 || "https://iph.href.lu/80x120?text=%E5%B0%81%E9%9D%A2",
        progress: "0%",
        file: blob,
      };
      const newBooks = [newBook, ...books];
      setBooks(newBooks);
      set("bookshelf", newBooks);
    }
  };

  // 删除书籍
  const handleDelete = (id) => {
    const newBooks = books.filter((book) => book.id !== id);
    setBooks(newBooks);
    set("bookshelf", newBooks);
  };

  // 处理搜索
  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
  };

  // 根据搜索关键词过滤图书
  const filteredBooks = books.filter(book => {
    const query = searchQuery.toLowerCase();
    return book.title.toLowerCase().includes(query) || 
           book.author.toLowerCase().includes(query);
  });

  // 1. 获取firstDayOfWeek
  let firstDayOfWeek = 1; // 默认周一
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
  if (locale.startsWith('en-US')) firstDayOfWeek = 0; // 美国为周日
  // ...可扩展更多规则

  const lastDayOfWeek = (firstDayOfWeek + 6) % 7;

  const totalCols = 48, totalRows = 7;

  const today = new Date();
  const todayDay = today.getDay();
  const daysToLastDay = (lastDayOfWeek - todayDay + 7) % 7;
  const rightBottomDate = new Date(today);
  rightBottomDate.setDate(today.getDate() + daysToLastDay);
  const leftTopDate = new Date(rightBottomDate);
  leftTopDate.setDate(rightBottomDate.getDate() - (totalCols * totalRows - 1));

  // 星期标签（本地化顺序）
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = (firstDayOfWeek + i) % 7;
    weekDays.push(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <img src="/icon48.png" alt="图书" className="text-2xl font-bold text-yellow-500" />
        <h1 className="ml-4 text-2xl font-bold">我的书架</h1>
          </div>
        <button 
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
          onClick={() => navigate('/settings')}
            title="设置"
          >
          <svg t="1746452545874" className="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3515" width="32" height="32"><path d="M396.72 320.592a141.184 141.184 0 0 1-99.824 15.92 277.648 277.648 0 0 0-45.344 74.576 141.216 141.216 0 0 1 37.52 95.952 141.248 141.248 0 0 1-41.728 100.32 274.4 274.4 0 0 0 49.952 86.224 141.264 141.264 0 0 1 107.168 14.176 141.216 141.216 0 0 1 63.984 79.296 274.72 274.72 0 0 0 86.816-1.92 141.248 141.248 0 0 1 66.016-86.304 141.216 141.216 0 0 1 101.856-15.488 277.648 277.648 0 0 0 41.92-76.544 141.184 141.184 0 0 1-36.128-94.4c0-34.912 12.768-67.68 34.816-92.96a274.736 274.736 0 0 0-38.192-70.032 141.264 141.264 0 0 1-105.792-14.56 141.312 141.312 0 0 1-67.168-90.912 274.4 274.4 0 0 0-92.784 0.016 141.152 141.152 0 0 1-63.088 76.64z m22.56-116.656c57.312-16 119.024-16.224 178.016 1.216a93.44 93.44 0 0 0 142.288 86.736 322.64 322.64 0 0 1 79.104 142.656 93.328 93.328 0 0 0-41.76 77.84 93.36 93.36 0 0 0 42.88 78.592 322.832 322.832 0 0 1-34.208 85.232 323.392 323.392 0 0 1-47.968 63.568 93.392 93.392 0 0 0-92.352 0.64 93.408 93.408 0 0 0-46.688 83.616 322.704 322.704 0 0 1-171.424 3.84 93.376 93.376 0 0 0-46.704-78.544 93.408 93.408 0 0 0-95.184 1.008A322.432 322.432 0 0 1 192 589.28a93.408 93.408 0 0 0 49.072-82.24c0-34.128-18.304-64-45.632-80.288a323.392 323.392 0 0 1 31.088-73.328 322.832 322.832 0 0 1 56.704-72.256 93.36 93.36 0 0 0 89.488-2.144 93.328 93.328 0 0 0 46.56-75.088z m92.208 385.28a68.864 68.864 0 1 0 0-137.76 68.864 68.864 0 0 0 0 137.76z m0 48a116.864 116.864 0 1 1 0-233.76 116.864 116.864 0 0 1 0 233.76z" p-id="3516"></path></svg>          
        </button>
      </div>
      </header>

      <main className="flex-1 w-full">
        <div className="w-full max-w-5xl mx-auto mt-4">
          {/* 成就显示区域 - 仿Dashboard热力图卡片 */}
          <section className="w-full mb-3">
            <div className="bg-white rounded-xl shadow p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold text-lg mb-1">阅读时长分布</div>
                  <div className="text-gray-500 text-sm">过去12个月的阅读时长分布</div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-xs text-gray-400 mb-1">阅读总时长</div>
                  <div className="text-2xl font-bold text-yellow-500">{totalMinutes} <span className="text-base text-gray-600 font-normal">分钟</span></div>
                </div>
              </div>
              {/* 热力图结构重构 */}
              <div className="heatmap-container w-full mt-4">
                {/* 月份标签区 */}
                <div
                  className="mb-1 text-xs text-gray-400 select-none w-full"
                  style={{ display: 'grid', gridTemplateColumns: `repeat(${totalCols}, 1fr)`, gap: '2px' }}
                >
                  {Array.from({ length: totalCols }).map((_, colIdx) => {
                    let monthLabel = '';
                    for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
                      const date = new Date(leftTopDate);
                      date.setDate(leftTopDate.getDate() + colIdx * 7 + rowIdx);
                      if (date.getDate() === 1) {
                        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        monthLabel = monthNames[date.getMonth()];
                        break;
                      }
                    }
                    return (
                      <div key={colIdx} className="text-center" style={{height: 16}}>
                        {monthLabel}
                      </div>
                    );
                  })}
                </div>
                {/* 星期标签+格子区 */}
                <div className="flex w-full">
                  {/* 星期标签（本地化顺序） */}
                  <div className="flex flex-col justify-between h-[112px] mr-2 text-xs text-gray-400 select-none min-w-[28px]" style={{height: 112}}>
                    {weekDays.map((d, i) => (
                      (i === 0 || i === 3 || i === 6) ? (
                        <span key={d} className="h-4 flex items-center" style={{height: 16, marginTop: i === 3 ? 32 : i === 6 ? 32 : 0}}>{d}</span>
                      ) : null
                    ))}
                  </div>
                  {/* 格子区 */}
                  <div
                    className="w-full"
                    style={{ display: 'grid', gridTemplateColumns: `repeat(${totalCols}, 1fr)`, gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`, gap: '2px', height: 112 }}
                  >
                    {Array.from({ length: totalRows }).map((_, rowIdx) => (
                      Array.from({ length: totalCols }).map((_, colIdx) => {
                        const date = new Date(leftTopDate);
                        date.setDate(leftTopDate.getDate() + colIdx * 7 + rowIdx);
                        const dateStr = date.toISOString().slice(0, 10);
                        const minutes = dailyMinutes?.[dateStr] || 0;
                        let color = 'bg-gray-100';
                        if (minutes > 0 && minutes <= 10) color = 'bg-yellow-100';
                        if (minutes > 10 && minutes <= 30) color = 'bg-yellow-300';
                        if (minutes > 30) color = 'bg-yellow-500';
                        return (
                          <div
                            key={rowIdx + '-' + colIdx}
                            className={`w-4 h-4 rounded-[3px] ${color} cursor-pointer border border-white transition duration-150`}
                            title={`${dateStr}：${minutes}分钟`}
                          />
                        );
                      })
                    ))}
                  </div>
                </div>
                {/* 图例 */}
                <div className="flex items-center gap-1 mt-2 justify-end text-xs text-gray-400 select-none w-full">
                  <span>Less</span>
                  <span className="w-4 h-4 bg-gray-200 rounded-md border inline-block"></span>
                  <span className="w-4 h-4 bg-yellow-100 rounded-md border inline-block"></span>
                  <span className="w-4 h-4 bg-yellow-300 rounded-md border inline-block"></span>
                  <span className="w-4 h-4 bg-yellow-500 rounded-md border inline-block"></span>
                  <span>More</span>
                </div>
              </div>
            </div>
          </section>

          {/* 统计卡片区 */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-6 px-0 py-3">
            <div className="bg-white rounded-lg shadow p-4 flex flex-col items-start md:col-span-1">
              <div className="text-gray-500 mb-2">总书籍数</div>
              <div className="text-3xl font-bold">{books.length}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 flex flex-col items-start md:col-span-1">
              <div className="text-gray-500 mb-2">已读书籍</div>
              <div className="text-3xl font-bold">{readCount}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 flex flex-col justify-between md:col-span-2">
              <div className="flex items-center justify-between w-full">
                <div>
                  <div className="text-gray-500 mb-2">最近阅读</div>
                  {lastReadBook ? (
                    <>
                      <div className="text-lg font-semibold">{lastReadBook.title}</div>
                      <div className="text-sm text-gray-400 mt-1">进度：{lastReadBook.progress}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-semibold">--</div>
                      <div className="text-sm text-gray-400 mt-1">--</div>
                    </>
                  )}
                </div>
                {lastReadBook && (
                  <button
                    className="ml-4 px-6 py-2 rounded bg-yellow-400 text-white hover:bg-yellow-500 text-base font-semibold shadow"
                    style={{ minWidth: 100 }}
                    onClick={() => navigate(`/reader/${lastReadBook.id}`)}
                  >去阅读</button>
                )}
              </div>
            </div>
          </section>

          {/* 书籍网格区 */}
          <section className="w-full">
            {/* 工具栏 */}
            <div className="flex justify-between items-center mb-2 w-full">
              <div className="flex items-center gap-4">
                <button
                  className="bg-yellow-400 hover:bg-yellow-500 text-white px-4 py-2 rounded font-semibold shadow"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  导入书籍
                </button>
          <input
            type="file"
            accept=".epub"
                  ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
          />
          </div>
              <input
                type="text"
                placeholder="搜索书籍..."
                className="border rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                style={{ minWidth: 200 }}
                value={searchQuery}
                onChange={handleSearch}
              />
      </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full">
              {filteredBooks.length === 0 ? (
                <div className="col-span-full text-center text-gray-400 py-8">
                  {searchQuery ? "未找到相关书籍" : "暂无书籍，请导入电子书"}
                </div>
              ) : (
                filteredBooks.map((book) => (
                  <div key={book.id} className="bg-white rounded-lg shadow-sm p-2 flex flex-col items-center transition-transform duration-200 hover:shadow-lg hover:-translate-y-1 min-h-[250px] group">
            <img
              src={book.cover}
              alt="封面"
                      className="w-[90px] h-[130px] object-cover rounded mb-2 border shadow-sm"
                    />
                    <div className="font-semibold text-center truncate w-full text-base mt-1" title={book.title}>{book.title}</div>
                    <div className="text-xs text-gray-500 truncate w-full text-center" title={book.author}>{book.author}</div>
                    <div className="text-xs text-gray-400 mt-1 mb-2">进度：{book.progress || '0%'}</div>
                    <div className="flex gap-2 w-full justify-center mt-auto mb-1">
                      <button className="text-blue-500 hover:underline text-xs px-1 py-0.5" onClick={() => navigate(`/reader/${book.id}`)}>阅读</button>
                      <button className="text-green-500 hover:underline text-xs px-1 py-0.5" onClick={async () => {
                        // 1. 获取书籍信息
                        const bookId = book.id;
                        const title = book.title.replace(/[\\/:*?"<>|]/g, '');
                        const author = book.author.replace(/[\\/:*?"<>|]/g, '');
                        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
                        const epubName = `《${title}》（${author}）.epub`;
                        const summaryName = `《${title}》-摘要.md`;
                        const highlightsName = `《${title}》-批注.md`;
                        const aiChatName = `《${title}》-AI-Chat.md`;
                        const zipName = `《${title}》（${dateStr}）.zip`;
                        // 2. 获取epub文件
                        const epubBlob = book.file;
                        // 3. 获取概要
                        let summaryMarkdown = '';
                        function shiftHeadingLevel(md) {
                          // 只将H1和H2标题降级为H3/H4，H3及以下不变
                          return md.replace(/^(#{1,2})([^#\n].*)/gm, (m, hashes, rest) => {
                            let newHashes = hashes + '#'.repeat(3 - hashes.length);
                            // 最多6级
                            if (newHashes.length > 6) newHashes = '######';
                            return newHashes + rest;
                          });
                        }
                        try {
                          const summaries = await get(`summaries_${bookId}`) || {};
                          summaryMarkdown = `# 《${book.title}》摘要\n\n`;
                          for (const [chapterId, summary] of Object.entries(summaries)) {
                            summaryMarkdown += `## 章节 ${chapterId}\n`;
                            summaryMarkdown += shiftHeadingLevel(summary) + '\n\n';
                          }
                        } catch (e) {
                          summaryMarkdown = '暂无概要';
                        }
                        // 4. 获取高亮和批注
                        let highlightsMd = '';
                        try {
                          const highlights = await get(`highlights_${bookId}`) || [];
                          highlightsMd = `# 《${book.title}》高亮与批注\n\n`;
                          highlights.forEach((h, idx) => {
                            highlightsMd += `- **高亮**: ${h.text || ''}\n`;
                            if (h.comment) highlightsMd += `  - 批注: ${h.comment}\n`;
                            if (h.chapterTitle) highlightsMd += `  - 章节: ${h.chapterTitle}\n`;
                            highlightsMd += '\n';
                          });
                        } catch (e) {
                          highlightsMd = '暂无高亮与批注';
                        }
                        // 5. 获取AI Chat固定记录
                        let aiChatMd = '';
                        try {
                          const pinnedMsgsData = JSON.parse(localStorage.getItem('pinnedMessagesData') || '[]');
                          const aiMsgs = pinnedMsgsData.filter(m => String(m.bookId) === String(bookId));
                          if (aiMsgs.length > 0) {
                            aiMsgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                            aiChatMd = `# AI Chat 固定记录\n\n`;
                            aiMsgs.forEach(m => {
                              aiChatMd += `**${m.role === 'user' ? '用户' : 'AI'}** ${m.timestamp ? `(${m.timestamp})` : ''}:\n`;
                              aiChatMd += `${m.content}\n\n`;
                            });
                          } else {
                            aiChatMd = '暂无AI Chat固定记录';
                          }
                        } catch (e) {
                          aiChatMd = '暂无AI Chat固定记录';
                        }
                        // 6. 打包zip
                        const zip = new JSZip();
                        zip.file(epubName, epubBlob);
                        zip.file(summaryName, summaryMarkdown);
                        zip.file(highlightsName, highlightsMd);
                        zip.file(aiChatName, aiChatMd);
                        const zipBlob = await zip.generateAsync({type:'blob'});
                        saveAs(zipBlob, zipName);
                      }}>导出</button>
                      <button
                        className="text-red-500 hover:text-red-700 focus:outline-none"
                        style={{ background: 'none', border: 'none', padding: 0 }}
                        onClick={() => setBookToDelete(book.id)}
                        title="删除"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M3 6h18" strokeLinecap="round" />
                          <rect x="5" y="6" width="14" height="13" rx="2" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
              </div>
          </section>
              </div>
      </main>

      {/* 删除确认对话框 */}
      {bookToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">确认删除</h3>
            <p className="text-gray-600 mb-6">确定要删除这本书吗？此操作不可恢复。</p>
            <div className="flex justify-end gap-4">
              <button
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                onClick={() => setBookToDelete(null)}
              >
                取消
              </button>
              <button
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                onClick={() => {
                  handleDelete(bookToDelete);
                  setBookToDelete(null);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
      </div>
      )}
    </div>
  );
}