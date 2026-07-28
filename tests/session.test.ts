import { describe, it, expect, vi } from 'vitest';
import { GameSession } from '../src/session';
import { Card } from '../src/types';
import { getCardWeight } from '../src/rules';

describe('GameSession Integration and Flow Tests', () => {
  it('should initialize game state, deal 108 cards, 27 per player', () => {
    const session = new GameSession();
    session.initGame();

    expect(session.phase).toBe('DEALING');
    expect(session.playerHands[0].length).toBe(27);
    expect(session.playerHands[1].length).toBe(27);
    expect(session.playerHands[2].length).toBe(27);
    expect(session.playerHands[3].length).toBe(27);

    const totalCards = session.playerHands.reduce((acc, h) => acc + h.length, 0);
    expect(totalCards).toBe(108);
  });

  describe('Tribute Stage (单贡 / Single Tribute)', () => {
    it('should assign correct payer and receiver, automatically process AI tribute, and prompt player for return', () => {
      vi.useFakeTimers();
      const session = new GameSession();

      // Setup state for Single Tribute (1st: player 0, 4th: player 3)
      session.levelTeamA = 3; // ensure it is not the first game
      session.lastRoundFinishedPlayers = [0, 1, 2, 3];

      // Mock player hands
      session.playerHands = [
        [
          { suit: 'S', rank: 'A' },
          { suit: 'D', rank: '10' },
          { suit: 'C', rank: '5' }
        ], // Player 0 (receiver)
        [{ suit: 'S', rank: '9' }],
        [{ suit: 'S', rank: '8' }],
        [
          { suit: 'S', rank: 'K' },
          { suit: 'D', rank: '4' }
        ] // Player 3 (payer, AI)
      ];

      // Spy on return_required event
      let returnRequiredData: any = null;
      session.on('return_required', (desc, eligible) => {
        returnRequiredData = { desc, eligible };
      });

      // Start tribute phase
      session.checkTribute();

      // Check tribute setup
      expect(session.phase).toBe('TRIBUTE');
      expect(session.tributeInfo).not.toBeNull();
      expect(session.tributeInfo?.isDouble).toBe(false);
      expect(session.tributeInfo?.payers).toEqual([3]);
      expect(session.tributeInfo?.receivers).toEqual([0]);

      // Since payer 3 is AI, checkTribute -> setupTribute -> processNextTribute -> AI automatically tributes card
      // AI should tribute its largest card (King of Spades) to Player 0
      expect(session.playerHands[0].some((c) => c.suit === 'S' && c.rank === 'K')).toBe(true);
      expect(session.playerHands[3].some((c) => c.suit === 'S' && c.rank === 'K')).toBe(false);

      // Advance timers to trigger next step (AI tribute transition)
      vi.advanceTimersByTime(1200);

      // Now it should be player 0's turn to return card (退贡 / 还牌)
      expect(session.tributeInfo?.status).toBe('WAITING_RETURN');
      expect(returnRequiredData).not.toBeNull();
      // Player 0 should only be allowed to return cards <= 10.
      // Hand 0 has: A (14), 10 (10), 5 (5), and K (13, received from 3).
      // So eligible return cards are 10 and 5.
      expect(returnRequiredData.eligible.length).toBe(2);
      expect(returnRequiredData.eligible.some((c: Card) => c.rank === '10')).toBe(true);
      expect(returnRequiredData.eligible.some((c: Card) => c.rank === '5')).toBe(true);
      expect(returnRequiredData.eligible.some((c: Card) => c.rank === 'A')).toBe(false);

      // Let's player 0 return the '5' card
      const returnCard = returnRequiredData.eligible.find((c: Card) => c.rank === '5');
      session.submitTributeCard(returnCard);

      // The card '5' should be transferred to player 3
      expect(session.playerHands[3].some((c) => c.rank === '5')).toBe(true);
      expect(session.playerHands[0].some((c) => c.rank === '5')).toBe(false);

      // Advance timers to end tribute phase
      vi.advanceTimersByTime(1200);

      // After single tribute, the starting player should be the payer (player 3)
      expect(session.phase).toBe('PLAYING');
      expect(session.currentPlayer).toBe(3);

      vi.useRealTimers();
    });
  });

  describe('Tribute Stage (双贡 / Double Tribute)', () => {
    it('should assign larger tribute card to 1st place and smaller to 2nd place, and starting player is the one who paid larger card', () => {
      vi.useFakeTimers();
      const session = new GameSession();

      session.levelTeamA = 3;
      // Double upstream: 1st player 0, 2nd player 2, losers: 3 and 1
      session.lastRoundFinishedPlayers = [0, 2, 1, 3];

      // Mock player hands (3 and 1 are payers)
      session.playerHands = [
        [{ suit: 'S', rank: '5' }], // player 0 (1st)
        [{ suit: 'S', rank: 'K' }], // player 1 (third, largest card is King, weight 13)
        [{ suit: 'S', rank: '6' }], // player 2 (2nd)
        [{ suit: 'S', rank: 'A' }] // player 3 (last, largest card is Ace, weight 14)
      ];

      session.checkTribute();

      // Since last (player 3) has Ace (14) and third (player 1) has King (13),
      // player 3's card is larger. So:
      // player 3 (last) pays to player 0 (first)
      // player 1 (third) pays to player 2 (second)
      expect(session.tributeInfo?.payers).toEqual([3, 1]);
      expect(session.tributeInfo?.receivers).toEqual([0, 2]);

      // Both payers are AI, they automatically tribute cards sequentially
      // Advance timer for 1st tribute (player 3 to player 0)
      vi.advanceTimersByTime(1200);
      // Advance timer for 2nd tribute (player 1 to player 2)
      vi.advanceTimersByTime(1200);

      // Now it should be waiting return
      expect(session.tributeInfo?.status).toBe('WAITING_RETURN');

      // Receivers (0 and 2) are player 0 (human) and player 2 (AI).
      // Since index is 0, it is player 0 returning to payer 3.
      // Player 0 had '5' (5) and received 'A' (14). Since '5' <= 10, it must return '5'.
      // For AI (player 2), it will automatically return its smallest card <= 10.

      // Player 0 returns its card
      session.submitTributeCard({ suit: 'S', rank: '5' });

      // Advance timers for player 0 return
      vi.advanceTimersByTime(1200);
      // Advance timers for player 2 (AI) return
      vi.advanceTimersByTime(1200);

      // Tribute phase should end.
      expect(session.phase).toBe('PLAYING');
      // Player 3 paid Ace (14) and Player 1 paid King (13).
      // Since Player 3's tribute card was larger, Player 3 should start first!
      expect(session.currentPlayer).toBe(3);

      vi.useRealTimers();
    });
  });

  describe('Anti-Tribute (抗贡)', () => {
    it('should trigger anti-tribute when losers hold 2 red jokers in single tribute', () => {
      const session = new GameSession();
      session.levelTeamA = 3;
      session.lastRoundFinishedPlayers = [0, 1, 2, 3]; // Player 3 is payer

      // Player 3 holds both red jokers (since 2 decks, there are exactly 2 red jokers)
      session.playerHands = [
        [{ suit: 'S', rank: 'A' }],
        [{ suit: 'S', rank: 'Q' }],
        [{ suit: 'S', rank: 'J' }],
        [
          { suit: 'J', rank: 'red_joker' },
          { suit: 'J', rank: 'red_joker' }
        ]
      ];

      let toastMsg = '';
      session.on('toast', (msg) => {
        toastMsg = msg;
      });

      session.checkTribute();

      // Should trigger anti-tribute immediately
      expect(session.phase).toBe('PLAYING');
      expect(toastMsg).toContain('抗贡成功');
      // Starts with previous round's head游 (player 0)
      expect(session.currentPlayer).toBe(0);
    });

    it('should trigger anti-tribute when each loser holds 1 red joker in double tribute', () => {
      const session = new GameSession();
      session.levelTeamA = 3;
      // Double upstream: 1st player 0, 2nd player 2. Payers/losers are player 1 and player 3
      session.lastRoundFinishedPlayers = [0, 2, 1, 3];

      // Player 1 has 1 Red Joker, Player 3 has 1 Red Joker
      session.playerHands = [
        [{ suit: 'S', rank: 'A' }],
        [{ suit: 'J', rank: 'red_joker' }],
        [{ suit: 'S', rank: 'J' }],
        [{ suit: 'J', rank: 'red_joker' }]
      ];

      let toastMsg = '';
      session.on('toast', (msg) => {
        toastMsg = msg;
      });

      session.checkTribute();

      // Should trigger anti-tribute immediately
      expect(session.phase).toBe('PLAYING');
      expect(toastMsg).toContain('抗贡成功');
      expect(session.currentPlayer).toBe(0);
    });
  });

  describe('Round End Win and Level Upgrade Rules', () => {
    it('should award win to Team A and upgrade by 1 level when finishing order is 1st (0) and 4th (2)', () => {
      const session = new GameSession();
      session.initGame();

      // Simulate player 0 finishing 1st, player 1 finishing 2nd, player 3 finishing 3rd
      session.finishedPlayers = [0, 1, 3];

      // Trigger checkRoundEnd
      const ended = (session as any).checkRoundEnd();

      expect(ended).toBe(true);
      expect(session.phase).toBe('ROUND_END');

      // Since Team A got 1st (0) and 4th (2), Team A (levelTeamA) should win and upgrade by 1 level (from 2 to 3)
      expect(session.levelTeamA).toBe(3);
      expect(session.levelTeamB).toBe(2);
    });

    it('should award win to Team A and upgrade by 2 levels when finishing order is 1st (0) and 3rd (2)', () => {
      const session = new GameSession();
      session.initGame();

      // Simulate player 0 finishing 1st, player 1 finishing 2nd, player 2 finishing 3rd
      session.finishedPlayers = [0, 1, 2];

      const ended = (session as any).checkRoundEnd();

      expect(ended).toBe(true);
      expect(session.phase).toBe('ROUND_END');

      // Since Team A got 1st (0) and 3rd (2), Team A should win and upgrade by 2 levels (from 2 to 4)
      expect(session.levelTeamA).toBe(4);
      expect(session.levelTeamB).toBe(2);
    });

    it('should award win to Team B and upgrade by 3 levels when Team B gets 1st (1) and 2nd (3) [Double Upstream]', () => {
      const session = new GameSession();
      session.initGame();

      // Simulate Player 1 finishing 1st, Player 3 finishing 2nd
      session.finishedPlayers = [1, 3];

      const ended = (session as any).checkRoundEnd();

      expect(ended).toBe(true);
      expect(session.phase).toBe('ROUND_END');

      // Since Team B got 1st and 2nd, Team B (levelTeamB) should win and upgrade by 3 levels (from 2 to 5)
      expect(session.levelTeamB).toBe(5);
      expect(session.levelTeamA).toBe(2);
    });

    it('should track A-rank failure count and demote to level 2 on the third consecutive failure', () => {
      const session = new GameSession();
      session.initGame();

      // Set Team A to level 14 (A)
      session.levelTeamA = 14;
      session.currentRank = 'A';

      // Failure 1: Team A gets 1st (0) but teammate is 4th (2 is not in finishedPlayers)
      session.finishedPlayers = [0, 1, 3];
      session.lastRoundFinishedPlayers = [0, 1, 3, 2];
      (session as any).checkRoundEnd();
      session.startNextRound();
      expect(session.failCountTeamA).toBe(1);
      expect(session.levelTeamA).toBe(14); // Still 14

      // Failure 2: Team A gets 1st (0) but teammate is 4th again
      session.finishedPlayers = [0, 1, 3];
      session.lastRoundFinishedPlayers = [0, 1, 3, 2];
      (session as any).checkRoundEnd();
      session.startNextRound();
      expect(session.failCountTeamA).toBe(2);
      expect(session.levelTeamA).toBe(14);

      // Failure 3: Team A gets 1st (0) but teammate is 4th again
      session.finishedPlayers = [0, 1, 3];
      session.lastRoundFinishedPlayers = [0, 1, 3, 2];
      (session as any).checkRoundEnd();
      session.startNextRound();

      // Demotes to 2!
      expect(session.failCountTeamA).toBe(0);
      expect(session.levelTeamA).toBe(2);
    });

    it('should successfully pass A and win the game (resetting both teams to level 2) when teammate is not last', () => {
      const session = new GameSession();
      session.initGame();

      // Setup state: Team A is playing A (level 14)
      session.levelTeamA = 14;
      session.currentRank = 'A';

      // Team A wins: Player 0 is 1st, Player 2 (partner) is 2nd (not last/4th)
      session.finishedPlayers = [0, 2, 1];

      const ended = (session as any).checkRoundEnd();
      expect(ended).toBe(true);

      session.startNextRound();

      // Verify that Team A successfully passed A and won the game (resetting levels to 2)
      expect(session.levelTeamA).toBe(2);
      expect(session.levelTeamB).toBe(2);
      expect(session.currentRank).toBe('2');
      expect(session.failCountTeamA).toBe(0);
    });

    it('should increment A-rank failure count when opponent wins the round while Team A is playing A', () => {
      const session = new GameSession();
      session.initGame();

      // Setup state: Team A is playing A (level 14), Team B is playing 5 (level 5)
      session.levelTeamA = 14;
      session.levelTeamB = 5;
      session.currentRank = 'A';

      // Team B wins with double upstream (Player 1 is 1st, Player 3 is 2nd)
      session.finishedPlayers = [1, 3];

      const ended = (session as any).checkRoundEnd();
      expect(ended).toBe(true);

      session.startNextRound();

      // Team A should fail to pass A (failure count increments) and remain at level 14
      expect(session.levelTeamA).toBe(14);
      expect(session.failCountTeamA).toBe(1);

      // Team B should win and upgrade by 3 levels (from 5 to 8)
      expect(session.levelTeamB).toBe(8);
      // Next round's rank becomes '8' because Team B won
      expect(session.currentRank).toBe('8');
    });
  });

  describe('SettlementType Calculation Tests', () => {
    it('should calculate US_UP_3 settlement correctly for double upstream', () => {
      const session = new GameSession();
      session.initGame();
      session.finishedPlayers = [0, 2];
      (session as any).checkRoundEnd();
      expect(session.roundSettlementType).toBe('US_UP_3');
    });

    it('should calculate OPPONENT_UP_2 settlement correctly for opponent single upstream', () => {
      const session = new GameSession();
      session.initGame();
      session.finishedPlayers = [1, 0, 3];
      (session as any).checkRoundEnd();
      expect(session.roundSettlementType).toBe('OPPONENT_UP_2');
    });

    it('should calculate US_GAME_WIN settlement when Team A successfully passes A', () => {
      const session = new GameSession();
      session.initGame();
      session.levelTeamA = 14;
      session.currentRank = 'A';
      session.finishedPlayers = [0, 2, 1];
      (session as any).checkRoundEnd();
      expect(session.roundSettlementType).toBe('US_GAME_WIN');
    });

    it('should calculate US_DEGRADED when Team A fails A for the third time', () => {
      const session = new GameSession();
      session.initGame();
      session.levelTeamA = 14;
      session.currentRank = 'A';
      session.failCountTeamA = 2; // already failed twice
      session.finishedPlayers = [0, 1, 3];
      session.lastRoundFinishedPlayers = [0, 1, 3, 2];
      (session as any).checkRoundEnd();
      expect(session.roundSettlementType).toBe('US_DEGRADED');
      expect(session.levelTeamA).toBe(2);
    });
  });

  describe('Autoplay / Takeover (托管功能)', () => {
    it('should toggle takeover state and execute AI logic for player 0 immediately when enabled on their turn', () => {
      const session = new GameSession();
      session.phase = 'PLAYING';
      session.currentPlayer = 0;
      session.currentWinnerIndex = 0;
      session.lastPlay = null;

      // Mock player hands
      session.playerHands = [
        [
          { suit: 'S', rank: 'A' },
          { suit: 'D', rank: 'A' }
        ], // Player 0 (2 cards)
        [{ suit: 'S', rank: '9' }],
        [{ suit: 'S', rank: '8' }],
        [{ suit: 'S', rank: '7' }]
      ];

      expect(session.players[0].isAI).toBe(false);

      // Enable takeover/autoplay
      session.enableAutoPlay();

      // Check takeover state
      expect(session.players[0].isAI).toBe(true);

      // Verify Player 0 automatically played cards (should have led with smallest card, or A since we have two Aces)
      // Since it is first play, AI chooses to play. Here the hand has two Aces (A and A), which is a pair of Aces.
      // Hand: S-A, D-A. It should play the pair of Aces.
      expect(session.lastPlay).not.toBeNull();
      expect((session.lastPlay as any)?.playerIndex).toBe(0);
      expect(session.playerHands[0].length).toBe(0); // All cards played
    });

    it('should automatically process return when takeover is enabled during waiting return', () => {
      vi.useFakeTimers();
      const session = new GameSession();
      session.levelTeamA = 3;
      session.lastRoundFinishedPlayers = [0, 1, 2, 3]; // Player 0 is receiver, Player 3 is payer

      session.playerHands = [
        [
          { suit: 'S', rank: 'A' },
          { suit: 'D', rank: '5' }
        ], // Player 0 (needs to return card <= 10)
        [{ suit: 'S', rank: '9' }],
        [{ suit: 'S', rank: '8' }],
        [{ suit: 'S', rank: 'K' }] // Player 3
      ];

      // Step 1: Trigger tribute phase. Payer 3 (AI) pays K to Player 0.
      session.checkTribute();
      vi.advanceTimersByTime(1200);

      // Now Player 0 is waiting to return card.
      expect(session.tributeInfo?.status).toBe('WAITING_RETURN');
      expect(session.players[0].isAI).toBe(false);

      // Enable takeover/autoplay
      session.enableAutoPlay();

      // Player 0 should automatically return '5' (the only card <= 10)
      expect(session.players[0].isAI).toBe(true);
      expect(session.playerHands[0].some((c) => c.rank === '5')).toBe(false);
      expect(session.playerHands[3].some((c) => c.rank === '5')).toBe(true);

      vi.useRealTimers();
    });

    it('should reset takeover state (isAI = false) when startNextRound is called', () => {
      const session = new GameSession();
      session.initGame();
      session.players[0].isAI = true;

      // Finish the round
      session.finishedPlayers = [0, 2];
      const ended = (session as any).checkRoundEnd();
      expect(ended).toBe(true);

      // Start next round
      session.startNextRound();

      // Takeover state should be reset
      expect(session.players[0].isAI).toBe(false);
    });

    it('should correctly upgrade from Q to A without triggering A-rank resolve and resetting to level 2', () => {
      const session = new GameSession();
      session.initGame();

      // Setup state: we are currently playing Q (level 12)
      session.levelTeamA = 12;
      session.currentRank = 'Q';

      // We win with double upstream (upgrade 3 levels)
      session.finishedPlayers = [0, 2]; // Team A got 1st and 2nd

      // End the round: levelTeamA will be upgraded from 12 to 15 (capped to 14, i.e., A)
      const ended = (session as any).checkRoundEnd();
      expect(ended).toBe(true);
      expect(session.levelTeamA).toBe(14);
      // Under the fix, currentRank should still be 'Q' at this point (end of round)
      expect(session.currentRank).toBe('Q');

      // Start the next round: this is where the previous bug triggered,
      // because currentRank was incorrectly 'A', prompting A-rank success check and resetting to 2.
      // Now it should NOT trigger the A-rank check, because currentRank of completed round was 'Q'.
      session.startNextRound();

      // Assert that we did not get reset to level 2! We should be playing A (14) now.
      expect(session.levelTeamA).toBe(14);
      expect(session.currentRank).toBe('A');
      expect(session.failCountTeamA).toBe(0);
    });

    it('should correctly upgrade from J to A with 3 levels upgrade without triggering A-rank resolve and resetting to level 2', () => {
      const session = new GameSession();
      session.initGame();

      // Setup state: we are currently playing J (level 11)
      session.levelTeamA = 11;
      session.currentRank = 'J';

      // We win with double upstream (upgrade 3 levels)
      session.finishedPlayers = [0, 2];

      const ended = (session as any).checkRoundEnd();
      expect(ended).toBe(true);
      expect(session.levelTeamA).toBe(14); // 11 + 3 = 14 (A)
      expect(session.currentRank).toBe('J');

      session.startNextRound();

      expect(session.levelTeamA).toBe(14);
      expect(session.currentRank).toBe('A');
      expect(session.failCountTeamA).toBe(0);
    });

    it('should correctly upgrade from K to A with 2 levels upgrade without triggering A-rank resolve and resetting to level 2', () => {
      const session = new GameSession();
      session.initGame();

      // Setup state: we are currently playing K (level 13)
      session.levelTeamA = 13;
      session.currentRank = 'K';

      // We win with 2 levels upgrade (1st and 3rd)
      session.finishedPlayers = [0, 2, 1];

      const ended = (session as any).checkRoundEnd();
      expect(ended).toBe(true);
      expect(session.levelTeamA).toBe(14); // 13 + 2 = 15 -> capped to 14 (A)
      expect(session.currentRank).toBe('K');

      session.startNextRound();

      expect(session.levelTeamA).toBe(14);
      expect(session.currentRank).toBe('A');
      expect(session.failCountTeamA).toBe(0);
    });
  });

  describe('Remaining Cards Log on Round End (单局结束未出完手牌日志)', () => {
    it('should correctly format and record remaining cards when round ends', () => {
      const session = new GameSession();
      session.initGame();

      // Mock player hands: Player 0 and Player 2 finished (0 cards), Player 1 has 2 cards, Player 3 has 1 card
      session.playerHands = [
        [],
        [
          { suit: 'H', rank: 'A' },
          { suit: 'S', rank: '10' }
        ],
        [],
        [{ suit: 'J', rank: 'red_joker' }]
      ];
      session.finishedPlayers = [0, 2];

      let emittedLogs: any = null;
      let emittedSummary = '';
      session.on('remaining_cards_logged', (logs, summary) => {
        emittedLogs = logs;
        emittedSummary = summary;
      });

      // Trigger endRound (Team A wins)
      (session as any).endRound(0);

      // 1. Verify session property remainingCardsLogs
      expect(session.remainingCardsLogs).toHaveLength(4);

      // Player 0 (Finished)
      expect(session.remainingCardsLogs[0].playerIndex).toBe(0);
      expect(session.remainingCardsLogs[0].cardCount).toBe(0);
      expect(session.remainingCardsLogs[0].formattedCards).toBe('已出完');

      // Player 1 (Unfinished)
      expect(session.remainingCardsLogs[1].playerIndex).toBe(1);
      expect(session.remainingCardsLogs[1].cardCount).toBe(2);
      expect(session.remainingCardsLogs[1].formattedCards).toBe('红桃A, 黑桃10');

      // Player 2 (Finished)
      expect(session.remainingCardsLogs[2].playerIndex).toBe(2);
      expect(session.remainingCardsLogs[2].cardCount).toBe(0);
      expect(session.remainingCardsLogs[2].formattedCards).toBe('已出完');

      // Player 3 (Unfinished)
      expect(session.remainingCardsLogs[3].playerIndex).toBe(3);
      expect(session.remainingCardsLogs[3].cardCount).toBe(1);
      expect(session.remainingCardsLogs[3].formattedCards).toBe('大王');

      // 2. Verify event payload
      expect(emittedLogs).toEqual(session.remainingCardsLogs);
      expect(emittedSummary).toContain('【单局结算 - 各玩家未出完手牌】');
      expect(emittedSummary).toContain('已出完');
      expect(emittedSummary).toContain('红桃A, 黑桃10');
      expect(emittedSummary).toContain('大王');
    });

    it('should reset remainingCardsLogs when starting a new game', () => {
      const session = new GameSession();
      session.initGame();
      session.playerHands = [[], [{ suit: 'C', rank: '5' }], [], []];
      session.finishedPlayers = [0, 2, 3];
      (session as any).endRound(0);

      expect(session.remainingCardsLogs).toHaveLength(4);

      // Re-init game
      session.initGame();
      expect(session.remainingCardsLogs).toEqual([]);
    });
  });

  describe('Wind-Following (接风校验) & Tribute Bounds Protection (进退贡越界保护)', () => {
    it('should grant lead to partner when winner has 0 cards and partner has >0 cards', () => {
      const session = new GameSession();
      session.phase = 'PLAYING';
      session.currentWinnerIndex = 0; // Player 0 played winning cards
      session.playerHands = [
        [], // Player 0 finished (0 cards)
        [{ suit: 'S', rank: '5' }], // Player 1 (opponent 1)
        [{ suit: 'S', rank: '9' }], // Player 2 (partner, >0 cards)
        [{ suit: 'S', rank: 'J' }] // Player 3 (opponent 2)
      ];
      session.lastPlay = { type: 'SINGLE', power: 14, cardCount: 1, playerIndex: 0 };
      session.currentPlayer = 0;

      // Pass 3 times (Player 1 passes, Player 2 passes, Player 3 passes)
      session.passTurn(); // currentPlayer was 0 -> moves to 1, passCount=1
      session.passTurn(); // moves to 2, passCount=2
      session.passTurn(); // moves to 3, passCount=3 -> triggers trick_ended and wind-following

      // Partner (Player 2) has cards left, so partner gets lead
      expect(session.currentPlayer).toBe(2);
      expect(session.currentWinnerIndex).toBe(2);
    });

    it('should grant lead to next active opponent when winner has 0 cards and partner ALSO has 0 cards', () => {
      const session = new GameSession();
      session.phase = 'PLAYING';
      session.currentWinnerIndex = 0; // Player 0 played winning cards
      session.playerHands = [
        [], // Player 0 finished (0 cards)
        [{ suit: 'S', rank: '5' }], // Player 1 (opponent 1, >0 cards)
        [], // Player 2 (partner, ALSO 0 cards)
        [{ suit: 'S', rank: 'J' }] // Player 3 (opponent 2)
      ];
      session.lastPlay = { type: 'SINGLE', power: 14, cardCount: 1, playerIndex: 0 };
      session.currentPlayer = 0;

      // Pass turns until 3 passes happen
      session.passTurn(); // Player 1 passes
      session.passTurn(); // Player 3 passes
      session.passTurn(); // 3rd pass triggers trick_ended

      // Since partner (Player 2) has 0 cards, lead goes to Player 1 (next active opponent)
      expect(session.currentPlayer).toBe(1);
      expect(session.currentWinnerIndex).toBe(1);
    });

    it('should safely protect against out-of-bounds index in tribute and return phase', () => {
      const session = new GameSession();
      session.phase = 'TRIBUTE';
      session.tributeInfo = {
        payers: [3],
        receivers: [0],
        isDouble: false,
        paidCards: [],
        status: 'WAITING_TRIBUTE',
        index: 999 // Out of bounds index
      };

      // Calling processNextTribute with out of bounds index should transition to WAITING_RETURN without crashing
      (session as any).processNextTribute();
      expect(session.tributeInfo.status).toBe('WAITING_RETURN');
      expect(session.tributeInfo.index).toBe(0);

      // Now set index out of bounds for return
      session.tributeInfo.index = 999;
      (session as any).processNextReturn();
      // Should end tribute phase without crashing
      expect(session.phase).toBe('PLAYING');

      // Test submitTributeCard out of bounds
      session.phase = 'TRIBUTE';
      session.tributeInfo = {
        payers: [3],
        receivers: [0],
        isDouble: false,
        paidCards: [],
        status: 'WAITING_TRIBUTE',
        index: -1 // Out of bounds negative index
      };
      expect(() => session.submitTributeCard({ suit: 'S', rank: 'A' })).not.toThrow();
    });
  });

  describe('TDD Advanced Session & Flow Tests', () => {
    it('should assign larger tribute card to 1st place, smaller to 2nd place in double tribute, and starting player to largest tribute payer', () => {
      vi.useFakeTimers();
      const session = new GameSession();
      session.levelTeamA = 2;
      session.lastRoundFinishedPlayers = [1, 3, 0, 2]; // Opponents 1st & 2nd, Team A 3rd (P0) & 4th (P2) -> Double Tribute

      // P0 has A, P2 has K
      session.playerHands = [
        [{ suit: 'S', rank: 'A' }], // P0 (payer 1)
        [{ suit: 'S', rank: '5' }], // P1 (receiver 1st)
        [{ suit: 'S', rank: 'K' }], // P2 (payer 2)
        [{ suit: 'S', rank: '4' }] // P3 (receiver 2nd)
      ];

      // P0 and P2 are AI players so they process tribute automatically
      session.players[0].isAI = true;
      session.players[2].isAI = true;

      session.checkTribute();

      expect(session.phase).toBe('TRIBUTE');
      expect(session.tributeInfo?.isDouble).toBe(true);

      // Fast forward AI tribute and return processing to finish tribute phase
      vi.advanceTimersByTime(5000);

      // P0's Spades A (larger) should go to P1 (1st place), P2's Spades K (smaller) should go to P3 (2nd place)
      expect(session.playerHands[1].some((c) => c.suit === 'S' && c.rank === 'A')).toBe(true);
      expect(session.playerHands[3].some((c) => c.suit === 'S' && c.rank === 'K')).toBe(true);

      // Starting player should be P0 because P0 paid the largest tribute card (Spades A > Spades K)
      expect(session.tributeInfo?.startingPlayer).toBe(0);

      vi.useRealTimers();
    });

    it('should trigger tribute resistance when a single tribute payer holds two Red Jokers', () => {
      const session = new GameSession();
      session.levelTeamA = 2;
      session.lastRoundFinishedPlayers = [1, 2, 3, 0]; // Single tribute: P0 is payer

      session.playerHands = [
        [
          { suit: 'H', rank: 'red_joker' },
          { suit: 'H', rank: 'red_joker' },
          { suit: 'S', rank: '5' }
        ], // P0 has 2 Red Jokers
        [{ suit: 'S', rank: '3' }],
        [{ suit: 'S', rank: '4' }],
        [{ suit: 'S', rank: '6' }]
      ];

      let resisted = false;
      session.on('tribute_resisted', () => {
        resisted = true;
      });

      session.checkTribute();

      expect(resisted).toBe(true);
      expect(session.phase).toBe('PLAYING');
    });

    it('should trigger joint tribute resistance when two payers each hold one Red Joker in double tribute', () => {
      const session = new GameSession();
      session.levelTeamA = 2;
      session.lastRoundFinishedPlayers = [1, 3, 0, 2]; // Double tribute: P0 & P2 payers

      session.playerHands = [
        [
          { suit: 'H', rank: 'red_joker' },
          { suit: 'S', rank: '5' }
        ], // P0 has 1 Red Joker
        [{ suit: 'S', rank: '3' }],
        [
          { suit: 'H', rank: 'red_joker' },
          { suit: 'S', rank: '6' }
        ], // P2 has 1 Red Joker
        [{ suit: 'S', rank: '4' }]
      ];

      let resisted = false;
      session.on('tribute_resisted', () => {
        resisted = true;
      });

      session.checkTribute();

      expect(resisted).toBe(true);
      expect(session.phase).toBe('PLAYING');
    });

    it('should filter eligible return cards to only <= 10 and non-wildcard cards during return phase', () => {
      const session = new GameSession();
      session.currentRank = '2'; // Wildcard is Heart 2

      // Player hand contains A, K, 10, 5, and Heart 2 (Wildcard)
      session.playerHands[0] = [
        { suit: 'S', rank: 'A' },
        { suit: 'S', rank: 'K' },
        { suit: 'S', rank: '10' },
        { suit: 'S', rank: '5' },
        { suit: 'H', rank: '2' } // Wildcard! Must NOT be eligible for return
      ];

      session.tributeInfo = {
        payers: [3],
        receivers: [0],
        isDouble: false,
        paidCards: [{ suit: 'S', rank: 'K' }],
        status: 'WAITING_RETURN',
        index: 0
      };

      let eligibleReturnCards: Card[] = [];
      session.on('return_required', (_, eligible) => {
        eligibleReturnCards = eligible;
      });

      // Trigger return prompt for player 0
      (session as any).processNextReturn();

      // Eligible cards must ONLY be 10 and 5 (A, K, and Heart 2 Wildcard excluded)
      expect(eligibleReturnCards.length).toBe(2);
      expect(eligibleReturnCards.some((c) => c.rank === '10')).toBe(true);
      expect(eligibleReturnCards.some((c) => c.rank === '5')).toBe(true);
      expect(eligibleReturnCards.some((c) => c.rank === 'A')).toBe(false);
      expect(eligibleReturnCards.some((c) => c.rank === 'K')).toBe(false);
      expect(eligibleReturnCards.some((c) => c.suit === 'H' && c.rank === '2')).toBe(false);
    });

    it('should transfer turn to partner when player finishes hand and remaining players pass (pickup)', () => {
      const session = new GameSession();
      session.phase = 'PLAYING';
      session.currentPlayer = 0;
      session.playerHands = [
        [{ suit: 'S', rank: 'A' }], // P0 has 1 card left
        [{ suit: 'S', rank: '5' }], // P1
        [{ suit: 'S', rank: '10' }], // P2 (partner)
        [{ suit: 'S', rank: '6' }] // P3
      ];

      // P0 plays last card and finishes
      session.playCards([{ suit: 'S', rank: 'A' }]);
      expect(session.finishedPlayers).toContain(0);
      expect(session.playerHands[0].length).toBe(0);

      // Remaining players (P1, P2, P3) pass
      session.passTurn(); // P1 pass
      session.passTurn(); // P2 pass
      session.passTurn(); // P3 pass -> trick ends

      // Turn should automatically transfer to P0's partner (P2)
      expect(session.currentPlayer).toBe(2);
      expect(session.currentWinnerIndex).toBe(2);
    });

    it('should safely skip finished partner when picking up turn and assign lead to next active player', () => {
      const session = new GameSession();
      session.phase = 'PLAYING';
      session.currentPlayer = 0;
      session.playerHands = [
        [{ suit: 'S', rank: 'A' }], // P0 (Team A) has 1 card left
        [], // P1 (opponent 1, ALREADY finished 1st!)
        [], // P2 (partner, ALREADY finished 2nd!)
        [{ suit: 'S', rank: '6' }] // P3 (opponent 2)
      ];
      session.finishedPlayers = [1, 2]; // P1 finished 1st, P2 finished 2nd

      // P0 plays last card and finishes 3rd, leaving P3 as the 4th (last) place
      session.playCards([{ suit: 'S', rank: 'A' }]);

      // Since 3 players (P1, P2, P0) have finished, the round automatically completes (ROUND_END)
      expect(session.finishedPlayers).toEqual([1, 2, 0]);
      expect(session.phase).toBe('ROUND_END');
    });

    it('should handle OVER_A_SUCCESS when Team A wins 1st place and partner is not last place on rank A', () => {
      const session = new GameSession();
      session.levelTeamA = 14; // Rank A
      session.currentRank = 'A';
      session.finishedPlayers = [0, 1, 2, 3]; // P0 1st, P2 3rd (not last)

      (session as any).checkRoundEnd();

      expect(session.roundSettlementType).toBe('US_GAME_WIN');
    });

    it('should demote levelTeamA to 2 after 3 consecutive failures at rank A', () => {
      const session = new GameSession();
      session.levelTeamA = 14; // Rank A
      session.failCountTeamA = 2; // Already failed twice

      // Fail for the 3rd time (opponents 1st & 2nd -> double downfall)
      session.finishedPlayers = [1, 3, 0, 2];

      (session as any).checkRoundEnd();

      // failCount reaches 3 -> should reset level to 2 and clear failCount
      expect(session.levelTeamA).toBe(2);
      expect(session.failCountTeamA).toBe(0);
    });
  });
});
