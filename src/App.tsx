import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState, FileProgress, ChatMessage } from './types'
import { MOCK_FILES } from './data/mockData'
import { BOM_ROWS } from './data/bomData'
import { fetchBulkPrices, mapPriceResultsToBopRows } from './api/pricing'
import { uploadBomFile, pollBomJob, fetchBomItems, mapItemsToBomRows } from './api/bom'
import type { BomRow } from './types'
import type { BopCostRow, CdpCostRow } from './data/costData'
import { getSession, signOut } from './auth'
import type { AuthUser } from './auth'
import LoginPage from './components/LoginPage'
import Sidebar                from './components/Sidebar'
import UploadZone             from './components/UploadZone'
import FileViewer             from './components/FileViewer'
import ProgressPanel          from './components/ProgressPanel'
import BomProgressPanel       from './components/BomProgressPanel'
import BomViewer              from './components/BomViewer'
import CostBenchmarkViewer    from './components/CostBenchmarkViewer'
import CostProgressPanel      from './components/CostProgressPanel'
import PaymentModal           from './components/PaymentModal'
import PaymentSuccess         from './components/PaymentSuccess'
import RFQViewer              from './components/RFQViewer'
import RFQTracker             from './components/RFQTracker'
import SourcingProgressPanel  from './components/SourcingProgressPanel'
import QuotesViewer           from './components/QuotesViewer'
import DFMProgressPanel            from './components/DFMProgressPanel'
import DFMViewer                   from './components/DFMViewer'
import ManufacturingProgressPanel  from './components/ManufacturingProgressPanel'
import ManufacturingViewer         from './components/ManufacturingViewer'
import MfgVendorList             from './components/MfgVendorList'
import MfgOrderPreview, { MFG_GRAND_TOTAL_INR } from './components/MfgOrderPreview'
import DemProgressPanel            from './components/ManufacturingProgressPanel'
import CmRFQViewer                 from './components/CmRFQViewer'
import FactoryEngageViewer         from './components/FactoryEngageViewer'
import AIScoringViewer             from './components/AIScoringViewer'
import NegotiationMasterPanel      from './components/NegotiationMasterPanel'
import ChatPanel                   from './components/ChatPanel'

