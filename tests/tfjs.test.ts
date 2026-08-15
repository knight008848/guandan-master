import { describe, it, expect, beforeEach } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { Card, PlayerStateView } from '../src/types';
import {
  encodeStateView,
  encodeAction,
  cardToVectorIndex,
  STATE_VECTOR_SIZE,
  ACTION_VECTOR_SIZE
} from '../src/ai/tfjs_encoder';
import { TFJSGuandanAgent } from '../src/ai/tfjs_agent';
import { aiChoosePlay } from '../src/ai/index';

describe('TensorFlow.js AI State Vector & Encoder Tests', () => {
  it('should encode card to accurate vector index', () => {
    // 2-A: 13 ranks * 4 suits = 52 indices (0-51)
    const card2H: Card = { suit: 'H', rank: '2' }; // 0*4 + 0 = 0
    const card2S: Card = { suit: 'S', rank: '2' }; // 0*4 + 3 = 3
    const cardAH: Card = { suit: 'H', rank: 'A' }; // 12*4 + 0 = 48
    const cardAS: Card = { suit: 'S', rank: 'A' }; // 12*4 + 3 = 51
    const blackJoker: Card = { suit: 'J', rank: 'black_joker' }; // 52
    const redJoker: Card = { suit: 'J', rank: 'red_joker' }; // 53

    expect(cardToVectorIndex(card2H)).toBe(0);
    expect(cardToVectorIndex(card2S)).toBe(3);
    expect(cardToVectorIndex(cardAH)).toBe(48);
    expect(cardToVectorIndex(cardAS)).toBe(51);
    expect(cardToVectorIndex(blackJoker)).toBe(52);
    expect(cardToVectorIndex(redJoker)).toBe(53);
  });

  it('should encode PlayerStateView into exactly 540-dimensional Float32Array', () => {
    const view: PlayerStateView = {
      hand: [
        { suit: 'H', rank: '2' },
        { suit: 'S', rank: '2' },
        { suit: 'H', rank: '5' }, // 逢人配 (currentRank = 5)
        { suit: 'J', rank: 'red_joker' }
      ],
      lastPlay: {
        type: 'SINGLE',
        power: 10,
        cardCount: 1,
        playerIndex: 1
      },
      currentRank: '5',
      myIndex: 0,
      currentWinnerIndex: 1,
      opponentCardCounts: [27, 26, 25, 24]
    };

    const stateVector = encodeStateView(view);
    expect(stateVector.length).toBe(STATE_VECTOR_SIZE);
    expect(stateVector).toBeInstanceOf(Float32Array);

    // Hand vector assertions
    expect(stateVector[0]).toBe(1.0); // 2 of Hearts
    expect(stateVector[3]).toBe(1.0); // 2 of Spades
    expect(stateVector[53]).toBe(1.0); // Red Joker

    // Wildcard section assertion (index 54 + idx)
    const idx5H = cardToVectorIndex({ suit: 'H', rank: '5' });
    expect(stateVector[54 + idx5H]).toBe(1.0);

    // Last play assertion
    expect(stateVector[108]).toBe(1); // SINGLE type
    expect(stateVector[109]).toBe(10); // power
    expect(stateVector[110]).toBe(1); // cardCount
    expect(stateVector[111]).toBe(1); // playerIndex

    // Opponent ratio assertion
    expect(stateVector[162]).toBeCloseTo(27 / 27);
    expect(stateVector[163]).toBeCloseTo(26 / 27);

    // Current Rank One-Hot assertion (5 is rank idx 3 -> index 198 + 3 = 201)
    expect(stateVector[201]).toBe(1.0);
  });

  it('should encode action into 54-dimensional Float32Array', () => {
    const actionCards: Card[] = [
      { suit: 'H', rank: 'A' },
      { suit: 'S', rank: 'A' }
    ];

    const actionVector = encodeAction(actionCards);
    expect(actionVector.length).toBe(ACTION_VECTOR_SIZE);
    expect(actionVector[48]).toBe(1.0); // Heart A
    expect(actionVector[51]).toBe(1.0); // Spade A

    // Null action (PASS) should be all zeros
    const passVector = encodeAction(null);
    expect(passVector.length).toBe(ACTION_VECTOR_SIZE);
    expect(passVector.every((v) => v === 0)).toBe(true);
  });
});

