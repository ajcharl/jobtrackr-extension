import React, { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  Box,
  Stack,
  TextField,
  Button,
  Select,
  MenuItem,
  Chip,
  Typography,
  IconButton,
  InputAdornment,
  FormControl,
  Paper,
  CssBaseline,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
  Alert,
  CircularProgress,
  Autocomplete,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  DeleteForever as DeleteForeverIcon,
  DeleteSweep as DeleteSweepIcon,
  RestoreFromTrash as RestoreIcon,
  Search as SearchIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  WorkOutline as WorkIcon,
  TrendingUp as TrendingUpIcon,
  EmojiEvents as TrophyIcon,
  Launch as LaunchIcon,
  ExpandLess as CollapseIcon,
  Email as EmailIcon,
  Sync as SyncIcon,
  Check as CheckIcon,
  SwapHoriz as SwapIcon,
  LinkOff as DisconnectIcon,
  Dashboard as DashboardIcon,
  FormatListBulleted as ListIcon,
  DeleteOutline as TrashIcon,
  BarChart as AnalyticsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from "@mui/icons-material";
import { ThemeProvider, createTheme } from "@mui/material/styles";

/* ===== STATUS COLORS ===== */
const STATUS_COLORS = {
  Applied:   { light: "#2563eb", dark: "#5b9dff", glow: "rgba(37,99,235,0.15)" },
  Interview: { light: "#059669", dark: "#34d399", glow: "rgba(5,150,105,0.15)" },
  Offer:     { light: "#d97706", dark: "#fbbf24", glow: "rgba(217,119,6,0.15)" },
  Rejected:  { light: "#dc2626", dark: "#f87171", glow: "rgba(220,38,38,0.15)" },
  Closed:    { light: "#6b7280", dark: "#9ca3af", glow: "rgba(107,114,128,0.15)" },
};

const STATUS_LIST = ["All", "Applied", "Interview", "Offer", "Rejected", "Closed"];

/* ===== SIDEBAR WIDTH ===== */
const SIDEBAR_W = 220;
const SIDEBAR_COLLAPSED_W = 64;

/* ===== MAIN APP INNER ===== */
function AppInner() {
  const { mode } = React.useContext(ModeContext);

  // Navigation
  const [currentView, setCurrentView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Data
  const [jobs, setJobs] = useState([]);
  const [formData, setFormData] = useState({ title: "", company: "", source: "", notes: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOption, setSortOption] = useState("Newest");
  const [trashJobs, setTrashJobs] = useState([]);
  const [selectedTrash, setSelectedTrash] = useState(new Set());
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [confirmDialog, setConfirmDialog] = useState({ open: false, action: null, message: "" });
  const [formOpen, setFormOpen] = useState(false);
  // Email suggestions state
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [yahooConnected, setYahooConnected] = useState(false);
  const [yahooEmail, setYahooEmail] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [reassignDialog, setReassignDialog] = useState({ open: false, suggestionId: null });

  const isLight = mode === "light";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  // --- Helpers ---
  const relativeDate = (dateStr) => {
    if (!dateStr) return "\u2014";
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  // --- Data loading ---
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const backendJobs = await api.getJobs();
      if (!cancelled && backendJobs) {
        setJobs(backendJobs);
        if (window.chrome?.storage?.local) window.chrome.storage.local.set({ jobs: backendJobs });
        return;
      }
      if (!cancelled && window.chrome?.storage?.local) {
        window.chrome.storage.local.get("jobs", (result) => {
          if (!cancelled && result.jobs) setJobs(result.jobs);
        });
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // --- Gmail + Yahoo status loading ---
  useEffect(() => {
    async function loadEmailProviders() {
      const [gmailStatus, yahooStatus] = await Promise.all([
        api.getGmailStatus(),
        api.getYahooStatus(),
      ]);
      if (gmailStatus) {
        setGmailConnected(gmailStatus.connected);
        setGmailEmail(gmailStatus.email || "");
      }
      if (yahooStatus) {
        setYahooConnected(yahooStatus.connected);
        setYahooEmail(yahooStatus.email || "");
      }
    }
    loadEmailProviders();
  }, []);

  useEffect(() => {
    async function loadSuggestions() {
      if (gmailConnected || yahooConnected) {
        const data = await api.getSuggestions("pending");
        if (data) setSuggestions(data);
      }
    }
    loadSuggestions();
  }, [gmailConnected, yahooConnected]);

  // Check URL params for OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected") === "true") {
      setGmailConnected(true);
      setCurrentView("email-sync");
      window.history.replaceState({}, "", window.location.pathname);
      api.getGmailStatus().then((s) => { if (s) setGmailEmail(s.email || ""); });
    }
    if (params.get("yahoo_connected") === "true") {
      setYahooConnected(true);
      setCurrentView("email-sync");
      window.history.replaceState({}, "", window.location.pathname);
      api.getYahooStatus().then((s) => { if (s) setYahooEmail(s.email || ""); });
    }
    if (params.get("gmail_error") || params.get("yahoo_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // --- Handlers ---
  const handleSyncEmails = async () => {
    setSyncing(true);
    setSyncResult(null);
    const result = await api.runEmailSync();
    setSyncing(false);
    if (result) {
      setSyncResult(result);
      const data = await api.getSuggestions("pending");
      if (data) setSuggestions(data);
    }
  };

  const handleApplySuggestion = async (suggestion) => {
    const result = await api.updateSuggestion(suggestion.id, {
      action: "apply", applicationId: suggestion.applicationId,
    });
    if (result) {
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      const backendJobs = await api.getJobs();
      if (backendJobs) setJobs(backendJobs);
    }
  };

  const handleIgnoreSuggestion = async (suggestion) => {
    const result = await api.updateSuggestion(suggestion.id, { action: "ignore" });
    if (result) setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
  };

  const handleReassignSuggestion = async (suggestionId, newAppId) => {
    const result = await api.updateSuggestion(suggestionId, {
      action: "apply", applicationId: newAppId,
    });
    if (result) {
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
      setReassignDialog({ open: false, suggestionId: null });
      const backendJobs = await api.getJobs();
      if (backendJobs) setJobs(backendJobs);
    }
  };

  const handleDisconnectGmail = async () => {
    await api.disconnectGmail();
    setGmailConnected(false);
    setGmailEmail("");
    if (!yahooConnected) setSuggestions([]);
  };

  const handleDisconnectYahoo = async () => {
    await api.disconnectYahoo();
    setYahooConnected(false);
    setYahooEmail("");
    if (!gmailConnected) setSuggestions([]);
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const addJob = (e) => {
    e.preventDefault();
    const payload = {
      title: formData.title.trim(), company: formData.company.trim(),
      source: formData.source.trim(), notes: formData.notes?.trim() || "",
      status: "Applied", appliedAt: new Date().toISOString(),
    };
    if (!payload.title || !payload.company || !payload.source) return;
    const tempId = Date.now();
    const optimisticJob = { ...payload, id: tempId };
    setJobs((prev) => [optimisticJob, ...prev]);
    setFormData({ title: "", company: "", source: "", notes: "" });
    setFormOpen(false);
    api.createJob(payload).then((created) => {
      if (created) {
        setJobs((prev) => prev.map((j) => (j.id === tempId ? created : j)));
      } else if (window.chrome?.storage?.local) {
        window.chrome.storage.local.get("jobs", (r) => {
          const all = r.jobs || []; all.unshift(optimisticJob);
          window.chrome.storage.local.set({ jobs: all });
        });
      }
    });
  };

  const updateStatus = async (id, newStatus) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)));
    const result = await api.updateJob(id, { status: newStatus });
    if (!result && window.chrome?.storage?.local) {
      window.chrome.storage.local.get("jobs", (r) => {
        const updated = (r.jobs || []).map((j) => (j.id === id ? { ...j, status: newStatus } : j));
        window.chrome.storage.local.set({ jobs: updated });
      });
    }
  };

  const deleteJob = async (id) => {
    const jobToDelete = jobs.find((j) => j.id === id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setSelectedJobs((prev) => { const next = new Set(prev); next.delete(id); return next; });
    if (jobToDelete) setTrashJobs((prev) => [{ ...jobToDelete, isDeleted: true }, ...prev]);
    await api.deleteJob(id);
    if (window.chrome?.storage?.local) {
      window.chrome.storage.local.get("jobs", (r) => {
        window.chrome.storage.local.set({ jobs: (r.jobs || []).filter((j) => j.id !== id) });
      });
    }
  };

  const loadTrash = async () => { const trash = await api.getTrash(); if (trash) setTrashJobs(trash); };
  useEffect(() => { if (currentView === "trash") loadTrash(); }, [currentView]); // eslint-disable-line react-hooks/exhaustive-deps

  const restoreJob = async (id) => {
    const jobToRestore = trashJobs.find((j) => j.id === id);
    setTrashJobs((prev) => prev.filter((j) => j.id !== id));
    setSelectedTrash((prev) => { const next = new Set(prev); next.delete(id); return next; });
    if (jobToRestore) setJobs((prev) => [{ ...jobToRestore, isDeleted: false, deletedAt: null }, ...prev]);
    const restored = await api.restoreJob(id);
    if (restored && jobToRestore) setJobs((prev) => prev.map((j) => (j.id === id ? restored : j)));
    else if (!restored && jobToRestore) {
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setTrashJobs((prev) => [jobToRestore, ...prev]);
    }
  };

  const permanentDeleteJob = async (id) => {
    setTrashJobs((prev) => prev.filter((j) => j.id !== id));
    setSelectedTrash((prev) => { const next = new Set(prev); next.delete(id); return next; });
    await api.permanentDeleteJob(id);
  };

  const toggleTrashSelect = (id) => {
    setSelectedTrash((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedTrash(selectedTrash.size === trashJobs.length ? new Set() : new Set(trashJobs.map((j) => j.id)));
  };
  const deleteSelectedTrash = async () => {
    const ids = [...selectedTrash];
    setTrashJobs((prev) => prev.filter((j) => !selectedTrash.has(j.id)));
    setSelectedTrash(new Set());
    await api.batchDeleteTrash(ids);
  };
  const emptyAllTrash = async () => { setTrashJobs([]); setSelectedTrash(new Set()); await api.emptyTrash(); };
  const toggleJobSelect = (id) => {
    setSelectedJobs((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAllJobs = () => {
    setSelectedJobs(selectedJobs.size === filteredJobs.length ? new Set() : new Set(filteredJobs.map((j) => j.id)));
  };
  const deleteSelectedJobs = async () => {
    const ids = [...selectedJobs];
    const jobsToDelete = jobs.filter((j) => selectedJobs.has(j.id));
    setJobs((prev) => prev.filter((j) => !selectedJobs.has(j.id)));
    setTrashJobs((prev) => [...jobsToDelete.map((j) => ({ ...j, isDeleted: true })), ...prev]);
    setSelectedJobs(new Set());
    await api.batchDeleteJobs(ids);
  };
  const restoreSelectedTrash = async () => {
    const ids = [...selectedTrash];
    const jobsToRestore = trashJobs.filter((j) => selectedTrash.has(j.id));
    setTrashJobs((prev) => prev.filter((j) => !selectedTrash.has(j.id)));
    setJobs((prev) => [...jobsToRestore.map((j) => ({ ...j, isDeleted: false, deletedAt: null })), ...prev]);
    setSelectedTrash(new Set());
    await api.batchRestoreTrash(ids);
  };
  const confirmAction = (msg, action) => setConfirmDialog({ open: true, message: msg, action });
  const handleConfirm = () => { if (confirmDialog.action) confirmDialog.action(); setConfirmDialog({ open: false, action: null, message: "" }); };

  // Filtering + Sorting
  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = job.title.toLowerCase().includes(q) || job.company.toLowerCase().includes(q) || (job.notes || "").toLowerCase().includes(q);
        return matchesSearch && (statusFilter === "All" || job.status === statusFilter);
      })
      .sort((a, b) => {
        if (sortOption === "Newest") return b.id - a.id;
        if (sortOption === "Title") return a.title.localeCompare(b.title);
        if (sortOption === "Company") return a.company.localeCompare(b.company);
        return 0;
      });
  }, [jobs, searchQuery, statusFilter, sortOption]);

  // Analytics
  const stats = useMemo(() => {
    const total = jobs.length;
    const applied = jobs.filter((j) => j.status === "Applied").length;
    const interviews = jobs.filter((j) => j.status === "Interview").length;
    const offers = jobs.filter((j) => j.status === "Offer").length;
    const rejected = jobs.filter((j) => j.status === "Rejected").length;
    const responseRate = total > 0 ? (((interviews + offers + rejected) / total) * 100).toFixed(0) : "0";
    return { total, applied, interviews, offers, rejected, responseRate };
  }, [jobs]);

  const sidebarW = sidebarOpen ? SIDEBAR_W : SIDEBAR_COLLAPSED_W;

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <DashboardIcon sx={{ fontSize: 20 }} /> },
    { id: "applications", label: "Applications", icon: <ListIcon sx={{ fontSize: 20 }} />, badge: jobs.length },
    { id: "email-sync", label: "Email Sync", icon: <EmailIcon sx={{ fontSize: 20 }} />, badge: suggestions.length || null },
    { id: "trash", label: "Trash", icon: <TrashIcon sx={{ fontSize: 20 }} />, badge: trashJobs.length || null },
  ];

  /* ===========================
     RENDER
     =========================== */
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>

      {/* ==================== SIDEBAR ==================== */}
      <Box
        sx={{
          width: sidebarW,
          minWidth: sidebarW,
          borderRight: "1px solid",
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          transition: "all 200ms ease",
          position: "fixed",
          top: 0, bottom: 0, left: 0,
          zIndex: 200,
          bgcolor: isLight ? "rgba(255,255,255,0.85)" : "rgba(17,17,20,0.9)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Brand */}
        <Box sx={{ p: sidebarOpen ? 2.5 : 1.5, pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{
              width: 32, height: 32, minWidth: 32, borderRadius: 2,
              background: isLight
                ? "linear-gradient(135deg, #2563eb, #7c3aed)"
                : "linear-gradient(135deg, #5b9dff, #a78bfa)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <WorkIcon sx={{ fontSize: 18, color: "#fff" }} />
            </Box>
            {sidebarOpen && (
              <Typography sx={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.02em", color: "text.primary" }}>
                JobTrackr
              </Typography>
            )}
          </Stack>
        </Box>

        {/* Nav items */}
        <Box sx={{ flex: 1, px: sidebarOpen ? 1.5 : 1, pt: 1 }}>
          {navItems.map((item) => {
            const active = currentView === item.id;
            return (
              <Box
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                sx={{
                  display: "flex", alignItems: "center", gap: 1.5,
                  px: sidebarOpen ? 1.5 : 0,
                  py: 1,
                  mb: 0.25,
                  borderRadius: 2,
                  cursor: "pointer",
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                  color: active ? (isLight ? "#2563eb" : "#5b9dff") : "text.secondary",
                  bgcolor: active
                    ? (isLight ? "rgba(37,99,235,0.08)" : "rgba(91,157,255,0.1)")
                    : "transparent",
                  transition: "all 150ms ease",
                  "&:hover": {
                    bgcolor: active
                      ? (isLight ? "rgba(37,99,235,0.1)" : "rgba(91,157,255,0.12)")
                      : (isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"),
                    color: active ? undefined : "text.primary",
                  },
                }}
              >
                {item.icon}
                {sidebarOpen && (
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: active ? 600 : 500, flex: 1 }}>
                    {item.label}
                  </Typography>
                )}
                {sidebarOpen && item.badge > 0 && (
                  <Box sx={{
                    fontSize: "0.6875rem", fontWeight: 600, px: 0.75, py: 0.125,
                    borderRadius: 1.5, minWidth: 20, textAlign: "center",
                    bgcolor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
                    color: "text.secondary",
                  }}>
                    {item.badge}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Sidebar toggle + theme */}
        <Box sx={{ p: sidebarOpen ? 1.5 : 1, borderTop: "1px solid", borderColor: "divider" }}>
          <Stack direction={sidebarOpen ? "row" : "column"} spacing={0.5} alignItems="center" justifyContent="space-between">
            <HeaderRight />
            <Tooltip title={sidebarOpen ? "Collapse" : "Expand"} placement="right" arrow>
              <IconButton
                size="small"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                sx={{ color: "text.secondary", width: 32, height: 32 }}
              >
                {sidebarOpen ? <ChevronLeftIcon sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      {/* ==================== MAIN AREA ==================== */}
      <Box sx={{ flex: 1, ml: `${sidebarW}px`, transition: "margin 200ms ease" }}>
        <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, sm: 3, md: 4 }, pt: { xs: 3, md: 4 } }}>

          {/* ===== DASHBOARD VIEW ===== */}
          {currentView === "dashboard" && (
            <Box className="animate-in">
              <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.025em", mb: 0.5, color: "text.primary" }}>
                Dashboard
              </Typography>
              <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mb: 4 }}>
                Your job search at a glance
              </Typography>

              {/* Stat cards row */}
              <Stack direction="row" spacing={2} sx={{ mb: 4, flexWrap: "wrap", gap: 2 }}>
                {[
                  { label: "Total Applied", value: stats.total, color: "#2563eb", darkColor: "#5b9dff", icon: <WorkIcon /> },
                  { label: "Interviews", value: stats.interviews, color: "#059669", darkColor: "#34d399", icon: <TrendingUpIcon /> },
                  { label: "Offers", value: stats.offers, color: "#d97706", darkColor: "#fbbf24", icon: <TrophyIcon /> },
                  { label: "Response Rate", value: `${stats.responseRate}%`, color: "#7c3aed", darkColor: "#a78bfa", icon: <AnalyticsIcon /> },
                ].map((card) => (
                  <Paper key={card.label} elevation={0} sx={{
                    flex: "1 1 200px", p: 2.5, borderRadius: 3,
                    border: "1px solid", borderColor: "divider",
                    transition: "all 200ms ease",
                    "&:hover": { borderColor: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)" },
                  }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <Box sx={{
                        width: 40, height: 40, borderRadius: 2.5,
                        bgcolor: (isLight ? card.color : card.darkColor) + "12",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: isLight ? card.color : card.darkColor,
                      }}>
                        {React.cloneElement(card.icon, { sx: { fontSize: 20 } })}
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1, color: "text.primary" }}>
                          {card.value}
                        </Typography>
                        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
                          {card.label}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))}
              </Stack>

              {/* Navigation tiles */}
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "text.secondary", mb: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Quick Access
              </Typography>
              <Stack spacing={1}>
                {[
                  {
                    id: "applications", icon: <ListIcon />, title: "Tracked Applications",
                    desc: `${jobs.length} application${jobs.length !== 1 ? "s" : ""} being tracked`,
                    color: "#2563eb", darkColor: "#5b9dff",
                  },
                  {
                    id: "analytics", icon: <AnalyticsIcon />, title: "Analytics",
                    desc: "Coming soon \u2014 visualize your search progress",
                    color: "#7c3aed", darkColor: "#a78bfa", disabled: true,
                  },
                  {
                    id: "email-sync", icon: <EmailIcon />, title: "Email Sync",
                    desc: gmailConnected || yahooConnected
                      ? `${suggestions.length} pending suggestion${suggestions.length !== 1 ? "s" : ""}`
                      : "Connect Gmail or Yahoo to detect updates",
                    color: "#059669", darkColor: "#34d399",
                  },
                  {
                    id: "trash", icon: <TrashIcon />, title: "Trash",
                    desc: `${trashJobs.length} deleted application${trashJobs.length !== 1 ? "s" : ""}`,
                    color: "#6b7280", darkColor: "#9ca3af",
                  },
                ].map((tile) => (
                  <Paper
                    key={tile.id}
                    elevation={0}
                    onClick={() => !tile.disabled && setCurrentView(tile.id)}
                    sx={{
                      p: 2.5, borderRadius: 3,
                      border: "1px solid", borderColor: "divider",
                      display: "flex", alignItems: "center", gap: 2.5,
                      cursor: tile.disabled ? "default" : "pointer",
                      opacity: tile.disabled ? 0.5 : 1,
                      transition: "all 200ms ease",
                      "&:hover": tile.disabled ? {} : {
                        borderColor: (isLight ? tile.color : tile.darkColor) + "40",
                        transform: "translateX(4px)",
                      },
                    }}
                  >
                    <Box sx={{
                      width: 44, height: 44, borderRadius: 2.5,
                      bgcolor: (isLight ? tile.color : tile.darkColor) + "12",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: isLight ? tile.color : tile.darkColor,
                    }}>
                      {React.cloneElement(tile.icon, { sx: { fontSize: 22 } })}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "text.primary" }}>
                        {tile.title}
                      </Typography>
                      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                        {tile.desc}
                      </Typography>
                    </Box>
                    {!tile.disabled && <ChevronRightIcon sx={{ fontSize: 20, color: "text.secondary" }} />}
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          {/* ===== APPLICATIONS VIEW ===== */}
          {currentView === "applications" && (
            <Box className="animate-in">
              {/* Page header */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                <Box>
                  <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.025em", color: "text.primary" }}>
                    Applications
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.25 }}>
                    {filteredJobs.length} of {jobs.length} shown
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setFormOpen(true)}
                  sx={{
                    background: isLight
                      ? "linear-gradient(135deg, #111113, #2a2a2e)"
                      : "linear-gradient(135deg, #e8e8ea, #d0d0d4)",
                    color: isLight ? "#fff" : "#111113",
                    fontWeight: 600, fontSize: "0.8125rem",
                    "&:hover": { opacity: 0.9 },
                  }}
                >
                  Add Application
                </Button>
              </Stack>

              {/* Add form (collapsible) */}
              {formOpen && (
                <Paper elevation={0} className="animate-scale" sx={{
                  p: 2.5, mb: 3, border: "1px solid",
                  borderColor: isLight ? "rgba(37,99,235,0.2)" : "rgba(91,157,255,0.15)",
                  borderRadius: 3,
                }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary" }}>
                      New Application
                    </Typography>
                    <IconButton size="small" onClick={() => setFormOpen(false)} sx={{ color: "text.secondary" }}>
                      <CollapseIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Stack>
                  <form onSubmit={addJob}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <TextField label="Job Title" name="title" value={formData.title} onChange={handleChange} required size="small" sx={{ flex: 2, "& .MuiOutlinedInput-root": { bgcolor: isLight ? "#fff" : "rgba(255,255,255,0.03)" } }} />
                      <TextField label="Company" name="company" value={formData.company} onChange={handleChange} required size="small" sx={{ flex: 2, "& .MuiOutlinedInput-root": { bgcolor: isLight ? "#fff" : "rgba(255,255,255,0.03)" } }} />
                      <TextField label="Source" name="source" value={formData.source} onChange={handleChange} required size="small" sx={{ flex: 1, "& .MuiOutlinedInput-root": { bgcolor: isLight ? "#fff" : "rgba(255,255,255,0.03)" } }} />
                      <TextField label="Notes" name="notes" value={formData.notes} onChange={handleChange} size="small" sx={{ flex: 1.5, "& .MuiOutlinedInput-root": { bgcolor: isLight ? "#fff" : "rgba(255,255,255,0.03)" } }} />
                      <Button type="submit" variant="contained" startIcon={<AddIcon />}
                        sx={{
                          minWidth: 80,
                          background: isLight ? "linear-gradient(135deg, #111113, #2a2a2e)" : "linear-gradient(135deg, #e8e8ea, #d0d0d4)",
                          color: isLight ? "#fff" : "#111113",
                          fontWeight: 600, fontSize: "0.8125rem",
                          "&:hover": { opacity: 0.9 },
                        }}>
                        Add
                      </Button>
                    </Stack>
                  </form>
                </Paper>
              )}

              {/* Search + Filter bar */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }} sx={{ mb: 2 }}>
                <TextField
                  placeholder="Search by title, company, or notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="small"
                  sx={{
                    flex: 1,
                    "& .MuiOutlinedInput-root": {
                      bgcolor: isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.03)",
                    },
                  }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: "text.secondary" }} /></InputAdornment>,
                  }}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <Select value={sortOption} onChange={(e) => setSortOption(e.target.value)}
                    sx={{ bgcolor: isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.03)" }}>
                    <MenuItem value="Newest">Newest</MenuItem>
                    <MenuItem value="Title">Title A-Z</MenuItem>
                    <MenuItem value="Company">Company A-Z</MenuItem>
                  </Select>
                </FormControl>
              </Stack>

              {/* Status filter pills */}
              <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 2.5 }}>
                {STATUS_LIST.map((s) => {
                  const active = statusFilter === s;
                  const sColor = s !== "All" ? (STATUS_COLORS[s]?.[mode] || "#6b7280") : null;
                  return (
                    <Chip key={s} label={s} size="small" clickable onClick={() => setStatusFilter(s)}
                      sx={{
                        height: 28, fontSize: "0.75rem", fontWeight: active ? 600 : 500,
                        border: "1px solid",
                        borderColor: active ? (sColor || (isLight ? "primary.main" : "#5b9dff")) : "transparent",
                        bgcolor: active
                          ? (sColor ? sColor + "14" : (isLight ? "rgba(37,99,235,0.08)" : "rgba(91,157,255,0.1)"))
                          : (isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)"),
                        color: active ? (sColor || (isLight ? "primary.main" : "#5b9dff")) : "text.secondary",
                        transition: "all 150ms ease",
                        "&:hover": {
                          bgcolor: active
                            ? (sColor ? sColor + "1A" : undefined)
                            : (isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)"),
                        },
                      }}
                    />
                  );
                })}
              </Stack>

              {/* Bulk action bar */}
              {selectedJobs.size > 0 && (
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{
                  mb: 2, p: 1.5, borderRadius: 2,
                  bgcolor: isLight ? "rgba(37,99,235,0.04)" : "rgba(91,157,255,0.06)",
                  border: "1px solid",
                  borderColor: isLight ? "rgba(37,99,235,0.1)" : "rgba(91,157,255,0.1)",
                }}>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "text.primary" }}>
                    {selectedJobs.size} selected
                  </Typography>
                  <Button size="small" variant="text" color="error" startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
                    onClick={() => confirmAction(`Move ${selectedJobs.size} selected job(s) to trash?`, deleteSelectedJobs)}
                    sx={{ fontSize: "0.75rem" }}>
                    Delete
                  </Button>
                </Stack>
              )}

              {/* Table */}
              {filteredJobs.length === 0 ? (
                jobs.length === 0 ? (
                  <EmptyState icon={<WorkIcon />} title="No applications yet" desc="Add your first application to get started." isLight={isLight} />
                ) : (
                  <EmptyState icon={<SearchIcon />} title="No results" desc="Try different search terms or filters." isLight={isLight} />
                )
              ) : (
                <TableContainer component={Paper} elevation={0} sx={{
                  border: "1px solid", borderColor: "divider", borderRadius: 3,
                  "& .MuiTableCell-root": {
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    py: 1.5,
                  },
                }}>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ bgcolor: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)" }}>
                        <TableCell padding="checkbox" sx={{ width: 48 }}>
                          <Checkbox
                            size="small"
                            checked={filteredJobs.length > 0 && selectedJobs.size === filteredJobs.length}
                            indeterminate={selectedJobs.size > 0 && selectedJobs.size < filteredJobs.length}
                            onChange={toggleSelectAllJobs}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>Company</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", width: 140 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", width: 120 }}>Applied</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", width: 80 }}>Source</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", width: 100 }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredJobs.map((job) => {
                        const sColor = STATUS_COLORS[job.status]?.[mode] || "#6b7280";
                        const isSelected = selectedJobs.has(job.id);
                        return (
                          <TableRow
                            key={job.id}
                            hover
                            sx={{
                              bgcolor: isSelected ? (isLight ? "rgba(37,99,235,0.04)" : "rgba(91,157,255,0.04)") : "transparent",
                              transition: "background 100ms ease",
                              "&:hover": {
                                bgcolor: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
                              },
                              "&:last-child .MuiTableCell-root": { borderBottom: "none" },
                            }}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox size="small" checked={isSelected} onChange={() => toggleJobSelect(job.id)} />
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "text.primary" }}>
                                {job.company}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: "0.8125rem", color: "text.primary" }}>
                                {job.title}
                              </Typography>
                              {job.notes && (
                                <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
                                  {job.notes}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <FormControl size="small" fullWidth>
                                <Select
                                  value={job.status}
                                  onChange={(e) => updateStatus(job.id, e.target.value)}
                                  sx={{
                                    fontSize: "0.75rem", fontWeight: 600,
                                    color: sColor,
                                    bgcolor: sColor + "12",
                                    "& .MuiSelect-select": { py: 0.5, px: 1.25 },
                                    "& fieldset": { borderColor: sColor + "30" },
                                    "&:hover fieldset": { borderColor: sColor + "60" },
                                    borderRadius: 2,
                                  }}
                                >
                                  {STATUS_LIST.filter(s => s !== "All").map((s) => (
                                    <MenuItem key={s} value={s} sx={{ fontSize: "0.8125rem" }}>
                                      <Stack direction="row" alignItems="center" spacing={1}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: STATUS_COLORS[s]?.[mode] || "#6b7280" }} />
                                        <span>{s}</span>
                                      </Stack>
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                                {relativeDate(job.appliedAt)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                                {job.source}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                                {job.url && (
                                  <Tooltip title="Open link" arrow>
                                    <IconButton size="small" component="a" href={job.url} target="_blank" rel="noreferrer"
                                      sx={{ color: "text.secondary", "&:hover": { color: isLight ? "#2563eb" : "#5b9dff" } }}>
                                      <LaunchIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title="Delete" arrow>
                                  <IconButton size="small" onClick={() => deleteJob(job.id)}
                                    sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}>
                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {/* ===== EMAIL SYNC VIEW ===== */}
          {currentView === "email-sync" && (
            <Box className="animate-in">
              <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.025em", mb: 0.5, color: "text.primary" }}>
                Email Sync
              </Typography>
              <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mb: 4 }}>
                Connect your email to automatically detect application updates
              </Typography>

              {/* Provider connection cards */}
              <Stack spacing={1.5} sx={{ mb: 3 }}>
                {/* Gmail */}
                <Paper elevation={0} sx={{
                  p: 2.5, border: "1px solid", borderColor: "divider", borderRadius: 3,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2,
                  flexDirection: { xs: "column", sm: "row" },
                }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{
                      width: 44, height: 44, borderRadius: 2.5,
                      bgcolor: gmailConnected ? (isLight ? "rgba(5,150,105,0.08)" : "rgba(52,211,153,0.1)") : (isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"),
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <EmailIcon sx={{ fontSize: 22, color: gmailConnected ? (isLight ? "#059669" : "#34d399") : "text.secondary" }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "text.primary" }}>Gmail</Typography>
                      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                        {gmailConnected ? `Connected: ${gmailEmail}` : "Not connected"}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    {gmailConnected ? (
                      <>
                        <Button size="small"
                          startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon sx={{ fontSize: 16 }} />}
                          onClick={handleSyncEmails} disabled={syncing}
                          sx={{ fontSize: "0.8125rem", fontWeight: 600, bgcolor: isLight ? "rgba(37,99,235,0.06)" : "rgba(91,157,255,0.08)", color: isLight ? "#2563eb" : "#5b9dff" }}>
                          {syncing ? "Syncing..." : "Sync Emails"}
                        </Button>
                        <Tooltip title="Disconnect Gmail" arrow>
                          <IconButton size="small" onClick={handleDisconnectGmail} sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}>
                            <DisconnectIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : (
                      <Button size="small" variant="contained" href={`${process.env.REACT_APP_API_URL || "http://localhost:8000"}/gmail/connect`}
                        sx={{ fontSize: "0.8125rem", fontWeight: 600, background: isLight ? "linear-gradient(135deg, #111113, #2a2a2e)" : "linear-gradient(135deg, #e8e8ea, #d0d0d4)", color: isLight ? "#fff" : "#111113" }}>
                        Connect Gmail
                      </Button>
                    )}
                  </Stack>
                </Paper>

                {/* Yahoo */}
                <Paper elevation={0} sx={{
                  p: 2.5, border: "1px solid", borderColor: "divider", borderRadius: 3,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2,
                  flexDirection: { xs: "column", sm: "row" },
                }}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box sx={{
                      width: 44, height: 44, borderRadius: 2.5,
                      bgcolor: yahooConnected ? (isLight ? "rgba(100,16,178,0.08)" : "rgba(167,139,250,0.1)") : (isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"),
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <EmailIcon sx={{ fontSize: 22, color: yahooConnected ? (isLight ? "#6410b2" : "#a78bfa") : "text.secondary" }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "text.primary" }}>Yahoo Mail</Typography>
                      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                        {yahooConnected ? `Connected: ${yahooEmail}` : "Not connected"}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    {yahooConnected ? (
                      <>
                        <Button size="small"
                          startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon sx={{ fontSize: 16 }} />}
                          onClick={handleSyncEmails} disabled={syncing}
                          sx={{ fontSize: "0.8125rem", fontWeight: 600, bgcolor: isLight ? "rgba(100,16,178,0.06)" : "rgba(167,139,250,0.08)", color: isLight ? "#6410b2" : "#a78bfa" }}>
                          {syncing ? "Syncing..." : "Sync Emails"}
                        </Button>
                        <Tooltip title="Disconnect Yahoo" arrow>
                          <IconButton size="small" onClick={handleDisconnectYahoo} sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}>
                            <DisconnectIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </>
                    ) : (
                      <Button size="small" variant="contained" href={`${process.env.REACT_APP_API_URL || "http://localhost:8000"}/yahoo/connect`}
                        sx={{ fontSize: "0.8125rem", fontWeight: 600, background: isLight ? "linear-gradient(135deg, #6410b2, #7c3aed)" : "linear-gradient(135deg, #a78bfa, #c4b5fd)", color: isLight ? "#fff" : "#111113" }}>
                        Connect Yahoo
                      </Button>
                    )}
                  </Stack>
                </Paper>
              </Stack>

              {/* Sync result */}
              {syncResult && (
                <Alert severity="info" onClose={() => setSyncResult(null)} sx={{ mb: 3, borderRadius: 2 }}>
                  Synced {syncResult.emailsFetched} emails — {syncResult.newSuggestions} new suggestion{syncResult.newSuggestions !== 1 ? "s" : ""} found
                  {syncResult.skipped > 0 && `, ${syncResult.skipped} already processed`}.
                </Alert>
              )}

              {/* Suggestions */}
              {suggestions.length > 0 ? (
                <Box>
                  <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "text.primary", mb: 2 }}>
                    Pending Suggestions ({suggestions.length})
                  </Typography>
                  <Stack spacing={1.5}>
                    {suggestions.map((s) => {
                      const typeColors = {
                        application_confirmation: { color: isLight ? "#2563eb" : "#5b9dff", label: "Confirmed" },
                        interview_invitation: { color: isLight ? "#059669" : "#34d399", label: "Interview" },
                        assessment: { color: isLight ? "#7c3aed" : "#a78bfa", label: "Assessment" },
                        rejection: { color: isLight ? "#dc2626" : "#f87171", label: "Rejection" },
                        offer: { color: isLight ? "#d97706" : "#fbbf24", label: "Offer" },
                      };
                      const tc = typeColors[s.detectedType] || { color: "#6b7280", label: s.detectedType };

                      return (
                        <Paper key={s.id} elevation={0} sx={{
                          p: 2.5, border: "1px solid", borderColor: "divider", borderRadius: 3,
                          display: "flex", flexDirection: { xs: "column", md: "row" },
                          alignItems: { xs: "stretch", md: "center" }, gap: 2,
                          transition: "all 200ms ease",
                          "&:hover": { borderColor: tc.color + "40" },
                        }}>
                          <Chip size="small" label={tc.label} sx={{
                            alignSelf: "flex-start",
                            height: 24, fontSize: "0.6875rem", fontWeight: 600,
                            bgcolor: tc.color + "18", color: tc.color,
                          }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary" }}>
                              {s.applicationTitle || "No matching application"}
                              {s.applicationCompany && <Typography component="span" sx={{ fontWeight: 400, color: "text.secondary" }}> at {s.applicationCompany}</Typography>}
                            </Typography>
                            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.emailSender} — {s.emailSubject}
                            </Typography>
                          </Box>
                          <Chip size="small" label={s.suggestedStatus} sx={{
                            alignSelf: { xs: "flex-start", md: "center" },
                            height: 22, fontSize: "0.6875rem", fontWeight: 600,
                            bgcolor: (STATUS_COLORS[s.suggestedStatus]?.[mode] || "#6b7280") + "18",
                            color: STATUS_COLORS[s.suggestedStatus]?.[mode] || "#6b7280",
                          }} />
                          <Stack direction="row" spacing={0.5} sx={{ alignSelf: { xs: "flex-start", md: "center" } }}>
                            {s.applicationId && (
                              <Button size="small" startIcon={<CheckIcon sx={{ fontSize: 14 }} />} onClick={() => handleApplySuggestion(s)}
                                sx={{ fontSize: "0.75rem", fontWeight: 600, bgcolor: isLight ? "rgba(5,150,105,0.08)" : "rgba(52,211,153,0.1)", color: isLight ? "#059669" : "#34d399" }}>
                                Apply
                              </Button>
                            )}
                            <Button size="small" onClick={() => handleIgnoreSuggestion(s)} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                              Ignore
                            </Button>
                            <Tooltip title="Reassign" arrow>
                              <IconButton size="small" onClick={() => setReassignDialog({ open: true, suggestionId: s.id })}
                                sx={{ color: "text.secondary" }}>
                                <SwapIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              ) : (gmailConnected || yahooConnected) ? (
                <EmptyState icon={<EmailIcon />} title="No pending suggestions" desc="Click Sync Emails to check for updates." isLight={isLight} />
              ) : null}
            </Box>
          )}

          {/* ===== TRASH VIEW ===== */}
          {currentView === "trash" && (
            <Box className="animate-in">
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                <Box>
                  <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.025em", color: "text.primary" }}>
                    Trash
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.25 }}>
                    {trashJobs.length} deleted application{trashJobs.length !== 1 ? "s" : ""}
                  </Typography>
                </Box>
                {trashJobs.length > 0 && (
                  <Stack direction="row" spacing={0.75}>
                    {selectedTrash.size > 0 && (
                      <>
                        <Button size="small" startIcon={<RestoreIcon sx={{ fontSize: 16 }} />} onClick={restoreSelectedTrash}
                          sx={{ fontSize: "0.75rem" }}>Restore ({selectedTrash.size})</Button>
                        <Button size="small" color="error" startIcon={<DeleteForeverIcon sx={{ fontSize: 16 }} />}
                          onClick={() => confirmAction(`Permanently delete ${selectedTrash.size} selected job(s)?`, deleteSelectedTrash)}
                          sx={{ fontSize: "0.75rem" }}>Delete ({selectedTrash.size})</Button>
                      </>
                    )}
                    <Button size="small" color="error" startIcon={<DeleteSweepIcon sx={{ fontSize: 16 }} />}
                      onClick={() => confirmAction(`Permanently delete ALL ${trashJobs.length} trashed job(s)?`, emptyAllTrash)}
                      sx={{ fontSize: "0.75rem" }}>Empty Trash</Button>
                  </Stack>
                )}
              </Stack>

              {trashJobs.length === 0 ? (
                <EmptyState icon={<TrashIcon />} title="Trash is empty" desc="Deleted applications will appear here." isLight={isLight} />
              ) : (
                <TableContainer component={Paper} elevation={0} sx={{
                  border: "1px solid", borderColor: "divider", borderRadius: 3,
                  "& .MuiTableCell-root": { borderBottom: "1px solid", borderColor: "divider", py: 1.5 },
                }}>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ bgcolor: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)" }}>
                        <TableCell padding="checkbox" sx={{ width: 48 }}>
                          <Checkbox size="small"
                            checked={selectedTrash.size === trashJobs.length}
                            indeterminate={selectedTrash.size > 0 && selectedTrash.size < trashJobs.length}
                            onChange={toggleSelectAll} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>Company</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", width: 140 }}>Deleted</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: "0.75rem", color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", width: 100 }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {trashJobs.map((job) => (
                        <TableRow key={job.id} hover sx={{
                          bgcolor: selectedTrash.has(job.id) ? (isLight ? "rgba(220,38,38,0.04)" : "rgba(248,113,113,0.04)") : "transparent",
                          "&:last-child .MuiTableCell-root": { borderBottom: "none" },
                        }}>
                          <TableCell padding="checkbox">
                            <Checkbox size="small" checked={selectedTrash.has(job.id)} onChange={() => toggleTrashSelect(job.id)} />
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "text.primary" }}>{job.company}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: "0.8125rem", color: "text.primary" }}>{job.title}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                              {job.deletedAt ? formatDate(job.deletedAt) : "\u2014"}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                              <Tooltip title="Restore" arrow>
                                <IconButton size="small" onClick={() => restoreJob(job.id)}
                                  sx={{ color: "text.secondary", "&:hover": { color: "success.main" } }}>
                                  <RestoreIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete forever" arrow>
                                <IconButton size="small"
                                  onClick={() => confirmAction(`Permanently delete "${job.title}"?`, () => permanentDeleteJob(job.id))}
                                  sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}>
                                  <DeleteForeverIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {/* ===== REASSIGN DIALOG ===== */}
          <Dialog open={reassignDialog.open} onClose={() => setReassignDialog({ open: false, suggestionId: null })}
            PaperProps={{ sx: { borderRadius: 3, maxWidth: 440, p: 1 } }}>
            <DialogTitle sx={{ fontSize: "1rem", fontWeight: 600, pb: 0.5 }}>Choose Application</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ fontSize: "0.8125rem", mb: 2 }}>
                Select which application this email update should apply to:
              </DialogContentText>
              <Autocomplete options={jobs} getOptionLabel={(opt) => `${opt.title} — ${opt.company}`}
                renderInput={(params) => <TextField {...params} label="Search applications" size="small" />}
                onChange={(_, value) => { if (value && reassignDialog.suggestionId) handleReassignSuggestion(reassignDialog.suggestionId, value.id); }}
                sx={{ mt: 1 }} />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setReassignDialog({ open: false, suggestionId: null })} sx={{ color: "text.secondary" }}>Cancel</Button>
            </DialogActions>
          </Dialog>

          {/* ===== CONFIRM DIALOG ===== */}
          <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, action: null, message: "" })}
            PaperProps={{ sx: { borderRadius: 3, maxWidth: 400, p: 1 } }}>
            <DialogTitle sx={{ fontSize: "1rem", fontWeight: 600, pb: 0.5 }}>Confirm Delete</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ fontSize: "0.8125rem" }}>{confirmDialog.message}</DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setConfirmDialog({ open: false, action: null, message: "" })} sx={{ color: "text.secondary" }}>Cancel</Button>
              <Button onClick={handleConfirm} variant="contained"
                sx={{ bgcolor: "#dc2626", "&:hover": { bgcolor: "#b91c1c" }, fontWeight: 600 }}>Delete</Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Box>
    </Box>
  );
}


