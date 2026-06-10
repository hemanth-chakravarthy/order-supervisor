"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, ClipboardList, Trash2 } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface Supervisor {
  id: string;
  name: string;
}

interface Run {
  runId: string;
  orderId: string;
  status: string;
  currentState: string;
  created_at: string;
  workflowId: string;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [orderId, setOrderId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [showStartForm, setShowStartForm] = useState(false);
  const [error, setError] = useState("");
  const [conflictRunId, setConflictRunId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const runsRes = await fetch(`${API_BASE}/api/v1/runs`);
      if (runsRes.ok) setRuns(await runsRes.json());

      const svRes = await fetch(`${API_BASE}/api/v1/supervisors`);
      if (svRes.ok) {
        const svData = await svRes.json();
        setSupervisors(svData);
        if (svData.length > 0) setSupervisorId(svData[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (runId: string, orderId: string) => {
    if (!confirm(`Delete order run "${orderId}"? This cannot be undone.`)) return;
    try {
      await fetch(`${API_BASE}/api/v1/runs/${runId}`, { method: "DELETE" });
      fetchData();
    } catch {
      alert("Network error — could not delete run.");
    }
  };

  const handleStartRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setConflictRunId(null);

    if (!orderId) { setError("Order ID is required."); return; }
    if (!supervisorId) { setError("Please select a supervisor configuration first."); return; }

    try {
      const res = await fetch(`${API_BASE}/api/v1/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, supervisorId })
      });

      if (res.ok) {
        setOrderId("");
        setConflictRunId(null);
        setShowStartForm(false);
        fetchData();
      } else {
        const errData = await res.json();
        if (res.status === 409 && errData.error === "ORDER_ALREADY_EXISTS") {
          setError(errData.message || "Order already being supervised.");
          setConflictRunId(errData.runId || null);
        } else {
          setError(errData.detail || errData.message || "Error starting run.");
          setConflictRunId(null);
        }
      }
    } catch {
      setError("Network connection failure.");
      setConflictRunId(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "running")  return "badge-running";
    if (status === "sleeping") return "badge-sleeping";
    if (status === "paused")   return "badge-paused";
    return "badge-done";
  };

  return (
    <div className="space-y-8 font-mono-dev">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e2e5ea] pb-5">
        <div>
          <h2 className="text-base font-bold tracking-widest uppercase text-[#0d0d0d]">Supervisor Run Directory</h2>
          <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider mt-0.5">Track, audit, and trigger long-running active database pipelines.</p>
        </div>
        <button
          onClick={() => setShowStartForm(!showStartForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0d0d0d] hover:bg-[#1a1a1a] text-white font-extrabold transition-all text-xs uppercase tracking-widest"
        >
          <Play className="w-3.5 h-3.5 fill-current" /> Start Supervisor Run
        </button>
      </div>

      {/* Start Form */}
      {showStartForm && (
        <form onSubmit={handleStartRun} className="bg-white border border-[#e2e5ea] p-6 space-y-5 max-w-lg">
          <h3 className="text-[11px] font-bold text-[#0d0d0d] uppercase tracking-widest border-b pb-3 border-[#e2e5ea]">
            Initiating // New Supervisor Run
          </h3>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 border border-red-200 text-xs font-semibold space-y-2">
              <div>{error}</div>
              {conflictRunId && (
                <div>
                  <Link
                    href={`/runs/${conflictRunId}`}
                    className="inline-block mt-1 text-[#0e7490] hover:underline font-bold"
                  >
                    Observe existing run instance &rarr;
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">Order Identifier Code</label>
              <input
                type="text"
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                placeholder="e.g. ORDER-9948"
                className="w-full px-4 py-2.5 bg-[#f7f8fa] border border-[#e2e5ea] text-[#0d0d0d] focus:border-[#4ade80] focus:bg-white outline-none text-xs transition-all font-mono-dev"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">Automation Profile Template</label>
              {supervisors.length === 0 ? (
                <div className="text-xs text-amber-700 font-semibold bg-amber-50 p-3 border border-amber-200">
                  Please create a Supervisor template in the &ldquo;Supervisors&rdquo; tab first.
                </div>
              ) : (
                <select
                  value={supervisorId}
                  onChange={e => setSupervisorId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#f7f8fa] border border-[#e2e5ea] text-[#0d0d0d] focus:border-[#4ade80] focus:bg-white outline-none text-xs font-mono-dev"
                >
                  {supervisors.map(sv => (
                    <option key={sv.id} value={sv.id}>{sv.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[#e2e5ea]">
            <button
              type="button"
              onClick={() => setShowStartForm(false)}
              className="px-4 py-2 bg-white border border-[#e2e5ea] text-[#6b7280] hover:text-[#0d0d0d] hover:border-[#9ca3af] text-xs font-bold uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#0d0d0d] text-white border border-[#0d0d0d] hover:bg-[#1a1a1a] text-xs font-extrabold uppercase tracking-widest transition-all"
            >
              Initialize Run
            </button>
          </div>
        </form>
      )}

      {/* Runs Table */}
      <div className="bg-white border border-[#e2e5ea] overflow-hidden">
        <div className="p-5 border-b border-[#e2e5ea] bg-[#fafafa]">
          <h4 className="font-bold text-[#0d0d0d] text-[11px] uppercase tracking-widest">Active Execution Directory</h4>
        </div>

        <div className="overflow-x-auto">
          {runs.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <ClipboardList className="w-10 h-10 text-[#d1d5db] mx-auto" />
              <p className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest">No active or completed order supervisors registered</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#f3f4f6] bg-[#fafafa] text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
                  <th className="px-6 py-4">Order ID</th>
                  <th className="px-6 py-4">Temporal WF ID</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Agent State</th>
                  <th className="px-6 py-4">Created Time</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6] text-xs font-medium text-[#374151]">
                {runs.map(run => (
                  <tr key={run.runId} className="hover:bg-[#fafafa] transition-colors">
                    <td className="px-6 py-4 font-mono text-[#1f2937] font-bold">{run.orderId}</td>
                    <td className="px-6 py-4 font-mono text-[#9ca3af] text-[11px]">{run.workflowId || "N/A"}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 font-bold text-[9px] uppercase tracking-wider ${statusBadge(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[11px] text-[#6b7280]">{run.currentState}</td>
                    <td className="px-6 py-4 text-[11px] text-[#9ca3af]">
                      {new Date(run.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/runs/${run.runId}`} className="text-[10px] font-extrabold text-[#16a34a] hover:underline uppercase tracking-wider">
                          Observe &rarr;
                        </Link>
                        <button
                          onClick={() => handleDelete(run.runId, run.orderId)}
                          className="p-1.5 text-[#d1d5db] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
                          title="Delete run"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
