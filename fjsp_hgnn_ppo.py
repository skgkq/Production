"""
╔══════════════════════════════════════════════════════════════════╗
║  柔性作业车间调度 (FJSP) — HGNN-R + PPO Demo                    ║
║  Flexible Job Shop Scheduling via Heterogeneous GNN + PPO        ║
║                                                                  ║
║  配置: 2个作业 × 3道工序, 3台机器                                ║
║  Config: 2 Jobs × 3 Operations each, 3 Machines                 ║
╚══════════════════════════════════════════════════════════════════╝

架构 (Architecture):
  ① 异构图建模   — 前序关系 / 资格关系 / 机器关系子图
  ② HGNN-R      — 关系特定图卷积 + 多头注意力跨关系融合
  ③ PPO          — 近端策略优化, Actor-Critic
"""

import numpy as np
import torch
import torch.nn as nn 
import torch.nn.functional as F
from torch.distributions import Categorical
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from itertools import product as iproduct
import warnings
warnings.filterwarnings("ignore")

# ── matplotlib 中文字体配置 ──────────────────────────────────
plt.rcParams['font.sans-serif'] = ['PingFang SC', 'Heiti TC', 'STHeiti', 'SimHei', 'Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False   # 正常显示负号

torch.manual_seed(42)
np.random.seed(42)

# ═══════════════════════════════════════════════════════════════
# §1  问题定义 — Processing Times
#     PROC[job, op, machine] = 加工时间, -1 = 不可用
# ═══════════════════════════════════════════════════════════════
#         M1   M2   M3
PROC = np.array([
    # Job 1
    [[ 3,   2,  -1],   # O1,1
     [-1,   4,   3],   # O1,2
     [ 2,  -1,   4]],  # O1,3
    # Job 2
    [[-1,   3,   2],   # O2,1
     [ 4,   2,  -1],   # O2,2
     [ 3,  -1,   2]],  # O2,3
], dtype=np.float32)

NJ, NO, NM = 2, 3, 3     # jobs, ops per job, machines
NT = NJ * NO              # total operations = 6

def op_id(j, o): return j * NO + o


# ═══════════════════════════════════════════════════════════════
# §2  静态异构图邻接矩阵 (Static Adjacency Matrices)
# ═══════════════════════════════════════════════════════════════
def build_graphs():
    """
    构建三类关系子图:
    1. A_prec  (NT×NT): 前序约束  O_{j,o} → O_{j,o+1}
    2. A_elig  (NM×NT): 加工资格  machine_m ↔ op_{j,o}
    3. A_conj  (NM×NM): 机器连接 (全连接, 用于机器间信息传递)
    """
    A_prec = torch.zeros(NT, NT)
    for j in range(NJ):
        for o in range(NO - 1):
            A_prec[op_id(j, o+1), op_id(j, o)] = 1.0   # 后继接收前驱消息

    A_elig = torch.zeros(NM, NT)
    for j in range(NJ):
        for o in range(NO):
            for m in range(NM):
                if PROC[j, o, m] > 0:
                    A_elig[m, op_id(j, o)] = 1.0

    A_conj = torch.ones(NM, NM) - torch.eye(NM)         # 机器间全连接 (自环除外)

    return A_prec, A_elig, A_conj

A_PREC, A_ELIG, A_CONJ = build_graphs()


# ═══════════════════════════════════════════════════════════════
# §3  FJSP 环境
# ═══════════════════════════════════════════════════════════════
class FJSPEnv:
    """
    状态: 每道工序的特征向量 + 每台机器的负载特征
    动作: 选择 (作业j, 工序o, 机器m) 三元组
    奖励: 完工后给予负的最大完工时间 (makespan)
    """

    def reset(self):
        self.schedule   = {}          # (j,o) → (m, start, end)
        self.mach_time  = [0] * NM   # 机器最早可用时间
        self.job_time   = [0] * NJ   # 作业最早可用时间
        self.next_op    = [0] * NJ   # 每个作业下一道待调度工序
        self.done_count = 0
        return self._obs()

    # ── 可行动作 ──────────────────────────────────────────────
    def feasible(self):
        acts = []
        for j in range(NJ):
            o = self.next_op[j]
            if o >= NO:
                continue
            for m in range(NM):
                if PROC[j, o, m] > 0:
                    acts.append((j, o, m))
        return acts

    # ── 执行动作 ──────────────────────────────────────────────
    def step(self, action):
        j, o, m   = action
        pt        = float(PROC[j, o, m])
        start     = max(self.mach_time[m], self.job_time[j])
        end       = start + pt

        self.schedule[(j, o)] = (m, start, end)
        self.mach_time[m]     = end
        self.job_time[j]      = end
        self.next_op[j]      += 1
        self.done_count      += 1

        done     = (self.done_count == NT)
        makespan = max(self.mach_time) if done else 0.0
        reward   = -makespan           if done else 0.0
        return self._obs(), reward, done, makespan

    # ── 观测向量 ──────────────────────────────────────────────
    def _obs(self):
        MAX = 25.0
        op_f = []
        for j in range(NJ):
            for o in range(NO):
                is_done  = 1.0 if (j, o) in self.schedule else 0.0
                is_avail = 1.0 if (o == self.next_op[j] and o < NO) else 0.0
                est      = self.job_time[j] / MAX          # 最早开始时间(归一化)
                pts      = [PROC[j,o,m]/MAX if PROC[j,o,m]>0 else 0.0
                            for m in range(NM)]             # 各机器加工时间
                op_f.append([is_done, is_avail, est] + pts)

        mach_f = [[self.mach_time[m] / MAX] for m in range(NM)]

        return (torch.tensor(op_f,   dtype=torch.float32),   # (NT, 6)
                torch.tensor(mach_f, dtype=torch.float32))   # (NM, 1)


# ═══════════════════════════════════════════════════════════════
# §4  关系特定图卷积层 (Relation-Specific Graph Convolution)
# ═══════════════════════════════════════════════════════════════
class RelConv(nn.Module):
    """
    对单一关系子图执行消息传递:
      h_dst ← ReLU( LayerNorm( W_src·AggMsg + W_self·h_dst ) )
    """
    def __init__(self, d: int):
        super().__init__()
        self.W_src  = nn.Linear(d, d, bias=False)
        self.W_self = nn.Linear(d, d, bias=False)
        self.norm   = nn.LayerNorm(d)

    def forward(self, h_src, h_self, adj):
        # adj: (n_dst, n_src)
        deg = adj.sum(dim=-1, keepdim=True).clamp(min=1.0)
        agg = (adj @ self.W_src(h_src)) / deg          # 均值聚合
        out = F.relu(self.norm(agg + self.W_self(h_self)))
        return out


# ═══════════════════════════════════════════════════════════════
# §5  HGNN-R 模型
#     包含四个关键组件:
#     ① 关系特定子图分解
#     ② 数据预处理 (嵌入层)
#     ③ 图卷积特征提取
#     ④ 多头注意力跨关系融合
# ═══════════════════════════════════════════════════════════════
class HGNNR(nn.Module):
    def __init__(self, op_in=6, mach_in=1, d=64, n_heads=4):
        super().__init__()

        # ② 数据预处理 — 初始嵌入
        self.op_enc   = nn.Sequential(nn.Linear(op_in,   d), nn.ReLU())
        self.mach_enc = nn.Sequential(nn.Linear(mach_in, d), nn.ReLU())

        # ③ 关系特定图卷积 (三条边类型)
        self.conv_prec = RelConv(d)   # 前序约束:  op  → op
        self.conv_m2o  = RelConv(d)   # 资格约束:  mach → op
        self.conv_o2m  = RelConv(d)   # 资格约束:  op  → mach
        self.conv_m2m  = RelConv(d)   # 机器关联:  mach → mach

        # ④ 多头注意力跨关系特征融合
        self.op_cross_attn = nn.MultiheadAttention(d, n_heads, batch_first=True,
                                                   dropout=0.0)
        self.op_norm       = nn.LayerNorm(d)
        self.op_ffn        = nn.Sequential(nn.Linear(d, d*2), nn.ReLU(),
                                           nn.Linear(d*2, d))
        self.op_ffn_norm   = nn.LayerNorm(d)

        self.d = d

    def forward(self, op_f, mach_f):
        # ── 初始嵌入 ────────────────────────────────────────
        h_op   = self.op_enc(op_f)         # (NT, d)
        h_mach = self.mach_enc(mach_f)     # (NM, d)

        # ── 关系特定消息传递 ─────────────────────────────────
        # ① 前序约束子图: O_{j,o} 接收来自 O_{j,o-1} 的消息
        h_prec = self.conv_prec(h_op,   h_op,   A_PREC)       # (NT, d)

        # ② 资格子图: op 接收可加工它的机器的消息
        #    A_ELIG.T shape = (NT, NM)  [adj_dst=op, adj_src=mach]
        h_m2o  = self.conv_m2o (h_mach, h_op,   A_ELIG.T)     # (NT, d)

        # ③ 资格子图: mach 接收可在其上运行的工序的消息
        #    A_ELIG shape = (NM, NT)
        h_o2m  = self.conv_o2m (h_op,   h_mach, A_ELIG)       # (NM, d)

        # ④ 机器关联子图: 机器间信息交换
        h_m2m  = self.conv_m2m (h_mach, h_mach, A_CONJ)       # (NM, d)

        # ── 跨关系特征融合 (Multi-Head Attention) ──────────
        # 对每道工序, 将两个关系视图堆叠为序列 → attention融合
        # views: (NT, 2, d)
        views = torch.stack([h_prec, h_m2o], dim=1)
        fused, attn_w = self.op_cross_attn(views, views, views)  # (NT, 2, d)

        # 残差 + LayerNorm
        h_op_fused = self.op_norm(fused.mean(dim=1) + h_op)      # (NT, d)
        # Feed-Forward + 残差
        h_op_out   = self.op_ffn_norm(self.op_ffn(h_op_fused) + h_op_fused)

        # 机器节点: 两路融合 + 残差
        h_mach_out = h_mach + h_o2m + h_m2m                       # (NM, d)

        return h_op_out, h_mach_out, attn_w


# ═══════════════════════════════════════════════════════════════
# §6  Actor-Critic 网络
# ═══════════════════════════════════════════════════════════════
class ActorCritic(nn.Module):
    """
    Actor : 对每个可行动作 (op, machine) 打分 → softmax → 采样
    Critic: 全局嵌入 → 状态价值 V(s)
    """
    def __init__(self, d=64):
        super().__init__()
        self.hgnn = HGNNR(d=d)

        # Actor head: concat(op_emb, mach_emb) → score
        self.actor = nn.Sequential(
            nn.Linear(d * 2, d), nn.ReLU(),
            nn.Linear(d, d // 2), nn.ReLU(),
            nn.Linear(d // 2, 1)
        )
        # Critic head: mean_pool(op_emb) → V
        self.critic = nn.Sequential(
            nn.Linear(d, d), nn.ReLU(),
            nn.Linear(d, 1)
        )

    def forward(self, op_f, mach_f, actions):
        h_op, h_mach, _ = self.hgnn(op_f, mach_f)

        # Score each feasible (j, o, m) action
        logits = []
        for j, o, m in actions:
            feat = torch.cat([h_op[op_id(j, o)], h_mach[m]])   # (2d,)
            logits.append(self.actor(feat).squeeze(-1))
        logits = torch.stack(logits)   # (n_actions,)

        # State value
        value = self.critic(h_op.mean(dim=0))   # scalar

        return logits, value


# ═══════════════════════════════════════════════════════════════
# §7  暴力枚举最优解 (Brute-Force Reference)
# ═══════════════════════════════════════════════════════════════
def brute_force():
    """
    对规模极小的实例枚举所有可行调度, 返回最优 makespan
    简化: 固定工序排列顺序, 枚举机器分配
    """
    best_ms = float('inf')
    best_sched = None

    # 枚举每道工序的机器选择
    eligible = []
    ops_order = [(j, o) for j in range(NJ) for o in range(NO)]
    for j, o in ops_order:
        eligible.append([m for m in range(NM) if PROC[j, o, m] > 0])

    for machine_choices in iproduct(*eligible):
        env = FJSPEnv()
        env.reset()
        # 按照固定顺序调度 (贪心: 交替安排两个作业)
        sched_order = []
        ptr = [0, 0]
        for _ in range(NT):
            # 选择下一个可安排的作业
            for j in range(NJ):
                if ptr[j] < NO:
                    sched_order.append(j)
                    ptr[j] += 1
                    break

        env2 = FJSPEnv()
        env2.reset()
        mc_idx = 0
        for j, o in ops_order:
            m = machine_choices[mc_idx]
            mc_idx += 1
            env2.step((j, o, m))
        ms = max(env2.mach_time)
        if ms < best_ms:
            best_ms = ms
            best_sched = dict(env2.schedule)

    return best_ms, best_sched


# ═══════════════════════════════════════════════════════════════
# §8  PPO 训练
# ═══════════════════════════════════════════════════════════════
def train_ppo(n_episodes=600, lr=5e-4, gamma=0.99, eps_clip=0.2,
              entropy_coef=0.02, d=64):
    env   = FJSPEnv()
    model = ActorCritic(d=d)
    opt   = torch.optim.Adam(model.parameters(), lr=lr)
    sched = torch.optim.lr_scheduler.StepLR(opt, step_size=200, gamma=0.5)

    ms_history   = []
    loss_history = []
    best_ms      = float('inf')
    best_sched   = None

    print(f"\n{'─'*55}")
    print(f"  开始训练 | Episodes={n_episodes} | lr={lr} | d={d}")
    print(f"{'─'*55}")

    for ep in range(n_episodes):
        obs = env.reset()
        trajectory = []

        # ── Rollout: 收集一条完整轨迹 ───────────────────────
        while True:
            op_f, mach_f = obs
            acts = env.feasible()
            if not acts:
                break

            with torch.no_grad():
                logits, value = model(op_f, mach_f, acts)
            dist   = Categorical(logits=logits)
            idx    = dist.sample()
            lp     = dist.log_prob(idx)
            action = acts[idx.item()]

            obs, reward, done, makespan = env.step(action)

            trajectory.append({
                'op_f': op_f, 'mach_f': mach_f,
                'acts': acts, 'idx': idx,
                'log_prob': lp.detach(),
                'value':   value.detach().squeeze(),
                'reward':  reward,
            })
            if done:
                ms_history.append(makespan)
                if makespan < best_ms:
                    best_ms    = makespan
                    best_sched = dict(env.schedule)
                break

        # ── 计算折扣回报 G_t ─────────────────────────────────
        G = 0.0
        returns = []
        for t in reversed(trajectory):
            G = t['reward'] + gamma * G
            returns.insert(0, G)
        returns = torch.tensor(returns, dtype=torch.float32)

        # ── PPO 更新 ─────────────────────────────────────────
        p_losses, v_losses, e_losses = [], [], []
        for t, R in zip(trajectory, returns):
            logits_new, value_new = model(t['op_f'], t['mach_f'], t['acts'])
            dist_new = Categorical(logits=logits_new)
            lp_new   = dist_new.log_prob(t['idx'])

            ratio    = torch.exp(lp_new - t['log_prob'])
            adv      = (R - t['value']).detach()

            # Clipped surrogate objective
            surr     = torch.min(
                ratio * adv,
                torch.clamp(ratio, 1 - eps_clip, 1 + eps_clip) * adv
            )
            v_loss   = F.mse_loss(value_new.squeeze(), R)
            entropy  = dist_new.entropy()

            p_losses.append(-surr)
            v_losses.append(v_loss)
            e_losses.append(-entropy_coef * entropy)

        loss = (torch.stack(p_losses).mean()
              + 0.5 * torch.stack(v_losses).mean()
              + torch.stack(e_losses).mean())

        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        opt.step()
        sched.step()

        loss_history.append(loss.item())

        # ── 日志 ─────────────────────────────────────────────
        if (ep + 1) % 100 == 0:
            avg50 = np.mean(ms_history[-50:])
            print(f"  Ep {ep+1:4d}/{n_episodes} | "
                  f"Avg-50 Makespan: {avg50:5.1f} | "
                  f"Best: {best_ms:4.0f} | "
                  f"Loss: {loss.item():6.4f} | "
                  f"LR: {sched.get_last_lr()[0]:.1e}")

    return ms_history, loss_history, best_sched, best_ms


# ═══════════════════════════════════════════════════════════════
# §9  可视化 — 甘特图 + 训练曲线
# ═══════════════════════════════════════════════════════════════
JOB_COLORS = ['#1565C0', '#E65100']   # 深蓝, 深橙

def plot_gantt(schedule, makespan, title="最优调度甘特图", ax=None):
    standalone = ax is None
    if standalone:
        fig, ax = plt.subplots(figsize=(11, 3.5))

    mach_label = {m: f"Machine {m+1} (M{m+1})" for m in range(NM)}
    for (j, o), (m, s, e) in schedule.items():
        ax.barh(m, e - s, left=s, height=0.45,
                color=JOB_COLORS[j], alpha=0.88,
                edgecolor='white', linewidth=1.0)
        ax.text((s + e)/2, m, f"O{j+1},{o+1}",
                ha='center', va='center', fontsize=10,
                color='white', fontweight='bold')

    ax.set_yticks(range(NM))
    ax.set_yticklabels([mach_label[m] for m in range(NM)], fontsize=10)
    ax.set_xlabel("Time", fontsize=11)
    ax.set_title(f"{title}   (Makespan = {makespan:.0f})", fontsize=12, fontweight='bold')
    ax.axvline(makespan, color='crimson', linestyle='--', linewidth=1.8,
               label=f"Makespan = {makespan:.0f}")
    patches = [mpatches.Patch(color=JOB_COLORS[j], label=f"Job {j+1}") for j in range(NJ)]
    ax.legend(handles=patches + [plt.Line2D([],[], color='crimson',
              linestyle='--', label=f'Makespan={makespan:.0f}')],
              loc='lower right', fontsize=9)
    ax.set_xlim(0, makespan + 1)
    ax.grid(axis='x', alpha=0.25, linestyle='--')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    if standalone:
        plt.tight_layout()
        return fig


def plot_results(ms_history, loss_history, best_ms, ref_ms, best_sched):
    fig = plt.figure(figsize=(15, 9))
    fig.suptitle("FJSP — HGNN-R + PPO 训练结果", fontsize=14, fontweight='bold')

    gs = fig.add_gridspec(2, 3, height_ratios=[1, 1], hspace=0.35, wspace=0.3)

    # ── 训练曲线 ────────────────────────────────────────────
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.plot(ms_history, alpha=0.3, color='steelblue', linewidth=0.8)
    win = 30
    ma  = np.convolve(ms_history, np.ones(win)/win, mode='valid')
    ax1.plot(range(win-1, len(ms_history)), ma, color='#1565C0',
             linewidth=2.0, label=f'{win}-ep 移动平均')
    ax1.axhline(ref_ms,  color='green',  linestyle='--', linewidth=1.5,
                label=f'暴力最优 = {ref_ms:.0f}')
    ax1.axhline(best_ms, color='crimson', linestyle='--', linewidth=1.5,
                label=f'PPO最优 = {best_ms:.0f}')
    ax1.set_xlabel("Episode"); ax1.set_ylabel("Makespan")
    ax1.set_title("Makespan 训练曲线")
    ax1.legend(fontsize=8); ax1.grid(alpha=0.25)

    # ── 损失曲线 ────────────────────────────────────────────
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.plot(loss_history, alpha=0.4, color='darkorange', linewidth=0.8)
    ma_loss = np.convolve(loss_history, np.ones(win)/win, mode='valid')
    ax2.plot(range(win-1, len(loss_history)), ma_loss, color='#E65100',
             linewidth=2.0)
    ax2.set_xlabel("Episode"); ax2.set_ylabel("Loss")
    ax2.set_title("PPO 损失曲线")
    ax2.grid(alpha=0.25)

    # ── Makespan 分布 ────────────────────────────────────────
    ax3 = fig.add_subplot(gs[0, 2])
    last_half = ms_history[len(ms_history)//2:]
    unique, counts = np.unique(last_half, return_counts=True)
    bars = ax3.bar(unique, counts, color='#1565C0', alpha=0.75, edgecolor='white')
    ax3.axvline(ref_ms, color='green',  linestyle='--', linewidth=1.5,
                label=f'最优 = {ref_ms:.0f}')
    ax3.set_xlabel("Makespan"); ax3.set_ylabel("次数 (后半段)")
    ax3.set_title("Makespan 分布 (训练后半段)")
    ax3.legend(fontsize=9); ax3.grid(axis='y', alpha=0.25)

    # ── 甘特图 ───────────────────────────────────────────────
    ax4 = fig.add_subplot(gs[1, :])
    plot_gantt(best_sched, best_ms, title="PPO 最优调度甘特图", ax=ax4)

    plt.tight_layout()
    out = '/Users/shikong/PycharmProjects/RLProject01/fjsp_hgnn_ppo_results.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    print(f"\n  图表已保存 → {out}")
    return out


# ═══════════════════════════════════════════════════════════════
# §10  主程序
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("╔══════════════════════════════════════════════════════════╗")
    print("║   FJSP Demo: HGNN-R + PPO  (2 Jobs × 3 Ops, 3 Machines) ║")
    print("╚══════════════════════════════════════════════════════════╝")

    # ── 打印问题实例 ─────────────────────────────────────────
    print("\n📋 加工时间矩阵 (Processing Times)")
    print("     " + "".join(f"  M{m+1}  " for m in range(NM)))
    for j in range(NJ):
        for o in range(NO):
            row = []
            for m in range(NM):
                v = int(PROC[j, o, m])
                row.append(f"  {v:2d}  " if v > 0 else "  —   ")
            print(f"  O{j+1},{o+1} " + "".join(row))
        if j < NJ - 1:
            print()

    # ── 异构图信息 ───────────────────────────────────────────
    print(f"\n🔗 异构图结构:")
    print(f"   工序节点 (Operation):  {NT}  个")
    print(f"   机器节点 (Machine):    {NM}  个")
    print(f"   前序边   (Precedence): {int(A_PREC.sum())}  条")
    print(f"   资格边   (Eligibility): {int(A_ELIG.sum())}  条")
    elig_detail = []
    for j in range(NJ):
        for o in range(NO):
            ms = [f"M{m+1}" for m in range(NM) if PROC[j,o,m]>0]
            elig_detail.append(f"O{j+1},{o+1}→[{','.join(ms)}]")
    print("   " + "  ".join(elig_detail))

    # ── 暴力枚举参考解 ───────────────────────────────────────
    print("\n🔍 暴力枚举参考最优解 ...")
    ref_ms, ref_sched = brute_force()
    print(f"   参考 Makespan = {ref_ms}")
    for (j, o), (m, s, e) in sorted(ref_sched.items()):
        print(f"   O{j+1},{o+1}: M{m+1}  [{s:.0f} → {e:.0f}]")

    # ── PPO 训练 ─────────────────────────────────────────────
    ms_hist, loss_hist, best_sched, best_ms = train_ppo(
        n_episodes=600, lr=5e-4, gamma=0.99,
        eps_clip=0.2, entropy_coef=0.02, d=64
    )

    # ── 结果汇报 ─────────────────────────────────────────────
    print(f"\n{'═'*55}")
    print(f"  ✅ 训练完毕")
    print(f"  PPO 最优 Makespan : {best_ms:.0f}")
    print(f"  暴力枚举最优      : {ref_ms:.0f}")
    gap = (best_ms - ref_ms) / ref_ms * 100
    print(f"  优化间隙 (Gap)    : {gap:.1f}%")
    print(f"{'─'*55}")
    print(f"  📅 PPO 最优调度方案:")
    for (j, o), (m, s, e) in sorted(best_sched.items()):
        print(f"     O{j+1},{o+1}: Machine {m+1}, [{s:.0f} → {e:.0f}], 时长={e-s:.0f}")
    print(f"{'═'*55}")

    # ── 可视化 ───────────────────────────────────────────────
    out_path = plot_results(ms_hist, loss_hist, best_ms, ref_ms, best_sched)
    print("\n🎉 完成! 结果图已保存.")