/* ===== EMPTY STATE ===== */
function EmptyState({ icon, title, desc, isLight }) {
  return (
    <Box sx={{ py: 10, textAlign: "center" }}>
      <Box sx={{
        width: 56, height: 56, borderRadius: 3,
        bgcolor: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)",
        display: "flex", alignItems: "center", justifyContent: "center",
        mx: "auto", mb: 2.5,
        border: "1px solid",
        borderColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
      }}>
        {React.cloneElement(icon, { sx: { fontSize: 24, color: "text.secondary" } })}
      </Box>
      <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "text.primary", mb: 0.75 }}>{title}</Typography>
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", maxWidth: 280, mx: "auto" }}>{desc}</Typography>
    </Box>
  );
}


/* ===== HEADER RIGHT (theme toggle) ===== */
function HeaderRight() {
  const { mode, setMode } = React.useContext(ModeContext);
  const isLight = mode === "light";
  return (
    <Tooltip title={isLight ? "Dark mode" : "Light mode"} arrow>
      <IconButton
        size="small"
        onClick={() => setMode(isLight ? "dark" : "light")}
        sx={{
          color: "text.secondary",
          border: "1px solid", borderColor: "divider",
          borderRadius: 2, width: 32, height: 32,
          "&:hover": {
            bgcolor: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
          },
        }}
      >
        {isLight ? <DarkModeIcon sx={{ fontSize: 15 }} /> : <LightModeIcon sx={{ fontSize: 15 }} />}
      </IconButton>
    </Tooltip>
  );
}


