import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users, Shield, Trophy, MessageSquare, Send, SkipForward, CheckCircle2,
  Lock, ArrowRight, Copy, Check, Sparkles, SlidersHorizontal, Scale, Award
} from 'lucide-react';
import ALL_PLAYERS from './data/players.json';
import {
  FRANCHISES, MEGA_CAPPED_SLABS, MEGA_UNCAPPED_SLAB, BASE_PURSE_CR,
  MIN_SQUAD_SIZE, MAX_SQUAD_SIZE, MAX_OVERSEAS, OVERSEAS_MINI_CAP_CR,
  getOfficialIncrement, formatCr, calculateMegaRetentionCost, evaluateSquadScore
} from './data/rules';

const QUICK_BANTER = ['Steal! 🔥', 'Too expensive! 💸', 'RTM incoming 👀', 'All yours 🤝', 'GG 👏'];

export default function App() {
  // Navigation Screens: 'clubhouse' | 'create' | 'lobby' | 'auction' | 'verdict'
  const [screen, setScreen] = useState('clubhouse');

  // Room & Rules Configuration
  const [managerName, setManagerName] = useState('Vishnu Vardhan');
  const [auctionName, setAuctionName] = useState('The Weekend IPL Auction');
  const [roomCode, setRoomCode] = useState(() => Math.random().toString(36).substring(2, 8).toUpperCase());
  const [isPublicRoom, setIsPublicRoom] = useState(false);
  const [auctionFormat, setAuctionFormat] = useState('MEGA'); // 'MEGA' | 'MINI'
  const [tableSize, setTableSize] = useState(10);
  const [bidPace, setBidPace] = useState(15);
  const [aiDifficulty, setAiDifficulty] = useState('Competitive');

  // User Franchise & Multi-tab Multiplayer State
  const [myFranchise, setMyFranchise] = useState('RCB');
  const [humanManagers, setHumanManagers] = useState([]);
  const [retentionsByTeam, setRetentionsByTeam] = useState({});
  const [retentionModalOpen, setRetentionModalOpen] = useState(false);

  // Live Auction State
  const [teamsState, setTeamsState] = useState({});
  const [auctionPool, setAuctionPool] = useState([]);
  const [lotIndex, setLotIndex] = useState(0);
  const [currentBid, setCurrentBid] = useState(0);
  const [highestBidder, setHighestBidder] = useState(null);
  const [timer, setTimer] = useState(15);
  const [isPaused, setIsPaused] = useState(false);
  const [skippedByTeams, setSkippedByTeams] = useState([]); // Array of franchise codes who clicked Skip on current lot
  const [rtmStage, setRtmStage] = useState(null); // null | { step: 'PROMPT' | 'COUNTER' | 'MATCH', prevTeam, winnerTeam, bid }
  const [counterBidInput, setCounterBidInput] = useState('');
  const [unsoldPool, setUnsoldPool] = useState([]);
  const [inAcceleratedRound, setInAcceleratedRound] = useState(false);

  // Right Sidebar & Chat
  const [rightTab, setRightTab] = useState('chat'); // 'chat' | 'mysquad' | 'allteams'
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: 'SYSTEM', franchise: 'IPL', text: 'Welcome to Mocktion! Official BCCI IPL Rules active.', time: '00:00' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Post-Auction Comparison State
  const [compareLeft, setCompareLeft] = useState('RCB');
  const [compareRight, setCompareRight] = useState('CSK');
  const [verdictSubTab, setVerdictSubTab] = useState('leaderboard'); // 'leaderboard' | 'compare'

  const channelRef = useRef(null);
  const chatEndRef = useRef(null);

  // Cross-tab Real-Time Multiplayer Sync via BroadcastChannel (works seamlessly across tabs on Vercel)
  useEffect(() => {
    const channel = new BroadcastChannel(`mocktion_room_${roomCode}`);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === 'CHAT') {
        setChatMessages((prev) => [...prev, payload]);
      } else if (type === 'JOIN_LOBBY') {
        setHumanManagers((prev) => {
          if (prev.some((m) => m.franchise === payload.franchise)) return prev;
          return [...prev, payload];
        });
      } else if (type === 'SYNC_BID') {
        setCurrentBid(payload.bid);
        setHighestBidder(payload.franchise);
        setTimer(bidPace);
      } else if (type === 'SYNC_SKIP') {
        setSkippedByTeams((prev) => Array.from(new Set([...prev, payload.franchise])));
      } else if (type === 'SYNC_RETENTIONS') {
        setRetentionsByTeam((prev) => ({ ...prev, [payload.franchise]: payload.players }));
      } else if (type === 'SYNC_RTM') {
        setRtmStage(payload);
      }
    };
    return () => channel.close();
  }, [roomCode, bidPace]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const broadcast = (type, payload) => {
    channelRef.current?.postMessage({ type, payload });
  };

  const pushChat = (text, senderName = managerName, franchiseCode = myFranchise) => {
    if (!text.trim()) return;
    const msg = {
      id: Date.now() + Math.random(),
      sender: senderName,
      franchise: franchiseCode,
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages((prev) => [...prev, msg]);
    broadcast('CHAT', msg);
    if (senderName === managerName) setChatInput('');
  };

  // Active Franchises for this room (2 to 10)
  const activeFranchises = useMemo(() => {
    const list = FRANCHISES.slice(0, tableSize);
    if (!list.some((f) => f.code === myFranchise)) {
      list[list.length - 1] = FRANCHISES.find((f) => f.code === myFranchise);
    }
    return list;
  }, [tableSize, myFranchise]);

  // Enter Lobby
  const handleCreateRoom = () => {
    const me = { name: managerName, franchise: myFranchise, ready: true, isHuman: true };
    setHumanManagers([me]);
    setScreen('lobby');
    pushChat(`${managerName} (${myFranchise}) opened the ${auctionFormat} Auction lobby.`, 'SYSTEM', 'IPL');
  };

  // Toggle Retention Selection for User's Franchise
  const mySquadCandidates = useMemo(() => {
    return ALL_PLAYERS.filter((p) => p.prevTeam === myFranchise);
  }, [myFranchise]);

  const toggleRetention = (player) => {
    const current = retentionsByTeam[myFranchise] || [];
    const exists = current.some((p) => p.id === player.id);
    if (exists) {
      const updated = current.filter((p) => p.id !== player.id);
      setRetentionsByTeam({ ...retentionsByTeam, [myFranchise]: updated });
      broadcast('SYNC_RETENTIONS', { franchise: myFranchise, players: updated });
      return;
    }

    if (auctionFormat === 'MEGA') {
      if (current.length >= 6) return alert('Official Mega Auction limit: Maximum 6 combined retentions/RTMs.');
      const cappedCount = current.filter((p) => p.status !== 'Uncapped').length;
      const uncappedCount = current.filter((p) => p.status === 'Uncapped').length;
      if (player.status === 'Uncapped' && uncappedCount >= 2) {
        return alert('Official Mega Auction limit: Maximum 2 uncapped Indian retentions.');
      }
      if (player.status !== 'Uncapped' && cappedCount >= 5) {
        return alert('Official Mega Auction limit: Maximum 5 capped retentions.');
      }
    } else {
      const overseasCount = current.filter((p) => p.isOverseas).length;
      if (player.isOverseas && overseasCount >= MAX_OVERSEAS) {
        return alert('Maximum 8 overseas players allowed in squad.');
      }
    }

    const updated = [...current, player];
    setRetentionsByTeam({ ...retentionsByTeam, [myFranchise]: updated });
    broadcast('SYNC_RETENTIONS', { franchise: myFranchise, players: updated });
  };

  // Start Auction: Initialize all teams, AI retentions, and sorted pool
  const startAuction = () => {
    const initialTeams = {};
    const allRetainedIds = new Set();

    activeFranchises.forEach((f) => {
      const isHuman = humanManagers.some((m) => m.franchise === f.code) || f.code === myFranchise;
      let retained = retentionsByTeam[f.code] || [];

      // Auto-retain top core for AI teams
      if (!isHuman && retained.length === 0) {
        const teamRoster = ALL_PLAYERS.filter((p) => p.prevTeam === f.code).sort((a, b) => b.quality - a.quality);
        if (auctionFormat === 'MEGA') {
          retained = teamRoster.slice(0, 3);
        } else {
          retained = teamRoster.slice(0, 12);
        }
      }

      retained.forEach((p) => allRetainedIds.add(p.id));

      if (auctionFormat === 'MEGA') {
        const { totalCost, cappedCount, uncappedCount, rtmsLeft } = calculateMegaRetentionCost(retained);
        const rosterWithPrices = retained.map((p, idx) => ({
          ...p,
          boughtPriceCr: p.status === 'Uncapped' ? MEGA_UNCAPPED_SLAB : (MEGA_CAPPED_SLABS[idx] || 14),
          acquiredVia: 'Retained'
        }));
        initialTeams[f.code] = {
          code: f.code,
          name: f.name,
          isHuman,
          manager: isHuman ? (humanManagers.find((m) => m.franchise === f.code)?.name || managerName) : `${f.code} AI Bot`,
          purseLeft: Number((BASE_PURSE_CR - totalCost).toFixed(2)),
          roster: rosterWithPrices,
          rtmsLeft,
          retainedCapped: cappedCount,
          retainedUncapped: uncappedCount,
        };
      } else {
        const totalCost = retained.reduce((acc, p) => acc + (p.contractCr || p.basePriceCr), 0);
        const rosterWithPrices = retained.map((p) => ({
          ...p,
          boughtPriceCr: p.contractCr || p.basePriceCr,
          acquiredVia: 'Retained'
        }));
        initialTeams[f.code] = {
          code: f.code,
          name: f.name,
          isHuman,
          manager: isHuman ? (humanManagers.find((m) => m.franchise === f.code)?.name || managerName) : `${f.code} AI Bot`,
          purseLeft: Number(Math.max(25, BASE_PURSE_CR - totalCost).toFixed(2)),
          roster: rosterWithPrices,
          rtmsLeft: 0,
          retainedCapped: 0,
          retainedUncapped: 0,
        };
      }
    });

    // Build remaining auction pool sorted by Tier
    const pool = ALL_PLAYERS
      .filter((p) => !allRetainedIds.has(p.id))
      .sort((a, b) => a.tier - b.tier || b.basePriceCr - a.basePriceCr);

    setTeamsState(initialTeams);
    setAuctionPool(pool);
    setLotIndex(0);
    setCurrentBid(pool[0]?.basePriceCr || 2);
    setHighestBidder(null);
    setSkippedByTeams([]);
    setTimer(bidPace);
    setScreen('auction');
    pushChat(`Auction started! Format: Official BCCI ${auctionFormat} Auction.`, 'SYSTEM', 'IPL');
  };

  const currentPlayer = auctionPool[lotIndex];

  // Check if a team can legally bid on currentPlayer
  const canTeamBid = (team, nextBidAmount) => {
    if (!team || !currentPlayer) return false;
    if (team.roster.length >= MAX_SQUAD_SIZE) return false;
    const overseasCount = team.roster.filter((p) => p.isOverseas).length;
    if (currentPlayer.isOverseas && overseasCount >= MAX_OVERSEAS) return false;

    // Reserve ₹0.30 Cr per slot needed to reach 18 minimum players
    const slotsStillNeededFor18 = Math.max(0, MIN_SQUAD_SIZE - (team.roster.length + 1));
    const reservedPurse = slotsStillNeededFor18 * 0.30;
    return team.purseLeft - nextBidAmount >= reservedPurse;
  };

  const nextMinBid = useMemo(() => {
    if (!currentPlayer) return 0;
    if (!highestBidder) return currentPlayer.basePriceCr;
    return Number((currentBid + getOfficialIncrement(currentBid)).toFixed(2));
  }, [currentPlayer, highestBidder, currentBid]);

  // Place Bid Handler
  const placeBid = (franchiseCode, customAmount = null) => {
    if (isPaused || rtmStage || !currentPlayer) return;
    if (skippedByTeams.includes(franchiseCode)) return; // Locked out after skipping!

    const bidAmount = customAmount ? Number(customAmount.toFixed(2)) : nextMinBid;
    const team = teamsState[franchiseCode];
    if (!canTeamBid(team, bidAmount)) return;

    setCurrentBid(bidAmount);
    setHighestBidder(franchiseCode);
    setTimer(bidPace);
    broadcast('SYNC_BID', { bid: bidAmount, franchise: franchiseCode });
  };

  // Finalize Current Lot (Sold or Unsold or Trigger RTM)
  const finalizeLot = (winnerCode, finalAmount) => {
    if (!currentPlayer) return;

    if (!winnerCode) {
      setUnsoldPool((prev) => [...prev, currentPlayer]);
      pushChat(`${currentPlayer.name} goes UNSOLD at ${formatCr(currentPlayer.basePriceCr)}.`, 'SYSTEM', 'IPL');
      advanceToNextLot();
      return;
    }

    // Check Mega Auction RTM Eligibility for former team
    const prevCode = currentPlayer.prevTeam;
    const prevTeam = prevCode ? teamsState[prevCode] : null;
    const canUseRtm =
      auctionFormat === 'MEGA' &&
      prevTeam &&
      prevCode !== winnerCode &&
      prevTeam.rtmsLeft > 0 &&
      canTeamBid(prevTeam, finalAmount) &&
      (currentPlayer.status === 'Uncapped' ? prevTeam.retainedUncapped < 2 : prevTeam.retainedCapped < 5);

    if (canUseRtm) {
      if (prevTeam.isHuman || (prevTeam.purseLeft >= finalAmount + 4 && currentPlayer.quality >= 82)) {
        setRtmStage({ step: 'PROMPT', prevTeam: prevCode, winnerTeam: winnerCode, bid: finalAmount });
        return;
      }
    }

    completeSale(winnerCode, finalAmount, false);
  };

  const completeSale = (finalTeamCode, finalPrice, usedRtm) => {
    setTeamsState((prev) => {
      const team = prev[finalTeamCode];
      // Mini Auction ₹18 Cr Overseas Payout Cap: full bid deducts from purse, player receives max ₹18 Cr
      const playerPayout =
        auctionFormat === 'MINI' && currentPlayer.isOverseas
          ? Math.min(OVERSEAS_MINI_CAP_CR, finalPrice)
          : finalPrice;

      const updatedRoster = [
        ...team.roster,
        {
          ...currentPlayer,
          boughtPriceCr: finalPrice,
          playerPayoutCr: playerPayout,
          acquiredVia: usedRtm ? 'RTM' : 'Auction'
        }
      ];
      return {
        ...prev,
        [finalTeamCode]: {
          ...team,
          purseLeft: Number((team.purseLeft - finalPrice).toFixed(2)),
          roster: updatedRoster,
          rtmsLeft: usedRtm ? team.rtmsLeft - 1 : team.rtmsLeft,
          retainedCapped: usedRtm && currentPlayer.status !== 'Uncapped' ? team.retainedCapped + 1 : team.retainedCapped,
          retainedUncapped: usedRtm && currentPlayer.status === 'Uncapped' ? team.retainedUncapped + 1 : team.retainedUncapped,
        }
      };
    });

    pushChat(
      `SOLD! ${currentPlayer.name} → ${finalTeamCode} for ${formatCr(finalPrice)}${usedRtm ? ' (via RTM)' : ''}!`,
      'SYSTEM',
      'IPL'
    );
    setRtmStage(null);
    advanceToNextLot();
  };

  const advanceToNextLot = () => {
    setSkippedByTeams([]);
    setHighestBidder(null);
    if (lotIndex + 1 < auctionPool.length) {
      const nextIdx = lotIndex + 1;
      setLotIndex(nextIdx);
      setCurrentBid(auctionPool[nextIdx].basePriceCr);
      setTimer(bidPace);
    } else if (!inAcceleratedRound && unsoldPool.length > 0) {
      setInAcceleratedRound(true);
      setAuctionPool(unsoldPool);
      setUnsoldPool([]);
      setLotIndex(0);
      setCurrentBid(unsoldPool[0].basePriceCr);
      setTimer(bidPace);
      pushChat('Accelerated Round started for Unsold Players!', 'SYSTEM', 'IPL');
    } else {
      setScreen('verdict');
    }
  };

  // Human Skip Handler with Lockout & Instant Resolution Rule
  const handleSkipPlayer = (franchiseCode) => {
    if (!currentPlayer || rtmStage) return;
    if (skippedByTeams.includes(franchiseCode)) return;

    const updatedSkips = [...skippedByTeams, franchiseCode];
    setSkippedByTeams(updatedSkips);
    broadcast('SYNC_SKIP', { franchise: franchiseCode });

    const eligibleHumans = activeFranchises
      .map((f) => teamsState[f.code])
      .filter((t) => t && t.isHuman && canTeamBid(t, nextMinBid));

    // Check if ALL eligible humans except the current highest bidder have skipped
    const nonLeadingHumans = eligibleHumans.filter((t) => t.code !== highestBidder);
    const allOtherHumansSkipped = nonLeadingHumans.every((t) => updatedSkips.includes(t.code));

    if (highestBidder && allOtherHumansSkipped) {
      // Bots immediately stop bidding and player is instantly SOLD to highestBidder
      finalizeLot(highestBidder, currentBid);
    } else if (!highestBidder && eligibleHumans.every((t) => updatedSkips.includes(t.code))) {
      // Everyone skipped at base price -> immediately UNSOLD
      finalizeLot(null, 0);
    }
  };

  // Automated AI Decision Handler for RTM Steps (when prevTeam or winnerTeam is an AI bot)
  useEffect(() => {
    if (screen !== 'auction' || isPaused || !rtmStage || !currentPlayer) return;

    const actingTeamCode =
      rtmStage.step === 'COUNTER' ? rtmStage.winnerTeam : rtmStage.prevTeam;
    const actingTeam = teamsState[actingTeamCode];

    if (!actingTeam || actingTeam.isHuman) return;

    const aiRtmTimer = setTimeout(() => {
      if (rtmStage.step === 'PROMPT') {
        const maxVal = (currentPlayer.quality - 60) * 0.45 + currentPlayer.basePriceCr;
        if (canTeamBid(actingTeam, rtmStage.bid) && rtmStage.bid <= maxVal + 1.5) {
          pushChat(`${actingTeamCode} (AI) exercised their RTM card on ${currentPlayer.name}!`, 'SYSTEM', 'IPL');
          setRtmStage({ ...rtmStage, step: 'COUNTER' });
        } else {
          pushChat(`${actingTeamCode} (AI) passed on RTM for ${currentPlayer.name}.`, 'SYSTEM', 'IPL');
          completeSale(rtmStage.winnerTeam, rtmStage.bid, false);
        }
      } else if (rtmStage.step === 'COUNTER') {
        const maxVal = (currentPlayer.quality - 60) * 0.48 + currentPlayer.basePriceCr;
        const bump = rtmStage.bid < 5 ? 0.5 : 1.0;
        const raised = Number((rtmStage.bid + bump).toFixed(2));
        if (canTeamBid(actingTeam, raised) && raised <= maxVal + 2.0) {
          pushChat(`${actingTeamCode} (AI) raised final counter-bid to ${formatCr(raised)}!`, 'SYSTEM', 'IPL');
          setRtmStage({ ...rtmStage, step: 'MATCH', bid: raised });
        } else {
          pushChat(`${actingTeamCode} (AI) kept their bid at ${formatCr(rtmStage.bid)}.`, 'SYSTEM', 'IPL');
          setRtmStage({ ...rtmStage, step: 'MATCH', bid: rtmStage.bid });
        }
      } else if (rtmStage.step === 'MATCH') {
        const maxVal = (currentPlayer.quality - 60) * 0.48 + currentPlayer.basePriceCr;
        if (canTeamBid(actingTeam, rtmStage.bid) && rtmStage.bid <= maxVal + 2.5) {
          completeSale(rtmStage.prevTeam, rtmStage.bid, true);
        } else {
          pushChat(`${actingTeamCode} (AI) declined to match ${formatCr(rtmStage.bid)}.`, 'SYSTEM', 'IPL');
          completeSale(rtmStage.winnerTeam, rtmStage.bid, false);
        }
      }
    }, 1500);

    return () => clearTimeout(aiRtmTimer);
  }, [screen, isPaused, rtmStage, currentPlayer, teamsState]);

  // Countdown Timer & AI Bidding Simulation
  useEffect(() => {
    if (screen !== 'auction' || isPaused || rtmStage || !currentPlayer) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          finalizeLot(highestBidder, currentBid);
          return bidPace;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [screen, isPaused, rtmStage, currentPlayer, highestBidder, currentBid, bidPace]);

  // AI Manager Bidding Loop
  useEffect(() => {
    if (screen !== 'auction' || isPaused || rtmStage || !currentPlayer) return;

    const aiTimeout = setTimeout(() => {
      const eligibleHumans = activeFranchises
        .map((f) => teamsState[f.code])
        .filter((t) => t && t.isHuman && canTeamBid(t, nextMinBid));
      const nonLeadingHumans = eligibleHumans.filter((t) => t.code !== highestBidder);
      // If all other humans skipped while a human leads, bots stay silent
      if (highestBidder && nonLeadingHumans.length > 0 && nonLeadingHumans.every((t) => skippedByTeams.includes(t.code))) {
        return;
      }

      const aiCandidates = activeFranchises
        .map((f) => teamsState[f.code])
        .filter((t) => t && !t.isHuman && t.code !== highestBidder && canTeamBid(t, nextMinBid));

      if (aiCandidates.length === 0) return;

      const maxValuation =
        (currentPlayer.quality - 60) * (aiDifficulty === 'Competitive' ? 0.45 : 0.32) +
        currentPlayer.basePriceCr;

      if (nextMinBid <= maxValuation && Math.random() > 0.35) {
        const chosenAi = aiCandidates[Math.floor(Math.random() * aiCandidates.length)];
        placeBid(chosenAi.code, nextMinBid);
      }
    }, 1400);

    return () => clearTimeout(aiTimeout);
  }, [screen, isPaused, rtmStage, currentPlayer, highestBidder, currentBid, skippedByTeams]);

  // Auto-fill AI squads to 18 minimum if host jumps straight to Verdict
  const finishAndGoToVerdict = () => {
    setTeamsState((prev) => {
      const filled = { ...prev };
      let poolCursor = lotIndex + 1;
      Object.keys(filled).forEach((code) => {
        const t = { ...filled[code], roster: [...filled[code].roster] };
        while (t.roster.length < MIN_SQUAD_SIZE && poolCursor < auctionPool.length) {
          const cand = auctionPool[poolCursor++];
          const ovCount = t.roster.filter((p) => p.isOverseas).length;
          if (cand.isOverseas && ovCount >= MAX_OVERSEAS) continue;
          if (t.purseLeft >= cand.basePriceCr) {
            t.roster.push({ ...cand, boughtPriceCr: cand.basePriceCr, acquiredVia: 'Accelerated' });
            t.purseLeft = Number((t.purseLeft - cand.basePriceCr).toFixed(2));
          }
        }
        filled[code] = t;
      });
      return filled;
    });
    setScreen('verdict');
  };

  // Leaderboard Rankings
  const leaderboard = useMemo(() => {
    return Object.values(teamsState)
      .map((team) => ({
        team,
        score: evaluateSquadScore(team, auctionFormat)
      }))
      .sort((a, b) => b.score.total - a.score.total);
  }, [teamsState, auctionFormat]);

  const myTeamObj = teamsState[myFranchise];
  const isMyBidLocked = skippedByTeams.includes(myFranchise);

  // Reusable Live Chat Component
  const renderChatBox = () => (
    <div className="flex flex-col h-full bg-[#121517] border border-zinc-800/90 rounded-xl overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-[#15191C]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#00E5FF]" />
          <span className="text-xs font-semibold tracking-wide uppercase text-zinc-200">Room Chat</span>
        </div>
        <span className="text-[11px] text-zinc-400">Room {roomCode}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[220px] max-h-[340px]">
        {chatMessages.map((m) => (
          <div key={m.id} className={`text-xs ${m.sender === 'SYSTEM' ? 'bg-zinc-900/90 border border-zinc-800/80 rounded-lg px-2.5 py-1.5 text-zinc-300' : ''}`}>
            {m.sender !== 'SYSTEM' ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30">
                    {m.franchise}
                  </span>
                  <span className="font-semibold text-zinc-300">{m.sender}</span>
                  <span className="text-[10px] text-zinc-500 ml-auto">{m.time}</span>
                </div>
                <p className="text-zinc-200 pl-1">{m.text}</p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[#00E5FF] font-bold">●</span>
                <span>{m.text}</span>
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Quick Banter Chips */}
      <div className="px-2.5 py-1.5 border-t border-zinc-800/80 flex gap-1.5 overflow-x-auto bg-[#0F1214]">
        {QUICK_BANTER.map((chip) => (
          <button
            key={chip}
            onClick={() => pushChat(chip)}
            className="shrink-0 text-[11px] px-2 py-1 rounded-md bg-zinc-800/90 hover:bg-[#00E5FF] hover:text-black text-zinc-300 transition"
          >
            {chip}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          pushChat(chatInput);
        }}
        className="p-2 border-t border-zinc-800 flex gap-1.5 bg-[#121517]"
      >
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Message rival managers..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-[#00E5FF]"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-[#00E5FF] text-black font-semibold text-xs hover:brightness-110 transition flex items-center gap-1"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );

  // =========================================================================
  // SCREEN 1: CLUBHOUSE
  // =========================================================================
  if (screen === 'clubhouse') {
    const selectedFranchiseObj = FRANCHISES.find((f) => f.code === myFranchise);
    return (
      <div className="min-h-screen bg-[#0B0D0E] text-zinc-100 p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-[#00E5FF]">
                • OFFICIAL BCCI TATA IPL AUCTION SIMULATOR
              </div>
              <h1 className="text-3xl font-bold tracking-tight mt-1">Auction lobby.</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400 bg-[#121517] border border-zinc-800 px-3.5 py-2 rounded-full">
              <span>658 Official Players Loaded</span>
              <span className="text-zinc-600">|</span>
              <span className="text-[#00E5FF] font-medium">2026 Squads Ready</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Franchise Spotlight */}
            <div className="lg:col-span-2 bg-[#121517] border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  01 YOUR FRANCHISE
                </span>
                <span className="text-xs text-[#00E5FF] font-medium">Official IPL Ruleset</span>
              </div>

              <div className="my-10 text-center space-y-3">
                <div
                  className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg border border-white/10"
                  style={{ backgroundColor: selectedFranchiseObj?.color, color: selectedFranchiseObj?.text }}
                >
                  {myFranchise}
                </div>
                <div className="text-xs uppercase tracking-widest text-zinc-400">
                  {selectedFranchiseObj?.city} • FRANCHISE SELECTED
                </div>
                <h2 className="text-3xl font-bold">{selectedFranchiseObj?.name}</h2>
                <p className="text-xs text-zinc-400">Your colours. Your squad. Your call.</p>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-800/80 text-center sm:text-left">
                <div>
                  <div className="text-[11px] uppercase text-zinc-500">YOUR PURSE</div>
                  <div className="text-xl font-bold text-white">₹120 Cr</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-zinc-500">OFFICIAL SQUAD</div>
                  <div className="text-xl font-bold text-white">18–25 players</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-zinc-500">OVERSEAS CAP</div>
                  <div className="text-xl font-bold text-[#00E5FF]">Max 8 (4 in XI)</div>
                </div>
              </div>
            </div>

            {/* Right Match Mode Card */}
            <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
              <div>
                <h3 className="text-base font-bold">02 Choose your match</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Select official Mega or Mini Auction rules.</p>

                <div className="mt-4 space-y-2.5">
                  <button
                    onClick={() => setAuctionFormat('MEGA')}
                    className={`w-full text-left p-3.5 rounded-xl border transition ${
                      auctionFormat === 'MEGA'
                        ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                        : 'border-zinc-800 bg-[#181C1F] hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">Official Mega Auction</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-[#00E5FF] text-black font-bold">
                        Max 6 Retentions/RTMs
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Slabs: ₹18Cr / ₹14Cr / ₹11Cr / ₹18Cr / ₹14Cr • Uncapped ₹4Cr • RTM Counter-Bid
                    </p>
                  </button>

                  <button
                    onClick={() => setAuctionFormat('MINI')}
                    className={`w-full text-left p-3.5 rounded-xl border transition ${
                      auctionFormat === 'MINI'
                        ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                        : 'border-zinc-800 bg-[#181C1F] hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">Official Mini Auction</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-200 font-semibold">
                        Unlimited Retentions
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Keep any 2026 players at contract price • 0 RTMs • ₹18Cr Overseas Payout Cap
                    </p>
                  </button>
                </div>
              </div>

              <button
                onClick={() => setScreen('create')}
                className="w-full py-3.5 px-4 rounded-xl bg-[#00E5FF] text-black font-bold text-sm hover:brightness-110 transition flex items-center justify-center gap-2"
              >
                <span>+ Create an auction</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bottom 10 Franchise Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-300">Pick your allegiance</span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">10 FRANCHISES. ONE WINNER.</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5">
              {FRANCHISES.map((f) => (
                <button
                  key={f.code}
                  onClick={() => setMyFranchise(f.code)}
                  className={`p-3 rounded-xl border text-center transition ${
                    myFranchise === f.code
                      ? 'border-[#00E5FF] bg-[#181C1F]'
                      : 'border-zinc-800/90 bg-[#121517] hover:border-zinc-700'
                  }`}
                >
                  <div
                    className="w-8 h-8 mx-auto rounded-lg flex items-center justify-center text-xs font-black mb-1.5"
                    style={{ backgroundColor: f.color, color: f.text }}
                  >
                    {f.code}
                  </div>
                  <div className="text-xs font-bold">{f.code}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 2: CREATE YOUR AUCTION
  // =========================================================================
  if (screen === 'create') {
    const selectedFranchiseObj = FRANCHISES.find((f) => f.code === myFranchise);
    return (
      <div className="min-h-screen bg-[#0B0D0E] text-zinc-100 p-6 md:p-8">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => setScreen('clubhouse')}
            className="text-xs text-zinc-400 hover:text-white mb-4 inline-flex items-center gap-1"
          >
            ← Back to clubhouse
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div>
                <div className="text-[11px] uppercase tracking-widest text-zinc-400">NEW ROOM</div>
                <h1 className="text-3xl font-bold mt-1">Create your auction.</h1>
                <p className="text-xs text-zinc-400 mt-1">Choose your franchise, set official BCCI rules, and invite friends.</p>
              </div>

              {/* 01 Make it yours */}
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-5 space-y-4">
                <div className="text-xs font-bold text-zinc-300">01 Make it yours</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Your manager name</label>
                    <input
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                      className="w-full bg-[#181C1F] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#00E5FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Auction name</label>
                    <input
                      value={auctionName}
                      onChange={(e) => setAuctionName(e.target.value)}
                      className="w-full bg-[#181C1F] border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#00E5FF]"
                    />
                  </div>
                </div>
              </div>

              {/* 02 Choose your franchise */}
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="text-xs font-bold text-zinc-300">02 Choose your franchise</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {FRANCHISES.map((f) => (
                    <button
                      key={f.code}
                      onClick={() => setMyFranchise(f.code)}
                      className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                        myFranchise === f.code
                          ? 'border-[#00E5FF] bg-[#181C1F]'
                          : 'border-zinc-800 bg-[#15181B] hover:border-zinc-700'
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-black shrink-0"
                        style={{ backgroundColor: f.color, color: f.text }}
                      >
                        {f.code}
                      </span>
                      <div>
                        <div className="text-xs font-bold">{f.code}</div>
                        <div className="text-[10px] text-zinc-500">{f.city}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 03 Set the house rules */}
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-5 space-y-5">
                <div className="text-xs font-bold text-zinc-300">03 Set the house rules</div>

                {/* Mega vs Mini Auction Toggle */}
                <div>
                  <div className="text-[11px] text-zinc-400 mb-2">Auction Format (Official BCCI Rules)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setAuctionFormat('MEGA')}
                      className={`p-3.5 rounded-xl border text-left transition ${
                        auctionFormat === 'MEGA'
                          ? 'border-[#00E5FF] bg-[#181C1F]'
                          : 'border-zinc-800 bg-[#15181B]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">Mega Auction</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-[#00E5FF]">6 Retentions/RTMs</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        18–25 players • ₹120 Cr • Official ₹18/14/11/18/14 Cr & ₹4 Cr slabs
                      </p>
                    </button>

                    <button
                      onClick={() => setAuctionFormat('MINI')}
                      className={`p-3.5 rounded-xl border text-left transition ${
                        auctionFormat === 'MINI'
                          ? 'border-[#00E5FF] bg-[#181C1F]'
                          : 'border-zinc-800 bg-[#15181B]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">Mini Auction</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">No RTM • ₹18Cr OS Cap</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        18–25 players • Retain any 2026 squad players at contract price
                      </p>
                    </button>
                  </div>
                </div>

                {/* Teams at the table */}
                <div>
                  <div className="text-[11px] text-zinc-400 mb-2">Teams at the table</div>
                  <div className="grid grid-cols-5 gap-2">
                    {[2, 4, 6, 8, 10].map((num) => (
                      <button
                        key={num}
                        onClick={() => setTableSize(num)}
                        className={`py-2.5 rounded-xl border text-xs font-bold transition ${
                          tableSize === num
                            ? 'border-[#00E5FF] bg-[#181C1F] text-[#00E5FF]'
                            : 'border-zinc-800 bg-[#15181B] text-zinc-400'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bid Pace */}
                <div>
                  <div className="text-[11px] text-zinc-400 mb-2">Bid pace</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { sec: 10, label: 'Fast', desc: 'Keep it moving' },
                      { sec: 15, label: 'Classic', desc: 'A little thinking time' },
                      { sec: 20, label: 'Relaxed', desc: 'Room for debate' },
                      { sec: 30, label: 'Strategic', desc: 'Consider every bid' },
                    ].map((p) => (
                      <button
                        key={p.sec}
                        onClick={() => setBidPace(p.sec)}
                        className={`p-3 rounded-xl border text-left transition ${
                          bidPace === p.sec
                            ? 'border-[#00E5FF] bg-[#181C1F]'
                            : 'border-zinc-800 bg-[#15181B]'
                        }`}
                      >
                        <div className="text-sm font-bold">{p.sec}s</div>
                        <div className="text-xs font-medium text-zinc-200">{p.label}</div>
                        <div className="text-[10px] text-zinc-500">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Managers */}
                <div>
                  <div className="text-[11px] text-zinc-400 mb-2">AI managers</div>
                  <div className="grid grid-cols-2 gap-3">
                    {['Competitive', 'Casual'].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setAiDifficulty(lvl)}
                        className={`p-3 rounded-xl border text-left transition ${
                          aiDifficulty === lvl
                            ? 'border-[#00E5FF] bg-[#181C1F]'
                            : 'border-zinc-800 bg-[#15181B]'
                        }`}
                      >
                        <div className="text-xs font-bold">{lvl}</div>
                        <div className="text-[11px] text-zinc-400">
                          {lvl === 'Competitive' ? 'Sharper bids. A tougher table.' : 'An easier game to settle into.'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Summary Sidebar */}
            <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-6 h-fit space-y-5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>YOUR AUCTION</span>
                <span>{isPublicRoom ? 'Public room' : 'Private room'}</span>
              </div>

              <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm"
                  style={{ backgroundColor: selectedFranchiseObj?.color, color: selectedFranchiseObj?.text }}
                >
                  {myFranchise}
                </div>
                <div>
                  <div className="font-bold text-sm">{selectedFranchiseObj?.name}</div>
                  <div className="text-xs text-zinc-400">Managed by {managerName}</div>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Format</span>
                  <span className="font-bold text-[#00E5FF]">{auctionFormat} AUCTION</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Starting purse</span>
                  <span className="font-bold text-base">₹120 Cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Teams</span>
                  <span className="font-semibold">{tableSize} franchises</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Squad size</span>
                  <span className="font-semibold">18–25 players (Max 8 OS)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Retentions / RTM</span>
                  <span className="font-semibold">
                    {auctionFormat === 'MEGA' ? 'Max 6 combined' : 'Unlimited / 0 RTM'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Bid clock</span>
                  <span className="font-semibold">{bidPace}s</span>
                </div>
              </div>

              <button
                onClick={handleCreateRoom}
                className="w-full py-3.5 rounded-xl bg-[#00E5FF] text-black font-bold text-sm hover:brightness-110 transition"
              >
                Create auction →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 3: PRE-AUCTION LOBBY & KEEP YOUR CORE (OFFICIAL RETENTIONS)
  // =========================================================================
  if (screen === 'lobby') {
    const myRetained = retentionsByTeam[myFranchise] || [];
    const megaStats = calculateMegaRetentionCost(myRetained);
    const miniCost = myRetained.reduce((acc, p) => acc + (p.contractCr || p.basePriceCr), 0);
    const remainingPurse = auctionFormat === 'MEGA'
      ? BASE_PURSE_CR - megaStats.totalCost
      : Math.max(25, BASE_PURSE_CR - miniCost);

    return (
      <div className="min-h-screen bg-[#0B0D0E] text-zinc-100 p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-[#00E5FF]">
                YOUR AUCTION STARTS HERE • {auctionFormat} AUCTION
              </div>
              <h1 className="text-3xl font-bold mt-1">{auctionName}.</h1>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-400 mt-2">
                <span>Private room</span>
                <span>•</span>
                <span>{tableSize} teams</span>
                <span>•</span>
                <span>₹120 Cr starting purse</span>
                <span>•</span>
                <span>18–25 players</span>
                <span>•</span>
                <span>{bidPace}s per bid</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-[#121517] border border-zinc-800 px-3.5 py-2 rounded-xl text-xs font-mono">
                ROOM <span className="text-[#00E5FF] font-bold ml-1">{roomCode}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(roomCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 1500);
                }}
                className="bg-[#121517] border border-zinc-800 hover:border-[#00E5FF] px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-[#00E5FF]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy room code'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {/* Keep your core (Official BCCI Rules) */}
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#00E5FF]" />
                      <span className="font-bold text-sm">Keep your core</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">Official BCCI Rules</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      {auctionFormat === 'MEGA'
                        ? `Retained: ${myRetained.length}/6 • Remaining Purse: ${formatCr(remainingPurse)} • RTMs Left: ${megaStats.rtmsLeft}`
                        : `Retained: ${myRetained.length} players • Remaining Purse: ${formatCr(remainingPurse)} • 0 RTMs in Mini Auction`}
                    </p>
                  </div>
                  <button
                    onClick={() => setRetentionModalOpen(!retentionModalOpen)}
                    className="px-4 py-2 rounded-xl bg-[#181C1F] border border-[#00E5FF]/60 text-[#00E5FF] text-xs font-semibold hover:bg-[#00E5FF] hover:text-black transition"
                  >
                    {retentionModalOpen ? 'Done selecting ✓' : 'Choose players →'}
                  </button>
                </div>

                {retentionModalOpen && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                    <div className="text-xs text-zinc-400">
                      {auctionFormat === 'MEGA'
                        ? 'Mega Auction Slabs: Capped #1 ₹18Cr, #2 ₹14Cr, #3 ₹11Cr, #4 ₹18Cr, #5 ₹14Cr | Uncapped Indian (max 2): ₹4Cr each. Unused slots become RTMs.'
                        : 'Mini Auction Rules: Retain any number of players from your 2026 squad at their contract salary.'}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                      {mySquadCandidates.map((p) => {
                        const idx = myRetained.findIndex((r) => r.id === p.id);
                        const isSelected = idx !== -1;
                        const slabCost = auctionFormat === 'MEGA'
                          ? (p.status === 'Uncapped' ? 4 : (MEGA_CAPPED_SLABS[idx !== -1 ? idx : megaStats.cappedCount] || 14))
                          : (p.contractCr || p.basePriceCr);

                        return (
                          <button
                            key={p.id}
                            onClick={() => toggleRetention(p)}
                            className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                              isSelected
                                ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                                : 'border-zinc-800 bg-[#181C1F] hover:border-zinc-700'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-bold flex items-center gap-1.5">
                                <span>{p.name}</span>
                                {p.isOverseas && <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300">OS</span>}
                              </div>
                              <div className="text-[11px] text-zinc-400">{p.role} • {p.status}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-bold text-[#00E5FF]">{formatCr(slabCost)}</div>
                              <div className="text-[10px] text-zinc-400">{isSelected ? 'Retained ✓' : 'Select'}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* At the table */}
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">At the table ({tableSize} franchises)</span>
                  <span className="text-[11px] text-zinc-400">Open seats auto-fill with {aiDifficulty} AI</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {activeFranchises.map((f) => {
                    const human = humanManagers.find((m) => m.franchise === f.code);
                    return (
                      <div key={f.code} className="p-3 rounded-xl border border-zinc-800 bg-[#181C1F]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black">{f.code}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${human ? 'bg-[#00E5FF]/20 text-[#00E5FF]' : 'bg-zinc-800 text-zinc-400'}`}>
                            {human ? 'YOU' : 'AI'}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-1 truncate">
                          {human ? human.name : `${f.code} AI Bot`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={startAuction}
                className="w-full py-4 rounded-2xl bg-[#00E5FF] text-black font-bold text-sm hover:brightness-110 transition flex items-center justify-center gap-2"
              >
                <span>Let the auction begin →</span>
              </button>
            </div>

            {/* Right Column: Live Lobby Chat */}
            <div className="h-[460px]">
              {renderChatBox()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 4: LIVE AUCTION ROOM (WITH SKIP-LOCKOUT, RTM & ROOM CHAT)
  // =========================================================================
  if (screen === 'auction' && currentPlayer && myTeamObj) {
    const myOverseas = myTeamObj.roster.filter((p) => p.isOverseas).length;
    const myKeepers = myTeamObj.roster.filter((p) => p.role === 'Wicketkeeper').length;
    const inc = getOfficialIncrement(currentBid);
    const canAffordNext = canTeamBid(myTeamObj, nextMinBid) && !isMyBidLocked && highestBidder !== myFranchise;

    const eligibleHumans = activeFranchises
      .map((f) => teamsState[f.code])
      .filter((t) => t && t.isHuman && canTeamBid(t, nextMinBid));

    return (
      <div className="min-h-screen bg-[#0B0D0E] text-zinc-100 p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#121517] border border-zinc-800 rounded-2xl px-5 py-3.5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#00E5FF]">
                • LOT {lotIndex + 1} / {auctionPool.length} • {auctionFormat} AUCTION
              </div>
              <div className="text-lg font-bold">{auctionName}</div>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-xs">
              <div>
                <div className="text-[10px] text-zinc-500">PURSE LEFT</div>
                <div className="text-base font-bold text-[#00E5FF]">{formatCr(myTeamObj.purseLeft)}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">SQUAD</div>
                <div className="text-base font-bold">{myTeamObj.roster.length}/25</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">OVERSEAS</div>
                <div className="text-base font-bold">{myOverseas}/8</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${myKeepers >= 2 ? 'border-[#00E5FF]/40 text-[#00E5FF]' : 'border-amber-500/40 text-amber-300'}`}>
                  {myKeepers >= 2 ? `${myKeepers} Keepers ✓` : 'Keeper required'}
                </span>
                {auctionFormat === 'MEGA' && (
                  <span className="px-2.5 py-1 rounded-lg border border-zinc-700 bg-zinc-800/80 text-[11px] font-semibold">
                    {myTeamObj.rtmsLeft} RTMs left
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-xs font-semibold"
              >
                {isPaused ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button
                onClick={finishAndGoToVerdict}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-[#00E5FF] hover:text-black text-xs font-semibold transition"
              >
                Finish & Compare Squads →
              </button>
            </div>
          </div>

          {/* Main 3-Column Stage */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Center Bidding Stage (2 Cols) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <div className="text-xs font-bold text-[#00E5FF]">{currentPlayer.setCode} • {currentPlayer.setName}</div>
                    <div className="text-[11px] text-zinc-400">
                      {auctionFormat === 'MINI' && currentPlayer.isOverseas
                        ? 'Mini Auction Overseas Cap: Player payout capped at ₹18 Cr'
                        : 'Official BCCI Dynamic Bid Increments Active'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1.5 rounded-xl font-mono text-sm font-bold border ${timer <= 4 ? 'border-red-500 text-red-400 bg-red-500/10' : 'border-zinc-700 bg-zinc-900'}`}>
                      ⏱ {timer}s
                    </div>
                  </div>
                </div>

                {/* Lockout Banner if User Skipped */}
                {isMyBidLocked && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold">
                      <Lock className="w-4 h-4" />
                      <span>You skipped — Bidding is locked for {currentPlayer.name}</span>
                    </div>
                    <span className="text-[11px] text-amber-200/80">Waiting for other active managers</span>
                  </div>
                )}

                {/* RTM Interactive Stage (Mega Auction Only — Restricted to the Acting Franchise / AI) */}
                {rtmStage && (() => {
                  const actingCode = rtmStage.step === 'COUNTER' ? rtmStage.winnerTeam : rtmStage.prevTeam;
                  const actingTeam = teamsState[actingCode];
                  const isMyTurnToDecide = myFranchise === actingCode;

                  return (
                    <div className="p-4 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold uppercase tracking-wider text-[#00E5FF]">
                          OFFICIAL BCCI RIGHT TO MATCH (RTM) — STEP {rtmStage.step}
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-900 border border-[#00E5FF]/40 text-[#00E5FF] font-semibold">
                          Decision: {actingCode} ({actingTeam?.isHuman ? actingTeam.manager : 'AI Manager'})
                        </span>
                      </div>

                      {rtmStage.step === 'PROMPT' && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-zinc-200">
                            <strong>{rtmStage.winnerTeam}</strong> won the bid at <strong>{formatCr(rtmStage.bid)}</strong>. Does <strong>{rtmStage.prevTeam}</strong> exercise RTM for <strong>{currentPlayer.name}</strong>?
                          </p>
                          {isMyTurnToDecide ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => setRtmStage({ ...rtmStage, step: 'COUNTER' })}
                                className="px-3.5 py-2 rounded-lg bg-[#00E5FF] text-black text-xs font-bold"
                              >
                                Use RTM Card
                              </button>
                              <button
                                onClick={() => completeSale(rtmStage.winnerTeam, rtmStage.bid, false)}
                                className="px-3.5 py-2 rounded-lg bg-zinc-800 text-xs font-semibold"
                              >
                                Pass
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400 italic">
                              Waiting for {rtmStage.prevTeam} ({actingTeam?.isHuman ? actingTeam.manager : 'AI'}) to decide...
                            </span>
                          )}
                        </div>
                      )}

                      {rtmStage.step === 'COUNTER' && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-zinc-200">
                            <strong>{rtmStage.prevTeam}</strong> invoked RTM! <strong>{rtmStage.winnerTeam}</strong> gets ONE final counter-offer:
                          </p>
                          {isMyTurnToDecide ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="0.25"
                                placeholder={`> ${rtmStage.bid}`}
                                value={counterBidInput}
                                onChange={(e) => setCounterBidInput(e.target.value)}
                                className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs"
                              />
                              <button
                                onClick={() => {
                                  const raised = Math.max(rtmStage.bid, parseFloat(counterBidInput) || rtmStage.bid);
                                  setRtmStage({ ...rtmStage, step: 'MATCH', bid: raised });
                                  setCounterBidInput('');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#00E5FF] text-black text-xs font-bold"
                              >
                                Submit Final Bid
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400 italic">
                              Waiting for {rtmStage.winnerTeam} ({actingTeam?.isHuman ? actingTeam.manager : 'AI'}) final counter-bid...
                            </span>
                          )}
                        </div>
                      )}

                      {rtmStage.step === 'MATCH' && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-zinc-200">
                            Final raised bid is <strong>{formatCr(rtmStage.bid)}</strong>. Does <strong>{rtmStage.prevTeam}</strong> match?
                          </p>
                          {isMyTurnToDecide ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => completeSale(rtmStage.prevTeam, rtmStage.bid, true)}
                                className="px-3.5 py-2 rounded-lg bg-[#00E5FF] text-black text-xs font-bold"
                              >
                                Match {formatCr(rtmStage.bid)}
                              </button>
                              <button
                                onClick={() => completeSale(rtmStage.winnerTeam, rtmStage.bid, false)}
                                className="px-3.5 py-2 rounded-lg bg-zinc-800 text-xs font-semibold"
                              >
                                Decline & Pass
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-400 italic">
                              Waiting for {rtmStage.prevTeam} ({actingTeam?.isHuman ? actingTeam.manager : 'AI'}) to match or decline...
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Player Details & Current Bid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span>{currentPlayer.country}</span>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-200">{currentPlayer.status}</span>
                      {currentPlayer.prevTeam && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-[#00E5FF]">Prev: {currentPlayer.prevTeam}</span>
                      )}
                    </div>
                    <h2 className="text-3xl font-black tracking-tight">{currentPlayer.name}</h2>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-xs font-semibold">{currentPlayer.role}</span>
                      <span className="text-xs text-zinc-400">Quality {currentPlayer.quality} • Form {currentPlayer.form}</span>
                    </div>
                    <div className="pt-2 text-xs text-zinc-400">
                      BASE PRICE: <strong className="text-zinc-200">{formatCr(currentPlayer.basePriceCr)}</strong>
                    </div>
                  </div>

                  <div className="bg-[#181C1F] border border-zinc-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] uppercase text-zinc-400">CURRENT BID</div>
                        <div className="text-3xl font-black text-white">{formatCr(currentBid)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-zinc-400">HIGHEST BIDDER</div>
                        <div className="text-lg font-black text-[#00E5FF]">
                          {highestBidder || 'Opening Bid'}
                        </div>
                      </div>
                    </div>

                    {/* Primary Raise Button */}
                    <button
                      disabled={!canAffordNext}
                      onClick={() => placeBid(myFranchise, nextMinBid)}
                      className={`w-full py-3 rounded-xl font-bold text-sm transition ${
                        canAffordNext
                          ? 'bg-[#00E5FF] text-black hover:brightness-110'
                          : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      }`}
                    >
                      {isMyBidLocked
                        ? 'Bidding Locked (You Skipped)'
                        : highestBidder === myFranchise
                        ? 'You hold the highest bid ✓'
                        : `Raise Bid → ${formatCr(nextMinBid)} (+${formatCr(inc)})`}
                    </button>

                    {/* Quick Jump Increment Buttons */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {[inc, 0.5, 1.0, 2.0].map((jump, i) => {
                        const target = Number(((highestBidder ? currentBid : currentPlayer.basePriceCr) + jump).toFixed(2));
                        const ok = canTeamBid(myTeamObj, target) && !isMyBidLocked && highestBidder !== myFranchise;
                        return (
                          <button
                            key={i}
                            disabled={!ok}
                            onClick={() => placeBid(myFranchise, target)}
                            className={`py-2 rounded-lg border text-center transition ${
                              ok
                                ? 'border-zinc-700 bg-zinc-900 hover:border-[#00E5FF] text-zinc-200'
                                : 'border-zinc-800/60 bg-zinc-900/40 text-zinc-600 cursor-not-allowed'
                            }`}
                          >
                            <div className="text-[11px] font-bold">+{formatCr(jump)}</div>
                            <div className="text-[10px] text-zinc-400">{formatCr(target)}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Skip & Lockout Control Bar */}
                <div className="pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-zinc-400">
                    Skip votes: <strong className="text-zinc-200">{skippedByTeams.length}/{Math.max(1, eligibleHumans.length)}</strong> human managers
                    <span className="block text-[11px] text-zinc-500">
                      Skipping locks your bids on this player. If all other humans skip, the player sells immediately to the highest bidder.
                    </span>
                  </div>
                  <button
                    disabled={isMyBidLocked || highestBidder === myFranchise}
                    onClick={() => handleSkipPlayer(myFranchise)}
                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      isMyBidLocked
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 cursor-not-allowed'
                        : highestBidder === myFranchise
                        ? 'border-zinc-800 bg-zinc-900 text-zinc-500 cursor-not-allowed'
                        : 'border-zinc-700 bg-[#181C1F] hover:border-red-400 hover:text-red-300'
                    }`}
                  >
                    <SkipForward className="w-4 h-4" />
                    <span>{isMyBidLocked ? 'Skipped (Locked)' : 'Vote to skip player'}</span>
                  </button>
                </div>
              </div>

              {/* Coming Up Next Strip */}
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
                  COMING UP NEXT
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {auctionPool.slice(lotIndex + 1, lotIndex + 5).map((p) => (
                    <div key={p.id} className="p-2.5 rounded-xl bg-[#181C1F] border border-zinc-800/80">
                      <div className="text-xs font-bold truncate">{p.name}</div>
                      <div className="text-[11px] text-zinc-400">{p.role} • {formatCr(p.basePriceCr)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Sidebar: Tabs for Chat, My Squad, All Teams */}
            <div className="space-y-3 flex flex-col">
              <div className="grid grid-cols-3 gap-1.5 bg-[#121517] p-1.5 rounded-xl border border-zinc-800">
                {[
                  { id: 'chat', label: 'Room Chat' },
                  { id: 'mysquad', label: `My Squad (${myTeamObj.roster.length})` },
                  { id: 'allteams', label: 'All Teams' }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setRightTab(t.id)}
                    className={`py-2 rounded-lg text-xs font-bold transition ${
                      rightTab === t.id ? 'bg-[#00E5FF] text-black' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {rightTab === 'chat' && <div className="flex-1">{renderChatBox()}</div>}

              {rightTab === 'mysquad' && (
                <div className="bg-[#121517] border border-zinc-800 rounded-xl p-4 space-y-2 max-h-[460px] overflow-y-auto">
                  {myTeamObj.roster.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-8">No players signed yet.</p>
                  ) : (
                    myTeamObj.roster.map((p) => (
                      <div key={p.id} className="p-2.5 rounded-lg bg-[#181C1F] border border-zinc-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold">{p.name} {p.isOverseas ? '✈️' : ''}</div>
                          <div className="text-[11px] text-zinc-400">{p.role} • {p.acquiredVia}</div>
                        </div>
                        <div className="font-bold text-[#00E5FF]">{formatCr(p.boughtPriceCr)}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {rightTab === 'allteams' && (
                <div className="bg-[#121517] border border-zinc-800 rounded-xl p-4 space-y-2 max-h-[460px] overflow-y-auto">
                  {Object.values(teamsState).map((t) => (
                    <div key={t.code} className="p-2.5 rounded-lg bg-[#181C1F] border border-zinc-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold">{t.code} <span className="text-zinc-400 font-normal">({t.manager})</span></div>
                        <div className="text-[11px] text-zinc-400">{t.roster.length}/25 players • OS {t.roster.filter((p) => p.isOverseas).length}/8</div>
                      </div>
                      <div className="font-bold text-[#00E5FF]">{formatCr(t.purseLeft)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 5: THE FINAL VERDICT & HEAD-TO-HEAD SQUAD COMPARISON
  // =========================================================================
  const leftTeam = teamsState[compareLeft] || Object.values(teamsState)[0];
  const rightTeam = teamsState[compareRight] || Object.values(teamsState)[1];
  const leftScore = leftTeam ? evaluateSquadScore(leftTeam, auctionFormat) : null;
  const rightScore = rightTeam ? evaluateSquadScore(rightTeam, auctionFormat) : null;

  return (
    <div className="min-h-screen bg-[#0B0D0E] text-zinc-100 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-[#00E5FF]">
              THE FINAL VERDICT • {auctionFormat} AUCTION COMPLETE
            </div>
            <h1 className="text-3xl font-bold mt-1">How we settle the best-team debate.</h1>
            <p className="text-xs text-zinc-400 mt-1">
              50% Player Quality • 20% Recent Form • 20% Squad Balance • 10% Value for Money
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setVerdictSubTab('leaderboard')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                verdictSubTab === 'leaderboard' ? 'bg-[#00E5FF] text-black' : 'bg-[#121517] border border-zinc-800 text-zinc-300'
              }`}
            >
              🏆 Final Leaderboard
            </button>
            <button
              onClick={() => setVerdictSubTab('compare')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                verdictSubTab === 'compare' ? 'bg-[#00E5FF] text-black' : 'bg-[#121517] border border-zinc-800 text-zinc-300'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>Compare Squads Head-to-Head</span>
            </button>
            <button
              onClick={() => setScreen('clubhouse')}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 text-xs font-semibold hover:bg-zinc-700"
            >
              New Auction
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {verdictSubTab === 'leaderboard' ? (
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-5 space-y-3">
                {leaderboard.map(({ team, score }, idx) => (
                  <div
                    key={team.code}
                    className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                      idx === 0 ? 'border-[#00E5FF] bg-[#00E5FF]/10' : 'border-zinc-800 bg-[#181C1F]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black w-6 text-zinc-400">#{idx + 1}</span>
                      <div>
                        <div className="font-bold text-sm flex items-center gap-2">
                          <span>{team.name}</span>
                          {idx === 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-[#00E5FF] text-black font-bold">CHAMPION</span>}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {team.manager} • {team.roster.length} players • Spent {formatCr(score.spent)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div className="hidden sm:flex gap-3 text-zinc-400">
                        <span>Qual: <strong className="text-zinc-200">{score.quality}</strong></span>
                        <span>Form: <strong className="text-zinc-200">{score.form}</strong></span>
                        <span>Bal: <strong className="text-zinc-200">{score.balance}</strong></span>
                        <span>Val: <strong className="text-zinc-200">{score.value}</strong></span>
                      </div>
                      <div className="text-xl font-black text-[#00E5FF]">{score.total}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* HEAD-TO-HEAD SQUAD COMPARISON VIEW */
              <div className="bg-[#121517] border border-zinc-800 rounded-2xl p-5 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Franchise A</label>
                    <select
                      value={compareLeft}
                      onChange={(e) => setCompareLeft(e.target.value)}
                      className="w-full bg-[#181C1F] border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold"
                    >
                      {Object.values(teamsState).map((t) => (
                        <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Franchise B</label>
                    <select
                      value={compareRight}
                      onChange={(e) => setCompareRight(e.target.value)}
                      className="w-full bg-[#181C1F] border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold"
                    >
                      {Object.values(teamsState).map((t) => (
                        <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {leftTeam && rightTeam && leftScore && rightScore && (
                  <>
                    {/* Metric Comparison Bars */}
                    <div className="bg-[#181C1F] border border-zinc-800 rounded-xl p-4 space-y-3 text-xs">
                      {[
                        { label: 'Final Verdict Score', a: leftScore.total, b: rightScore.total },
                        { label: 'Player Quality (50%)', a: leftScore.quality, b: rightScore.quality },
                        { label: 'Recent Form (20%)', a: leftScore.form, b: rightScore.form },
                        { label: 'Squad Balance (20%)', a: leftScore.balance, b: rightScore.balance },
                        { label: 'Value for Money (10%)', a: leftScore.value, b: rightScore.value },
                      ].map((row) => (
                        <div key={row.label} className="space-y-1">
                          <div className="flex justify-between font-bold">
                            <span className={row.a >= row.b ? 'text-[#00E5FF]' : 'text-zinc-300'}>{row.a}</span>
                            <span className="text-zinc-400 font-medium">{row.label}</span>
                            <span className={row.b >= row.a ? 'text-[#00E5FF]' : 'text-zinc-300'}>{row.b}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 h-1.5">
                            <div className="bg-zinc-800 rounded-full overflow-hidden flex justify-end">
                              <div className="bg-[#00E5FF] h-full" style={{ width: `${Math.min(100, row.a)}%` }} />
                            </div>
                            <div className="bg-zinc-800 rounded-full overflow-hidden">
                              <div className="bg-sky-400 h-full" style={{ width: `${Math.min(100, row.b)}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Side-by-Side Roster Lists */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[leftTeam, rightTeam].map((t) => (
                        <div key={t.code} className="bg-[#181C1F] border border-zinc-800 rounded-xl p-3.5 space-y-2">
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                            <span className="font-bold text-xs">{t.code} Squad ({t.roster.length})</span>
                            <span className="text-[11px] text-[#00E5FF]">Purse Left: {formatCr(t.purseLeft)}</span>
                          </div>
                          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                            {[...t.roster].sort((a, b) => b.quality - a.quality).map((p) => (
                              <div key={p.id} className="flex items-center justify-between text-[11px] py-1 border-b border-zinc-800/50">
                                <div>
                                  <span className="font-semibold text-zinc-200">{p.name}</span>
                                  <span className="text-zinc-500 ml-1">({p.role})</span>
                                </div>
                                <span className="font-mono text-zinc-300">{formatCr(p.boughtPriceCr)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Persistent Room Chat for Post-Auction Banter */}
          <div className="h-[520px]">
            {renderChatBox()}
          </div>
        </div>
      </div>
    </div>
  );
}
