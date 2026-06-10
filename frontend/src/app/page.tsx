"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, ClipboardList, Settings, ArrowRight, Activity } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface Run {
  runId: string;
  orderId: string;
  status: string;
  currentState: string;
  created_at: string;
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState({
    active: 0,
    sleeping: 0,
    paused: 0,
    completed: 0
  });

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/runs`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
        const active    = data.filter((r: Run) => r.status === "running").length;
        const sleeping  = data.filter((r: Run) => r.status === "sleeping").length;
        const paused    = data.filter((r: Run) => r.status === "paused").length;
        const completed = data.filter((r: Run) => r.status === "completed" || r.status === "terminated").length;
        setStats({ active, sleeping, paused, completed });
      }
    } catch (err) {
      console.error("Error fetching runs:", err);
    }
  };

  useEffect(() => {
    fetchRuns();
    const timer = setInterval(fetchRuns, 4000);
    return () => clearInterval(timer);
  }, []);

  const statusBadge = (status: string) => {
    if (status === "running")   return "badge-running";
    if (status === "sleeping")  return "badge-sleeping";
    if (status === "paused")    return "badge-paused";
    return "badge-done";
  };

  return (
    <div className="space-y-8 font-mono-dev">

      {/* Banner */}
      <div className="relative bg-[#0d0d0d] p-8 overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-[#4ade80]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-[#4ade80]" />
            <span className="text-[10px] font-bold text-[#4ade80] uppercase tracking-widest">Runtime Console</span>
          </div>
          <h2 className="text-xl font-black tracking-wider text-white uppercase leading-tight">
            AI Workflow Supervisor
          </h2>
          <p className="text-[#6b7280] text-xs leading-relaxed max-w-lg">
            Observe and control long-running order workflows powered by Temporal and evaluated by Grok LLM context snapshots.
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#e2e5ea] p-5 flex items-center justify-between hover:border-[#bbf7d0] hover:shadow-accent-green transition-all">
          <div>
            <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest block">Active Evaluators</span>
            <h3 className="text-3xl font-black text-[#0d0d0d] mt-1">{stats.active}</h3>
          </div>
          <span className="badge-running px-2.5 py-1 font-bold text-[9px] uppercase tracking-wider">
            Running
          </span>
        </div>

        <div className="bg-white border border-[#e2e5ea] p-5 flex items-center justify-between hover:border-[#a5f3fc] hover:shadow-accent-cyan transition-all">
          <div>
            <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest block">Dormant Pools</span>
            <h3 className="text-3xl font-black text-[#0d0d0d] mt-1">{stats.sleeping}</h3>
          </div>
          <span className="badge-sleeping px-2.5 py-1 font-bold text-[9px] uppercase tracking-wider">
            Sleeping
          </span>
        </div>

        <div className="bg-white border border-[#e2e5ea] p-5 flex items-center justify-between hover:border-[#fef08a] transition-all">
          <div>
            <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest block">Paused Pipelines</span>
            <h3 className="text-3xl font-black text-[#0d0d0d] mt-1">{stats.paused}</h3>
          </div>
          <span className="badge-paused px-2.5 py-1 font-bold text-[9px] uppercase tracking-wider">
            Paused
          </span>
        </div>

        <div className="bg-white border border-[#e2e5ea] p-5 flex items-center justify-between hover:border-[#d1d5db] transition-all">
          <div>
            <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest block">Completed History</span>
            <h3 className="text-3xl font-black text-[#0d0d0d] mt-1">{stats.completed}</h3>
          </div>
          <span className="badge-done px-2.5 py-1 font-bold text-[9px] uppercase tracking-wider">
            Archived
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick Links */}
        <div className="bg-white border border-[#e2e5ea] p-6 space-y-4">
          <div>
            <h4 className="text-[11px] font-bold text-[#0d0d0d] uppercase tracking-widest">Operational Links</h4>
            <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider mt-1">Launch templates or configure automation profiles.</p>
          </div>

          <div className="space-y-2.5 pt-1">
            <Link href="/runs" className="flex items-center justify-between p-4 bg-[#f7f8fa] hover:bg-[#f0fdf4] border border-[#e2e5ea] hover:border-[#bbf7d0] transition-all group">
              <span className="flex items-center gap-3 font-semibold text-xs text-[#374151] group-hover:text-[#15803d] uppercase tracking-wider">
                <Play className="w-3.5 h-3.5 text-[#4ade80]" /> Launch run instance
              </span>
              <ArrowRight className="w-4 h-4 text-[#d1d5db] group-hover:text-[#4ade80] transition-transform group-hover:translate-x-1" />
            </Link>

            <Link href="/supervisors" className="flex items-center justify-between p-4 bg-[#f7f8fa] hover:bg-[#faf5ff] border border-[#e2e5ea] hover:border-[#e9d5ff] transition-all group">
              <span className="flex items-center gap-3 font-semibold text-xs text-[#374151] group-hover:text-[#7c3aed] uppercase tracking-wider">
                <Settings className="w-3.5 h-3.5 text-[#a78bfa]" /> Configure supervisor templates
              </span>
              <ArrowRight className="w-4 h-4 text-[#d1d5db] group-hover:text-[#a78bfa] transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Active Monitoring Records */}
        <div className="lg:col-span-2 bg-white border border-[#e2e5ea] p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#e2e5ea] pb-3">
            <h4 className="text-[11px] font-bold text-[#0d0d0d] uppercase tracking-widest">Active Monitoring Records</h4>
            <Link href="/runs" className="text-[10px] font-bold text-[#16a34a] hover:underline uppercase tracking-wider">
              [ View all runs ]
            </Link>
          </div>

          <div className="overflow-x-auto">
            {runs.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <ClipboardList className="w-8 h-8 text-[#d1d5db] mx-auto" />
                <p className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">No execution logs found</p>
                <Link href="/runs" className="inline-block text-[10px] font-bold text-[#16a34a] hover:underline uppercase tracking-widest">
                  Initialize a workflow &rarr;
                </Link>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#f3f4f6] text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
                    <th className="pb-3 pr-4">Order ID</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Agent State</th>
                    <th className="pb-3 text-right">Console</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f9fafb] text-xs font-medium text-[#374151]">
                  {runs.slice(0, 5).map((run) => (
                    <tr key={run.runId} className="hover:bg-[#fafafa] transition-colors">
                      <td className="py-3.5 pr-4 font-mono text-[#1f2937] font-bold">{run.orderId}</td>
                      <td className="py-3.5 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 font-bold text-[9px] uppercase tracking-wider ${statusBadge(run.status)}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4 text-[11px] text-[#6b7280]">{run.currentState}</td>
                      <td className="py-3.5 text-right">
                        <Link href={`/runs/${run.runId}`} className="text-[10px] font-bold text-[#16a34a] hover:underline uppercase tracking-wider">
                          Observe &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
