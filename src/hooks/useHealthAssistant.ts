// ============================================================
// ZCare AI — React state for the Health Assistant page
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ChatMessageView,
  DataSourceKind,
  DeviceCapabilities,
  DownloadProgress,
  ModelPhase,
  RuntimeChoice,
} from '@/types/ai.types';
import { detectCapabilities } from '@/services/ai/capabilities';
import { HealthAssistantEngine } from '@/services/ai/chat.service';
import { createHealthDataSource } from '@/services/ai/data-source.factory';
import { AssistantAuthError } from '@/services/ai/health-data.repository';
import { localModel } from '@/services/ai/model.service';
import {
  EMBEDDING_MODEL,
  STANDARD_MODEL,
  budgetFor,
  chooseRuntime,
  downloadSizeMB,
  type RuntimePreference,
} from '@/services/ai/models.config';

// ------------------------------------------------------------
// Per-device preferences (convenience only; safe if storage is blocked)
// ------------------------------------------------------------
const PREF_KEY = 'zcare_ai_prefs_v1';
interface StoredPrefs extends RuntimePreference {
  recordsOnly: boolean;
}
const DEFAULT_PREFS: StoredPrefs = { forceCpu: false, recordsOnly: false };

function readPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<StoredPrefs>;
    return { forceCpu: p.forceCpu === true, recordsOnly: p.recordsOnly === true };
  } catch {
    return DEFAULT_PREFS;
  }
}
function writePrefs(p: StoredPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable — preferences just won't persist */
  }
}

// ------------------------------------------------------------
// In-memory session (survives navigation inside the app, never persisted)
// ------------------------------------------------------------
interface Session {
  key: string;
  engine: HealthAssistantEngine;
  dataSourceKind: DataSourceKind;
  messages: ChatMessageView[];
  listeners: Set<() => void>;
}
let session: Session | null = null;

function getSession(userId: string, isDemoUser: boolean): Session {
  const key = `${userId}|${isDemoUser ? 'demo' : 'user'}`;
  if (session?.key === key) return session;
  // Different account (or first use): drop everything from the previous one.
  if (session) {
    session.engine.reset();
    localModel.terminate();
  }
  const dataSource = createHealthDataSource({ userId, isDemoUser });
  session = {
    key,
    engine: new HealthAssistantEngine({ dataSource, generator: null, embedder: null, budget: budgetFor(null) }),
    dataSourceKind: dataSource.kind,
    messages: [],
    listeners: new Set(),
  };
  return session;
}

function setMessages(s: Session, update: (m: ChatMessageView[]) => ChatMessageView[]) {
  s.messages = update(s.messages);
  s.listeners.forEach(l => l());
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `m-${Date.now()}-${Math.random()}`);
const MB = 1048576;

/** User-facing explanation for a model failure (runtime details only; never patient data). */
function explainModelError(message: string): string {
  if (/out of memory|oom|allocat|memory/i.test(message)) return 'This device ran out of memory while running the AI model.';
  if (/quota|storage|QuotaExceeded/i.test(message)) return 'There is not enough free browser storage to save the AI model.';
  if (/fetch|network|load failed|NetworkError|status\s*[45]\d\d/i.test(message)) return 'The AI model download failed. Please check your internet connection and try again.';
  if (/webgpu|adapter|gpudevice|device lost|d3d|vulkan|metal|shader/i.test(message)) return 'The graphics chip in this device could not run the AI model.';
  if (/could not start in this browser/i.test(message)) return 'The AI engine could not start in this browser.';
  return 'The AI model could not be started on this device.';
}

