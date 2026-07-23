'use client'

import { useEffect, useCallback, useState } from "react"

interface focalPoint{
    id : string,
    name : string,
    phone : string,
    countryCode : string,
    language : string,
    active : boolean,
    createdAt : string,
    totalNotifications : number,
    lastReplyCode : number | null,
    lastStatus : number | null,
}

interface simAlert{
    id : string,
    title : string,
    countryCode : string,
    severity : string,
}

const IGAD_COUNTRIES = [
    { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
    { code: 'ET', name: 'Ethiopia', flag: '🇪🇹' },
    { code: 'SO', name: 'Somalia', flag: '🇸🇴' },
    { code: 'SS', name: 'South Sudan', flag: '🇸🇸' },
    { code: 'UG', name: 'Uganda', flag: '🇺🇬' },
    { code: 'DJ', name: 'Djibouti', flag: '🇩🇯' },
    { code: 'ER', name: 'Eritrea', flag: '🇪🇷' },
    { code: 'SD', name: 'Sudan', flag: '🇸🇩' },
]

const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'sw', name: 'Swahili' },
    { code: 'so', name: 'Somali' },
    { code: 'am', name: 'Amharic' },
    { code: 'om', name: 'Oromo' },
]

const REPLY_LABELS: Record<number, { label: string; color: string }> = {
    1: { label: 'Received', color: 'text-emerald-400' },
    2: { label: 'Acting', color: 'text-blue-400' },
    3: { label: 'Needs help', color: 'text-red-400' },
}

const countryFlag = (code: string) =>
IGAD_COUNTRIES.find(c => c.code === code)?.flag ?? '🌍'

const countryName = (code: string) =>
IGAD_COUNTRIES.find(c => c.code === code)?.name ?? code

const emptyForm = { name : '', phone : '+', countryCode : 'KE', language : 'sw' }

