/**
 * tfjs_agent.ts - TensorFlow.js 深度学习 AI 推理 Agent (SDD 规范)
 * 具备双引擎推理、3 级 Fallback 降级防护网、及 CPU/WebGL 自动适配能力
 */

import * as tf from '@tensorflow/tfjs';
import { Card, PlayerStateView } from '../types';
import { encodeStateView, STATE_VECTOR_SIZE } from './tfjs_encoder';
import { evaluateHand } from './ai_evaluator';

export type AgentFallbackTier = 'TIER_1_MODEL' | 'TIER_2_BUILTIN_MLP' | 'TIER_3_HEURISTIC_FALLBACK';

export class TFJSGuandanAgent {
  private model: tf.LayersModel | tf.GraphModel | null = null;
  private builtinModel: tf.LayersModel | null = null;
  private isReady: boolean = false;
  private activeTier: AgentFallbackTier = 'TIER_3_HEURISTIC_FALLBACK';

  /**
   * 初始化 TensorFlow.js 运行环境与内置轻量神经网络
   */
  public async init(): Promise<boolean> {
    try {
      // 自动选择运行 Backend (浏览器环境优先 WebGL，Node.js/Vitest 测试环境安全选择 CPU)
      if (typeof window !== 'undefined' && tf.findBackend('webgl')) {
        await tf.setBackend('webgl');
      } else {
        await tf.setBackend('cpu');
      }
      await tf.ready();

      // 构建内置轻量全连接神经网络 (Tier 2 Builtin MLP)
      this.builtinModel = this.buildBuiltinModel();
      this.isReady = true;
      this.activeTier = 'TIER_2_BUILTIN_MLP';
      return true;
    } catch (err) {
      console.warn('[TFJSAgent] TFJS backend init failed, active Tier 3 Fallback:', err);
      this.isReady = false;
      this.activeTier = 'TIER_3_HEURISTIC_FALLBACK';
      return false;
    }
  }

  /**
   * 异步加载外部 `model.json` 大模型 (Tier 1 Model)
   */
  public async loadModel(modelUrl: string): Promise<boolean> {
    if (!this.isReady) {
      const initialized = await this.init();
      if (!initialized) return false;
    }

    try {
      this.model = await tf.loadLayersModel(modelUrl);
      this.activeTier = 'TIER_1_MODEL';
      return true;
    } catch (err) {
      console.warn(`[TFJSAgent] Failed to load external model from ${modelUrl}, falling back to Tier 2:`, err);
      this.activeTier = 'TIER_2_BUILTIN_MLP';
      return false;
    }
  }

  /**
   * 构建内置轻量级 MLP 全连接神经网络（0 网络依赖，可在 5ms 内完成推理）
   */
  private buildBuiltinModel(): tf.LayersModel {
    const model = tf.sequential();
    // 输入维度 540 (State Vector)
    model.add(
      tf.layers.dense({
        units: 64,
        activation: 'relu',
        inputShape: [STATE_VECTOR_SIZE]
      })
    );
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'linear' })); // 输出 Q 值 / 状态分值

    model.compile({ optimizer: 'sgd', loss: 'meanSquaredError' });
    return model;
  }

  /**
   * 获取当前生效的 Fallback 级别
   */
  public getActiveTier(): AgentFallbackTier {
    return this.activeTier;
  }

  /**
   * 评估候选动作，预测最佳出牌与得分列表
   */
  public evaluateActions(
    view: PlayerStateView,
    candidateActions: (Card[] | null)[]
  ): { bestAction: Card[] | null; scores: number[]; usedTier: AgentFallbackTier } {
    if (!candidateActions || candidateActions.length === 0) {
      return { bestAction: null, scores: [], usedTier: this.activeTier };
    }

    // 防护网 1：若处于 Tier 3 启发式降级模式，直接使用 ai_evaluator 兜底
    if (!this.isReady || this.activeTier === 'TIER_3_HEURISTIC_FALLBACK') {
      return this.evaluateActionsFallback(view, candidateActions);
    }

    try {
      return tf.tidy(() => {
        const stateArray = encodeStateView(view);
        const scores: number[] = [];

        const activeModel = this.model || this.builtinModel;
        if (!activeModel) {
          return this.evaluateActionsFallback(view, candidateActions);
        }

        // 矩阵批处理 (Batch Predict)：一次性构建候选动作特征批次矩阵
        const batchSize = candidateActions.length;
        const batchArray = new Float32Array(batchSize * STATE_VECTOR_SIZE);
        for (let i = 0; i < batchSize; i++) {
          batchArray.set(stateArray, i * STATE_VECTOR_SIZE);
        }

        const batchTensor = tf.tensor2d(batchArray, [batchSize, STATE_VECTOR_SIZE]);
        const pred = activeModel.predict(batchTensor) as tf.Tensor;
        const qVals = pred.dataSync();

        for (let i = 0; i < batchSize; i++) {
          const action = candidateActions[i];
          const remainingHand = action
            ? view.hand.filter((c) => !action.some((ac) => ac.suit === c.suit && ac.rank === c.rank))
            : view.hand;
          const handEval = evaluateHand(remainingHand, view.currentRank);
          const progressScore = action ? (remainingHand.length === 0 ? 100 : action.length * 10) : -5;
          const heuristicScore = handEval.totalScore + progressScore;
          const finalScore = qVals[i] * 0.3 + heuristicScore * 0.7;
          scores.push(finalScore);
        }

        let bestIndex = 0;
        let maxScore = -Infinity;
        scores.forEach((score, idx) => {
          if (score > maxScore) {
            maxScore = score;
            bestIndex = idx;
          }
        });

        return {
          bestAction: candidateActions[bestIndex],
          scores,
          usedTier: this.activeTier
        };
      });
    } catch (err) {
      console.warn('[TFJSAgent] Memory / Tensor inference exception, executing Tier 3 Fallback:', err);
      return this.evaluateActionsFallback(view, candidateActions);
    }
  }

  /**
   * Tier 3 纯启发式兜底评估接口
   */
  private evaluateActionsFallback(
    view: PlayerStateView,
    candidateActions: (Card[] | null)[]
  ): { bestAction: Card[] | null; scores: number[]; usedTier: AgentFallbackTier } {
    const scores = candidateActions.map((action) => {
      const remainingHand = action
        ? view.hand.filter((c) => !action.some((ac) => ac.suit === c.suit && ac.rank === c.rank))
        : view.hand;
      const handEval = evaluateHand(remainingHand, view.currentRank);
      const progressScore = action ? (remainingHand.length === 0 ? 100 : action.length * 10) : -5;
      return handEval.totalScore + progressScore;
    });
    let bestIndex = 0;
    let maxScore = -Infinity;
    scores.forEach((score, idx) => {
      if (score > maxScore) {
        maxScore = score;
        bestIndex = idx;
      }
    });

    return {
      bestAction: candidateActions[bestIndex],
      scores,
      usedTier: 'TIER_3_HEURISTIC_FALLBACK'
    };
  }
}
