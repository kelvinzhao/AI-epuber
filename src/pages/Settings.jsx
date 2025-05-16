import { useState, useEffect, useRef } from "react";
import { get, set } from "idb-keyval";
import { useNavigate, Link } from "react-router-dom";

export default function Settings() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [summaryPrompt, setSummaryPrompt] = useState("请总结这段内容的主要观点：");
  const [minContentLength, setMinContentLength] = useState(100);
  const [validating, setValidating] = useState(false);
  const [apiError, setApiError] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [availableModels, setAvailableModels] = useState([]);
  const [modelFilter, setModelFilter] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef();
  const navigate = useNavigate();

  // 加载设置
  useEffect(() => {
    const loadSettings = async () => {
      // 加载配置
      const config = await get("openai_config") || {};
      setBaseUrl(config.baseUrl || "");
      setApiKey(config.apiKey || "");
      setSelectedModel(config.model || "");
      
      // 加载缓存的模型列表
      const cachedModels = await get("model_list") || [];
      setAvailableModels(cachedModels);
      
      // 加载摘要设置
      const prompt = await get("summary_prompt");
      setSummaryPrompt(prompt || "请总结这段内容的主要观点：");
      
      const minLength = await get("min_content_length");
      setMinContentLength(minLength || 100);
    };
    loadSettings();
  }, []);

  // 验证API并获取模型列表
  const validateAndFetchModels = async () => {
    if (!baseUrl || !apiKey) {
      setApiError("请填写完整的API配置信息");
      return;
    }

    setValidating(true);
    setApiError("");
    
    try {
      // OpenAI API
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API错误: ${errorText}`);
      }

      const data = await response.json();
      console.log("API返回的模型列表:", data.data); // 添加调试日志

      // 优化模型过滤逻辑
      const models = data.data
        .filter(model => {
          //放宽过滤条件，只排除明显不是对话模型的
          return !model.id.includes('embedding') && 
                 !model.id.includes('whisper') &&
                 !model.id.includes('tts') &&
                 !model.id.includes('dall-e');
        })
        .map(model => ({
          id: model.id,
          name: model.id
        }));

      console.log("过滤后的模型列表:", models); // 添加调试日志

      if (models.length === 0) {
        throw new Error("未找到可用的模型，请检查API配置是否正确");
      }

      // 保存到本地缓存
      await set("model_list", models);
      setAvailableModels(models);

      // 如果当前选择的模型不在新列表中，选择第一个
      if (models.length > 0 && !models.find(m => m.id === selectedModel)) {
        setSelectedModel(models[0].id);
      }

      setApiError(""); // 清除错误提示

    } catch (error) {
      console.error('Error fetching models:', error);
      setApiError(error.message);
      
      // 加载缓存的模型列表作为后备
      const cachedModels = await get("model_list") || [];
      setAvailableModels(cachedModels);
    } finally {
      setValidating(false);
    }
  };

  // 保存设置
  const saveSettings = async () => {
    // 校验所有必填字段
    if (!baseUrl?.trim()) {
      setApiError("请填写API Base URL");
      return;
    }
    if (!apiKey?.trim()) {
      setApiError("请填写API Key");
      return;
    }
    if (!selectedModel) {
      setApiError("请选择模型");
      return;
    }
    if (!summaryPrompt?.trim()) {
      setApiError("请填写摘要提示词");
      return;
    }
    if (minContentLength < 50) {
      setApiError("最小内容长度不能小于50字");
      return;
    }

    try {
      // 保存OpenAI配置
      await set("openai_config", {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: selectedModel
      });

      // 保存摘要设置
      await set("summary_prompt", summaryPrompt.trim());
      await set("min_content_length", minContentLength);

      setApiError(""); // 清除错误提示
      alert("设置已保存");

      if (location.pathname.includes("/reader/")) {
        navigate(-1);
      }
    } catch (error) {
      console.error('Save settings error:', error);
      setApiError("保存设置失败：" + error.message);
    }
  };

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClick = (e) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [modelDropdownOpen]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="w-full max-w-2xl mx-auto py-8 px-2">
        <div className="bg-white rounded-xl shadow p-6">
          {/* 添加返回按钮 */}
          <div className="flex items-center mb-4 relative">
            <Link to="/" className="p-2 hover:bg-gray-100 rounded-full mr-4 absolute left-0 top-1/2 -translate-y-1/2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold mx-auto text-center w-full">设置</h1>
            <div className="w-10 absolute right-0 top-1/2 -translate-y-1/2"></div>
          </div>
          <div className="space-y-6">
            {/* OpenAI API设置 */}
            <div>
              <h2 className="text-xl font-semibold mb-4">OpenAI API设置</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">API Base URL</label>
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="w-full p-2 border rounded outline-none"
                      placeholder="https://api.openai.com"
                    />
                    <div className="text-xs text-gray-500">
                      示例：https://api.openai.com
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">API Key</label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full p-2 border rounded outline-none"
                        placeholder="sk-..."
                      />
                    </div>
                    <button
                      onClick={validateAndFetchModels}
                      disabled={validating}
                      className="self-end px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
                    >
                      {validating ? "验证中..." : "验证"}
                    </button>
                  </div>
                </div>
                {/* Model选择部分 */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium">
                      Model
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <button
                      onClick={validateAndFetchModels}
                      disabled={validating || !baseUrl || !apiKey}
                      className="text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400"
                    >
                      {validating ? "更新中..." : "更新模型列表"}
                    </button>
                  </div>
                  {/* 自定义下拉组件 */}
                  <div className="relative" ref={modelDropdownRef}>
                    <input
                      type="text"
                      className={`w-full p-2 border rounded cursor-pointer outline-none ${!selectedModel && 'border-red-300'}`}
                      value={selectedModel}
                      placeholder="请选择模型"
                      readOnly
                      onClick={() => setModelDropdownOpen(v => !v)}
                      disabled={validating}
                    />
                    {modelDropdownOpen && (
                      <div className="absolute z-10 w-full bg-white border rounded shadow mt-1">
                        <div className="sticky top-0 bg-white z-10">
                          <input
                            type="text"
                            className="w-full p-2 border-b border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 bg-white rounded-t outline-none"
                            placeholder="筛选模型..."
                            value={modelFilter || ''}
                            onChange={e => setModelFilter(e.target.value)}
                            autoFocus
                            onKeyDown={e => e.stopPropagation()}
                          />
                        </div>
                        <ul className="max-h-56 overflow-auto">
                          {availableModels
                            .filter(m => !modelFilter || m.name.toLowerCase().includes(modelFilter.toLowerCase()))
                            .map(model => (
                              <li
                                key={model.id}
                                className={`px-4 py-2 cursor-pointer hover:bg-blue-100 ${selectedModel === model.id ? 'bg-blue-50 font-bold' : ''}`}
                                onClick={() => {
                                  setSelectedModel(model.id);
                                  setModelDropdownOpen(false);
                                }}
                              >
                                {model.name}
                              </li>
                            ))}
                          {availableModels.filter(m => !modelFilter || m.name.toLowerCase().includes(modelFilter.toLowerCase())).length === 0 && (
                            <li className="px-4 py-2 text-gray-400">无匹配模型</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* AI Summary设置 */}
            <div>
              <h2 className="text-xl font-semibold mb-4">AI Summary设置</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">摘要提示词</label>
                  <textarea
                    value={summaryPrompt}
                    onChange={(e) => setSummaryPrompt(e.target.value)}
                    className="w-full h-32 p-2 border rounded outline-none"
                    placeholder="请输入生成摘要时使用的提示词..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">最小内容长度</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={minContentLength}
                      onChange={(e) => setMinContentLength(parseInt(e.target.value) || 100)}
                      min="50"
                      className="w-24 p-2 border rounded outline-none"
                    />
                    <span className="text-sm text-gray-600">字。当章节内容少于这个字数时，将不会生成摘要。</span>
                  </div>
                </div>
              </div>
            </div>
            {/* 保存按钮 */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={saveSettings}
                disabled={!baseUrl || !apiKey || !selectedModel}
                className={`px-4 py-2 rounded ${
                  !baseUrl || !apiKey || !selectedModel
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                保存设置
              </button>
            </div>
            {/* 显示错误信息 */}
            {apiError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
                {apiError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}