describe('TFJSGuandanAgent Lifecycle & Decision Engine Tests', () => {
  let agent: TFJSGuandanAgent;

  beforeEach(async () => {
    agent = new TFJSGuandanAgent();
    await agent.init();
  });

  it('should initialize successfully with builtin MLP model (Tier 2)', () => {
    expect(agent.getActiveTier()).toBe('TIER_2_BUILTIN_MLP');
  });

  it('should evaluate candidate actions and select the optimal play', () => {
    const view: PlayerStateView = {
      hand: [
        { suit: 'H', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'S', rank: 'K' },
        { suit: 'J', rank: 'red_joker' }
      ],
      lastPlay: {
        type: 'SINGLE',
        power: 12, // Opponent played Q
        cardCount: 1,
        playerIndex: 1
      },
      currentRank: '2',
      myIndex: 0,
      currentWinnerIndex: 1,
      opponentCardCounts: [4, 10, 10, 10]
    };

    const candidates: (Card[] | null)[] = [
      [{ suit: 'S', rank: 'K' }], // Play King to beat Q
      [{ suit: 'J', rank: 'red_joker' }], // Play Red Joker
      null // Pass
    ];

    const result = agent.evaluateActions(view, candidates);
    expect(result).toBeDefined();
    expect(result.scores.length).toBe(3);
    expect(result.usedTier).toBe('TIER_2_BUILTIN_MLP');
    expect(candidates).toContainEqual(result.bestAction);
  });

  it('should fallback gracefully to Tier 3 heuristic when model execution is interrupted', () => {
    const uninitializedAgent = new TFJSGuandanAgent();
    // Intentionally NOT calling init()
    const view: PlayerStateView = {
      hand: [{ suit: 'H', rank: '2' }],
      lastPlay: null,
      currentRank: '2',
      myIndex: 0,
      currentWinnerIndex: 0,
      opponentCardCounts: [1, 5, 5, 5]
    };

    const result = uninitializedAgent.evaluateActions(view, [[{ suit: 'H', rank: '2' }], null]);
    expect(result.usedTier).toBe('TIER_3_HEURISTIC_FALLBACK');
    expect(result.bestAction).toEqual([{ suit: 'H', rank: '2' }]);
  });

  it('should NOT leak GPU/CPU Tensors during inference (tf.tidy memory safety check)', () => {
    const initialTensors = tf.memory().numTensors;

    const view: PlayerStateView = {
      hand: [
        { suit: 'H', rank: '8' },
        { suit: 'D', rank: '8' }
      ],
      lastPlay: null,
      currentRank: '2',
      myIndex: 0,
      currentWinnerIndex: 0,
      opponentCardCounts: [2, 5, 5, 5]
    };

    // Run multiple evaluations in loop
    for (let i = 0; i < 20; i++) {
      agent.evaluateActions(view, [
        [
          { suit: 'H', rank: '8' },
          { suit: 'D', rank: '8' }
        ],
        [{ suit: 'H', rank: '8' }],
        null
      ]);
    }

    const finalTensors = tf.memory().numTensors;
    expect(finalTensors).toBe(initialTensors);
  });

  it('should integrate with aiChoosePlay with algorithm selector option', () => {
    const view: PlayerStateView = {
      hand: [
        { suit: 'H', rank: '3' },
        { suit: 'D', rank: '3' },
        { suit: 'S', rank: '5' }
      ],
      lastPlay: null,
      currentRank: '2',
      myIndex: 0,
      currentWinnerIndex: 0,
      opponentCardCounts: [3, 10, 10, 10]
    };

    // Default call (backward compatible)
    const playDefault = aiChoosePlay(view);
    expect(playDefault).toBeDefined();

    // Explicit tfjs call
    const playTFJS = aiChoosePlay(view, 'tfjs');
    expect(playTFJS).toBeDefined();
  });
});