function Input({ label, value, onChange, placeholder, error }: { label : string, value : string, onChange : (v : string) => void, placeholder?: string, error?: string}){
    return(
        <div>
            <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wider">
                {label}
            </label>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}   className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500 transition-colors ${error ? 'border-red-500' : 'border-zinc-700'}`}/>
            {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
        </div>
    )
}

function Select({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[] }) {
    return (
        <div>
        <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wider">
            {label}
        </label>
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-colors"
        >
            {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
        </div>
    )
}

interface focalPointsPanelProps {
    open : boolean,
    onClose : () => void,
    onDataChange ?: () => void
}

export default function FocalPointsPanel({ open, onClose, onDataChange } : focalPointsPanelProps) {
    const [focalPoints, setFocalPoints] = useState<focalPoint[]>([])
    const [loading, setLoading] = useState(false)
    const [view, setView] = useState<'list' | 'add' | 'edit' | 'simulate'>('list')
    const [editTarget, setEditTarget] = useState<focalPoint | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [formError, setFormError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<string | null>(null)
    
    // Simulation state
    const [simAlerts, setSimAlerts] = useState<simAlert[]>([])
    const [simAlertId, setSimAlertId] = useState('')
    const [simReplyCode, setSimReplyCode] = useState<1 | 2 | 3>(1)
    const [simPhone, setSimPhone] = useState('')
    const [simMode, setSimMode] = useState<'all' | 'single'>('all')
    const [simRunning, setSimRunning] = useState(false)
    
    const showToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(null), 3000)
    }
    
    const fetchFocalPoints = useCallback(async () => {
        setLoading(true)
        try {
        const res = await fetch('/api/focalPoints')
        const data = await res.json()
        setFocalPoints(data)
        } finally {
        setLoading(false)
        }
    }, [])
    
    const fetchSimData = useCallback(async () => {
        const res = await fetch('/api/simulateReply')
        const data = await res.json()
        setSimAlerts(data.alerts ?? [])
        if (data.alerts?.length > 0) setSimAlertId(data.alerts[0].id)
    }, [])
    
    useEffect(() => {
        if (open) {
        fetchFocalPoints()
        }
    }, [open, fetchFocalPoints])
    
    // CRUD handlers 
    
    function openAdd() {
        setForm(emptyForm)
        setFormError(null)
        setView('add')
    }
    
    function openEdit(fp: focalPoint) {
        setEditTarget(fp)
        setForm({ name: fp.name, phone: fp.phone, countryCode: fp.countryCode, language: fp.language })
        setFormError(null)
        setView('edit')
    }
    
    async function handleSave() {
        setSaving(true)
        setFormError(null)
    
        try {
        const url = view === 'edit' ? `/api/focalPoints/${editTarget!.id}` : '/api/focalPoints'
        const method = view === 'edit' ? 'PATCH' : 'POST'
    
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        })
    
        const data = await res.json()
    
        if (!res.ok) {
            setFormError(data.error ?? 'Something went wrong')
            return
        }
    
        showToast(view === 'edit' ? 'Focal point updated' : 'Focal point added')
        await fetchFocalPoints()
        onDataChange?.()
        setView('list')
        } finally {
        setSaving(false)
        }
    }
    
    async function handleToggleActive(fp: focalPoint) {
        await fetch(`/api/focalPoints/${fp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !fp.active }),
        })
        showToast(fp.active ? 'Focal point deactivated' : 'Focal point activated')
        await fetchFocalPoints()
        onDataChange?.()
    }
    
    async function handleDelete(fp: focalPoint) {
        if (!confirm(`Delete ${fp.name}? This cannot be undone.`)) return
        await fetch(`/api/focalPoints/${fp.id}`, { method: 'DELETE' })
        showToast('Focal point deleted')
        await fetchFocalPoints()
        onDataChange?.()
    }
    
    // Simulation handler 
    
    async function handleSimulate() {
        setSimRunning(true)
        try {
        const body = simMode === 'all'
            ? { alertId: simAlertId, replyCode: simReplyCode }
            : { phone: simPhone, replyCode: simReplyCode }
    
        const res = await fetch('/api/simulateReply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
    
        const data = await res.json()
    
        if (!res.ok) {
            showToast(`Error: ${data.error}`)
            return
        }
    
        const count = data.simulated ?? 1
        showToast(`✓ Simulated ${count} reply${count > 1 ? 's' : ''} (code ${simReplyCode})`)
        onDataChange?.()
        } finally {
        setSimRunning(false)
        }
    }
    
    // Render 
    
    if (!open) return null
    
    return (
        <>
        {/* Backdrop */}
        <div
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={onClose}
        />
    
        {/* Panel */}
        <div className="fixed right-0 top-0 h-full w-120 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col shadow-2xl">
    
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <div>
                <h2 className="text-sm font-medium text-white">
                {view === 'list' && 'Focal Points'}
                {view === 'add' && 'Add Focal Point'}
                {view === 'edit' && 'Edit Focal Point'}
                {view === 'simulate' && 'Simulate Replies'}
                </h2>
                {view === 'list' && (
                <p className="text-[11px] text-zinc-500 mt-0.5">
                    {focalPoints.length} registered · {focalPoints.filter(f => f.active).length} active
                </p>
                )}
            </div>
            <div className="flex items-center gap-2">
                {view === 'list' && (
                <>
                    <button
                    onClick={() => { fetchSimData(); setView('simulate') }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                    >
                    Simulate
                    </button>
                    <button
                    onClick={openAdd}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors"
                    >
                    + Add
                    </button>
                </>
                )}
                {view !== 'list' && (
                <button
                    onClick={() => setView('list')}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
                >
                    ← Back
                </button>
                )}
                <button
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors ml-1 text-lg"
                >
                ✕
                </button>
            </div>
            </div>
    
            {/* Content */}
            <div className="flex-1 overflow-y-auto">
    
            {/* LIST VIEW */}
            {view === 'list' && (
                loading ? (
                <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">
                    Loading...
                </div>
                ) : focalPoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-zinc-600 text-sm gap-3">
                    <span className="text-4xl">👥</span>
                    <p>No focal points yet</p>
                    <button
                    onClick={openAdd}
                    className="text-xs px-4 py-2 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors"
                    >
                    Add your first focal point
                    </button>
                </div>
                ) : (
                <div>
                    {focalPoints.map(fp => (
                    <div
                        key={fp.id}
                        className={`px-5 py-4 border-b border-zinc-800/60 ${!fp.active ? 'opacity-50' : ''}`}
                    >
                        <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white truncate">{fp.name}</span>
                            {!fp.active && (
                                <span className="text-[10px] text-zinc-600 border border-zinc-700 px-1.5 py-0.5 rounded">
                                Inactive
                                </span>
                            )}
                            </div>
                            <p className="text-[11px] text-zinc-500 font-mono">{fp.phone}</p>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-600">
                            <span>{countryFlag(fp.countryCode)} {countryName(fp.countryCode)}</span>
                            <span>·</span>
                            <span>{LANGUAGES.find(l => l.code === fp.language)?.name ?? fp.language}</span>
                            <span>·</span>
                            <span>{fp.totalNotifications} alerts</span>
                            {fp.lastReplyCode && (
                                <>
                                <span>·</span>
                                <span className={REPLY_LABELS[fp.lastReplyCode]?.color}>
                                    Last: {REPLY_LABELS[fp.lastReplyCode]?.label}
                                </span>
                                </>
                            )}
                            </div>
                        </div>
    
                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                            onClick={() => openEdit(fp)}
                            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                            >
                            Edit
                            </button>
                            <button
                            onClick={() => handleToggleActive(fp)}
                            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                            >
                            {fp.active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                            onClick={() => handleDelete(fp)}
                            className="text-[11px] px-2 py-1 rounded border border-red-900/50 text-red-500 hover:bg-red-950/30 transition-colors"
                            >
                            Delete
                            </button>
                        </div>
                        </div>
                    </div>
                    ))}
                </div>
                )
            )}
    
            {/* ADD / EDIT FORM */}
            {(view === 'add' || view === 'edit') && (
                <div className="p-5 flex flex-col gap-4">
                <Input
                    label="Full name"
                    value={form.name}
                    onChange={v => setForm(f => ({ ...f, name: v }))}
                    placeholder="e.g. Mary Akinyi"
                />
                <Input
                    label="Phone (E.164 format)"
                    value={form.phone}
                    onChange={v => setForm(f => ({ ...f, phone: v }))}
                    placeholder="+254712345678"
                    error={formError ?? undefined}
                />
                <Select
                    label="Country"
                    value={form.countryCode}
                    onChange={v => setForm(f => ({ ...f, countryCode: v }))}
                    options={IGAD_COUNTRIES.map(c => ({
                    value: c.code,
                    label: `${c.flag} ${c.name}`,
                    }))}
                />
                <Select
                    label="Preferred language"
                    value={form.language}
                    onChange={v => setForm(f => ({ ...f, language: v }))}
                    options={LANGUAGES.map(l => ({ value: l.code, label: l.name }))}
                />
    
                <div className="pt-2 flex gap-2">
                    <button
                    onClick={handleSave}
                    disabled={saving || !form.name || !form.phone || !form.countryCode}
                    className="flex-1 py-2.5 rounded-lg bg-amber-500 text-black text-sm font-medium hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                    {saving ? 'Saving...' : view === 'edit' ? 'Save changes' : 'Add focal point'}
                    </button>
                    <button
                    onClick={() => setView('list')}
                    className="px-4 py-2.5 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:text-white transition-colors"
                    >
                    Cancel
                    </button>
                </div>
                </div>
            )}
    
            {/* SIMULATE VIEW */}
            {view === 'simulate' && (
                <div className="p-5 flex flex-col gap-5">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-xs text-amber-400">
                    Simulation mode — triggers reply codes directly in the database without real SMS.
                    Use during demos to show the confirmation feedback loop working.
                </div>
    
                {/* Mode toggle */}
                <div>
                    <label className="block text-[11px] text-zinc-500 mb-2 uppercase tracking-wider">
                    Simulation mode
                    </label>
                    <div className="flex gap-2">
                    {(['all', 'single'] as const).map(m => (
                        <button
                        key={m}
                        onClick={() => setSimMode(m)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                            simMode === m
                            ? 'bg-amber-500 text-black border-amber-500'
                            : 'border-zinc-700 text-zinc-400 hover:text-white'
                        }`}
                        >
                        {m === 'all' ? 'All focal points for an alert' : 'Single focal point'}
                        </button>
                    ))}
                    </div>
                </div>
    
                {/* Alert selector (all mode) */}
                {simMode === 'all' && (
                    <Select
                    label="Alert to simulate replies for"
                    value={simAlertId}
                    onChange={setSimAlertId}
                    options={simAlerts.map(a => ({
                        value: a.id,
                        label: `[${a.severity.toUpperCase()}] ${a.title.slice(0, 45)}${a.title.length > 45 ? '...' : ''}`,
                    }))}
                    />
                )}
    
                {/* Phone selector (single mode) */}
                {simMode === 'single' && (
                    <Select
                    label="Focal point"
                    value={simPhone}
                    onChange={setSimPhone}
                    options={[
                        { value: '', label: 'Select a focal point...' },
                        ...focalPoints.map(fp => ({
                        value: fp.phone,
                        label: `${fp.name} (${fp.countryCode})`,
                        })),
                    ]}
                    />
                )}
    
                {/* Reply code */}
                <div>
                    <label className="block text-[11px] text-zinc-500 mb-2 uppercase tracking-wider">
                    Reply code
                    </label>
                    <div className="flex gap-2">
                    {([1, 2, 3] as const).map(code => {
                        const styles: Record<number, string> = {
                        1: 'border-emerald-700 bg-emerald-950/40 text-emerald-400',
                        2: 'border-blue-700 bg-blue-950/40 text-blue-400',
                        3: 'border-red-700 bg-red-950/40 text-red-400',
                        }
                        const labels = { 1: '1 — Received', 2: '2 — Acting', 3: '3 — Need help' }
                        return (
                        <button
                            key={code}
                            onClick={() => setSimReplyCode(code)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                            simReplyCode === code
                                ? styles[code]
                                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            {labels[code]}
                        </button>
                        )
                    })}
                    </div>
                </div>
    
                <button
                    onClick={handleSimulate}
                    disabled={simRunning || (simMode === 'all' && !simAlertId) || (simMode === 'single' && !simPhone)}
                    className="w-full py-3 rounded-lg bg-amber-500 text-black text-sm font-medium hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {simRunning ? 'Simulating...' : `Simulate reply code ${simReplyCode}`}
                </button>
    
                <p className="text-[11px] text-zinc-600 text-center">
                    After simulating, the dashboard confirmation rates will update on the next refresh.
                </p>
                </div>
            )}
            </div>
    
            {/* Toast */}
            {toast && (
            <div className="absolute bottom-5 left-5 right-5 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-white shadow-xl animate-in slide-in-from-bottom-2">
                {toast}
            </div>
            )}
        </div>
        </>
    )
    }
    