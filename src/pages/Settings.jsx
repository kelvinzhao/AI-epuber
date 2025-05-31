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

  // 新增：字段级别错误和验证成功状态
  const [fieldErrors, setFieldErrors] = useState({
    baseUrl: '',
    apiKey: '',
    model: '',
    summaryPrompt: '',
    minContentLength: ''
  });
  const [validationSuccess, setValidationSuccess] = useState(false);

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
    // 清除所有错误
    setFieldErrors({});
    setValidationSuccess(false);
    setApiError("");
    // 验证必填字段
    let hasError = false;
    if (!baseUrl?.trim()) {
      setFieldErrors(prev => ({...prev, baseUrl: '请输入API Base URL'}));
      hasError = true;
    }
    if (!apiKey?.trim()) {
      setFieldErrors(prev => ({...prev, apiKey: '请输入API Key'}));
      hasError = true;
    }
    if (hasError) return;
    setValidating(true);
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
      const models = data.data
        .filter(model => {
          return !model.id.includes('embedding') && 
                 !model.id.includes('whisper') &&
                 !model.id.includes('tts') &&
                 !model.id.includes('dall-e');
        })
        .map(model => ({
          id: model.id,
          name: model.id
        }));
      if (models.length === 0) {
        throw new Error("未找到可用的模型，请检查API配置是否正确");
      }
      await set("model_list", models);
      setAvailableModels(models);
      if (models.length > 0 && !models.find(m => m.id === selectedModel)) {
        setSelectedModel(models[0].id);
      }
      setValidationSuccess(true);
      setApiError("");
    } catch (error) {
      setApiError(error.message);
      setFieldErrors(prev => ({...prev, baseUrl: 'API验证失败，请检查配置是否正确'}));
      setValidationSuccess(false);
      const cachedModels = await get("model_list") || [];
      setAvailableModels(cachedModels);
    } finally {
      setValidating(false);
    }
  };

  // 保存设置
  const saveSettings = async () => {
    // 校验所有必填字段
    let errors = {};
    if (!baseUrl?.trim()) {
      errors.baseUrl = "请填写API Base URL";
    }
    if (!apiKey?.trim()) {
      errors.apiKey = "请填写API Key";
    }
    if (!selectedModel) {
      errors.model = "请选择模型";
    }
    if (!summaryPrompt?.trim()) {
      errors.summaryPrompt = "请填写摘要提示词";
    }
    if (minContentLength < 50) {
      errors.minContentLength = "最小内容长度不能小于50字";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    try {
      await set("openai_config", {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: selectedModel
      });
      await set("summary_prompt", summaryPrompt.trim());
      await set("min_content_length", minContentLength);
      setApiError("");
      alert("设置已保存");
      if (location.pathname.includes("/reader/")) {
        navigate(-1);
      }
    } catch (error) {
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
                  <label className="block text-sm font-medium mb-1">API Base URL<span className="text-red-500 ml-1">*</span></label>
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => { setBaseUrl(e.target.value); setFieldErrors(prev => ({...prev, baseUrl: ''})); }}
                      className={`w-full p-2 border rounded outline-none ${fieldErrors.baseUrl ? 'border-red-300' : ''}`}
                      placeholder="https://api.openai.com"
                    />
                    {fieldErrors.baseUrl && (
                      <div className="text-sm text-red-500">{fieldErrors.baseUrl}</div>
                    )}
                    <div className="text-xs text-gray-500">示例：https://api.openai.com</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">API Key<span className="text-red-500 ml-1">*</span></label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); setFieldErrors(prev => ({...prev, apiKey: ''})); }}
                        className={`w-full p-2 border rounded outline-none ${fieldErrors.apiKey ? 'border-red-300' : ''}`}
                        placeholder="sk-..."
                      />
                      {fieldErrors.apiKey && (
                        <div className="text-sm text-red-500">{fieldErrors.apiKey}</div>
                      )}
                    </div>
                    <button
                      onClick={validateAndFetchModels}
                      disabled={validating}
                      className="self-end px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 flex items-center gap-2"
                    >
                      {validating ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          验证中...
                        </>
                      ) : (
                        '验证'
                      )}
                    </button>
                  </div>
                </div>
                {/* Model选择部分 */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium">
                      Model<span className="text-red-500 ml-1">*</span>
                      {!selectedModel && (
                        <span className="ml-2 text-sm text-red-500">请选择模型</span>
                      )}
                    </label>
                    <button
                      onClick={validateAndFetchModels}
                      disabled={validating || !baseUrl || !apiKey}
                      className="text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-400 flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {validating ? "更新中..." : "更新模型列表"}
                    </button>
                  </div>
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
                    {fieldErrors.model && (
                      <div className="text-sm text-red-500">{fieldErrors.model}</div>
                    )}
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
                                  setFieldErrors(prev => ({...prev, model: ''}));
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
                  {validationSuccess && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-green-600 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      API配置验证成功
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* AI Summary设置 */}
            <div>
              <h2 className="text-xl font-semibold mb-4">AI Summary设置</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">摘要提示词<span className="text-red-500 ml-1">*</span></label>
                  <textarea
                    value={summaryPrompt}
                    onChange={(e) => { setSummaryPrompt(e.target.value); setFieldErrors(prev => ({...prev, summaryPrompt: ''})); }}
                    className={`w-full h-32 p-2 border rounded outline-none ${fieldErrors.summaryPrompt ? 'border-red-300' : ''}`}
                    placeholder="请输入生成摘要时使用的提示词..."
                  />
                  {fieldErrors.summaryPrompt && (
                    <div className="text-sm text-red-500">{fieldErrors.summaryPrompt}</div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">最小内容长度<span className="text-red-500 ml-1">*</span></label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={minContentLength}
                      onChange={(e) => { setMinContentLength(parseInt(e.target.value) || 100); setFieldErrors(prev => ({...prev, minContentLength: ''})); }}
                      min="50"
                      className={`w-24 p-2 border rounded outline-none ${fieldErrors.minContentLength ? 'border-red-300' : ''}`}
                    />
                    <span className="text-sm text-gray-600">字。当章节内容少于这个字数时，将不会生成摘要。</span>
                  </div>
                  {fieldErrors.minContentLength && (
                    <div className="text-sm text-red-500">{fieldErrors.minContentLength}</div>
                  )}
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
            {/* 显示全局错误信息 */}
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