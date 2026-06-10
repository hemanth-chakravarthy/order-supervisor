"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Plus, Check, Settings, Trash2 } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface Supervisor {
  id: string;
  name: string;
  baseInstruction: string;
  availableActions: string[];
  wakeStrategy: string;
  modelName: string;
}

const ACTION_OPTIONS = [
  "message_fulfillment_team",
  "message_payments_team",
  "message_logistics_team",
  "message_customer",
  "create_internal_note"
];

export default function SupervisorsPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [baseInstruction, setBaseInstruction] = useState("");
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [wakeStrategy, setWakeStrategy] = useState("default");
  const [modelName, setModelName] = useState("grok-beta");
  const [errors, setErrors] = useState<string[]>([]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template? All associated runs will be deleted as well.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/supervisors/${id}`, { method: "DELETE" });
      if (res.ok) fetchSupervisors();
      else alert("Error deleting template.");
    } catch { alert("Network error."); }
  };

  const fetchSupervisors = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/supervisors`);
      if (res.ok) setSupervisors(await res.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchSupervisors(); }, []);

  const toggleAction = (action: string) => {
    setSelectedActions(prev =>
      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const validationErrors: string[] = [];
    if (name.length < 3) validationErrors.push("Name must be at least 3 characters.");
    if (!baseInstruction) validationErrors.push("Base instructions are required.");
    if (selectedActions.length === 0) validationErrors.push("Select at least one available action.");

    if (validationErrors.length > 0) { setErrors(validationErrors); return; }

    try {
      const res = await fetch(`${API_BASE}/api/v1/supervisors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, baseInstruction, availableActions: selectedActions, wakeStrategy, modelName })
      });
      if (res.ok) {
        setShowForm(false);
        setName(""); setBaseInstruction(""); setSelectedActions([]);
        fetchSupervisors();
      } else {
        const errorData = await res.json();
        setErrors([errorData.detail || "Error creating template."]);
      }
    } catch { setErrors(["Network error. Please try again."]); }
  };

  return (
    <div className="space-y-8 font-mono-dev">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e2e5ea] pb-5">
        <div>
          <h2 className="text-base font-bold tracking-widest uppercase text-[#0d0d0d]">Supervisor Template Registry</h2>
          <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider mt-0.5">Define and coordinate cognitive parameters and activity whitelists.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0d0d0d] hover:bg-[#1a1a1a] text-white font-extrabold transition-all text-xs uppercase tracking-widest"
        >
          <Plus className="w-3.5 h-3.5" /> Create Template
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-white border border-[#e2e5ea] p-6 space-y-6 max-w-2xl">
          <h3 className="text-[11px] font-bold text-[#0d0d0d] border-b pb-3 border-[#e2e5ea] uppercase tracking-widest">
            Creating // Cognitive Supervisor Template
          </h3>

          {errors.length > 0 && (
            <div className="bg-red-50 text-red-700 p-4 border border-red-200 text-xs font-semibold space-y-1">
              {errors.map((err, i) => <p key={i}>• {err}</p>)}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">Supervisor Template Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Delayed Order Escalator"
                className="w-full px-4 py-2.5 bg-[#f7f8fa] border border-[#e2e5ea] text-[#0d0d0d] focus:border-[#4ade80] focus:bg-white outline-none text-xs transition-all font-mono-dev"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">Wake Strategy</label>
                <select
                  value={wakeStrategy}
                  onChange={e => setWakeStrategy(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#f7f8fa] border border-[#e2e5ea] text-[#0d0d0d] focus:border-[#4ade80] focus:bg-white outline-none text-xs font-mono-dev"
                >
                  <option value="default">Default Sleep (6h)</option>
                  <option value="aggressive">Aggressive (1h)</option>
                  <option value="relaxed">Relaxed (12h)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">AI Model Selection</label>
                <select
                  value={modelName}
                  onChange={e => setModelName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#f7f8fa] border border-[#e2e5ea] text-[#0d0d0d] focus:border-[#4ade80] focus:bg-white outline-none text-xs font-mono-dev"
                >
                  <option value="grok-beta">grok-beta (Groq API)</option>
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b (Meta)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">Base Instruction Prompts</label>
              <textarea
                value={baseInstruction}
                onChange={e => setBaseInstruction(e.target.value)}
                placeholder="Instruct the agent on how to manage orders, payment risks, and logistics delays..."
                rows={4}
                className="w-full px-4 py-2.5 bg-[#f7f8fa] border border-[#e2e5ea] text-[#0d0d0d] focus:border-[#4ade80] focus:bg-white outline-none text-xs transition-all resize-none font-mono-dev"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider">Available Action Tools</label>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_OPTIONS.map(action => (
                  <button
                    type="button"
                    key={action}
                    onClick={() => toggleAction(action)}
                    className={`flex items-center justify-between p-3 border text-left transition-all ${
                      selectedActions.includes(action)
                        ? "border-[#4ade80] bg-[#f0fdf4] text-[#15803d]"
                        : "border-[#e2e5ea] bg-[#f7f8fa] text-[#6b7280] hover:border-[#d1d5db] hover:text-[#374151]"
                    }`}
                  >
                    <span className="text-[10px] font-mono-dev">{action}</span>
                    {selectedActions.includes(action) && <Check className="w-3.5 h-3.5 text-[#4ade80]" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[#e2e5ea]">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-white border border-[#e2e5ea] text-[#6b7280] hover:text-[#0d0d0d] hover:border-[#9ca3af] text-xs font-bold uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#0d0d0d] text-white border border-[#0d0d0d] hover:bg-[#1a1a1a] text-xs font-extrabold uppercase tracking-widest transition-all"
            >
              Save Template
            </button>
          </div>
        </form>
      )}

      {/* Supervisor Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {supervisors.map(sv => (
          <div key={sv.id} className="bg-white border border-[#e2e5ea] p-6 flex flex-col justify-between hover:border-[#c9cdd4] hover:shadow-sm transition-all">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#faf5ff] text-[#7c3aed] border border-[#e9d5ff]">
                    <Settings className="w-4 h-4" />
                  </div>
                  <h4 className="font-extrabold text-[#0d0d0d] text-sm uppercase tracking-wide">{sv.name}</h4>
                </div>
                <button
                  onClick={() => handleDelete(sv.id)}
                  className="p-2 text-[#d1d5db] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
                  title="Delete Template"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-[#f7f8fa] p-3.5 border border-[#e2e5ea] max-h-28 overflow-y-auto">
                <span className="text-[9px] text-[#0e7490] font-bold block mb-1 uppercase tracking-wider">Instruction // System Prompt:</span>
                <p className="text-[11px] text-[#6b7280] leading-relaxed whitespace-pre-wrap font-mono-dev">{sv.baseInstruction}</p>
              </div>

              <div className="space-y-2">
                <span className="text-[9px] text-[#9ca3af] font-bold block uppercase tracking-wider">Actions // Whitelist:</span>
                <div className="flex flex-wrap gap-1.5">
                  {sv.availableActions.map((action, i) => (
                    <span key={i} className="text-[9px] bg-[#f0fdf4] text-[#15803d] px-2 py-0.5 border border-[#bbf7d0] uppercase font-mono-dev">
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3.5 border-t border-[#e2e5ea] flex items-center justify-between text-[10px] text-[#9ca3af] font-bold uppercase tracking-wider mt-4">
              <span>Model: <span className="text-[#374151] font-mono-dev">{sv.modelName}</span></span>
              <span>Wake: <span className="text-[#0e7490] font-mono-dev">{sv.wakeStrategy}</span></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
