'use client';

import { useEffect, useState } from 'react';
import NavBar from '@/app/components/NavBar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileData {
  id:        string;
  name:      string;
  email:     string;
  balance:   number;
  createdAt: string;
  stats: {
    orderCount:    number;
    positionCount: number;
    alertCount:    number;
  };
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-5 flex items-center gap-3 min-w-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-lg">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 truncate">{label}</p>
        <p className="text-base font-bold text-white font-mono whitespace-nowrap">{value}</p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [loading, setLoading]   = useState(true);

  // ── Edit name ────────────────────────────────────────────────────────────────
  const [editName,     setEditName]     = useState('');
  const [nameStatus,   setNameStatus]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [nameError,    setNameError]    = useState('');

  // ── Change password ───────────────────────────────────────────────────────────
  const [curPwd,      setCurPwd]      = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [pwdStatus,   setPwdStatus]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pwdError,    setPwdError]    = useState('');

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(d => {
        setProfile(d);
        setEditName(d.name ?? '');
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveName() {
    if (!editName.trim()) { setNameError('Name cannot be empty'); return; }
    setNameStatus('saving');
    setNameError('');
    const res  = await fetch('/api/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: editName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setNameError(data.error ?? 'Failed to save'); setNameStatus('error'); return; }
    setProfile(prev => prev ? { ...prev, name: data.name } : prev);
    setNameStatus('saved');
    setTimeout(() => setNameStatus('idle'), 2500);
  }

  async function savePassword() {
    setPwdError('');
    if (!curPwd)           { setPwdError('Enter your current password'); return; }
    if (newPwd.length < 6) { setPwdError('New password must be at least 6 characters'); return; }
    if (newPwd !== confirmPwd) { setPwdError('Passwords do not match'); return; }
    setPwdStatus('saving');
    const res  = await fetch('/api/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
    });
    const data = await res.json();
    if (!res.ok) { setPwdError(data.error ?? 'Failed to update password'); setPwdStatus('error'); return; }
    setPwdStatus('saved');
    setCurPwd(''); setNewPwd(''); setConfirmPwd('');
    setTimeout(() => setPwdStatus('idle'), 2500);
  }

  if (loading) {
    return (
      <>
        <NavBar />
        <main className="min-h-screen bg-[#0d1117] flex items-center justify-center text-zinc-500">
          Loading profile…
        </main>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <NavBar />
        <main className="min-h-screen bg-[#0d1117] flex items-center justify-center text-zinc-500">
          Failed to load profile.
        </main>
      </>
    );
  }

  const initials  = profile.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const memberSince = new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const balance   = profile.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-[#0d1117] p-6 text-zinc-100">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* ── Header ── */}
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/20">
              <span className="text-2xl font-black text-white">{initials}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
              <p className="text-zinc-500 text-sm mt-0.5">{profile.email}</p>
              <p className="text-zinc-600 text-xs mt-0.5">Member since {memberSince}</p>
            </div>
          </div>

          {/* ── Account Stats ── */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Account Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon="💵" label="Cash Balance"    value={`₹${balance}`} />
              <StatCard icon="📋" label="Total Orders"    value={profile.stats.orderCount} />
              <StatCard icon="📊" label="Open Positions"  value={profile.stats.positionCount} />
              <StatCard icon="🔔" label="Active Alerts"   value={profile.stats.alertCount} />
            </div>
          </section>

          {/* ── Edit Name ── */}
          <section className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Display Name</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={editName}
                onChange={e => { setEditName(e.target.value); setNameStatus('idle'); setNameError(''); }}
                placeholder="Your full name"
                className="flex-1 rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
              <button
                onClick={saveName}
                disabled={nameStatus === 'saving'}
                className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {nameStatus === 'saving' ? 'Saving…' : nameStatus === 'saved' ? '✓ Saved' : 'Save'}
              </button>
            </div>
            {nameError && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{nameError}</p>}
          </section>

          {/* ── Account Info (read-only) ── */}
          <section className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-white">Account Details</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
                <span className="text-zinc-500">Email</span>
                <span className="text-zinc-200 font-mono">{profile.email}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
                <span className="text-zinc-500">User ID</span>
                <span className="text-zinc-500 font-mono text-xs">{profile.id}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500">Account type</span>
                <span className="text-emerald-400 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  Paper Trading
                </span>
              </div>
            </div>
          </section>

          {/* ── Change Password ── */}
          <section className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white">Change Password</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Current Password</label>
                <input
                  type="password"
                  value={curPwd}
                  onChange={e => { setCurPwd(e.target.value); setPwdStatus('idle'); setPwdError(''); }}
                  placeholder="Enter current password"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">New Password</label>
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => { setNewPwd(e.target.value); setPwdStatus('idle'); setPwdError(''); }}
                  placeholder="Min. 6 characters"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={e => { setConfirmPwd(e.target.value); setPwdStatus('idle'); setPwdError(''); }}
                  placeholder="Re-enter new password"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>

              {pwdError && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{pwdError}</p>}
              {pwdStatus === 'saved' && <p className="text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">Password updated successfully.</p>}

              <button
                onClick={savePassword}
                disabled={pwdStatus === 'saving'}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-zinc-700 hover:bg-zinc-600 text-white transition-colors disabled:opacity-50"
              >
                {pwdStatus === 'saving' ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </section>

        </div>
      </main>
    </>
  );
}
