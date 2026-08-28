import React from 'react';
import { Cpu, HardDrive, Server, Activity } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { GpuVramLineChart } from '@/components/monitoring/GpuVramLineChart';

const value = (v: unknown) => v == null ? 'Unavailable' : String(v);

export const SystemPage: React.FC = () => {
  const { systemStats, assets } = useWorkspace();
  return (
    <div className="flex-1 overflow-y-auto bg-[#0d0e12] p-6 text-[#f3f4f6]">
      <div className="mx-auto max-w-6xl space-y-5">
        <div><h1 className="text-2xl font-black">System</h1><p className="mt-1 text-xs text-[#8e95a5]">Live runtime information from FastAPI.</p></div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#242834] bg-[#14161c] p-4"><Server className="mb-3 h-4 w-4 text-[#f5c518]" /><div className="text-[10px] text-[#707786]">Status</div><div className="mt-1 text-sm font-bold">{systemStats.status}</div></div>
          <div className="rounded-2xl border border-[#242834] bg-[#14161c] p-4"><Cpu className="mb-3 h-4 w-4 text-[#f5c518]" /><div className="text-[10px] text-[#707786]">GPU</div><div className="mt-1 truncate text-sm font-bold">{value(systemStats.gpu)}</div></div>
          <div className="rounded-2xl border border-[#242834] bg-[#14161c] p-4"><Activity className="mb-3 h-4 w-4 text-[#f5c518]" /><div className="text-[10px] text-[#707786]">VRAM</div><div className="mt-1 text-sm font-bold">{systemStats.vramUsedGb != null && systemStats.vramTotalGb != null ? `${systemStats.vramUsedGb} / ${systemStats.vramTotalGb} GB` : 'Unavailable'}</div></div>
          <div className="rounded-2xl border border-[#242834] bg-[#14161c] p-4"><HardDrive className="mb-3 h-4 w-4 text-[#f5c518]" /><div className="text-[10px] text-[#707786]">History Outputs</div><div className="mt-1 text-sm font-bold">{assets.length}</div></div>
        </div>

        {/* Real-time Recharts Line Chart */}
        <div className="rounded-2xl border border-[#242834] bg-[#14161c] p-5 shadow-lg">
          <GpuVramLineChart height={260} autoPoll pollIntervalMs={3000} />
        </div>

        <div className="rounded-2xl border border-[#242834] bg-[#14161c] p-4 space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-[#707786]">FastAPI</span><span>{value(systemStats.apiVersion)}</span></div>
          <div className="flex justify-between"><span className="text-[#707786]">Python</span><span>{value(systemStats.pythonVersion)}</span></div>
          <div className="flex justify-between"><span className="text-[#707786]">PyTorch</span><span>{value(systemStats.torchVersion)}</span></div>
          <div className="flex justify-between"><span className="text-[#707786]">Queue</span><span>{systemStats.queueRunning} running / {systemStats.queuePending} pending</span></div>
          <div className="flex justify-between"><span className="text-[#707786]">Host</span><span className="font-mono">{systemStats.host}</span></div>
        </div>
      </div>
    </div>
  );
};
