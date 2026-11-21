import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  FolderOpen,
  Layers,
  Search,
  Upload,
  Sparkles,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  Users,
  Wifi,
  Smartphone,
  QrCode,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit3,
  ShieldCheck,
  Lock,
  LogOut,
  KeyRound,
  UserPlus,
  Download
} from 'lucide-react';
import { BoardType, DashboardData, DeckSummary, InventoryItem, NetworkInfo, UserProfile } from './types';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { DecksView } from './components/DecksView';
import { CardSearchModal } from './components/CardSearchModal';
import { ImportExportModal } from './components/ImportExportModal';
import { formatUsd } from './components/PriceBadge';

const AVATAR_COLOR_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  amber: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40', dot: 'bg-amber-400' },
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', dot: 'bg-emerald-400' },
  sky: { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/40', dot: 'bg-sky-400' },
  violet: { bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/40', dot: 'bg-violet-400' },
  rose: { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40', dot: 'bg-rose-400' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/40', dot: 'bg-orange-400' }
};

export const App: React.FC = () => {
  const [activeUserId, setActiveUserId] = useState<number>(() => {
    const saved = Number(localStorage.getItem('aethervault_active_user_id'));
    return Number.isInteger(saved) && saved >= 1 ? saved : 1;
  });
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([
    { id: 1, name: 'Main Vault (Owner)', avatar_color: 'amber', totalCards: 0, uniqueEntries: 0, totalDecks: 0 }
  ]);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'decks'>(() => {
    const saved = localStorage.getItem('aethervault_active_tab');
    return (saved === 'inventory' || saved === 'decks' || saved === 'dashboard') ? saved : 'dashboard';
  });
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [deckFolders, setDeckFolders] = useState<string[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(() => {
    const saved = localStorage.getItem('aethervault_selected_deck_id');
    return saved ? Number(saved) : null;
  });
  const [inventoryLocationFilter, setInventoryLocationFilter] = useState<string>('ALL');

  useEffect(() => {
    localStorage.setItem('aethervault_active_user_id', String(activeUserId));
  }, [activeUserId]);

  useEffect(() => {
    localStorage.setItem('aethervault_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedDeckId !== null) {
      localStorage.setItem('aethervault_selected_deck_id', String(selectedDeckId));
    } else {
      localStorage.removeItem('aethervault_selected_deck_id');
    }
  }, [selectedDeckId]);

  // Modals
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalTarget, setSearchModalTarget] = useState<'inventory' | 'deck'>('inventory');
  const [searchModalDeckId, setSearchModalDeckId] = useState<number | null>(null);
  const [searchModalBoard, setSearchModalBoard] = useState<BoardType>('mainboard');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [standaloneModalOpen, setStandaloneModalOpen] = useState(false);
  const [standaloneStatusMsg, setStandaloneStatusMsg] = useState<string | null>(null);
  const [wifiModalOpen, setWifiModalOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [firewallStatusMsg, setFirewallStatusMsg] = useState<string | null>(null);

  // Profiles & Authentication state
  const [profilesModalOpen, setProfilesModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileColor, setNewProfileColor] = useState('emerald');
  const [newProfilePin, setNewProfilePin] = useState('');
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [serverOffline, setServerOffline] = useState(false);

  // Full Authentication & Account Isolation state
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPublicServer, setIsPublicServer] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authColor, setAuthColor] = useState('amber');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Password Change state
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');

  function saveUserSessionToken(userId: number, token?: string | null) {
    localStorage.setItem('aethervault_active_user_id', String(userId));
    if (token) {
      localStorage.setItem('aethervault_auth_token', token);
      try {
        const map = JSON.parse(localStorage.getItem('aethervault_user_tokens') || '{}');
        map[String(userId)] = token;
        localStorage.setItem('aethervault_user_tokens', JSON.stringify(map));
      } catch {
        // ignore JSON parse issues
      }
    }
  }

  function getSavedTokenForUser(userId: number): string | null {
    try {
      const map = JSON.parse(localStorage.getItem('aethervault_user_tokens') || '{}');
      return map[String(userId)] || null;
    } catch {
      return null;
    }
  }

  const fetchUsersAndNetwork = useCallback(async () => {
    try {
      const [usersRes, netRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/network-info')
      ]);
      if (usersRes.ok) {
        const uJson = await usersRes.json();
        if (Array.isArray(uJson.users) && uJson.users.length > 0) {
          setUserProfiles(uJson.users);
        }
      }
      if (netRes.ok) {
        setNetworkInfo(await netRes.json());
      }
    } catch {
      // ignore if older server process hasn't restarted yet
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const authRes = await fetch('/api/auth/me');
      if (authRes.ok) {
        const authJson = await authRes.json();
        if (typeof authJson.isPublic === 'boolean') {
          setIsPublicServer(authJson.isPublic);
        }
        if (!authJson.authenticated) {
          setIsAuthenticated(false);
          setAuthChecking(false);
          setServerOffline(false);
          return;
        }
        setIsAuthenticated(true);
        if (authJson.user) {
          setActiveUserId(authJson.user.id);
          saveUserSessionToken(authJson.user.id, authJson.token);
        }
      } else {
        setIsAuthenticated(true);
      }
      setAuthChecking(false);

      const [dashRes, invRes, decksRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/inventory'),
        fetch('/api/decks')
      ]);
      setServerOffline(false);
      if (dashRes.status === 401 || invRes.status === 401 || decksRes.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (dashRes.ok) setDashboardData(await dashRes.json());
      if (invRes.ok) {
        const invJson = await invRes.json();
        setInventoryItems(invJson.items || []);
      }
      if (decksRes.ok) {
        const decksJson = await decksRes.json();
        const loadedDecks: DeckSummary[] = decksJson.decks || [];
        setDecks(loadedDecks);
        setDeckFolders(decksJson.folders || []);
        setSelectedDeckId(prev => (prev && loadedDecks.some(d => d.id === prev) ? prev : null));
      }
      fetchUsersAndNetwork();
    } catch (e) {
      console.error('Failed to load data:', e);
      setAuthChecking(false);
      setServerOffline(true);
    }
  }, [fetchUsersAndNetwork]);

  const refreshDashboardAndDecks = useCallback(async () => {
    try {
      const [dashRes, decksRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/decks')
      ]);
      setServerOffline(false);
      if (dashRes.ok) setDashboardData(await dashRes.json());
      if (decksRes.ok) {
        const decksJson = await decksRes.json();
        setDecks(decksJson.decks || []);
        setDeckFolders(decksJson.folders || []);
      }
      fetchUsersAndNetwork();
    } catch {
      // ignore background refresh error
    }
  }, [fetchUsersAndNetwork]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!serverOffline) return;
    const timer = setInterval(() => {
      fetchAllData();
    }, 4000);
    return () => clearInterval(timer);
  }, [serverOffline, fetchAllData]);

  function restoreScrollPosition(savedY: number) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
    });
  }

  async function handleUpdateInventoryItem(id: number, patch: Record<string, any>) {
    const savedY = window.scrollY;
    if (patch.quantity !== undefined && patch.quantity <= 0 && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setInventoryItems(prev => {
      if (patch.quantity !== undefined && patch.quantity <= 0) {
        return prev.filter(i => i.id !== id);
      }
      return prev.map(i => (i.id === id ? { ...i, ...patch } : i));
    });
    restoreScrollPosition(savedY);

    const res = await fetch(`/api/inventory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (res.ok) {
      const json = await res.json();
      setInventoryItems(json.items || []);
      restoreScrollPosition(savedY);
      refreshDashboardAndDecks();
    }
  }

  async function handleDeleteInventoryItem(id: number) {
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setInventoryItems(prev => prev.filter(i => i.id !== id));
    restoreScrollPosition(savedY);

    const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const json = await res.json();
      setInventoryItems(json.items || []);
      restoreScrollPosition(savedY);
      refreshDashboardAndDecks();
    }
  }

  async function handleBulkDeleteInventory(payload: { ids?: number[]; location?: string; clearAll?: boolean }) {
    const savedY = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const res = await fetch('/api/inventory/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const json = await res.json();
      setInventoryItems(json.items || []);
      restoreScrollPosition(savedY);
      refreshDashboardAndDecks();
    }
  }

  const allBinderLocations = Array.from(
    new Set(inventoryItems.map(i => i.location).filter(Boolean))
  );

  const activeUserProfile =
    userProfiles.find(u => u.id === activeUserId) ||
    userProfiles[0] || {
      id: 1,
      name: 'Main Vault (Owner)',
      avatar_color: 'amber',
      totalCards: dashboardData?.summary.totalCards || 0,
      uniqueEntries: dashboardData?.summary.uniqueEntries || 0,
      totalDecks: decks.length
    };
  const activeColorStyle = AVATAR_COLOR_MAP[activeUserProfile.avatar_color] || AVATAR_COLOR_MAP.amber;

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    const trimmedUser = authUsername.trim();
    if (!trimmedUser) {
      setAuthError('Please enter your username.');
      return;
    }
    if (authMode === 'register' && authPassword.length < 4) {
      setAuthError('Please choose a password of at least 4 characters to protect your vault.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUser,
          password: authPassword,
          avatar_color: authColor
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setAuthError(json.error || 'Authentication failed.');
        setAuthSubmitting(false);
        return;
      }

      if (json.user && json.token) {
        saveUserSessionToken(json.user.id, json.token);
        setActiveUserId(json.user.id);
      }
      setAuthPassword('');
      setIsAuthenticated(true);
      setSelectedDeckId(null);
      setInventoryLocationFilter('ALL');
      setProfilesModalOpen(false);
      await fetchAllData();
    } catch {
      setAuthError('Unable to reach AetherVault server. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      const map = JSON.parse(localStorage.getItem('aethervault_user_tokens') || '{}');
      delete map[String(activeUserId)];
      localStorage.setItem('aethervault_user_tokens', JSON.stringify(map));
    } catch {
      // ignore
    }
    localStorage.removeItem('aethervault_auth_token');
    setProfilesModalOpen(false);
    setIsAuthenticated(false);
    setDashboardData(null);
    setInventoryItems([]);
    setDecks([]);
    setSelectedDeckId(null);
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);
    if (newPasswordInput.length < 4) {
      setProfileErrorMsg('New password must be at least 4 characters long.');
      return;
    }
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput
      })
    });
    const json = await res.json();
    if (!res.ok) {
      setProfileErrorMsg(json.error || 'Could not update password.');
      return;
    }
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setProfileSuccessMsg(json.message || 'Your vault password is now active!');
    await fetchUsersAndNetwork();
  }

  async function handleSwitchProfile(profile: UserProfile) {
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);
    if (profile.id === activeUserId) {
      setProfilesModalOpen(false);
      return;
    }

    const savedToken = getSavedTokenForUser(profile.id);
    if ((profile.has_password || profile.has_pin) && !savedToken) {
      setProfilesModalOpen(false);
      setAuthMode('login');
      setAuthUsername(profile.name);
      setAuthPassword('');
      setAuthError(null);
      setIsAuthenticated(false);
      return;
    }

    if (savedToken) {
      localStorage.setItem('aethervault_auth_token', savedToken);
    } else {
      localStorage.removeItem('aethervault_auth_token');
    }
    localStorage.setItem('aethervault_active_user_id', String(profile.id));
    setActiveUserId(profile.id);
    setSelectedDeckId(null);
    setInventoryLocationFilter('ALL');
    setProfilesModalOpen(false);
    await fetchAllData();
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      setProfileErrorMsg('Please enter an account / profile name.');
      return;
    }
    if (newProfilePin.trim().length > 0 && newProfilePin.trim().length < 4) {
      setProfileErrorMsg('Password must be at least 4 characters.');
      return;
    }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          avatar_color: newProfileColor,
          password: newProfilePin.trim()
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setProfileErrorMsg(json.error || 'Could not create profile.');
        return;
      }
      if (Array.isArray(json.users)) setUserProfiles(json.users);
      setNewProfileName('');
      setNewProfilePin('');
      if (json.user) {
        saveUserSessionToken(json.user.id, json.token);
        setActiveUserId(json.user.id);
        setSelectedDeckId(null);
        setInventoryLocationFilter('ALL');
        setProfilesModalOpen(false);
        await fetchAllData();
      }
    } catch {
      setProfileErrorMsg('Could not create account. Please check your connection.');
    }
  }

  async function handleRenameProfile(id: number) {
    setProfileErrorMsg(null);
    const trimmed = editingProfileName.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed })
    });
    const json = await res.json();
    if (!res.ok) {
      setProfileErrorMsg(json.error || 'Failed to rename profile.');
      return;
    }
    if (Array.isArray(json.users)) setUserProfiles(json.users);
    setEditingProfileId(null);
    setEditingProfileName('');
  }

  async function handleDeleteProfile(profile: UserProfile) {
    if (profile.id === 1) return;
    const confirmed = window.confirm(
      `Delete profile "${profile.name}" and its ${profile.totalCards} cards & ${profile.totalDecks} decks? (Your Main Vault will NOT be affected.)`
    );
    if (!confirmed) return;
    const res = await fetch(`/api/users/${profile.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (res.ok && Array.isArray(json.users)) {
      setUserProfiles(json.users);
      if (activeUserId === profile.id) {
        const owner = json.users.find((u: UserProfile) => u.id === 1) || json.users[0];
        if (owner) await handleSwitchProfile(owner);
      }
    }
  }

  // Show Personal Vault Sign-In / Registration Portal when unauthenticated
  if (!authChecking && !isAuthenticated && !serverOffline) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-100">AetherVault</h1>
            <p className="text-xs text-slate-400">
              MTG Collection Manager &amp; Commander Deck Builder
            </p>
          </div>

          {/* Mode Toggle Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
              }}
              className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                authMode === 'login'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError(null);
              }}
              className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                authMode === 'register'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create Account</span>
            </button>
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200 font-semibold">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                required
                placeholder="Enter your username"
                value={authUsername}
                onChange={e => setAuthUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                required
                placeholder={authMode === 'register' ? 'Create a password (4+ characters)' : 'Enter your password'}
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Vault Badge Color
                </label>
                <select
                  value={authColor}
                  onChange={e => setAuthColor(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="amber">Amber Gold</option>
                  <option value="emerald">Emerald Green</option>
                  <option value="sky">Sky Blue</option>
                  <option value="violet">Violet Purple</option>
                  <option value="rose">Crimson Rose</option>
                  <option value="orange">Solar Orange</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-sm shadow-md shadow-amber-500/10 transition cursor-pointer"
            >
              {authSubmitting
                ? 'Unlocking Vault...'
                : authMode === 'register'
                  ? 'Create My Personal Vault'
                  : 'Sign In to My Vault'}
            </button>
          </form>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-200">Private &amp; Isolated Library:</strong> Your card collection, binders, and Commander decks are strictly isolated to your account so no other user can view, alter, or delete them.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          {/* Brand */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group shrink-0"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/20">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="font-bold text-sm sm:text-base tracking-tight text-slate-100 group-hover:text-amber-300 transition flex items-center gap-2">
                <span>AetherVault</span>
              </div>
            </div>
          </div>

          {/* Primary Navigation Tabs (Desktop & Tablet) */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => {
                setInventoryLocationFilter('ALL');
                setActiveTab('inventory');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Collection</span>
              {dashboardData && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    activeTab === 'inventory' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {dashboardData.summary.totalCards}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('decks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'decks'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Decks</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'decks' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {decks.length}
              </span>
            </button>
          </nav>

          {/* Right Quick Actions & Live Ticker */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Active User Profile Switcher Button */}
            <button
              onClick={() => {
                setProfileErrorMsg(null);
                fetchUsersAndNetwork();
                setProfilesModalOpen(true);
              }}
              className={`px-2 sm:px-2.5 py-1.5 rounded-xl border ${activeColorStyle.bg} ${activeColorStyle.border} ${activeColorStyle.text} hover:brightness-110 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer`}
              title="Switch User Profile"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${activeColorStyle.dot}`} />
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span className="max-w-[90px] sm:max-w-[130px] truncate">{activeUserProfile.name}</span>
            </button>

            {/* Wi-Fi / Mobile Access & QR Code Button */}
            {!isPublicServer && (
              <button
                onClick={() => {
                  setFirewallStatusMsg(null);
                  fetchUsersAndNetwork();
                  setWifiModalOpen(true);
                }}
                className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                title="Wi-Fi / Mobile QR Code"
              >
                <QrCode className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden lg:inline">Wi-Fi / Mobile</span>
              </button>
            )}

            {dashboardData && (
              <div className="hidden 2xl:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
                <span className="text-sky-400" title="Total Collection TCGplayer Market Value">
                  TCG: <strong>{formatUsd(dashboardData.summary.totalTcg)}</strong>
                </span>
                <span className="text-slate-700">|</span>
                <span className="text-amber-400" title="Total Collection Card Kingdom Retail Value">
                  CK: <strong>{formatUsd(dashboardData.summary.totalCkRetail)}</strong>
                </span>
              </div>
            )}

            <button
              onClick={() => {
                setSearchModalTarget(activeTab === 'decks' && selectedDeckId ? 'deck' : 'inventory');
                setSearchModalDeckId(selectedDeckId);
                setSearchModalBoard('mainboard');
                setSearchModalOpen(true);
              }}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Cards</span>
            </button>

            <button
              onClick={() => setImportModalOpen(true)}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer"
              title="Bulk Import CSV / Decklist"
            >
              <Upload className="w-4 h-4 text-amber-400" />
            </button>

            {!isPublicServer && (
              <button
                onClick={() => {
                  setStandaloneStatusMsg(null);
                  setStandaloneModalOpen(true);
                }}
                className="hidden sm:flex p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs items-center gap-1.5 transition cursor-pointer"
                title="Standalone Desktop Launcher"
              >
                <Monitor className="w-4 h-4 text-emerald-400" />
              </button>
            )}
          </div>
        </div>
      </header>

      {serverOffline && (
        <div className="bg-rose-950/90 border-b border-rose-500/60 px-4 py-3 text-xs text-rose-100">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Local AetherVault server is currently stopped. Double-click{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 font-mono">
                  Start-AetherVault.bat
                </code>{' '}
                in <code className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-200 font-mono">c:\Users\bosta\MTG InventoryDeckbuilder</code>{' '}
                (or your Desktop shortcut) to start it anytime without tokens!
              </span>
            </div>
            <button
              onClick={fetchAllData}
              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 pb-24 md:py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            data={dashboardData}
            decks={decks}
            onNavigateInventory={loc => {
              setInventoryLocationFilter(loc || 'ALL');
              setActiveTab('inventory');
            }}
            onSelectDeck={deckId => {
              setSelectedDeckId(deckId);
              setActiveTab('decks');
            }}
            onDeleteBinder={async loc => {
              await handleBulkDeleteInventory({ location: loc });
            }}
            onDeleteDeck={async deckId => {
              await fetch(`/api/decks/${deckId}`, { method: 'DELETE' });
              if (selectedDeckId === deckId) setSelectedDeckId(null);
              await fetchAllData();
            }}
            onOpenSearchModal={() => {
              setSearchModalTarget('inventory');
              setSearchModalOpen(true);
            }}
            onOpenImportModal={() => setImportModalOpen(true)}
            onRefreshAll={fetchAllData}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            items={inventoryItems}
            decks={decks}
            activeDeckId={selectedDeckId}
            initialLocationFilter={inventoryLocationFilter}
            onUpdateItem={handleUpdateInventoryItem}
            onDeleteItem={handleDeleteInventoryItem}
            onBulkDelete={handleBulkDeleteInventory}
            onRefreshAll={fetchAllData}
            onItemsReplaced={newItems => {
              setInventoryItems(newItems);
              refreshDashboardAndDecks();
            }}
            onNavigateToDeck={deckId => {
              setSelectedDeckId(deckId);
              setActiveTab('decks');
            }}
            onOpenSearchModal={() => {
              setSearchModalTarget('inventory');
              setSearchModalOpen(true);
            }}
            onOpenImportModal={() => setImportModalOpen(true)}
          />
        )}

        {activeTab === 'decks' && (
          <DecksView
            decks={decks}
            folders={deckFolders}
            selectedDeckId={selectedDeckId}
            onSelectDeck={id => setSelectedDeckId(id)}
            onOpenSearchForDeck={(deckId, board = 'mainboard') => {
              setSearchModalTarget('deck');
              setSearchModalDeckId(deckId);
              setSearchModalBoard(board);
              setSearchModalOpen(true);
            }}
            onRefreshGlobal={fetchAllData}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 px-2 py-1.5 grid grid-cols-4 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`py-1.5 px-2 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition cursor-pointer ${
            activeTab === 'dashboard'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setInventoryLocationFilter('ALL');
            setActiveTab('inventory');
          }}
          className={`py-1.5 px-2 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition cursor-pointer ${
            activeTab === 'inventory'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-1">
            <FolderOpen className="w-4 h-4" />
            {dashboardData && (
              <span className="font-mono text-[10px]">
                ({dashboardData.summary.totalCards})
              </span>
            )}
          </div>
          <span>Collection</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('decks')}
          className={`py-1.5 px-2 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition cursor-pointer ${
            activeTab === 'decks'
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-1">
            <Layers className="w-4 h-4" />
            <span className="font-mono text-[10px]">({decks.length})</span>
          </div>
          <span>Decks</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSearchModalTarget(activeTab === 'decks' && selectedDeckId ? 'deck' : 'inventory');
            setSearchModalDeckId(selectedDeckId);
            setSearchModalBoard('mainboard');
            setSearchModalOpen(true);
          }}
          className="py-1.5 px-2 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 cursor-pointer"
        >
          <Search className="w-4 h-4" />
          <span>Add Cards</span>
        </button>
      </nav>

      {/* Global Scryfall Search & Add Modal */}
      <CardSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        defaultTarget={searchModalTarget}
        defaultDeckId={searchModalDeckId}
        defaultBoard={searchModalBoard}
        decks={decks}
        locations={allBinderLocations}
        onCardAdded={fetchAllData}
      />

      {/* Bulk Import Modal */}
      <ImportExportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        decks={decks}
        locations={allBinderLocations}
        onImportComplete={newDeckId => {
          fetchAllData();
          if (newDeckId) {
            setSelectedDeckId(newDeckId);
            setActiveTab('decks');
          }
        }}
      />

      {/* Standalone Desktop Launcher Modal */}
      {standaloneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-emerald-400" />
                  Run AetherVault Standalone (Zero AI Tokens Needed)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Your entire collection and deck database lives locally on your PC in SQLite. You can run AetherVault anytime without Antigravity or tokens.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStandaloneModalOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-bold text-amber-300">Option 1: One-Click Windows Desktop Shortcut (Recommended)</div>
                <p className="text-slate-400">
                  Click the button below to place an <strong className="text-slate-200">"AetherVault MTG Deckbuilder"</strong> icon directly on your Windows Desktop. Double-clicking it starts the local server and opens <code className="text-amber-300">http://localhost:3000</code> in your browser.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/standalone/create-shortcut', { method: 'POST' });
                        const json = await res.json();
                        setStandaloneStatusMsg(json.message || 'Desktop shortcut created!');
                      } catch {
                        setStandaloneStatusMsg('Double-click Create-Desktop-Shortcut.bat in your project folder.');
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    + Create Windows Desktop Shortcut Now
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/standalone/open-folder', { method: 'POST' });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer"
                  >
                    Open Project Folder in Explorer
                  </button>
                </div>

                {standaloneStatusMsg && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 font-semibold flex items-center gap-2 mt-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{standaloneStatusMsg}</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-sky-300">Option 2: Launch Directly From Your Folder Anytime</div>
                <p className="text-slate-400">
                  In File Explorer, open <code className="text-slate-200 font-mono">c:\Users\bosta\MTG InventoryDeckbuilder</code> and double-click:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-300 pt-1">
                  <li>
                    <code className="text-amber-300 font-mono">Start-AetherVault.bat</code> — Starts server in a window & opens your browser
                  </li>
                  <li>
                    <code className="text-amber-300 font-mono">Start-AetherVault-Background.vbs</code> — Runs server silently in the background & opens your browser
                  </li>
                  <li>
                    <code className="text-amber-300 font-mono">data\mtg_inventory.sqlite</code> — Your local SQLite database file (back this up anytime!)
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStandaloneModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-User Profiles / Accounts Modal */}
      {profilesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  Vault Account &amp; Security
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Your <strong className="text-slate-200">Card Collection, Binders, and Decks</strong> are isolated to your account and protected from unauthorized edits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfilesModalOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {profileErrorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200 font-semibold">
                {profileErrorMsg}
              </div>
            )}

            {profileSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-xs text-emerald-200 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{profileSuccessMsg}</span>
              </div>
            )}

            {/* Existing Profiles List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {isPublicServer ? 'Your Active Account' : 'Vault Accounts on This Server'}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out / Switch User</span>
                </button>
              </div>
              <div className="space-y-2">
                {userProfiles.map(profile => {
                  const isCurrent = profile.id === activeUserId;
                  const cStyle = AVATAR_COLOR_MAP[profile.avatar_color] || AVATAR_COLOR_MAP.amber;
                  const isLocked = Boolean(profile.has_password || profile.has_pin);
                  return (
                    <div
                      key={profile.id}
                      className={`p-3.5 rounded-xl border transition flex flex-wrap items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-slate-950 border-amber-500/60 shadow-md shadow-amber-500/5'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl border ${cStyle.bg} ${cStyle.border} ${cStyle.text} flex items-center justify-center font-black text-sm shrink-0`}
                        >
                          {profile.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          {editingProfileId === profile.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingProfileName}
                                onChange={e => setEditingProfileName(e.target.value)}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-amber-500 text-xs text-slate-100 focus:outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleRenameProfile(profile.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingProfileId(null)}
                                className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
                              <span className="truncate">{profile.name}</span>
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                                  Signed In
                                </span>
                              )}
                              {isLocked && (
                                <span
                                  className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold flex items-center gap-1"
                                  title="Password Protected"
                                >
                                  <Lock className="w-2.5 h-2.5" />
                                  Protected
                                </span>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5 font-mono">
                            <span>{profile.totalCards.toLocaleString()} cards</span>
                            <span>•</span>
                            <span>{profile.uniqueEntries.toLocaleString()} printings</span>
                            <span>•</span>
                            <span>{profile.totalDecks} decks</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isCurrent ? (
                          <button
                            type="button"
                            onClick={() => handleSwitchProfile(profile)}
                            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                          >
                            Switch Vault
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProfileId(profile.id);
                                setEditingProfileName(profile.name);
                              }}
                              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 cursor-pointer"
                              title="Rename Account"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {profile.id !== 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteProfile(profile)}
                                className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 cursor-pointer"
                                title="Delete Account"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Set / Update Password for Current Vault */}
            <form
              onSubmit={handleUpdatePassword}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
            >
              <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4" />
                {activeUserProfile.has_password || activeUserProfile.has_pin
                  ? `Change Password for "${activeUserProfile.name}"`
                  : `Set a Password to Lock "${activeUserProfile.name}"`}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(activeUserProfile.has_password || activeUserProfile.has_pin) && (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Current Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Current password"
                      value={currentPasswordInput}
                      onChange={e => setCurrentPasswordInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
                <div className={(activeUserProfile.has_password || activeUserProfile.has_pin) ? '' : 'sm:col-span-2'}>
                  <label className="block text-[11px] text-slate-400 mb-1">New Password (4+ characters)</label>
                  <input
                    type="password"
                    required
                    placeholder="Enter new vault password"
                    value={newPasswordInput}
                    onChange={e => setNewPasswordInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setProfileErrorMsg(null);
                    setProfileSuccessMsg(null);
                    const res = await fetch('/api/auth/revoke-other-sessions', { method: 'POST' });
                    const json = await res.json();
                    if (res.ok) {
                      setProfileSuccessMsg(json.message || 'Signed out of all other devices.');
                    } else {
                      setProfileErrorMsg(json.error || 'Could not revoke sessions.');
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  Sign Out Other Devices
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Save Vault Password
                </button>
              </div>
            </form>

            {/* Personal Vault Backup & Restore (.json) */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-sky-400" />
                Personal Vault Backup &amp; Restore
              </div>
              <p className="text-[11px] text-slate-400">
                Download a complete offline backup of your collection, binders, and decks as a JSON file, or restore a saved backup anytime.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={async () => {
                    setProfileErrorMsg(null);
                    setProfileSuccessMsg(null);
                    try {
                      const res = await fetch('/api/vault/backup');
                      if (!res.ok) {
                        setProfileErrorMsg('Could not generate backup.');
                        return;
                      }
                      const data = await res.json();
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      const safeName = (activeUserProfile.name || 'vault').toLowerCase().replace(/[^a-z0-9]+/g, '-');
                      const dateStr = new Date().toISOString().slice(0, 10);
                      a.href = url;
                      a.download = `aethervault-backup-${safeName}-${dateStr}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      setProfileSuccessMsg('Downloaded your personal vault backup file!');
                    } catch {
                      setProfileErrorMsg('Failed to download backup.');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download My Vault Backup (.json)
                </button>

                <label className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restore From Backup File</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setProfileErrorMsg(null);
                      setProfileSuccessMsg(null);
                      try {
                        const text = await file.text();
                        const parsed = JSON.parse(text);
                        const replaceExisting = window.confirm(
                          'Replace your current vault contents with this backup? (Click OK to replace, or Cancel to merge/add onto your current vault)'
                        );
                        const res = await fetch('/api/vault/restore', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ backup: parsed, replaceExisting })
                        });
                        const json = await res.json();
                        if (!res.ok) {
                          setProfileErrorMsg(json.error || 'Could not restore backup file.');
                          return;
                        }
                        setProfileSuccessMsg(json.message || 'Vault backup restored!');
                        await fetchAllData();
                      } catch {
                        setProfileErrorMsg('Invalid backup JSON file.');
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Create New Profile Form */}
            <form
              onSubmit={handleCreateProfile}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
            >
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" />
                Create Another User Account / Vault
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    placeholder="Username"
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    placeholder="Password (4+ chars)"
                    value={newProfilePin}
                    onChange={e => setNewProfilePin(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Badge Color</label>
                  <select
                    value={newProfileColor}
                    onChange={e => setNewProfileColor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="emerald">Emerald Green</option>
                    <option value="sky">Sky Blue</option>
                    <option value="violet">Violet Purple</option>
                    <option value="rose">Crimson Rose</option>
                    <option value="orange">Solar Orange</option>
                    <option value="amber">Amber Gold</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-400">
                  Each account has its own private collection and decks.
                </span>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create &amp; Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wi-Fi / Mobile Access & QR Code Modal */}
      {wifiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-sky-400" />
                  Wi-Fi / Mobile Access & Scannable QR Code
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Open AetherVault on your iPhone, Android, iPad, or another laptop connected to the same Wi-Fi network.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWifiModalOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {networkInfo ? (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center p-4 rounded-2xl bg-slate-950 border border-slate-800">
                {/* Scannable QR Code */}
                <div className="sm:col-span-2 flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-md">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=6&data=${encodeURIComponent(
                      networkInfo.primaryLanUrl
                    )}`}
                    alt="Scan to open AetherVault on Mobile"
                    className="w-40 h-40 object-contain"
                  />
                  <span className="text-[11px] font-bold text-slate-900 mt-1.5 flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5 text-sky-600" />
                    Scan with Phone Camera
                  </span>
                </div>

                {/* Live Wi-Fi Link & Controls */}
                <div className="sm:col-span-3 space-y-3 text-xs">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                      Your Live Wi-Fi / LAN Address
                    </div>
                    <div className="mt-1 p-2.5 rounded-xl bg-slate-900 border border-sky-500/40 font-mono text-sm text-amber-300 break-all select-all">
                      {networkInfo.primaryLanUrl}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(networkInfo.primaryLanUrl);
                        setCopiedUrl(networkInfo.primaryLanUrl);
                        setTimeout(() => setCopiedUrl(null), 2500);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedUrl === networkInfo.primaryLanUrl ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied Link!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy Wi-Fi Link
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setWifiModalOpen(false);
                        setProfilesModalOpen(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      Manage User Profiles
                    </button>
                  </div>

                  {networkInfo.lanUrls.length > 1 && (
                    <div className="pt-1">
                      <div className="text-[11px] text-slate-400 mb-1">Other Detected Network Adapters:</div>
                      <div className="space-y-1">
                        {networkInfo.lanUrls.map(url => (
                          <div key={url} className="font-mono text-[11px] text-slate-300 flex items-center justify-between bg-slate-900/80 px-2.5 py-1 rounded-lg">
                            <span>{url}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(url);
                                setCopiedUrl(url);
                                setTimeout(() => setCopiedUrl(null), 2000);
                              }}
                              className="text-sky-400 hover:underline text-[10px] cursor-pointer"
                            >
                              {copiedUrl === url ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/40 text-xs text-slate-300 space-y-2">
                <div className="font-bold text-amber-300">
                  Restart AetherVault once to activate Wi-Fi Network Detection
                </div>
                <p className="text-slate-400">
                  Double-click <code className="text-amber-300 font-mono">Restart-AetherVault.bat</code> (or <code className="text-amber-300 font-mono">Start-AetherVault.bat</code>) in your project folder so the background server binds to <code className="text-sky-300 font-mono">0.0.0.0:3000</code> and displays your QR code.
                </p>
              </div>
            )}

            {/* Windows Firewall Helper */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Phone Can&apos;t Connect? Unlock Port 3000 in Windows Firewall
              </div>
              <p className="text-slate-400">
                The first time you connect from a phone or tablet on Wi-Fi, Windows Firewall may block incoming connections to port 3000. Click below to open a Windows UAC prompt and allow Port 3000 on your Private Wi-Fi network:
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/network-info/allow-firewall', { method: 'POST' });
                      const json = await res.json();
                      setFirewallStatusMsg(
                        json.message ||
                          'Approve the Windows Administrator prompt to allow phones/tablets on port 3000.'
                      );
                    } catch {
                      setFirewallStatusMsg('Restart AetherVault first, then click this button.');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs cursor-pointer"
                >
                  Allow Port 3000 in Windows Firewall
                </button>
              </div>
              {firewallStatusMsg && (
                <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 font-semibold flex items-center gap-2 mt-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{firewallStatusMsg}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setWifiModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
