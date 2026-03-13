import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import type { Layout, Settings, ThemeMode, WindowInfo } from './api';

type Tab = 'layouts' | 'preview' | 'settings';

type MonitorRow = {
  id: number;
  model: string;
  internal: boolean;
  width: number;
  height: number;
  scaleFactor: number;
  x: number;
  y: number;
  rotation: number;
  primary: boolean;
};

type HoverPreviewState = {
  layout: Layout;
  anchorRect: DOMRect;
};

export default function App() {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [settings, setSettings] = useState<Settings>({
    autoRestore: false,
    askBeforeRestore: true,
    themeMode: 'system',
    lastRestoredByMonitorKey: {},
    lastLayoutId: null,
  });
  const [newLayoutName, setNewLayoutName] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('layouts');
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [previewWindows, setPreviewWindows] = useState<WindowInfo[]>([]);
  const [previewSystemWindows, setPreviewSystemWindows] = useState<WindowInfo[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [systemWindowsCollapsed, setSystemWindowsCollapsed] = useState(true);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPopupRef = useRef<HTMLDivElement | null>(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const appliedTheme: 'dark' | 'light' =
    settings.themeMode === 'system'
      ? (systemPrefersDark ? 'dark' : 'light')
      : settings.themeMode;

  const loadData = useCallback(async () => {
    console.info('[Renderer][App] loadData start. window.api exists =', typeof window.api !== 'undefined');
    try {
      if (!window.api) {
        setStatusType('err');
        setStatusMsg('Electron API가 없습니다. `npm run dev`로 Electron 앱을 실행하세요.');
        return;
      }
      const [layoutData, settingsData] = await Promise.all([
        api.getLayouts(),
        api.getSettings(),
      ]);
      console.info('[Renderer][App] loadData success:', {
        layoutCount: layoutData.length,
        hasSettings: Boolean(settingsData),
      });
      setLayouts(layoutData);
      setSettings(settingsData);
    } catch (error) {
      console.error('[Renderer][App] loadData failed:', error);
      setStatusType('err');
      setStatusMsg(`초기 데이터 로드 실패: ${error}`);
    }
  }, []);

  useEffect(() => {
    console.info('[Renderer][App] mounted. window.api exists =', typeof window.api !== 'undefined');
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    // 학습 포인트:
    // 앱 실행 중에 OS 테마가 바뀔 수 있으므로 change 이벤트를 구독합니다.
    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    // 학습 포인트:
    // data-theme 속성을 바꾸면 CSS 변수 묶음(다크/라이트)이 한 번에 교체됩니다.
    // system 모드일 때도 appliedTheme이 실제 테마 값을 결정해 줍니다.
    document.documentElement.setAttribute('data-theme', appliedTheme);
  }, [appliedTheme]);

  const showStatus = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setStatusMsg(msg);
    setStatusType(type);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const handleSave = async () => {
    const name = newLayoutName.trim();
    if (!name) {
      showStatus('레이아웃 이름을 입력하세요.', 'err');
      return;
    }
    setLoading(true);
    try {
      const layout = await api.saveLayout(name);
      setLayouts((prev) => [...prev, layout]);
      setNewLayoutName('');
      showStatus(
        `"${name}" 저장 완료 (창 ${layout.windows.length}개)`,
        'ok'
      );
    } catch (e) {
      showStatus(`저장 실패: ${e}`, 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (layout: Layout) => {
    setLoading(true);
    try {
      const result = await api.restoreLayout(layout.id);
      if (result.success) {
        showStatus(
          `"${layout.name}" 복원 완료 (${result.restoredCount ?? 0}개 창)`,
          'ok'
        );
        const updated = await api.getSettings();
        setSettings(updated);
      } else if (result.error !== '사용자 취소') {
        showStatus(`복원 실패: ${result.error}`, 'err');
      }
    } catch (e) {
      showStatus(`복원 실패: ${e}`, 'err');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (layout: Layout) => {
    const ok = window.confirm(`"${layout.name}" 레이아웃을 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.`);
    if (!ok) return;

    await api.deleteLayout(layout.id);
    setLayouts((prev) => prev.filter((l) => l.id !== layout.id));
    if (settings.lastLayoutId === layout.id) {
      setSettings((prev) => ({ ...prev, lastLayoutId: null }));
    }
    showStatus(`"${layout.name}" 삭제됨`);
  };

  const handleSettingChange = async (
    key: 'autoRestore' | 'askBeforeRestore',
    value: boolean
  ) => {
    const updated = await api.updateSettings({ [key]: value });
    setSettings(updated);
  };

  const handleThemeModeChange = async (mode: ThemeMode) => {
    if (settings.themeMode === mode) return;
    const updated = await api.updateSettings({ themeMode: mode });
    setSettings(updated);
  };

  const appliedThemeLabel = appliedTheme === 'dark' ? '다크' : '라이트';

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const result = await api.captureWindowsDetailed();
      setPreviewWindows(result.regular);
      setPreviewSystemWindows(result.system);
    } catch (e) {
      showStatus(`현재 창 목록 가져오기 실패: ${e}`, 'err');
    } finally {
      setPreviewLoading(false);
    }
  };

  const getMonitorRows = (layout: Layout): MonitorRow[] => {
    const context = layout.monitorContext;
    if (!context) return [];

    // 신규 저장 데이터: 모니터 상세 정보가 그대로 들어있다.
    if (context.monitors && context.monitors.length > 0) {
      return context.monitors.map((monitor) => ({
        ...monitor,
        model: monitor.model || '모니터 정보 없음',
      }));
    }

    // 구버전 데이터 fallback: signature와 model 문자열로 최소 정보를 복원한다.
    if (context.monitorSignatures.length > 0) {
      return context.monitorSignatures.map((signature, index) => {
        const parts = signature.split('|');
        const model = parts[0] || context.monitorModels[index] || '모니터 정보 없음';
        const internalToken = parts.find((part) => part === 'i1' || part === 'i0');
        const sizeToken = parts.find((part) => part.startsWith('s'));
        const rotationToken = parts.find((part) => part.startsWith('r'));
        const [width, height] = (sizeToken?.slice(1).split('x') ?? ['0', '0']).map((value) => Number(value));

        return {
          id: index,
          model,
          internal: internalToken === 'i1',
          width: Number.isFinite(width) ? width : 0,
          height: Number.isFinite(height) ? height : 0,
          scaleFactor: 1,
          x: 0,
          y: 0,
          rotation: Number(rotationToken?.slice(1) ?? 0),
          primary: signature.includes('p1'),
        };
      });
    }

    return (context.monitorModels ?? []).map((model, index) => ({
      id: index,
      model,
      internal: false,
      width: 0,
      height: 0,
      scaleFactor: 1,
      x: 0,
      y: 0,
      rotation: 0,
      primary: index === 0,
    }));
  };

  const formatMonitorModel = (model: string): string => {
    if (!model || model.includes('unknown-model')) return '모니터 정보 없음';
    return model;
  };

  const getSingleMonitorLabel = (layout: Layout): string => {
    const rows = getMonitorRows(layout);
    if (rows.length === 0) return '모니터 정보 없음';
    return formatMonitorModel(rows[0].model);
  };

  const getPopupPosition = (anchorRect: DOMRect) => {
    const width = 380;
    const gap = 10;
    const minMargin = 12;
    const maxHeight = Math.min(460, window.innerHeight - minMargin * 2);

    let left = anchorRect.right + gap;
    if (left + width > window.innerWidth - minMargin) {
      left = anchorRect.left - width - gap;
    }
    left = Math.max(minMargin, Math.min(left, window.innerWidth - width - minMargin));

    let top = anchorRect.top;
    if (top + maxHeight > window.innerHeight - minMargin) {
      top = Math.max(minMargin, window.innerHeight - maxHeight - minMargin);
    }

    return { left, top, width, maxHeight };
  };

  const startLayoutHoverPreview = (layout: Layout, anchorRect: DOMRect) => {
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setHoverPreview({ layout, anchorRect });
    }, 500);
  };

  const stopLayoutHoverPreview = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
    }
    hoverHideTimerRef.current = setTimeout(() => {
      setHoverPreview(null);
    }, 120);
  };

  const keepHoverPreviewVisible = () => {
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
  };

  const hideHoverPreviewImmediately = () => {
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
    setHoverPreview(null);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
      if (hoverHideTimerRef.current) {
        clearTimeout(hoverHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hoverPreview) return;
    const close = () => setHoverPreview(null);
    const handleWindowScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && hoverPopupRef.current?.contains(target)) {
        return;
      }
      close();
    };

    window.addEventListener('resize', close);
    window.addEventListener('scroll', handleWindowScroll, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', handleWindowScroll, true);
    };
  }, [hoverPreview]);

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="flex flex-col h-screen bg-ios-bg text-ios-label select-none">
      {/* 헤더 - iOS 스타일 블러 글래스 */}
      <header className="glass border-b border-ios-separator/50 px-5 py-3 flex items-center justify-center flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('layouts')}
          aria-label="홈으로 이동"
          title="홈으로 이동"
          className="inline-flex items-center rounded-ios transition-all duration-ios hover:opacity-90 active:scale-[0.99]"
        >
          <img
            src="./logo_resurrection.png"
            alt="리저렉션 홈"
            className="h-[108px] w-auto max-w-[75vw] sm:max-w-[620px] object-contain"
          />
        </button>
      </header>

      {/* 세그먼트 컨트롤 - iOS 스타일 */}
      <nav className="bg-ios-bg px-4 py-4 flex-shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex p-1 bg-ios-secondary rounded-ios-lg" role="tablist">
            {(
              [
                { id: 'layouts', label: '레이아웃' },
                { id: 'preview', label: '현재 창 목록' },
                { id: 'settings', label: '설정' },
              ] as { id: Tab; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-ios ease-ios ${
                  activeTab === id
                    ? 'bg-ios-elevated text-ios-label shadow-ios'
                    : 'text-ios-label-secondary hover:text-ios-label'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* 본문 */}
      <main className="flex-1 overflow-auto p-4 bg-ios-grouped">
        {/* ── 레이아웃 탭 ── */}
        {activeTab === 'layouts' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            {/* 저장 폼 - iOS 그룹 리스트 스타일 */}
            <section className="rounded-ios-xl overflow-hidden bg-ios-elevated">
              <div className="px-4 pt-3 pb-1">
                <h2 className="text-[13px] font-semibold text-ios-label-secondary uppercase tracking-wide">
                  현재 창 배치 저장
                </h2>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLayoutName}
                    onChange={(e) => setNewLayoutName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    placeholder="레이아웃 이름 (예: 작업용, 영상편집)"
                    className="flex-1 bg-ios-secondary border-0 rounded-ios px-3 py-2.5 text-sm text-ios-label placeholder-ios-label-tertiary focus:ring-2 focus:ring-ios-blue/50 transition-all duration-ios"
                  />
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-ios-blue hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-white px-5 py-2.5 rounded-ios text-sm font-semibold transition-all duration-ios whitespace-nowrap"
                  >
                    저장
                  </button>
                </div>
                <p className="text-xs text-ios-label-secondary">
                  현재 화면에 보이는 모든 창의 위치와 크기를 저장합니다.
                </p>
              </div>
            </section>

            {/* 저장된 레이아웃 목록 - iOS 그룹 리스트 */}
            <section className="rounded-ios-xl bg-ios-elevated shadow-ios">
              <div className="px-4 py-3 flex items-center justify-between border-b border-ios-separator/50">
                <h2 className="text-[13px] font-semibold text-ios-label-secondary uppercase tracking-wide">
                  저장된 레이아웃
                </h2>
                <span className="text-xs text-ios-label-tertiary">{layouts.length}개</span>
              </div>

              {layouts.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-5xl mb-4 opacity-60">📋</div>
                  <p className="text-ios-label-secondary text-sm">
                    저장된 레이아웃이 없습니다.
                  </p>
                  <p className="text-ios-label-tertiary text-xs mt-1">
                    위에서 현재 창 배치를 저장해보세요.
                  </p>
                </div>
              ) : (
                <ul>
                  {layouts.map((layout, idx) => {
                    const monitorRows = getMonitorRows(layout);
                    return (
                    <li
                      key={layout.id}
                      onMouseEnter={(event) =>
                        startLayoutHoverPreview(layout, event.currentTarget.getBoundingClientRect())
                      }
                      onMouseLeave={stopLayoutHoverPreview}
                      className={`relative flex items-center justify-between px-4 py-3.5 transition-colors duration-ios hover:bg-ios-secondary/50 active:bg-ios-secondary ${
                        idx > 0 ? 'border-t border-ios-separator/30' : ''
                      } ${settings.lastLayoutId === layout.id ? 'bg-ios-blue/5' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ios-label truncate">
                            {layout.name}
                          </span>
                          {settings.lastLayoutId === layout.id && (
                            <span className="flex-shrink-0 text-[11px] bg-ios-blue/20 text-ios-blue px-2 py-0.5 rounded-md font-medium">
                              마지막 복원
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ios-label-secondary mt-1 space-y-1">
                          {monitorRows.length >= 2 ? (
                            <div className="space-y-0.5 text-left">
                              {monitorRows.map((monitor) => (
                                <div key={`${layout.id}-monitor-${monitor.id}`} className="flex items-center gap-1">
                                  <span className="truncate">{formatMonitorModel(monitor.model)}</span>
                                  {monitor.primary && (
                                    <span className="text-[10px] bg-ios-blue/20 text-ios-blue px-1.5 py-0.5 rounded">
                                      주 모니터
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-left">
                              <span>{getSingleMonitorLabel(layout)}</span>
                              {monitorRows[0]?.primary && (
                                <span className="text-[10px] bg-ios-blue/20 text-ios-blue px-1.5 py-0.5 rounded">
                                  주 모니터
                                </span>
                              )}
                            </div>
                          )}
                          <div>
                            창 {layout.windows.length}개 · {formatDate(layout.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 ml-3">
                        <button
                          onClick={() => handleRestore(layout)}
                          disabled={loading}
                          className="text-xs bg-ios-green/20 hover:bg-ios-green/30 disabled:opacity-50 text-ios-green px-3 py-1.5 rounded-lg font-semibold transition-all duration-ios active:scale-[0.96]"
                        >
                          복원
                        </button>
                        <button
                          onClick={() => handleDelete(layout)}
                          disabled={loading}
                          className="text-xs bg-ios-red/20 hover:bg-ios-red/30 disabled:opacity-50 text-ios-red px-3 py-1.5 rounded-lg font-semibold transition-all duration-ios active:scale-[0.96]"
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  )})}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* ── 현재 창 목록 탭 ── */}
        {activeTab === 'preview' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-[13px] font-semibold text-ios-label-secondary uppercase tracking-wide">
                현재 열린 창
              </h2>
              <button
                onClick={handlePreview}
                disabled={previewLoading}
                className="text-sm text-white bg-ios-blue hover:opacity-90 disabled:opacity-50 px-4 py-2 rounded-ios font-semibold transition-all duration-ios active:scale-[0.98]"
              >
                {previewLoading ? '불러오는 중...' : '새로고침'}
              </button>
            </div>

            {previewWindows.length === 0 && previewSystemWindows.length === 0 && !previewLoading && (
              <div className="rounded-ios-xl overflow-hidden bg-ios-elevated py-16 text-center shadow-ios">
                <div className="text-5xl mb-4 opacity-60">🪟</div>
                <p className="text-ios-label-secondary text-sm">
                  새로고침 버튼을 눌러 현재 열린 창 목록을 가져오세요.
                </p>
                {!window.api && (
                  <p className="text-ios-red text-xs mt-3 font-medium">
                    ⚠️ Electron 연동 API(preload)가 없습니다. 앱을 Electron으로 실행했는지 확인해주세요.
                  </p>
                )}
              </div>
            )}

            {(previewWindows.length > 0 || previewSystemWindows.length > 0) && (
              <>
                <div className="rounded-ios-xl overflow-hidden bg-ios-elevated shadow-ios">
                  <div className="px-4 py-3 border-b border-ios-separator/50">
                    <p className="text-xs font-semibold text-ios-label-secondary uppercase tracking-wide">
                      일반 창
                    </p>
                  </div>
                  {previewWindows.length === 0 ? (
                    <div className="px-4 py-6 text-xs text-ios-label-secondary">
                      일반 창이 없습니다.
                    </div>
                  ) : (
                    <ul>
                      {previewWindows.map((win, i) => (
                        <li
                          key={i}
                          className={`px-4 py-3.5 ${i > 0 ? 'border-t border-ios-separator/30' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-ios-label truncate">
                                {win.title}
                              </p>
                              <p className="text-xs text-ios-label-secondary mt-0.5">
                                {win.processName}
                              </p>
                            </div>
                            <div className="text-xs text-ios-label-tertiary text-right flex-shrink-0 font-mono">
                              <div>{win.x}, {win.y}</div>
                              <div>{win.width} × {win.height}</div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="px-4 py-3 border-t border-ios-separator/50 bg-ios-secondary/30">
                    <p className="text-xs text-ios-label-secondary">
                      일반 창 {previewWindows.length}개
                    </p>
                  </div>
                </div>

                <div className="rounded-ios-xl overflow-hidden bg-ios-elevated shadow-ios">
                  <button
                    onClick={() => setSystemWindowsCollapsed((prev) => !prev)}
                    className="w-full px-4 py-3 flex items-center justify-between border-b border-ios-separator/50 hover:bg-ios-secondary/30 transition-colors"
                  >
                    <p className="text-xs font-semibold text-ios-label-secondary uppercase tracking-wide">
                      시스템 창 ({previewSystemWindows.length}개)
                    </p>
                    <span className="text-xs text-ios-label-secondary">
                      {systemWindowsCollapsed ? '펼치기' : '접기'}
                    </span>
                  </button>

                  {!systemWindowsCollapsed && (
                    <>
                      {previewSystemWindows.length === 0 ? (
                        <div className="px-4 py-6 text-xs text-ios-label-secondary">
                          시스템 창이 없습니다.
                        </div>
                      ) : (
                        <ul>
                          {previewSystemWindows.map((win, i) => (
                            <li
                              key={`sys-${i}`}
                              className={`px-4 py-3.5 ${i > 0 ? 'border-t border-ios-separator/30' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-ios-label truncate">
                                    {win.title}
                                  </p>
                                  <p className="text-xs text-ios-label-secondary mt-0.5">
                                    {win.processName}
                                  </p>
                                </div>
                                <div className="text-xs text-ios-label-tertiary text-right flex-shrink-0 font-mono">
                                  <div>{win.x}, {win.y}</div>
                                  <div>{win.width} × {win.height}</div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 설정 탭 ── */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <section className="rounded-ios-xl overflow-hidden bg-ios-elevated shadow-ios">
              <div className="px-4 py-3 border-b border-ios-separator/50">
                <h2 className="text-[13px] font-semibold text-ios-label-secondary uppercase tracking-wide">
                  테마
                </h2>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs text-ios-label-secondary">
                  화면 모드를 바꾸면 색상 변수 세트가 교체되어 UI 전체가 함께 전환됩니다.
                </p>
                <div className="inline-flex p-1 bg-ios-secondary rounded-ios-lg" role="tablist" aria-label="테마 선택">
                  {(
                    [
                      { id: 'system', label: '시스템(자동)' },
                      { id: 'dark', label: '다크' },
                      { id: 'light', label: '라이트' },
                    ] as { id: ThemeMode; label: string }[]
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={settings.themeMode === id}
                      onClick={() => handleThemeModeChange(id)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-ios ${
                        settings.themeMode === id
                          ? 'bg-ios-elevated text-ios-label shadow-ios'
                          : 'text-ios-label-secondary hover:text-ios-label'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ios-label-tertiary">
                  현재 적용 테마: {appliedThemeLabel}
                  {settings.themeMode === 'system' ? ' (시스템과 자동 연동)' : ''}
                </p>
              </div>
            </section>

            <section className="rounded-ios-xl overflow-hidden bg-ios-elevated shadow-ios">
              <div className="px-4 py-3 border-b border-ios-separator/50">
                <h2 className="text-[13px] font-semibold text-ios-label-secondary uppercase tracking-wide">
                  자동화
                </h2>
              </div>
              <div>
                <ToggleSetting
                  label="모니터 변경 시 자동 복원"
                  description="모니터가 추가되거나 제거될 때 마지막으로 복원한 레이아웃을 자동으로 다시 적용합니다."
                  checked={settings.autoRestore}
                  onChange={(v) => handleSettingChange('autoRestore', v)}
                />
                <div className="border-t border-ios-separator/30" />
                <ToggleSetting
                  label="복원 전 확인 메시지"
                  description="레이아웃 복원 전에 확인 대화 상자를 표시합니다. (비활성화하면 즉시 복원)"
                  checked={settings.askBeforeRestore}
                  onChange={(v) => handleSettingChange('askBeforeRestore', v)}
                />
              </div>
            </section>

            <section className="rounded-ios-xl overflow-hidden bg-ios-elevated shadow-ios">
              <div className="px-4 py-3 border-b border-ios-separator/50">
                <h2 className="text-[13px] font-semibold text-ios-label-secondary uppercase tracking-wide">
                  정보
                </h2>
              </div>
              <div className="p-4 space-y-0 text-sm">
                <div className="flex justify-between items-center py-3">
                  <span className="text-ios-label-secondary">버전</span>
                  <span className="text-ios-label font-medium">v0.3.0</span>
                </div>
                <div className="flex justify-between items-start gap-4 py-3 border-t border-ios-separator/30">
                  <span className="text-ios-label-secondary flex-shrink-0">저장 위치</span>
                  <span className="text-ios-label font-mono text-xs text-right break-all">
                    %APPDATA%\resurrection
                  </span>
                </div>
              </div>
              <div className="mx-4 mb-4 p-3 bg-ios-secondary/50 rounded-ios text-xs text-ios-label-secondary leading-relaxed">
                창을 닫아도 트레이에서 계속 실행됩니다.
                트레이 아이콘을 더블클릭하거나 우클릭 → 열기로 다시 표시할 수 있습니다.
              </div>
            </section>
          </div>
        )}
      </main>

      {hoverPreview && createPortal(
        (() => {
          const popupPos = getPopupPosition(hoverPreview.anchorRect);
          const monitorRows = getMonitorRows(hoverPreview.layout);
          const showMonitorDetails = monitorRows.length >= 2;

          return (
            <div
              ref={hoverPopupRef}
              onMouseEnter={keepHoverPreviewVisible}
              onMouseLeave={hideHoverPreviewImmediately}
              className="rounded-xl border border-ios-separator/60 bg-ios-elevated shadow-ios z-[9999] p-3"
              style={{
                position: 'fixed',
                left: popupPos.left,
                top: popupPos.top,
                width: popupPos.width,
                maxHeight: popupPos.maxHeight,
                overflow: 'auto',
              }}
            >
              <p className="text-xs font-semibold text-ios-label-secondary uppercase tracking-wide mb-2">
                저장된 창 목록
              </p>
              {hoverPreview.layout.windows.length === 0 ? (
                <p className="text-xs text-ios-label-secondary">저장된 창 정보가 없습니다.</p>
              ) : (
                <ul className="max-h-44 overflow-auto space-y-1.5">
                  {hoverPreview.layout.windows.map((win, wIdx) => (
                    <li key={`${hoverPreview.layout.id}-hover-${wIdx}`} className="text-xs">
                      <p className="text-ios-label truncate">{win.title}</p>
                      <p className="text-ios-label-tertiary truncate">{win.processName}</p>
                    </li>
                  ))}
                </ul>
              )}

              {showMonitorDetails && (
                <>
                  <div className="border-t border-ios-separator/40 mt-3 pt-3">
                    <p className="text-xs font-semibold text-ios-label-secondary uppercase tracking-wide mb-2">
                      모니터 상세 정보
                    </p>
                    <ul className="space-y-2">
                      {monitorRows.map((monitor) => (
                        <li key={`hover-monitor-${hoverPreview.layout.id}-${monitor.id}`} className="text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-ios-label">{formatMonitorModel(monitor.model)}</span>
                            {monitor.primary && (
                              <span className="text-[10px] bg-ios-blue/20 text-ios-blue px-1.5 py-0.5 rounded">
                                주 모니터
                              </span>
                            )}
                          </div>
                          <p className="text-ios-label-tertiary">
                            해상도 {monitor.width || '-'} × {monitor.height || '-'} · 배율 {monitor.scaleFactor.toFixed(2)}
                          </p>
                          <p className="text-ios-label-tertiary">
                            위치 {monitor.x}, {monitor.y} · 회전 {monitor.rotation}° · {monitor.internal ? '내장' : '외장'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          );
        })(),
        document.body
      )}

      {/* 상태 표시줄 - iOS 스타일 */}
      {statusMsg && (
        <div
          className={`flex-shrink-0 border-t px-5 py-2.5 text-sm font-medium transition-all duration-ios ${
            statusType === 'err'
              ? 'bg-ios-red/15 border-ios-separator text-ios-red'
              : 'glass border-ios-separator/50 text-ios-green'
          }`}
        >
          {statusType === 'err' ? '⚠ ' : '✓ '}
          {statusMsg}
        </div>
      )}
    </div>
  );
}

// ── 토글 설정 컴포넌트 ──────────────────────────────────────

interface ToggleSettingProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: ToggleSettingProps) {
  return (
    <div className="flex items-start justify-between px-4 py-4 gap-4 hover:bg-ios-secondary/30 transition-colors duration-ios">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-ios-label">{label}</p>
        <p className="text-[13px] text-ios-label-secondary mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-[51px] h-[31px] rounded-[16px] transition-all duration-ios ease-ios mt-0.5 active:scale-[0.97] ${
          checked ? 'bg-ios-green' : 'bg-ios-tertiary'
        }`}
        aria-checked={checked}
        role="switch"
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-ios transition-transform duration-ios ease-ios ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
