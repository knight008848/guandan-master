/**
 * types.ts - 掼蛋大师 类型定义
 */

export type Suit = 'H' | 'D' | 'C' | 'S' | 'J'; // H:红桃, D:方块, C:梅花, S:黑桃, J:王牌

export interface Card {
  suit: Suit;
  rank: string; // '2'..'A', 'black_joker', 'red_joker'
  isSubstituted?: boolean; // 是否是作为逢人配被替换后的虚拟牌
  original?: Card;         // 被替换前的原始牌（红心主牌）
}

export type HandType =
  | 'INVALID'
  | 'SINGLE'
  | 'PAIR'
  | 'THREE'
  | 'THREE_TWO'
  | 'STRAIGHT'
  | 'DOUBLE_STRAIGHT'
  | 'STEEL_PLATE'
  | 'BOMB';

export interface Combo {
  type: HandType;
  power: number;
  cardCount: number;
  name?: string;
  wildRepresent?: Card[]; // 逢人配在此组合中代表的具体牌
}

export interface Player {
  name: string;
  avatar: string;
  isAI: boolean;
}

export type GamePhase = 'DEALING' | 'TRIBUTE' | 'PLAYING' | 'ROUND_END';

export interface PlayRecord {
  type: HandType;
  power: number;
  cardCount: number;
  playerIndex: number;
}

export interface PlayerStateView {
  hand: Card[];
  lastPlay: PlayRecord | null;
  currentRank: string;
  myIndex: number;
  currentWinnerIndex: number;
  opponentCardCounts: number[];
}

export interface TributeInfo {
  payers: number[];
  receivers: number[];
  isDouble: boolean;
  paidCards: Array<{ payer: number; receiver: number; card: Card }>;
  status: 'WAITING_TRIBUTE' | 'WAITING_RETURN';
  index: number;
}

export type SettlementType =
  | 'US_GAME_WIN'
  | 'OPPONENT_GAME_WIN'
  | 'US_DEGRADED'
  | 'OPPONENT_DEGRADED'
  | 'US_UP_3'
  | 'US_UP_2'
  | 'US_UP_1'
  | 'OPPONENT_UP_3'
  | 'OPPONENT_UP_2'
  | 'OPPONENT_UP_1'
  | 'US_FAIL_A'
  | 'OPPONENT_FAIL_A';