let _uid = 0
const uid = () => ++_uid

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getSession())
  const [appState,            setAppState]            = useState<AppState>('upload')
  const [sidebarOpen,         setSidebarOpen]         = useState(true)
  const [messages,            setMessages]            = useState<ChatMessage[]>([])
  const [fileProgress,        setFileProgress]        = useState<FileProgress[]>(
    MOCK_FILES.map(f => ({ ...f, progress: 0, status: 'waiting' as const }))
  )
  const [moreProgress,        setMoreProgress]        = useState(0)
  const [fileSelected,        setFileSelected]        = useState(false)
  const [bomSelected,         setBomSelected]         = useState(false)
  const [bomVisibleRows,      setBomVisibleRows]      = useState(0)
  const [classifiedRows,      setClassifiedRows]      = useState(0)
  const [dupFilterActive,     setDupFilterActive]     = useState(false)
  const [deletedBomIds,       setDeletedBomIds]       = useState<number[]>([])
  const [resolvedDupIds,      setResolvedDupIds]      = useState<number[]>([])
  const [editingBomId,        setEditingBomId]        = useState<number | null>(null)
  const [editedDescriptions,  setEditedDescriptions]  = useState<Record<number, string>>({})
  const [bomRows,             setBomRows]             = useState<BomRow[]>(BOM_ROWS)
  const [uploadedFileName,    setUploadedFileName]    = useState('')
  const [uploadedFiles,       setUploadedFiles]       = useState<File[]>([])
  const [bomFileOptions,      setBomFileOptions]      = useState<File[]>([])
  const pendingBomRef = useRef<{ rows: BomRow[]; fileName: string } | null>(null)
  const bomApiPromiseRef = useRef<Promise<{ rows: BomRow[]; fileName: string }> | null>(null)
  const [costStarted,         setCostStarted]         = useState(false)
  const [realBopRows,         setRealBopRows]         = useState<BopCostRow[] | null>(null)
  const [realCdpRows,         setRealCdpRows]         = useState<CdpCostRow[] | null>(null)
  /* 'bom' = show BomViewer, 'cost' = show CostBenchmarkViewer */
  const [viewMode,            setViewMode]            = useState<'bom' | 'cost'>('bom')
  const [costStep,            setCostStep]            = useState(0)  /* 0-6 steps complete */
  const [showPaymentModal,    setShowPaymentModal]    = useState(false)
  const [orderPlaced,         setOrderPlaced]         = useState(false)
  const [orderTotal,          setOrderTotal]          = useState(0)
  const [rfqMode,             setRfqMode]             = useState<'cdp' | 'bop' | 'both'>('cdp')
  const [rfqSource,           setRfqSource]           = useState<'cost' | 'bom'>('cost')
  const [chatAgentName,       setChatAgentName]       = useState<string | null>(null)
  const [dfmStep,             setDfmStep]             = useState(0)
  const [dfmReady,            setDfmReady]            = useState(false)
  const [mfgStep,             setMfgStep]             = useState(0)
  const [mfgSelectedVendor,  setMfgSelectedVendor]   = useState('')
  const [mfgOrderPlaced,     setMfgOrderPlaced]      = useState(false)
  const [mfgNegotiatedTotal, setMfgNegotiatedTotal]  = useState<number | undefined>(undefined)
  const mfgPaymentRef      = useRef(false)
  const mfgOrderPlacedRef  = useRef(false)
  const mfgNegRoundRef     = useRef(0)
  useEffect(() => { mfgOrderPlacedRef.current = mfgOrderPlaced }, [mfgOrderPlaced])
  const [demStep,             setDemStep]             = useState(0)
  const [demAssemblyType,     setDemAssemblyType]     = useState<'CKD' | 'SKD'>('CKD')
  const [negDealSize,         setNegDealSize]         = useState<'>10L' | '<10L'>('>10L')
  /* Lifted so resolved flags survive split↔full view switches */
  const [dfmResolvedFlags,    setDfmResolvedFlags]    = useState<string[]>([])
  /* Prevent double-fire if DFMViewer remounts while all flags already cleared */
  const dfmReadyFiredRef = useRef(false)
  /* Ref so handleChatAction can call handleSendAll (defined later) without deps ordering issue */
  const handleSendAllRef = useRef<(() => void) | null>(null)

  /* Sidebar collapses when file preview opens */
  useEffect(() => { setSidebarOpen(!fileSelected) }, [fileSelected])

  const timers = useRef<(ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>)[]>([])

  const addMsg = useCallback(
    (html: string, delay: number, actions?: ChatMessage['actions'], form?: ChatMessage['form']) => {
      const t = setTimeout(
        () => setMessages(prev => [...prev, { id: uid(), html, actions, form }]),
        delay,
      )
      timers.current.push(t)
    }, [],
  )

  const handleUserMessage = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: uid(), html: text, sender: 'user' }])
  }, [])

  const stripLastActions = useCallback(() => {
    setMessages(prev =>
      prev.map((m, i) => (i === prev.length - 1 ? { ...m, actions: undefined, form: undefined } : m)),
    )
  }, [])

  /* ── Initial chat ── */
  useEffect(() => {
    addMsg(`Hi! Welcome to Strenth flow — your AI co-pilot for hardware sourcing and manufacturing. Tell me what you're building and I'll handle the rest: DFM checks, supplier discovery, BOM sourcing, cost estimates. Multiple agents working in parallel, so you get answers fast. What are you working on?`, 350)
    addMsg(
      `<b>Is your design ready?</b><br><span class="msg-sub">Attach your design files to get started</span>`,
      1000,
      [
        { label: 'yes, attach files', variant: 'primary' },
        { label: 'Not yet',           variant: 'secondary' },
      ],
    )
    return () => timers.current.forEach(id => clearTimeout(id as ReturnType<typeof setTimeout>))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Attach — categorise files, start real bom API in background (single BOM only) ── */
  const handleAttach = useCallback((files: File[] = []) => {
    stripLastActions()
    setAppState('uploading')
    addMsg('Uploading your files… ⏳', 200)

    setUploadedFiles(files)
    const options = files.filter(f => /\.(xlsx|csv)$/i.test(f.name))
    setBomFileOptions(options)
    pendingBomRef.current = null

    /* Auto-start only when exactly one BOM file is present */
    if (options.length === 1) {
      const bomFile = options[0]
      const ctrl = new AbortController()
      const promise = uploadBomFile(bomFile)
        .then(job => pollBomJob(job.job_id, () => {}, ctrl.signal))
        .then(async summary => {
          if (summary.status === 'FAILED') throw new Error('BOM parsing failed on server')
          const items = await fetchBomItems(summary.job_id)
          const result = { rows: mapItemsToBomRows(items, bomFile.name), fileName: bomFile.name }
          pendingBomRef.current = result
          return result
        })
      bomApiPromiseRef.current = promise
    }
  }, [addMsg, stripLastActions])

  /* ── Upload animation ── */
  useEffect(() => {
    if (appState !== 'uploading') return
    let done = 0
    const ivs: ReturnType<typeof setInterval>[] = []
    MOCK_FILES.forEach((f, i) => {
      const startT = setTimeout(() => {
        setFileProgress(prev => prev.map((fp, idx) => idx === i ? { ...fp, status: 'uploading' } : fp))
        const step = 100 / (f.durationMs / 55)
        const iv = setInterval(() => {
          setFileProgress(prev => {
            const fp   = prev[i]
            if (fp.status === 'complete') { clearInterval(iv); return prev }
            const next = Math.min(100, fp.progress + step * (0.7 + Math.random() * 0.6))
            const done2 = next >= 100
            if (done2) { done++; if (done === MOCK_FILES.length) setTimeout(() => setAppState('analyzing'), 600) }
            return prev.map((x, idx) => idx === i ? { ...x, progress: next, status: done2 ? 'complete' : 'uploading' } : x)
          })
        }, 55)
        ivs.push(iv)
      }, i * 310)
      timers.current.push(startT)
    })
    return () => ivs.forEach(clearInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState])

  /* ── Analysing ── */
  useEffect(() => {
    if (appState !== 'analyzing') return
    const total  = uploadedFiles.length || 10
    const mech   = uploadedFiles.filter(f => /\.(step|stp|dxf|dwg|stl)$/i.test(f.name)).length || 5
    const elec   = uploadedFiles.filter(f => /\.(xlsx|csv|pdf|gbr|ger)$/i.test(f.name)).length  || 5
    addMsg(`Analysing ${total} file${total !== 1 ? 's' : ''} — tap any card to preview it in the centre ›`, 300)
    addMsg(`<b>Analysis Results</b> — ${total} File${total !== 1 ? 's' : ''} Analysed<br><span class="msg-sub">Mechanical — ${mech} file${mech !== 1 ? 's' : ''}<br>Electronics — ${elec} File${elec !== 1 ? 's' : ''}</span>`, 2200)
    addMsg(`<b>Analysis Results</b> — ${total} Files Analysed`, 4000)
    let mp = 28
    const iv = setInterval(() => { mp = Math.min(94, mp + 0.9 * (0.6 + Math.random())); setMoreProgress(mp) }, 110)
    timers.current.push(iv)
    const endT = setTimeout(() => { clearInterval(iv); setMoreProgress(100); setAppState('organized') }, 5800)
    timers.current.push(endT)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, uploadedFiles])

  /* ── Organised ── */
  useEffect(() => {
    if (appState !== 'organized') return
    const total = uploadedFiles.length || 10
    const mech  = uploadedFiles.filter(f => /\.(step|stp|dxf|dwg|stl)$/i.test(f.name)).length || 5
    const elec  = uploadedFiles.filter(f => /\.(xlsx|csv|pdf|gbr|ger)$/i.test(f.name)).length  || 5
    addMsg(
      `<b>Autosorting ${total} files in separate Folder!</b><br>
       <span class="msg-sub">Mechanical — ${mech} file${mech !== 1 ? 's' : ''}<br>Electronics — ${elec} File${elec !== 1 ? 's' : ''}<br>
       Files Organised! Folder is added on left side panel.</span>`,
      500,
    )
    if (bomFileOptions.length > 1) {
      addMsg(
        `<b>Multiple BOM files detected — select one to parse:</b><br>
         <span class="msg-sub">${bomFileOptions.map(f => f.name).join(' · ')}</span>`,
        2600,
        bomFileOptions.map(f => ({ label: f.name, variant: 'secondary' as const, key: `select-bom-${f.name}` })),
      )
    } else {
      const bomName = bomFileOptions[0]?.name ?? 'BOM_Assembly_v3.xlsx'
      addMsg(
        `<b>Would you like to start BOM Parsing?</b><br>
         <span class="msg-sub">${bomName} detected · Ready to parse</span>`,
        2600,
        [
          { label: 'Start BOM Parsing', variant: 'primary' as const },
          { label: 'Skip',              variant: 'secondary' as const },
        ],
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, bomFileOptions, uploadedFiles])

  /* ── BOM handoff — wait for real API data; never fall back to mock ── */
  const handleBomHandoff = useCallback(async () => {
    let pending = pendingBomRef.current
    let alreadyStripped = false

    if (!pending) {
      if (!bomApiPromiseRef.current) {
        addMsg('⚠️ No BOM file detected. Please upload an .xlsx or .csv BOM file.', 0)
        return
      }
      /* Update filename immediately so BomProgressPanel shows the real file */
      const earlyFileName = bomFileOptions[0]?.name
      if (earlyFileName) setUploadedFileName(earlyFileName)
      stripLastActions()
      alreadyStripped = true
      setFileSelected(false)
      setBomRows([])
      setAppState('bom-parsing')
      addMsg(`Parsing <b>${earlyFileName ?? 'your BOM'}</b> — please wait…`, 0)
      try {
        pending = await bomApiPromiseRef.current
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addMsg(`⚠️ BOM parsing failed: ${msg}. Please try uploading again.`, 0)
        setAppState('organized')
        return
      }
    }

    const { rows, fileName } = pending
    if (!alreadyStripped) stripLastActions()
    setFileSelected(false)
    setBomRows(rows)
    setUploadedFileName(fileName)
    setBomVisibleRows(rows.length)
    setClassifiedRows(0)
    setDupFilterActive(false)
    setDeletedBomIds([])
    setResolvedDupIds([])
    setEditingBomId(null)
    setEditedDescriptions({})
    addMsg(`Reading <b>${fileName}</b>…`, 0)
    addMsg(
      `<b>BOM Structure Detected</b><br>
       <span class="msg-sub">${rows.length} line items · 4 categories</span>`,
      0,
    )
    setBomSelected(true)
    setAppState('bom-complete')
  }, [stripLastActions, addMsg, bomFileOptions])

  /* ── BOM complete ── */
  useEffect(() => {
    if (appState !== 'bom-complete') return
    const total    = bomRows.length
    const approved = bomRows.filter(r => r.status === 'Approved').length
    const pending  = bomRows.filter(r => r.status !== 'Approved').length
    addMsg(
      `<b>BOM Parsed Successfully!</b><br>
       <span class="msg-sub">${total} parts extracted · ${approved} Approved · ${pending} Pending Review</span>`,
      500,
    )
    addMsg(
      `<b>Is this the complete BOM?</b><br>
       <span class="msg-sub">Review before proceeding to classification</span>`,
      2200,
      [
        { label: 'Yes, proceed',  variant: 'primary' },
        { label: 'No, add more',  variant: 'secondary', key: 'bom-no-add-more' },
      ],
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, bomRows])

  /* ── Classification — all rows classified instantly ── */
  const handleBomConfirm = useCallback(() => {
    const bop = bomRows.filter(r => r.classification === 'BOP').length
    const cdp = bomRows.filter(r => r.classification === 'CDP').length
    stripLastActions()
    setClassifiedRows(bomRows.length)
    setBomSelected(true)
    addMsg(
      `<b>Parts Classification Complete!</b><br>
       <span class="msg-sub">BOP: ${bop} · CDP: ${cdp}</span>`,
      200,
    )
    const t = setTimeout(() => {
      addMsg(
        `<b>What would you like to do next?</b><br>
         <span class="msg-sub">Select an agent to continue your workflow</span>`,
        0,
        undefined,
        'agent-select',
      )
    }, 600)
    timers.current.push(t)
    setAppState('bom-classifying')
  }, [bomRows, stripLastActions, addMsg])

  /* ── BOM inline-edit handlers ── */
  const handleEditRow  = useCallback((id: number) => setEditingBomId(id), [])

  const handleSaveEdit = useCallback((id: number, value: string) => {
    setEditedDescriptions(prev => ({ ...prev, [id]: value }))
    setEditingBomId(null)
    /* Mark this dup as resolved — clears its amber highlight + DUP badge */
    setResolvedDupIds(prev => [...prev, id])
  }, [])

  const handleDeleteRow = useCallback((id: number) => {
    setDeletedBomIds(prev => [...prev, id])
    setEditingBomId(null)
  }, [])

  /* ── Cost benchmarking chat actions ── */
  const handleChatAction = useCallback((key: string) => {
    stripLastActions()

    if (key === 'cost-start-yes') {
      setCostStarted(true)
      addMsg(
        `<b>Cost Benchmarking Agent</b><br>
         <span class="msg-sub">Do you have a cost benchmark on how much the product will be manufactured for?</span>`,
        300,
        [
          { label: 'Yes', variant: 'primary',   key: 'has-benchmark-yes' },
          { label: 'No',  variant: 'secondary', key: 'has-benchmark-no'  },
        ],
      )
    } else if (key === 'cost-start-no') {
      addMsg(
        `No problem! The classified BOM is ready — you can export or revisit Cost Benchmarking from the dashboard anytime.`,
        300,
      )
    } else if (key === 'has-benchmark-yes' || key === 'has-benchmark-no') {
      addMsg(
        `<b>How many pcs do you want to enquire for?</b><br>
         <span class="msg-sub">Better if quoted on annual quantity projections</span>`,
        300,
        undefined,
        'quantity-upload',
      )

    /* ── DFM Agent ── */
    } else if (key === 'agent-dfm') {
      setChatAgentName('DFM Agent')
      addMsg(
        `<b>DFM Agent</b> — Approx Time~ 5-8 min
         <div class="msg-steps">
           <p>1. Load design geometry — uploaded files ~2 min</p>
           <p>2. Map BOM parts to material &amp; process families ~2 min</p>
           <p>3. Evaluate manufacturing routes &amp; feasibility ~2 min</p>
           <p>4. Generate DFM flags &amp; cost estimates ~2 min</p>
         </div>`,
        400,
      )
      addMsg(
        `<span class="msg-agent-tag">@DFM Agent</span> <b>Let's analyse your product</b><br>
         <span class="msg-sub">Fill in the details below and we'll recommend the best manufacturing process for each part</span>`,
        2200,
        undefined,
        'dfm-form',
      )

    /* ── Manufacturing Agent ── */
    } else if (key === 'agent-manufacturing') {
      setChatAgentName('Manufacturing Agent')
      setAppState('mfg-planning')
      setMfgStep(0)
      addMsg(
        `<b>🏭 Manufacturing Agent</b> — Production Planning<br>
         <span class="msg-sub">Generating full production plan · Capacity planning · Build schedule · WIP tracking<br>
         Estimated time: <b>~42 seconds</b> processing · 2–5 days end-to-end</span>`,
        300,
      )
      addMsg(`📝 RFQ Preview Creation — generating RFQ templates for 11 parts…`, 1800)
      addMsg(`📋 Parsing BOM &amp; DFM report — 11 parts · 3 production lines identified…`, 4200)
      addMsg(`⚙️ Mapping production methods — CNC, Sheet Metal, PCB Fab, Procurement…`, 7500)
      addMsg(`📅 Optimising build schedule — critical path: MCH-001 → ELC-001 (25-day cycle)…`, 13000)
      addMsg(`🔄 Calculating WIP plan &amp; shop-floor allocation across Line A · B · C…`, 19000)
      const stepDelays = [1200, 2800, 5200, 8000, 11500, 15200, 18500]
      stepDelays.forEach((delay, i) => {
        const t = setTimeout(() => setMfgStep(i + 1), delay)
        timers.current.push(t)
      })
      const doneT = setTimeout(() => {
        setAppState('mfg-rfq')
        setMfgStep(7)
        setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>✅ Manufacturing Plan Ready!</b><br>
                 <span class="msg-sub">
                   11 parts planned · 25-day production cycle ·
                   3 lines active (CNC · Sheet Metal · PCB) ·
                   RFQ preview loaded — review in centre panel →
                 </span>`,
          actions: [
            { label: 'Send All RFQs', variant: 'primary' as const, key: 'send-mfg-rfqs' },
          ],
        }])
      }, 21000)
      timers.current.push(doneT)

    /* ── CM RFQ Agent ── */
    } else if (key === 'agent-dem') {
      setChatAgentName('CM RFQ Agent')
      setAppState('dem-assessing')
      setDemStep(0)
      addMsg(
        `<b>🏗️ CM RFQ Agent</b> — Contract Manufacturing<br>
         <span class="msg-sub">Assessing design files · Shortlisting Contract Manufacturers · Generating Assembly RFQ with NDA<br>
         Estimated time: <b>~30 seconds</b></span>`,
        300,
      )
      addMsg(`📂 Loading design files — firmware, hardware schematics, 3D models…`, 1400)
      addMsg(`🔍 Assessing manufacturability — firmware checkpoints · PCB complexity · mechanical tolerances…`, 3200)
      addMsg(`🏭 Shortlisting verified Contract Manufacturers — 5 CMs matched to your product profile…`, 5800)
      addMsg(`📄 Generating Assembly RFQ with NDA clauses — CKD &amp; SKD options included…`, 8500)
      const demStepDelays = [1000, 2500, 4200, 6200, 8000]
      demStepDelays.forEach((delay, i) => {
        const t = setTimeout(() => setDemStep(i + 1), delay)
        timers.current.push(t)
      })
      const demDoneT = setTimeout(() => {
        setAppState('dem-cm-rfq')
        setDemStep(2)
        setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>✅ Assembly RFQ Ready!</b><br>
                 <span class="msg-sub">
                   5 Contract Manufacturers shortlisted · NDA included ·
                   Choose CKD or SKD — review &amp; send in the centre panel →
                 </span>`,
          actions: [
            { label: 'Proceed with current design', variant: 'primary'   as const, key: 'dem-proceed'    },
            { label: 'Ideate changes first',         variant: 'secondary' as const, key: 'dem-ideate'     },
          ],
        }])
      }, 10000)
      timers.current.push(demDoneT)

    } else if (key === 'dem-proceed') {
      stripLastActions()
      addMsg(
        `<b>Design approved — sending Assembly RFQ</b><br>
         <span class="msg-sub">Review the CM list, toggle CKD/SKD, and hit Send All RFQs in the centre panel →</span>`,
        300,
      )

    } else if (key === 'dem-ideate') {
      stripLastActions()
      addMsg(
        `<b>Ideation mode</b><br>
         <span class="msg-sub">Upload your revised design files or notes. Once you're ready, the CM RFQ will be regenerated automatically.</span>`,
        300,
      )

    } else if (key === 'dem-rfq-sent') {
      setAppState('dem-factory')
      setDemStep(4)
      addMsg(
        `<b>📤 RFQs dispatched to all 5 CMs!</b><br>
         <span class="msg-sub">NDAs attached · Assembly type: ${demAssemblyType} · Responses expected in 3–5 days<br>
         Now choose how you'd like to engage with the factories →</span>`,
        300,
      )
      addMsg(
        `<b>How would you like to engage with Contract Manufacturers?</b><br>
         <span class="msg-sub">Select an engagement type in the centre panel — Scheduling Agent will handle invites automatically</span>`,
        1800,
      )

    } else if (key === 'dem-scheduled') {
      setAppState('dem-scheduling')
      setDemStep(5)
      addMsg(`📅 Scheduling Agent is sending calendar invites to all 5 CMs…`, 300)
      const schedDoneT = setTimeout(() => {
        setAppState('dem-ai-scoring')
        setDemStep(6)
        setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>✅ Meetings scheduled!</b><br>
                 <span class="msg-sub">Calendar invites sent · AI is now scoring all 5 CM quotes — review scorecard in the centre panel →</span>`,
          actions: [
            { label: 'View AI Scores', variant: 'primary' as const, key: 'dem-view-scores' },
          ],
        }])
      }, 2500)
      timers.current.push(schedDoneT)

    } else if (key === 'dem-view-scores') {
      stripLastActions()
      setAppState('dem-ai-scoring')
      addMsg(
        `<b>AI Scoring complete</b><br>
         <span class="msg-sub">Foxlink Electronics scored highest at 91/100 — review all CMs in the centre panel →</span>`,
        300,
      )

    } else if (key === 'dem-order') {
      setAppState('dem-complete')
      setDemStep(7)
      addMsg(
        `<b>🎉 Order placed with Foxlink Electronics!</b><br>
         <span class="msg-sub">Assembly type: ${demAssemblyType} · $186/unit · Lead time: 22 days · PO sent · NDA signed</span>`,
        300,
      )

    /* ── New: Sourcing Agent from BOM (no cost benchmarking) ── */
    } else if (key === 'agent-sourcing') {
      setRfqSource('bom')
      setChatAgentName('Strenth AI Agent')
      addMsg(
        `<b>Strenth AI Agent</b><br>
         <span class="msg-sub">Matching verified vendors · Generating RFQ templates · Setting target prices</span>`,
        400,
      )
      addMsg(
        `<b>Do you want to source standard parts or get quotes for custom parts?</b><br>
         <span class="msg-sub">Select which parts to source through our negotiation network</span>`,
        2400,
        [
          { label: 'Both',            variant: 'primary'   as const, key: 'rfq-both' },
          { label: 'Standard parts',  variant: 'secondary' as const, key: 'rfq-bop'  },
          { label: 'Custom parts',    variant: 'secondary' as const, key: 'rfq-cdp'  },
        ],
      )

    } else if (key === 'negotiation-yes') {
      setRfqSource('cost')
      stripLastActions()
      addMsg(
        `<b>Strenth AI Agent</b><br>
         <span class="msg-sub">Matching verified vendors · Generating RFQ templates · Setting target prices</span>`,
        400,
      )
      addMsg(
        `<b>Do you want to procure standard parts or get a quote for custom parts as well?</b><br>
         <span class="msg-sub">Select which parts to source through our negotiation network</span>`,
        2400,
        [
          { label: 'Both',            variant: 'primary'   as const, key: 'rfq-both' },
          { label: 'Standard parts',  variant: 'secondary' as const, key: 'rfq-bop'  },
          { label: 'Custom parts',    variant: 'secondary' as const, key: 'rfq-cdp'  },
        ],
      )

    /* ── Post-DFM final goal choices ── */
    } else if (key === 'turnkey-procurement') {
      stripLastActions()
      setChatAgentName('Strenth AI Agent')
      setRfqSource('bom')
      addMsg(
        `<b>📦 Turnkey Procurement — Strenth AI Agent is now live!</b><br>
         <span class="msg-sub">We'll handle end-to-end component sourcing for your DFM-verified product through our negotiation network.</span>`,
        300,
      )
      addMsg(
        `<b>Strenth AI Agent</b><br>
         <span class="msg-sub">Matching verified vendors · Generating RFQ templates · Setting target prices</span>`,
        1600,
      )
      addMsg(
        `<b>Which parts would you like to procure?</b><br>
         <span class="msg-sub">Select procurement scope for your Turnkey order</span>`,
        3800,
        [
          { label: 'Both',            variant: 'primary'   as const, key: 'rfq-both' },
          { label: 'Standard parts',  variant: 'secondary' as const, key: 'rfq-bop'  },
          { label: 'Custom parts',    variant: 'secondary' as const, key: 'rfq-cdp'  },
        ],
      )

    } else if (key === 'direct-manufacturing') {
      stripLastActions()
      addMsg(
        `<b>🏭 Direct Manufacturing</b><br>
         <span class="msg-sub">
           Your DFM-verified BOM will be dispatched to our certified manufacturing partner network.<br>
           <b>Coming soon</b> — you'll be notified as soon as this module is live.
         </span>`,
        300,
      )

    } else if (key === 'negotiation-skip') {
      stripLastActions()
      addMsg(
        `No problem! Click <b>Place Order</b> in the report header to proceed directly.`,
        300,
      )

    } else if (key === 'rfq-cdp' || key === 'rfq-bop' || key === 'rfq-both') {
      stripLastActions()
      const newMode = key === 'rfq-cdp' ? 'cdp' as const
                    : key === 'rfq-bop' ? 'bop' as const
                    : 'both' as const
      setRfqMode(newMode)

      const label = key === 'rfq-cdp' ? '6 Custom parts'
                  : key === 'rfq-bop' ? '5 Standard parts'
                  : '11 Standard + Custom parts'

      const timingLine = key === 'rfq-bop'
        ? `<br><span class="msg-sub" style="color:#15803d">⚡ Standard parts — quotes expected in <b>~1 day</b></span>`
        : key === 'rfq-both'
        ? `<br><span class="msg-sub">📦 Standard parts → quotes in <b>~1 day</b> &nbsp;·&nbsp; 🔧 Custom parts → quotes in <b>~5 days</b></span>`
        : `<br><span class="msg-sub">🔧 Custom manufactured parts — quotes expected in <b>3–5 days</b></span>`

      addMsg(
        `Creating RFQs for <b>${label}</b>…${timingLine}
         <span class="msg-sub">Matching verified vendors · Setting target prices · Preview loading in the centre panel →</span>`,
        300,
      )
      const t = setTimeout(() => {
        setAppState('sourcing-rfq')
        setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>✅ RFQ Preview Ready!</b><br>
                 <span class="msg-sub">
                   ${label} · Vendor list generated · Review &amp; edit in the centre panel →
                 </span>`,
          actions: [
            { label: 'Send All RFQs', variant: 'primary' as const, key: 'send-rfqs' },
          ],
        }])
      }, 2500)
      timers.current.push(t)

    } else if (key === 'send-rfqs') {
      handleSendAllRef.current?.()

    } else if (key === 'view-quotes') {
      setAppState('quotes-received')

    } else if (key === 'send-mfg-rfqs') {
      stripLastActions()
      addMsg(
        `<b>📤 RFQs Sent to 11 vendors</b><br>
         <span class="msg-sub">CNC · Sheet Metal · PCB · Procurement vendors notified · Responses in 3–5 days</span>`,
        300,
      )
      addMsg(
        `<b>✉️ AI-Suggested Vendor Shortlist</b><br>
         <span class="msg-sub">
           Strenth has shortlisted the best vendors based on your BOM profile, capabilities match &amp; customer history:<br>
           <b>1.</b> TechMach Pvt. Ltd. — Pune · CNC &amp; Assembly · Score 94/100<br>
           <b>2.</b> Bharat Precision Works — Chennai · CNC Turning · Score 91/100<br>
           <b>3.</b> PCB Power India — Bengaluru · PCB &amp; SMT · Score 89/100
         </span>`,
        2200,
      )
      const tVendor = setTimeout(() => {
        setAppState('mfg-vendor-list')
        addMsg(
          `<b>✅ Vendor shortlist ready — opening now</b><br>
           <span class="msg-sub">5 vendors matched · Review and book a factory visit in the centre panel →</span>`,
          0,
        )
      }, 3800)
      timers.current.push(tVendor)

    } else if (key === 'view-mfg-rfq') {
      setAppState('mfg-rfq')

    } else if (key === 'view-mfg-plan') {
      setAppState('mfg-complete')

    } else if (key === 'view-vendor-list') {
      stripLastActions()
      setAppState('mfg-vendor-list')

    } else if (key === 'view-order-details') {
      stripLastActions()
      setAppState('mfg-order-preview')
      addMsg(
        `<b>📄 Purchase Order — ORD-MFG-2026-0042</b><br>
         <span class="msg-sub">Grand Total: $12,591 (incl. 18% GST) · 11 parts · 25-day production cycle<br>
         Review the order document and choose how to proceed</span>`,
        500,
        [
          { label: 'Place Order',         variant: 'primary'   as const, key: 'mfg-place-order-cta' },
          { label: 'Negotiate the Order', variant: 'secondary' as const, key: 'mfg-negotiate-order'  },
        ],
      )

    } else if (key === 'mfg-place-order-cta') {
      stripLastActions()
      if (!mfgOrderPlacedRef.current) {
        mfgPaymentRef.current = true
        setOrderTotal(12591)
        setShowPaymentModal(true)
      } else {
        addMsg(`<b>Order already confirmed</b> — ORD-MFG-2026-0042 is placed and in production.`, 0)
      }

    } else if (key === 'mfg-negotiate-order') {
      stripLastActions()
      mfgNegRoundRef.current = 0
      if (MFG_GRAND_TOTAL_INR * 1.18 > 1000000) {
        addMsg(
          `<span class="msg-agent-tag">@Strenth Agent</span> <b>High-value order detected (>₹10 Lakhs)</b><br>
           <span class="msg-sub">I am connecting your call to a Strenth Negotiation Agent. One agent is live right now — would you like to connect the call?</span>`,
          300,
          [
            { label: 'Yes, Connect Now',    variant: 'primary'   as const, key: 'mfg-call-yes'  },
            { label: 'Negotiate Myself',    variant: 'secondary' as const, key: 'mfg-neg-self'  },
          ],
        )
      } else {
        addMsg(
          `<b>🤝 Negotiation Agent activated</b><br>
           <span class="msg-sub">Reviewing ORD-MFG-2026-0042 · $12,591 · TechMach Pvt. Ltd.<br>
           What would you like to negotiate?</span>`,
          300,
          [
            { label: '💰 Price Reduction', variant: 'primary'   as const, key: 'mfg-neg-price'   },
            { label: '⚡ Faster Delivery',  variant: 'secondary' as const, key: 'mfg-neg-delivery' },
            { label: '💳 Payment Terms',   variant: 'secondary' as const, key: 'mfg-neg-terms'    },
          ],
        )
      }

    } else if (key === 'mfg-neg-self') {
      stripLastActions()
      addMsg(
        `<b>🤝 Negotiation Agent activated</b><br>
         <span class="msg-sub">Reviewing ORD-MFG-2026-0042 · $12,591 · TechMach Pvt. Ltd.<br>
         What would you like to negotiate?</span>`,
        300,
        [
          { label: '💰 Price Reduction', variant: 'primary'   as const, key: 'mfg-neg-price'   },
          { label: '⚡ Faster Delivery',  variant: 'secondary' as const, key: 'mfg-neg-delivery' },
          { label: '💳 Payment Terms',   variant: 'secondary' as const, key: 'mfg-neg-terms'    },
        ],
      )

    } else if (key === 'mfg-neg-price') {
      stripLastActions()
      const negRound = mfgNegRoundRef.current
      if (negRound === 0) {
        addMsg(`🔍 Analyzing order pricing vs market benchmarks for all 11 parts…`, 300)
        addMsg(`📊 Comparing TechMach Pvt. Ltd. quotes against 14 similar vendors in Strenth network…`, 2200)
        addMsg(
          `<b>💡 Price reduction opportunity found — Round 1 of 3</b><br>
           <span class="msg-sub">
             MCH-001 — vendor at <b>$216.87/pc</b> · market avg <b>$198.00</b> → 8.7% above market<br>
             ELC-001 — vendor at <b>$361.45/pc</b> · market avg <b>$335.00</b> → 7.9% above market<br>
             Recommended counter offer: <b>$11,582</b> (saving ~$1,009)
           </span>`,
          4500,
          [
            { label: 'Send Counter Offer',  variant: 'primary'   as const, key: 'mfg-neg-send-offer' },
            { label: 'Keep Original Price', variant: 'secondary' as const, key: 'mfg-neg-keep-price' },
          ],
        )
      } else if (negRound === 1) {
        addMsg(`🔍 Round 2 — re-analyzing vendor's revised quote against network pricing…`, 300)
        addMsg(`📊 Vendor reduced 4.2% · ELC-001 still 3.5% above market · further room confirmed`, 2200)
        addMsg(
          `<b>💡 Additional reduction possible — Round 2 of 3</b><br>
           <span class="msg-sub">
             ELC-001 still at <b>$347.50/pc</b> · target $335.00 — 3.7% gap remaining<br>
             Revised counter offer: <b>$11,158</b> (total saving ~$1,433)
           </span>`,
          4000,
          [{ label: 'Send Counter Offer', variant: 'primary' as const, key: 'mfg-neg-send-offer' }],
        )
      } else {
        addMsg(`🔍 Final round — pushing for best possible price on ELC-001 batch volume…`, 300)
        addMsg(`📊 Strenth AI applying maximum leverage · vendor at risk of losing order to Bharat Precision`, 2000)
        addMsg(
          `<b>💡 Final counter offer — Round 3 of 3</b><br>
           <span class="msg-sub">
             Requesting last 2% reduction on ELC-001 using competing quote from PCB Power India<br>
             Final counter offer: <b>$10,936</b> (total saving ~$1,655 · 13.1%)
           </span>`,
          3800,
          [{ label: 'Send Final Counter Offer', variant: 'primary' as const, key: 'mfg-neg-send-offer' }],
        )
      }

    } else if (key === 'mfg-neg-delivery') {
      stripLastActions()
      addMsg(`📅 Checking TechMach Pvt. Ltd. production schedule and capacity…`, 300)
      addMsg(`🏭 Vendor has 2 CNC lines available · current lead time 25 days · rush capacity confirmed`, 2000)
      addMsg(
        `<b>⚡ Faster delivery is possible!</b><br>
         <span class="msg-sub">
           Standard: <b>25 days</b> · $12,591<br>
           Rush option: <b>18 days</b> · $12,968 (+3% expedite fee)<br>
           Express option: <b>14 days</b> · $13,472 (+7% expedite fee)
         </span>`,
        3800,
        [
          { label: '18-day delivery (+3%)',  variant: 'primary'   as const, key: 'mfg-neg-rush'     },
          { label: '14-day delivery (+7%)',  variant: 'secondary' as const, key: 'mfg-neg-express'  },
        ],
      )

    } else if (key === 'mfg-neg-terms') {
      stripLastActions()
      addMsg(`💳 Reviewing vendor payment history and credit terms in Strenth network…`, 300)
      addMsg(`✅ TechMach Pvt. Ltd. — 94% on-time payment record · 3 prior orders via Strenth · low risk profile`, 2000)
      addMsg(
        `<b>📋 Revised payment terms available</b><br>
         <span class="msg-sub">
           Current: 30% advance + 70% on delivery<br>
           Option A: <b>20% advance + 80% on delivery</b> (lower upfront)<br>
           Option B: <b>15% advance + 85% in Net-30</b> (maximum flexibility)
         </span>`,
        3500,
        [
          { label: '20% advance deal',   variant: 'primary'   as const, key: 'mfg-neg-terms-a' },
          { label: 'Net-30 option',      variant: 'secondary' as const, key: 'mfg-neg-terms-b' },
        ],
      )

    } else if (key === 'mfg-neg-send-offer') {
      stripLastActions()
      const sentRound = mfgNegRoundRef.current
      mfgNegRoundRef.current = sentRound + 1
      const offerAmts    = ['$11,582', '$11,158', '$10,936']
      const vendorAmts   = ['$11,893', '$11,320', '$10,936']
      const vendorAmtNum = [11893,     11320,     10936]
      addMsg(
        `<b>📤 Counter offer sent — Round ${sentRound + 1} of 3</b><br>
         <span class="msg-sub">Proposed: ${offerAmts[sentRound]} · Awaiting TechMach Pvt. Ltd. response…</span>`,
        300,
      )
      const t = setTimeout(() => {
        if (sentRound < 2) {
          /* Vendor partially accepts — auto-open PO with updated price */
          setMfgNegotiatedTotal(vendorAmtNum[sentRound])
          setAppState('mfg-order-preview')
          setMessages(prev => [...prev, {
            id: uid(),
            html: `<span class="msg-agent-tag">@TechMach Pvt. Ltd.</span> <b>Revised quote received</b><br>
                   <span class="msg-sub">Partial reduction accepted · New total: <b>${vendorAmts[sentRound]}</b><br>
                   Updated purchase order opened in centre panel →</span>`,
            actions: [
              { label: `Accept ${vendorAmts[sentRound]} & Place Order`, variant: 'primary'   as const, key: 'mfg-place-order-cta' },
              { label: 'Negotiate More',                                 variant: 'secondary' as const, key: 'mfg-neg-more'        },
            ],
          }])
        } else {
          /* Round 3 — vendor accepts final, auto-open PO with final price */
          setMfgNegotiatedTotal(vendorAmtNum[2])
          setAppState('mfg-order-preview')
          setMessages(prev => [...prev, {
            id: uid(),
            html: `<span class="msg-agent-tag">@TechMach Pvt. Ltd.</span> <b>Final offer accepted ✓</b><br>
                   <span class="msg-sub">Price confirmed: <b>$10,936</b> · Total saving: $1,655 (13.1%) · Delivery: 25 days<br>
                   Updated purchase order opened in centre panel →</span>`,
            actions: [
              { label: 'Place Order — $10,936', variant: 'primary'   as const, key: 'mfg-place-order-cta'  },
              { label: 'Negotiate Further',      variant: 'secondary' as const, key: 'mfg-neg-final-call'  },
            ],
          }])
        }
      }, 5000)
      timers.current.push(t)

    } else if (key === 'mfg-neg-more') {
      stripLastActions()
      const moreRound = mfgNegRoundRef.current
      addMsg(
        `<b>🔄 Continuing negotiation — Round ${moreRound + 1} of 3</b><br>
         <span class="msg-sub">Strenth AI reviewing vendor's response and preparing stronger counter…</span>`,
        300,
      )
      /* Inline next-round analysis */
      if (moreRound === 1) {
        addMsg(`🔍 Re-analyzing vendor's revised quote against network pricing…`, 1500)
        addMsg(`📊 ELC-001 still 3.5% above market · further reduction room confirmed`, 3200)
        addMsg(
          `<b>💡 Additional reduction possible — Round 2 of 3</b><br>
           <span class="msg-sub">
             ELC-001 still at <b>$347.50/pc</b> · target $335.00 — 3.7% gap remaining<br>
             Revised counter offer: <b>$11,158</b> (total saving ~$1,433)
           </span>`,
          5000,
          [{ label: 'Send Counter Offer', variant: 'primary' as const, key: 'mfg-neg-send-offer' }],
        )
      } else {
        addMsg(`🔍 Final round — applying maximum leverage on ELC-001 volume…`, 1500)
        addMsg(`📊 Competing quote from PCB Power India used as leverage · vendor at risk of losing order`, 3000)
        addMsg(
          `<b>💡 Final counter offer — Round 3 of 3</b><br>
           <span class="msg-sub">
             Last 2% reduction on ELC-001 batch · Final: <b>$10,936</b> (saving ~$1,655 · 13.1%)
           </span>`,
          4800,
          [{ label: 'Send Final Counter Offer', variant: 'primary' as const, key: 'mfg-neg-send-offer' }],
        )
      }

    } else if (key === 'mfg-neg-final-call') {
      stripLastActions()
      addMsg(
        `<span class="msg-agent-tag">@Strenth Agent</span> <b>We are connecting your call to a Strenth Agent</b><br>
         <span class="msg-sub">A senior negotiation specialist is available to help you push further on this order.<br>
         Would you like to connect via Google Meet now?</span>`,
        300,
        [
          { label: 'Yes, Connect via Google Meet', variant: 'primary'   as const, key: 'mfg-call-yes' },
          { label: 'No, Decline',                  variant: 'secondary' as const, key: 'mfg-call-no'  },
        ],
      )

    } else if (key === 'mfg-neg-keep-price') {
      stripLastActions()
      addMsg(
        `<b>Original pricing confirmed</b><br>
         <span class="msg-sub">Grand total: $12,591 · Proceeding with original terms</span>`,
        300,
        [
          { label: 'Place Order', variant: 'primary' as const, key: 'mfg-place-order-cta' },
        ],
      )

    } else if (key === 'mfg-neg-rush') {
      stripLastActions()
      addMsg(
        `<b>⚡ 18-day delivery confirmed!</b><br>
         <span class="msg-sub">Revised total: <b>$12,968</b> (+3% expedite) · Delivery by ${
           new Date(Date.now() + 18 * 86400000).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' })
         }<br>
         Production line priority slot reserved</span>`,
        300,
        [
          { label: 'Place Order — $12,968', variant: 'primary' as const, key: 'mfg-place-order-cta' },
        ],
      )

    } else if (key === 'mfg-neg-express') {
      stripLastActions()
      addMsg(
        `<b>🚀 14-day express delivery confirmed!</b><br>
         <span class="msg-sub">Revised total: <b>$13,472</b> (+7% expedite) · Delivery by ${
           new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' })
         }<br>
         Dedicated production line allocated</span>`,
        300,
        [
          { label: 'Place Order — $13,472', variant: 'primary' as const, key: 'mfg-place-order-cta' },
        ],
      )

    } else if (key === 'mfg-neg-terms-a') {
      stripLastActions()
      addMsg(
        `<b>✅ Payment terms updated — 20% advance</b><br>
         <span class="msg-sub">Advance due: <b>$2,518</b> (20%) · Balance: <b>$10,073</b> on delivery<br>
         Terms accepted by vendor · PO ready to sign</span>`,
        300,
        [
          { label: 'Place Order', variant: 'primary' as const, key: 'mfg-place-order-cta' },
        ],
      )

    } else if (key === 'mfg-neg-terms-b') {
      stripLastActions()
      addMsg(
        `<b>✅ Net-30 terms confirmed</b><br>
         <span class="msg-sub">Advance due: <b>$1,889</b> (15%) · Balance: <b>$10,702</b> in Net-30<br>
         Vendor approved · Invoice will be raised on delivery</span>`,
        300,
        [
          { label: 'Place Order', variant: 'primary' as const, key: 'mfg-place-order-cta' },
        ],
      )

    } else if (key === 'mfg-call-yes') {
      stripLastActions()
      window.open('https://meet.google.com/str-nth-agent', '_blank')
      addMsg(
        `<b>📞 Connecting to Strenth Agent…</b><br>
         <span class="msg-sub">Google Meet is opening in a new tab · Your agent will join within 30 seconds<br>
         Meeting ID: meet.google.com/str-nth-agent</span>`,
        300,
      )

    } else if (key === 'mfg-call-no') {
      stripLastActions()
      addMsg(
        `<b>Got it!</b> A Strenth Agent will stay on standby.<br>
         <span class="msg-sub">You can place the order or start negotiation anytime using the options above.</span>`,
        300,
      )

    } else if (key === 'place-mfg-order') {
      addMsg(
        `<b>🎉 Order Placed Successfully!</b><br>
         <span class="msg-sub">
           Order ${'ORD-MFG-2026-0042'} confirmed · $12,591 · 25-day production cycle<br>
           📧 Order confirmation sent to procurement@strenth.ai<br>
           📧 Vendor notified: your selected manufacturer · Production starts in 2 business days
         </span>`,
        0,
      )

    } else if (key === 'mfg-cm-yes') {
      stripLastActions()
      addMsg(
        `<span class="msg-agent-tag">@Manufacturing Agent</span> <b>Share your CM details</b><br>
         <span class="msg-sub">We'll send your project RFQ directly to your Contract Manufacturer</span>`,
        400,
        undefined,
        'cm-onboard',
      )

    } else if (key === 'mfg-cm-strenth') {
      stripLastActions()
      addMsg(
        `<b>🏭 Connecting to Strenth Manufacturer Network…</b><br>
         <span class="msg-sub">Shortlisting verified manufacturers · CNC · PCB Fabrication · Sheet Metal specialists</span>`,
        400,
      )
      addMsg(
        `<b>📧 CM has questions about your project</b><br>
         <span class="msg-sub">Your assigned CM needs clarification on tolerances for MCH-001 and PCB layer count for ELC-001 · Check your email and respond directly to the CM</span>`,
        3800,
      )
      const mfgCmT = setTimeout(() => {
        setAppState('mfg-quotes')
        addMsg(
          `<b>✅ Strenth Quotes Received!</b><br>
           <span class="msg-sub">All 11 vendors responded · Best quotes selected · Review comparison in centre panel →</span>`,
          0,
        )
        addMsg(
          `<b>📍 CM Location: Pune, Maharashtra</b> — same city as your team<br>
           <span class="msg-sub">We recommend an <b>in-person meeting</b> for project walkthrough · AI detected proximity via CM registration details</span>`,
          2200,
          [
            { label: 'Schedule In-Person', variant: 'primary'   as const, key: 'mfg-schedule-offline' },
            { label: 'Schedule Online',    variant: 'secondary' as const, key: 'mfg-schedule-online'  },
          ],
        )
      }, 7000)
      timers.current.push(mfgCmT)

    } else if (key === 'mfg-schedule-offline' || key === 'mfg-visit-offline') {
      stripLastActions()
      addMsg(
        `<b>📅 In-Person Meeting Scheduled!</b><br>
         <span class="msg-sub">📍 TechMach Pvt. Ltd., Pune · 12 Jun 2026, 10:30 AM IST<br>Agenda: BOM walkthrough · Delivery timeline · NDA signing</span>`,
        400,
      )
      addMsg(
        `<b>🤖 Scheduling Agent is live</b> — meeting confirmed from backend<br>
         <span class="msg-sub">Calendar invite sent to procurement@strenth.ai &amp; cm@techmach.in · Conference room booked</span>`,
        2500,
      )
      const mfgOrdT = setTimeout(() => {
        setMessages(prev => [...prev, { id: uid(), html: `<b>🔔 Strenth Sales Agent has confirmed your order!</b><br><span class="msg-sub">11 parts · $12,591 · Delivery: 30 Jun 2026 · Opening purchase order now…</span>` }])
        setAppState('mfg-order-preview')
      }, 5000)
      timers.current.push(mfgOrdT)
      const mfgCtaT = setTimeout(() => {
        setMessages(prev => [...prev, { id: uid(), html: `<b>📄 Purchase Order — ORD-MFG-2026-0042</b><br><span class="msg-sub">Grand Total: $12,591 · Review and proceed</span>`,
          actions: [
            { label: 'Place Order',         variant: 'primary'   as const, key: 'mfg-place-order-cta' },
            { label: 'Negotiate the Order', variant: 'secondary' as const, key: 'mfg-negotiate-order'  },
          ],
        }])
      }, 5600)
      timers.current.push(mfgCtaT)

    } else if (key === 'mfg-schedule-online' || key === 'mfg-visit-online') {
      stripLastActions()
      addMsg(
        `<b>📅 Online Meeting Scheduled!</b><br>
         <span class="msg-sub">🔗 Google Meet · 12 Jun 2026, 3:00 PM IST<br>Agenda: BOM walkthrough · Delivery timeline · NDA signing</span>`,
        400,
      )
      addMsg(
        `<b>🤖 Scheduling Agent is live</b> — meeting confirmed from backend<br>
         <span class="msg-sub">Google Meet link sent to procurement@strenth.ai · Reminder set 15 min before</span>`,
        2500,
      )
      const mfgOrdT2 = setTimeout(() => {
        setMessages(prev => [...prev, { id: uid(), html: `<b>🔔 Strenth Sales Agent has confirmed your order!</b><br><span class="msg-sub">11 parts · $12,591 · Delivery: 30 Jun 2026 · Opening purchase order now…</span>` }])
        setAppState('mfg-order-preview')
      }, 5000)
      timers.current.push(mfgOrdT2)
      const mfgCtaT2 = setTimeout(() => {
        setMessages(prev => [...prev, { id: uid(), html: `<b>📄 Purchase Order — ORD-MFG-2026-0042</b><br><span class="msg-sub">Grand Total: $12,591 · Review and proceed</span>`,
          actions: [
            { label: 'Place Order',         variant: 'primary'   as const, key: 'mfg-place-order-cta' },
            { label: 'Negotiate the Order', variant: 'secondary' as const, key: 'mfg-negotiate-order'  },
          ],
        }])
      }, 5600)
      timers.current.push(mfgCtaT2)

    } else if (key === 'mfg-order-confirm') {
      stripLastActions()
      setAppState('mfg-order-preview')

    } else if (key === 'mfg-order-cancel') {
      stripLastActions()
      addMsg(
        `<b>Order cancelled</b><br>
         <span class="msg-sub">No charges made · CM notified · You can restart the flow anytime</span>`,
        300,
      )

    } else if (key === 'negotiate-further') {
      stripLastActions()
      setChatAgentName('Negotiation Agent')
      addMsg(
        `<b>🤝 Negotiation Agent activated</b><br>
         <span class="msg-sub">Reviewing deal size to determine the right strategy — AI insights loading…</span>`,
        300,
      )
      addMsg(
        `<b>What is the deal size for this order?</b><br>
         <span class="msg-sub">This determines the negotiation strategy — pricing levers for large deals, payment terms for smaller ones</span>`,
        1600,
        [
          { label: '> ₹10 Lakh',  variant: 'primary'   as const, key: 'neg-gt10l' },
          { label: '< ₹10 Lakh',  variant: 'secondary' as const, key: 'neg-lt10l' },
        ],
      )

    } else if (key === 'neg-gt10l' || key === 'neg-lt10l') {
      const size = key === 'neg-gt10l' ? '>10L' as const : '<10L' as const
      setNegDealSize(size)
      stripLastActions()

      if (size === '>10L') {
        addMsg(`<b>Large deal detected (>₹10L)</b> — activating price, lead time &amp; incentive levers…`, 300)
        addMsg(`🧠 Reviewing AI insights — win probability, price gap, vendor interaction history…`, 1400)
        addMsg(`📊 Target: $178/unit · 22-day lead · 3% incentive offer ready`, 3200)
      } else {
        addMsg(`<b>Standard deal (<₹10L)</b> — activating payment terms &amp; portfolio bundling strategy…`, 300)
        addMsg(`💳 Checking PO# status &amp; confirming payment terms with vendor…`, 1400)
        addMsg(`📦 3 additional parts can be bundled · Net 60 + 6% discount offer ready`, 3200)
      }

      const t = setTimeout(() => {
        setAppState('neg-master')
        setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>🟢 Master Agent is ready</b><br>
                 <span class="msg-sub">AI insights loaded · Negotiation levers set · Review in the centre panel and choose your outcome →</span>`,
        }])
      }, 4500)
      timers.current.push(t)

    } else if (key === 'neg-order-close') {
      stripLastActions()
      setAppState('neg-closure')
      addMsg(
        `<b>✅ Order Closure initiated!</b><br>
         <span class="msg-sub">Vendor notified · Terms accepted · PO being raised · Finance team copied</span>`,
        300,
      )
      const t = setTimeout(() => setMessages(prev => [...prev, {
        id: uid(),
        html: `<b>🎉 Deal Closed!</b><br>
               <span class="msg-sub">Confirmation sent to vendor · CRM updated · Invoice expected in 2–3 business days</span>`,
        actions: [
          { label: 'View Order',  variant: 'primary'   as const, key: 'view-quotes' },
        ],
      }]), 2000)
      timers.current.push(t)

    } else if (key === 'neg-cancel') {
      stripLastActions()
      setAppState('neg-cancelled')
      addMsg(
        `<b>RFQ Cancelled</b><br>
         <span class="msg-sub">Vendor notified · Reason logged in CRM · Touch point set for follow-up in 3 days</span>`,
        300,
      )

    } else if (key === 'bom-no-add-more') {
      stripLastActions()
      if (bomFileOptions.length > 1) {
        addMsg(
          `<b>Select a different BOM file:</b><br>
           <span class="msg-sub">${bomFileOptions.map(f => f.name).join(' · ')}</span>`,
          300,
          bomFileOptions.map(f => ({ label: f.name, variant: 'secondary' as const, key: `use-bom-${f.name}` })),
        )
      } else {
        addMsg(
          `<b>Upload the complete BOM</b><br>
           <span class="msg-sub">Drag & drop the full BOM file to continue</span>`,
          300,
        )
      }

    } else if (key.startsWith('select-bom-') || key.startsWith('use-bom-')) {
      const prefix   = key.startsWith('select-bom-') ? 'select-bom-' : 'use-bom-'
      const fileName = key.slice(prefix.length)
      const file     = bomFileOptions.find(f => f.name === fileName)
      if (file) {
        stripLastActions()
        setFileSelected(false)
        addMsg(
          `<b>Processing ${file.name}</b><br>
           <span class="msg-sub">Uploading and parsing BOM…</span>`,
          200,
        )
        uploadBomFile(file)
          .then(job => pollBomJob(job.job_id, () => {}, new AbortController().signal))
          .then(async summary => {
            if (summary.status !== 'FAILED') {
              const apiItems = await fetchBomItems(summary.job_id)
              const rows = mapItemsToBomRows(apiItems, file.name)
              setBomRows(rows)
              setUploadedFileName(file.name)
              setBomVisibleRows(rows.length)
              setClassifiedRows(0)
              setDupFilterActive(false)
              setDeletedBomIds([])
              setResolvedDupIds([])
              setEditingBomId(null)
              setEditedDescriptions({})
              addMsg(
                `<b>BOM Structure Detected</b><br>
                 <span class="msg-sub">${rows.length} line items · 4 categories</span>`,
                0,
              )
              setBomSelected(true)
              setAppState('bom-complete')
            } else {
              addMsg(`<b>BOM parsing failed</b> — please try again or upload a different file.`, 0)
            }
          })
          .catch(() => addMsg(`<b>Could not reach BOM agent</b> — check your connection and try again.`, 0))
      }
    }
  }, [bomFileOptions, stripLastActions, addMsg])

  /* ── Form submit dispatcher ── */
  const handleFormSubmit = useCallback((formType: string) => {

    if (formType === 'dfm-form') {
      stripLastActions()
      setAppState('dfm-analyzing')
      setDfmStep(0)
      addMsg(
        `<b>Starting DFM analysis across 15 parts…</b><br>
         <span class="msg-sub">Evaluating geometry, tolerances &amp; manufacturing routes 🔬</span>`,
        0,
      )
      addMsg(`📐 Loading design geometry from mechanical &amp; electrical files…`, 1800)
      addMsg(`🗂 Mapping BOM parts to process families — Mechanical · Electronics · Fastener · Cable`, 4000)
      addMsg(`⚙️ Evaluating CNC, Laser, Injection Molding &amp; PCB Fabrication routes…`, 6500)
      addMsg(`🚩 Running DFM rule-checks — tolerances, draft angles, bend radii, wall thickness…`, 8500)

      const stepDelays = [1200, 2900, 4600, 6300, 8000, 9700]
      stepDelays.forEach((delay, i) => {
        const t = setTimeout(() => setDfmStep(i + 1), delay)
        timers.current.push(t)
      })

      const doneT = setTimeout(() => {
        setAppState('dfm-complete')
        setDfmStep(6)
        setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>✅ DFM Analysis Complete!</b><br>
                 <span class="msg-sub">
                   15 parts analysed · 8 manufacturing processes identified ·
                   6 DFM flags raised · Tooling cost estimated ·
                   Full report visible in the centre panel →
                 </span>`,
        }])
      }, 10800)
      timers.current.push(doneT)

    } else if (formType === 'quantity-upload') {
      /* ── Start cost processing ── */
      setAppState('cost-processing')
      setViewMode('cost')
      setCostStep(0)
      setBomSelected(false)
      setFileSelected(false)
      setRealBopRows(null)

      /* Use live bomRows state — contains real API data if upload happened */
      const bopItems = bomRows.filter(r => r.classification === 'BOP')
      const cdpItems = bomRows.filter(r => r.classification === 'CDP')
      const cdpCount = cdpItems.length
      const cdpCostRows: CdpCostRow[] = cdpItems.map(r => ({
        id:                    r.id,
        partNo:                r.partNo,
        description:           r.description,
        qty:                   r.qty,
        tentativeMaterial:     '',
        productionMethod:      'Custom',
        historicalCostPerUnit: 0,
        totalCost:             0,
      }))
      setRealCdpRows(cdpCostRows)

      fetchBulkPrices(bopItems.map(r => ({ mpn: r.partNo, qty: r.qty })))
        .then(results => {
          const rows = mapPriceResultsToBopRows(results, bopItems)
          if (rows.length > 0) setRealBopRows(rows)
          else addMsg(`⚠️ Pricing API returned no results — showing estimated data.`, 0)
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          addMsg(`⚠️ Could not fetch live prices: ${msg}`, 0)
        })

      addMsg(
        `<b>Starting cost benchmark for ${bopItems.length} BOP parts…</b><br>
         <span class="msg-sub">Querying Mouser · DigiKey · LCSC · Element14 · Indian stores in parallel →</span>`,
        0,
      )
      const stepDelays = [1400, 2900, 4700, 6300, 7900, 9500]
      stepDelays.forEach((delay, i) => {
        const t = setTimeout(() => setCostStep(i + 1), delay)
        timers.current.push(t)
      })
      const doneT = setTimeout(() => {
        setAppState('cost-complete')
        setCostStep(6)
        setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>Cost Benchmarking Complete!</b><br>
                 <span class="msg-sub">
                   ${bopItems.length} Standard Parts · ${cdpCount} Custom Parts priced ·
                   HSN codes verified · Landed cost with BCD calculated
                 </span>`,
          actions: [
            { label: 'Place Order',  variant: 'primary'   as const },
            { label: '15–20% off',   variant: 'secondary' as const, key: 'negotiation-yes' },
          ],
        }])
      }, 10900)
      timers.current.push(doneT)

    } else if (formType === 'cm-onboard') {
      stripLastActions()
      addMsg(
        `<b>✅ CM details received</b><br>
         <span class="msg-sub">Sending project RFQ to your CM · They will review and respond within 1–2 business days</span>`,
        400,
      )
      addMsg(
        `<b>📧 CM needs clarification on your project</b><br>
         <span class="msg-sub">Your CM has questions about tolerances on MCH-001 and PCB layer count for ELC-001 · Check your email and respond directly to the CM</span>`,
        3000,
      )
      const cmFormT = setTimeout(() => {
        setAppState('mfg-quotes')
        addMsg(
          `<b>✅ Quotes Received from your CM!</b><br>
           <span class="msg-sub">Your CM has responded with pricing · Review quotes in centre panel →</span>`,
          0,
        )
        addMsg(
          `<b>📍 Your CM Location</b> — based on registration details<br>
           <span class="msg-sub">AI detected CM is in <b>Pune, Maharashtra</b> — near your team. Recommending in-person meeting</span>`,
          2000,
          [
            { label: 'Schedule In-Person', variant: 'primary'   as const, key: 'mfg-schedule-offline' },
            { label: 'Schedule Online',    variant: 'secondary' as const, key: 'mfg-schedule-online'  },
          ],
        )
      }, 7000)
      timers.current.push(cmFormT)
    }
  }, [addMsg])

  /* keep rfqMode accessible in the send callback without re-creating it */
  const rfqModeRef = useRef(rfqMode)
  useEffect(() => { rfqModeRef.current = rfqMode }, [rfqMode])

  /* ── Send All RFQs → live tracking state → quotes ── */
  const handleSendAll = useCallback(() => {
    const mode = rfqModeRef.current

    handleUserMessage('Send All RFQs')
    /* Switch to live tracker immediately */
    setAppState('rfq-tracking')

    /* Immediate dispatch confirmation */
    setMessages(prev => [...prev, {
      id: uid(),
      html: mode === 'both'
        ? `<b>📤 RFQs dispatched!</b><br><span class="msg-sub">5 Standard + 6 Custom parts → distributors & manufacturers · Live tracker active in centre panel →</span>`
        : mode === 'bop'
        ? `<b>📤 RFQs dispatched to distributors!</b><br><span class="msg-sub">⚡ 5 Standard parts RFQs sent · Responses expected in ~1 day · Live tracking in centre panel →</span>`
        : `<b>📤 RFQs dispatched!</b><br><span class="msg-sub">6 Custom parts RFQs sent · Responses expected in ~5 days · Live tracking in centre panel →</span>`,
    }])

    /* ── Progressive chat events ── */
    if (mode === 'bop' || mode === 'both') {
      addMsg(`⚡ RFQ for <b>ELC-005</b> has been opened`, 2000)
      addMsg(`⏳ Quote being prepared for <b>ELC-005</b>`, 4500)
      addMsg(`✅ First quote in — MCH-003 · <b>$17/set</b> · <span style="color:#15803d;font-weight:600">Below target 🎯</span>`, 6000)
      if (mode === 'bop')
        addMsg(`📊 4/5 Standard parts have at least one quote — looking competitive`, 9500)
    }
    if (mode === 'cdp' || mode === 'both') {
      const base = mode === 'both' ? 13500 : 3000
      addMsg(`👁 RFQ for <b>MCH-001</b> has been opened`, base)
      addMsg(`⏳ Multiple vendors are now preparing quotes`, base + 4500)
      addMsg(`✅ Quote received — MCH-002 · <b>$285/unit</b> · <span style="color:#15803d;font-weight:600">Target met! 🎯</span>`, base + 6500)
      if (mode === 'cdp')
        addMsg(`📊 3/6 Custom parts have at least one quote — partial preview building`, base + 11000)
    }

    /* ── Completion events ── */
    const quotesReadyMsg = (m: 'bop' | 'cdp' | 'both') => {
      const html = m === 'bop'
        ? `<b>✅ All Standard parts quotes received!</b><br><span class="msg-sub">⚡ 1 day turnaround · 5 parts · Avg. score <b>90/100</b> · Comparison report ready</span>`
        : m === 'both'
        ? `<b>✅ Custom parts quotes also received!</b><br><span class="msg-sub">5 days · 6 parts · Avg. score <b>87/100</b> · Full Standard + Custom parts report ready — 2 Excel sheets</span>`
        : `<b>✅ All Custom parts quotes received!</b><br><span class="msg-sub">5 days · 6 parts · Avg. score <b>87/100</b> · Comparison report ready</span>`
      const excelLabel = m === 'both' ? 'Download Excel (Standard + Custom)'
        : m === 'bop' ? 'Download Excel (Standard)' : 'Download Excel (Custom)'
      return { html, excelLabel }
    }

    if (mode === 'both') {
      /* BOP done at ~13s → partial update */
      const t1 = setTimeout(() => {
        setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>✅ Standard parts quotes all in!</b><br><span class="msg-sub">⚡ 1 day · 5 parts · Avg. score 90/100 · Custom parts responses still arriving (~5 days)…</span>`,
        }])
      }, 13000)
      timers.current.push(t1)

      /* All done at ~27s */
      const t2 = setTimeout(() => {
        const { html, excelLabel } = quotesReadyMsg('both')
        setMessages(prev => [...prev, {
          id: uid(), html,
          actions: [
            { label: '📊 View Full Comparison', variant: 'primary'   as const, key: 'view-quotes'     },
            { label: excelLabel,                variant: 'secondary' as const, key: 'download-quotes' },
          ],
        }])
        setAppState('quotes-received')
        const t3 = setTimeout(() => setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>💡 Want better pricing?</b><br><span class="msg-sub">Negotiation Agent can push for 5–8% more reduction on L1 quotes.</span>`,
          actions: [{ label: '🤝 Negotiate Further', variant: 'secondary' as const, key: 'negotiate-further' }],
        }]), 900)
        timers.current.push(t3)
      }, 27000)
      timers.current.push(t2)

    } else {
      const completionMs = mode === 'bop' ? 13000 : 27000
      const t1 = setTimeout(() => {
        const { html, excelLabel } = quotesReadyMsg(mode)
        setMessages(prev => [...prev, {
          id: uid(), html,
          actions: [
            { label: '📊 View Comparison', variant: 'primary'   as const, key: 'view-quotes'     },
            { label: excelLabel,           variant: 'secondary' as const, key: 'download-quotes' },
          ],
        }])
        setAppState('quotes-received')
        const t2 = setTimeout(() => setMessages(prev => [...prev, {
          id: uid(),
          html: `<b>💡 Not satisfied with pricing?</b><br><span class="msg-sub">Negotiation Agent can push for 5–8% more reduction on L1 quotes.</span>`,
          actions: [{ label: '🤝 Negotiate Further', variant: 'secondary' as const, key: 'negotiate-further' }],
        }]), 900)
        timers.current.push(t2)
      }, completionMs)
      timers.current.push(t1)
    }
  }, [addMsg])

  /* Keep the sendAll ref current so handleChatAction('send-rfqs') can call it */
  handleSendAllRef.current = handleSendAll

  /* ── DFM all resolved — fires once; adds "Choose final goal?" ── */
  const handleDfmAllResolved = useCallback(() => {
    if (dfmReadyFiredRef.current) return
    dfmReadyFiredRef.current = true
    setDfmReady(true)

    setMessages(prev => [...prev, {
      id: uid(),
      html: `<b>✅ All DFM issues resolved!</b><br>
             <span class="msg-sub">
               Your product is now <b>Ready for Manufacturing</b> —
               tag updated in the project panel on the left.
             </span>`,
    }])

    /* "Choose final goal?" — appears 2 s after resolved message */
    const t = setTimeout(() => {
      setMessages(prev => [...prev, {
        id: uid(),
        html: `<b>🎯 Choose your final goal</b><br>
               <span class="msg-sub">Your product is DFM-verified and manufacturing-ready. What would you like to do next?</span>`,
        actions: [
          { label: '📦 Turnkey Procurement',  variant: 'primary'   as const, key: 'turnkey-procurement'  },
          { label: '🏭 Direct Manufacturing', variant: 'secondary' as const, key: 'direct-manufacturing' },
        ],
      }])
    }, 2000)
    timers.current.push(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Place Order (opens modal in main area) ── */
  const handlePlaceOrder = useCallback((total?: number) => {
    if (total !== undefined) setOrderTotal(total)
    handleUserMessage('Place Order')
    setShowPaymentModal(true)
  }, [handleUserMessage])

  /* ── Modal: details submitted → post profile card to chat ── */
  const handleDetailsSubmit = useCallback(() => {
    addMsg(
      `<b>Details Confirmed</b><br>
       <div class="msg-profile-card">
         <div class="msg-profile-row"><span class="msg-profile-icon">👤</span>Pratibha Singh</div>
         <div class="msg-profile-row"><span class="msg-profile-icon">📱</span>+91 98765 43210</div>
         <div class="msg-profile-row"><span class="msg-profile-icon">✉️</span>pratibha@strenth.ai</div>
         <div class="msg-profile-row"><span class="msg-profile-icon">🏢</span>Strenth.ai Pvt. Ltd.</div>
         <div class="msg-profile-row"><span class="msg-profile-icon">📋</span>GSTIN: 27STRNT0000A1Z5</div>
       </div>`,
      0,
    )
  }, [addMsg])

  /* ── Modal: OTP verified → payment success ── */
  const handlePaymentComplete = useCallback(() => {
    setShowPaymentModal(false)
    if (mfgPaymentRef.current) {
      mfgPaymentRef.current = false
      setMfgOrderPlaced(true)
      addMsg(
        `<b>🎉 Order Placed Successfully!</b><br>
         <span class="msg-sub">
           Order ORD-MFG-2026-0042 confirmed · $12,591 · 25-day production cycle<br>
           📧 Confirmation sent to procurement@strenth.ai · Production starts in 2 business days
         </span>`,
        0,
      )
    } else {
      setOrderPlaced(true)
      addMsg(
        `<b>Payment Successful ✓</b><br>
         <span class="msg-sub">Order placed · Transaction rzp_live confirmed · Invoice sent to pratibha@strenth.ai</span>`,
        0,
      )
      const t = setTimeout(() => setAppState('payment-success'), 800)
      timers.current.push(t)
    }
  }, [addMsg])

  /* Auto-deactivate dup filter once all duplicates are resolved or deleted */
  useEffect(() => {
    if (!dupFilterActive) return
    const allDupIds = BOM_ROWS.filter(r => r.isDuplicate).map(r => r.id)
    const allGone   = allDupIds.every(id => resolvedDupIds.includes(id) || deletedBomIds.includes(id))
    if (allGone) setDupFilterActive(false)
  }, [resolvedDupIds, deletedBomIds, dupFilterActive])

  /* ── Primary action dispatcher ── */
  const handlePrimaryAction = useCallback(() => {
    if      (appState === 'upload' || appState === 'uploading') handleAttach()
    else if (appState === 'organized')    handleBomHandoff()
    else if (appState === 'bom-complete') handleBomConfirm()
  }, [appState, handleAttach, handleBomHandoff, handleBomConfirm])

  const isDemState = appState === 'dem-assessing' || appState === 'dem-cm-rfq'
    || appState === 'dem-factory' || appState === 'dem-scheduling'
    || appState === 'dem-ai-scoring' || appState === 'dem-complete'

  const isNegState = appState === 'neg-master' || appState === 'neg-closure' || appState === 'neg-cancelled'

  const agentName =
    (appState === 'mfg-planning' || appState === 'mfg-complete' || appState === 'mfg-rfq' || appState === 'mfg-quotes' || appState === 'mfg-vendor-list' || appState === 'mfg-order-preview')
      ? 'Manufacturing Agent'
      : (appState === 'dfm-analyzing' || appState === 'dfm-complete')
      ? (chatAgentName === 'Strenth AI Agent' ? 'Strenth AI Agent' : 'DFM Agent')
      : (appState === 'sourcing-rfq' || appState === 'rfq-tracking' || appState === 'quotes-received')
      ? 'Strenth AI Agent'
      : (appState === 'cost-processing' || appState === 'cost-complete' || appState === 'payment-success')
      ? 'Strenth AI Agent'
      : isDemState
      ? 'CM RFQ Agent'
      : isNegState
      ? 'Negotiation Agent'
      : costStarted
      ? 'Strenth AI Agent'
      : 'Strenth AI Agent'

  /* @mention agents enabled once BOM classification has started */
  const atAgentsEnabled = appState === 'bom-classifying'
    || appState === 'cost-processing' || appState === 'cost-complete'
    || appState === 'dfm-analyzing'   || appState === 'dfm-complete'
    || appState === 'sourcing-rfq'    || appState === 'rfq-tracking'
    || appState === 'quotes-received' || appState === 'payment-success'

  const isDfmState      = appState === 'dfm-analyzing' || appState === 'dfm-complete'
  const isMfgState      = appState === 'mfg-planning'  || appState === 'mfg-complete' || appState === 'mfg-rfq' || appState === 'mfg-quotes' || appState === 'mfg-vendor-list' || appState === 'mfg-order-preview'
  const demStarted      = isDemState
  const isDfmSplitView  = appState === 'dfm-complete' && fileSelected
  const isBomState  = appState === 'bom-parsing' || appState === 'bom-complete' || appState === 'bom-classifying'
  /* CostProgressPanel — only for cost states (not sourcing; sourcing has its own panel) */
  const isCostState = appState === 'cost-processing' || appState === 'cost-complete' || appState === 'payment-success'
  /* SourcingProgressPanel — for all RFQ/sourcing states */
  const isRfqState  = appState === 'sourcing-rfq' || appState === 'rfq-tracking' || appState === 'quotes-received'
  const isSplitView     = isBomState && bomSelected && fileSelected && viewMode === 'bom'
  const isCostSplitView = (appState === 'cost-processing' || appState === 'cost-complete') && fileSelected
  const isMfgSplitView  = (appState === 'mfg-rfq' || appState === 'mfg-quotes' || appState === 'mfg-vendor-list' || appState === 'mfg-order-preview') && fileSelected

  /* Shared BomViewer props */
  const bomViewerProps = {
    rows:               bomRows,
    fileName:           uploadedFileName,
    visibleRows:        bomVisibleRows,
    classifiedRows,
    isComplete:         appState === 'bom-complete' || appState === 'bom-classifying',
    dupFilterActive,
    editingBomId,
    deletedBomIds,
    resolvedDupIds,
    editedDescriptions,
    onEditRow:   handleEditRow,
    onSaveEdit:  handleSaveEdit,
    onDeleteRow: handleDeleteRow,
  }

  const handleBomSidebarSelect = useCallback(() => {
    setViewMode('bom')
    setBomSelected(true)
    setFileSelected(false)
  }, [])

  const handleCostSidebarSelect = useCallback(() => {
    setViewMode('cost')
    setBomSelected(false)
    setFileSelected(false)
  }, [])

  /* ── Order History file click → show the success/receipt screen ── */
  const handleOrderFileSelect = useCallback(() => {
    setFileSelected(false)
    setAppState('payment-success')
  }, [])

  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />
  }

  return (
    <div className="layout">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(v => !v)}
        appState={appState}
        onFileSelect={() => setFileSelected(true)}
        onBomFileSelect={handleBomSidebarSelect}
        onCostFileSelect={handleCostSidebarSelect}
        onOrderFileSelect={handleOrderFileSelect}
        onDfmAgentSelect={() => {
          if (appState === 'dfm-analyzing' || appState === 'dfm-complete') return  // already showing
          setAppState('dfm-complete')
        }}
        onSourcingAgentSelect={() => {
          if (appState === 'quotes-received') return
          if (appState === 'rfq-tracking')    return
          setAppState('sourcing-rfq')
        }}
        onMfgAgentSelect={() => {
          if (appState === 'mfg-planning') return
          if (appState === 'mfg-complete') setAppState('mfg-rfq')
          else setAppState('mfg-rfq')
        }}
        onDemAgentSelect={() => {
          if (isDemState) setAppState(appState === 'dem-complete' ? 'dem-ai-scoring' : appState)
        }}
        orderPlaced={orderPlaced}
        mfgOrderPlaced={mfgOrderPlaced}
        dfmReady={dfmReady}
        costStarted={costStarted}
        mfgStarted={appState === 'mfg-planning' || appState === 'mfg-complete' || appState === 'mfg-rfq' || appState === 'mfg-quotes' || appState === 'mfg-vendor-list' || appState === 'mfg-order-preview'}
        demStarted={demStarted}
        onMfgOrderFileSelect={() => setAppState('mfg-order-preview')}
        user={currentUser}
        onSignOut={() => { signOut(); setCurrentUser(null) }}
        uploadedFiles={uploadedFiles}
        uploadedFileName={uploadedFileName}
      />

      {/* ════ Main area ════ */}
      <main className={`main-area${(isSplitView || isCostSplitView || isDfmSplitView || isMfgSplitView) ? ' main-area--split' : ''}`} style={{ position: 'relative' }}>

        {appState === 'upload' && <UploadZone onAttach={handleAttach} />}

        {(appState === 'uploading' || appState === 'analyzing') && <div className="blank-canvas" />}

        {appState === 'organized' && fileSelected && <FileViewer onClose={() => setFileSelected(false)} />}
        {appState === 'organized' && !fileSelected && (
          <div className="blank-canvas" style={{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 2h9l5 5v15a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/>
              <polyline points="9,2 9,7 14,7"/>
            </svg>
            <span style={{ fontSize:13, color:'#9ca3af' }}>Click a file to preview</span>
          </div>
        )}

        {/* ── Split view (BOM + file preview) ── */}
        {isSplitView && (
          <>
            <div className="split-pane"><FileViewer onClose={() => setFileSelected(false)} /></div>
            {/* Close on BomViewer collapses split → full BomViewer (closes the file pane) */}
            <div className="split-pane"><BomViewer {...bomViewerProps} onClose={() => setFileSelected(false)} /></div>
          </>
        )}

        {/* ── BOM states — BOM viewer ── */}
        {isBomState && bomSelected && !fileSelected && viewMode === 'bom' && (
          <BomViewer {...bomViewerProps} onClose={() => setBomSelected(false)} />
        )}
        {isBomState && fileSelected && !bomSelected && (
          <FileViewer onClose={() => setFileSelected(false)} />
        )}
        {isBomState && !bomSelected && !fileSelected && (
          <div
            className="blank-canvas"
            style={{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, cursor: appState === 'bom-parsing' ? 'pointer' : 'default' }}
            onClick={appState === 'bom-parsing' ? () => setBomSelected(true) : undefined}
          >
            <svg width="38" height="38" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="#dcfce7" />
              <rect x="6" y="9"  width="20" height="14" rx="2" fill="#16a34a" opacity=".2" />
              <line x1="6"  y1="13.5" x2="26" y2="13.5" stroke="#16a34a" strokeWidth="0.9" />
              <line x1="6"  y1="17.5" x2="26" y2="17.5" stroke="#16a34a" strokeWidth="0.9" />
              <line x1="13" y1="9"    x2="13" y2="23"   stroke="#16a34a" strokeWidth="0.9" />
              <line x1="20" y1="9"    x2="20" y2="23"   stroke="#16a34a" strokeWidth="0.9" />
            </svg>
            <span style={{ fontSize:13, color:'#9ca3af' }}>
              {appState === 'bom-parsing'
                ? 'Parsing BOM — click the file row to view data live'
                : 'Click BOM file row in the panel to view data'}
            </span>
          </div>
        )}

        {/* ── Sourcing Agent — RFQ preview ── */}
        {appState === 'sourcing-rfq' && (
          <RFQViewer
            mode={rfqMode}
            onClose={() => { setBomSelected(false); setFileSelected(false); setAppState('bom-classifying') }}
            onSendAll={handleSendAll}
          />
        )}

        {/* ── Sourcing Agent — Live RFQ tracker ── */}
        {appState === 'rfq-tracking' && (
          <RFQTracker
            mode={rfqMode}
            onComplete={() => setAppState('quotes-received')}
          />
        )}

        {/* ── Sourcing Agent — Quotes comparison ── */}
        {appState === 'quotes-received' && (
          <QuotesViewer
            mode={rfqMode}
            onClose={() => { setBomSelected(false); setFileSelected(false); setAppState('bom-classifying') }}
            onPlaceOrder={handlePlaceOrder}
          />
        )}

        {/* ── DFM Agent — analysing ── */}
        {appState === 'dfm-analyzing' && (
          <div className="blank-canvas" style={{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:32 }}>🔬</div>
            <span style={{ fontSize:13, color:'#7c3aed', fontWeight:600 }}>DFM Analysis running…</span>
            <span style={{ fontSize:12, color:'#9ca3af' }}>Progress in the panel →</span>
          </div>
        )}

        {/* ── DFM complete — split (file preview + report) ── */}
        {isDfmSplitView && (
          <>
            <div className="split-pane">
              <FileViewer onClose={() => setFileSelected(false)} />
            </div>
            <div className="split-pane">
              <DFMViewer
                resolvedFlags={dfmResolvedFlags}
                onResolveFlag={key => setDfmResolvedFlags(prev => [...prev, key])}
                onClose={() => setFileSelected(false)}
                onAllResolved={handleDfmAllResolved}
              />
            </div>
          </>
        )}

        {/* ── DFM complete — full width ── */}
        {appState === 'dfm-complete' && !fileSelected && (
          <DFMViewer
            resolvedFlags={dfmResolvedFlags}
            onResolveFlag={key => setDfmResolvedFlags(prev => [...prev, key])}
            onClose={() => { setBomSelected(false); setFileSelected(false); setAppState('bom-classifying') }}
            onAllResolved={handleDfmAllResolved}
          />
        )}

        {/* ── Manufacturing Agent — planning (no split, blank canvas) ── */}
        {appState === 'mfg-planning' && (
          <div className="blank-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 32 }}>🏭</div>
            <span style={{ fontSize: 13, color: '#d97706', fontWeight: 600 }}>Manufacturing Plan in progress…</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>Progress in the panel →</span>
          </div>
        )}

        {/* ── Manufacturing Agent — split FileViewer (shared left pane) ── */}
        {isMfgSplitView && (
          <div className="split-pane">
            <FileViewer onClose={() => setFileSelected(false)} />
          </div>
        )}

        {/* ── Manufacturing Agent — RFQ ── */}
        {appState === 'mfg-rfq' && (() => {
          const rfqEl = (
            <RFQViewer
              mode="both"
              onClose={() => { setFileSelected(false); setAppState('mfg-complete') }}
              onSendAll={() => {
                stripLastActions()
                addMsg(
                  `<b>📨 RFQs Sent to 11 vendors</b><br>
                   <span class="msg-sub">CNC · Sheet Metal · PCB · Procurement vendors notified · Responses in 3–5 days</span>`,
                  300,
                )
                addMsg(
                  `<b>✉️ AI-Suggested Vendor Shortlist</b><br>
                   <span class="msg-sub">
                     Strenth has shortlisted the best vendors based on your BOM profile, capabilities match &amp; customer history:<br>
                     <b>1.</b> TechMach Pvt. Ltd. — Pune · CNC &amp; Assembly · Score 94/100<br>
                     <b>2.</b> Bharat Precision Works — Chennai · CNC Turning · Score 91/100<br>
                     <b>3.</b> PCB Power India — Bengaluru · PCB &amp; SMT · Score 89/100
                   </span>`,
                  2200,
                )
                const tAutoV = setTimeout(() => {
                  setAppState('mfg-vendor-list')
                  addMsg(`<b>✅ Vendor shortlist opening in centre panel →</b><br><span class="msg-sub">5 vendors matched · Book a factory visit to proceed</span>`, 0)
                }, 3800)
                timers.current.push(tAutoV)
              }}
            />
          )
          return isMfgSplitView ? <div className="split-pane">{rfqEl}</div> : rfqEl
        })()}

        {/* ── Manufacturing Agent — Quotes ── */}
        {appState === 'mfg-quotes' && (() => {
          const el = (
            <QuotesViewer
              mode="both"
              onClose={() => { setFileSelected(false); setAppState('mfg-rfq') }}
              onPlaceOrder={(total) => { setOrderTotal(total); setShowPaymentModal(true) }}
            />
          )
          return isMfgSplitView ? <div className="split-pane">{el}</div> : el
        })()}

        {/* ── Manufacturing Agent — Vendor List ── */}
        {appState === 'mfg-vendor-list' && (() => {
          const el = (
            <MfgVendorList
              onClose={() => { setFileSelected(false); setAppState('mfg-rfq') }}
              onBookVisit={(vendorName) => {
                setMfgSelectedVendor(vendorName)
                stripLastActions()
                const meetDate = new Date(Date.now() + 3 * 86400000)
                  .toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                addMsg(
                  `<b>📅 Meeting Scheduled — ${vendorName}</b><br>
                   <span class="msg-sub">Your factory visit has been booked for <b>${meetDate}</b> · 10:00 AM IST<br>
                   Agenda: Facility tour · Production line review · Order briefing · Q&amp;A</span>`,
                  0,
                )
                /* Sales agent confirms + auto-opens PDF */
                const tConfirm = setTimeout(() => {
                  setMessages(prev => [...prev, {
                    id: uid(),
                    html: `<span class="msg-agent-tag">@Strenth Sales Agent</span> <b>Order Confirmed</b><br>
                           <span class="msg-sub">
                             Vendor: <b>${vendorName}</b> · 11 parts · $12,591 · Delivery in 25 days<br>
                             Opening your purchase order now…
                           </span>`,
                  }])
                  setAppState('mfg-order-preview')
                }, 4000)
                timers.current.push(tConfirm)
                /* Add order CTAs to chat after PDF opens */
                const tCtas = setTimeout(() => {
                  setMessages(prev => [...prev, {
                    id: uid(),
                    html: `<b>📄 Purchase Order — ORD-MFG-2026-0042</b><br>
                           <span class="msg-sub">Grand Total: $12,591 (incl. 18% GST) · 11 parts · 25-day production cycle<br>
                           Review the order document and choose how to proceed</span>`,
                    actions: [
                      { label: 'Place Order',         variant: 'primary'   as const, key: 'mfg-place-order-cta' },
                      { label: 'Negotiate the Order', variant: 'secondary' as const, key: 'mfg-negotiate-order'  },
                    ],
                  }])
                }, 4600)
                timers.current.push(tCtas)
              }}
            />
          )
          return isMfgSplitView ? <div className="split-pane">{el}</div> : el
        })()}

        {/* ── Manufacturing Agent — Order Preview ── */}
        {appState === 'mfg-order-preview' && (() => {
          const el = (
            <MfgOrderPreview
              vendorName={mfgSelectedVendor || 'TechMach Pvt. Ltd.'}
              orderPlaced={mfgOrderPlaced}
              negotiatedTotalUSD={mfgNegotiatedTotal}
              onClose={() => { setFileSelected(false); setAppState('mfg-vendor-list') }}
              onPlaceOrder={() => {
                if (mfgOrderPlaced) return
                mfgPaymentRef.current = true
                setOrderTotal(mfgNegotiatedTotal ?? 12591)
                setShowPaymentModal(true)
              }}
            />
          )
          return isMfgSplitView ? <div className="split-pane">{el}</div> : el
        })()}

        {/* ── CM RFQ Agent — assessing ── */}
        {appState === 'dem-assessing' && (
          <div className="blank-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 32 }}>🏗️</div>
            <span style={{ fontSize: 13, color: '#0e7490', fontWeight: 600 }}>Assessing design files…</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>Progress in the panel →</span>
          </div>
        )}

        {/* ── CM RFQ Agent — RFQ preview ── */}
        {appState === 'dem-cm-rfq' && (
          <CmRFQViewer
            onClose={() => setAppState('bom-classifying')}
            onSendAll={(type) => {
              setDemAssemblyType(type)
              handleChatAction('dem-rfq-sent')
            }}
          />
        )}

        {/* ── CM RFQ Agent — factory engagement ── */}
        {(appState === 'dem-factory' || appState === 'dem-scheduling') && (
          <FactoryEngageViewer
            onClose={() => setAppState('dem-cm-rfq')}
            onSchedule={() => handleChatAction('dem-scheduled')}
          />
        )}

        {/* ── CM RFQ Agent — AI scoring ── */}
        {(appState === 'dem-ai-scoring' || appState === 'dem-complete') && (
          <AIScoringViewer
            onClose={() => setAppState('dem-factory')}
            onPlaceOrder={(_cmName, price) => {
              handleChatAction('dem-order')
              setOrderTotal(price * 500)
            }}
          />
        )}

        {/* ── Negotiation Agent — Master Agent panel ── */}
        {(appState === 'neg-master' || appState === 'neg-closure' || appState === 'neg-cancelled') && (
          <NegotiationMasterPanel
            dealSize={negDealSize}
            onClose={() => setAppState('quotes-received')}
            onOrderClose={(withIncentive) => {
              handleUserMessage(withIncentive ? 'Close with Incentive' : 'Close with Lower Incentive')
              handleChatAction('neg-order-close')
            }}
            onCancelRFQ={(reason) => {
              handleUserMessage(`Cancel RFQ — ${reason}`)
              handleChatAction('neg-cancel')
            }}
          />
        )}

        {/* ── Payment success — full-width success screen ── */}
        {appState === 'payment-success' && (
          <PaymentSuccess amount={orderTotal} onClose={() => { setAppState('cost-complete'); setViewMode('cost'); setFileSelected(false); }} />
        )}

        {/* ── Cost states — split or full view ── */}
        {isCostSplitView && (
          <>
            <div className="split-pane"><FileViewer onClose={() => setFileSelected(false)} /></div>
            <div className="split-pane">
              <CostBenchmarkViewer
                isProcessing={appState === 'cost-processing'}
                onClose={() => setFileSelected(false)}
                onPlaceOrder={handlePlaceOrder}
                orderPlaced={orderPlaced}
                bopRows={realBopRows ?? undefined}
                cdpRows={realCdpRows ?? undefined}
                fileName={uploadedFileName || undefined}
              />
            </div>
          </>
        )}
        {!isCostSplitView && (appState === 'cost-processing' || appState === 'cost-complete') && viewMode === 'cost' && (
          <CostBenchmarkViewer
            isProcessing={appState === 'cost-processing'}
            onClose={() => setViewMode('bom')}
            onPlaceOrder={handlePlaceOrder}
            orderPlaced={orderPlaced}
            bopRows={realBopRows ?? undefined}
            cdpRows={realCdpRows ?? undefined}
            fileName={uploadedFileName || undefined}
          />
        )}
        {!isCostSplitView && (appState === 'cost-processing' || appState === 'cost-complete') && viewMode === 'bom' && (
          <BomViewer {...bomViewerProps} onClose={() => setViewMode('cost')} />
        )}

        {/* ── Payment modal — overlays main area with blur ── */}
        {showPaymentModal && (
          <PaymentModal
            amount={orderTotal}
            onClose={() => setShowPaymentModal(false)}
            onDetailsSubmit={handleDetailsSubmit}
            onPaymentComplete={handlePaymentComplete}
          />
        )}

      </main>

      {/* ════ Right column ════ */}
      {/* right-col--has-panel pins the chat to 400px only when a progress panel is actually visible above it */}
      <aside className={`right-col${(isBomState || isCostState || isDfmState || isRfqState || isMfgState || isDemState || appState === 'uploading' || appState === 'analyzing' || appState === 'organized') ? ' right-col--has-panel' : ''}`}>
        {(appState === 'uploading' || appState === 'analyzing' || appState === 'organized') && (
          <ProgressPanel
            appState={appState}
            fileProgress={fileProgress}
            moreProgress={moreProgress}
            onFileSelect={() => setFileSelected(true)}
          />
        )}
        {isBomState && (
          <BomProgressPanel
            visibleRows={bomVisibleRows}
            classifiedRows={classifiedRows}
            isComplete={appState === 'bom-complete' || appState === 'bom-classifying'}
            isClassifying={appState === 'bom-classifying'}
            bomSelected={bomSelected}
            dupFilterActive={dupFilterActive}
            onBomSelect={() => setBomSelected(true)}
            onDupFilter={() => setDupFilterActive(v => !v)}
            totalRows={bomVisibleRows > 0 ? bomVisibleRows : undefined}
            fileName={uploadedFileName}
          />
        )}
        {isCostState && (
          <CostProgressPanel
            costStep={costStep}
            isComplete={appState === 'cost-complete' || appState === 'payment-success'}
            costFileSelected={viewMode === 'cost'}
            onCostFileSelect={handleCostSidebarSelect}
          />
        )}
        {isRfqState && (
          <SourcingProgressPanel
            phase={appState as 'sourcing-rfq' | 'rfq-tracking' | 'quotes-received'}
            rfqMode={rfqMode}
          />
        )}
        {isDfmState && (
          <DFMProgressPanel
            dfmStep={dfmStep}
            isComplete={appState === 'dfm-complete'}
          />
        )}
        {isMfgState && (
          <ManufacturingProgressPanel
            mfgStep={mfgStep}
            isComplete={appState === 'mfg-complete' || appState === 'mfg-rfq' || appState === 'mfg-quotes' || appState === 'mfg-vendor-list' || appState === 'mfg-order-preview'}
          />
        )}
        {isDemState && (
          <DemProgressPanel
            demStep={demStep}
            isComplete={appState === 'dem-complete'}
          />
        )}
        <ChatPanel
          messages={messages}
          onAction={handlePrimaryAction}
          onChatAction={handleChatAction}
          onFormSubmit={handleFormSubmit}
          onUserMessage={handleUserMessage}
          agentName={agentName}
          atAgentsEnabled={atAgentsEnabled}
        />
      </aside>
    </div>
  )
}
