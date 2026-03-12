import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import type { Layout, Settings, WindowInfo } from './api';

type Tab = 'layouts' | 'preview' | 'settings';

export default function App() {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [settings, setSettings] = useState<Settings>({
    autoRestore: false,
    askBeforeRestore: true,
    lastLayoutId: null,
  });
  const [newLayoutName, setNewLayoutName] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('layouts');
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [previewWindows, setPreviewWindows] = useState<WindowInfo[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [layoutData, settingsData] = await Promise.all([
      api.getLayouts(),
      api.getSettings(),
    ]);
    setLayouts(layoutData);
    setSettings(settingsData);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    await api.deleteLayout(layout.id);
    setLayouts((prev) => prev.filter((l) => l.id !== layout.id));
    if (settings.lastLayoutId === layout.id) {
      setSettings((prev) => ({ ...prev, lastLayoutId: null }));
    }
    showStatus(`"${layout.name}" 삭제됨`);
  };

  const handleSettingChange = async (
    key: keyof Settings,
    value: boolean
  ) => {
    const updated = await api.updateSettings({ [key]: value });
    setSettings(updated);
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const wins = await api.captureWindows();
      setPreviewWindows(wins);
    } catch (e) {
      showStatus(`현재 창 목록 가져오기 실패: ${e}`, 'err');
    } finally {
      setPreviewLoading(false);
    }
  };

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
      <header className="glass border-b border-ios-separator/50 px-5 py-3 flex items-center gap-3 flex-shrink-0">
        <img
          src="./favicon-32x32.png"
          alt="리저렉션"
          className="w-8 h-8 rounded-[10px] object-contain shadow-ios"
        />
        <div>
          <span className="font-semibold text-ios-label text-lg tracking-tight">리저렉션</span>
          <span className="text-xs text-ios-label-secondary ml-2">듀얼모니터 창 배치 복원</span>
        </div>
      </header>

      {/* 세그먼트 컨트롤 - iOS 스타일 */}
      <nav className="bg-ios-bg px-4 py-4 flex-shrink-0">
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
            <section className="rounded-ios-xl overflow-hidden bg-ios-elevated shadow-ios">
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
                  {layouts.map((layout, idx) => (
                    <li
                      key={layout.id}
                      className={`flex items-center justify-between px-4 py-3.5 transition-colors duration-ios hover:bg-ios-secondary/50 active:bg-ios-secondary ${
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
                        <div className="text-xs text-ios-label-secondary mt-0.5">
                          창 {layout.windows.length}개 · {formatDate(layout.createdAt)}
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
                  ))}
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
                className="text-sm bg-ios-blue hover:opacity-90 disabled:opacity-50 px-4 py-2 rounded-ios font-semibold transition-all duration-ios active:scale-[0.98]"
              >
                {previewLoading ? '불러오는 중...' : '새로고침'}
              </button>
            </div>

            {previewWindows.length === 0 && !previewLoading && (
              <div className="rounded-ios-xl overflow-hidden bg-ios-elevated py-16 text-center shadow-ios">
                <div className="text-5xl mb-4 opacity-60">🪟</div>
                <p className="text-ios-label-secondary text-sm">
                  새로고침 버튼을 눌러 현재 열린 창 목록을 가져오세요.
                </p>
                {!window.api && (
                  <p className="text-ios-red text-xs mt-3 font-medium">
                    ⚠️ node-window-manager가 로드되지 않았습니다.
                  </p>
                )}
              </div>
            )}

            {previewWindows.length > 0 && (
              <div className="rounded-ios-xl overflow-hidden bg-ios-elevated shadow-ios">
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
                <div className="px-4 py-3 border-t border-ios-separator/50 bg-ios-secondary/30">
                  <p className="text-xs text-ios-label-secondary">
                    총 {previewWindows.length}개의 창
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 설정 탭 ── */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-lg mx-auto">
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
                  <span className="text-ios-label font-medium">v0.1.0</span>
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
