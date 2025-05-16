import { useState, useEffect, useRef } from "react";
import { get, set } from "idb-keyval";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import AIChat from "./AIChat";

// 初始化 mermaid
mermaid.initialize({
  startOnLoad: true,
  theme: 'default',
  securityLevel: 'loose',
});

// 提取纯文本内容的函数
const extractPlainText = (htmlContent) => {
  if (!htmlContent) return "";
  
  // 创建临时div来解析HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  
  // 获取纯文本内容
  let text = tempDiv.textContent || tempDiv.innerText;
  
  // 移除多余空白字符
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
};

// 自定义组件用于渲染 mermaid 图表
const Mermaid = ({ chart }) => {
  const mermaidRef = useRef(null);
  
  useEffect(() => {
    if (mermaidRef.current) {
      mermaidRef.current.innerHTML = chart;
      mermaid.contentLoaded();
    }
  }, [chart]);
  
  return <div ref={mermaidRef} className="mermaid" />;
};

export default function AISummary({ 
  bookId, 
  chapterId, 
  chapterContent,
  theme = 'light',
  title = '',
  author = '',
  showChat = false,
  colors = {
    light: {
      aiBg: '#fff',
      text: '#2c3e50',
      border: '#e5e7eb',
      button: '#f9f9f9',
    },
    dark: {
      aiBg: '#23272f',
      text: '#e5e7eb',
      border: '#374151',
      button: '#23272f',
    }
  }[theme]
}) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [minContentLength, setMinContentLength] = useState(100);
  const [abortController, setAbortController] = useState(null);
  const navigate = useNavigate();
  
  // 用于跟踪当前正在生成的章节
  const currentGeneratingChapter = useRef(null);
  
  // 加载已存在的summary
  useEffect(() => {
    const loadSummary = async () => {
      // 如果正在生成其他章节的摘要，则停止生成
      if (currentGeneratingChapter.current && currentGeneratingChapter.current !== chapterId) {
        setLoading(false);
        currentGeneratingChapter.current = null;
      }
      
      const summaries = await get(`summaries_${bookId}`) || {};
      if (summaries[chapterId]) {
        setSummary(summaries[chapterId]);
      } else {
        setSummary('当前没有摘要，点击"生成"按钮生成摘要');
      }
    };
    loadSummary();
    
    // 清理函数，在组件卸载或章节切换时调用
    return () => {
      if (currentGeneratingChapter.current === chapterId) {
        setLoading(false);
        currentGeneratingChapter.current = null;
      }
    };
  }, [bookId, chapterId]);

  // 检查AI配置和加载设置
  useEffect(() => {
    const checkAiConfig = async () => {
      const config = await get("openai_config") || {};
      setAiConfigured(
        Boolean(config.baseUrl && config.apiKey && config.model)
      );
      
      // 加载最新的提示词和最小内容长度
      const prompt = await get("summary_prompt") || "请总结这段内容的主要观点：";
      setCurrentPrompt(prompt);
      
      const minLength = await get("min_content_length") || 100;
      setMinContentLength(minLength);
    };
    checkAiConfig();
  }, []);

  // 生成摘要
  const generateSummary = async (plainText) => {
    if (!aiConfigured || !plainText) return;
    
    // 检查章节内容长度
    if (plainText.length < minContentLength) {
      setSummary(`章节内容过短（${plainText.length}字），需要至少${minContentLength}字才能生成摘要`);
      return;
    }
    
    // 设置当前正在生成的章节
    currentGeneratingChapter.current = chapterId;
    setLoading(true);
    
    try {
      // 创建新的 AbortController
      const controller = new AbortController();
      setAbortController(controller);
      
      // 获取API配置
      const config = await get("openai_config");
      if (!config?.baseUrl || !config?.apiKey) {
        return;
      }

      // 获取最新的提示词
      const prompt = await get("summary_prompt") || "请总结这段内容的主要观点：";
      setCurrentPrompt(prompt);
      
      // 调用API
      const response = await fetch(
        `${config.baseUrl}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              {
                role: "system",
                content: "你是一个专业的文章摘要助手。请使用markdown格式输出摘要，可以包含表格、列表、代码块等格式。如果内容适合用图表展示，可以使用mermaid语法创建图表。"
              },
              {
                role: "user",
                content: `${prompt}\n\n${plainText}`
              }
            ]
          }),
          signal: controller.signal // 添加 signal
        }
      );

      // 检查是否已经切换到其他章节
      if (currentGeneratingChapter.current !== chapterId) {
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || "生成摘要失败");
      }

      const newSummary = data.choices[0].message.content;
      setSummary(newSummary);

      // 再次检查是否已经切换到其他章节
      if (currentGeneratingChapter.current !== chapterId) {
        return;
      }

      // 保存到本地
      const summaries = await get(`summaries_${bookId}`) || {};
      summaries[chapterId] = newSummary;
      await set(`summaries_${bookId}`, summaries);

    } catch (error) {
      // 检查是否已经切换到其他章节
      if (currentGeneratingChapter.current !== chapterId) {
        return;
      }
      // 如果是取消请求导致的错误，不显示错误信息
      if (error.name === 'AbortError') {
        //什么都不做
        return;
      }
      console.error("生成摘要失败:", error);
      setSummary("生成摘要失败，请重试");
    } finally {
      // 只有在当前章节的生成完成时才清除状态
      if (currentGeneratingChapter.current === chapterId) {
        setLoading(false);
        currentGeneratingChapter.current = null;
        setAbortController(null);
      }
    }
  };

  // 停止生成摘要
  const stopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  // 保存编辑
  const saveSummary = async () => {
    const summaries = await get(`summaries_${bookId}`) || {};
    summaries[chapterId] = editContent;
    await set(`summaries_${bookId}`, summaries);
    setSummary(editContent);
    setEditing(false);
  };

  // 如果未配置AI，显示提示
  if (!aiConfigured) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <h3 className="font-bold mb-2">章节摘要</h3>
        <div className="text-center py-4">
          <p className="text-gray-600 mb-4">请先配置AI设置才能使用摘要功能</p>
          <button
            onClick={() => navigate(`/reader/${bookId}/settings`)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            前往设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: colors.aiBg, color: colors.text }}>
      {(!showChat || showChat === undefined) && (
        // 摘要区
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 border-b flex justify-between items-center h-16" style={{ borderBottom: `1px solid ${colors.border}` }}>
            <h3 className="font-bold">章节摘要</h3>
            <div className="flex gap-2">
              {editing ? (
                <>
                  <button
                    className="px-2 py-1 rounded text-sm"
                    style={{ background: theme === 'dark' ? '#2563eb' : '#2563eb', color: '#fff' }}
                    onClick={saveSummary}
                  >
                    保存
                  </button>
                  <button
                    className="px-2 py-1 rounded text-sm"
                    style={{ background: theme === 'dark' ? '#374151' : '#f3f4f6', color: colors.text }}
                    onClick={() => setEditing(false)}
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="px-2 py-1 rounded text-sm"
                    style={{ background: 'transparent', color: theme === 'dark' ? '#60a5fa' : '#2563eb', border: `1px solid ${theme === 'dark' ? '#60a5fa' : '#2563eb'}` }}
                    onClick={() => {
                      setEditing(true);
                      setEditContent(summary);
                    }}
                  >
                    编辑
                  </button>
                  {loading ? (
                    <button
                      className="px-2 py-1 rounded text-sm"
                      style={{ background: 'transparent', color: theme === 'dark' ? '#f87171' : '#dc2626', border: `1px solid ${theme === 'dark' ? '#f87171' : '#dc2626'}` }}
                      onClick={stopGeneration}
                    >
                      停止
                    </button>
                  ) : (
                    <button
                      className="px-2 py-1 rounded text-sm"
                      style={{ background: 'transparent', color: theme === 'dark' ? '#34d399' : '#059669', border: `1px solid ${theme === 'dark' ? '#34d399' : '#059669'}` }}
                      onClick={() => generateSummary(extractPlainText(chapterContent))}
                      disabled={!chapterContent}
                    >
                      生成
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {editing ? (
              <div className="h-full flex flex-col">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 p-2 border rounded resize-none outline-none"
                  style={{ background: colors.aiBg, color: colors.text, borderColor: colors.border }}
                />
              </div>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-medium prose-p:my-2 prose-p:leading-relaxed prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:italic prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-100 prose-pre:p-2 prose-pre:rounded prose-pre:overflow-x-auto">
                {loading ? (
                  "生成摘要中..."
                ) : summary ? (
                  <ReactMarkdown
                    rehypePlugins={[rehypeRaw]}
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node, ...props }) => <h1 className="text-2xl font-semibold my-4" {...props} />,
                      h2: ({ node, ...props }) => <h2 className="text-xl font-semibold my-3" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-lg font-semibold my-2" {...props} />,
                      p: ({ node, ...props }) => <p className="my-2 leading-relaxed" {...props} />,
                      ul: ({ node, ...props }) => <ul className="list-disc pl-6 my-2" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal pl-6 my-2" {...props} />,
                      li: ({ node, ...props }) => <li className="my-1" {...props} />,
                      blockquote: ({ node, ...props }) => (
                        <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2" {...props} />
                      ),
                      pre: ({ node, ...props }) => (
                        <pre className="bg-gray-100 p-2 rounded overflow-x-auto my-2" {...props} />
                      ),
                      code: ({ node, inline, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        if (match?.[1] === 'mermaid') {
                          return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                        }
                        if (inline) {
                          return (
                            <code className="bg-gray-100 px-1 rounded text-sm" {...props}>
                              {children}
                            </code>
                          );
                        }
                        return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {summary}
                  </ReactMarkdown>
                ) : (
                  '当前没有摘要，点击"生成"按钮生成摘要'
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {showChat && (
        <AIChat
          bookId={bookId}
          chapterId={chapterId}
          theme={theme}
          title={title}
          author={author}
          colors={colors}
        />
      )}
    </div>
  );
} 