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
        [{ suit: 'S', rank: 'A' }, { suit: 'D', rank: '10' }, { suit: 'C', rank: '5' }], // Player 0 (receiver)
        [{ suit: 'S', rank: '9' }],
        [{ suit: 'S', rank: '8' }],
        [{ suit: 'S', rank: 'K' }, { suit: 'D', rank: '4' }] // Player 3 (payer, AI)
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
      expect(session.playerHands[0].some(c => c.suit === 'S' && c.rank === 'K')).toBe(true);
      expect(session.playerHands[3].some(c => c.suit === 'S' && c.rank === 'K')).toBe(false);

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
      expect(session.playerHands[3].some(c => c.rank === '5')).toBe(true);
      expect(session.playerHands[0].some(c => c.rank === '5')).toBe(false);

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
        [{ suit: 'S', rank: 'A' }]  // player 3 (last, largest card is Ace, weight 14)
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
    it('should trigger anti-tribute when losers hold 2 red jokers', () => {
      const session = new GameSession();
      session.levelTeamA = 3;
      session.lastRoundFinishedPlayers = [0, 1, 2, 3]; // Player 3 is payer

      // Player 3 holds both red jokers (since 2 decks, there are exactly 2 red jokers)
      session.playerHands = [
        [{ suit: 'S', rank: 'A' }],
        [{ suit: 'S', rank: 'Q' }],
        [{ suit: 'S', rank: 'J' }],
        [{ suit: 'J', rank: 'red_joker' }, { suit: 'J', rank: 'red_joker' }]
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
      session.startNextRound();
      expect(session.failCountTeamA).toBe(1);
      expect(session.levelTeamA).toBe(14); // Still 14
      
      // Failure 2: Team A gets 1st (0) but teammate is 4th again
      session.finishedPlayers = [0, 1, 3];
      session.lastRoundFinishedPlayers = [0, 1, 3, 2];
      session.startNextRound();
      expect(session.failCountTeamA).toBe(2);
      expect(session.levelTeamA).toBe(14);
      
      // Failure 3: Team A gets 1st (0) but teammate is 4th again
      session.finishedPlayers = [0, 1, 3];
      session.lastRoundFinishedPlayers = [0, 1, 3, 2];
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

  describe('Autoplay / Takeover (托管功能)', () => {
    it('should toggle takeover state and execute AI logic for player 0 immediately when enabled on their turn', () => {
      const session = new GameSession();
      session.phase = 'PLAYING';
      session.currentPlayer = 0;
      session.currentWinnerIndex = 0;
      session.lastPlay = null;

      // Mock player hands
      session.playerHands = [
        [{ suit: 'S', rank: 'A' }, { suit: 'D', rank: 'A' }], // Player 0 (2 cards)
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
      expect(session.lastPlay?.playerIndex).toBe(0);
      expect(session.playerHands[0].length).toBe(0); // All cards played
    });

    it('should automatically process return when takeover is enabled during waiting return', () => {
      vi.useFakeTimers();
      const session = new GameSession();
      session.levelTeamA = 3;
      session.lastRoundFinishedPlayers = [0, 1, 2, 3]; // Player 0 is receiver, Player 3 is payer

      session.playerHands = [
        [{ suit: 'S', rank: 'A' }, { suit: 'D', rank: '5' }], // Player 0 (needs to return card <= 10)
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
      expect(session.playerHands[0].some(c => c.rank === '5')).toBe(false);
      expect(session.playerHands[3].some(c => c.rank === '5')).toBe(true);

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
  });
});
