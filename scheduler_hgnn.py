"""
HGNN-R + PPO 柔性作业车间调度求解器 (动态输入版)
从 fjsp_hgnn_ppo.py 重构，支持任意规模的 FJSP 问题输入。
"""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical

torch.manual_seed(42)
np.random.seed(42)


# ═══════════════════════════════════════════════════════════════
#  FJSP 环境 — 动态输入
# ═══════════════════════════════════════════════════════════════

class FJSPEnv:
    """
    proc[job][op] = {machine_idx: processing_time, ...}
    n_jobs, n_machines 由输入推断
    """

    def __init__(self, proc, n_machines):
        self.proc = proc  # list of list of dict
        self.n_jobs = len(proc)
        self.n_ops = [len(job) for job in proc]  # ops per job (可不等长)
        self.n_machines = n_machines
        self.total_ops = sum(self.n_ops)
        self.max_ops = max(self.n_ops)

        # 构建 op_id 映射: (j, o) -> global_id
        self._op_map = {}
        idx = 0
        for j in range(self.n_jobs):
            for o in range(self.n_ops[j]):
                self._op_map[(j, o)] = idx
                idx += 1

    def op_id(self, j, o):
        return self._op_map[(j, o)]

    def reset(self):
        self.schedule = {}
        self.mach_time = [0.0] * self.n_machines
        self.job_time = [0.0] * self.n_jobs
        self.next_op = [0] * self.n_jobs
        self.done_count = 0
        return self._obs()

    def feasible(self):
        acts = []
        for j in range(self.n_jobs):
            o = self.next_op[j]
            if o >= self.n_ops[j]:
                continue
            for m, pt in self.proc[j][o].items():
                acts.append((j, o, m))
        return acts

    def step(self, action):
        j, o, m = action
        pt = self.proc[j][o][m]
        start = max(self.mach_time[m], self.job_time[j])
        end = start + pt

        self.schedule[(j, o)] = (m, start, end)
        self.mach_time[m] = end
        self.job_time[j] = end
        self.next_op[j] += 1
        self.done_count += 1

        done = (self.done_count == self.total_ops)
        makespan = max(self.mach_time) if done else 0.0
        reward = -makespan if done else 0.0
        return self._obs(), reward, done, makespan

    def _obs(self):
        MAX_T = max(50.0, max(self.mach_time) + 10) if any(t > 0 for t in self.mach_time) else 50.0
        op_f = []
        for j in range(self.n_jobs):
            for o in range(self.n_ops[j]):
                is_done = 1.0 if (j, o) in self.schedule else 0.0
                is_avail = 1.0 if o == self.next_op[j] else 0.0
                est = self.job_time[j] / MAX_T
                # 各机器加工时间 (不可用为 0)
                pts = []
                for m in range(self.n_machines):
                    if m in self.proc[j][o]:
                        pts.append(self.proc[j][o][m] / MAX_T)
                    else:
                        pts.append(0.0)
                op_f.append([is_done, is_avail, est] + pts)

        mach_f = [[self.mach_time[m] / MAX_T] for m in range(self.n_machines)]

        return (torch.tensor(op_f, dtype=torch.float32),
                torch.tensor(mach_f, dtype=torch.float32))


# ═══════════════════════════════════════════════════════════════
#  异构图构建 — 动态
# ═══════════════════════════════════════════════════════════════

def build_graphs(env):
    NT = env.total_ops
    NM = env.n_machines

    # 前序约束
    A_prec = torch.zeros(NT, NT)
    for j in range(env.n_jobs):
        for o in range(env.n_ops[j] - 1):
            A_prec[env.op_id(j, o + 1), env.op_id(j, o)] = 1.0

    # 加工资格
    A_elig = torch.zeros(NM, NT)
    for j in range(env.n_jobs):
        for o in range(env.n_ops[j]):
            for m in env.proc[j][o]:
                A_elig[m, env.op_id(j, o)] = 1.0

    # 机器全连接
    A_conj = torch.ones(NM, NM) - torch.eye(NM)

    return A_prec, A_elig, A_conj


# ═══════════════════════════════════════════════════════════════
#  HGNN-R 模型 (动态输入维度)
# ═══════════════════════════════════════════════════════════════

class RelConv(nn.Module):
    def __init__(self, d):
        super().__init__()
        self.W_src = nn.Linear(d, d, bias=False)
        self.W_self = nn.Linear(d, d, bias=False)
        self.norm = nn.LayerNorm(d)

    def forward(self, h_src, h_self, adj):
        deg = adj.sum(dim=-1, keepdim=True).clamp(min=1.0)
        agg = (adj @ self.W_src(h_src)) / deg
        return F.relu(self.norm(agg + self.W_self(h_self)))


