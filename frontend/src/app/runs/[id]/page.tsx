"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Play, Pause, Square, Send, Brain,
  History, MessageSquare, AlertTriangle, CheckCircle, Info, Trash2
} from "lucide-react";
import { API_BASE } from "@/lib/api";

interface Activity {
  id: string;
  activityType: string;
  activitySubtype?: string;
  content: any;
  reasoning?: string;
  created_at: string;
}

interface MemorySnapshot {
  summary: string;
  event_count: number;
}

interface FinalReport {
  final_summary: string;
  key_learnings: string;
  recommendations: string;
}

interface RunDetail {
  run: {
    runId: string;
    orderId: string;
    status: string;
    currentState: string;
    created_at: string;
  };
  memory?: MemorySnapshot;
  activities: Activity[];
  finalReport?: FinalReport;
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const runId = resolvedParams.id;
  const router = useRouter();
  const [data, setData] = useState<RunDetail | null>(null);

  const [eventType, setEventType] = useState("shipment_delayed");
  const [eventPayload, setEventPayload] = useState('{\n  "reason": "custom delay"\n}');
  const [instruction, setInstruction] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const fetchDetail = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDetail();
    const timer = setInterval(fetchDetail, 3000);
    return () => clearInterval(timer);
  }, [runId]);

  const handlePause = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/pause`, { method: "POST" });
      if (res.ok) { setActionMessage("Pause signal transmitted successfully."); fetchDetail(); }
    } catch { setErrorMessage("Error sending pause signal."); }
  };

  const handleResume = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/resume`, { method: "POST" });
      if (res.ok) { setActionMessage("Resume signal transmitted successfully."); fetchDetail(); }
    } catch { setErrorMessage("Error sending resume signal."); }
  };

  const handleTerminate = async () => {
    if (!confirm("Are you sure you want to terminate this run? This will compile the final report immediately.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/terminate`, { method: "POST" });
      if (res.ok) { setActionMessage("Run terminated."); fetchDetail(); }
    } catch { setErrorMessage("Error terminating run."); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this run permanently? All activity history will be erased and cannot be recovered.")) return;
    try {
      await fetch(`${API_BASE}/api/v1/runs/${runId}`, { method: "DELETE" });
      router.push("/runs");
    } catch { setErrorMessage("Network error — could not delete run."); }
  };

  const handleSendEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(""); setErrorMessage("");
    let parsedPayload = {};
    try { parsedPayload = JSON.parse(eventPayload); }
    catch { setErrorMessage("Invalid JSON payload format."); return; }
    try {
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, payload: parsedPayload })
      });
      if (res.ok) { setActionMessage(`Event ${eventType} injected successfully.`); fetchDetail(); }
      else { const e2 = await res.json(); setErrorMessage(e2.detail || "Error injecting event."); }
    } catch { setErrorMessage("Network connection failed."); }
  };

  const handleAddInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(""); setErrorMessage("");
    if (!instruction) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction })
      });
      if (res.ok) { setInstruction(""); setActionMessage("Special instructions updated successfully."); fetchDetail(); }
      else { const e2 = await res.json(); setErrorMessage(e2.detail || "Error submitting instruction."); }
    } catch { setErrorMessage("Network connection failed."); }
  };

  const statusBadge = (status: string) => {
    if (status === "running")  return "badge-running";
    if (status === "sleeping") return "badge-sleeping";
    if (status === "paused")   return "badge-paused";
    return "badge-done";
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 font-mono-dev">
        <div className="w-8 h-8 border-2 border-t-transparent border-[#4ade80] rounded-full animate-spin" />
        <p className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest">Loading // Monitor Cockpit Data...</p>
      </div>
    );
  }

  const { run, memory, activities, finalReport } = data;

  return (
    <div className="space-y-8 font-mono-dev">

      {/* Navigation Header */}
      <div className="flex items-center justify-between border-b border-[#e2e5ea] pb-4">
        <Link href="/runs" className="flex items-center gap-2 text-xs font-bold text-[#9ca3af] hover:text-[#0d0d0d] transition-colors uppercase tracking-wider">
          <ArrowLeft className="w-4 h-4" /> Back to Runs
        </Link>
        <div className="flex gap-2.5">
          {run.status === "running" || run.status === "sleeping" ? (
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e2e5ea] hover:border-[#9ca3af] text-xs font-bold uppercase tracking-wider text-[#6b7280] hover:text-[#0d0d0d] transition-all"
            >
              <Pause className="w-3.5 h-3.5" /> Pause Run
            </button>
          ) : run.status === "paused" ? (
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-4 py-2 bg-[#0d0d0d] text-white border border-[#0d0d0d] hover:bg-[#1a1a1a] text-xs font-bold uppercase tracking-widest transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Resume Run
            </button>
          ) : null}

          {run.status !== "completed" && run.status !== "terminated" && (
            <button
              onClick={handleTerminate}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600 text-xs font-bold uppercase tracking-wider transition-all"
            >
              <Square className="w-3.5 h-3.5 fill-current" /> Terminate Run
            </button>
          )}

          {/* Delete is always available regardless of status */}
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e2e5ea] text-[#9ca3af] hover:text-red-700 hover:bg-red-50 hover:border-red-200 text-xs font-bold uppercase tracking-wider transition-all"
            title="Permanently delete this run and all its data"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Run
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {(actionMessage || errorMessage) && (
        <div className={`p-4 border text-xs font-bold flex items-center gap-3 uppercase tracking-wider ${
          errorMessage
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]"
        }`}>
          <Info className="w-4 h-4" />
          <span>{errorMessage || actionMessage}</span>
        </div>
      )}

      {/* Cockpit Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column */}
        <div className="space-y-5 lg:col-span-1">

          {/* Status */}
          <div className="bg-white border border-[#e2e5ea] p-5 space-y-4">
            <h4 className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest border-b border-[#e2e5ea] pb-2">
              Cockpit // Metrics
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#9ca3af] font-semibold">Order_id:</span>
                <span className="font-mono text-[#0d0d0d] font-bold">{run.orderId}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#9ca3af] font-semibold">Workflow_status:</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 font-bold text-[9px] uppercase tracking-wider ${statusBadge(run.status)}`}>
                  {run.status}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#9ca3af] font-semibold">Agent_state:</span>
                <span className="text-[10px] text-[#374151] font-bold uppercase tracking-wider">{run.currentState}</span>
              </div>
            </div>
          </div>

          {/* Memory Snapshot */}
          <div className="bg-white border border-[#e2e5ea] p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#e2e5ea] pb-2">
              <Brain className="w-4 h-4 text-[#22d3ee]" />
              <h4 className="font-bold text-[#0d0d0d] text-[11px] uppercase tracking-widest">Active Memory Snapshot</h4>
            </div>
            {memory ? (
              <div className="space-y-3">
                <div className="bg-[#f7f8fa] p-3.5 border border-[#e2e5ea]">
                  <p className="text-[11px] text-[#374151] leading-relaxed whitespace-pre-wrap">{memory.summary}</p>
                </div>
                <div className="text-[9px] text-[#9ca3af] font-bold flex justify-between uppercase tracking-wider">
                  <span>SNAPSHOT VERSION: v{memory.event_count}</span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-[#d1d5db] italic uppercase">No memory buffers compiled</p>
            )}
          </div>

          {/* Instructions Override */}
          {run.status !== "completed" && run.status !== "terminated" && (
            <div className="bg-white border border-[#e2e5ea] p-5 space-y-4">
              <h4 className="font-bold text-[#0d0d0d] text-[11px] uppercase tracking-widest border-b border-[#e2e5ea] pb-2">
                Submit Runtime Instructions
              </h4>
              <form onSubmit={handleAddInstruction} className="space-y-3">
                <textarea
                  value={instruction}
                  onChange={e => setInstruction(e.target.value)}
                  placeholder="Override default behaviors (e.g. 'If payment fails twice, immediately message payments team')"
                  rows={3}
                  className="w-full p-3 bg-[#f7f8fa] border border-[#e2e5ea] outline-none text-xs leading-relaxed focus:border-[#4ade80] focus:bg-white transition-all resize-none font-mono-dev text-[#0d0d0d]"
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-[#0d0d0d] hover:bg-[#1a1a1a] text-white text-xs font-bold transition-all uppercase tracking-wider"
                >
                  Submit Instruction
                </button>
              </form>
            </div>
          )}

          {/* Event Injector */}
          {run.status !== "completed" && run.status !== "terminated" && (
            <div className="bg-white border border-[#e2e5ea] p-5 space-y-4">
              <h4 className="font-bold text-[#0d0d0d] text-[11px] uppercase tracking-widest border-b border-[#e2e5ea] pb-2">
                Event Simulator Injector
              </h4>
              <form onSubmit={handleSendEvent} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">Event Type</label>
                  <select
                    value={eventType}
                    onChange={e => setEventType(e.target.value)}
                    className="w-full p-2.5 bg-[#f7f8fa] border border-[#e2e5ea] text-[#0d0d0d] focus:border-[#4ade80] focus:bg-white outline-none text-xs font-mono-dev"
                  >
                    <option value="payment_failed">payment_failed</option>
                    <option value="payment_confirmed">payment_confirmed</option>
                    <option value="shipment_created">shipment_created</option>
                    <option value="shipment_delayed">shipment_delayed</option>
                    <option value="delivered">delivered</option>
                    <option value="refund_requested">refund_requested</option>
                    <option value="customer_message_received">customer_message_received</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">Payload Data (JSON)</label>
                  <textarea
                    value={eventPayload}
                    onChange={e => setEventPayload(e.target.value)}
                    rows={3}
                    className="w-full p-2.5 bg-[#f7f8fa] border border-[#e2e5ea] text-[#0d0d0d] focus:border-[#4ade80] focus:bg-white outline-none text-xs font-mono-dev resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-[#0d0d0d] hover:bg-[#1a1a1a] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider"
                >
                  <Send className="w-3.5 h-3.5" /> Inject Event Signal
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Final Report */}
          {finalReport && (
            <div className="border border-[#bbf7d0] bg-[#f0fdf4] p-6 space-y-5">
              <div className="flex items-center gap-2 border-b border-[#bbf7d0] pb-3">
                <CheckCircle className="w-5 h-5 text-[#16a34a]" />
                <h3 className="font-extrabold text-[#15803d] text-sm uppercase tracking-widest">Final Closure Report</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-[#0e7490] uppercase tracking-wider">Operational Summary:</span>
                  <p className="text-xs text-[#374151] leading-relaxed font-semibold">{finalReport.final_summary}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-[#7c3aed] uppercase tracking-wider">Key Learnings:</span>
                    <p className="text-[11px] text-[#6b7280] leading-relaxed">{finalReport.key_learnings}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-[#a16207] uppercase tracking-wider">Process Recommendations:</span>
                    <p className="text-[11px] text-[#6b7280] leading-relaxed">{finalReport.recommendations}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="bg-white border border-[#e2e5ea] p-6 space-y-6">
            <div className="flex items-center gap-2 border-b border-[#e2e5ea] pb-4">
              <History className="w-4 h-4 text-[#9ca3af]" />
              <h4 className="font-bold text-[#0d0d0d] text-[11px] uppercase tracking-widest">Historical Activity Timeline</h4>
            </div>

            <div className="relative pl-6 border-l-2 border-[#e2e5ea] space-y-6 ml-3">
              {activities.length === 0 ? (
                <p className="text-[10px] text-[#d1d5db] italic uppercase">No events or activities logged.</p>
              ) : (
                activities.map(act => (
                  <div key={act.id} className="relative group">
                    {/* Timeline Dot */}
                    <span className={`absolute -left-[33px] top-1 p-1 border ${
                      act.activityType === "event"
                        ? "bg-[#ecfeff] text-[#0e7490] border-[#a5f3fc]"
                        : act.activityType === "action"
                        ? "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]"
                        : act.activityType === "sleep_decision"
                        ? "bg-[#f9fafb] text-[#9ca3af] border-[#e5e7eb]"
                        : "bg-[#faf5ff] text-[#7c3aed] border-[#e9d5ff]"
                    }`}>
                      {act.activityType === "event"      ? <MessageSquare className="w-3 h-3" /> :
                       act.activityType === "action"     ? <CheckCircle className="w-3 h-3" /> :
                       act.activityType === "sleep_decision" ? <Pause className="w-3 h-3" /> :
                       <AlertTriangle className="w-3 h-3" />}
                    </span>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between border-b border-[#f3f4f6] pb-1">
                        <span className="text-[10px] font-bold text-[#374151] uppercase tracking-wider">
                          {act.activityType}: <span className="text-[#0e7490]">{act.activitySubtype || "generic"}</span>
                        </span>
                        <span className="text-[9px] text-[#9ca3af] font-semibold">
                          {new Date(act.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </span>
                      </div>

                      {act.reasoning && (
                        <p className="text-[11px] text-[#374151] leading-relaxed italic bg-[#fafaf9] p-2.5 border border-[#e2e5ea] font-mono-dev">
                          [Reasoning] {act.reasoning}
                        </p>
                      )}

                      <div className="text-[10px] text-[#6b7280] font-mono-dev bg-[#f7f8fa] p-2.5 border border-[#e2e5ea] overflow-x-auto max-h-36">
                        {JSON.stringify(act.content, null, 2)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
