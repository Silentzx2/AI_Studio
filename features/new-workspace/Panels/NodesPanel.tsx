import React, { useState, useRef, useEffect } from 'react';
import { GitBranch, Play, Download, Trash2, Layers, ZoomIn, ZoomOut } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { GraphNodeInstance, GraphConnection, NodeDef } from '../types';
import { NodeList } from './NodeList';

export const NodesPanel: React.FC = () => {
  const { systemStats, queueWorkflow, activeTask } = useWorkspace();

  const [isNodeListOpen, setIsNodeListOpen] = useState(true);
  const [nodes, setNodes] = useState<GraphNodeInstance[]>([]);

  const [connections, setConnections] = useState<GraphConnection[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const workflowInputRef = useRef<HTMLInputElement>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingNodeRef = useRef<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);

  // Queue the graph through the actual FastAPI prompt endpoint. No local execution simulation.
  const handleQueuePrompt = async () => {
    setQueueError(null);
    if (nodes.length === 0) {
      setQueueError('Add at least one real FastAPI node before queueing.');
      return;
    }
    if (systemStats.status !== 'online') {
      setQueueError('FastAPI backend is offline.');
      return;
    }

    const workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
    nodes.forEach(n => {
      workflow[n.id] = { class_type: n.type, inputs: { ...n.inputs } };
    });

    for (const connection of connections) {
      const target = workflow[connection.toNodeId];
      if (!target) continue;
      const source = nodes.find(node => node.id === connection.fromNodeId);
      if (!source) continue;
      const sourceIndex = Object.keys(source.outputs).indexOf(connection.fromOutput);
      target.inputs[connection.toInput] = [connection.fromNodeId, Math.max(0, sourceIndex)];
    }

    await queueWorkflow(workflow, 'text-to-3d', 'Custom generation workflow');
    setExecutingNodeId(null);
  };

  useEffect(() => {
    const activeNode = activeTask?.activeNode;
    if (!activeNode) {
      setExecutingNodeId(null);
      return;
    }
    const match = nodes.find(node => node.type === activeNode);
    setExecutingNodeId(match?.id ?? null);
  }, [activeTask?.activeNode, nodes]);

  const handleImportApiWorkflow = async (file: File) => {
    setQueueError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Workflow JSON must be an object keyed by FastAPI node id.');
      }
      const graph = parsed as Record<string, unknown>;
      const importedNodes: GraphNodeInstance[] = [];
      const importedConnections: GraphConnection[] = [];

      for (const [nodeId, raw] of Object.entries(graph)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const node = raw as Record<string, unknown>;
        if (typeof node.class_type !== 'string') continue;
        const rawInputs = node.inputs && typeof node.inputs === 'object'
          ? node.inputs as Record<string, unknown>
          : {};
        const outputNames = Object.keys(rawInputs)
          .filter(key => Array.isArray(rawInputs[key]) && (rawInputs[key] as unknown[]).length >= 2)
          .map((_, index) => `output_${index}`);

        importedNodes.push({
          id: nodeId,
          type: node.class_type,
          title: typeof (node._meta as Record<string, unknown> | undefined)?.title === 'string'
            ? String((node._meta as Record<string, unknown>).title)
            : node.class_type,
          category: 'Imported Workflow',
          x: 420 + importedNodes.length * 290,
          y: 120 + (importedNodes.length % 3) * 180,
          width: 250,
          height: 190,
          inputs: { ...rawInputs },
          inputSpecs: Object.keys(rawInputs).map(name => ({ name, type: Array.isArray(rawInputs[name]) ? 'LINK' : typeof rawInputs[name] === 'number' ? 'FLOAT' : typeof rawInputs[name] === 'boolean' ? 'BOOLEAN' : 'STRING', required: true })),
          outputs: outputNames.reduce<Record<string, unknown>>((acc, name) => {
            acc[name] = name;
            return acc;
          }, {}),
          status: 'idle'
        });

        for (const [inputName, value] of Object.entries(rawInputs)) {
          if (Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'number') {
            importedConnections.push({
              id: `${nodeId}:${inputName}`,
              fromNodeId: value[0],
              fromOutput: `output_${value[1]}`,
              toNodeId: nodeId,
              toInput: inputName
            });
          }
        }
      }

      if (importedNodes.length === 0) {
        throw new Error('No API-format FastAPI nodes were found in this JSON.');
      }
      setNodes(importedNodes);
      setConnections(importedConnections);
      setSelectedNodeId(importedNodes[0]?.id ?? null);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Unable to import generation workflow JSON.');
    } finally {
      if (workflowInputRef.current) workflowInputRef.current.value = '';
    }
  };

  const handleAddNodeFromDef = (def: NodeDef, pos?: { x: number; y: number }) => {
    const newNode: GraphNodeInstance = {
      id: `node_${Date.now()}`,
      type: def.id,
      title: def.displayName || def.name,
      category: def.category,
      x: pos ? pos.x : (isNodeListOpen ? 360 : 150) + Math.random() * 80,
      y: pos ? pos.y : 100 + Math.random() * 80,
      width: 250,
      height: 190,
      inputs: def.inputs.reduce((acc, input) => ({ ...acc, [input.name]: input.default ?? '' }), {}),
      inputSpecs: def.inputs,
      outputs: def.outputs.reduce((acc, out) => ({ ...acc, [out.name]: `out_${Date.now()}` }), {}),
      status: 'idle'
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  };

  const handleDeleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setConnections(prev => prev.filter(c => c.fromNodeId !== id && c.toNodeId !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const handleExportWorkflowJSON = () => {
    const workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
    nodes.forEach(node => {
      workflow[node.id] = { class_type: node.type, inputs: { ...node.inputs } };
    });
    connections.forEach(connection => {
      const target = workflow[connection.toNodeId];
      const source = nodes.find(node => node.id === connection.fromNodeId);
      if (!target || !source) return;
      const sourceIndex = Object.keys(source.outputs).indexOf(connection.fromOutput);
      target.inputs[connection.toInput] = [connection.fromNodeId, Math.max(0, sourceIndex)];
    });
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'Nexus_FastAPI_Workflow.json';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Node Drag handlers
  const handleNodeMouseDown = (e: React.MouseEvent, node: GraphNodeInstance) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    draggingNodeRef.current = {
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      nodeX: node.x,
      nodeY: node.y
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeRef.current) {
      const dx = (e.clientX - draggingNodeRef.current.startX) / zoom;
      const dy = (e.clientY - draggingNodeRef.current.startY) / zoom;
      const nodeId = draggingNodeRef.current.id;

      setNodes(prev => prev.map(n => {
        if (n.id === nodeId) {
          return {
            ...n,
            x: Math.round(draggingNodeRef.current!.nodeX + dx),
            y: Math.round(draggingNodeRef.current!.nodeY + dy)
          };
        }
        return n;
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    draggingNodeRef.current = null;
  };

  // Canvas Drag-and-drop for nodes from NodeList
  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dataJson = e.dataTransfer.getData('application/json');
    if (dataJson) {
      try {
        const def: NodeDef = JSON.parse(dataJson);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const dropX = Math.round((e.clientX - rect.left) / zoom);
          const dropY = Math.round((e.clientY - rect.top) / zoom);
          handleAddNodeFromDef(def, { x: dropX, y: dropY });
        }
      } catch (err) {
        // Fallback
      }
    }
  };

  return (
    <div 
      id="workspace-node-graph"
      className="relative w-full h-full bg-[#0d0e12] overflow-hidden flex flex-col select-none"
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
    >
      {/* Top Node Graph Toolbar */}
      <div className="h-12 w-full bg-[#13151b] border-b border-[#232731] px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#f5c518]" />
            <span className="font-bold text-xs text-[#f3f4f6]">3D Generation Pipeline Graph Engine</span>
          </div>

          <div className="h-4 w-[1px] bg-[#292d39]" />

          {/* Toggle Node Library */}
          <button
            onClick={() => setIsNodeListOpen(!isNodeListOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isNodeListOpen
                ? 'bg-[#2b3140] text-[#f5c518] border border-[#3b4356]'
                : 'bg-[#1a1d24] text-[#cbd5e1] hover:bg-[#232834]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isNodeListOpen ? 'Close Node Palette' : 'Browse Node Definitions'}</span>
          </button>
          <input
            ref={workflowInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportApiWorkflow(file);
            }}
          />
          <button
            onClick={() => workflowInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a1d24] border border-[#2d313d] text-[#cbd5e1] hover:text-[#f5c518]"
            title="Import an API-format generation workflow JSON"
          >
            Import Workflow
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-[#181a22] border border-[#262a36] rounded-lg p-0.5">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
              className="p-1 text-[#8e95a5] hover:text-[#f3f4f6]"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[10px] font-mono text-[#cbd5e1]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(1.8, z + 0.1))}
              className="p-1 text-[#8e95a5] hover:text-[#f3f4f6]"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleExportWorkflowJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1d24] hover:bg-[#242833] text-xs text-[#cbd5e1] border border-[#2d313d]"
            title="Export standard generation workflow JSON"
          >
            <Download className="w-3.5 h-3.5 text-[#9ca3af]" />
            <span>Export JSON</span>
          </button>

          <button
            id="btn-run-graph"
            onClick={handleQueuePrompt}
            disabled={executingNodeId !== null || nodes.length === 0}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#f5c518] hover:bg-[#eab308] text-[#111216] text-xs font-bold shadow-md shadow-[#f5c518]/20 transition-all active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{executingNodeId ? 'Executing Pipeline...' : 'Queue Prompt'}</span>
          </button>
        </div>
      </div>

      {queueError && (
        <div className="absolute left-4 right-4 top-14 z-40 rounded-xl border border-[#ef4444]/40 bg-[#1b1215] text-[#fca5a5] px-3 py-2 text-xs shadow-xl">
          {queueError}
        </div>
      )}

      {/* Embedded Node Definitions Palette Sidebar */}
      <NodeList
        isOpen={isNodeListOpen}
        onToggle={() => setIsNodeListOpen(!isNodeListOpen)}
        onAddNode={(def, pos) => handleAddNodeFromDef(def, pos)}
      />

      {/* Interactive Infinite Canvas Grid */}
      <div 
        ref={canvasRef}
        className="relative flex-1 w-full h-full overflow-hidden bg-[radial-gradient(#1c202a_1px,transparent_1px)] [background-size:24px_24px]"
        onClick={() => setSelectedNodeId(null)}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center max-w-sm px-6">
              <GitBranch className="w-10 h-10 mx-auto mb-3 text-[#f5c518]/70" />
              <h3 className="text-sm font-semibold text-[#e5e7eb]">Real FastAPI graph</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#7f8796]">Add nodes from the live /object_info palette. The canvas does not ship with fake sample workflows.</p>
            </div>
          </div>
        )}

        {/* SVG Bezier Wire Connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          {connections.map((conn) => {
            const fromNode = nodes.find(n => n.id === conn.fromNodeId);
            const toNode = nodes.find(n => n.id === conn.toNodeId);
            if (!fromNode || !toNode) return null;

            const startX = fromNode.x + fromNode.width;
            const startY = fromNode.y + 70;
            const endX = toNode.x;
            const endY = toNode.y + 70;
            const dx = Math.abs(endX - startX) * 0.5;

            const path = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
            const isHot = executingNodeId === fromNode.id || executingNodeId === toNode.id;

            return (
              <g key={conn.id}>
                <path
                  d={path}
                  fill="none"
                  stroke={isHot ? '#f5c518' : '#3f4556'}
                  strokeWidth={isHot ? 3 : 2}
                  strokeDasharray={isHot ? '6,3' : 'none'}
                  className={isHot ? 'animate-pulse' : ''}
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const isExecutingNode = executingNodeId === node.id;

          return (
            <div
              key={node.id}
              id={`graph-node-${node.id}`}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              style={{
                transform: `translate(${node.x}px, ${node.y}px)`,
                width: `${node.width}px`
              }}
              className={`absolute rounded-xl bg-[#171920]/95 backdrop-blur-md border shadow-2xl transition-shadow z-20 cursor-move select-none ${
                isExecutingNode 
                  ? 'border-[#f5c518] ring-2 ring-[#f5c518]/50 shadow-[#f5c518]/25' 
                  : isSelected 
                  ? 'border-[#f5c518] ring-1 ring-[#f5c518]' 
                  : 'border-[#292e3b]'
              }`}
            >
              {/* Node Title Bar */}
              <div className="flex items-center justify-between px-3 py-2 rounded-t-xl bg-[#1e212b] border-b border-[#292e3b]">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    node.status === 'completed' ? 'bg-[#22c55e]' : isExecutingNode ? 'bg-[#f5c518] animate-ping' : 'bg-[#6b7280]'
                  }`} />
                  <span className="font-bold text-xs text-[#e5e7eb] truncate">{node.title}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase font-mono px-1 rounded bg-[#12141a] text-[#8e95a5]">{node.category}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNode(node.id);
                    }}
                    className="text-[#6b7280] hover:text-[#ef4444] p-0.5"
                    title="Delete Node"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Node Body / Widgets */}
              <div className="p-3 space-y-2 text-xs">
                {/* Inputs / widgets */}
                {(node.inputSpecs ?? Object.keys(node.inputs).map(name => ({ name, type: typeof node.inputs[name] === 'number' ? 'FLOAT' : typeof node.inputs[name] === 'boolean' ? 'BOOLEAN' : 'STRING' }))).map((spec) => {
                  const s = spec as { name: string; type: string; default?: unknown; min?: number; max?: number; step?: number; options?: string[] };
                  const value = node.inputs[s.name];
                  const isLink = Array.isArray(value) && value.length === 2;
                  const type = s.type.toUpperCase();
                  const updateValue = (next: unknown) => {
                    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, inputs: { ...n.inputs, [s.name]: next } } : n));
                  };

                  if (isLink) {
                    return (
                      <div key={s.name} className="flex items-center justify-between gap-2 text-[#cbd5e1]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#f5c518] border border-[#171920]" />
                          <span className="text-[11px] font-mono truncate">{s.name}</span>
                        </div>
                        <span className="text-[10px] text-[#7f8796] font-mono">linked</span>
                      </div>
                    );
                  }

                  if (type === 'BOOLEAN') {
                    return (
                      <label key={s.name} className="flex items-center justify-between gap-2 text-[#cbd5e1]">
                        <span className="text-[11px] font-mono truncate">{s.name}</span>
                        <input type="checkbox" checked={Boolean(value)} onChange={e => updateValue(e.target.checked)} className="accent-[#f5c518]" />
                      </label>
                    );
                  }

                   const specOptions = (spec as { name: string; type: string; options?: string[] }).options;
                   if (type === 'COMBO' && specOptions?.length) {
                     return (
                       <label key={s.name} className="flex items-center gap-2 text-[#cbd5e1]">
                         <span className="text-[11px] font-mono truncate flex-1">{s.name}</span>
                         <select value={String(value ?? specOptions[0])} onChange={e => updateValue(e.target.value)} className="max-w-[120px] bg-[#111216] border border-[#2a2f3c] rounded-md px-1.5 py-1 text-[10px] text-[#e5e7eb]">
                           {specOptions.map(option => <option key={option}>{option}</option>)}
                         </select>
                       </label>
                     );
                   }

                  if (type === 'INT' || type === 'FLOAT') {
                    const numeric = Number(value ?? s.default ?? 0);
                    return (
                      <div key={s.name} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono text-[#cbd5e1] truncate">{s.name}</span>
                          <input
                            type="number"
                            value={Number.isFinite(numeric) ? numeric : 0}
                            min={s.min}
                            max={s.max}
                            step={s.step ?? (type === 'INT' ? 1 : 0.01)}
                            onChange={e => updateValue(type === 'INT' ? parseInt(e.target.value, 10) || 0 : parseFloat(e.target.value) || 0)}
                            className="w-20 bg-[#111216] border border-[#2a2f3c] rounded-md px-1.5 py-1 text-[10px] text-[#e5e7eb] text-right"
                          />
                        </div>
                        {s.min != null && s.max != null && (
                          <input
                            type="range"
                            min={s.min}
                            max={s.max}
                            step={s.step ?? (type === 'INT' ? 1 : 0.01)}
                            value={Number.isFinite(numeric) ? numeric : s.min}
                            onChange={e => updateValue(type === 'INT' ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
                            className="w-full accent-[#f5c518]"
                          />
                        )}
                      </div>
                    );
                  }

                  return (
                    <label key={s.name} className="block text-[#cbd5e1]">
                      <span className="text-[11px] font-mono block mb-1">{s.name}</span>
                      <input
                        type="text"
                        value={value == null ? '' : String(value)}
                        onChange={e => updateValue(e.target.value)}
                        className="w-full bg-[#111216] border border-[#2a2f3c] rounded-md px-2 py-1 text-[10px] text-[#e5e7eb]"
                      />
                    </label>
                  );
                })}

                {/* Outputs list */}
                {Object.entries(node.outputs).map(([key]) => (
                  <div key={key} className="flex items-center justify-end gap-1.5 pt-1 text-[#cbd5e1]">
                    <span className="text-[11px] font-mono text-[#8e95a5]">{key}</span>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#f5c518] border border-[#171920]" />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