class HGNNR(nn.Module):
    def __init__(self, op_in, mach_in=1, d=64, n_heads=4):
        super().__init__()
        self.op_enc = nn.Sequential(nn.Linear(op_in, d), nn.ReLU())
        self.mach_enc = nn.Sequential(nn.Linear(mach_in, d), nn.ReLU())
        self.conv_prec = RelConv(d)
        self.conv_m2o = RelConv(d)
        self.conv_o2m = RelConv(d)
        self.conv_m2m = RelConv(d)
        self.op_cross_attn = nn.MultiheadAttention(d, n_heads, batch_first=True, dropout=0.0)
        self.op_norm = nn.LayerNorm(d)
        self.op_ffn = nn.Sequential(nn.Linear(d, d * 2), nn.ReLU(), nn.Linear(d * 2, d))
        self.op_ffn_norm = nn.LayerNorm(d)
        self.d = d

    def forward(self, op_f, mach_f, A_prec, A_elig, A_conj):
        h_op = self.op_enc(op_f)
        h_mach = self.mach_enc(mach_f)

        h_prec = self.conv_prec(h_op, h_op, A_prec)
        h_m2o = self.conv_m2o(h_mach, h_op, A_elig.T)
        h_o2m = self.conv_o2m(h_op, h_mach, A_elig)
        h_m2m = self.conv_m2m(h_mach, h_mach, A_conj)

        views = torch.stack([h_prec, h_m2o], dim=1)
        fused, _ = self.op_cross_attn(views, views, views)
        h_op_fused = self.op_norm(fused.mean(dim=1) + h_op)
        h_op_out = self.op_ffn_norm(self.op_ffn(h_op_fused) + h_op_fused)
        h_mach_out = h_mach + h_o2m + h_m2m

        return h_op_out, h_mach_out


class ActorCritic(nn.Module):
    def __init__(self, op_in, d=64):
        super().__init__()
        self.hgnn = HGNNR(op_in=op_in, d=d)
        self.actor = nn.Sequential(
            nn.Linear(d * 2, d), nn.ReLU(),
            nn.Linear(d, d // 2), nn.ReLU(),
            nn.Linear(d // 2, 1)
        )
        self.critic = nn.Sequential(
            nn.Linear(d, d), nn.ReLU(),
            nn.Linear(d, 1)
        )

    def forward(self, op_f, mach_f, actions, env, A_prec, A_elig, A_conj):
        h_op, h_mach = self.hgnn(op_f, mach_f, A_prec, A_elig, A_conj)
        logits = []
        for j, o, m in actions:
            feat = torch.cat([h_op[env.op_id(j, o)], h_mach[m]])
            logits.append(self.actor(feat).squeeze(-1))
        logits = torch.stack(logits)
        value = self.critic(h_op.mean(dim=0))
        return logits, value


# ═══════════════════════════════════════════════════════════════
#  PPO 训练 + 求解
# ═══════════════════════════════════════════════════════════════

def solve_fjsp(proc, n_machines, n_episodes=300, lr=5e-4, gamma=0.99,
               eps_clip=0.2, entropy_coef=0.02, d=64):
    """
    求解 FJSP 问题。

    参数:
        proc: list of list of dict
              proc[j][o] = {machine_idx: processing_time, ...}
        n_machines: int, 机器总数
        n_episodes: int, 训练轮数
    返回:
        best_schedule: dict, {(j,o): (m, start, end), ...}
        best_makespan: float
    """
    env = FJSPEnv(proc, n_machines)
    A_prec, A_elig, A_conj = build_graphs(env)

    op_in = 3 + n_machines  # is_done, is_avail, est, + per-machine times
    model = ActorCritic(op_in=op_in, d=d)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    sched_lr = torch.optim.lr_scheduler.StepLR(opt, step_size=max(n_episodes // 3, 50), gamma=0.5)

    best_ms = float('inf')
    best_sched = None

    for ep in range(n_episodes):
        obs = env.reset()
        trajectory = []

        while True:
            op_f, mach_f = obs
            acts = env.feasible()
            if not acts:
                break

            with torch.no_grad():
                logits, value = model(op_f, mach_f, acts, env, A_prec, A_elig, A_conj)
            dist = Categorical(logits=logits)
            idx = dist.sample()
            lp = dist.log_prob(idx)
            action = acts[idx.item()]

            obs, reward, done, makespan = env.step(action)
            trajectory.append({
                'op_f': op_f, 'mach_f': mach_f,
                'acts': acts, 'idx': idx,
                'log_prob': lp.detach(),
                'value': value.detach().squeeze(),
                'reward': reward,
            })
            if done:
                if makespan < best_ms:
                    best_ms = makespan
                    best_sched = dict(env.schedule)
                break

        # 折扣回报
        G = 0.0
        returns = []
        for t in reversed(trajectory):
            G = t['reward'] + gamma * G
            returns.insert(0, G)
        returns = torch.tensor(returns, dtype=torch.float32)

        # PPO 更新
        p_losses, v_losses, e_losses = [], [], []
        for t, R in zip(trajectory, returns):
            logits_new, value_new = model(t['op_f'], t['mach_f'], t['acts'], env, A_prec, A_elig, A_conj)
            dist_new = Categorical(logits=logits_new)
            lp_new = dist_new.log_prob(t['idx'])
            ratio = torch.exp(lp_new - t['log_prob'])
            adv = (R - t['value']).detach()
            surr = torch.min(ratio * adv, torch.clamp(ratio, 1 - eps_clip, 1 + eps_clip) * adv)
            p_losses.append(-surr)
            v_losses.append(F.mse_loss(value_new.squeeze(), R))
            e_losses.append(-entropy_coef * dist_new.entropy())

        loss = (torch.stack(p_losses).mean()
                + 0.5 * torch.stack(v_losses).mean()
                + torch.stack(e_losses).mean())

        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        opt.step()
        sched_lr.step()

    return best_sched, best_ms
