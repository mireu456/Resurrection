import { Display, screen } from 'electron';
import { MonitorContext } from './types';

type NormalizedDisplay = {
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

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isGenericMonitorLabel(normalizedLabel: string): boolean {
  if (!normalizedLabel) return true;
  const genericLabels = new Set([
    'unknown',
    'unknown monitor',
    'unknown-model',
    'display',
    'generic pnp monitor',
    'generic monitor',
  ]);
  return genericLabels.has(normalizedLabel);
}

function buildFallbackModel(display: Display): string {
  const kind = display.internal ? '내장 디스플레이' : '외장 디스플레이';
  return `${kind} ${display.size.width}x${display.size.height} (#${display.id})`;
}

function resolveModelName(display: Display): string {
  // 원인: Windows 환경에 따라 display.label 이 비어 있거나 generic 값으로 내려올 수 있다.
  // 대응: label이 신뢰 가능한 값일 때만 사용하고, 아니면 읽기 가능한 fallback 모델명을 생성한다.
  const normalizedLabel = normalizeText(display.label || '');
  if (!isGenericMonitorLabel(normalizedLabel)) {
    return normalizedLabel;
  }
  return buildFallbackModel(display);
}

function normalizeDisplay(display: Display, primaryDisplayId: number): NormalizedDisplay {
  return {
    id: display.id,
    model: resolveModelName(display),
    internal: Boolean(display.internal),
    width: display.size.width,
    height: display.size.height,
    scaleFactor: Number(display.scaleFactor ?? 1),
    x: display.bounds.x,
    y: display.bounds.y,
    rotation: Number(display.rotation ?? 0),
    primary: display.id === primaryDisplayId,
  };
}

function strictSignature(d: NormalizedDisplay): string {
  // strict 키는 위치/배율까지 포함해 "현재 물리 배치"에 가깝게 식별한다.
  return [
    d.model,
    d.internal ? 'i1' : 'i0',
    `s${d.width}x${d.height}`,
    `sf${d.scaleFactor.toFixed(2)}`,
    `b${d.x},${d.y}`,
    `r${d.rotation}`,
    d.primary ? 'p1' : 'p0',
  ].join('|');
}

function fuzzySignature(d: NormalizedDisplay): string {
  // fuzzy 키는 작은 환경 변화(예: 위치 변경)에 덜 민감하도록 최소 정보만 쓴다.
  return [
    d.model,
    d.internal ? 'i1' : 'i0',
    `s${d.width}x${d.height}`,
  ].join('|');
}

function joinKey(prefix: string, parts: string[]): string {
  return `${prefix}:${parts.length}:${parts.join('||')}`;
}

export function getCurrentMonitorContext(): MonitorContext {
  // 배열 순서가 바뀌어도 같은 키가 나오도록 시그니처를 정렬한다.
  const primaryDisplayId = screen.getPrimaryDisplay().id;
  const displays = screen.getAllDisplays().map((display) => normalizeDisplay(display, primaryDisplayId));
  const strictParts = displays.map(strictSignature).sort();
  const fuzzyParts = displays.map(fuzzySignature).sort();
  const sortedMonitors = [...displays].sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return a.id - b.id;
  });

  return {
    strictKey: joinKey('strict', strictParts),
    fuzzyKey: joinKey('fuzzy', fuzzyParts),
    // 다중 모니터 환경에서 "연결된 모든 모델"을 보이기 위해 중복 제거하지 않는다.
    monitorModels: sortedMonitors.map((d) => d.model),
    monitorSignatures: strictParts,
    capturedAt: Date.now(),
    monitors: sortedMonitors,
  };
}