/* ===== THEME + APP WRAPPER ===== */
const ModeContext = React.createContext({ mode: "light", setMode: () => {} });

function App() {
  const [mode, setMode] = useState(() => localStorage.getItem("mui-mode") || "light");

  useEffect(() => { localStorage.setItem("mui-mode", mode); }, [mode]);

  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      ...(mode === "light" ? {
        background: { default: "#f5f6f8", paper: "#ffffff" },
        primary: { main: "#2563eb" },
        text: { primary: "#0f1115", secondary: "#5c5f6a" },
        divider: "rgba(0, 0, 0, 0.06)",
      } : {
        background: { default: "#09090b", paper: "#111114" },
        primary: { main: "#5b9dff" },
        text: { primary: "#ededef", secondary: "#8b8d98" },
        divider: "rgba(255, 255, 255, 0.06)",
      }),
    },
    shape: { borderRadius: 12 },
    components: {
      MuiPaper: { styleOverrides: { root: { borderRadius: 12, backgroundImage: "none" } } },
      MuiCard: { styleOverrides: { root: { borderRadius: 12, backgroundImage: "none" } } },
      MuiButton: { styleOverrides: { root: {
        borderRadius: 8, textTransform: "none", fontWeight: 600, fontSize: "0.8125rem",
        boxShadow: "none", "&:hover": { boxShadow: "none" },
      } } },
      MuiTextField: { defaultProps: { variant: "outlined" } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10 } } },
      MuiSelect: { defaultProps: { variant: "outlined" } },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } } },
      MuiLinearProgress: { styleOverrides: { root: { borderRadius: 999, height: 4 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
      MuiTooltip: { styleOverrides: { tooltip: {
        fontSize: "0.6875rem", fontWeight: 500, borderRadius: 6,
        bgcolor: mode === "light" ? "#1a1a1f" : "#2a2a30",
      } } },
      MuiTableRow: { styleOverrides: { root: {
        "&.MuiTableRow-hover:hover": {
          backgroundColor: mode === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
        },
      } } },
    },
    typography: {
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      h4: { fontWeight: 700, letterSpacing: "-0.025em", fontSize: "1.75rem" },
      h6: { fontWeight: 600, letterSpacing: "-0.01em", fontSize: "1rem" },
      subtitle2: { fontWeight: 600, fontSize: "0.8125rem" },
      body2: { fontSize: "0.8125rem" },
      caption: { fontSize: "0.75rem", fontWeight: 500 },
    },
  }), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ModeContext.Provider value={{ mode, setMode }}>
        <AppInner />
      </ModeContext.Provider>
    </ThemeProvider>
  );
}

export default App;
