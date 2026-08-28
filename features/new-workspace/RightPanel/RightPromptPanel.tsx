import React, { useEffect, useState } from 'react';
import { FileJson, Trash2, RefreshCw } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { apiClient, HistoryItem } from '../lib/api';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

export const RightPromptPanel: React.FC = () => {
  const { currentAsset } = useWorkspace();
  const [historyItem, setHistoryItem] = useState<HistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptId = currentAsset?.source?.promptId;

  const load = async () => {
    if (!promptId) {
      setHistoryItem(null);
      setError('Select a generation output to inspect its recorded prompt.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const history = await apiClient.getHistory(64);
      const item = history[promptId];
      if (!item) throw new Error('Prompt record is no longer present in generation history.');
      setHistoryItem(item);
    } catch (e) {
      setHistoryItem(null);
      setError(e instanceof Error ? e.message : 'Unable to load prompt history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [promptId]);

  const handleDelete = async () => {
    if (!promptId) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.deleteHistory(promptId);
      setHistoryItem(null);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete prompt history.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#101115] text-xs">
      <div className="flex items-center justify-between border-b border-[#21242c] p-2.5">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-[#f5c518]" />
          <span className="font-bold text-[#f3f4f6]">Prompt</span>
        </div>
        <div className="flex items-center gap-1">
          <SimpleTooltip label="Refresh prompt">
            <button onClick={() => void load()} className="rounded-lg p-1.5 text-[#8e95a5] hover:bg-[#181a22] hover:text-[#f3f4f6]">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </SimpleTooltip>
          <SimpleTooltip label="Delete history record">
            <button onClick={() => void handleDelete()} disabled={!promptId || loading} className="rounded-lg p-1.5 text-[#8e95a5] hover:bg-[#29181b] hover:text-[#fca5a5] disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </SimpleTooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {error && <div className="rounded-xl border border-[#ef4444]/30 bg-[#1a1214] p-3 text-[#fca5a5]">{error}</div>}
        {historyItem && (
          <>
            <div className="rounded-xl border border-[#242834] bg-[#14161c] p-3 space-y-2">
              <div className="flex justify-between"><span className="text-[#7f8796]">Status</span><span className="text-[#f5c518]">{historyItem.status?.status_str ?? 'Unknown'}</span></div>
              <div className="flex justify-between"><span className="text-[#7f8796]">Completed</span><span>{historyItem.status?.completed ? 'Yes' : 'No'}</span></div>
            </div>
            <pre className="rounded-xl border border-[#242834] bg-[#0b0c0f] p-3 text-[10px] leading-relaxed text-[#cbd5e1] overflow-auto whitespace-pre-wrap">
              {JSON.stringify(historyItem.prompt, null, 2)}
            </pre>
            <div className="rounded-xl border border-[#242834] bg-[#14161c] p-3">
              <div className="mb-2 font-semibold text-[#cbd5e1]">Recorded Outputs</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[10px] text-[#8e95a5]">{JSON.stringify(historyItem.outputs, null, 2)}</pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
