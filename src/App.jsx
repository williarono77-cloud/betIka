import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import AdminDashboard from "./components/AdminDashboard.jsx";

import TopBar from "./components/TopBar.jsx";
import HeaderRow from "./components/HeaderRow.jsx";
import Drawer from "./components/Drawer.jsx";
import GameHeader from "./components/GameHeader.jsx";
import GameCard from "./components/GameCard.jsx";
import BetPanel from "./components/BetPanel.jsx";
import FeedTabs from "./components/FeedTabs.jsx";
import AllBetsTable from "./components/AllBetsTable.jsx";
import PreviousRound from "./components/PreviousRound.jsx";
import TopBetsList from "./components/TopBetsList.jsx";
import AuthModal from "./components/AuthModal.jsx";
import DepositModal from "./components/DepositModal.jsx";
import WithdrawModal from "./components/WithdrawModal.jsx";
import Toast from "./components/Toast.jsx";
import LoadingOverlay from "./components/LoadingOverlay.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [feedTab, setFeedTab] = useState("all"); // 'all' | 'previous' | 'top'
  const [isAdmin, setIsAdmin] = useState(false);

  // Data state
  const [wallet, setWallet] = useState(null);
  const [currentRound, setCurrentRound] = useState(null);
  const [deposits, setDeposits] = useState([]);

  const userId = session?.user?.id ?? null;
console.log("SESSION USER ID:", userId);

  useEffect(() => {
  let cancelled = false;

  async function loadRole() {
    if (!userId || !isSupabaseConfigured) {
      setIsAdmin(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (cancelled) return;

    if (error) {
      console.error("Failed to load role:", error);
      setIsAdmin(false);
      return;
    }

    setIsAdmin(data?.role === "admin");
  }

  loadRole();

  return () => {
    cancelled = true;
  };
}, [userId]);


  
  const clearMessage = useCallback(() => setMessage(null), []);

  const refreshPrivateData = useCallback(async () => {
    if (!userId) {
      setWallet(null);
      setDeposits([]);
      return;
    }

    try {
      const [walletRes, depositsRes] = await Promise.all([
        supabase.from("wallets").select("available_cents, locked_cents").eq("user_id", userId).maybeSingle(),
        supabase.from("deposits").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      ]);

      setWallet(walletRes.data ?? null);
      setDeposits(depositsRes.data ?? []);
    } catch (e) {
      console.error("Failed to load private data:", e);
    }
  }, [userId]);

  const refreshPublicData = useCallback(async () => {
    try {
      const roundRes = await supabase.from("current_round").select("*").maybeSingle();
      if (roundRes.data) setCurrentRound(roundRes.data);
    } catch (e) {
      console.error("Failed to load round data:", e);
    }
  }, []);

  // Initialize session
  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseConfigured) {
      setSession(null);
      setUser(null);
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const s = data?.session ?? null;
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        setUser(null);
        setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => {
      cancelled = true;
      data?.subscription?.unsubscribe?.();
    };
  }, []);

  // Load private data when session changes
  useEffect(() => {
    if (!userId) {
      setWallet(null);
      setDeposits([]);
      return;
    }
    refreshPrivateData();
  }, [userId, refreshPrivateData]);

  // Realtime: wallets
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`wallet-updates:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload?.new) setWallet(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Public data: initial fetch + polling fallback
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    refreshPublicData();
    const interval = setInterval(refreshPublicData, 3000);
    return () => clearInterval(interval);
  }, [refreshPublicData]);

  // Realtime: game rounds
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel("round-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rounds" }, () => {
        refreshPublicData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshPublicData]);


  const balance = useMemo(() => (wallet?.available_cents ?? 0) / 100, [wallet?.available_cents]);

  const lastDepositPhone = useMemo(() => (deposits.length > 0 ? deposits[0]?.phone ?? null : null), [deposits]);

  const currentState = useMemo(() => currentRound?.status ?? currentRound?.state ?? null, [currentRound]);

  const handleAuthSuccess = useCallback(() => {
    refreshPrivateData();
    setMessage({ type: "success", text: "Welcome! You are now logged in." });
  }, [refreshPrivateData]);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setDrawerOpen(false);
      setMessage({ type: "info", text: "Logged out" });
    }
  }, []);

  const handleBetClick = useCallback(
    async (action, stake) => {
      if (action === "auth") {
        setAuthModalOpen(true);
        return;
      }

      if (action !== "bet" || !userId) return;

      const stakeNumber = Number(stake);

      if (!Number.isFinite(stakeNumber)) {
        setMessage({ type: "error", text: "Invalid stake amount." });
        return;
      }
      if (stakeNumber < 100) {
        setMessage({ type: "error", text: "Minimum bet amount is KSh 100." });
        return;
      }

      const available = (wallet?.available_cents ?? 0) / 100;
      if (stakeNumber > available) {
        setMessage({ type: "error", text: "Insufficient balance." });
        return;
      }

      try {
        const stakeCents = Math.round(stakeNumber * 100);

        const { error } = await supabase.rpc("place_bet", {
          p_stake_cents: stakeCents,
          p_round_id: currentRound?.id ?? null,
        });

        if (error) throw error;

        setMessage({ type: "success", text: `Bet placed: KSh ${stakeNumber.toFixed(2)}` });
        refreshPrivateData();
      } catch (e) {
        console.error("place_bet failed:", e);
        setMessage({ type: "error", text: e?.message ?? "Failed to place bet." });
      }
    },
    [userId, wallet?.available_cents, currentRound?.id, refreshPrivateData]
  );

  if (loading) {
    return <LoadingOverlay />;
  }

  if (isAdmin) {
  return (
    <div className="app">
      <Toast message={message} onDismiss={clearMessage} />
      <TopBar onBack={() => {}} fullscreen={false} onToggleFullscreen={() => {}} />
      <AdminDashboard
        user={user}
        setMessage={setMessage}
        onNotAdmin={() => setIsAdmin(false)}
      />
    </div>
  );
}

  
  return (
    <div className={`app ${fullscreen ? "app--fullscreen" : ""}`}>
      <Toast message={message} onDismiss={clearMessage} />
      <TopBar onBack={() => {}} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((v) => !v)} />

      <HeaderRow
        balance={userId ? balance : null}
        onMenuClick={() => setDrawerOpen(true)}
        onChatClick={() => setMessage({ type: "info", text: "Chat coming soon" })}
        onAuthClick={() => setAuthModalOpen(true)}
      />

      <GameHeader />

      <GameCard crashPoint={currentRound?.burst_point ?? null} startsAt={currentRound?.starts_at ?? null} state={currentState} />

      <BetPanel panelId="1" session={session} onBetClick={handleBetClick} />
      <BetPanel panelId="2" session={session} onBetClick={handleBetClick} />

      <FeedTabs activeTab={feedTab} onTabChange={setFeedTab} />
      {feedTab === "all" && <AllBetsTable />}
      {feedTab === "previous" && <PreviousRound />}
      {feedTab === "top" && <TopBetsList />}

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        session={session}
        user={user}
        onDepositClick={() => setDepositModalOpen(true)}
        onWithdrawClick={() => setWithdrawModalOpen(true)}
        onAuthClick={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} onSuccess={handleAuthSuccess} />

      <DepositModal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        onSuccess={refreshPrivateData}
      />

      <WithdrawModal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        userId={user?.id}
        balance={balance}
        lastDepositPhone={lastDepositPhone}
        onWithdrawSuccess={refreshPrivateData}
        setMessage={setMessage}
      />
    </div>
  );
}


