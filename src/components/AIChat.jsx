import { useState, useEffect, useRef } from "react";
import { get } from "idb-keyval";

export default function AIChat({
  bookId,
  chapterId,
  theme = 'light',
  title = '',
  author = '',
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
  }[theme],
  chatMessages,
  setChatMessages
}) {
  const [aiConfigured, setAiConfigured] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const chatEndRef = useRef(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('pinnedMessages');
    let pins = [];
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        pins = Array.isArray(arr)
          ? arr
          : arr.map(m => m.timestamp); // 兼容旧格式
      } catch {}
    }
    setPinnedMessages(pins);
    // 自动合并 pinned 消息到 chatMessages，补充时按时间排序
    if (pins.length > 0 && setChatMessages) {
      const pinnedMsgs = JSON.parse(localStorage.getItem('pinnedMessagesData') || '[]');
      setChatMessages(msgs => {
        const existTimestamps = new Set(msgs.map(m => m.timestamp));
        const merged = [...msgs];
        // 只补充缺失的pinned消息，按时间排序
        pinnedMsgs
          .filter(m => !existTimestamps.has(m.timestamp))
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          .forEach(m => merged.push(m));
        return merged;
      });
    }
  }, []);

  useEffect(() => {
    const checkAiConfig = async () => {
      const config = await get("openai_config") || {};
      setAiConfigured(Boolean(config.baseUrl && config.apiKey && config.model));
    };
    checkAiConfig();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  useEffect(() => {
    // 自动修复pinnedMessagesData，补全bookId
    let pinnedMsgsData = JSON.parse(localStorage.getItem('pinnedMessagesData') || '[]');
    let changed = false;
    pinnedMsgsData = pinnedMsgsData.map(m => {
      if (!m.bookId && bookId) {
        changed = true;
        return { ...m, bookId };
      }
      return m;
    });
    if (changed) {
      localStorage.setItem('pinnedMessagesData', JSON.stringify(pinnedMsgsData));
    }
  }, [bookId]);

  function getLocalTimestamp() {
    const d = new Date();
    const pad = n => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user', content: chatInput, timestamp: getLocalTimestamp() };
    setChatMessages(msgs => [...msgs, userMsg]);
    setChatInput("");
    setChatLoading(true);
    const controller = new AbortController();
    setAbortController(controller);
    try {
      const config = await get("openai_config");
      if (!config?.baseUrl || !config?.apiKey) {
        setChatMessages(msgs => [...msgs, { role: 'assistant', content: "AI未配置", timestamp: getLocalTimestamp() }]);
        setChatLoading(false);
        setAbortController(null);
        return;
      }
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
              { role: "system", content: `你是一个友好的AI阅读助手，《${title}》，作者是${author}，请回答与这本书内容相关的问题。` },
              { role: "user", content: userMsg.content }
            ]
          }),
          signal: controller.signal
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "AI请求失败");
      setChatMessages(msgs => [...msgs, { role: 'assistant', content: data.choices[0].message.content, timestamp: getLocalTimestamp() }]);
    } catch (e) {
      if (e.name === 'AbortError') {
        setChatMessages(msgs => [...msgs, { role: 'assistant', content: "请求已取消", timestamp: getLocalTimestamp() }]);
      } else {
        setChatMessages(msgs => [...msgs, { role: 'assistant', content: "AI请求失败：" + e.message, timestamp: getLocalTimestamp() }]);
      }
    } finally {
      setChatLoading(false);
      setAbortController(null);
    }
  };

  const stopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  const togglePin = (message) => {
    const isPinned = pinnedMessages.includes(message.timestamp);
    let newPinned;
    let pinnedMsgsData = JSON.parse(localStorage.getItem('pinnedMessagesData') || '[]');
    if (isPinned) {
      newPinned = pinnedMessages.filter(ts => ts !== message.timestamp);
      pinnedMsgsData = pinnedMsgsData.filter(m => m.timestamp !== message.timestamp);
    } else {
      newPinned = [...pinnedMessages, message.timestamp];
      // 补全bookId
      const msgWithBookId = { ...message, bookId };
      pinnedMsgsData = [...pinnedMsgsData, msgWithBookId];
    }
    setPinnedMessages(newPinned);
    localStorage.setItem('pinnedMessages', JSON.stringify(newPinned));
    localStorage.setItem('pinnedMessagesData', JSON.stringify(pinnedMsgsData));
  };

  // 1. 定义一个简约的图钉按钮样式
  const pinBtnStyle = {
    position: 'absolute',
    top: 0,
    zIndex: 2,
    width: 28,
    height: 28,
    padding: 0,
    margin: 0,
    background: 'none',
    border: 'none',
    outline: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
  };
  const pinBtnHoverStyle = {
    background: theme === 'dark' ? 'rgba(255,224,102,0.08)' : 'rgba(37,99,235,0.08)',
  };

  if (!aiConfigured) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <h3 className="font-bold mb-2">AI对话</h3>
        <div className="text-center py-4">
          <p className="text-gray-600 mb-4">请先配置AI设置才能使用对话功能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: colors.aiBg, color: colors.text }}>
      <div className="border-b" style={{ borderBottom: `0px solid ${colors.border}`, background: colors.aiBg, minHeight: 220,  display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="flex-1 overflow-auto p-3" style={{ fontSize: 14 }}>
          {chatMessages.filter(msg => !msg.bookId || msg.bookId === bookId).map((msg, idx) => {
            const isPinned = pinnedMessages.includes(msg.timestamp);
            return (
              <div key={msg.timestamp || idx} className={`mb-2 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                style={{ position: 'relative' }}>
                <div
                  className={`px-3 py-2 rounded-lg max-w-[80%] whitespace-pre-line ${msg.role === 'user' ? (theme === 'dark' ? 'bg-blue-900 text-blue-100' : 'bg-blue-100 text-blue-900') : (theme === 'dark' ? 'bg-gray-700 text-gray-100' : 'bg-gray-200 text-gray-900')}`}
                  style={{ wordBreak: 'break-word', position: 'relative' }}
                >
                  {msg.role === 'user' ? (
                    <button
                      onClick={() => togglePin(msg)}
                      style={{ ...pinBtnStyle, left: -32, top: 0 }}
                      title={isPinned ? '取消固定' : '固定'}
                      onMouseOver={e => e.currentTarget.style.background = pinBtnHoverStyle.background}
                      onMouseOut={e => e.currentTarget.style.background = 'none'}
                    >
                      {isPinned ? (
                        <svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M175.610828 819.2l160.943839-160.943838-102.441374-102.358627a82.954343 82.954343 0 0 1 0-117.046303l29.251232-29.251232a82.747475 82.747475 0 0 1 89.367273-18.204444 19.238788 19.238788 0 0 1 5.378586-1.944566l120.976808-25.734465a21.348848 21.348848 0 0 1 6.206061-0.372363l129.210181-129.210182a82.747475 82.747475 0 0 1 0-117.004929l29.251233-29.292607a82.747475 82.747475 0 0 1 117.046303 0l175.507394 175.548768a82.747475 82.747475 0 0 1 0 117.046303l-29.251233 29.251232a82.954343 82.954343 0 0 1-117.004929 0l-125.776162 125.776162a20.231758 20.231758 0 0 1-0.372363 6.702546l-28.878869 135.912727a82.747475 82.747475 0 0 1-20.562747 82.623353l-29.292606 29.251233a82.747475 82.747475 0 0 1-117.00493 0L365.764525 687.548768l-160.902464 160.902464a20.686869 20.686869 0 0 1-29.251233 0 20.686869 20.686869 0 0 1 0-29.251232z m321.80493-58.502465a42.077091 42.077091 0 0 0 5.254464 4.385617l-6.081939-5.254465z" fill="#0389FF"></path></svg>
                      ) : (
                        <svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M21.290667 1024.042667a21.333333 21.333333 0 0 1-15.104-36.394667l386.56-386.602667-146.730667-146.730666a64.042667 64.042667 0 0 1 0-90.496l21.333333-21.333334a63.573333 63.573333 0 0 1 45.269334-18.730666h135.338666a21.205333 21.205333 0 0 0 15.061334-6.229334l179.498666-179.498666a8.789333 8.789333 0 0 0 0-12.501334 51.626667 51.626667 0 0 1 0-72.832l33.834667-33.834666a63.488 63.488 0 0 1 45.269333-18.688c17.109333 0 33.194667 6.656 45.269334 18.688l238.336 238.336a64.042667 64.042667 0 0 1 0 90.496l-33.834667 33.834666a51.114667 51.114667 0 0 1-36.394667 15.061334c-13.781333 0-26.709333-5.333333-36.437333-15.061334a8.746667 8.746667 0 0 0-6.229333-2.56 8.746667 8.746667 0 0 0-6.229334 2.56l-179.498666 179.498667a21.248 21.248 0 0 0-6.229334 15.104v135.338667c0 17.109333-6.656 33.152-18.730666 45.269333l-21.333334 21.333333c-12.074667 12.074667-28.117333 18.688-45.269333 18.688s-33.194667-6.656-45.269333-18.688l-146.730667-146.730666-386.56 386.602666a22.101333 22.101333 0 0 1-15.189333 6.101334zM312.618667 366.378667a21.376 21.376 0 0 0-15.104 6.229333l-21.333334 21.333333a21.333333 21.333333 0 0 0 0 30.165334l323.669334 323.669333a21.333333 21.333333 0 0 0 30.208 0l21.333333-21.333333a21.504 21.504 0 0 0 6.229333-15.104V576c0-17.109333 6.656-33.152 18.730667-45.269333l179.498667-179.498667a51.2 51.2 0 0 1 36.394666-15.104 51.2 51.2 0 0 1 36.437334 15.104c1.706667 1.706667 3.882667 2.602667 6.272 2.602667a8.533333 8.533333 0 0 0 6.229333-2.602667l33.834667-33.834667a21.333333 21.333333 0 0 0 0-30.165333l-238.336-238.336a21.333333 21.333333 0 0 0-30.208 0l-33.834667 33.834667a8.832 8.832 0 0 0 0 12.501333c20.053333 20.053333 20.096 52.736 0.042667 72.832L493.226667 347.648a63.573333 63.573333 0 0 1-45.226667 18.730667H312.618667z" fill="#bdbdbd"></path></svg>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => togglePin(msg)}
                      style={{ ...pinBtnStyle, right: -32, top: 0 }}
                      title={isPinned ? '取消固定' : '固定'}
                      onMouseOver={e => e.currentTarget.style.background = pinBtnHoverStyle.background}
                      onMouseOut={e => e.currentTarget.style.background = 'none'}
                    >
                      {isPinned ? (
                        <svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M175.610828 819.2l160.943839-160.943838-102.441374-102.358627a82.954343 82.954343 0 0 1 0-117.046303l29.251232-29.251232a82.747475 82.747475 0 0 1 89.367273-18.204444 19.238788 19.238788 0 0 1 5.378586-1.944566l120.976808-25.734465a21.348848 21.348848 0 0 1 6.206061-0.372363l129.210181-129.210182a82.747475 82.747475 0 0 1 0-117.004929l29.251233-29.292607a82.747475 82.747475 0 0 1 117.046303 0l175.507394 175.548768a82.747475 82.747475 0 0 1 0 117.046303l-29.251233 29.251232a82.954343 82.954343 0 0 1-117.004929 0l-125.776162 125.776162a20.231758 20.231758 0 0 1-0.372363 6.702546l-28.878869 135.912727a82.747475 82.747475 0 0 1-20.562747 82.623353l-29.292606 29.251233a82.747475 82.747475 0 0 1-117.00493 0L365.764525 687.548768l-160.902464 160.902464a20.686869 20.686869 0 0 1-29.251233 0 20.686869 20.686869 0 0 1 0-29.251232z m321.80493-58.502465a42.077091 42.077091 0 0 0 5.254464 4.385617l-6.081939-5.254465z" fill="#0389FF"></path></svg>
                      ) : (
                        <svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M21.290667 1024.042667a21.333333 21.333333 0 0 1-15.104-36.394667l386.56-386.602667-146.730667-146.730666a64.042667 64.042667 0 0 1 0-90.496l21.333333-21.333334a63.573333 63.573333 0 0 1 45.269334-18.730666h135.338666a21.205333 21.205333 0 0 0 15.061334-6.229334l179.498666-179.498666a8.789333 8.789333 0 0 0 0-12.501334 51.626667 51.626667 0 0 1 0-72.832l33.834667-33.834666a63.488 63.488 0 0 1 45.269333-18.688c17.109333 0 33.194667 6.656 45.269334 18.688l238.336 238.336a64.042667 64.042667 0 0 1 0 90.496l-33.834667 33.834666a51.114667 51.114667 0 0 1-36.394667 15.061334c-13.781333 0-26.709333-5.333333-36.437333-15.061334a8.746667 8.746667 0 0 0-6.229333-2.56 8.746667 8.746667 0 0 0-6.229334 2.56l-179.498666 179.498667a21.248 21.248 0 0 0-6.229334 15.104v135.338667c0 17.109333-6.656 33.152-18.730666 45.269333l-21.333334 21.333333c-12.074667 12.074667-28.117333 18.688-45.269333 18.688s-33.194667-6.656-45.269333-18.688l-146.730667-146.730666-386.56 386.602666a22.101333 22.101333 0 0 1-15.189333 6.101334zM312.618667 366.378667a21.376 21.376 0 0 0-15.104 6.229333l-21.333334 21.333333a21.333333 21.333333 0 0 0 0 30.165334l323.669334 323.669333a21.333333 21.333333 0 0 0 30.208 0l21.333333-21.333333a21.504 21.504 0 0 0 6.229333-15.104V576c0-17.109333 6.656-33.152 18.730667-45.269333l179.498667-179.498667a51.2 51.2 0 0 1 36.394666-15.104 51.2 51.2 0 0 1 36.437334 15.104c1.706667 1.706667 3.882667 2.602667 6.272 2.602667a8.533333 8.533333 0 0 0 6.229333-2.602667l33.834667-33.834667a21.333333 21.333333 0 0 0 0-30.165333l-238.336-238.336a21.333333 21.333333 0 0 0-30.208 0l-33.834667 33.834667a8.832 8.832 0 0 0 0 12.501333c20.053333 20.053333 20.096 52.736 0.042667 72.832L493.226667 347.648a63.573333 63.573333 0 0 1-45.226667 18.730667H312.618667z" fill="#bdbdbd"></path></svg>
                      )}
                    </button>
                  )}
                  {msg.content}
                </div>
              </div>
            );
          })}
          {chatLoading && <div className="text-gray-400 text-xs text-center">AI正在思考…</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="flex gap-2 p-3 border-t" style={{ borderTop: `1px solid ${colors.border}` }}>
          <input
            className="flex-1 px-2 py-1 rounded"
            style={{ background: colors.aiBg, color: colors.text, borderColor: colors.border, outline: 'none' }}
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !chatLoading) sendChatMessage(); }}
            placeholder="向AI提问…"
            disabled={chatLoading}
          />
          <button
            className="px-3 py-1 rounded text-sm"
            style={{ 
              background: chatLoading 
                ? (theme === 'dark' ? '#dc2626' : '#dc2626') 
                : (theme === 'dark' ? '#2563eb' : '#2563eb'), 
              color: '#fff' 
            }}
            onClick={chatLoading ? stopGeneration : sendChatMessage}
            disabled={!chatLoading && !chatInput.trim()}
          >
            {chatLoading ? '停止' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
} 