// ------------------------------------------------------------
// Hook
// ------------------------------------------------------------
export function useHealthAssistant({ userId, isDemoUser }: { userId: string; isDemoUser: boolean }) {
  const s = useMemo(() => getSession(userId, isDemoUser), [userId, isDemoUser]);
  const messages = useSyncExternalStore(
    useCallback(listener => {
      s.listeners.add(listener);
      return () => s.listeners.delete(listener);
    }, [s]),
    () => s.messages,
  );

  const [phase, setPhase] = useState<ModelPhase>('detecting');
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [runtime, setRuntime] = useState<RuntimeChoice | null>(null);
  const [prefs, setPrefsState] = useState<StoredPrefs>(readPrefs);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<{ summary: string; detail: string } | null>(null);
  const [semantic, setSemantic] = useState<'off' | 'loading' | 'on' | 'failed'>('off');
  const [loadSeconds, setLoadSeconds] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const savePrefs = useCallback((next: StoredPrefs) => {
    writePrefs(next);
    setPrefsState(next);
  }, []);

  const startSemanticSearch = useCallback(() => {
    setSemantic('loading');
    localModel
      .embed(['warm up'])
      .then(() => {
        s.engine.setEmbedder(localModel);
        if (mounted.current) setSemantic('on');
      })
      .catch(() => {
        s.engine.setEmbedder(null);
        if (mounted.current) setSemantic('failed');
      });
  }, [s]);

  const loadModel = useCallback(
    async (choice: RuntimeChoice, fromCache: boolean) => {
      setError(null);
      setPhase(fromCache ? 'initializing' : 'downloading');
      const expectedBytes = choice.variant.sizeMB * MB;
      setProgress({ loadedMB: 0, totalMB: choice.variant.sizeMB, percent: 0 });
      if (!fromCache) {
        try {
          await navigator.storage?.persist?.();
        } catch {
          /* best effort: reduces the chance the browser evicts the cached model */
        }
      }
      try {
        const { ms } = await localModel.load(choice.model, choice.variant, (loaded, total) => {
          if (!mounted.current) return;
          const denominator = Math.max(total, expectedBytes);
          const percent = Math.min(100, Math.round((loaded / denominator) * 100));
          setProgress({ loadedMB: Math.round(loaded / MB), totalMB: Math.round(denominator / MB), percent });
          if (loaded >= denominator * 0.995) setPhase('initializing');
        });
        s.engine.setGenerator(localModel);
        if (!mounted.current) return;
        setLoadSeconds(Math.round(ms / 100) / 10);
        setPhase('ready');
        startSemanticSearch();
      } catch (err) {
        s.engine.setGenerator(null);
        const detail = err instanceof Error ? err.message : String(err);
        if (!mounted.current) return;
        setError({ summary: explainModelError(detail), detail });
        setPhase('error');
      }
    },
    [s, startSemanticSearch],
  );

  /** Re-evaluates which model fits the device and loads it if already cached. */
  const initialise = useCallback(
    async (caps: DeviceCapabilities, p: StoredPrefs) => {
      const choice = chooseRuntime(caps, p);
      setRuntime(choice);
      s.engine.setBudget(budgetFor(p.recordsOnly ? null : choice));
      if (p.recordsOnly) {
        s.engine.setGenerator(null);
        setPhase('records-only');
        return;
      }
      if (!choice) {
        s.engine.setGenerator(null);
        setPhase('unsupported');
        return;
      }
      if (s.engine.hasGenerator && localModel.isLoaded) {
        setPhase('ready');
        return;
      }
      setPhase('checking-cache');
      const cached = await localModel.isCached(choice.model.id, choice.variant).catch(() => false);
      if (!mounted.current) return;
      if (cached) await loadModel(choice, true);
      else setPhase('needs-consent');
    },
    [s, loadModel],
  );

  // Detect device capabilities when the assistant opens.
  useEffect(() => {
    let cancelled = false;
    detectCapabilities().then(caps => {
      if (cancelled) return;
      setCapabilities(caps);
      void initialise(caps, readPrefs());
    });
    return () => {
      cancelled = true;
    };
  }, [initialise]);

  // ---------------- actions ----------------
  const startDownload = useCallback(() => {
    if (runtime) void loadModel(runtime, false);
  }, [runtime, loadModel]);

  const retry = useCallback(() => {
    if (capabilities) void initialise(capabilities, prefs);
  }, [capabilities, prefs, initialise]);

  const switchToCpu = useCallback(() => {
    if (!capabilities) return;
    const next = { ...prefs, forceCpu: true, recordsOnly: false, model: 'standard' as const };
    savePrefs(next);
    localModel.terminate();
    s.engine.setGenerator(null);
    const choice = chooseRuntime(capabilities, next);
    setRuntime(choice);
    s.engine.setBudget(budgetFor(choice));
    if (choice) void loadModel(choice, false);
    else setPhase('unsupported');
  }, [capabilities, prefs, savePrefs, s, loadModel]);

  const switchToRecordsOnly = useCallback(() => {
    savePrefs({ ...prefs, recordsOnly: true });
    s.engine.setGenerator(null);
    s.engine.setBudget(budgetFor(null));
    setPhase('records-only');
  }, [prefs, savePrefs, s]);

  const enableAi = useCallback(() => {
    const next = { ...prefs, recordsOnly: false };
    savePrefs(next);
    if (capabilities) void initialise(capabilities, next);
  }, [prefs, savePrefs, capabilities, initialise]);

  const setModelPreference = useCallback(
    (forceCpu: boolean) => {
      const next = { ...prefs, forceCpu };
      savePrefs(next);
      localModel.terminate();
      s.engine.setGenerator(null);
      setSemantic('off');
      if (capabilities) void initialise(capabilities, next);
    },
    [prefs, savePrefs, s, capabilities, initialise],
  );

  const removeDownloadedModels = useCallback(async () => {
    const refs = [
      ...Object.values(STANDARD_MODEL.variants).map(v => ({ modelId: STANDARD_MODEL.id, dtype: v!.dtype, device: v!.device })),
      { modelId: EMBEDDING_MODEL.id, dtype: EMBEDDING_MODEL.dtype, device: EMBEDDING_MODEL.device },
    ];
    s.engine.setGenerator(null);
    s.engine.setEmbedder(null);
    setSemantic('off');
    try {
      await localModel.clearCache(refs);
    } finally {
      localModel.terminate();
    }
    if (capabilities) void initialise(capabilities, prefs);
  }, [s, capabilities, prefs, initialise]);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setBusy(true);
      const assistantId = newId();
      const update = (patch: Partial<ChatMessageView>) =>
        setMessages(s, list => list.map(m => (m.id === assistantId ? { ...m, ...patch } : m)));
      setMessages(s, list => [
        ...list,
        { id: newId(), role: 'user', text: q, createdAt: Date.now() },
        { id: assistantId, role: 'assistant', text: '', createdAt: Date.now(), pending: true, stage: 'understanding' },
      ]);
      try {
        const answer = await s.engine.ask(q, {
          onStage: stage => update({ stage }),
          onFacts: preview => update({ preview }),
          onText: text => update({ text }),
        });
        update({ pending: false, text: answer.text, answer, stage: undefined });
        if (answer.modelError && mounted.current) {
          setError({ summary: explainModelError(answer.modelError), detail: answer.modelError });
          setPhase('error');
          localModel.terminate();
        }
      } catch (err) {
        const message =
          err instanceof AssistantAuthError
            ? err.message
            : 'Something went wrong while reading your records. Please try again.';
        update({ pending: false, stage: undefined, error: message });
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [busy, s],
  );

  const stop = useCallback(() => s.engine.stop(), [s]);

  const clear = useCallback(() => {
    s.engine.stop();
    s.engine.reset();
    setMessages(s, () => []);
  }, [s]);

  const downloadMB = runtime ? downloadSizeMB(runtime.variant) : null;

  return {
    phase,
    capabilities,
    runtime,
    prefs,
    progress,
    error,
    semantic,
    loadSeconds,
    busy,
    messages,
    downloadMB,
    dataSourceKind: s.dataSourceKind,
    canSend: !busy && (phase === 'ready' || phase === 'records-only'),
    actions: { startDownload, retry, switchToCpu, switchToRecordsOnly, enableAi, setModelPreference, removeDownloadedModels, send, stop, clear },
  };
}

export type HealthAssistant = ReturnType<typeof useHealthAssistant>;
